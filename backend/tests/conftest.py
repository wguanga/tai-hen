"""Shared pytest fixtures. See .claude/testing.md for conventions."""
from __future__ import annotations

import importlib
import json
import os
import sys
from pathlib import Path

import fitz
import pytest
from fastapi.testclient import TestClient

# Ensure backend/ is on sys.path so `import main` works when pytest is run from backend/
BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


def _reload_backend_modules():
    """Force reload of modules that capture DATA_DIR/DB path at import time."""
    # Clear SQLModel metadata so reloaded models register against a fresh registry
    try:
        from sqlmodel import SQLModel
        SQLModel.metadata.clear()
    except Exception:
        pass
    for mod in (
        "db",
        "models",
        "services.config_service",
        "services.paper_service",
        "repositories.paper_repo",
        "repositories.highlight_repo",
        "repositories.note_repo",
        "repositories.chat_repo",
        "repositories.glossary_repo",
        "routers.papers",
        "routers.highlights",
        "routers.notes",
        "routers.ai",
        "routers.search",
        "routers.glossary",
        "routers.config",
        "deps",
    ):
        if mod in sys.modules:
            importlib.reload(sys.modules[mod])


@pytest.fixture
def isolated_data(tmp_path, monkeypatch):
    """Redirect all data I/O to a temp directory. Core fixture for tests."""
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    (data_dir / "papers").mkdir()
    (data_dir / "logs").mkdir()
    monkeypatch.chdir(tmp_path)
    yield data_dir


@pytest.fixture
def sample_pdf_bytes() -> bytes:
    """Generate a minimal valid PDF with known content + outline."""
    doc = fitz.open()
    doc.set_metadata({
        "title": "Test Paper: A Study of Testing",
        "author": "Alice, Bob Chen",
        "creationDate": "D:20230515000000Z",
    })
    # Page 1: Introduction
    page = doc.new_page()
    page.insert_text((72, 72), "Introduction\nThis paper presents a framework for testing.\nYear 2023 marks a new era.", fontsize=12)
    # Page 2: Method
    page = doc.new_page()
    page.insert_text((72, 72), "Method\nWe use the attention mechanism.\nOur approach is novel.", fontsize=12)
    # Page 3: Results
    page = doc.new_page()
    page.insert_text((72, 72), "Results\nExperiments show 95% accuracy.", fontsize=12)

    # Set up a table of contents (outline)
    doc.set_toc([
        [1, "Introduction", 1],
        [1, "Method", 2],
        [1, "Results", 3],
    ])

    data = doc.tobytes()
    doc.close()
    return data


@pytest.fixture
def sample_pdf_path(tmp_path, sample_pdf_bytes) -> str:
    p = tmp_path / "sample.pdf"
    p.write_bytes(sample_pdf_bytes)
    return str(p)


@pytest.fixture
def client(isolated_data, monkeypatch):
    """FastAPI TestClient with isolated data dir."""
    _reload_backend_modules()
    # Suppress background logging to keep output clean
    monkeypatch.setenv("TESTING", "1")
    import main
    importlib.reload(main)
    with TestClient(main.app) as c:
        yield c


@pytest.fixture
def uploaded_paper(client, sample_pdf_bytes) -> dict:
    """Upload a sample PDF and return the paper dict."""
    r = client.post(
        "/papers/upload",
        files={"file": ("sample.pdf", sample_pdf_bytes, "application/pdf")},
    )
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture
def mock_llm(monkeypatch):
    """Replace stream_llm with a deterministic generator. Returns the chunks list used."""
    chunks = ["Hello", " ", "world", "."]

    async def fake_stream(messages, system):
        for c in chunks:
            yield c

    import services.llm_service as llm
    monkeypatch.setattr(llm, "stream_llm", fake_stream)
    # Also patch the import in ai.py which did `from services.llm_service import stream_llm`
    import routers.ai as ai_router
    monkeypatch.setattr(ai_router, "stream_llm", fake_stream)
    return chunks


@pytest.fixture
def mock_llm_response(monkeypatch):
    """Factory fixture: returns a setter to install a fake response for stream_llm.

    Usage:
        def test_xxx(mock_llm_response, ...):
            mock_llm_response('{"key": "value"}')
            ...
    """
    def _set(text: str):
        async def fake_stream(messages, system):
            # Simulate streaming by chunking into ~32 char pieces
            for i in range(0, len(text), 32):
                yield text[i:i + 32]

        import services.llm_service as llm
        monkeypatch.setattr(llm, "stream_llm", fake_stream)
        import routers.ai as ai_router
        monkeypatch.setattr(ai_router, "stream_llm", fake_stream)

    return _set
