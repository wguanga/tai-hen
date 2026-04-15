"""SQLModel table definitions. See .claude/db-schema.md."""
import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlmodel import SQLModel, Field


def new_id() -> str:
    return str(uuid.uuid4())


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


class Paper(SQLModel, table=True):
    __tablename__ = "papers"
    id: str = Field(default_factory=new_id, primary_key=True)
    title: str
    authors: str = "[]"
    year: Optional[int] = None
    file_path: str = Field(unique=True)
    total_pages: int
    file_size: Optional[int] = None
    file_hash: Optional[str] = Field(default=None, index=True)
    created_at: str = Field(default_factory=utcnow)


class Highlight(SQLModel, table=True):
    __tablename__ = "highlights"
    id: str = Field(default_factory=new_id, primary_key=True)
    paper_id: str = Field(foreign_key="papers.id", index=True)
    text: str
    color: str
    page: int = Field(index=True)
    position: str
    note: Optional[str] = None
    created_at: str = Field(default_factory=utcnow)


class Note(SQLModel, table=True):
    __tablename__ = "notes"
    id: str = Field(default_factory=new_id, primary_key=True)
    paper_id: str = Field(foreign_key="papers.id", index=True)
    highlight_id: Optional[str] = Field(default=None, foreign_key="highlights.id", index=True)
    title: Optional[str] = None
    content: str
    source: str
    created_at: str = Field(default_factory=utcnow)
    updated_at: str = Field(default_factory=utcnow)


class Chat(SQLModel, table=True):
    __tablename__ = "chats"
    id: str = Field(default_factory=new_id, primary_key=True)
    paper_id: str = Field(foreign_key="papers.id", index=True)
    highlight_id: Optional[str] = Field(default=None, foreign_key="highlights.id")
    role: str
    content: str
    token_count: Optional[int] = None
    created_at: str = Field(default_factory=utcnow)
