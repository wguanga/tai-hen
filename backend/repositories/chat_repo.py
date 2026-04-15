"""Chat message CRUD."""
from sqlmodel import Session, select
from models import Chat


class ChatRepo:
    def __init__(self, session: Session):
        self.s = session

    def create(self, data: dict) -> Chat:
        c = Chat(**data)
        self.s.add(c)
        self.s.commit()
        self.s.refresh(c)
        return c

    def list_for_paper(self, paper_id: str) -> list[Chat]:
        stmt = (
            select(Chat)
            .where(Chat.paper_id == paper_id)
            .order_by(Chat.created_at)
        )
        return list(self.s.exec(stmt).all())
