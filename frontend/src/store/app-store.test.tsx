import { describe, expect, it } from 'vitest';
import { act, render } from '@testing-library/react';
import { AppStoreProvider, useAppStore } from './app-store';
import type { Highlight, Note, Paper } from '../types';

const paper: Paper = {
  id: 'p1', title: 'Test', authors: ['Alice'], year: 2023,
  file_path: 'papers/p1.pdf', total_pages: 5, tags: [], created_at: '2026-01-01T00:00:00.000Z',
};

const highlight: Highlight = {
  id: 'h1', paper_id: 'p1', text: 'foo', color: 'yellow', page: 1,
  position: { x: 0, y: 0, width: 100, height: 15, rects: [] },
  created_at: '2026-01-01T00:00:00.000Z',
};

const note: Note = {
  id: 'n1', paper_id: 'p1', highlight_id: 'h1', title: 't', content: 'c',
  source: 'manual', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
};

function setup() {
  let captured: ReturnType<typeof useAppStore> | null = null;
  function Harness() {
    captured = useAppStore();
    return null;
  }
  render(
    <AppStoreProvider>
      <Harness />
    </AppStoreProvider>,
  );
  return () => captured!;
}

describe('app-store reducer', () => {
  it('starts with default state', () => {
    const get = setup();
    expect(get().state.papers).toEqual([]);
    expect(get().state.currentPaper).toBeNull();
    expect(get().state.activeColor).toBe('yellow');
    expect(get().state.streaming).toBe(false);
  });

  it('SET_PAPERS replaces list', () => {
    const get = setup();
    act(() => get().dispatch({ type: 'SET_PAPERS', papers: [paper] }));
    expect(get().state.papers).toEqual([paper]);
  });

  it('ADD_PAPER prepends and dedupes', () => {
    const get = setup();
    act(() => get().dispatch({ type: 'ADD_PAPER', paper }));
    act(() => get().dispatch({ type: 'ADD_PAPER', paper: { ...paper, title: 'Updated' } }));
    expect(get().state.papers).toHaveLength(1);
    expect(get().state.papers[0].title).toBe('Updated');
  });

  it('OPEN_PAPER sets current + loads children + clears chat', () => {
    const get = setup();
    act(() => get().dispatch({ type: 'CHAT_START', userMessage: { role: 'user', content: 'q' } }));
    act(() => get().dispatch({
      type: 'OPEN_PAPER', paper, highlights: [highlight], notes: [note],
    }));
    const s = get().state;
    expect(s.currentPaper).toEqual(paper);
    expect(s.highlights).toEqual([highlight]);
    expect(s.notes).toEqual([note]);
    expect(s.messages).toEqual([]);
    expect(s.streamBuffer).toBe('');
  });

  it('REMOVE_PAPER clears currentPaper if it matches', () => {
    const get = setup();
    act(() => get().dispatch({ type: 'OPEN_PAPER', paper, highlights: [], notes: [] }));
    act(() => get().dispatch({ type: 'REMOVE_PAPER', id: 'p1' }));
    expect(get().state.currentPaper).toBeNull();
  });

  it('ADD/UPDATE/REMOVE_HIGHLIGHT lifecycle', () => {
    const get = setup();
    act(() => get().dispatch({ type: 'ADD_HIGHLIGHT', highlight }));
    expect(get().state.highlights).toHaveLength(1);
    act(() => get().dispatch({ type: 'UPDATE_HIGHLIGHT', id: 'h1', patch: { color: 'blue' } }));
    expect(get().state.highlights[0].color).toBe('blue');
    act(() => get().dispatch({ type: 'REMOVE_HIGHLIGHT', id: 'h1' }));
    expect(get().state.highlights).toHaveLength(0);
  });

  it('ADD_NOTE prepends, UPDATE patches, REMOVE filters', () => {
    const get = setup();
    act(() => get().dispatch({ type: 'ADD_NOTE', note }));
    const older: Note = { ...note, id: 'n0', created_at: '2025-01-01T00:00:00.000Z' };
    act(() => get().dispatch({ type: 'ADD_NOTE', note: older }));
    expect(get().state.notes[0].id).toBe('n0'); // last added is at front
    act(() => get().dispatch({ type: 'UPDATE_NOTE', id: 'n1', patch: { content: 'new' } }));
    expect(get().state.notes.find((n) => n.id === 'n1')!.content).toBe('new');
    act(() => get().dispatch({ type: 'REMOVE_NOTE', id: 'n1' }));
    expect(get().state.notes).toHaveLength(1);
  });

  it('CHAT flow: start, chunk, done', () => {
    const get = setup();
    act(() => get().dispatch({ type: 'CHAT_START', userMessage: { role: 'user', content: 'q' } }));
    expect(get().state.streaming).toBe(true);
    expect(get().state.messages).toHaveLength(1);
    act(() => get().dispatch({ type: 'CHAT_CHUNK', text: 'hi ' }));
    act(() => get().dispatch({ type: 'CHAT_CHUNK', text: 'there' }));
    expect(get().state.streamBuffer).toBe('hi there');
    act(() => get().dispatch({ type: 'CHAT_DONE', finalText: 'hi there' }));
    expect(get().state.streaming).toBe(false);
    expect(get().state.messages).toHaveLength(2);
    expect(get().state.messages[1].content).toBe('hi there');
    expect(get().state.streamBuffer).toBe('');
  });

  it('CHAT_ERROR ends streaming with error marker', () => {
    const get = setup();
    act(() => get().dispatch({ type: 'CHAT_START', userMessage: { role: 'user', content: 'q' } }));
    act(() => get().dispatch({ type: 'CHAT_ERROR', text: 'boom' }));
    expect(get().state.streaming).toBe(false);
    expect(get().state.messages.at(-1)!.content).toContain('boom');
  });

  it('CHAT_RESET clears messages and buffer', () => {
    const get = setup();
    act(() => get().dispatch({ type: 'CHAT_START', userMessage: { role: 'user', content: 'q' } }));
    act(() => get().dispatch({ type: 'CHAT_RESET' }));
    expect(get().state.messages).toEqual([]);
    expect(get().state.streaming).toBe(false);
  });

  it('SET_ACTIVE_COLOR / SET_ACTIVE_HIGHLIGHT', () => {
    const get = setup();
    act(() => get().dispatch({ type: 'SET_ACTIVE_COLOR', color: 'purple' }));
    expect(get().state.activeColor).toBe('purple');
    act(() => get().dispatch({ type: 'SET_ACTIVE_HIGHLIGHT', highlight }));
    expect(get().state.activeHighlight).toEqual(highlight);
  });

  it('REMOVE_FOLDER orphans in-memory papers (sets folder_id → null)', () => {
    const get = setup();
    const folder = { id: 'f1', name: 'tmp', color: null, sort_order: 0, paper_count: 1, created_at: '2026-01-01T00:00:00.000Z' };
    const filedPaper = { ...paper, folder_id: 'f1' };
    act(() => get().dispatch({ type: 'SET_FOLDERS', folders: [folder] }));
    act(() => get().dispatch({ type: 'ADD_PAPER', paper: filedPaper }));
    act(() => get().dispatch({ type: 'REMOVE_FOLDER', id: 'f1' }));
    expect(get().state.folders).toEqual([]);
    // paper kept, but folder_id nulled
    const p = get().state.papers.find((x) => x.id === 'p1')!;
    expect(p.folder_id).toBeNull();
  });

  it('UPDATE_FOLDER replaces by id', () => {
    const get = setup();
    const f0 = { id: 'f1', name: 'old', color: null, sort_order: 0, paper_count: 0, created_at: '2026-01-01T00:00:00.000Z' };
    const f1 = { ...f0, name: 'new' };
    act(() => get().dispatch({ type: 'SET_FOLDERS', folders: [f0] }));
    act(() => get().dispatch({ type: 'UPDATE_FOLDER', folder: f1 }));
    expect(get().state.folders[0].name).toBe('new');
  });
});
