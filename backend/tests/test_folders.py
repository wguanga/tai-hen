"""Tests for /folders endpoints + folder_id handling on papers."""


class TestFolderCrud:
    def test_create_and_list(self, client):
        r = client.post("/folders", json={"name": "综述", "color": "#f59e0b"})
        assert r.status_code == 200
        created = r.json()
        assert created["name"] == "综述"
        assert created["color"] == "#f59e0b"
        assert created["paper_count"] == 0

        r = client.get("/folders")
        assert r.status_code == 200
        items = r.json()["items"]
        assert len(items) == 1
        assert items[0]["id"] == created["id"]

    def test_update_name_color(self, client):
        fid = client.post("/folders", json={"name": "a"}).json()["id"]
        r = client.put(f"/folders/{fid}", json={"name": "综述合集", "color": "#22c55e"})
        assert r.status_code == 200
        updated = r.json()
        assert updated["name"] == "综述合集"
        assert updated["color"] == "#22c55e"

    def test_partial_update_keeps_other_fields(self, client):
        fid = client.post("/folders", json={"name": "orig", "color": "#000000", "sort_order": 2}).json()["id"]
        client.put(f"/folders/{fid}", json={"name": "new"})
        got = next(f for f in client.get("/folders").json()["items"] if f["id"] == fid)
        assert got["name"] == "new"
        assert got["color"] == "#000000"  # unchanged
        assert got["sort_order"] == 2     # unchanged

    def test_delete_missing_returns_404(self, client):
        r = client.delete("/folders/does-not-exist")
        assert r.status_code == 404


class TestPaperFolderAssignment:
    def test_move_paper_into_folder(self, client, uploaded_paper):
        pid = uploaded_paper["id"]
        fid = client.post("/folders", json={"name": "审过"}).json()["id"]
        r = client.put(f"/papers/{pid}", json={"folder_id": fid})
        assert r.status_code == 200
        assert r.json()["folder_id"] == fid

        # paper_count rolls up
        folders = client.get("/folders").json()["items"]
        match = next(f for f in folders if f["id"] == fid)
        assert match["paper_count"] == 1

    def test_unassign_paper(self, client, uploaded_paper):
        pid = uploaded_paper["id"]
        fid = client.post("/folders", json={"name": "tmp"}).json()["id"]
        client.put(f"/papers/{pid}", json={"folder_id": fid})
        # explicit null → unfiled
        r = client.put(f"/papers/{pid}", json={"folder_id": None})
        assert r.status_code == 200
        assert r.json()["folder_id"] is None

    def test_reject_unknown_folder(self, client, uploaded_paper):
        pid = uploaded_paper["id"]
        r = client.put(f"/papers/{pid}", json={"folder_id": "nonexistent-id"})
        assert r.status_code == 400
        assert r.json()["detail"]["error"]["code"] == "FOLDER_NOT_FOUND"

    def test_delete_folder_orphans_papers(self, client, uploaded_paper):
        """Removing a folder must not destroy the papers inside — just unfile them."""
        pid = uploaded_paper["id"]
        fid = client.post("/folders", json={"name": "short-lived"}).json()["id"]
        client.put(f"/papers/{pid}", json={"folder_id": fid})
        r = client.delete(f"/folders/{fid}")
        assert r.status_code == 204
        # Paper survives, folder_id now None
        p = client.get(f"/papers/{pid}").json()
        assert p["folder_id"] is None


class TestListFilter:
    def test_filter_by_folder(self, client, uploaded_paper, sample_pdf_bytes_factory):
        pid1 = uploaded_paper["id"]
        # upload a second distinct paper (different bytes → different hash)
        second_bytes = sample_pdf_bytes_factory(title="Paper Two")
        pid2 = client.post(
            "/papers/upload",
            files={"file": ("two.pdf", second_bytes, "application/pdf")},
        ).json()["id"]

        fid = client.post("/folders", json={"name": "sel"}).json()["id"]
        client.put(f"/papers/{pid1}", json={"folder_id": fid})

        only_in_folder = client.get(f"/papers?folder_id={fid}").json()
        assert only_in_folder["total"] == 1
        assert only_in_folder["items"][0]["id"] == pid1

        unfiled = client.get("/papers?folder_id=unfiled").json()
        unfiled_ids = {p["id"] for p in unfiled["items"]}
        assert pid2 in unfiled_ids
        assert pid1 not in unfiled_ids
