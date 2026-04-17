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


def get_outline(pdf_path: str) -> list[dict]:
    """Extract PDF table of contents / bookmarks."""
    doc = fitz.open(pdf_path)
    try:
        toc = doc.get_toc(simple=True)  # [[level, title, page], ...]
        return [
            {"level": item[0], "title": item[1].strip(), "page": item[2]}
            for item in toc
            if item[1].strip()
        ]
    finally:
        doc.close()


PAGE_WIDTH_CSS = 780  # Must match frontend PAGE_WIDTH constant (zoom=1)


def find_text_position(pdf_path: str, page: int, text: str) -> dict | None:
    """Find a text snippet on a page and return its bbox in CSS px (zoom=1).

    Matches the frontend coordinate system used for highlights.
    Returns {x, y, width, height, rects:[...]} or None if not found.
    """
    doc = fitz.open(pdf_path)
    try:
        if page < 1 or page > len(doc):
            return None
        p = doc[page - 1]
        hits = p.search_for(text, quads=False)
        if not hits:
            # Try shorter fragment for fuzzy match
            fragment = text.strip().split(".")[0][:80]
            if len(fragment) < 10:
                return None
            hits = p.search_for(fragment, quads=False)
            if not hits:
                return None
        # PyMuPDF returns rects in PDF points. Page width in points = p.rect.width.
        scale = PAGE_WIDTH_CSS / p.rect.width
        rects = [
            {
                "x": float(r.x0) * scale,
                "y": float(r.y0) * scale,
                "width": float(r.x1 - r.x0) * scale,
                "height": float(r.y1 - r.y0) * scale,
            }
            for r in hits
        ]
        xs = [r["x"] for r in rects]
        ys = [r["y"] for r in rects]
        return {
            "x": min(xs),
            "y": min(ys),
            "width": max(r["x"] + r["width"] for r in rects) - min(xs),
            "height": max(r["y"] + r["height"] for r in rects) - min(ys),
            "rects": rects,
        }
    finally:
        doc.close()


def get_section_text(pdf_path: str, start_page: int, end_page: int | None = None, max_chars: int = 30_000) -> str:
    """Return concatenated text between start_page (inclusive) and end_page (exclusive).

    If end_page is None, read until the end of the document.
    """
    doc = fitz.open(pdf_path)
    try:
        total = len(doc)
        start = max(1, start_page)
        end = total if end_page is None else min(total, end_page - 1)
        if start > total:
            return ""
        parts: list[str] = []
        used = 0
        for i in range(start - 1, end):
            t = doc[i].get_text()
            if used + len(t) > max_chars:
                parts.append(t[: max_chars - used])
                parts.append("\n[truncated]")
                break
            parts.append(t)
            used += len(t)
        return "\n".join(parts)
    finally:
        doc.close()


def search_text(pdf_path: str, query: str, max_results: int = 100) -> list[dict]:
    """Search text across all pages, return matches with page + surrounding snippet."""
    doc = fitz.open(pdf_path)
    results: list[dict] = []
    try:
        q_lower = query.lower()
        for i, page in enumerate(doc):
            text = page.get_text()
            start = 0
            while True:
                idx = text.lower().find(q_lower, start)
                if idx == -1:
                    break
                snippet_start = max(0, idx - 40)
                snippet_end = min(len(text), idx + len(query) + 40)
                results.append({
                    "page": i + 1,
                    "index": idx,
                    "snippet": text[snippet_start:snippet_end].replace("\n", " "),
                })
                start = idx + 1
                if len(results) >= max_results:
                    return results
        return results
    finally:
        doc.close()


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


