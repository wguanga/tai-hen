"""Search arXiv for a paper given a free-text reference string.

The arXiv API is an Atom feed over HTTP. We send the raw reference text as the
query (arXiv does loose matching on title + abstract), parse top N Atom entries,
and return a small list the frontend can show in the citation popover.

This is a best-effort convenience — not every cited paper is on arXiv. The
frontend must fail gracefully when there are 0 results.
"""
from __future__ import annotations

import logging
import re
from xml.etree import ElementTree as ET

import httpx

logger = logging.getLogger(__name__)

ARXIV_API = "http://export.arxiv.org/api/query"
NS = {"atom": "http://www.w3.org/2005/Atom", "arxiv": "http://arxiv.org/schemas/atom"}


def _extract_title_hint(ref_text: str) -> str:
    """Pull a title candidate out of a reference string.

    Reference entries in papers follow many formats. As a robust baseline:
    - Strip [n] prefix
    - Strip leading authors (text before first period that looks like Initials)
    - Cap length so we don't blow up the arXiv query
    """
    t = ref_text.strip()
    t = re.sub(r"^\s*\[\d+\]\s*", "", t)
    # Drop a leading "Author, A., Author, B." chunk — crude: cut at first ". "
    # if the prefix looks name-y (contains commas + single-letter initials).
    if "." in t:
        head, rest = t.split(".", 1)
        if re.search(r"[A-Z]\.\s*[A-Z]?", head) or "," in head:
            t = rest.strip()
    return t[:240]


async def search_arxiv(ref_text: str, max_results: int = 3) -> list[dict]:
    q = _extract_title_hint(ref_text)
    if not q or len(q) < 6:
        return []
    params = {"search_query": f"all:{q}", "start": 0, "max_results": max_results}
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            r = await client.get(ARXIV_API, params=params, headers={"User-Agent": "PaperReader/1.0"})
            r.raise_for_status()
    except httpx.HTTPError as e:
        logger.warning("arxiv.search_failed q=%s err=%s", q[:60], e)
        return []

    try:
        root = ET.fromstring(r.text)
    except ET.ParseError as e:
        logger.warning("arxiv.parse_failed err=%s", e)
        return []

    out: list[dict] = []
    for entry in root.findall("atom:entry", NS):
        title_el = entry.find("atom:title", NS)
        id_el = entry.find("atom:id", NS)
        summary_el = entry.find("atom:summary", NS)
        if title_el is None or id_el is None:
            continue
        title = " ".join((title_el.text or "").split())
        abs_url = (id_el.text or "").strip()
        m = re.search(r"arxiv\.org/abs/([\w.\-/]+?)(?:v\d+)?/?$", abs_url, re.IGNORECASE)
        arxiv_id = m.group(1) if m else abs_url
        pdf_url = f"https://arxiv.org/pdf/{arxiv_id}.pdf"
        authors = [
            (a.findtext("atom:name", default="", namespaces=NS) or "").strip()
            for a in entry.findall("atom:author", NS)
        ]
        authors = [a for a in authors if a][:6]
        out.append({
            "arxiv_id": arxiv_id,
            "title": title,
            "authors": authors,
            "abs_url": abs_url,
            "pdf_url": pdf_url,
            "abstract": " ".join((summary_el.text or "").split())[:400] if summary_el is not None else "",
        })
    return out
