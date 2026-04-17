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


class TestComparePapers:
    def _upload_second(self, client):
        import fitz
        doc = fitz.open()
        doc.set_metadata({"title": "Second Paper"})
        p = doc.new_page()
        p.insert_text((72, 72), "distinct content for second paper")
        data = doc.tobytes()
        doc.close()
        return client.post(
            "/papers/upload",
            files={"file": ("p2.pdf", data, "application/pdf")},
        ).json()

    def test_compare_two_papers(self, client, uploaded_paper, mock_llm):
        p2 = self._upload_second(client)
        r = client.post("/ai/compare_papers", json={
            "paper_ids": [uploaded_paper["id"], p2["id"]],
        })
        assert r.status_code == 200
        events = _parse_sse(r.text)
        assert any(e["type"] == "done" for e in events)

    def test_compare_needs_at_least_two(self, client, uploaded_paper, mock_llm):
        r = client.post("/ai/compare_papers", json={
            "paper_ids": [uploaded_paper["id"]],
        })
        assert r.status_code == 422

    def test_compare_missing_paper_404(self, client, uploaded_paper, mock_llm):
        r = client.post("/ai/compare_papers", json={
            "paper_ids": [uploaded_paper["id"], "nope"],
        })
        assert r.status_code == 404


class TestExplainSection:
    def test_explain_section_streams(self, client, uploaded_paper, mock_llm):
        pid = uploaded_paper["id"]
        r = client.post("/ai/explain_section", json={
            "paper_id": pid, "title": "Method", "start_page": 2, "end_page": 3,
        })
        assert r.status_code == 200
        events = _parse_sse(r.text)
        assert any(e["type"] == "done" for e in events)

    def test_missing_paper_404(self, client, mock_llm):
        r = client.post("/ai/explain_section", json={
            "paper_id": "nope", "title": "X", "start_page": 1,
        })
        assert r.status_code == 404


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


class TestChatContextInjection:
    """Verify chat includes user's highlights/notes as system prompt context."""

    def test_build_context_empty_paper(self, client, uploaded_paper):
        """With no highlights/notes, context is empty string."""
        from routers.ai import _build_chat_context
        from db import engine
        from sqlmodel import Session
        with Session(engine) as s:
            ctx = _build_chat_context(s, uploaded_paper["id"])
        assert ctx == ""

    def test_build_context_includes_highlights(self, client, uploaded_paper):
        from routers.ai import _build_chat_context
        from db import engine
        from sqlmodel import Session

        pid = uploaded_paper["id"]
        client.post(f"/papers/{pid}/highlights", json={
            "text": "attention mechanism", "color": "yellow", "page": 2,
            "position": {"x": 0, "y": 0, "width": 10, "height": 10,
                         "rects": [{"x": 0, "y": 0, "width": 10, "height": 10}]},
        })
        with Session(engine) as s:
            ctx = _build_chat_context(s, pid)
        assert "attention mechanism" in ctx
        assert "p.2" in ctx
        assert "重要概念" in ctx  # yellow label

    def test_build_context_includes_notes(self, client, uploaded_paper):
        from routers.ai import _build_chat_context
        from db import engine
        from sqlmodel import Session

        pid = uploaded_paper["id"]
        client.post(f"/papers/{pid}/notes", json={
            "content": "my own observation about the paper",
            "source": "manual",
        })
        with Session(engine) as s:
            ctx = _build_chat_context(s, pid)
        assert "my own observation" in ctx
        assert "手动笔记" in ctx

    def test_build_context_includes_summary(self, client, uploaded_paper):
        from routers.ai import _build_chat_context
        from db import engine
        from sqlmodel import Session

        pid = uploaded_paper["id"]
        client.post(f"/papers/{pid}/notes", json={
            "title": "整篇摘要",
            "content": "## 核心贡献\nA new framework.",
            "source": "ai_summary",
        })
        with Session(engine) as s:
            ctx = _build_chat_context(s, pid)
        assert "AI 摘要" in ctx
        assert "new framework" in ctx

    def test_build_context_truncates_long_text(self, client, uploaded_paper):
        from routers.ai import _build_chat_context
        from db import engine
        from sqlmodel import Session

        pid = uploaded_paper["id"]
        long = "x" * 500
        client.post(f"/papers/{pid}/highlights", json={
            "text": long, "color": "yellow", "page": 1,
            "position": {"x": 0, "y": 0, "width": 10, "height": 10,
                         "rects": [{"x": 0, "y": 0, "width": 10, "height": 10}]},
        })
        with Session(engine) as s:
            ctx = _build_chat_context(s, pid)
        assert "…" in ctx  # ellipsis marker
        assert len(ctx) < 400  # truncated to ~160 chars per highlight
