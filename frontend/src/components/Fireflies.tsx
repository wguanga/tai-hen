import { useMemo } from 'react';

/**
 * Ambient firefly particles drifting upward behind the PDF pages.
 * Pure CSS animation (no per-frame JS). ~15-20 particles feels "alive"
 * without being distracting.
 */
export function Fireflies({ count = 18 }: { count?: number }) {
  const flies = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        top: 30 + Math.random() * 80, // start mostly in lower half, drift up
        dx: Math.round((Math.random() - 0.5) * 240),
        dy: -120 - Math.round(Math.random() * 320),
        duration: 10 + Math.random() * 14,
        delay: -Math.random() * 20, // negative delay → already in motion on mount
        size: 2 + Math.random() * 2.5,
      })),
    [count],
  );

  return (
    <div className="fireflies-layer" aria-hidden>
      {flies.map((f) => (
        <span
          key={f.id}
          className="firefly"
          style={
            {
              left: `${f.left}%`,
              top: `${f.top}%`,
              width: `${f.size}px`,
              height: `${f.size}px`,
              animationDuration: `${f.duration}s`,
              animationDelay: `${f.delay}s`,
              '--dx': `${f.dx}px`,
              '--dy': `${f.dy}px`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
