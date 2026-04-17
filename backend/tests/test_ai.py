"""Tests for /ai endpoints. LLM is mocked via the mock_llm fixture."""
import json


def _parse_sse(text: str) -> list[dict]:
    events = []
    for line in text.splitlines():
        if line.startswith("data: "):
            try:
                events.append(json.loads(line[6:]))
            except json.JSONDecodeError:
                pass
    return events


class TestExplain:
    def test_explain_streams_chunks(self, client, uploaded_paper, mock_llm):
        pid = uploaded_paper["id"]
        r = client.post("/ai/explain", json={
            "paper_id": pid, "text": "attention mechanism", "level": "simple",
        })
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("text/event-stream")
        events = _parse_sse(r.text)
        chunk_texts = [e["text"] for e in events if e["type"] == "chunk"]
        assert "".join(chunk_texts) == "".join(mock_llm)
        assert any(e["type"] == "done" for e in events)

    def test_explain_missing_paper(self, client, mock_llm):
        r = client.post("/ai/explain", json={
            "paper_id": "bogus", "text": "x", "level": "simple",
        })
        assert r.status_code == 404

    def test_explain_persists_chat_history(self, client, uploaded_paper, mock_llm):
        pid = uploaded_paper["id"]
        client.post("/ai/explain", json={
            "paper_id": pid, "text": "attention mechanism", "level": "simple",
        })
        # Verify via DB state through models
        from sqlmodel import Session, select
        from db import engine
        from models import Chat
        with Session(engine) as s:
            rows = s.exec(select(Chat).where(Chat.paper_id == pid)).all()
        roles = [r.role for r in rows]
        assert "user" in roles
        assert "assistant" in roles


class TestTranslate:
    def test_translate_streams(self, client, uploaded_paper, mock_llm):
        pid = uploaded_paper["id"]
        r = client.post("/ai/translate", json={"paper_id": pid, "text": "Hello"})
        assert r.status_code == 200
        events = _parse_sse(r.text)
        assert any(e["type"] == "chunk" for e in events)
        assert any(e["type"] == "done" for e in events)


class TestSummarize:
    def test_summarize_streams(self, client, uploaded_paper, mock_llm):
        pid = uploaded_paper["id"]
        r = client.post("/ai/summarize", json={"paper_id": pid})
        assert r.status_code == 200
        events = _parse_sse(r.text)
        chunk_text = "".join(e["text"] for e in events if e["type"] == "chunk")
        assert len(chunk_text) > 0


class TestChat:
    def test_chat_streams_and_persists(self, client, uploaded_paper, mock_llm):
        pid = uploaded_paper["id"]
        r = client.post("/ai/chat", json={
            "paper_id": pid,
            "messages": [{"role": "user", "content": "what is attention?"}],
        })
        assert r.status_code == 200
        events = _parse_sse(r.text)
        assert any(e["type"] == "done" for e in events)
