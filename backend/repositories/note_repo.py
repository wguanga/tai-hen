"""Note CRUD."""
from sqlmodel import Session, select
from models import Note, utcnow


class NoteRepo:
    def __init__(self, session: Session):
        self.s = session

    def by_id(self, nid: str) -> Note | None:
        return self.s.get(Note, nid)

    def create(self, data: dict) -> Note:
        n = Note(**data)
        self.s.add(n)
        self.s.commit()
        self.s.refresh(n)
        return n

    def update(self, nid: str, patch: dict) -> Note | None:
        n = self.s.get(Note, nid)
        if not n:
            return None
        for k, v in patch.items():
            if v is not None:
                setattr(n, k, v)
        n.updated_at = utcnow()
        self.s.add(n)
        self.s.commit()
        self.s.refresh(n)
        return n

    def delete(self, nid: str) -> bool:
        n = self.s.get(Note, nid)
        if not n:
            return False
        self.s.delete(n)
        self.s.commit()
        return True

    def search_global(self, query: str, limit: int = 50) -> list[Note]:
        """Search note title + content across all papers."""
        stmt = (
            select(Note)
            .where(
                (Note.title.ilike(f"%{query}%")) | (Note.content.ilike(f"%{query}%"))
            )
            .order_by(Note.created_at.desc())
            .limit(limit)
        )
        return list(self.s.exec(stmt).all())

    def list_for_paper(
        self, paper_id: str, highlight_id: str | None = None, source: str | None = None
    ) -> list[Note]:
        stmt = select(Note).where(Note.paper_id == paper_id)
        if highlight_id is not None:
            stmt = stmt.where(Note.highlight_id == highlight_id)
        if source is not None:
            stmt = stmt.where(Note.source == source)
        stmt = stmt.order_by(Note.created_at.desc())
        return list(self.s.exec(stmt).all())
