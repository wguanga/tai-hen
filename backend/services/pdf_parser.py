"""PDF metadata + text extraction via PyMuPDF."""
import re
from pathlib import Path

import fitz


def extract_metadata(pdf_path: str) -> dict:
    doc = fitz.open(pdf_path)
    try:
        meta = doc.metadata or {}
        title = (meta.get("title") or "").strip()
        if not title:
            title = _guess_title_from_first_page(doc)
        if not title:
            title = Path(pdf_path).stem

        authors_raw = meta.get("author") or ""
        authors = [a.strip() for a in re.split(r"[,;]", authors_raw) if a.strip()]

        year = _extract_year(meta.get("creationDate") or meta.get("modDate") or "", doc)
        return {
            "title": title[:255],
            "authors": authors,
            "year": year,
            "total_pages": len(doc),
        }
    finally:
        doc.close()


def _guess_title_from_first_page(doc) -> str:
    if len(doc) == 0:
        return ""
    page = doc[0]
    blocks = page.get_text("dict").get("blocks", [])
    max_size = 0.0
    candidate = ""
    for block in blocks:
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                size = float(span.get("size", 0))
                text = (span.get("text") or "").strip()
                if size > max_size and len(text) > 5:
                    max_size = size
                    candidate = text
    return candidate


def _extract_year(meta_date: str, doc) -> int | None:
    if meta_date:
        m = re.search(r"(19|20)\d{2}", meta_date)
        if m:
            return int(m.group(0))
    if len(doc) > 0:
        text = doc[0].get_text()
        m = re.search(r"(19|20)\d{2}", text[:2000])
        if m:
            return int(m.group(0))
    return None


def get_page_text(pdf_path: str, page_num: int) -> str:
    doc = fitz.open(pdf_path)
    try:
        if page_num < 1 or page_num > len(doc):
            return ""
        return doc[page_num - 1].get_text()
    finally:
        doc.close()


def get_context_around(pdf_path: str, page_num: int, target_text: str, window: int = 300) -> str:
    text = get_page_text(pdf_path, page_num)
    if not text:
        return ""
    idx = text.find(target_text[:100])
    if idx == -1:
        return text[:600]
    start = max(0, idx - window)
    end = min(len(text), idx + len(target_text) + window)
    return text[start:end]


def get_all_text(pdf_path: str, max_chars: int = 100_000) -> str:
    doc = fitz.open(pdf_path)
    try:
        parts: list[str] = []
        used = 0
        for page in doc:
            t = page.get_text()
            if used + len(t) > max_chars:
                parts.append(t[: max_chars - used])
                parts.append("\n[truncated]")
                break
            parts.append(t)
            used += len(t)
        return "\n".join(parts)
    finally:
        doc.close()
