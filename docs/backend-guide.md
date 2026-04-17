# Backend Guide — 后端开发指南

> Python 3.11+ / FastAPI / SQLModel / PyMuPDF / anyio-async。

---

## 1. 目录结构（权威版）

```
backend/
├── main.py              ← FastAPI 装配、中间件、生命周期
├── db.py                ← engine、session、init_db、migrate
├── deps.py              ← FastAPI Depends 依赖项（get_session、get_config）
├── errors.py            ← 自定义异常 + exception handler
├── logging_conf.py      ← 日志 dictConfig
├── models.py            ← SQLModel 表
├── schemas.py           ← Pydantic DTO
├── routers/
│   ├── __init__.py
│   ├── papers.py
│   ├── highlights.py
│   ├── notes.py
│   ├── ai.py
│   └── config.py
├── services/
│   ├── __init__.py
│   ├── pdf_parser.py
│   ├── llm_service.py
│   ├── note_service.py
│   └── export_service.py
├── repositories/
│   ├── __init__.py
│   ├── base.py          ← 通用 CRUD 基类
│   ├── paper_repo.py
│   ├── highlight_repo.py
│   ├── note_repo.py
│   └── chat_repo.py
└── requirements.txt
```

---

## 2. 分层示例（papers 创建）

### 2.1 Router（只做 HTTP 边界）

```python
# routers/papers.py
from fastapi import APIRouter, UploadFile, File, Depends
from schemas import PaperRead
from services.paper_service import upload_paper
from deps import get_session

router = APIRouter(tags=["papers"])

@router.post("/upload", response_model=PaperRead)
async def upload(file: UploadFile = File(...), session = Depends(get_session)):
    return await upload_paper(session, file)
```

### 2.2 Service（业务逻辑）

```python
# services/paper_service.py
from errors import FileTooLarge, InvalidPdf
from repositories.paper_repo import PaperRepo
from services.pdf_parser import extract_metadata
import aiofiles, hashlib, uuid
from pathlib import Path

MAX_SIZE = 100 * 1024 * 1024

async def upload_paper(session, file):
    # 1) 大小检查
    contents = await file.read()
    if len(contents) > MAX_SIZE:
        raise FileTooLarge()

    # 2) 哈希去重
    h = hashlib.sha256(contents).hexdigest()
    repo = PaperRepo(session)
    existing = repo.by_hash(h)
    if existing:
        return existing

    # 3) 写盘
    fid = str(uuid.uuid4())
    path = Path("data/papers") / f"{fid}.pdf"
    path.parent.mkdir(parents=True, exist_ok=True)
    async with aiofiles.open(path, "wb") as f:
        await f.write(contents)

    # 4) 解析元数据
    try:
        meta = extract_metadata(str(path))
    except Exception:
        path.unlink(missing_ok=True)
        raise InvalidPdf()

    # 5) 入库
    paper = repo.create({
        "id": fid,
        "title": meta["title"],
        "authors": meta["authors"],
        "total_pages": meta["total_pages"],
        "file_path": f"papers/{fid}.pdf",
        "file_size": len(contents),
        "file_hash": h,
    })
    return paper
```

### 2.3 Repository（单表 CRUD）

```python
# repositories/paper_repo.py
from sqlmodel import Session, select
from models import Paper
import json

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
        self.s.add(p); self.s.commit(); self.s.refresh(p)
        return p

    def list(self, limit=50, offset=0, q: str | None = None):
        stmt = select(Paper).order_by(Paper.created_at.desc())
        if q:
            stmt = stmt.where(Paper.title.like(f"%{q}%"))
        return self.s.exec(stmt.limit(limit).offset(offset)).all()
```

🔴 **repository 只碰一张表**（除非纯查询 join）。跨表写入在 service 做。

---

## 3. 错误处理（统一格式）🔴

### 3.1 定义异常

