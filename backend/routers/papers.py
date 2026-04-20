"""Paper endpoints."""
import json
from pathlib import Path

from fastapi import APIRouter, Depends, File, Query, Response, UploadFile
from fastapi.responses import FileResponse
from sqlmodel import Session

from deps import get_session
from errors import PaperNotFound
from repositories.paper_repo import PaperRepo
from schemas import PaperList, PaperRead, PaperUpdate
from services.paper_service import upload_paper, import_from_url

router = APIRouter(tags=["papers"])


def _to_read(paper) -> PaperRead:
    try:
        authors = json.loads(paper.authors) if paper.authors else []
    except json.JSONDecodeError:
        authors = []
    try:
        tags = json.loads(getattr(paper, "tags", None) or "[]")
    except json.JSONDecodeError:
        tags = []
    return PaperRead(
        id=paper.id,
        title=paper.title,
        authors=authors,
        year=paper.year,
        file_path=paper.file_path,
        total_pages=paper.total_pages,
        file_size=paper.file_size,
        tags=tags,
        created_at=paper.created_at,
    )


@router.post("/upload", response_model=PaperRead)
async def upload(file: UploadFile = File(...), session: Session = Depends(get_session)):
    paper = await upload_paper(session, file)
    return _to_read(paper)


class _UrlImportBody(__import__("pydantic").BaseModel):  # inline to avoid new schema file
    url: str


@router.post("/import_url", response_model=PaperRead)
async def import_url(body: _UrlImportBody, session: Session = Depends(get_session)):
    """Download a PDF from a URL (arXiv abs/pdf or direct link) and add it."""
    paper = await import_from_url(session, body.url)
    return _to_read(paper)


class _ArxivSearchBody(__import__("pydantic").BaseModel):
    ref_text: str
    max_results: int = 3


@router.post("/search_arxiv")
async def search_arxiv_endpoint(body: _ArxivSearchBody):
    """Search arXiv using a free-text reference string; returns top candidates
    with arxiv_id / title / authors / pdf_url so the frontend can offer
    one-click import."""
    from services.arxiv_search import search_arxiv
    hits = await search_arxiv(body.ref_text, max_results=max(1, min(body.max_results, 5)))
    return {"items": hits}


@router.get("", response_model=PaperList)
def list_papers(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    q: str | None = Query(None),
    tag: str | None = Query(None),
    session: Session = Depends(get_session),
):
    items, total = PaperRepo(session).list(limit=limit, offset=offset, q=q, tag=tag)
    return PaperList(items=[_to_read(p) for p in items], total=total)


@router.get("/tags")
def list_tags(session: Session = Depends(get_session)):
    return {"items": PaperRepo(session).all_tags()}


@router.put("/{paper_id}", response_model=PaperRead)
def update_paper(paper_id: str, body: PaperUpdate, session: Session = Depends(get_session)):
    repo = PaperRepo(session)
    if not repo.by_id(paper_id):
        raise PaperNotFound(detail={"paper_id": paper_id})
    patch = body.model_dump(exclude_unset=True)
    updated = repo.update(paper_id, patch)
    return _to_read(updated)


@router.get("/{paper_id}", response_model=PaperRead)
def get_paper(paper_id: str, session: Session = Depends(get_session)):
    paper = PaperRepo(session).by_id(paper_id)
    if not paper:
        raise PaperNotFound(detail={"paper_id": paper_id})
    return _to_read(paper)


@router.get("/{paper_id}/file")
def get_paper_file(paper_id: str, session: Session = Depends(get_session)):
    paper = PaperRepo(session).by_id(paper_id)
    if not paper:
        raise PaperNotFound(detail={"paper_id": paper_id})
    path = Path("data") / paper.file_path
    if not path.exists():
        raise PaperNotFound(detail={"reason": "file missing on disk"})
    return FileResponse(
        path,
        media_type="application/pdf",
        headers={"Cache-Control": "private, max-age=3600"},
    )


