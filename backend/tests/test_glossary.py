"""Tests for /glossary endpoints + auto-extraction from summary."""


class TestCRUD:
    def test_create_and_list(self, client):
        r = client.post("/glossary", json={
            "term": "attention", "definition": "A mechanism to weight inputs.",
        })
        assert r.status_code == 200
        assert r.json()["term"] == "attention"

        lst = client.get("/glossary").json()
        assert lst["items"][0]["term"] == "attention"

    def test_create_upserts_by_term(self, client):
        r1 = client.post("/glossary", json={"term": "x", "definition": "first"})
        r2 = client.post("/glossary", json={"term": "x", "definition": "second"})
        assert r1.json()["id"] == r2.json()["id"]
        assert r2.json()["definition"] == "second"

    def test_search(self, client):
        client.post("/glossary", json={"term": "attention", "definition": "mechanism"})
        client.post("/glossary", json={"term": "softmax", "definition": "normalize"})
        r = client.get("/glossary?q=attention").json()
        assert r["items"][0]["term"] == "attention"
        r2 = client.get("/glossary?q=normalize").json()
        assert r2["items"][0]["term"] == "softmax"

    def test_update(self, client):
        g = client.post("/glossary", json={"term": "x", "definition": "old"}).json()
        r = client.put(f"/glossary/{g['id']}", json={"definition": "new"})
        assert r.status_code == 200
        assert r.json()["definition"] == "new"

    def test_delete(self, client):
        g = client.post("/glossary", json={"term": "x", "definition": "d"}).json()
        r = client.delete(f"/glossary/{g['id']}")
        assert r.status_code == 204
        assert client.get("/glossary").json()["items"] == []

    def test_empty_term_rejected(self, client):
        r = client.post("/glossary", json={"term": "", "definition": "d"})
        assert r.status_code == 422


class TestAutoExtractFromSummary:
    def test_summary_populates_glossary(self, client, uploaded_paper, mock_llm_response):
        markdown = (
            "## 一句话核心贡献\nA framework.\n\n"
            "## 关键术语\n"
            "- attention: a weighted pooling mechanism.\n"
            "- **BERT**: bidirectional encoder representations.\n"
            "- softmax：将实数映射到概率分布。\n"
        )
        mock_llm_response(markdown)
        r = client.post(f"/papers/{uploaded_paper['id']}/summary")
        assert r.status_code == 200

        terms = [g["term"] for g in client.get("/glossary").json()["items"]]
        assert "attention" in terms
        assert "BERT" in terms
        assert "softmax" in terms

    def test_summary_without_glossary_section(self, client, uploaded_paper, mock_llm_response):
        mock_llm_response("## 一句话核心贡献\nfoo\n\n## 方法\nbar")
        client.post(f"/papers/{uploaded_paper['id']}/summary")
        assert client.get("/glossary").json()["items"] == []

    def test_existing_term_not_overwritten(self, client, uploaded_paper, mock_llm_response):
        client.post("/glossary", json={"term": "attention", "definition": "manual def"})
        mock_llm_response("## 关键术语\n- attention: auto def.\n")
        client.post(f"/papers/{uploaded_paper['id']}/summary")
        entries = client.get("/glossary?q=attention").json()["items"]
        assert len(entries) == 1
        assert entries[0]["definition"] == "manual def"
