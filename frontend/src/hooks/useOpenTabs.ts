import { useCallback, useEffect, useState } from 'react';
import { useAppStore } from '../store/app-store';

const LS_KEY = 'open_tabs_v1';
const MAX_TABS = 8;

/**
 * Recently-opened paper IDs, persisted in localStorage. When a paper is opened
 * via the normal flow, we promote its ID to the front; pinning the current
 * paper here means tab order survives reloads.
 *
 * The tab bar itself reads `state.papers` for titles, so we only store IDs.
 */
export function useOpenTabs() {
  const { state } = useAppStore();
  const [ids, setIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
    } catch {
      return [];
    }
  });

  const persist = useCallback((next: string[]) => {
    setIds(next);
    try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch {}
  }, []);

  // Whenever currentPaper changes, make sure it's at the front of the list.
  useEffect(() => {
    const cp = state.currentPaper;
    if (!cp) return;
    setIds((prev) => {
      if (prev[0] === cp.id) return prev;
      const filtered = prev.filter((x) => x !== cp.id);
      const next = [cp.id, ...filtered].slice(0, MAX_TABS);
      try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [state.currentPaper?.id]);

  // Drop ids that no longer exist (e.g. paper was deleted)
  useEffect(() => {
    if (ids.length === 0) return;
    const existing = new Set(state.papers.map((p) => p.id));
    const filtered = ids.filter((id) => existing.has(id));
    if (filtered.length !== ids.length) persist(filtered);
  }, [state.papers, ids, persist]);

  const close = useCallback((id: string) => {
    persist(ids.filter((x) => x !== id));
  }, [ids, persist]);

  const tabs = ids
    .map((id) => state.papers.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => !!p);

  return { tabs, close };
}
