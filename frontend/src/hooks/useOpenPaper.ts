import { useCallback } from 'react';
import { api } from '../api';
import { useAppStore } from '../store/app-store';

/**
 * Single entry point for "open a paper" — used by both the sidebar paper list
 * and the multi-tab bar. Fetches paper + highlights + notes in parallel and
 * fires OPEN_PAPER, then kicks off a references fetch in the background.
 */
export function useOpenPaper() {
  const { dispatch } = useAppStore();
  return useCallback(async (id: string) => {
    const [paper, hl, notes] = await Promise.all([
      api.getPaper(id),
      api.listHighlights(id),
      api.listNotes(id),
    ]);
    dispatch({ type: 'OPEN_PAPER', paper, highlights: hl.items, notes: notes.items });
    api.getReferences(id)
      .then((r) => dispatch({ type: 'SET_REFERENCES', references: r.items }))
      .catch(() => {});
    return paper;
  }, [dispatch]);
}
