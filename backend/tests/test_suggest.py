"""Tests for /ai/suggest_highlights endpoint."""
import json


class TestSuggestHighlights:
    def test_returns_parsed_valid_suggestions(self, client, uploaded_paper, mock_llm_response):
        fake = json.dumps([
            {"page": 2, "color": "blue", "text": "attention mechanism", "reason": "core method"},
            {"page": 1, "color": "yellow", "text": "testing", "reason": "key term"},
        ])
        mock_llm_response(fake)

        r = client.post("/ai/suggest_highlights", json={"paper_id": uploaded_paper["id"]})
        assert r.status_code == 200
        data = r.json()
        assert data["total"] == 2
        items = data["items"]
        assert items[0]["page"] == 2
        assert items[0]["color"] == "blue"
        assert items[0]["text"] == "attention mechanism"
        # Should be locatable since the sample PDF contains these strings
        assert items[0]["locatable"] is True
        assert items[0]["position"] is not None
        assert items[0]["position"]["width"] > 0

    def test_strips_code_fences(self, client, uploaded_paper, mock_llm_response):
        fake = '```json\n[{"page":1,"color":"green","text":"testing","reason":"x"}]\n```'
        mock_llm_response(fake)
        r = client.post("/ai/suggest_highlights", json={"paper_id": uploaded_paper["id"]})
        assert r.json()["total"] == 1

    def test_unlocatable_text_kept_but_flagged(self, client, uploaded_paper, mock_llm_response):
        fake = json.dumps([
            {"page": 1, "color": "yellow", "text": "definitely not in this pdf", "reason": "x"},
        ])
        mock_llm_response(fake)
        r = client.post("/ai/suggest_highlights", json={"paper_id": uploaded_paper["id"]})
        items = r.json()["items"]
        assert len(items) == 1
        assert items[0]["locatable"] is False
        assert items[0]["position"] is None

    def test_invalid_color_normalized_to_yellow(self, client, uploaded_paper, mock_llm_response):
        fake = json.dumps([{"page": 1, "color": "rainbow", "text": "testing", "reason": "x"}])
        mock_llm_response(fake)
        r = client.post("/ai/suggest_highlights", json={"paper_id": uploaded_paper["id"]})
        assert r.json()["items"][0]["color"] == "yellow"

    def test_malformed_items_skipped(self, client, uploaded_paper, mock_llm_response):
        fake = json.dumps([
            {"page": 1, "color": "yellow", "text": "testing", "reason": "x"},
            "not a dict",
            {"page": "invalid", "text": "x", "color": "yellow"},
            {"color": "yellow", "text": ""},
        ])
        mock_llm_response(fake)
        r = client.post("/ai/suggest_highlights", json={"paper_id": uploaded_paper["id"]})
        assert r.json()["total"] == 1

    def test_llm_non_json_returns_empty(self, client, uploaded_paper, mock_llm_response):
        mock_llm_response("I think the paper is about cats.")
        r = client.post("/ai/suggest_highlights", json={"paper_id": uploaded_paper["id"]})
        assert r.json()["items"] == []

    def test_missing_paper_404(self, client, mock_llm_response):
        mock_llm_response("[]")
        r = client.post("/ai/suggest_highlights", json={"paper_id": "nope"})
        assert r.status_code == 404
