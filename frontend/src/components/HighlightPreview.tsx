import { createPortal } from 'react-dom';
import type { Highlight, Note } from '../types';
import { COLOR_HEX, COLOR_LABELS } from '../types';

interface Props {
  highlight: Highlight;
  notes: Note[];
  x: number; // viewport x
  y: number; // viewport y (above this)
}

/**
 * Tiny floating card shown when the user hovers a highlight in the PDF.
 * Shows the highlight's text + up to 2 linked notes (first ~60 chars each).
 * Purely informational — click the highlight for the full menu.
 */
export function HighlightPreview({ highlight, notes, x, y }: Props) {
  const linked = notes.filter((n) => n.highlight_id === highlight.id);
  const accent = COLOR_HEX[highlight.color];

  // Clamp horizontally within the viewport
  const halfW = 160;
  const left = Math.min(window.innerWidth - halfW - 12, Math.max(halfW + 12, x));
  const top = Math.max(80, y);

  return createPortal(
    <div
      className="hl-preview fixed z-[55] w-80 pointer-events-none"
      style={{ left, top, transform: 'translate(-50%, -100%)' }}
    >
      <div
        className="rounded-xl shadow-[0_18px_40px_rgba(80,40,120,.35)] overflow-hidden border"
        style={{ borderColor: accent }}
      >
        {/* top strip in highlight color */}
        <div
          className="h-1"
          style={{ background: `linear-gradient(90deg, ${accent}, transparent)` }}
        />
        <div className="glass-panel px-3 py-2.5">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-wider mb-1.5">
            <span
              className="px-1.5 py-0.5 rounded-full font-semibold"
              style={{ background: accent, color: '#1f1033' }}
            >
              {COLOR_LABELS[highlight.color]}
            </span>
            <span className="text-gray-400 dark:text-gray-500 font-mono">p.{highlight.page}</span>
          </div>
          <div
            className="text-xs italic text-gray-600 dark:text-gray-300 line-clamp-2 pl-2 border-l-2 mb-2"
            style={{ borderLeftColor: accent }}
          >
            "{highlight.text.slice(0, 140)}{highlight.text.length > 140 ? '…' : ''}"
          </div>
          {linked.length === 0 ? (
            <div className="text-[11px] text-gray-400 dark:text-gray-500 italic">
              还没关联笔记 · 点击此高亮添加
            </div>
          ) : (
            <div className="space-y-1.5">
              {linked.slice(0, 2).map((n) => (
                <div key={n.id} className="text-xs leading-relaxed text-gray-700 dark:text-gray-200">
                  <span className="text-[10px] text-fuchsia-500 mr-1">✦</span>
                  {n.title && (
                    <span className="font-medium mr-1">{n.title.slice(0, 30)}:</span>
                  )}
                  <span className="text-gray-500 dark:text-gray-400">
                    {n.content.slice(0, 80).replace(/\n/g, ' ')}
                    {n.content.length > 80 ? '…' : ''}
                  </span>
                </div>
              ))}
              {linked.length > 2 && (
                <div className="text-[10px] text-gray-400 dark:text-gray-500">
                  还有 {linked.length - 2} 条笔记…
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {/* down arrow */}
      <div
        className="absolute left-1/2 -translate-x-1/2 -bottom-1 w-2 h-2 rotate-45 border-r border-b"
        style={{
          background: 'var(--paper-bg, white)',
          borderColor: accent,
        }}
        aria-hidden
      />
    </div>,
    document.body,
  );
}
