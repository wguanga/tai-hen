import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Milestone } from '../hooks/useAppStats';

interface ActiveToast {
  id: number;
  milestone: Milestone;
}

/**
 * Global listener for `milestone-unlock` CustomEvents. Shows a centered,
 * celebratory card with the badge art that auto-dismisses after ~3.5s.
 * Multiple unlocks queue one at a time so each gets its moment.
 */
export function MilestoneToastHost() {
  const [queue, setQueue] = useState<ActiveToast[]>([]);

  useEffect(() => {
    let seq = 0;
    const onUnlock = (e: Event) => {
      const m = (e as CustomEvent).detail?.milestone as Milestone | undefined;
      if (!m) return;
      setQueue((q) => [...q, { id: ++seq, milestone: m }]);
    };
    window.addEventListener('milestone-unlock', onUnlock);
    return () => window.removeEventListener('milestone-unlock', onUnlock);
  }, []);

  // Auto-advance queue: show each for 3.5s
  useEffect(() => {
    if (queue.length === 0) return;
    const t = window.setTimeout(() => {
      setQueue((q) => q.slice(1));
    }, 3500);
    return () => window.clearTimeout(t);
  }, [queue]);

  const current = queue[0];
  if (!current) return null;

  return createPortal(
    <div className="milestone-root" key={current.id}>
      {/* Radiating burst behind the card */}
      <div className="milestone-burst" />
      {/* The badge card itself */}
      <div className="milestone-card">
        <div className="milestone-unlocked-label">✧ 成就解锁 ✧</div>
        <div className="milestone-emoji">{current.milestone.emoji}</div>
        <div className="milestone-name">{current.milestone.name}</div>
        <div className="milestone-desc">{current.milestone.desc}</div>
      </div>
      {/* Confetti sparks */}
      {Array.from({ length: 12 }).map((_, i) => {
        const angle = (i / 12) * Math.PI * 2;
        const dist = 140 + Math.random() * 90;
        return (
          <span
            key={i}
            className="milestone-confetti"
            style={{
              '--cx': `${Math.cos(angle) * dist}px`,
              '--cy': `${Math.sin(angle) * dist}px`,
              animationDelay: `${Math.random() * 0.2}s`,
            } as React.CSSProperties}
          >
            {['✨', '🌟', '💫', '⭐'][i % 4]}
          </span>
        );
      })}
    </div>,
    document.body,
  );
}
