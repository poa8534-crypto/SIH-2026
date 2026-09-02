"""Evidence corpus API — D-050.

Two things are asserted hardest: the counts match the manifests (so this
endpoint cannot drift from the build that produced them), and the endpoint does
not open a raw artifact.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from server import evidence as ev
from server.main import app

client = TestClient(app)

CORPUS_PRESENT = ev.SUMMARY_PATH.exists() and ev.VALIDATION_PATH.exists()
needs_corpus = pytest.mark.skipif(
    not CORPUS_PRESENT,
    reason="datasets/real manifests not present in this checkout",
)


@pytest.fixture(autouse=True)
def _clear_cache():
    ev._load.cache_clear()
    yield
    ev._load.cache_clear()


@needs_corpus
class TestCountsMatchTheManifests:
    """The endpoint reports; it must never re-derive and disagree."""

    @pytest.fixture
    def manifests(self):
        return (
            json.loads(ev.SUMMARY_PATH.read_text(encoding="utf-8")),
            json.loads(ev.VALIDATION_PATH.read_text(encoding="utf-8")),
        )

    def test_artifact_count_and_bytes(self, manifests):
        summary, _ = manifests
        body = client.get("/evidence/corpus").json()
        assert body["artifacts"]["count"] == summary["raw_artifacts"]
        assert body["artifacts"]["bytes"] == summary["raw_bytes"]

    def test_per_source_and_per_extension_breakdowns_are_passed_through(self, manifests):
        summary, _ = manifests
        body = client.get("/evidence/corpus").json()
        assert body["artifacts"]["by_source"] == summary["raw_source_counts"]
        assert body["artifacts"]["by_extension"] == summary["raw_extension_counts"]

    def test_record_counts_match_validation(self, manifests):
        _, validation = manifests
        body = client.get("/evidence/corpus").json()
        for key, value in body["records"].items():
            assert value == validation["counts"][key], key

    def test_validation_block_matches(self, manifests):
        _, validation = manifests
        body = client.get("/evidence/corpus").json()["validation"]
        assert body["passed"] is validation["passed"]
        assert body["checks_run"] == len(validation["checks"])
        assert body["errors"] == validation["error_count"]
        assert body["warnings"] == validation["warning_count"]

    def test_ocr_counts_match_and_are_marked_unverified(self, manifests):
        _, validation = manifests
        ocr = client.get("/evidence/corpus").json()["ocr"]
        assert ocr["pages"] == validation["counts"]["wsdot_ocr_pages"]
        assert ocr["lines"] == validation["counts"]["wsdot_ocr_lines"]
        assert ocr["verified"] is False


@needs_corpus
class TestHonestyFieldsArePresentAndStructured:
    """The frontend must not have to hardcode any of these."""

    @pytest.fixture
    def caveats(self):
        return {c["id"]: c for c in client.get("/evidence/corpus").json()["caveats"]}

    def test_all_four_caveats_ship(self, caveats):
        assert set(caveats) == {
            "distinct_schedule_activities",
            "wsdot_ocr_and_hard_negatives_unverified",
            "constructcie_labels_are_source_published",
            "real_and_synthetic_are_separate",
        }

    def test_twenty_seven_activities_not_two_hundred(self, caveats):
        c = caveats["distinct_schedule_activities"]
        assert c["value"] == 27
        assert "27" in c["headline"]
        assert c["padded_with_synthetic_or_taxonomy"] is False
        assert c["detail"]

    def test_the_reference_rows_are_not_relabelled_as_activities(self, caveats):
        """1,661 CPWD reference work items must not be counted as schedule
        activities to make 27 look like 200."""
        body = client.get("/evidence/corpus").json()
        assert body["records"]["cpwd_em_item_rows"] == 1661
        assert caveats["distinct_schedule_activities"]["value"] == 27

    def test_ocr_and_hard_negatives_are_marked_unverified(self, caveats):
        c = caveats["wsdot_ocr_and_hard_negatives_unverified"]
        assert c["manually_verified"] is False
        assert c["value"] == 100

    def test_constructcie_labels_are_not_claimed_as_ours(self, caveats):
        c = caveats["constructcie_labels_are_source_published"]
        assert c["authored_by_this_project"] is False
        assert c["value"] == 3520

    def test_real_and_synthetic_are_reported_as_unmixed(self, caveats):
        c = caveats["real_and_synthetic_are_separate"]
        assert c["mixed"] is False
        assert "datasets/real" in c["detail"]
        assert "dataset" in c["detail"]

    def test_every_caveat_carries_a_detail_sentence(self, caveats):
        for cid, c in caveats.items():
            assert c["headline"], cid
            assert c["detail"], cid


@needs_corpus
class TestItDoesNotReadTheRawCorpus:
    def test_no_raw_artifact_is_opened(self, monkeypatch):
        """630 MB must not be touched to answer one request.

        Every `open` during the call is recorded; none may sit under
        datasets/real/raw or datasets/real/_staging.
        """
        import builtins

        opened: list[str] = []
        real_open = builtins.open

        def tracking_open(file, *a, **kw):
            opened.append(str(file))
            return real_open(file, *a, **kw)

        monkeypatch.setattr(builtins, "open", tracking_open)
        ev._load.cache_clear()
        assert client.get("/evidence/corpus").status_code == 200

        forbidden = [
            p for p in opened
            if "datasets/real/raw" in p.replace("\\\\", "/")
            or "datasets/real/_staging" in p.replace("\\\\", "/")
        ]
        assert not forbidden, forbidden[:5]

    def test_the_response_states_where_it_came_from(self):
        body = client.get("/evidence/corpus").json()
        assert "manifests" in body["source"]
        assert "No raw artifact is opened" in body["source"]

    def test_manifests_are_read_once_and_cached(self):
        ev._load.cache_clear()
        client.get("/evidence/corpus")
        first = ev._load.cache_info().misses
        client.get("/evidence/corpus")
        client.get("/evidence/corpus")
        assert ev._load.cache_info().misses == first   # no further reads


class TestMissingCorpusIsA404NotA500:
    def test_absent_manifests_report_which_file_is_missing(self, monkeypatch):
        """The corpus is a large optional download. Its absence is a fact about
        the checkout, not a server fault."""
        monkeypatch.setattr(ev, "SUMMARY_PATH", Path("/nonexistent/dataset_summary.json"))
        ev._load.cache_clear()
        r = client.get("/evidence/corpus")
        assert r.status_code == 404
        assert "dataset_summary.json" in r.json()["detail"]


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
