import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface Point { x: number; y: number }

/**
 * Listens for `note-path-show` / `note-path-hide` events and renders a
 * glowing bezier curve between the note card and its linked PDF highlight.
 */
export function NotePath() {
  const [ends, setEnds] = useState<{ from: Point; to: Point } | null>(null);

  useEffect(() => {
    const onShow = (e: Event) => {
      const d = (e as CustomEvent).detail as { from: Point; to: Point } | undefined;
      if (!d) return;
      setEnds(d);
    };
    const onHide = () => setEnds(null);
    window.addEventListener('note-path-show', onShow);
    window.addEventListener('note-path-hide', onHide);
    return () => {
      window.removeEventListener('note-path-show', onShow);
      window.removeEventListener('note-path-hide', onHide);
    };
  }, []);

  if (!ends) return null;
  const { from, to } = ends;

  // Smooth S-curve: control points pull inward, creating an arc
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const c1 = { x: from.x + dx * 0.15, y: from.y + dy * 0.8 };
  const c2 = { x: from.x + dx * 0.85, y: to.y - dy * 0.15 };
  const d = `M ${from.x} ${from.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${to.x} ${to.y}`;

  return createPortal(
    <svg
      className="note-path-svg"
      viewBox={`0 0 ${window.innerWidth} ${window.innerHeight}`}
      preserveAspectRatio="none"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: 50,
      }}
      aria-hidden
    >
      <defs>
        <linearGradient id="notepath-grad" gradientUnits="userSpaceOnUse"
          x1={from.x} y1={from.y} x2={to.x} y2={to.y}>
          <stop offset="0%" stopColor="#f472b6" />
          <stop offset="50%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#fde68a" />
        </linearGradient>
        <filter id="notepath-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.5" />
        </filter>
      </defs>
      {/* Soft glow underlay */}
      <path d={d} stroke="url(#notepath-grad)" strokeWidth="5" fill="none" opacity=".35" filter="url(#notepath-glow)" />
      {/* Main dashed path */}
      <path
        d={d}
        stroke="url(#notepath-grad)"
        strokeWidth="1.8"
        fill="none"
        strokeDasharray="6 6"
        strokeLinecap="round"
        style={{ animation: 'notePathDash 0.9s linear infinite' }}
      />
      {/* Endpoint anchors */}
      <circle cx={from.x} cy={from.y} r="4" fill="#f472b6" style={{ filter: 'drop-shadow(0 0 4px #f472b6)' }} />
      <circle cx={to.x} cy={to.y} r="5" fill="#fde68a" style={{ filter: 'drop-shadow(0 0 6px #fde68a)' }} />
    </svg>,
    document.body,
  );
}