@router.get("/{paper_id}/summary")
def get_summary(paper_id: str, session: Session = Depends(get_session)):
    """Return existing ai_summary note or null."""
    paper = PaperRepo(session).by_id(paper_id)
    if not paper:
        raise PaperNotFound(detail={"paper_id": paper_id})
    from repositories.note_repo import NoteRepo
    notes = NoteRepo(session).list_for_paper(paper_id, source="ai_summary")
    if not notes:
        return {"summary": None}
    # Most recent summary
    latest = notes[0]
    return {
        "summary": {
            "id": latest.id,
            "content": latest.content,
            "created_at": latest.created_at,
            "updated_at": latest.updated_at,
        }
    }


@router.post("/{paper_id}/summary")
async def generate_summary(paper_id: str, regenerate: bool = Query(False), session: Session = Depends(get_session)):
    """Generate a fresh summary (non-streaming). Returns markdown + persisted note.

    If a summary exists and regenerate=false, returns the existing one.
    """
    paper = PaperRepo(session).by_id(paper_id)
    if not paper:
        raise PaperNotFound(detail={"paper_id": paper_id})

    from repositories.note_repo import NoteRepo
    note_repo = NoteRepo(session)
    existing = note_repo.list_for_paper(paper_id, source="ai_summary")

    if existing and not regenerate:
        n = existing[0]
        return {
            "summary": {
                "id": n.id,
                "content": n.content,
                "created_at": n.created_at,
                "updated_at": n.updated_at,
            },
            "cached": True,
        }

    from services.llm_service import SYSTEM_PROMPTS, stream_llm
    from services.pdf_parser import get_all_text

    abs_path = Path("data") / paper.file_path
    full_text = get_all_text(str(abs_path), max_chars=60_000)
    messages = [{"role": "user", "content": f"# 论文全文（可能截断）\n\n{full_text}"}]

    buf: list[str] = []
    async for chunk in stream_llm(messages, SYSTEM_PROMPTS["summarize"]):
        buf.append(chunk)
    content = "".join(buf).strip()

    if not content:
        return {"summary": None, "cached": False}

    # Replace existing (delete old summaries) then create a new one
    for old in existing:
        note_repo.delete(old.id)
    note = note_repo.create({
        "paper_id": paper_id,
        "title": "整篇摘要",
        "content": content,
        "source": "ai_summary",
    })

    # Auto-extract glossary terms from "## 关键术语" section
    _auto_extract_glossary(session, paper_id, content)

    return {
        "summary": {
            "id": note.id,
            "content": note.content,
            "created_at": note.created_at,
            "updated_at": note.updated_at,
        },
        "cached": False,
    }


def _auto_extract_glossary(session, paper_id: str, summary_md: str) -> int:
    """Parse '## 关键术语' section in a summary and upsert each term into glossary."""
    import re
    from repositories.glossary_repo import GlossaryRepo

    # Find section
    match = re.search(r"##\s*关键术语\s*\n(.+?)(?=\n##|\Z)", summary_md, re.DOTALL)
    if not match:
        return 0
    section = match.group(1).strip()

    # Each line like '- TermName: definition' or '- **Term**: definition'
    entries: list[tuple[str, str]] = []
    for line in section.splitlines():
        line = line.strip()
        # Strip a single leading list marker (- | * | • | N. ), plus spaces
        stripped = re.sub(r"^\s*(?:[-*•]|\d+[.)])\s+", "", line)
        if stripped == line:
            continue  # no marker → skip non-list line
        # Remove bold markers around the term/whole-line
        body = re.sub(r"\*\*(.+?)\*\*", r"\1", stripped)
        # Term: def  (tolerate full-width colon)
        m = re.match(r"^([^:：]+)[:：]\s*(.+)$", body)
        if not m:
            continue
        term = m.group(1).strip().rstrip(".。")
        definition = m.group(2).strip()
        if len(term) < 1 or len(definition) < 2:
            continue
        entries.append((term, definition))

    repo = GlossaryRepo(session)
    count = 0
    for term, definition in entries[:30]:
        existing = repo.find_by_term(term)
        if existing:
            continue  # don't overwrite existing entries from other papers
        repo.create({
            "term": term,
            "definition": definition,
            "paper_id": paper_id,
            "source": "summary",
        })
        count += 1
    return count


