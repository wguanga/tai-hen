import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  scrollRef: React.RefObject<HTMLElement | null>;
  lookup: (term: string) => { term: string; definition: string; paperId: string | null } | undefined;
}

/**
 * Listens for hover events on .glossary-term spans inside the PDF text layer
 * and shows a small floating definition bubble — your own term dictionary,
 * available on any paper.
 */
export function GlossaryHover({ scrollRef, lookup }: Props) {
  const [tip, setTip] = useState<{ x: number; y: number; term: string; definition: string } | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const hide = () => {
      if (timerRef.current) { window.clearTimeout(timerRef.current); timerRef.current = null; }
      setTip(null);
    };
    const onMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || !target.classList.contains('glossary-term')) return;
      const term = target.dataset.glossTerm;
      if (!term) return;
      const entry = lookup(term);
      if (!entry) return;
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        const r = target.getBoundingClientRect();
        setTip({
          x: r.left + r.width / 2,
          y: r.bottom + 6,
          term: entry.term,
          definition: entry.definition,
        });
      }, 250);
    };
    const onMouseOut = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || !target.classList.contains('glossary-term')) return;
      hide();
    };
    const onScroll = () => hide();
    root.addEventListener('mouseover', onMouseOver);
    root.addEventListener('mouseout', onMouseOut);
    root.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      root.removeEventListener('mouseover', onMouseOver);
      root.removeEventListener('mouseout', onMouseOut);
      root.removeEventListener('scroll', onScroll);
      hide();
    };
  }, [scrollRef, lookup]);

  if (!tip) return null;
  const left = Math.min(window.innerWidth - 180, Math.max(16, tip.x));
  return createPortal(
    <div
      className="glossary-hover-tip"
      style={{ left, top: tip.y, transform: 'translateX(-50%)' }}
    >
      <div className="glossary-hover-term">📖 {tip.term}</div>
      <div className="glossary-hover-def">{tip.definition}</div>
    </div>,
    document.body,
  );
}
