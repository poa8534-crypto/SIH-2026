"""The server must bring its own database up to schema on startup.

`create_all` cannot add a column to a table that already exists. The startup
hook called it directly, so the additive migration in `db._ADDED_COLUMNS` only
ever ran when somebody happened to execute `scripts/seed.py` or
`scripts/reset_demo.py` — the API itself never applied it. An existing
`dataset/epc_progress.db` therefore stayed one column short, and every query
naming that column failed at read time.

That went unnoticed until two columns were added at once (D-065) and
`GET /raid/candidates` answered 500 with
`no such column: audit_records.llm_assisted_fields` on a database that had not
been re-seeded.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine, inspect, text

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from server import db as db_module
from server import main as main_module
from server.db import _ADDED_COLUMNS, add_missing_columns


class TestStartupAppliesTheMigration:
    def test_startup_calls_init_db_not_bare_create_all(self, monkeypatch):
        """The regression, pinned: startup must run the migration."""
        called = {"init_db": 0}

        def spy():
            called["init_db"] += 1

        monkeypatch.setattr(main_module, "init_db", spy)
        # Seeding is not what this test is about, and it touches the real
        # baseline file.
        monkeypatch.setattr(
            main_module, "_seed_schedule_if_empty", lambda db: None
        )

        main_module.startup()

        assert called["init_db"] == 1, (
            "startup() did not run the schema migration; a database created "
            "before the newest column will fail on every query naming it"
        )

    def test_init_db_runs_create_all_and_the_migration(self, monkeypatch):
        order = []
        monkeypatch.setattr(
            db_module.Base.metadata, "create_all",
            lambda **kw: order.append("create_all"),
        )
        monkeypatch.setattr(
            db_module, "add_missing_columns",
            lambda target=None: order.append("migrate"),
        )
        db_module.init_db()
        assert order == ["create_all", "migrate"]


class TestAddMissingColumns:
    def test_a_column_is_added_to_an_existing_table(self, tmp_path):
        """The real behaviour, against a real file with an old schema."""
        path = tmp_path / "old.db"
        engine = create_engine(f"sqlite:///{path}")
        table, column, _sqltype = _ADDED_COLUMNS[0]

        with engine.begin() as conn:
            # A table that predates the column: id only.
            conn.execute(text(f"CREATE TABLE {table} (id VARCHAR PRIMARY KEY)"))

        before = {c["name"] for c in inspect(engine).get_columns(table)}
        assert column not in before

        add_missing_columns(engine)

        after = {c["name"] for c in inspect(engine).get_columns(table)}
        assert column in after

    def test_it_is_idempotent(self, tmp_path):
        path = tmp_path / "twice.db"
        engine = create_engine(f"sqlite:///{path}")
        table, column, _ = _ADDED_COLUMNS[0]
        with engine.begin() as conn:
            conn.execute(text(f"CREATE TABLE {table} (id VARCHAR PRIMARY KEY)"))

        add_missing_columns(engine)
        add_missing_columns(engine)  # must not raise "duplicate column name"

        cols = [c["name"] for c in inspect(engine).get_columns(table)]
        assert cols.count(column) == 1

    def test_a_table_that_does_not_exist_is_skipped(self, tmp_path):
        """An empty file must not raise; create_all makes the tables."""
        engine = create_engine(f"sqlite:///{tmp_path / 'empty.db'}")
        add_missing_columns(engine)  # no tables at all

    @pytest.mark.parametrize("table,column,sqltype", _ADDED_COLUMNS)
    def test_every_declared_column_exists_on_its_model(
        self, table, column, sqltype
    ):
        """A migration entry that no model declares would never be created on
        a fresh database, so the two must not drift apart."""
        model = next(
            (m.class_ for m in db_module.Base.registry.mappers
             if m.class_.__tablename__ == table),
            None,
        )
        assert model is not None, f"no model for table {table}"
        assert column in model.__table__.columns, (
            f"{table}.{column} is in _ADDED_COLUMNS but not on the model: a "
            f"fresh database would never get it"
        )
