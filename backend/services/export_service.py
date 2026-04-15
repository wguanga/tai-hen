"""Export paper + highlights + notes as Markdown.

See .claude/conventions.md#5-导出-markdown-模板 for the template.
"""
import json
from datetime import datetime, timezone

from models import Paper
from repositories.highlight_repo import HighlightRepo
from repositories.note_repo import NoteRepo


COLOR_LABEL = {
    "yellow": ("🟨", "重要概念"),
    "blue": ("🟦", "方法细节"),
    "green": ("🟩", "实验结论"),
    "purple": ("🟪", "不理解"),
}


def export_markdown(session, paper: Paper) -> str:
    hl_repo = HighlightRepo(session)
    note_repo = NoteRepo(session)

    highlights = hl_repo.list_for_paper(paper.id)
    notes = note_repo.list_for_paper(paper.id)

    notes_by_hl: dict[str, list] = {}
    free_notes = []
    summary_notes = []
    for n in notes:
        if n.source == "ai_summary":
            summary_notes.append(n)
        elif n.highlight_id:
            notes_by_hl.setdefault(n.highlight_id, []).append(n)
        else:
            free_notes.append(n)

    try:
        authors = json.loads(paper.authors) if paper.authors else []
    except json.JSONDecodeError:
        authors = []

    lines: list[str] = []
    lines.append(f"# {paper.title}\n")
    meta_parts = []
    if authors:
        meta_parts.append(f"作者：{', '.join(authors)}")
    if paper.year:
        meta_parts.append(f"年份：{paper.year}")
    meta_parts.append(f"页数：{paper.total_pages}")
    meta_parts.append(f"导出时间：{datetime.now(timezone.utc).astimezone().isoformat(timespec='seconds')}")
    lines.append("> " + "  |  ".join(meta_parts) + "\n")
    lines.append("---\n")

    if summary_notes:
        lines.append("## 摘要笔记\n")
        for n in summary_notes:
            lines.append(n.content.rstrip() + "\n")
        lines.append("\n---\n")

    if highlights:
        lines.append("## 高亮与笔记\n")
        by_page: dict[int, list] = {}
        for h in highlights:
            by_page.setdefault(h.page, []).append(h)
        for page in sorted(by_page):
            lines.append(f"### 第 {page} 页\n")
            page_hls = by_page[page]
            page_hls.sort(key=lambda h: _y_of(h.position))
            for h in page_hls:
                emoji, label = COLOR_LABEL.get(h.color, ("▫️", h.color))
                lines.append(f"> {emoji} **{label}**")
                lines.append(f">")
                for raw_line in h.text.splitlines() or [h.text]:
                    lines.append(f"> {raw_line}")
                if h.note:
                    lines.append(f">")
                    lines.append(f"> *备注：{h.note}*")
                for n in notes_by_hl.get(h.id, []):
                    src_tag = {"ai_answer": "AI 回答", "manual": "笔记", "ai_summary": "摘要"}.get(n.source, n.source)
                    lines.append(f">")
                    lines.append(f"> **{src_tag}：**")
                    for content_line in n.content.splitlines():
                        lines.append(f"> {content_line}")
                lines.append("")
            lines.append("")

    if free_notes:
        lines.append("---\n")
        lines.append("## 独立笔记\n")
        for n in free_notes:
            if n.title:
                lines.append(f"### {n.title}")
            lines.append(n.content.rstrip())
            lines.append("")

    lines.append("\n---\n*由 Paper Reader 自动生成*")
    return "\n".join(lines)


def _y_of(position_json: str) -> float:
    try:
        return float(json.loads(position_json).get("y", 0))
    except (json.JSONDecodeError, TypeError, ValueError):
        return 0.0
