"""Folder CRUD. Single-table access."""
from __future__ import annotations

from sqlmodel import Session, select
from models import Folder, Paper


class FolderRepo:
    def __init__(self, session: Session):
        self.s = session

    def by_id(self, fid: str) -> Folder | None:
        return self.s.get(Folder, fid)

    def create(self, data: dict) -> Folder:
        f = Folder(**data)
        self.s.add(f)
        self.s.commit()
        self.s.refresh(f)
        return f

    def list(self) -> list[Folder]:
        stmt = select(Folder).order_by(Folder.sort_order.asc(), Folder.created_at.asc())
        return list(self.s.exec(stmt).all())

    def update(self, fid: str, patch: dict) -> Folder | None:
        f = self.s.get(Folder, fid)
        if not f:
            return None
        for k, v in patch.items():
            if v is not None:
                setattr(f, k, v)
        self.s.add(f)
        self.s.commit()
        self.s.refresh(f)
        return f

    def delete(self, fid: str) -> bool:
        """Delete folder, orphaning any papers inside (folder_id → NULL).
        Papers themselves are preserved — losing a folder should never lose work.
        """
        f = self.s.get(Folder, fid)
        if not f:
            return False
        from sqlalchemy import text
        self.s.exec(text("UPDATE papers SET folder_id=NULL WHERE folder_id=:fid").bindparams(fid=fid))
        self.s.delete(f)
        self.s.commit()
        return True
