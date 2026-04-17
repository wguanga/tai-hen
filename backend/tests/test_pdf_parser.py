"""Tests for services/pdf_parser.py."""
from services.pdf_parser import (
    extract_metadata,
    get_all_text,
    get_context_around,
    get_outline,
    get_page_text,
    search_text,
)


class TestExtractMetadata:
    def test_basic_metadata_from_pdf(self, sample_pdf_path):
        meta = extract_metadata(sample_pdf_path)
        assert meta["title"] == "Test Paper: A Study of Testing"
        assert meta["authors"] == ["Alice", "Bob Chen"]
        assert meta["total_pages"] == 3
        assert meta["year"] == 2023

    def test_empty_authors_when_missing(self, tmp_path):
        import fitz
        doc = fitz.open()
        doc.set_metadata({"title": "No Authors"})
        doc.new_page()
        path = tmp_path / "t.pdf"
        path.write_bytes(doc.tobytes())
        doc.close()
        meta = extract_metadata(str(path))
        assert meta["authors"] == []
        assert meta["total_pages"] == 1

    def test_title_fallback_to_largest_text(self, tmp_path):
        import fitz
        doc = fitz.open()
        page = doc.new_page()
        page.insert_text((72, 72), "Small body text", fontsize=10)
        page.insert_text((72, 200), "BIG TITLE HERE", fontsize=30)
        path = tmp_path / "t.pdf"
        path.write_bytes(doc.tobytes())
        doc.close()
        meta = extract_metadata(str(path))
        assert "BIG TITLE" in meta["title"]

    def test_title_fallback_to_filename_when_all_empty(self, tmp_path):
        import fitz
        doc = fitz.open()
        doc.new_page()  # empty page, no metadata
        path = tmp_path / "my-paper.pdf"
        path.write_bytes(doc.tobytes())
        doc.close()
        meta = extract_metadata(str(path))
        assert meta["title"] == "my-paper"


class TestPageText:
    def test_get_page_text_returns_content(self, sample_pdf_path):
        text = get_page_text(sample_pdf_path, 1)
        assert "Introduction" in text
        assert "testing" in text

    def test_get_page_text_out_of_range(self, sample_pdf_path):
        assert get_page_text(sample_pdf_path, 0) == ""
        assert get_page_text(sample_pdf_path, 99) == ""


class TestContextAround:
    def test_finds_target_text(self, sample_pdf_path):
        ctx = get_context_around(sample_pdf_path, 2, "attention mechanism", window=50)
        assert "attention mechanism" in ctx

    def test_fallback_when_target_not_found(self, sample_pdf_path):
        ctx = get_context_around(sample_pdf_path, 1, "nonexistent phrase xyz", window=10)
        # Falls back to page start
        assert len(ctx) > 0
        assert "Introduction" in ctx or "testing" in ctx


class TestGetAllText:
    def test_concatenates_pages(self, sample_pdf_path):
        text = get_all_text(sample_pdf_path)
        assert "Introduction" in text
        assert "Method" in text
        assert "Results" in text

    def test_truncates_at_max_chars(self, sample_pdf_path):
        text = get_all_text(sample_pdf_path, max_chars=20)
        assert len(text) <= 40  # 20 chars + possible [truncated] marker
        assert "[truncated]" in text


class TestGetOutline:
    def test_extracts_toc(self, sample_pdf_path):
        items = get_outline(sample_pdf_path)
        titles = [i["title"] for i in items]
        assert "Introduction" in titles
        assert "Method" in titles
        assert "Results" in titles

    def test_outline_has_correct_pages(self, sample_pdf_path):
        items = get_outline(sample_pdf_path)
        by_title = {i["title"]: i["page"] for i in items}
        assert by_title["Introduction"] == 1
        assert by_title["Method"] == 2
        assert by_title["Results"] == 3

    def test_empty_outline_when_pdf_has_no_toc(self, tmp_path):
        import fitz
        doc = fitz.open()
        doc.new_page()
        path = tmp_path / "no-toc.pdf"
        path.write_bytes(doc.tobytes())
        doc.close()
        assert get_outline(str(path)) == []


class TestSearchText:
    def test_finds_query_across_pages(self, sample_pdf_path):
        results = search_text(sample_pdf_path, "attention")
        assert len(results) >= 1
        assert results[0]["page"] == 2
        assert "attention" in results[0]["snippet"].lower()

    def test_case_insensitive(self, sample_pdf_path):
        lower = search_text(sample_pdf_path, "method")
        upper = search_text(sample_pdf_path, "METHOD")
        assert len(lower) == len(upper)
        assert lower[0]["page"] == upper[0]["page"]

    def test_empty_results_for_missing_term(self, sample_pdf_path):
        results = search_text(sample_pdf_path, "definitelynotinpdf")
        assert results == []

    def test_respects_max_results(self, tmp_path):
        import fitz
        doc = fitz.open()
        page = doc.new_page()
        page.insert_text((72, 72), "cat cat cat cat cat cat cat cat cat cat", fontsize=12)
        path = tmp_path / "many.pdf"
        path.write_bytes(doc.tobytes())
        doc.close()
        results = search_text(str(path), "cat", max_results=3)
        assert len(results) == 3