def extract_figures(pdf_path: str, max_figures: int = 50) -> list[dict]:
    """Extract images + captions from a PDF.

    Strategy:
    - For each page, get images via page.get_images()
    - For each page, find caption text blocks starting with 'Figure N.' / 'Fig. N.' /
      'Table N.' — associate each caption with the nearest image on the page
    - Return list sorted by (page, figure_number)

    Returns list of {number, page, kind ('figure'|'table'), caption, image_xref} dicts.
    image_xref is the PyMuPDF internal reference for later rendering.
    """
    import re

    doc = fitz.open(pdf_path)
    out: list[dict] = []
    try:
        for page_idx, page in enumerate(doc):
            page_num = page_idx + 1
            blocks = page.get_text("dict").get("blocks", [])
            # Collect image xrefs on this page in draw order
            imgs = page.get_images(full=True)
            image_xrefs = [img[0] for img in imgs]

            # Find caption blocks
            for b in blocks:
                if b.get("type") != 0:  # 0 = text block
                    continue
                # Flatten block text
                lines = b.get("lines", [])
                text_parts: list[str] = []
                for line in lines:
                    for span in line.get("spans", []):
                        text_parts.append(span.get("text", ""))
                text = " ".join(text_parts).strip()
                if not text:
                    continue
                m = re.match(r"^(Figure|Fig\.?|Table|Tab\.?)\s*(\d{1,3})[\.:\s-]", text, re.IGNORECASE)
                if not m:
                    continue
                kind_raw = m.group(1).lower()
                kind = "table" if kind_raw.startswith("tab") else "figure"
                try:
                    number = int(m.group(2))
                except ValueError:
                    continue
                # Truncate caption to reasonable length
                caption = text[:400]
                # Pick first image on this page if present
                xref = image_xrefs[0] if image_xrefs else None
                out.append({
                    "number": number,
                    "page": page_num,
                    "kind": kind,
                    "caption": caption,
                    "image_xref": xref,
                })
                if len(out) >= max_figures:
                    break
            if len(out) >= max_figures:
                break
        # De-dup: a page with Figure 1 caption + one image ok, but some PDFs repeat.
        seen: set[tuple[int, str, int]] = set()
        uniq: list[dict] = []
        for f in out:
            key = (f["page"], f["kind"], f["number"])
            if key in seen:
                continue
            seen.add(key)
            uniq.append(f)
        return uniq
    finally:
        doc.close()


def render_figure_png(pdf_path: str, image_xref: int) -> bytes | None:
    """Render a specific PDF image xref to PNG bytes for frontend display."""
    doc = fitz.open(pdf_path)
    try:
        try:
            pix = fitz.Pixmap(doc, image_xref)
            if pix.n - pix.alpha >= 4:  # CMYK → RGB
                pix = fitz.Pixmap(fitz.csRGB, pix)
            return pix.tobytes("png")
        except Exception:
            return None
    finally:
        doc.close()


def extract_references(pdf_path: str, max_entries: int = 200) -> list[dict]:
    """Extract numbered reference entries from the References / Bibliography section.

    Strategy: find a header line like 'References' or 'Bibliography', then collect
    entries matching '[n] ...' or 'n. ...' patterns until end of document.
    Returns [{index: 1, text: "..."}, ...] sorted by index.
    """
    import re

    doc = fitz.open(pdf_path)
    try:
        all_text = ""
        for page in doc:
            all_text += "\n" + page.get_text()
    finally:
        doc.close()

    # Find the references section (case-insensitive, line-start)
    header_re = re.compile(r"(?im)^\s*(references|bibliography|参考文献)\s*$")
    m = header_re.search(all_text)
    if not m:
        return []
    ref_block = all_text[m.end():]

    # Try '[n] ...' pattern first (most common in CS papers)
    bracket_re = re.compile(r"\[(\d{1,3})\]\s+(.+?)(?=\n\s*\[\d{1,3}\]|\Z)", re.DOTALL)
    matches = list(bracket_re.finditer(ref_block))
    if not matches:
        # Fallback: 'n. ...' pattern
        num_re = re.compile(r"(?m)^\s*(\d{1,3})[\.\)]\s+(.+?)(?=\n\s*\d{1,3}[\.\)]|\Z)", re.DOTALL)
        matches = list(num_re.finditer(ref_block))

    results: list[dict] = []
    seen: set[int] = set()
    for m in matches[:max_entries]:
        try:
            idx = int(m.group(1))
        except ValueError:
            continue
        if idx in seen:
            continue
        seen.add(idx)
        text = m.group(2).strip().replace("\n", " ")
        # Collapse whitespace
        text = re.sub(r"\s+", " ", text)
        if len(text) < 10:
            continue
        results.append({"index": idx, "text": text[:500]})
    results.sort(key=lambda r: r["index"])
    return results


def get_all_text_with_pages(pdf_path: str, max_chars: int = 100_000) -> str:
    """Concatenate all pages with explicit page markers so LLM can cite pages."""
    doc = fitz.open(pdf_path)
    try:
        parts: list[str] = []
        used = 0
        for i, page in enumerate(doc):
            marker = f"\n\n[page {i + 1}]\n"
            t = page.get_text()
            if used + len(marker) + len(t) > max_chars:
                parts.append(marker)
                parts.append(t[: max(0, max_chars - used - len(marker))])
                parts.append("\n[truncated]")
                break
            parts.append(marker)
            parts.append(t)
            used += len(marker) + len(t)
        return "".join(parts).strip()
    finally:
        doc.close()
