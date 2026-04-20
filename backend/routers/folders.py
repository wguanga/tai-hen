"""Folder endpoints — create / list / update / delete + paper-count rollup."""
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from deps import get_session
from repositories.folder_repo import FolderRepo
from repositories.paper_repo import PaperRepo
from schemas import FolderCreate, FolderList, FolderRead, FolderUpdate

router = APIRouter(tags=["folders"])


def _to_read(f, count: int) -> FolderRead:
    return FolderRead(
        id=f.id,
        name=f.name,
        color=f.color,
        sort_order=f.sort_order,
        paper_count=count,
        created_at=f.created_at,
    )


@router.get("", response_model=FolderList)
def list_folders(session: Session = Depends(get_session)):
    repo = FolderRepo(session)
    counts = PaperRepo(session).counts_by_folder()
    folders = repo.list()
    items = [_to_read(f, counts.get(f.id, 0)) for f in folders]
    return FolderList(items=items)


@router.post("", response_model=FolderRead)
def create_folder(body: FolderCreate, session: Session = Depends(get_session)):
    f = FolderRepo(session).create(body.model_dump())
    return _to_read(f, 0)


@router.put("/{fid}", response_model=FolderRead)
def update_folder(fid: str, body: FolderUpdate, session: Session = Depends(get_session)):
    # model_dump(exclude_unset=True) drops fields the caller didn't provide,
    # so we only overwrite what they explicitly asked to change.
    patch = body.model_dump(exclude_unset=True)
    f = FolderRepo(session).update(fid, patch)
    if not f:
        raise HTTPException(status_code=404, detail={"error": {"code": "FOLDER_NOT_FOUND", "message": "folder not found"}})
    count = PaperRepo(session).counts_by_folder().get(fid, 0)
    return _to_read(f, count)


@router.delete("/{fid}", status_code=204)
def delete_folder(fid: str, session: Session = Depends(get_session)):
    ok = FolderRepo(session).delete(fid)
    if not ok:
        raise HTTPException(status_code=404, detail={"error": {"code": "FOLDER_NOT_FOUND", "message": "folder not found"}})
    return None
