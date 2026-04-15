"""Paper endpoints."""
import json
from pathlib import Path

from fastapi import APIRouter, Depends, File, Query, Response, UploadFile
from fastapi.responses import FileResponse
from sqlmodel import Session

from deps import get_session
from errors import PaperNotFound
from repositories.paper_repo import PaperRepo
from schemas import PaperList, PaperRead
from services.paper_service import upload_paper

router = APIRouter(tags=["papers"])


def _to_read(paper) -> PaperRead:
    try:
        authors = json.loads(paper.authors) if paper.authors else []
    except json.JSONDecodeError:
        authors = []
    return PaperRead(
        id=paper.id,
        title=paper.title,
        authors=authors,
        year=paper.year,
        file_path=paper.file_path,
        total_pages=paper.total_pages,
        file_size=paper.file_size,
        created_at=paper.created_at,
    )


@router.post("/upload", response_model=PaperRead)
async def upload(file: UploadFile = File(...), session: Session = Depends(get_session)):
    paper = await upload_paper(session, file)
    return _to_read(paper)


@router.get("", response_model=PaperList)
def list_papers(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    q: str | None = Query(None),
    session: Session = Depends(get_session),
):
    items, total = PaperRepo(session).list(limit=limit, offset=offset, q=q)
    return PaperList(items=[_to_read(p) for p in items], total=total)


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
