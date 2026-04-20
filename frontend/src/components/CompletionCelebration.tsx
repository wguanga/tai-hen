import { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  onDone: () => void;
}

const STARS = ['✨', '🌟', '⭐', '💫', '🌠', '🦄', '🌸', '✦'];

/**
 * Brief fullscreen celebration when the user scrolls to the end of a paper.
 * A warm glow bursts + little stars fly outward from the center, then toast
 * fades in (handled by caller). Auto-cleans up after ~1.8s.
 */
export function CompletionCelebration({ onDone }: Props) {
  useEffect(() => {
    const t = window.setTimeout(onDone, 1800);
    return () => window.clearTimeout(t);
  }, [onDone]);

  // Generate N star particles with random flight vectors
  const particles = Array.from({ length: 18 }, (_, i) => {
    const angle = (i / 18) * Math.PI * 2 + Math.random() * 0.4;
    const distance = 220 + Math.random() * 180;
    return {
      id: i,
      cx: `${Math.cos(angle) * distance}px`,
      cy: `${Math.sin(angle) * distance}px`,
      emoji: STARS[i % STARS.length],
      delay: Math.random() * 0.15,
    };
  });

  return createPortal(
    <div className="celebrate-root" aria-hidden>
      <div className="celebrate-burst" />
      {particles.map((p) => (
        <span
          key={p.id}
          className="celebrate-star"
          style={
            {
              '--cx': p.cx,
              '--cy': p.cy,
              animationDelay: `${p.delay}s`,
            } as React.CSSProperties
          }
        >
          {p.emoji}
        </span>
      ))}
    </div>,
    document.body,
  );
}
