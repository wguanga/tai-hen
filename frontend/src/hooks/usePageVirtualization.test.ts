import { act, renderHook } from '@testing-library/react';
import { useRef } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { expandAround, usePageVirtualization } from './usePageVirtualization';

// jsdom doesn't implement IntersectionObserver — stub it so the hook can run.
class IOStub {
  callback: IntersectionObserverCallback;
  constructor(cb: IntersectionObserverCallback) { this.callback = cb; }
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
  root = null; rootMargin = ''; thresholds = [];
}

beforeAll(() => {
  (globalThis as any).IntersectionObserver = IOStub as any;
});

describe('expandAround', () => {
  it('adds ±2 pages around each visible page', () => {
    const visible = new Set([5]);
    const result = expandAround(visible, 10);
    expect([...result].sort((a, b) => a - b)).toEqual([3, 4, 5, 6, 7]);
  });

  it('clamps to 1..pageCount', () => {
    expect([...expandAround(new Set([1]), 10)].sort((a, b) => a - b)).toEqual([1, 2, 3]);
    expect([...expandAround(new Set([10]), 10)].sort((a, b) => a - b)).toEqual([8, 9, 10]);
  });

  it('merges ranges from multiple visible pages', () => {
    const result = expandAround(new Set([3, 7]), 20);
    expect([...result].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 5, 6, 7, 8, 9].filter((v, i, a) => a.indexOf(v) === i));
  });

  it('respects custom buffer', () => {
    const result = expandAround(new Set([5]), 10, 1);
    expect([...result].sort((a, b) => a - b)).toEqual([4, 5, 6]);
  });

  it('empty visible returns empty', () => {
    expect(expandAround(new Set(), 10).size).toBe(0);
  });
});

describe('usePageVirtualization — stability', () => {
  function harness(pageCount: number) {
    return renderHook(() => {
      const scrollRef = useRef<HTMLElement>(null);
      return usePageVirtualization(pageCount, scrollRef);
    });
  }

  it('getPageRef returns the same callback instance across re-renders (prevents re-render loop)', () => {
    const { result, rerender } = harness(10);
    const cb1 = result.current.getPageRef(3);
    rerender();
    const cb2 = result.current.getPageRef(3);
    expect(cb1).toBe(cb2); // 🔴 stability is what prevents the infinite observe/unobserve loop
  });

  it('different pages get different stable callbacks', () => {
    const { result } = harness(10);
    expect(result.current.getPageRef(1)).not.toBe(result.current.getPageRef(2));
  });

  it('registering then unregistering an element is idempotent', () => {
    const { result } = harness(10);
    const div = document.createElement('div');
    div.dataset.pageNumber = '1';
    const cb = result.current.getPageRef(1);
    act(() => { cb(div); });
    expect(result.current.getPageElement(1)).toBe(div);
    // Re-register same element → still the same element
    act(() => { cb(div); });
    expect(result.current.getPageElement(1)).toBe(div);
    // Unregister
    act(() => { cb(null); });
    expect(result.current.getPageElement(1)).toBeUndefined();
  });

  it('setPageHeight triggers re-render only when height actually changes', () => {
    const { result } = harness(10);
    // Prime the cache first
    act(() => { result.current.setPageHeight(1, 900); });
    expect(result.current.heightFor(1)).toBe(900);
    // Now a no-op set with same height should not change anything
    const before = result.current;
    act(() => { result.current.setPageHeight(1, 900); });
    expect(result.current).toBe(before); // same controls object, no re-render
    // A real change updates the cached height
    act(() => { result.current.setPageHeight(1, 1200); });
    expect(result.current.heightFor(1)).toBe(1200);
  });

  it('heightFor returns default INITIAL_HEIGHT for unseen pages', () => {
    const { result } = harness(5);
    const h = result.current.heightFor(999);
    expect(h).toBeGreaterThan(500); // INITIAL_HEIGHT is 1100
  });
});

void vi; // silence unused warning if tests are trimmed
