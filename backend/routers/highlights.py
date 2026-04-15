"""Highlight endpoints. Mounted under /papers prefix."""
import json

from fastapi import APIRouter, Depends, Query, Response
from sqlmodel import Session

from deps import get_session
from errors import HighlightNotFound, PaperNotFound
from repositories.highlight_repo import HighlightRepo
from repositories.paper_repo import PaperRepo
from schemas import HighlightCreate, HighlightList, HighlightRead, HighlightUpdate

router = APIRouter(tags=["highlights"])


def _to_read(h) -> HighlightRead:
    try:
        position = json.loads(h.position) if isinstance(h.position, str) else h.position
    except json.JSONDecodeError:
        position = {}
    return HighlightRead(
        id=h.id,
        paper_id=h.paper_id,
        text=h.text,
        color=h.color,
        page=h.page,
        position=position,
        note=h.note,
        created_at=h.created_at,
    )


@router.post("/{paper_id}/highlights", response_model=HighlightRead)
def create_highlight(
    paper_id: str, body: HighlightCreate, session: Session = Depends(get_session)
):
    if not PaperRepo(session).by_id(paper_id):
        raise PaperNotFound(detail={"paper_id": paper_id})
    h = HighlightRepo(session).create(
        {
            "paper_id": paper_id,
            "text": body.text,
            "color": body.color,
            "page": body.page,
            "position": body.position.model_dump(),
            "note": body.note,
        }
    )
    return _to_read(h)


@router.get("/{paper_id}/highlights", response_model=HighlightList)
def list_highlights(
    paper_id: str,
    page: int | None = Query(None),
    color: str | None = Query(None),
    session: Session = Depends(get_session),
):
    if not PaperRepo(session).by_id(paper_id):
        raise PaperNotFound(detail={"paper_id": paper_id})
    items = HighlightRepo(session).list_for_paper(paper_id, page=page, color=color)
    return HighlightList(items=[_to_read(h) for h in items])


@router.put("/{paper_id}/highlights/{hid}", response_model=HighlightRead)
def update_highlight(
    paper_id: str, hid: str, body: HighlightUpdate, session: Session = Depends(get_session)
):
    repo = HighlightRepo(session)
    existing = repo.by_id(hid)
    if not existing or existing.paper_id != paper_id:
        raise HighlightNotFound(detail={"highlight_id": hid})
    patch = body.model_dump(exclude_unset=True)
    updated = repo.update(hid, patch)
    return _to_read(updated)


@router.delete("/{paper_id}/highlights/{hid}", status_code=204)
def delete_highlight(paper_id: str, hid: str, session: Session = Depends(get_session)):
    repo = HighlightRepo(session)
    existing = repo.by_id(hid)
    if not existing or existing.paper_id != paper_id:
        raise HighlightNotFound(detail={"highlight_id": hid})
    repo.delete(hid)
    return Response(status_code=204)
