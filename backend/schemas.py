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


class SuggestQuestionsRequest(BaseModel):
    paper_id: str


class TagHighlightRequest(BaseModel):
    paper_id: str
    text: str = Field(min_length=2, max_length=2000)
    page: Optional[int] = None


class FigureInsightRequest(BaseModel):
    paper_id: str
    number: int
    kind: Literal["figure", "table"] = "figure"
    caption: str
    page: int


class InterpretCommandRequest(BaseModel):
    query: str = Field(min_length=1, max_length=400)
    paper_id: Optional[str] = None


class ConfusionHelpRequest(BaseModel):
    paper_id: str
    page: int


class QuickTranslateRequest(BaseModel):
    text: str = Field(min_length=1, max_length=400)


class SemanticSearchRequest(BaseModel):
    paper_id: str
    query: str = Field(min_length=2, max_length=200)


class CompileNotesRequest(BaseModel):
    paper_id: str


class ReadingQuestionsRequest(BaseModel):
    paper_id: str
    mode: Literal["preread", "comprehension"] = "preread"


class CheckAnswerRequest(BaseModel):
    paper_id: str
    question: str = Field(min_length=3, max_length=500)
    user_answer: str = Field(min_length=1, max_length=2000)


class FormatNoteRequest(BaseModel):
    text: str = Field(min_length=3, max_length=5000)


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


class ExplainFigureRequest(BaseModel):
    paper_id: str
    number: int
    page: int
    kind: Literal["figure", "table"] = "figure"
    caption: str
    image_xref: Optional[int] = None
    # Fallback for vector figures (no xref): bbox of the caption in PDF points.
    # Backend clips the page above this bbox to capture the figure area.
    caption_bbox: Optional[list[float]] = None


class ComparePapersRequest(BaseModel):
    paper_ids: list[str] = Field(min_length=2, max_length=5)


class ChatRequest(BaseModel):
    paper_id: str
    highlight_id: Optional[str] = None
    messages: list[ChatMessage]


class ConfigRead(BaseModel):
    provider: Literal["openai", "anthropic", "ollama"] = "openai"
    model: str = "gpt-4o-mini"
    has_api_key: bool = False
    api_key_preview: str = ""
    base_url: str = ""
    ollama_model: str = "qwen2.5:14b"
    supports_vision: bool = False
    vision_source: Literal["cache", "heuristic"] = "heuristic"


class GlossaryCreate(BaseModel):
    term: str = Field(min_length=1, max_length=120)
    definition: str = Field(min_length=1)
    paper_id: Optional[str] = None
    source: Literal["manual", "summary", "ai_explain"] = "manual"


class GlossaryUpdate(BaseModel):
    term: Optional[str] = None
    definition: Optional[str] = None


class GlossaryRead(BaseModel):
    id: str
    term: str
    definition: str
    paper_id: Optional[str] = None
    source: str
    created_at: str


class GlossaryList(BaseModel):
    items: list[GlossaryRead]


class ConfigWrite(BaseModel):
    provider: Literal["openai", "anthropic", "ollama"] = "openai"
    model: str = "gpt-4o-mini"
    api_key: Optional[str] = None
    base_url: str = ""
    ollama_model: str = "qwen2.5:14b"
