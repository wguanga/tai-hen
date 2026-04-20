"""Paper CRUD. Single-table access."""
from __future__ import annotations

import json
from sqlmodel import Session, select
from models import Paper


class PaperRepo:
    def __init__(self, session: Session):
        self.s = session

    def by_id(self, pid: str) -> Paper | None:
        return self.s.get(Paper, pid)

    def by_hash(self, h: str) -> Paper | None:
        return self.s.exec(select(Paper).where(Paper.file_hash == h)).first()

    def create(self, data: dict) -> Paper:
        if isinstance(data.get("authors"), list):
            data["authors"] = json.dumps(data["authors"], ensure_ascii=False)
        p = Paper(**data)
        self.s.add(p)
        self.s.commit()
        self.s.refresh(p)
        return p

    def delete(self, pid: str) -> bool:
        p = self.s.get(Paper, pid)
        if not p:
            return False
        # SQLModel Field(foreign_key=...) does not emit ON DELETE CASCADE,
        # so delete children explicitly to keep FK constraints happy.
        from sqlalchemy import text
        self.s.exec(text("DELETE FROM chats WHERE paper_id = :pid").bindparams(pid=pid))
        self.s.exec(text("DELETE FROM notes WHERE paper_id = :pid").bindparams(pid=pid))
        self.s.exec(text("DELETE FROM highlights WHERE paper_id = :pid").bindparams(pid=pid))
        self.s.delete(p)
        self.s.commit()
        return True

    def list(
        self,
        limit: int = 50,
        offset: int = 0,
        q: str | None = None,
        tag: str | None = None,
        folder_id: str | None = None,
        unfiled: bool = False,
    ) -> tuple[list[Paper], int]:
        from sqlalchemy import func
        count_stmt = select(func.count()).select_from(Paper)
        if q:
            count_stmt = count_stmt.where(Paper.title.ilike(f"%{q}%"))
        if tag:
            # JSON array contains the tag string
            count_stmt = count_stmt.where(Paper.tags.like(f'%"{tag}"%'))
        if unfiled:
            count_stmt = count_stmt.where(Paper.folder_id.is_(None))
        elif folder_id:
            count_stmt = count_stmt.where(Paper.folder_id == folder_id)
        total = self.s.exec(count_stmt).one()

        stmt = select(Paper).order_by(Paper.created_at.desc())
        if q:
            stmt = stmt.where(Paper.title.ilike(f"%{q}%"))
        if tag:
            stmt = stmt.where(Paper.tags.like(f'%"{tag}"%'))
        if unfiled:
            stmt = stmt.where(Paper.folder_id.is_(None))
        elif folder_id:
            stmt = stmt.where(Paper.folder_id == folder_id)
        items = self.s.exec(stmt.limit(limit).offset(offset)).all()
        return list(items), int(total)

    def update(self, pid: str, patch: dict) -> Paper | None:
        p = self.s.get(Paper, pid)
        if not p:
            return None
        if "tags" in patch and isinstance(patch["tags"], list):
            patch["tags"] = json.dumps(patch["tags"], ensure_ascii=False)
        # For folder_id we WANT to allow explicit None (= "move to unfiled").
        # Caller passes {"folder_id": None} deliberately; we distinguish from
        # "caller didn't mention folder_id" by only putting present keys in patch.
        for k, v in patch.items():
            if k == "folder_id":
                setattr(p, k, v)
            elif v is not None:
                setattr(p, k, v)
        self.s.add(p)
        self.s.commit()
        self.s.refresh(p)
        return p

    def counts_by_folder(self) -> dict[str | None, int]:
        """Return {folder_id: count}. None key means unfiled."""
        from sqlalchemy import func
        stmt = select(Paper.folder_id, func.count()).group_by(Paper.folder_id)
        return {fid: int(n) for fid, n in self.s.exec(stmt).all()}

    def all_tags(self) -> list[str]:
        """Return sorted unique tag list across all papers."""
        seen: set[str] = set()
        for p in self.s.exec(select(Paper.tags)).all():
            try:
                for t in json.loads(p or "[]"):
                    if isinstance(t, str) and t.strip():
                        seen.add(t.strip())
            except json.JSONDecodeError:
                continue
        return sorted(seen)
