"""Tests for paper tags: update, filter, list all."""
import fitz


def _make_pdf(title: str, body: str = "content") -> bytes:
    doc = fitz.open()
    doc.set_metadata({"title": title})
    p = doc.new_page()
    p.insert_text((72, 72), body)
    data = doc.tobytes()
    doc.close()
    return data


class TestTagsOnPaper:
    def test_new_paper_has_empty_tags(self, client, uploaded_paper):
        assert uploaded_paper["tags"] == []

    def test_update_tags(self, client, uploaded_paper):
        pid = uploaded_paper["id"]
        r = client.put(f"/papers/{pid}", json={"tags": ["nlp", "待读"]})
        assert r.status_code == 200
        assert r.json()["tags"] == ["nlp", "待读"]

    def test_update_tags_persisted(self, client, uploaded_paper):
        pid = uploaded_paper["id"]
        client.put(f"/papers/{pid}", json={"tags": ["cv"]})
        r = client.get(f"/papers/{pid}")
        assert r.json()["tags"] == ["cv"]

    def test_update_missing_paper_404(self, client):
        r = client.put("/papers/nope", json={"tags": ["x"]})
        assert r.status_code == 404


class TestFilterByTag:
    def test_filter_by_tag(self, client):
        r1 = client.post("/papers/upload", files={"file": ("a.pdf", _make_pdf("Paper A", "unique A"), "application/pdf")}).json()
        r2 = client.post("/papers/upload", files={"file": ("b.pdf", _make_pdf("Paper B", "unique B"), "application/pdf")}).json()
        client.put(f"/papers/{r1['id']}", json={"tags": ["nlp"]})
        client.put(f"/papers/{r2['id']}", json={"tags": ["cv"]})

        nlp = client.get("/papers?tag=nlp").json()
        assert nlp["total"] == 1
        assert nlp["items"][0]["id"] == r1["id"]

        cv = client.get("/papers?tag=cv").json()
        assert cv["total"] == 1
        assert cv["items"][0]["id"] == r2["id"]

    def test_filter_by_missing_tag_returns_empty(self, client, uploaded_paper):
        r = client.get("/papers?tag=nonexistent")
        assert r.json()["total"] == 0


class TestAllTagsEndpoint:
    def test_empty_initially(self, client):
        r = client.get("/papers/tags")
        assert r.status_code == 200
        assert r.json() == {"items": []}

    def test_aggregates_across_papers(self, client):
        r1 = client.post("/papers/upload", files={"file": ("a.pdf", _make_pdf("X", "aaa"), "application/pdf")}).json()
        r2 = client.post("/papers/upload", files={"file": ("b.pdf", _make_pdf("Y", "bbb"), "application/pdf")}).json()
        client.put(f"/papers/{r1['id']}", json={"tags": ["nlp", "待读"]})
        client.put(f"/papers/{r2['id']}", json={"tags": ["nlp", "cv"]})
        r = client.get("/papers/tags")
        assert r.json()["items"] == ["cv", "nlp", "待读"]