@router.get("/{paper_id}/outline")
def get_outline(paper_id: str, session: Session = Depends(get_session)):
    paper = PaperRepo(session).by_id(paper_id)
    if not paper:
        raise PaperNotFound(detail={"paper_id": paper_id})
    from services.pdf_parser import get_outline
    path = Path("data") / paper.file_path
    items = get_outline(str(path))
    return {"items": items}


@router.get("/{paper_id}/figures")
def get_figures(paper_id: str, session: Session = Depends(get_session)):
    paper = PaperRepo(session).by_id(paper_id)
    if not paper:
        raise PaperNotFound(detail={"paper_id": paper_id})
    from services.pdf_parser import extract_figures
    path = Path("data") / paper.file_path
    items = extract_figures(str(path))
    return {"items": items}


@router.get("/{paper_id}/figures/{xref}.png")
def get_figure_image(paper_id: str, xref: int, session: Session = Depends(get_session)):
    paper = PaperRepo(session).by_id(paper_id)
    if not paper:
        raise PaperNotFound(detail={"paper_id": paper_id})
    from services.pdf_parser import render_figure_png
    path = Path("data") / paper.file_path
    png = render_figure_png(str(path), xref)
    if png is None:
        raise PaperNotFound(detail={"reason": "figure image not found"})
    return Response(content=png, media_type="image/png", headers={"Cache-Control": "private, max-age=3600"})


@router.get("/{paper_id}/page/{page}/clip.png")
def get_page_clip_image(
    paper_id: str,
    page: int,
    cx0: float = 0.0,
    cy0: float = 0.0,
    cx1: float = 0.0,
    cy1: float = 0.0,
    session: Session = Depends(get_session),
):
    """Render the figure area ABOVE a caption bbox as PNG.

    Given caption bbox (cx0,cy0,cx1,cy1) in PDF points, clips a strip above
    the caption (where the figure typically sits) and renders it. Fallback
    for vector figures without an embedded image xref.
    """
    paper = PaperRepo(session).by_id(paper_id)
    if not paper:
        raise PaperNotFound(detail={"paper_id": paper_id})
    from services.pdf_parser import render_page_clip_png, figure_clip_bbox_for
    import fitz as _fitz
    path = Path("data") / paper.file_path
    clip = None
    if cx1 > cx0 and cy1 > cy0:
        doc = _fitz.open(str(path))
        try:
            page_h = doc[page - 1].rect.y1 if 1 <= page <= len(doc) else 842.0
        finally:
            doc.close()
        clip = figure_clip_bbox_for((cx0, cy0, cx1, cy1), page_h)
    png = render_page_clip_png(str(path), page, clip)
    if png is None:
        raise PaperNotFound(detail={"reason": "page clip render failed"})
    return Response(content=png, media_type="image/png", headers={"Cache-Control": "private, max-age=3600"})


@router.get("/{paper_id}/references")
def get_references(paper_id: str, session: Session = Depends(get_session)):
    """Extract numbered references from the paper's References/Bibliography section."""
    paper = PaperRepo(session).by_id(paper_id)
    if not paper:
        raise PaperNotFound(detail={"paper_id": paper_id})
    from services.pdf_parser import extract_references
    path = Path("data") / paper.file_path
    items = extract_references(str(path))
    return {"items": items}


@router.get("/{paper_id}/search")
def search_paper(paper_id: str, q: str = Query("", min_length=1), session: Session = Depends(get_session)):
    paper = PaperRepo(session).by_id(paper_id)
    if not paper:
        raise PaperNotFound(detail={"paper_id": paper_id})
    from services.pdf_parser import search_text
    path = Path("data") / paper.file_path
    results = search_text(str(path), q)
    return {"items": results, "total": len(results)}


@router.delete("/{paper_id}", status_code=204)
def delete_paper(paper_id: str, session: Session = Depends(get_session)):
    repo = PaperRepo(session)
    paper = repo.by_id(paper_id)
    if not paper:
        raise PaperNotFound(detail={"paper_id": paper_id})
    abs_path = Path("data") / paper.file_path
    repo.delete(paper_id)
    abs_path.unlink(missing_ok=True)
    return Response(status_code=204)
