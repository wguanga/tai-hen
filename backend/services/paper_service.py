"""Paper upload + lifecycle."""
import hashlib
import logging
import uuid
from pathlib import Path

import aiofiles
from fastapi import UploadFile

from errors import FileTooLarge, InvalidPdf
from repositories.paper_repo import PaperRepo
from services.pdf_parser import extract_metadata

logger = logging.getLogger(__name__)

MAX_SIZE = 100 * 1024 * 1024
PAPERS_DIR = Path("data/papers")


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
