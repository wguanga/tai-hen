import { useEffect, useRef, useState, type RefObject } from 'react';
import { Taitai, type TaitaiEmotion, type Accessory } from './Taitai';
import { heatColorForSeconds } from '../hooks/useReadingHeatmap';

interface Tick {
  pct: number; // 0..1 vertical position
  title?: string;
  page?: number;
}

interface Props {
  scrollRef: RefObject<HTMLElement | null>;
  ticks?: Tick[];
  /** External-driven emotion; takes priority over internal scroll-based state. */
  overrideEmotion?: TaitaiEmotion | null;
  /** Paper-topic-derived wearable accessory */
  accessory?: Accessory;
  /** Current reading streak (days) — shows flame on creature when ≥ 2 */
  streak?: number;
  /** Taitai evolution tier (1-15+) */
  level?: number;
  /** Reading heatmap: page → seconds spent. Rendered as colored bands on rail. */
  heatmap?: Record<number, number>;
  totalPages?: number;
}

type CreatureState = 'idle' | 'running' | 'dragging';

/**
 * A draggable, animated little creature that acts as the PDF's scrollbar.
 * — Inspired by the "Grove" reference design, tuned for our violet/fuchsia palette.
 * — Runs when you scroll; wiggles when idle; shows a tooltip on hover.
 * — Chapter ticks (optional) appear along the rail for quick navigation.
 */
export function CreatureScrollbar({ scrollRef, ticks, overrideEmotion, accessory, streak, level, heatmap, totalPages }: Props) {
  const [pct, setPct] = useState(0);
  const [state, setState] = useState<CreatureState>('idle');
  const railRef = useRef<HTMLDivElement>(null);
  const lastRef = useRef({ t: 0, y: 0 });
  const runTimer = useRef<number | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const max = el.scrollHeight - el.clientHeight;
      setPct(max > 0 ? el.scrollTop / max : 0);
      const now = performance.now();
      const dt = now - lastRef.current.t;
      const dy = Math.abs(el.scrollTop - lastRef.current.y);
      if (dt > 0 && dy / dt > 0.3) {
        setState((s) => (s === 'dragging' ? s : 'running'));
        if (runTimer.current) window.clearTimeout(runTimer.current);
        runTimer.current = window.setTimeout(
          () => setState((s) => (s === 'dragging' ? s : 'idle')),
          280,
        );
      }
      lastRef.current = { t: now, y: el.scrollTop };
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener('scroll', onScroll);
  }, [scrollRef]);

  const startDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    setState('dragging');
    const onMove = (ev: PointerEvent) => {
      const el = scrollRef.current;
      const rail = railRef.current;
      if (!el || !rail) return;
      const r = rail.getBoundingClientRect();
      const p = Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height));
      el.scrollTop = p * (el.scrollHeight - el.clientHeight);
    };
    const onUp = () => {
      setState('idle');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const effectiveEmotion = effectiveFor(state, overrideEmotion);

  // While dragging, compute the target page + nearest chapter for a helpful tooltip
  const dragPage = totalPages && totalPages > 1
    ? Math.max(1, Math.min(totalPages, Math.round(pct * totalPages) + 1))
    : null;
  const dragChapter = dragPage && ticks && ticks.length > 0
    ? [...ticks].reverse().find((t) => t.pct <= pct + 0.005)
    : null;

  const onRailClick = (e: React.MouseEvent) => {
    // Click on rail (not on creature) → jump to that position
    if ((e.target as HTMLElement).closest('.creature')) return;
    const el = scrollRef.current;
    const rail = railRef.current;
    if (!el || !rail) return;
    const r = rail.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
    el.scrollTo({ top: p * (el.scrollHeight - el.clientHeight), behavior: 'smooth' });
  };

  return (
    <div className="creature-track" aria-hidden>
      <div className="creature-rail" ref={railRef} onClick={onRailClick}>
        {/* #5 Reading heatmap — colored dwell-time bands */}
        {heatmap && totalPages && totalPages > 1 && Object.entries(heatmap).map(([pStr, secs]) => {
          const page = Number(pStr);
          if (!Number.isFinite(page) || page < 1 || page > totalPages) return null;
          const band = heatColorForSeconds(secs);
          if (!band) return null;
          return (
            <div
              key={`heat-${page}`}
              className="heatmap-band"
              style={{
                top: `${((page - 1) / (totalPages - 1)) * 100}%`,
                background: band.color,
              }}
              title={`第 ${page} 页 · ${band.label}（${Math.round(secs)}s）`}
            />
          );
        })}
        {ticks?.map((t, i) => (
          <div
            key={i}
            className="chapter-tick-wrap"
            style={{ top: `${t.pct * 100}%` }}
          >
            <div className="chapter-tick" />
            {(t.title || t.page) && (
              <div className="chapter-tick-label">
                {t.title && <span className="chapter-tick-title">{t.title}</span>}
                {t.page != null && <span className="chapter-tick-page">p.{t.page}</span>}
              </div>
            )}
          </div>
        ))}
      </div>
      <div
        className={`creature ${motionClass(effectiveEmotion)}`}
        style={{ top: `${pct * 100}%` }}
        onPointerDown={startDrag}
      >
        <Taitai emotion={effectiveEmotion} accessory={accessory} streak={streak} level={level} keyId="sb" />
        {effectiveEmotion === 'dragging' && dragPage ? (
          <div className="creature-tip creature-tip--drag">
            <div className="creature-tip-page">p.{dragPage}</div>
            {dragChapter && (
              <div className="creature-tip-chapter">{dragChapter.title}</div>
            )}
            {totalPages && (
              <div className="creature-tip-total">/ {totalPages}</div>
            )}
          </div>
        ) : (
          <div className="creature-tip">🌱 {tipFor(effectiveEmotion)}</div>
        )}
      </div>
    </div>
  );
}

function effectiveFor(
  state: CreatureState,
  override: TaitaiEmotion | null | undefined,
): TaitaiEmotion {
  // Drag and run are always driven by scroll interaction (highest priority)
  if (state === 'dragging') return 'dragging';
  if (state === 'running') return 'running';
  // Otherwise caller-provided mood wins
  return override ?? 'idle';
}

function motionClass(e: TaitaiEmotion): string {
  if (e === 'dragging') return 'dragging';
  if (e === 'running') return 'running';
  return 'idle';
}

function tipFor(e: TaitaiEmotion): string {
  switch (e) {
    case 'sleepy':   return '苔苔打盹中…摇我一下';
    case 'clapping': return '好棒！苔苔给你鼓掌 👏';
    case 'proud':    return '读完啦！苔苔为你骄傲 🌟';
    case 'curious':  return '新书开卷～苔苔好奇地看着';
    case 'thinking': return '苔苔在思考中…';
    default:         return '拖我翻页 · 苔苔';
  }
}
