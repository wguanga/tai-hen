import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { COLOR_HEX, COLOR_LABELS, type HighlightColor } from '../types';

/** Expand the current window selection to the enclosing sentence or paragraph.
 *  Uses `Selection.modify` on engines that support it (Chromium / Safari),
 *  with a manual text-scan fallback that walks the PDF text layer. */
function extendSelection(granularity: 'sentence' | 'paragraph') {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  // Native path
  type SelectionWithModify = Selection & { modify?: (alter: string, direction: string, granularity: string) => void };
  const s = sel as SelectionWithModify;
  if (typeof s.modify === 'function') {
    try {
      // Move the anchor to the start of the unit, then extend the focus forward.
      s.modify('move', 'backward', granularity);
      s.modify('extend', 'forward', granularity);
      return;
    } catch { /* fall through to manual */ }
  }
  // Manual fallback: walk text to boundary characters
  const r = sel.getRangeAt(0).cloneRange();
  const text = sel.toString();
  // Poor-man's extension: expand selection by a few words on each side
  // until hitting a period / newline.
  const stopSet = granularity === 'sentence' ? /[.!?。！？]/ : /\n\n|\r\n\r\n/;
  try {
    // Walk backwards in startContainer
    const sc = r.startContainer;
    if (sc.nodeType === Node.TEXT_NODE) {
      const before = (sc.textContent || '').slice(0, r.startOffset);
      const m = before.split('').reverse().join('').search(stopSet);
      r.setStart(sc, m === -1 ? 0 : before.length - m);
    }
    const ec = r.endContainer;
    if (ec.nodeType === Node.TEXT_NODE) {
      const after = (ec.textContent || '').slice(r.endOffset);
      const m2 = after.search(stopSet);
      r.setEnd(ec, m2 === -1 ? (ec.textContent || '').length : r.endOffset + m2 + 1);
    }
    sel.removeAllRanges();
    sel.addRange(r);
  } catch {
    // If all fails, leave selection as-is
    void text;
  }
}

interface SelectionToolbarProps {
  x: number;
  y: number;
  onPickColor: (color: HighlightColor) => void;
  onExplain: () => void;
  onTranslate: () => void;
  onAddNote: () => void;
  onClose: () => void;
}

/**
 * Floating mini-toolbar that appears above a text selection.
 * Provides one-click access to the most common actions (color highlight + AI
 * explain + quick note) without needing a right-click context menu.
 */
export function SelectionToolbar({
  x,
  y,
  onPickColor,
  onExplain,
  onTranslate,
  onAddNote,
  onClose,
}: SelectionToolbarProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Clamp horizontally within viewport (toolbar is ~260px wide, centered)
  const halfW = 140;
  const left = Math.min(
    window.innerWidth - halfW - 8,
    Math.max(halfW + 8, x),
  );
  const top = Math.max(60, y);

  const colors: HighlightColor[] = ['yellow', 'blue', 'green', 'purple'];

  return createPortal(
    <div
      className="selection-toolbar fixed z-50"
      style={{ left, top, transform: 'translate(-50%, -100%)' }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-0.5 rounded-full px-1.5 py-1 bg-gradient-to-r from-gray-900/95 to-gray-800/95 dark:from-gray-800/95 dark:to-gray-900/95 backdrop-blur shadow-2xl ring-1 ring-white/10">
        {colors.map((c) => (
          <button
            key={c}
            onClick={() => onPickColor(c)}
            title={COLOR_LABELS[c]}
            className="w-6 h-6 rounded-full transition-transform hover:scale-125 active:scale-95 ring-1 ring-black/20"
            style={{ background: COLOR_HEX[c] }}
          />
        ))}
        <div className="w-px h-5 bg-white/20 mx-1" />
        <button
          onClick={onExplain}
          title="AI 解释"
          className="px-2 h-6 rounded-full text-xs text-white hover:bg-white/10 transition-colors flex items-center gap-0.5"
        >
          🤖 <span className="hidden sm:inline">解释</span>
        </button>
        <button
          onClick={onTranslate}
          title="翻译"
          className="px-2 h-6 rounded-full text-xs text-white hover:bg-white/10 transition-colors"
        >
          🌐
        </button>
        <button
          onClick={onAddNote}
          title="添加笔记"
          className="px-2 h-6 rounded-full text-xs text-white hover:bg-white/10 transition-colors"
        >
          📝
        </button>
        <div className="w-px h-5 bg-white/20 mx-0.5" />
        <button
          onClick={() => extendSelection('sentence')}
          title="扩展选区到整句"
          className="px-2 h-6 rounded-full text-xs text-white/80 hover:bg-white/10 transition-colors"
        >
          ⇔句
        </button>
        <button
          onClick={() => extendSelection('paragraph')}
          title="扩展选区到整段"
          className="px-2 h-6 rounded-full text-xs text-white/80 hover:bg-white/10 transition-colors"
        >
          ⇔段
        </button>
        <div className="w-px h-5 bg-white/20 mx-0.5" />
        <button
          onClick={onClose}
          title="关闭 (Esc)"
          className="w-6 h-6 rounded-full text-xs text-white/60 hover:text-white hover:bg-white/10 transition-colors"
        >
          ✕
        </button>
      </div>
      {/* Little pointer triangle down */}
      <div
        className="absolute left-1/2 -translate-x-1/2 -bottom-1 w-2 h-2 bg-gray-900/95 dark:bg-gray-800/95 rotate-45"
        aria-hidden
      />
    </div>,
    document.body,
  );
}
