import { describe, expect, it } from 'vitest';
import { expandAround } from './usePageVirtualization';

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
