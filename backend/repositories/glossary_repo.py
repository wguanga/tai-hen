"""Glossary CRUD."""
from __future__ import annotations

from sqlmodel import Session, select

from models import GlossaryEntry


class GlossaryRepo:
    def __init__(self, session: Session):
        self.s = session

    def by_id(self, gid: str) -> GlossaryEntry | None:
        return self.s.get(GlossaryEntry, gid)

    def create(self, data: dict) -> GlossaryEntry:
        g = GlossaryEntry(**data)
        self.s.add(g)
        self.s.commit()
        self.s.refresh(g)
        return g

    def update(self, gid: str, patch: dict) -> GlossaryEntry | None:
        g = self.s.get(GlossaryEntry, gid)
        if not g:
            return None
        for k, v in patch.items():
            if v is not None:
                setattr(g, k, v)
        self.s.add(g)
        self.s.commit()
        self.s.refresh(g)
        return g

    def delete(self, gid: str) -> bool:
        g = self.s.get(GlossaryEntry, gid)
        if not g:
            return False
        self.s.delete(g)
        self.s.commit()
        return True

    def list(self, q: str | None = None, paper_id: str | None = None, limit: int = 100) -> list[GlossaryEntry]:
        stmt = select(GlossaryEntry)
        if q:
            like = f"%{q}%"
            stmt = stmt.where((GlossaryEntry.term.ilike(like)) | (GlossaryEntry.definition.ilike(like)))
        if paper_id:
            stmt = stmt.where(GlossaryEntry.paper_id == paper_id)
        stmt = stmt.order_by(GlossaryEntry.term).limit(limit)
        return list(self.s.exec(stmt).all())

    def find_by_term(self, term: str) -> GlossaryEntry | None:
        stmt = select(GlossaryEntry).where(GlossaryEntry.term == term)
        return self.s.exec(stmt).first()
