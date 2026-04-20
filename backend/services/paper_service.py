"""Paper upload + lifecycle."""
import hashlib
import logging
import re
import uuid
from pathlib import Path

import aiofiles
from fastapi import UploadFile

from errors import AppError, FileTooLarge, InvalidPdf
from repositories.paper_repo import PaperRepo
from services.pdf_parser import extract_metadata

logger = logging.getLogger(__name__)

MAX_SIZE = 100 * 1024 * 1024
PAPERS_DIR = Path("data/papers")


class UrlImportFailed(AppError):
    """Could not fetch a valid PDF from the given URL."""
    code = "URL_IMPORT_FAILED"
    http = 400


ARXIV_ABS_RE = re.compile(r"arxiv\.org/abs/([\w.\-/]+?)(?:v\d+)?/?$", re.IGNORECASE)
ARXIV_PDF_RE = re.compile(r"arxiv\.org/pdf/([\w.\-/]+?)(?:v\d+)?(?:\.pdf)?/?$", re.IGNORECASE)


def _resolve_pdf_url(url: str) -> str:
    """Accept arXiv abs/pdf URLs (or raw .pdf) and return a direct PDF URL.
    Non-matching URLs are returned as-is — caller will verify content-type.
    """
    url = url.strip()
    m = ARXIV_ABS_RE.search(url) or ARXIV_PDF_RE.search(url)
    if m:
        return f"https://arxiv.org/pdf/{m.group(1)}.pdf"
    return url


async def import_from_url(session, url: str):
    """Download a PDF from a URL (arXiv or direct link) and create a paper."""
    import httpx
    pdf_url = _resolve_pdf_url(url)
    try:
        async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
            r = await client.get(pdf_url, headers={"User-Agent": "PaperReader/1.0"})
            r.raise_for_status()
    except httpx.HTTPError as e:
        logger.warning("url_import.fetch_failed url=%s err=%s", pdf_url, e)
        raise UrlImportFailed(f"下载失败：{str(e)[:160]}")

    ct = r.headers.get("content-type", "").lower()
    contents = r.content
    # Basic sanity: PDFs start with "%PDF"
    if not contents.startswith(b"%PDF") and "pdf" not in ct:
        raise UrlImportFailed(
            f"返回的不是 PDF（content-type={ct or '未知'}, {len(contents)} bytes）。"
            "请确认链接直达 PDF 文件。"
        )
    if len(contents) > MAX_SIZE:
        raise FileTooLarge()

    h = hashlib.sha256(contents).hexdigest()
    repo = PaperRepo(session)
    existing = repo.by_hash(h)
    if existing:
        logger.info("url_import.duplicate id=%s", existing.id)
        return existing

    fid = str(uuid.uuid4())
    rel_path = f"papers/{fid}.pdf"
    abs_path = PAPERS_DIR / f"{fid}.pdf"
    PAPERS_DIR.mkdir(parents=True, exist_ok=True)
    async with aiofiles.open(abs_path, "wb") as f:
        await f.write(contents)

    try:
        meta = extract_metadata(str(abs_path))
    except Exception as e:
        abs_path.unlink(missing_ok=True)
        logger.warning("url_import.invalid_pdf err=%s", e)
        raise InvalidPdf()

    paper = repo.create({
        "id": fid,
        "title": meta["title"],
        "authors": meta["authors"],
        "year": meta.get("year"),
        "total_pages": meta["total_pages"],
        "file_path": rel_path,
        "file_size": len(contents),
        "file_hash": h,
    })
    logger.info("url_import.ok id=%s url=%s pages=%d", paper.id, pdf_url, paper.total_pages)
    return paper


async def upload_paper(session, file: UploadFile):
    contents = await file.read()
    if len(contents) > MAX_SIZE:
        raise FileTooLarge()

    h = hashlib.sha256(contents).hexdigest()
    repo = PaperRepo(session)
    existing = repo.by_hash(h)
    if existing:
        logger.info("paper.duplicate_hash id=%s", existing.id)
        return existing

    fid = str(uuid.uuid4())
    rel_path = f"papers/{fid}.pdf"
    abs_path = PAPERS_DIR / f"{fid}.pdf"
    PAPERS_DIR.mkdir(parents=True, exist_ok=True)

    async with aiofiles.open(abs_path, "wb") as f:
        await f.write(contents)

    try:
        meta = extract_metadata(str(abs_path))
    except Exception as e:
        abs_path.unlink(missing_ok=True)
        logger.warning("paper.invalid_pdf err=%s", e)
        raise InvalidPdf()

    paper = repo.create(
        {
            "id": fid,
            "title": meta["title"],
            "authors": meta["authors"],
            "year": meta.get("year"),
            "total_pages": meta["total_pages"],
            "file_path": rel_path,
            "file_size": len(contents),
            "file_hash": h,
        }
    )
    logger.info("paper.uploaded id=%s pages=%d", paper.id, paper.total_pages)
    return paper
