"""Tests for /papers/{id}/notes endpoints and Markdown export."""
import pytest


@pytest.fixture
def paper_with_hl(client, uploaded_paper):
    """Uploaded paper with one highlight returned."""
    pid = uploaded_paper["id"]
    hl = client.post(f"/papers/{pid}/highlights", json={
        "text": "attention mechanism", "color": "yellow", "page": 2,
        "position": {"x": 72, "y": 72, "width": 200, "height": 15,
                     "rects": [{"x": 72, "y": 72, "width": 200, "height": 15}]},
    }).json()
    return pid, hl


class TestCreateAndList:
    def test_create_manual_note(self, client, paper_with_hl):
        pid, hl = paper_with_hl
        r = client.post(f"/papers/{pid}/notes", json={
            "highlight_id": hl["id"], "title": "T", "content": "# my note", "source": "manual",
        })
        assert r.status_code == 200
        n = r.json()
        assert n["title"] == "T"
        assert n["source"] == "manual"
        assert n["highlight_id"] == hl["id"]

    def test_create_ai_answer_without_highlight(self, client, uploaded_paper):
        pid = uploaded_paper["id"]
        r = client.post(f"/papers/{pid}/notes", json={
            "content": "AI said this", "source": "ai_answer",
        })
        assert r.status_code == 200
        assert r.json()["highlight_id"] is None

    def test_reject_invalid_source(self, client, uploaded_paper):
        pid = uploaded_paper["id"]
        r = client.post(f"/papers/{pid}/notes", json={
            "content": "x", "source": "weird",
        })
        assert r.status_code == 422

    def test_reject_empty_content(self, client, uploaded_paper):
        pid = uploaded_paper["id"]
        r = client.post(f"/papers/{pid}/notes", json={
            "content": "", "source": "manual",
        })
        assert r.status_code == 422

    def test_list_and_filter(self, client, paper_with_hl):
        pid, hl = paper_with_hl
        client.post(f"/papers/{pid}/notes", json={"content": "a", "source": "manual", "highlight_id": hl["id"]})
        client.post(f"/papers/{pid}/notes", json={"content": "b", "source": "ai_answer"})
        all_notes = client.get(f"/papers/{pid}/notes").json()["items"]
        assert len(all_notes) == 2

        by_source = client.get(f"/papers/{pid}/notes?source=manual").json()["items"]
        assert len(by_source) == 1
        assert by_source[0]["source"] == "manual"

        by_hl = client.get(f"/papers/{pid}/notes?highlight_id={hl['id']}").json()["items"]
        assert len(by_hl) == 1


class TestUpdate:
    def test_update_content(self, client, uploaded_paper):
        pid = uploaded_paper["id"]
        n = client.post(f"/papers/{pid}/notes", json={"content": "old", "source": "manual"}).json()
        r = client.put(f"/papers/{pid}/notes/{n['id']}", json={"content": "new"})
        assert r.status_code == 200
        assert r.json()["content"] == "new"
        # updated_at should change
        assert r.json()["updated_at"] >= n["created_at"]

    def test_update_missing_returns_404(self, client, uploaded_paper):
        r = client.put(f"/papers/{uploaded_paper['id']}/notes/missing", json={"content": "x"})
        assert r.status_code == 404


class TestDelete:
    def test_delete_note(self, client, uploaded_paper):
        pid = uploaded_paper["id"]
        n = client.post(f"/papers/{pid}/notes", json={"content": "x", "source": "manual"}).json()
        r = client.delete(f"/papers/{pid}/notes/{n['id']}")
        assert r.status_code == 204


class TestExport:
    def test_export_returns_markdown(self, client, paper_with_hl):
        pid, hl = paper_with_hl
        client.post(f"/papers/{pid}/notes", json={
            "highlight_id": hl["id"], "content": "my thought", "source": "manual",
        })
        r = client.get(f"/papers/{pid}/export")
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("text/markdown")
        md = r.text
        assert "Test Paper" in md
        assert "attention mechanism" in md
        assert "my thought" in md
        assert "第 2 页" in md
        assert "🟨" in md  # yellow color emoji

    def test_export_empty_paper(self, client, uploaded_paper):
        pid = uploaded_paper["id"]
        r = client.get(f"/papers/{pid}/export")
        assert r.status_code == 200
        # Still has title, even without highlights/notes
        assert "Test Paper" in r.text

    def test_export_groups_summary_separately(self, client, uploaded_paper):
        pid = uploaded_paper["id"]
        client.post(f"/papers/{pid}/notes", json={
            "content": "Paper summary content", "source": "ai_summary", "title": "整篇摘要",
        })
        md = client.get(f"/papers/{pid}/export").text
        assert "摘要笔记" in md
        assert "Paper summary content" in md

    def test_export_missing_paper(self, client):
        r = client.get("/papers/missing/export")
        assert r.status_code == 404
