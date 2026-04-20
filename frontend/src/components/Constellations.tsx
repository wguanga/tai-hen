import { useEffect, useState } from 'react';

/**
 * Subtle star constellations that fade in/out at random intervals while the
 * user is idle. Fixed-point geometry feels like distant celestial markers
 * sitting behind the fireflies.
 */

interface Constellation {
  name: string;
  stars: { x: number; y: number }[];
  lines: [number, number][];
}

// Each (x, y) is a percentage of the PDF scroll area. Low-density so fireflies
// and pages remain the main visual.
const CONSTELLATIONS: Constellation[] = [
  {
    name: 'Kite',
    stars: [
      { x: 8,  y: 20 },
      { x: 14, y: 12 },
      { x: 22, y: 22 },
      { x: 15, y: 34 },
    ],
    lines: [[0, 1], [1, 2], [2, 3], [3, 0]],
  },
  {
    name: 'Swan',
    stars: [
      { x: 82, y: 14 },
      { x: 88, y: 22 },
      { x: 92, y: 32 },
      { x: 84, y: 30 },
      { x: 78, y: 40 },
    ],
    lines: [[0, 1], [1, 2], [1, 3], [3, 4]],
  },
  {
    name: 'Triangle',
    stars: [
      { x: 12, y: 75 },
      { x: 20, y: 88 },
      { x: 6,  y: 90 },
    ],
    lines: [[0, 1], [1, 2], [2, 0]],
  },
  {
    name: 'Fern',
    stars: [
      { x: 86, y: 68 },
      { x: 92, y: 74 },
      { x: 82, y: 82 },
      { x: 90, y: 88 },
    ],
    lines: [[0, 1], [1, 3], [0, 2]],
  },
];

export function Constellations() {
  // Cycle which constellation is visible; one at a time, 8s visible / 6s hidden
  const [activeIdx, setActiveIdx] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let stopped = false;
    const tick = () => {
      if (stopped) return;
      setVisible(true);
      window.setTimeout(() => {
        if (stopped) return;
        setVisible(false);
        window.setTimeout(() => {
          if (stopped) return;
          setActiveIdx((i) => (i + 1) % CONSTELLATIONS.length);
          tick();
        }, 6_000);
      }, 8_000);
    };
    // Initial delay so they don't appear immediately on page load
    const t0 = window.setTimeout(tick, 3_500);
    return () => { stopped = true; window.clearTimeout(t0); };
  }, []);

  const c = CONSTELLATIONS[activeIdx];

  return (
    <svg
      className="constellations-layer"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={{ opacity: visible ? 0.55 : 0 }}
      aria-hidden
    >
      {/* Lines first (behind stars) */}
      {c.lines.map(([a, b], i) => {
        const sa = c.stars[a];
        const sb = c.stars[b];
        return (
          <line
            key={i}
            x1={sa.x} y1={sa.y} x2={sb.x} y2={sb.y}
            stroke="rgba(253, 230, 138, 0.75)"
            strokeWidth="0.12"
            strokeDasharray="0.6 0.3"
          />
        );
      })}
      {/* Stars */}
      {c.stars.map((s, i) => (
        <circle
          key={i}
          cx={s.x} cy={s.y}
          r="0.45"
          fill="#fde68a"
          style={{
            filter: 'drop-shadow(0 0 1.2px rgba(253, 230, 138, 0.9))',
          }}
        />
      ))}
    </svg>
  );
}
