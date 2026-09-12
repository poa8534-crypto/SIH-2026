"""Tests for PDF and CSV daily progress report extraction pipeline."""

from __future__ import annotations

import csv
import io
import tempfile
from datetime import date
from pathlib import Path
from unittest.mock import MagicMock, patch

import pymupdf
import pytest

from extraction.csv_parser import CSVParser
from extraction.extractor import Extractor
from extraction.models import Discipline, EventStatus, ExtractionResult
from extraction.ocr import OCRUnavailableError, is_ocr_available, ocr_image_bytes
from extraction.pdf_parser import PDFParser


class TestCSVParser:
    """Test progress register extraction from CSV files."""

    def test_parse_standard_csv(self, tmp_path: Path):
        csv_path = tmp_path / "progress_civil.csv"
        rows = [
            ["Activity ID", "Description", "Discipline", "Start Date", "End Date", "Planned Qty", "Achieved Qty", "UoM", "Status"],
            ["CIV-FTG-001", "Foundation Excavation", "Civil", "2026-03-01", "2026-03-15", "500", "500", "m3", "Completed"],
            ["CIV-FTG-002", "PCC Blinding Works", "Civil", "2026-03-16", "", "200", "100", "m3", "In Progress"],
            ["TOTAL", "Discipline Total", "", "", "", "700", "600", "", ""],
        ]
        with open(csv_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerows(rows)

        parser = CSVParser()
        events = parser.parse(str(csv_path))

        assert len(events) == 2  # Total row is filtered out
        ev1 = events[0]
        assert ev1.activity_id == "CIV-FTG-001"
        assert ev1.discipline == Discipline.CIVIL
        assert ev1.status == EventStatus.COMPLETED
        assert ev1.asserted_start == date(2026, 3, 1)
        assert ev1.asserted_finish == date(2026, 3, 15)
        assert ev1.quantity == 500.0
        assert ev1.percentage == 100.0

        ev2 = events[1]
        assert ev2.activity_id == "CIV-FTG-002"
        assert ev2.status == EventStatus.IN_PROGRESS
        assert ev2.percentage == 50.0

    def test_semicolon_delimited_csv(self, tmp_path: Path):
        csv_path = tmp_path / "piping.csv"
        content = (
            "Task ID;Work Item;Achieved Qty;UoM;Commenced;Actual Completion\n"
            "PIP-UG-010;Underground Spool Laying;250;m;10/03/2026;28/03/2026\n"
        )
        csv_path.write_text(content, encoding="utf-8")

        parser = CSVParser()
        events = parser.parse(str(csv_path))
        assert len(events) == 1
        assert events[0].activity_id == "PIP-UG-010"
        assert events[0].discipline == Discipline.PIPING
        assert events[0].quantity == 250.0


class TestPDFParser:
    """Test text and table extraction from digital and scanned PDFs."""

    def test_digital_pdf_text_extraction(self, tmp_path: Path):
        pdf_path = tmp_path / "dpr_day_05.pdf"
        doc = pymupdf.open()
        page = doc.new_page()

        text = (
            "DAILY PROGRESS REPORT\n"
            "PROJECT: Duliajan OCS Phase 2\n"
            "DATE: 2026-04-05\n\n"
            "• CIV-FTG-001 Foundation excavation completed 500 m3.\n"
            "• ELE-CBL-1076 Cable pulling ongoing in Zone A, 400m installed today.\n"
            "• P-1002 pump alignment delayed due to vendor technician absence.\n"
        )
        page.insert_text((50, 50), text)
        doc.save(str(pdf_path))
        doc.close()

        parser = PDFParser(reference_date=date(2026, 4, 5))
        spans, tables, warnings = parser.parse(str(pdf_path))

        assert len(spans) >= 3
        # Should have captured the bullet points
        combined = " ".join(s[0] for s in spans)
        assert "CIV-FTG-001" in combined
        assert "ELE-CBL-1076" in combined

    def test_scanned_pdf_detection_warning(self, tmp_path: Path):
        pdf_path = tmp_path / "scanned_diary.pdf"
        doc = pymupdf.open()
        page = doc.new_page()
        # Insert minimal blank vector shape, no text
        page.draw_rect(pymupdf.Rect(10, 10, 100, 100))
        doc.save(str(pdf_path))
        doc.close()

        with patch("extraction.pdf_parser.is_ocr_available", return_value=False):
            parser = PDFParser()
            spans, tables, warnings = parser.parse(str(pdf_path))

            assert len(warnings) > 0
            assert "scanned document" in warnings[0].lower()


class TestExtractorEndToEnd:
    """Test Extractor dispatcher with PDF, CSV, and image inputs."""

    def test_extractor_dispatches_csv(self, tmp_path: Path):
        csv_path = tmp_path / "site_dpr.csv"
        csv_path.write_text(
            "activity_id,description,achieved_qty,uom,end_date\n"
            "ELE-CBL-1076,Cable Pulling Zone A,800,m,2026-04-08\n",
            encoding="utf-8",
        )

        extractor = Extractor()
        result = extractor.extract(str(csv_path))
        assert len(result.events) == 1
        assert result.events[0].activity_id == "ELE-CBL-1076"
        assert result.events[0].quantity == 800.0

    def test_extractor_dispatches_pdf(self, tmp_path: Path):
        pdf_path = tmp_path / "dpr.pdf"
        doc = pymupdf.open()
        page = doc.new_page()
        page.insert_text(
            (50, 50),
            "DAILY PROGRESS REPORT - DATE: 2026-04-10\n"
            "CIV-FTG-001: Foundation excavation completed 100% on 10/04/2026\n"
        )
        doc.save(str(pdf_path))
        doc.close()

        extractor = Extractor(reference_date=date(2026, 4, 10))
        result = extractor.extract(str(pdf_path))
        assert len(result.events) >= 1
        assert "CIV-FTG-001" in result.events[0].raw_text

    def test_extractor_unsupported_type(self, tmp_path: Path):
        docx_path = tmp_path / "report.docx"
        docx_path.write_text("dummy", encoding="utf-8")

        extractor = Extractor()
        result = extractor.extract(str(docx_path))
        assert len(result.errors) == 1
        assert "Unsupported file type: .docx" in result.errors[0]

    def test_extractor_dispatches_image_with_ocr(self, tmp_path: Path):
        img_path = tmp_path / "site_diary_photo.png"
        img_path.write_bytes(b"\x89PNG\r\n\x1a\nfakeimagecontent")

        mock_transcription = (
            "DAILY PROGRESS REPORT - DATE: 2026-04-12\n"
            "PIP-UG-010: Underground spool fabrication 300m completed.\n"
        )
        with patch("extraction.extractor.ocr_image_bytes", return_value=mock_transcription):
            extractor = Extractor(reference_date=date(2026, 4, 12))
            result = extractor.extract(str(img_path))
            assert len(result.events) >= 1
            assert "PIP-UG-010" in result.events[0].raw_text

    def test_image_without_ocr_fails_gracefully(self, tmp_path: Path):
        img_path = tmp_path / "site_diary.jpg"
        img_path.write_bytes(b"\xff\xd8\xff\xe0fakejpeg")

        with patch("extraction.extractor.ocr_image_bytes", side_effect=OCRUnavailableError("No OCR configured")):
            extractor = Extractor()
            result = extractor.extract(str(img_path))
            assert len(result.errors) == 1
            assert "No OCR configured" in result.errors[0]
