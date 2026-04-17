"""Tests for /config endpoints."""


class TestGetSet:
    def test_get_returns_defaults(self, client):
        r = client.get("/config")
        assert r.status_code == 200
        d = r.json()
        assert d["provider"] == "openai"
        assert d["has_api_key"] is False
        assert "api_key" not in d  # never leaked

    def test_save_and_read_roundtrip(self, client):
        r = client.post("/config", json={
            "provider": "anthropic",
            "model": "claude-test",
            "api_key": "sk-test-123",
            "base_url": "",
            "ollama_model": "qwen2.5:14b",
        })
        assert r.status_code == 200
        assert r.json()["has_api_key"] is True
        assert r.json()["provider"] == "anthropic"
        assert "api_key" not in r.json()

        r2 = client.get("/config")
        assert r2.json()["provider"] == "anthropic"
        assert r2.json()["has_api_key"] is True

    def test_save_empty_api_key_preserves_existing(self, client):
        client.post("/config", json={
            "provider": "openai", "model": "gpt-4o", "api_key": "sk-abc",
            "base_url": "", "ollama_model": "qwen2.5:14b",
        })
        # Second save without api_key should keep existing
        client.post("/config", json={
            "provider": "openai", "model": "gpt-4o-mini", "api_key": "",
            "base_url": "", "ollama_model": "qwen2.5:14b",
        })
        assert client.get("/config").json()["has_api_key"] is True

    def test_save_with_null_api_key_clears(self, client):
        client.post("/config", json={
            "provider": "openai", "model": "gpt-4o", "api_key": "sk-abc",
            "base_url": "", "ollama_model": "qwen2.5:14b",
        })
        client.post("/config", json={
            "provider": "openai", "model": "gpt-4o", "api_key": None,
            "base_url": "", "ollama_model": "qwen2.5:14b",
        })
        assert client.get("/config").json()["has_api_key"] is False


class TestConnectionTest:
    def test_missing_api_key_reports_failure(self, client):
        # Default config has no api_key
        r = client.post("/config/test")
        assert r.status_code == 200
        assert r.json()["ok"] is False
        assert "未配置" in r.json()["message"] or "API" in r.json()["message"]
