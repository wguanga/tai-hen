"""Glossary endpoints (cross-paper term library)."""
from fastapi import APIRouter, Depends, Query, Response
from sqlmodel import Session

from deps import get_session
from errors import AppError
from repositories.glossary_repo import GlossaryRepo
from schemas import GlossaryCreate, GlossaryList, GlossaryRead, GlossaryUpdate

router = APIRouter(tags=["glossary"])


class GlossaryNotFound(AppError):
    """术语不存在"""
    code = "GLOSSARY_NOT_FOUND"
    http = 404


def _to_read(g) -> GlossaryRead:
    return GlossaryRead(
        id=g.id,
        term=g.term,
        definition=g.definition,
        paper_id=g.paper_id,
        source=g.source,
        created_at=g.created_at,
    )


@router.post("", response_model=GlossaryRead)
def create_entry(body: GlossaryCreate, session: Session = Depends(get_session)):
    repo = GlossaryRepo(session)
    # Upsert by term — if exists, update definition
    existing = repo.find_by_term(body.term)
    if existing:
        updated = repo.update(existing.id, {
            "definition": body.definition,
            "paper_id": body.paper_id,
            "source": body.source,
        })
        return _to_read(updated)
    g = repo.create(body.model_dump())
    return _to_read(g)


@router.get("", response_model=GlossaryList)
def list_entries(
    q: str | None = Query(None),
    paper_id: str | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
    session: Session = Depends(get_session),
):
    items = GlossaryRepo(session).list(q=q, paper_id=paper_id, limit=limit)
    return GlossaryList(items=[_to_read(g) for g in items])


@router.put("/{gid}", response_model=GlossaryRead)
def update_entry(gid: str, body: GlossaryUpdate, session: Session = Depends(get_session)):
    repo = GlossaryRepo(session)
    if not repo.by_id(gid):
        raise GlossaryNotFound(detail={"id": gid})
    updated = repo.update(gid, body.model_dump(exclude_unset=True))
    return _to_read(updated)


@router.delete("/{gid}", status_code=204)
def delete_entry(gid: str, session: Session = Depends(get_session)):
    repo = GlossaryRepo(session)
    if not repo.by_id(gid):
        raise GlossaryNotFound(detail={"id": gid})
    repo.delete(gid)
    return Response(status_code=204)
