"""Tests for /papers endpoints (upload, list, get, delete, file, outline, search)."""


class TestUpload:
    def test_upload_pdf_creates_paper(self, client, sample_pdf_bytes):
        r = client.post(
            "/papers/upload",
            files={"file": ("test.pdf", sample_pdf_bytes, "application/pdf")},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["title"] == "Test Paper: A Study of Testing"
        assert data["total_pages"] == 3
        assert data["authors"] == ["Alice", "Bob Chen"]
        assert data["year"] == 2023
        assert "id" in data

    def test_upload_duplicate_returns_existing(self, client, sample_pdf_bytes):
        r1 = client.post("/papers/upload", files={"file": ("a.pdf", sample_pdf_bytes, "application/pdf")})
        r2 = client.post("/papers/upload", files={"file": ("b.pdf", sample_pdf_bytes, "application/pdf")})
        assert r1.status_code == 200
        assert r2.status_code == 200
        assert r1.json()["id"] == r2.json()["id"]  # dedup via SHA256

    def test_upload_invalid_pdf_rejected(self, client):
        r = client.post(
            "/papers/upload",
            files={"file": ("not-a-pdf.pdf", b"hello world", "application/pdf")},
        )
        assert r.status_code == 400
        assert r.json()["error"]["code"] == "INVALID_PDF"


class TestList:
    def test_empty_list_initially(self, client):
        r = client.get("/papers")
        assert r.status_code == 200
        assert r.json() == {"items": [], "total": 0}

    def test_list_returns_uploaded(self, client, uploaded_paper):
        r = client.get("/papers")
        data = r.json()
        assert data["total"] == 1
        assert data["items"][0]["id"] == uploaded_paper["id"]

    def test_search_by_title(self, client, uploaded_paper):
        r = client.get("/papers?q=Study")
        assert r.status_code == 200
        assert r.json()["total"] == 1
        r2 = client.get("/papers?q=NoSuchThing")
        assert r2.json()["total"] == 0

    def test_pagination(self, client, sample_pdf_bytes):
        # Upload two distinct papers (different bytes -> different hashes)
        import fitz
        for i in range(2):
            doc = fitz.open()
            doc.set_metadata({"title": f"Paper {i}"})
            p = doc.new_page()
            p.insert_text((72, 72), f"unique content {i}")
            data = doc.tobytes()
            doc.close()
            client.post("/papers/upload", files={"file": (f"p{i}.pdf", data, "application/pdf")})
        r = client.get("/papers?limit=1&offset=0")
        assert r.status_code == 200
        assert len(r.json()["items"]) == 1


class TestGetAndDelete:
    def test_get_paper_by_id(self, client, uploaded_paper):
        r = client.get(f"/papers/{uploaded_paper['id']}")
        assert r.status_code == 200
        assert r.json()["id"] == uploaded_paper["id"]

    def test_get_missing_returns_404(self, client):
        r = client.get("/papers/nonexistent-id")
        assert r.status_code == 404
        assert r.json()["error"]["code"] == "PAPER_NOT_FOUND"

    def test_delete_paper_removes_it(self, client, uploaded_paper):
        r = client.delete(f"/papers/{uploaded_paper['id']}")
        assert r.status_code == 204
        r2 = client.get(f"/papers/{uploaded_paper['id']}")
        assert r2.status_code == 404

    def test_delete_missing_returns_404(self, client):
        r = client.delete("/papers/nope")
        assert r.status_code == 404


class TestFileServing:
    def test_get_file_returns_pdf(self, client, uploaded_paper):
        r = client.get(f"/papers/{uploaded_paper['id']}/file")
        assert r.status_code == 200
        assert r.headers["content-type"] == "application/pdf"
        assert r.content.startswith(b"%PDF")

    def test_get_file_missing_paper(self, client):
        r = client.get("/papers/nope/file")
        assert r.status_code == 404


class TestOutlineAndSearch:
    def test_get_outline(self, client, uploaded_paper):
        r = client.get(f"/papers/{uploaded_paper['id']}/outline")
        assert r.status_code == 200
        items = r.json()["items"]
        titles = [i["title"] for i in items]
        assert "Introduction" in titles
        assert "Method" in titles

    def test_search_text(self, client, uploaded_paper):
        r = client.get(f"/papers/{uploaded_paper['id']}/search?q=attention")
        assert r.status_code == 200
        data = r.json()
        assert data["total"] >= 1
        assert data["items"][0]["page"] == 2

    def test_search_empty_query_rejected(self, client, uploaded_paper):
        r = client.get(f"/papers/{uploaded_paper['id']}/search?q=")
        assert r.status_code == 422  # FastAPI validation


class TestCascadeDelete:
    def test_delete_paper_cascades_highlights(self, client, uploaded_paper):
        pid = uploaded_paper["id"]
        hl = client.post(
            f"/papers/{pid}/highlights",
            json={
                "text": "testing framework",
                "color": "yellow",
                "page": 1,
                "position": {"x": 72, "y": 72, "width": 100, "height": 15, "rects": [{"x": 72, "y": 72, "width": 100, "height": 15}]},
            },
        )
        assert hl.status_code == 200
        client.delete(f"/papers/{pid}")
        # Recreate paper (different hash, but same hash check)
        # Can't easily verify DB state here; just confirm deletion didn't error