```python
# errors.py
class AppError(Exception):
    code: str = "INTERNAL_ERROR"
    http: int = 500
    def __init__(self, message: str = "", detail: dict | None = None):
        self.message = message or self.__class__.__doc__ or ""
        self.detail = detail or {}

class PaperNotFound(AppError): code="PAPER_NOT_FOUND"; http=404
class HighlightNotFound(AppError): code="HIGHLIGHT_NOT_FOUND"; http=404
class NoteNotFound(AppError): code="NOTE_NOT_FOUND"; http=404
class FileTooLarge(AppError): code="FILE_TOO_LARGE"; http=413
class InvalidPdf(AppError): code="INVALID_PDF"; http=400
class LlmConfigMissing(AppError): code="LLM_CONFIG_MISSING"; http=400
class LlmUpstreamError(AppError): code="LLM_UPSTREAM_ERROR"; http=502
class LlmRateLimited(AppError): code="LLM_RATE_LIMITED"; http=429
```

### 3.2 注册 handler

```python
# main.py
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from errors import AppError

@app.exception_handler(AppError)
async def app_error_handler(_req: Request, exc: AppError):
    return JSONResponse(
        status_code=exc.http,
        content={"error": {"code": exc.code, "message": exc.message, "detail": exc.detail}},
    )

@app.exception_handler(Exception)
async def unknown_error_handler(_req: Request, exc: Exception):
    logger.exception("unhandled")
    return JSONResponse(
        status_code=500,
        content={"error": {"code": "INTERNAL_ERROR", "message": "Internal server error"}},
    )
```

🔴 **所有业务分支 raise `AppError` 子类**，别直接 `raise HTTPException`。

---

## 4. LLM 流式：取消传播 🔴

用户关闭窗口或切论文时，前端 abort。FastAPI 通过 `request.is_disconnected()` 感知。

```python
# routers/ai.py
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
import json, anyio

router = APIRouter(tags=["ai"])

async def sse_gen(request: Request, text_stream, on_done):
    full = []
    try:
        async for chunk in text_stream:
            if await request.is_disconnected():
                break
            full.append(chunk)
            yield f"data: {json.dumps({'type':'chunk','text':chunk}, ensure_ascii=False)}\n\n"
        yield "data: " + json.dumps({"type":"done"}) + "\n\n"
    except Exception as e:
        yield "data: " + json.dumps({"type":"error","code":"LLM_UPSTREAM_ERROR","message":str(e)}) + "\n\n"
    finally:
        await on_done("".join(full))    # 保存完整响应到 DB

@router.post("/explain")
async def explain(req: Request, body: ExplainRequest, session = Depends(get_session)):
    # ... 构造 messages, 保存 user turn 到 chats
    stream = stream_llm(messages, system_prompt=SYSTEM_PROMPTS[f"explain_{body.level}"])
    async def on_done(full_text: str):
        # 保存 assistant turn
        ...
    return StreamingResponse(
        sse_gen(req, stream, on_done),
        media_type="text/event-stream",
        headers={"Cache-Control":"no-cache","X-Accel-Buffering":"no"}
    )
```

---

## 5. 日志配置 🟡

```python
# logging_conf.py
import logging, logging.config, sys

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "std": {"format": "%(asctime)s [%(levelname)s] %(name)s :: %(message)s"},
    },
    "handlers": {
        "console": {"class": "logging.StreamHandler", "stream": sys.stderr, "formatter": "std"},
        "file": {
            "class": "logging.handlers.RotatingFileHandler",
            "filename": "data/logs/app.log",
            "maxBytes": 5_000_000, "backupCount": 3, "formatter": "std",
        },
    },
    "root": {"level": "INFO", "handlers": ["console", "file"]},
    "loggers": {
        "uvicorn.access": {"level": "WARNING"},  # 减噪
        "sqlalchemy.engine": {"level": "WARNING"},
    },
}

def setup():
    import os; os.makedirs("data/logs", exist_ok=True)
    logging.config.dictConfig(LOGGING)
```

在 `main.py` startup 中调用 `setup()`。

