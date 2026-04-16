import { useCallback, useState } from 'react';
import type { HighlightColor, HighlightPosition } from '../types';

export interface CapturedSelection {
  text: string;
  page: number;
  position: HighlightPosition;
}

function findPageFromNode(node: Node | null): number | null {
  let cur: Node | null = node;
  while (cur) {
    if (cur instanceof HTMLElement && cur.dataset.pageNumber) {
      return Number(cur.dataset.pageNumber);
    }
    cur = cur.parentNode;
  }
  return null;
}

export function useHighlight() {
  const [activeColor, setActiveColor] = useState<HighlightColor>('yellow');

  const capture = useCallback((): CapturedSelection | null => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return null;
    const text = sel.toString().trim();
    if (!text || text.length < 2) return null;

    const range = sel.getRangeAt(0);
    const pageNum = findPageFromNode(range.startContainer);
    if (!pageNum) return null;

    const pageEl = document.querySelector<HTMLElement>(
      `[data-page-number="${pageNum}"]`,
    );
    if (!pageEl) return null;
    const pageRect = pageEl.getBoundingClientRect();

    const clientRects = Array.from(range.getClientRects()).filter(
      (r) => r.width > 1 && r.height > 1,
    );
    if (clientRects.length === 0) return null;

    const rects = clientRects.map((r) => ({
      x: r.left - pageRect.left,
      y: r.top - pageRect.top,
      width: r.width,
      height: r.height,
    }));
    const xs = rects.map((r) => r.x);
    const ys = rects.map((r) => r.y);
    const position: HighlightPosition = {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...rects.map((r) => r.x + r.width)) - Math.min(...xs),
      height: Math.max(...rects.map((r) => r.y + r.height)) - Math.min(...ys),
      rects,
    };
    return { text, page: pageNum, position };
  }, []);

  const clearSelection = useCallback(() => {
    window.getSelection()?.removeAllRanges();
  }, []);

  return { activeColor, setActiveColor, capture, clearSelection };
}
