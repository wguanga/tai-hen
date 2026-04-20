import { useEffect, useRef, useState } from 'react';

const LS_PREFIX = 'reading_heatmap_';
const COMMIT_INTERVAL_MS = 15_000; // flush to LS at most every 15s while reading
const MIN_COUNTABLE_MS = 1_000;     // ignore flips shorter than 1s

/** Per-paper {page → cumulative seconds spent} map, persisted to localStorage.
 *  Updated every time the user switches page. On unmount, the dwell time for
 *  the current page is also committed. */
export function useReadingHeatmap(paperId: string | undefined, currentPage: number) {
  const [heatmap, setHeatmap] = useState<Record<number, number>>({});
  const pageRef = useRef(currentPage);
  const pageStartRef = useRef(Date.now());
  const lastPersistRef = useRef(Date.now());

  // Load from LS when paper changes
  useEffect(() => {
    if (!paperId) { setHeatmap({}); return; }
    try {
      const raw = localStorage.getItem(LS_PREFIX + paperId);
      setHeatmap(raw ? (JSON.parse(raw) as Record<number, number>) : {});
    } catch {
      setHeatmap({});
    }
    pageRef.current = currentPage;
    pageStartRef.current = Date.now();
    lastPersistRef.current = Date.now();
    // we intentionally don't depend on currentPage here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paperId]);

  // On page change: commit elapsed time to the previous page
  useEffect(() => {
    if (!paperId) return;
    const now = Date.now();
    const prev = pageRef.current;
    const elapsedMs = now - pageStartRef.current;
    if (prev !== currentPage && elapsedMs > MIN_COUNTABLE_MS) {
      const seconds = Math.min(elapsedMs / 1000, 900); // cap single-stint at 15 min
      setHeatmap((h) => {
        const next = { ...h, [prev]: (h[prev] || 0) + seconds };
        try { localStorage.setItem(LS_PREFIX + paperId, JSON.stringify(next)); } catch { /* ignore */ }
        return next;
      });
    }
    pageRef.current = currentPage;
    pageStartRef.current = now;
    lastPersistRef.current = now;
  }, [currentPage, paperId]);

  // Persist on beforeunload / unmount too, so very long dwell isn't lost
  useEffect(() => {
    if (!paperId) return;
    const flush = () => {
      const elapsedMs = Date.now() - pageStartRef.current;
      if (elapsedMs < MIN_COUNTABLE_MS) return;
      try {
        const raw = localStorage.getItem(LS_PREFIX + paperId);
        const h: Record<number, number> = raw ? JSON.parse(raw) : {};
        const seconds = Math.min(elapsedMs / 1000, 900);
        h[pageRef.current] = (h[pageRef.current] || 0) + seconds;
        localStorage.setItem(LS_PREFIX + paperId, JSON.stringify(h));
      } catch { /* ignore */ }
    };
    // Periodic flush so even long single-page dwell gets persisted
    const t = window.setInterval(() => {
      const now = Date.now();
      if (now - lastPersistRef.current > COMMIT_INTERVAL_MS) {
        flush();
        pageStartRef.current = now;
        lastPersistRef.current = now;
      }
    }, COMMIT_INTERVAL_MS);
    window.addEventListener('beforeunload', flush);
    return () => {
      flush();
      window.clearInterval(t);
      window.removeEventListener('beforeunload', flush);
    };
  }, [paperId]);

  return heatmap;
}

/** Map seconds-spent → color band for visual heatmap. */
export function heatColorForSeconds(s: number): { color: string; label: string } | null {
  if (s < 5) return null;
  if (s < 15)  return { color: 'rgba(129, 140, 248, 0.55)', label: '扫过' };
  if (s < 45)  return { color: 'rgba(56, 189, 248, 0.70)', label: '浏览' };
  if (s < 120) return { color: 'rgba(250, 204, 21, 0.80)', label: '认真读' };
  if (s < 300) return { color: 'rgba(251, 146, 60, 0.85)', label: '深读' };
  return { color: 'rgba(239, 68, 68, 0.90)', label: '反复研读' };
}