---

## 6. 依赖注入（deps.py）

```python
# deps.py
from sqlmodel import Session
from db import engine

def get_session():
    with Session(engine) as s:
        yield s

def get_config():
    from services.config_service import load_config
    return load_config()
```

🔴 **用 `Depends(get_session)`**，不要在路由里 `Session(engine)` 手建。否则难统一事务。

---

## 7. PDF 解析扩展

```python
# services/pdf_parser.py  (在 CLAUDE.md 基础上补充)

def get_all_text(pdf_path: str, max_chars: int = 100_000) -> str:
    """整篇文本，给 summarize 用。超过 max_chars 截断。"""
    doc = fitz.open(pdf_path)
    parts = []
    used = 0
    for page in doc:
        t = page.get_text()
        if used + len(t) > max_chars:
            parts.append(t[: max_chars - used])
            break
        parts.append(t)
        used += len(t)
    return "\n".join(parts)

def extract_year(meta_date: str | None, text: str) -> int | None:
    """从 PDF metadata 或正文头部提取年份。"""
    import re
    if meta_date:
        m = re.search(r"(19|20)\d{2}", meta_date)
        if m: return int(m.group(0))
    m = re.search(r"(19|20)\d{2}", text[:2000])
    return int(m.group(0)) if m else None
```

---

## 8. 上传大文件的流式处理 🟡

100MB PDF 全读入内存是 100MB。可优化为流式写盘 + 分块哈希：

```python
async def save_stream(file, dest: Path, chunk_size = 1 << 20):
    import hashlib
    h = hashlib.sha256()
    total = 0
    async with aiofiles.open(dest, "wb") as f:
        while True:
            chunk = await file.read(chunk_size)
            if not chunk: break
            total += len(chunk)
            if total > MAX_SIZE:
                await f.close(); dest.unlink(missing_ok=True)
                raise FileTooLarge()
            h.update(chunk)
            await f.write(chunk)
    return h.hexdigest(), total
```

---

## 9. 后台任务（可选）🟢

若将来要做：提取 PDF 缩略图、索引全文。用 FastAPI `BackgroundTasks`：

```python
@router.post("/upload")
async def upload(bg: BackgroundTasks, ...):
    paper = await upload_paper(...)
    bg.add_task(generate_thumbnail, paper.id)  # 不阻塞响应
    return paper
```

---

## 10. 测试策略 🟡

- `tests/test_pdf_parser.py`：固定样本 PDF 校验 extract_metadata
- `tests/test_highlights.py`：用 httpx `AsyncClient` 打端点
- LLM 测试**不打真实 API**：用 `monkeypatch` 替 `stream_llm` 为固定生成器

一个最小夹具：
```python
# tests/conftest.py
@pytest.fixture
def client(tmp_path):
    import os; os.environ["DATA_DIR"] = str(tmp_path)
    from main import app
    from fastapi.testclient import TestClient
    return TestClient(app)
```

---

## 11. 启动顺序（main.py 完整装配）

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

@asynccontextmanager
async def lifespan(app: FastAPI):
    from logging_conf import setup; setup()
    from db import init_db; init_db()
    yield
    # shutdown hooks（关连接池等）

app = FastAPI(title="Paper Reader API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "file://"],
    allow_methods=["*"], allow_headers=["*"],
)

from routers import papers, highlights, notes, ai, config as config_router
app.include_router(papers.router, prefix="/papers")
app.include_router(highlights.router, prefix="/papers")
app.include_router(notes.router, prefix="/papers")
app.include_router(ai.router, prefix="/ai")
app.include_router(config_router.router, prefix="/config")

from errors import AppError
from fastapi.responses import JSONResponse
@app.exception_handler(AppError)
async def _h(_, e): return JSONResponse(status_code=e.http, content={"error":{"code":e.code,"message":e.message,"detail":e.detail}})
```

🟡 **用 `lifespan` 而不是 `@on_event("startup")`**（后者已废弃）。
