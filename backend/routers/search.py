"""Cross-paper search endpoints."""
from fastapi import APIRouter, Depends, Query
from sqlmodel import Session

from deps import get_session
from repositories.note_repo import NoteRepo
from repositories.paper_repo import PaperRepo

router = APIRouter(tags=["search"])


@router.get("/notes")
def search_notes(
    q: str = Query("", min_length=1),
    limit: int = Query(50, ge=1, le=200),
    session: Session = Depends(get_session),
):
    """Full-text search across all notes (title + content)."""
    notes = NoteRepo(session).search_global(q, limit=limit)
    # Enrich with paper title for UI linkage
    paper_repo = PaperRepo(session)
    paper_titles: dict[str, str] = {}
    for n in notes:
        if n.paper_id not in paper_titles:
            p = paper_repo.by_id(n.paper_id)
            paper_titles[n.paper_id] = p.title if p else "(已删除)"
    return {
        "items": [
            {
                "id": n.id,
                "paper_id": n.paper_id,
                "paper_title": paper_titles.get(n.paper_id, ""),
                "highlight_id": n.highlight_id,
                "title": n.title,
                "content": n.content,
                "source": n.source,
                "created_at": n.created_at,
            }
            for n in notes
        ],
        "total": len(notes),
    }
