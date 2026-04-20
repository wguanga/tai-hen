import { beforeEach, describe, expect, it } from 'vitest';
import { act, render } from '@testing-library/react';
import { AppStoreProvider, useAppStore } from '../store/app-store';
import { useOpenTabs } from './useOpenTabs';
import type { Paper } from '../types';

const p = (id: string, title: string): Paper => ({
  id, title, authors: [], year: 2024,
  file_path: `papers/${id}.pdf`, total_pages: 3, tags: [],
  created_at: '2026-01-01T00:00:00.000Z',
});

function setup() {
  const captured: {
    store: ReturnType<typeof useAppStore> | null;
    tabs: ReturnType<typeof useOpenTabs> | null;
  } = { store: null, tabs: null };
  function Harness() {
    captured.store = useAppStore();
    captured.tabs = useOpenTabs();
    return null;
  }
  render(<AppStoreProvider><Harness /></AppStoreProvider>);
  return captured;
}

beforeEach(() => {
  localStorage.clear();
});

describe('useOpenTabs', () => {
  it('promotes the currentPaper to the front when OPEN_PAPER fires', () => {
    const c = setup();
    act(() => { c.store!.dispatch({ type: 'SET_PAPERS', papers: [p('a', 'A'), p('b', 'B')] }); });
    act(() => {
      c.store!.dispatch({ type: 'OPEN_PAPER', paper: p('a', 'A'), highlights: [], notes: [] });
    });
    expect(c.tabs!.tabs.map((t) => t.id)).toEqual(['a']);
    act(() => {
      c.store!.dispatch({ type: 'OPEN_PAPER', paper: p('b', 'B'), highlights: [], notes: [] });
    });
    expect(c.tabs!.tabs.map((t) => t.id)).toEqual(['b', 'a']);
  });

  it('drops ids that no longer match any known paper', () => {
    const c = setup();
    act(() => { c.store!.dispatch({ type: 'SET_PAPERS', papers: [p('a', 'A'), p('b', 'B')] }); });
    act(() => {
      c.store!.dispatch({ type: 'OPEN_PAPER', paper: p('a', 'A'), highlights: [], notes: [] });
    });
    act(() => {
      c.store!.dispatch({ type: 'OPEN_PAPER', paper: p('b', 'B'), highlights: [], notes: [] });
    });
    // Remove paper "a" from the papers list → tab for "a" should disappear
    act(() => { c.store!.dispatch({ type: 'REMOVE_PAPER', id: 'a' }); });
    expect(c.tabs!.tabs.map((t) => t.id)).toEqual(['b']);
  });

  it('close() removes a tab', () => {
    const c = setup();
    act(() => { c.store!.dispatch({ type: 'SET_PAPERS', papers: [p('a', 'A'), p('b', 'B')] }); });
    act(() => {
      c.store!.dispatch({ type: 'OPEN_PAPER', paper: p('a', 'A'), highlights: [], notes: [] });
    });
    act(() => {
      c.store!.dispatch({ type: 'OPEN_PAPER', paper: p('b', 'B'), highlights: [], notes: [] });
    });
    expect(c.tabs!.tabs.map((t) => t.id)).toEqual(['b', 'a']);
    act(() => { c.tabs!.close('a'); });
    expect(c.tabs!.tabs.map((t) => t.id)).toEqual(['b']);
  });
});
