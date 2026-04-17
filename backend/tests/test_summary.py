"""Tests for /papers/{id}/summary endpoints."""


class TestGetSummary:
    def test_get_when_none_exists(self, client, uploaded_paper):
        r = client.get(f"/papers/{uploaded_paper['id']}/summary")
        assert r.status_code == 200
        assert r.json() == {"summary": None}

    def test_get_after_manual_summary_note_created(self, client, uploaded_paper):
        pid = uploaded_paper["id"]
        client.post(f"/papers/{pid}/notes", json={
            "title": "整篇摘要", "content": "## 核心贡献\n一个测试框架", "source": "ai_summary",
        })
        r = client.get(f"/papers/{pid}/summary")
        data = r.json()["summary"]
        assert data is not None
        assert data["content"].startswith("## 核心贡献")

    def test_get_missing_paper_returns_404(self, client):
        r = client.get("/papers/missing/summary")
        assert r.status_code == 404


class TestGenerateSummary:
    def test_generate_creates_summary(self, client, uploaded_paper, mock_llm):
        pid = uploaded_paper["id"]
        r = client.post(f"/papers/{pid}/summary")
        assert r.status_code == 200
        data = r.json()
        assert data["cached"] is False
        assert data["summary"] is not None
        # Mock LLM returns ["Hello", " ", "world", "."]
        assert data["summary"]["content"] == "Hello world."

    def test_generate_caches_by_default(self, client, uploaded_paper, mock_llm):
        pid = uploaded_paper["id"]
        r1 = client.post(f"/papers/{pid}/summary")
        sid = r1.json()["summary"]["id"]
        r2 = client.post(f"/papers/{pid}/summary")
        assert r2.json()["cached"] is True
        assert r2.json()["summary"]["id"] == sid

    def test_regenerate_replaces_existing(self, client, uploaded_paper, mock_llm):
        pid = uploaded_paper["id"]
        r1 = client.post(f"/papers/{pid}/summary")
        id1 = r1.json()["summary"]["id"]
        r2 = client.post(f"/papers/{pid}/summary?regenerate=true")
        id2 = r2.json()["summary"]["id"]
        assert id1 != id2
        # Only one ai_summary note should remain
        notes = client.get(f"/papers/{pid}/notes?source=ai_summary").json()["items"]
        assert len(notes) == 1
        assert notes[0]["id"] == id2

    def test_generate_missing_paper_404(self, client, mock_llm):
        r = client.post("/papers/nope/summary")
        assert r.status_code == 404
