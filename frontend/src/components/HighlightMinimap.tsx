import { useEffect, useRef, useState } from 'react';
import { COLOR_HEX } from '../types';
import type { Highlight } from '../types';

/**
 * Narrow vertical track rendered next to the PDF scroll area.
 * Each highlight is a small colored dot positioned by page number.
 * Clicking a dot jumps to that page.
 */
export function HighlightMinimap({
  highlights,
  pageCount,
  currentPage,
  onGoToPage,
}: {
  highlights: Highlight[];
  pageCount: number;
  currentPage: number;
  onGoToPage: (page: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (!ref.current) return;
    const obs = new ResizeObserver(([entry]) => {
      setHeight(entry.contentRect.height);
    });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  if (pageCount === 0) return null;

  const pageToY = (page: number) => {
    if (pageCount <= 1) return 0;
    return ((page - 1) / (pageCount - 1)) * (height - 4);
  };

  return (
    <div
      ref={ref}
      className="relative w-4 bg-gray-100 dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 flex-shrink-0"
      title="高亮缩略图：点击跳转到对应页"
    >
      {/* Current page indicator */}
      {height > 0 && (
        <div
          className="absolute left-0 right-0 bg-indigo-200 dark:bg-indigo-800 opacity-50 pointer-events-none"
          style={{
            top: pageToY(currentPage),
            height: Math.max(4, height / pageCount),
          }}
        />
      )}

      {/* Highlight dots */}
      {height > 0 && highlights.map((h, i) => (
        <button
          key={h.id ?? i}
          onClick={() => onGoToPage(h.page)}
          className="absolute left-0.5 right-0.5 rounded-sm cursor-pointer hover:scale-110 transition-transform"
          style={{
            top: pageToY(h.page),
            height: 3,
            background: COLOR_HEX[h.color],
            opacity: 0.85,
          }}
          title={`p.${h.page}: ${h.text.slice(0, 60)}${h.text.length > 60 ? '…' : ''}`}
        />
      ))}
    </div>
  );
}
