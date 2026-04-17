"""Tests for /search endpoints (cross-paper)."""
import fitz


def _pdf(title: str, body: str = "x") -> bytes:
    doc = fitz.open()
    doc.set_metadata({"title": title})
    p = doc.new_page()
    p.insert_text((72, 72), body)
    data = doc.tobytes()
    doc.close()
    return data


class TestNoteSearch:
    def test_empty_when_no_notes(self, client):
        r = client.get("/search/notes?q=attention")
        assert r.status_code == 200
        assert r.json() == {"items": [], "total": 0}

    def test_finds_note_by_content(self, client):
        p1 = client.post("/papers/upload", files={"file": ("a.pdf", _pdf("P1"), "application/pdf")}).json()
        p2 = client.post("/papers/upload", files={"file": ("b.pdf", _pdf("P2"), "application/pdf")}).json()
        client.post(f"/papers/{p1['id']}/notes", json={"content": "attention is all you need", "source": "manual"})
        client.post(f"/papers/{p2['id']}/notes", json={"content": "transformer architecture", "source": "manual"})
        r = client.get("/search/notes?q=attention").json()
        assert r["total"] == 1
        assert "attention" in r["items"][0]["content"]
        assert r["items"][0]["paper_title"] == "P1"

    def test_case_insensitive(self, client, uploaded_paper):
        pid = uploaded_paper["id"]
        client.post(f"/papers/{pid}/notes", json={"content": "Hello WORLD", "source": "manual"})
        r = client.get("/search/notes?q=world").json()
        assert r["total"] == 1

    def test_searches_title_too(self, client, uploaded_paper):
        pid = uploaded_paper["id"]
        client.post(f"/papers/{pid}/notes", json={
            "title": "Great insight", "content": "details", "source": "ai_answer",
        })
        r = client.get("/search/notes?q=insight").json()
        assert r["total"] == 1

    def test_empty_query_rejected(self, client):
        r = client.get("/search/notes?q=")
        assert r.status_code == 422

    def test_respects_limit(self, client, uploaded_paper):
        pid = uploaded_paper["id"]
        for i in range(5):
            client.post(f"/papers/{pid}/notes", json={"content": f"item {i} attention", "source": "manual"})
        r = client.get("/search/notes?q=attention&limit=2").json()
        assert r["total"] == 2
