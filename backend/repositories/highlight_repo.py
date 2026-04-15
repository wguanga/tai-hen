"""Highlight CRUD."""
import json
from sqlmodel import Session, select
from models import Highlight


class HighlightRepo:
    def __init__(self, session: Session):
        self.s = session

    def by_id(self, hid: str) -> Highlight | None:
        return self.s.get(Highlight, hid)

    def create(self, data: dict) -> Highlight:
        if isinstance(data.get("position"), dict):
            data["position"] = json.dumps(data["position"], ensure_ascii=False)
        h = Highlight(**data)
        self.s.add(h)
        self.s.commit()
        self.s.refresh(h)
        return h

    def update(self, hid: str, patch: dict) -> Highlight | None:
        h = self.s.get(Highlight, hid)
        if not h:
            return None
        for k, v in patch.items():
            if v is not None:
                setattr(h, k, v)
        self.s.add(h)
        self.s.commit()
        self.s.refresh(h)
        return h

    def delete(self, hid: str) -> bool:
        h = self.s.get(Highlight, hid)
        if not h:
            return False
        self.s.delete(h)
        self.s.commit()
        return True

    def list_for_paper(
        self, paper_id: str, page: int | None = None, color: str | None = None
    ) -> list[Highlight]:
        stmt = select(Highlight).where(Highlight.paper_id == paper_id)
        if page is not None:
            stmt = stmt.where(Highlight.page == page)
        if color is not None:
            stmt = stmt.where(Highlight.color == color)
        stmt = stmt.order_by(Highlight.page, Highlight.created_at)
        return list(self.s.exec(stmt).all())
