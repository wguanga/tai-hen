"""Note endpoints + Markdown export."""
from fastapi import APIRouter, Depends, Query, Response
from fastapi.responses import PlainTextResponse
from sqlmodel import Session

from deps import get_session
from errors import NoteNotFound, PaperNotFound
from repositories.note_repo import NoteRepo
from repositories.paper_repo import PaperRepo
from schemas import NoteCreate, NoteList, NoteRead, NoteUpdate
from services.export_service import export_markdown

router = APIRouter(tags=["notes"])


def _to_read(n) -> NoteRead:
    return NoteRead(
        id=n.id,
        paper_id=n.paper_id,
        highlight_id=n.highlight_id,
        title=n.title,
        content=n.content,
        source=n.source,
        created_at=n.created_at,
        updated_at=n.updated_at,
    )


@router.post("/{paper_id}/notes", response_model=NoteRead)
def create_note(paper_id: str, body: NoteCreate, session: Session = Depends(get_session)):
    if not PaperRepo(session).by_id(paper_id):
        raise PaperNotFound(detail={"paper_id": paper_id})
    n = NoteRepo(session).create(
        {
            "paper_id": paper_id,
            "highlight_id": body.highlight_id,
            "title": body.title,
            "content": body.content,
            "source": body.source,
        }
    )
    return _to_read(n)


@router.get("/{paper_id}/notes", response_model=NoteList)
def list_notes(
    paper_id: str,
    highlight_id: str | None = Query(None),
    source: str | None = Query(None),
    session: Session = Depends(get_session),
):
    if not PaperRepo(session).by_id(paper_id):
        raise PaperNotFound(detail={"paper_id": paper_id})
    items = NoteRepo(session).list_for_paper(paper_id, highlight_id=highlight_id, source=source)
    return NoteList(items=[_to_read(n) for n in items])


@router.put("/{paper_id}/notes/{nid}", response_model=NoteRead)
def update_note(paper_id: str, nid: str, body: NoteUpdate, session: Session = Depends(get_session)):
    repo = NoteRepo(session)
    existing = repo.by_id(nid)
    if not existing or existing.paper_id != paper_id:
        raise NoteNotFound(detail={"note_id": nid})
    patch = body.model_dump(exclude_unset=True)
    updated = repo.update(nid, patch)
    return _to_read(updated)


@router.delete("/{paper_id}/notes/{nid}", status_code=204)
def delete_note(paper_id: str, nid: str, session: Session = Depends(get_session)):
    repo = NoteRepo(session)
    existing = repo.by_id(nid)
    if not existing or existing.paper_id != paper_id:
        raise NoteNotFound(detail={"note_id": nid})
    repo.delete(nid)
    return Response(status_code=204)


@router.get("/{paper_id}/export")
def export_paper(paper_id: str, session: Session = Depends(get_session)):
    paper = PaperRepo(session).by_id(paper_id)
    if not paper:
        raise PaperNotFound(detail={"paper_id": paper_id})
    md = export_markdown(session, paper)
    safe_title = "".join(c if c.isalnum() or c in "-_" else "_" for c in paper.title)[:60]
    return PlainTextResponse(
        content=md,
        media_type="text/markdown; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{safe_title}-notes.md"',
        },
    )
