import { useCallback, useEffect, useRef, useState } from 'react';

const LS_KEY = 'last_active_paper';
const FRESHNESS_MS = 7 * 24 * 3600 * 1000; // offer resume within a week

interface LastActive {
  id: string;
  title: string;
  page: number;
  totalPages: number;
  ts: number;
}

function readLast(): LastActive | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as LastActive;
    if (!v?.id || typeof v.page !== 'number') return null;
    if (Date.now() - v.ts > FRESHNESS_MS) return null;
    return v;
  } catch { return null; }
}

function writeLast(v: LastActive): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(v)); } catch { /* ignore */ }
}

/** Offers a resume-reading banner on first paint when no paper is open yet.
 *  User can dismiss (temporarily, this mount) or accept (calls onAccept). */
export function useResumeReminder(opts: {
  currentPaperId: string | undefined;
  paperTitle: string | undefined;
  currentPage: number;
  totalPages: number;
  hasPaperOpen: boolean;
}) {
  const { currentPaperId, paperTitle, currentPage, totalPages, hasPaperOpen } = opts;
  const [banner, setBanner] = useState<LastActive | null>(null);
  const dismissedRef = useRef(false);

  // On mount (or when user closes paper), check if we have a recent record
  useEffect(() => {
    if (hasPaperOpen || dismissedRef.current) { setBanner(null); return; }
    setBanner(readLast());
  }, [hasPaperOpen]);

  // Persist current state whenever it changes while a paper is open
  useEffect(() => {
    if (!currentPaperId || !paperTitle) return;
    writeLast({
      id: currentPaperId,
      title: paperTitle,
      page: currentPage,
      totalPages,
      ts: Date.now(),
    });
  }, [currentPaperId, paperTitle, currentPage, totalPages]);

  const dismiss = useCallback(() => {
    dismissedRef.current = true;
    setBanner(null);
  }, []);

  const clearPersisted = useCallback(() => {
    try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
  }, []);

  return { banner, dismiss, clearPersisted };
}
