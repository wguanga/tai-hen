"""Tests for services/pdf_parser.py."""
from services.pdf_parser import (
    extract_metadata,
    extract_references,
    find_text_position,
    get_all_text,
    get_all_text_with_pages,
    get_context_around,
    get_outline,
    get_page_text,
    get_section_text,
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


class TestGetAllTextWithPages:
    def test_includes_page_markers(self, sample_pdf_path):
        text = get_all_text_with_pages(sample_pdf_path)
        assert "[page 1]" in text
        assert "[page 2]" in text
        assert "[page 3]" in text

    def test_order_preserved(self, sample_pdf_path):
        text = get_all_text_with_pages(sample_pdf_path)
        i1 = text.index("[page 1]")
        i2 = text.index("[page 2]")
        i3 = text.index("[page 3]")
        assert i1 < i2 < i3
        # Content before Method marker should include Introduction
        assert text.index("Introduction") < text.index("Method")


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


class TestSectionText:
    def test_single_page(self, sample_pdf_path):
        text = get_section_text(sample_pdf_path, 2, 3)  # just page 2
        assert "Method" in text
        assert "Results" not in text

    def test_page_range(self, sample_pdf_path):
        text = get_section_text(sample_pdf_path, 1, 3)  # pages 1-2
        assert "Introduction" in text
        assert "Method" in text
        assert "Results" not in text

    def test_to_end(self, sample_pdf_path):
        text = get_section_text(sample_pdf_path, 2, None)
        assert "Method" in text
        assert "Results" in text

    def test_out_of_range_returns_empty(self, sample_pdf_path):
        text = get_section_text(sample_pdf_path, 99)
        assert text == ""

    def test_truncates_at_max_chars(self, sample_pdf_path):
        text = get_section_text(sample_pdf_path, 1, None, max_chars=15)
        assert "[truncated]" in text


class TestExtractReferences:
    def _make_pdf_with_refs(self, tmp_path, header: str = "References"):
        import fitz
        doc = fitz.open()
        p1 = doc.new_page()
        p1.insert_text((72, 72), "Body text cites [1] and [2].")
        p2 = doc.new_page()
        p2.insert_text(
            (72, 72),
            f"{header}\n"
            "[1] Smith J. Attention Is All You Need. NeurIPS 2017.\n"
            "[2] Doe A, Roe B. BERT: Bidirectional Encoders. NAACL 2019.\n"
            "[3] Someone E. GPT-3. 2020.",
            fontsize=10,
        )
        path = tmp_path / "with-refs.pdf"
        path.write_bytes(doc.tobytes())
        doc.close()
        return str(path)

    def test_extracts_bracketed_references(self, tmp_path):
        path = self._make_pdf_with_refs(tmp_path)
        refs = extract_references(path)
        assert len(refs) == 3
        assert refs[0]["index"] == 1
        assert "Smith J" in refs[0]["text"]
        assert refs[1]["index"] == 2
        assert "BERT" in refs[1]["text"]

    def test_no_references_section_returns_empty(self, sample_pdf_path):
        assert extract_references(sample_pdf_path) == []

    def test_handles_bibliography_header(self, tmp_path):
        path = self._make_pdf_with_refs(tmp_path, header="Bibliography")
        refs = extract_references(path)
        assert len(refs) >= 1


class TestFindTextPosition:
    def test_finds_known_text(self, sample_pdf_path):
        pos = find_text_position(sample_pdf_path, 2, "attention mechanism")
        assert pos is not None
        assert pos["width"] > 0
        assert pos["height"] > 0
        assert len(pos["rects"]) >= 1

    def test_returns_none_for_missing_text(self, sample_pdf_path):
        pos = find_text_position(sample_pdf_path, 1, "absolutely not in this paper xyz qwe")
        assert pos is None

    def test_out_of_range_page_returns_none(self, sample_pdf_path):
        assert find_text_position(sample_pdf_path, 99, "anything") is None


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
