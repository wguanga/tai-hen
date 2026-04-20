import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api';

const HOVER_DELAY_MS = 550;
const CACHE = new Map<string, string>();

interface ActiveTip {
  text: string;
  x: number;
  y: number;
  translation: string | null; // null = loading
}

/**
 * Hover-to-translate: point at a word in the PDF text layer for ~550ms → a
 * tiny bubble shows the Chinese translation. Supports single words and short
 * phrases (user must hold still; moving cancels).
 *
 * Cache-by-text so the same word only hits the API once per session.
 */
export function HoverTranslate({
  scrollRef,
  enabled,
}: {
  scrollRef: React.RefObject<HTMLElement | null>;
  enabled: boolean;
}) {
  const [tip, setTip] = useState<ActiveTip | null>(null);
  const timerRef = useRef<number | null>(null);
  const activeTokenRef = useRef<string>(''); // guards stale responses

  useEffect(() => {
    if (!enabled) return;
    const root = scrollRef.current;
    if (!root) return;

    const hide = () => {
      if (timerRef.current) { window.clearTimeout(timerRef.current); timerRef.current = null; }
      setTip(null);
    };

    const onMouseMove = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) { hide(); return; }
      // Only react to text-layer spans inside a pdf-page
      if (target.tagName !== 'SPAN' || !target.closest('.pdf-page') || !target.closest('.react-pdf__Page__textContent')) {
        hide();
        return;
      }
      // Cite marks and highlights — skip
      if (target.classList.contains('cite-mark')) { hide(); return; }
      const text = (target.textContent || '').trim();
      if (!text || text.length < 2 || text.length > 120) { hide(); return; }

      // Quick reject numeric-only / symbol-only strings
      if (/^[\d\s.,;:()\[\]\-+=<>/\\*%$&@~^`'"]+$/.test(text)) { hide(); return; }

      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(async () => {
        // Anchor below the word
        const rect = target.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.bottom + 6;
        const cached = CACHE.get(text);
        if (cached) {
          setTip({ text, x, y, translation: cached });
          return;
        }
        setTip({ text, x, y, translation: null });
        activeTokenRef.current = text;
        try {
          const r = await api.quickTranslate(text);
          if (activeTokenRef.current !== text) return; // user moved on
          if (r.translation) {
            CACHE.set(text, r.translation);
            setTip({ text, x, y, translation: r.translation });
          } else {
            hide();
          }
        } catch {
          hide();
        }
      }, HOVER_DELAY_MS);
    };

    const onMouseOut = (e: MouseEvent) => {
      const related = e.relatedTarget as HTMLElement | null;
      // If leaving a span entirely (not to another span)
      if (!related || (related.tagName !== 'SPAN' && !related.closest?.('.react-pdf__Page__textContent'))) {
        hide();
      }
    };
    const onScroll = () => hide();

    root.addEventListener('mousemove', onMouseMove);
    root.addEventListener('mouseout', onMouseOut);
    root.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      root.removeEventListener('mousemove', onMouseMove);
      root.removeEventListener('mouseout', onMouseOut);
      root.removeEventListener('scroll', onScroll);
      hide();
    };
  }, [enabled, scrollRef]);

  if (!tip) return null;
  const left = Math.min(window.innerWidth - 160, Math.max(16, tip.x));
  return createPortal(
    <div
      className="hover-translate-tip"
      style={{ left, top: tip.y, transform: 'translateX(-50%)' }}
    >
      <div className="ht-source">{tip.text.slice(0, 60)}{tip.text.length > 60 ? '…' : ''}</div>
      <div className="ht-arrow">↓</div>
      <div className="ht-target">
        {tip.translation === null
          ? <span className="ht-loading">…</span>
          : tip.translation}
      </div>
    </div>,
    document.body,
  );
}
