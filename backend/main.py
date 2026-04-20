"""FastAPI application entry. See .claude/backend-guide.md#11-启动顺序."""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from errors import AppError
from logging_conf import setup as setup_logging

logger = logging.getLogger("paper_reader")


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    from db import init_db
    init_db()
    logger.info("app.started")
    yield
    logger.info("app.stopping")


app = FastAPI(title="Paper Reader API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "file://",
        "null",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(AppError)
async def app_error_handler(_req: Request, exc: AppError):
    return JSONResponse(
        status_code=exc.http,
        content={"error": {"code": exc.code, "message": exc.message, "detail": exc.detail}},
    )


@app.exception_handler(Exception)
async def unhandled_error_handler(_req: Request, exc: Exception):
    logger.exception("unhandled_error")
    return JSONResponse(
        status_code=500,
        content={"error": {"code": "INTERNAL_ERROR", "message": "Internal server error"}},
    )


from routers import papers, highlights, notes, ai, search, glossary, folders, config as config_router

app.include_router(papers.router, prefix="/papers")
app.include_router(highlights.router, prefix="/papers")
app.include_router(notes.router, prefix="/papers")
app.include_router(ai.router, prefix="/ai")
app.include_router(search.router, prefix="/search")
app.include_router(glossary.router, prefix="/glossary")
app.include_router(folders.router, prefix="/folders")
app.include_router(config_router.router, prefix="/config")


@app.get("/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=False)
