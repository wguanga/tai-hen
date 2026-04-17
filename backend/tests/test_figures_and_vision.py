"""Tests for figure extraction, vision capability detection, explain_figure endpoint."""
import fitz
import pytest
from services.llm_service import model_supports_vision


class TestVisionDetection:
    @pytest.mark.parametrize("provider,model,expected", [
        ("openai", "gpt-4o-mini", True),
        ("openai", "gpt-4o", True),
        ("openai", "gpt-4-turbo", True),
        ("openai", "gpt-3.5-turbo", False),
        ("openai", "", False),
        ("anthropic", "claude-3-opus", True),
        ("anthropic", "claude-3-5-sonnet-20241022", True),
        ("anthropic", "claude-sonnet-4-6", True),
        ("anthropic", "claude-2.1", False),
        ("ollama", "llava", True),
        ("ollama", "llama3.2-vision:11b", True),
        ("ollama", "qwen2.5:14b", False),
        ("unknown-provider", "anything", False),
    ])
    def test_known_vision_models(self, provider, model, expected):
        assert model_supports_vision(provider, model) is expected


class TestFigureExtraction:
    def _make_pdf_with_figure(self, tmp_path) -> str:
        doc = fitz.open()
        # Page 1: drawing + caption — no embedded image needed to test caption detection
        page = doc.new_page()
        # Draw a rectangle as a "figure" (PyMuPDF will render it as vector, no xref)
        page.draw_rect(fitz.Rect(72, 72, 172, 172), color=(1, 0, 0), fill=(1, 0, 0))
        page.insert_text((72, 200), "Figure 1. Red square used for demonstration.", fontsize=10)
        # Page 2: table caption only
        p2 = doc.new_page()
        p2.insert_text((72, 72), "Table 2. Comparison of methods on benchmark X.", fontsize=10)
        path = tmp_path / "figs.pdf"
        path.write_bytes(doc.tobytes())
        doc.close()
        return str(path)

    def test_extracts_figure_and_table(self, tmp_path):
        from services.pdf_parser import extract_figures
        path = self._make_pdf_with_figure(tmp_path)
        figs = extract_figures(path)
        assert len(figs) >= 2
        kinds = {(f["kind"], f["number"]) for f in figs}
        assert ("figure", 1) in kinds
        assert ("table", 2) in kinds

    def test_empty_pdf_returns_empty(self, sample_pdf_path):
        from services.pdf_parser import extract_figures
        # sample_pdf_path does not include "Figure N." captions
        assert extract_figures(sample_pdf_path) == []


class TestFiguresEndpoint:
    def test_returns_items(self, client, uploaded_paper):
        r = client.get(f"/papers/{uploaded_paper['id']}/figures")
        assert r.status_code == 200
        assert r.json() == {"items": []}  # sample PDF has no figures

    def test_missing_paper_404(self, client):
        r = client.get("/papers/missing/figures")
        assert r.status_code == 404


class TestConfigReportsVision:
    def test_default_config_no_vision(self, client):
        r = client.get("/config")
        # Default model is gpt-4o-mini → vision True
        assert r.json()["supports_vision"] is True

    def test_non_vision_model_reports_false(self, client):
        client.post("/config", json={
            "provider": "openai", "model": "gpt-3.5-turbo", "api_key": "sk-x",
            "base_url": "", "ollama_model": "qwen2.5:14b",
        })
        r = client.get("/config")
        assert r.json()["supports_vision"] is False


class TestExplainFigureVisionGate:
    def test_returns_error_when_not_vision_model(self, client, uploaded_paper):
        # Configure a non-vision model
        client.post("/config", json={
            "provider": "openai", "model": "gpt-3.5-turbo", "api_key": "sk-x",
            "base_url": "", "ollama_model": "qwen2.5:14b",
        })
        r = client.post("/ai/explain_figure", json={
            "paper_id": uploaded_paper["id"],
            "number": 1, "page": 1, "kind": "figure",
            "caption": "Figure 1. X", "image_xref": 1,
        })
        assert r.status_code == 400
        assert r.json()["error"]["code"] == "LLM_VISION_NOT_SUPPORTED"
