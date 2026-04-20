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
        if not authors:
            authors = _guess_authors_from_first_page(doc, title)

        year = _extract_year(meta.get("creationDate") or meta.get("modDate") or "", doc)
        return {
            "title": title[:255],
            "authors": authors,
            "year": year,
            "total_pages": len(doc),
        }
    finally:
        doc.close()


def _guess_authors_from_first_page(doc, title: str) -> list[str]:
    """Heuristic: on the first page, find lines below the title that look like
    an author list (names separated by commas, with possible superscript markers).

    Works for most academic papers; falls back to empty list for unusual layouts.
    """
    if len(doc) == 0:
        return []
    text = doc[0].get_text()
    if not text:
        return []
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    if not lines:
        return []

    # Find the title line and look at the next few lines below it
    start_idx = 0
    if title:
        title_head = title.strip()[:40]
        for i, ln in enumerate(lines[:20]):
            if title_head and title_head in ln:
                start_idx = i + 1
                break

    # Scan up to 6 lines after title for a plausible author line
    # Accept: any line with ≥1 comma/"and"/"&" AND majority-word content AND
    # no URLs / no leading numbers / length 8-300
    candidate_re = re.compile(r"[,;]|(\band\b)|&", re.IGNORECASE)
    skip_re = re.compile(r"(https?://|\babstract\b|@|[{}]|^\d)", re.IGNORECASE)
    for ln in lines[start_idx : start_idx + 8]:
        if len(ln) < 8 or len(ln) > 300:
            continue
        if skip_re.search(ln):
            continue
        if not candidate_re.search(ln):
            continue
        # Strip footnote / affiliation markers (digits and symbols after names)
        cleaned = re.sub(r"[\d\*†‡§¶]+", "", ln)
        parts = re.split(r",|;|\s+and\s+|&", cleaned, flags=re.IGNORECASE)
        authors = [p.strip(" .·") for p in parts if p.strip(" .·")]
        # Must look like names: at least 2 items, each 2-60 chars, mostly letters
        if len(authors) < 1:
            continue
        good = [
            a for a in authors
            if 2 <= len(a) <= 60 and re.search(r"[A-Za-z\u4e00-\u9fff]", a)
        ]
        if good and len(good) <= 20:
            return good[:20]
    return []


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
                # Caption bbox (in PDF points). Used to clip the figure area
                # above the caption for vector figures without an image xref.
                bbox = b.get("bbox") or [0.0, 0.0, 0.0, 0.0]
                out.append({
                    "number": number,
                    "page": page_num,
                    "kind": kind,
                    "caption": caption,
                    "image_xref": xref,
                    "caption_bbox": [float(v) for v in bbox],
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


def render_page_clip_png(
    pdf_path: str,
    page: int,
    clip_bbox: tuple[float, float, float, float] | None = None,
    *,
    zoom: float = 2.0,
) -> bytes | None:
    """Render a rectangular page region as PNG.

    Used as a fallback for "figures" that are vector-drawn (no embedded image
    xref). If clip_bbox is None, renders the full page. bbox is in PDF points
    (same coordinate system as page.rect / block["bbox"]).
    """
    doc = fitz.open(pdf_path)
    try:
        if page < 1 or page > len(doc):
            return None
        p = doc[page - 1]
        matrix = fitz.Matrix(zoom, zoom)
        if clip_bbox is not None:
            x0, y0, x1, y1 = clip_bbox
            # Clamp to page bounds, ensure positive area
            pr = p.rect
            x0 = max(pr.x0, min(x0, pr.x1))
            y0 = max(pr.y0, min(y0, pr.y1))
            x1 = max(pr.x0, min(x1, pr.x1))
            y1 = max(pr.y0, min(y1, pr.y1))
            if x1 - x0 < 10 or y1 - y0 < 10:
                # Degenerate clip — fall back to full page
                clip = None
            else:
                clip = fitz.Rect(x0, y0, x1, y1)
        else:
            clip = None
        pix = p.get_pixmap(matrix=matrix, clip=clip, alpha=False)
        return pix.tobytes("png")
    except Exception:
        return None
    finally:
        doc.close()


def figure_clip_bbox_for(caption_bbox: tuple[float, float, float, float], page_rect_y1: float) -> tuple[float, float, float, float]:
    """Given a caption bbox, return a clip bbox covering the figure above it.

    Heuristic: figures sit above their captions. Clip from page top to the
    caption's top edge, horizontally spanning a bit wider than the caption
    (full page width works for most layouts).
    Returns (x0, y0, x1, y1) in PDF points.
    """
    cx0, cy0, cx1, _cy1 = caption_bbox
    # Cap the strip at 70% of page height above caption (avoids grabbing
    # unrelated earlier content if caption is near bottom of a mostly-text page).
    strip_h_max = page_rect_y1 * 0.70
    y0 = max(0.0, cy0 - strip_h_max)
    y1 = max(cy0 - 2.0, y0 + 20.0)  # small gap above caption
    # Expand horizontally to include the whole typical column
    width = max(cx1 - cx0, 200.0)
    center = (cx0 + cx1) / 2
    x0 = max(0.0, center - width)
    x1 = center + width
    return (x0, y0, x1, y1)


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
