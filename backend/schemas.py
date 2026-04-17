"""Pydantic DTOs for request/response. Separate from SQLModel tables."""
from typing import Optional, Literal, Any
from pydantic import BaseModel, Field


HighlightColor = Literal["yellow", "blue", "green", "purple"]
NoteSource = Literal["manual", "ai_answer", "ai_summary"]
ExplainLevel = Literal["simple", "technical"]


class PaperRead(BaseModel):
    id: str
    title: str
    authors: list[str]
    year: Optional[int] = None
    file_path: str
    total_pages: int
    file_size: Optional[int] = None
    tags: list[str] = []
    created_at: str


class PaperList(BaseModel):
    items: list[PaperRead]
    total: int


class PaperUpdate(BaseModel):
    tags: Optional[list[str]] = None
    title: Optional[str] = None


class HighlightRectIn(BaseModel):
    x: float
    y: float
    width: float
    height: float


class HighlightPositionIn(BaseModel):
    x: float
    y: float
    width: float
    height: float
    rects: list[HighlightRectIn] = Field(default_factory=list)


class HighlightCreate(BaseModel):
    text: str = Field(min_length=1, max_length=5000)
    color: HighlightColor
    page: int = Field(ge=1)
    position: HighlightPositionIn
    note: Optional[str] = None


class HighlightUpdate(BaseModel):
    color: Optional[HighlightColor] = None
    note: Optional[str] = None


class HighlightRead(BaseModel):
    id: str
    paper_id: str
    text: str
    color: HighlightColor
    page: int
    position: dict
    note: Optional[str] = None
    created_at: str


class HighlightList(BaseModel):
    items: list[HighlightRead]


class NoteCreate(BaseModel):
    highlight_id: Optional[str] = None
    title: Optional[str] = None
    content: str = Field(min_length=1)
    source: NoteSource


class NoteUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None


class NoteRead(BaseModel):
    id: str
    paper_id: str
    highlight_id: Optional[str] = None
    title: Optional[str] = None
    content: str
    source: NoteSource
    created_at: str
    updated_at: str


class NoteList(BaseModel):
    items: list[NoteRead]


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ExplainRequest(BaseModel):
    paper_id: str
    highlight_id: Optional[str] = None
    text: str
    context: Optional[str] = None
    page: Optional[int] = None
    level: ExplainLevel = "simple"


class TranslateRequest(BaseModel):
    paper_id: str
    text: str


class SummarizeRequest(BaseModel):
    paper_id: str


class ExplainSectionRequest(BaseModel):
    paper_id: str
    title: str
    start_page: int
    end_page: Optional[int] = None


class ChatRequest(BaseModel):
    paper_id: str
    highlight_id: Optional[str] = None
    messages: list[ChatMessage]


class ConfigRead(BaseModel):
    provider: Literal["openai", "anthropic", "ollama"] = "openai"
    model: str = "gpt-4o-mini"
    has_api_key: bool = False
    base_url: str = ""
    ollama_model: str = "qwen2.5:14b"


class ConfigWrite(BaseModel):
    provider: Literal["openai", "anthropic", "ollama"] = "openai"
    model: str = "gpt-4o-mini"
    api_key: Optional[str] = None
    base_url: str = ""
    ollama_model: str = "qwen2.5:14b"
