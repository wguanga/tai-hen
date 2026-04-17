"""Tests for /papers/{id}/highlights endpoints."""
import pytest


@pytest.fixture
def make_hl(client, uploaded_paper):
    """Helper to create highlights with defaults."""
    pid = uploaded_paper["id"]

    def _create(text="testing", color="yellow", page=1, x=72, y=72):
        return client.post(
            f"/papers/{pid}/highlights",
            json={
                "text": text,
                "color": color,
                "page": page,
                "position": {
                    "x": x, "y": y, "width": 100, "height": 15,
                    "rects": [{"x": x, "y": y, "width": 100, "height": 15}],
                },
            },
        )

    return pid, _create


class TestCreate:
    def test_create_highlight(self, make_hl):
        pid, mk = make_hl
        r = mk(text="attention mechanism", color="blue", page=2)
        assert r.status_code == 200
        data = r.json()
        assert data["text"] == "attention mechanism"
        assert data["color"] == "blue"
        assert data["page"] == 2
        assert data["paper_id"] == pid
        assert "id" in data
        assert data["position"]["rects"][0]["width"] == 100

    def test_create_rejects_invalid_color(self, make_hl, client):
        pid, _ = make_hl
        r = client.post(
            f"/papers/{pid}/highlights",
            json={"text": "x", "color": "rainbow", "page": 1,
                  "position": {"x": 0, "y": 0, "width": 10, "height": 10, "rects": []}},
        )
        assert r.status_code == 422

    def test_create_rejects_empty_text(self, make_hl, client):
        pid, _ = make_hl
        r = client.post(f"/papers/{pid}/highlights", json={
            "text": "", "color": "yellow", "page": 1,
            "position": {"x": 0, "y": 0, "width": 10, "height": 10, "rects": []},
        })
        assert r.status_code == 422

    def test_create_on_missing_paper(self, client):
        r = client.post("/papers/bogus/highlights", json={
            "text": "x", "color": "yellow", "page": 1,
            "position": {"x": 0, "y": 0, "width": 10, "height": 10, "rects": []},
        })
        assert r.status_code == 404


class TestList:
    def test_empty_list(self, make_hl, client):
        pid, _ = make_hl
        r = client.get(f"/papers/{pid}/highlights")
        assert r.status_code == 200
        assert r.json() == {"items": []}

    def test_list_returns_created(self, make_hl, client):
        pid, mk = make_hl
        mk(text="a", color="yellow", page=1)
        mk(text="b", color="blue", page=2)
        r = client.get(f"/papers/{pid}/highlights")
        items = r.json()["items"]
        assert len(items) == 2

    def test_filter_by_page(self, make_hl, client):
        pid, mk = make_hl
        mk(text="a", color="yellow", page=1)
        mk(text="b", color="blue", page=2)
        mk(text="c", color="green", page=2)
        r = client.get(f"/papers/{pid}/highlights?page=2")
        items = r.json()["items"]
        assert len(items) == 2
        assert all(i["page"] == 2 for i in items)

    def test_filter_by_color(self, make_hl, client):
        pid, mk = make_hl
        mk(text="a", color="yellow", page=1)
        mk(text="b", color="blue", page=1)
        r = client.get(f"/papers/{pid}/highlights?color=yellow")
        items = r.json()["items"]
        assert len(items) == 1
        assert items[0]["color"] == "yellow"


class TestUpdate:
    def test_update_color(self, make_hl, client):
        pid, mk = make_hl
        hl = mk().json()
        r = client.put(f"/papers/{pid}/highlights/{hl['id']}", json={"color": "green"})
        assert r.status_code == 200
        assert r.json()["color"] == "green"

    def test_update_note_field(self, make_hl, client):
        pid, mk = make_hl
        hl = mk().json()
        r = client.put(f"/papers/{pid}/highlights/{hl['id']}", json={"note": "important"})
        assert r.status_code == 200
        assert r.json()["note"] == "important"

    def test_update_missing_returns_404(self, make_hl, client):
        pid, _ = make_hl
        r = client.put(f"/papers/{pid}/highlights/nope", json={"color": "green"})
        assert r.status_code == 404


class TestDelete:
    def test_delete_highlight(self, make_hl, client):
        pid, mk = make_hl
        hl = mk().json()
        r = client.delete(f"/papers/{pid}/highlights/{hl['id']}")
        assert r.status_code == 204
        listing = client.get(f"/papers/{pid}/highlights").json()
        assert listing["items"] == []

    def test_delete_missing_returns_404(self, make_hl, client):
        pid, _ = make_hl
        r = client.delete(f"/papers/{pid}/highlights/missing")
        assert r.status_code == 404
