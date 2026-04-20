import { useMemo } from 'react';
import type { Paper } from '../types';

// Minimal English + Chinese stopword set — enough to keep TF-IDF from being
// dominated by function words
const STOP = new Set([
  'a', 'an', 'the', 'of', 'for', 'to', 'in', 'on', 'and', 'or', 'with', 'by',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'at', 'as', 'from', 'that',
  'this', 'these', 'those', 'it', 'its', 'but', 'not', 'via', 'using', 'use',
  'based', 'paper', 'study', 'research', 'novel', 'new', 'approach',
  '的', '和', '与', '了', '基于', '方法', '研究', '一种', '使用', '通过',
]);

function tokenize(text: string): string[] {
  if (!text) return [];
  // Split on non-alphanumeric/CJK boundaries
  const raw = text.toLowerCase().match(/[a-z0-9]+|[\u4e00-\u9fff]{2,}/g) || [];
  return raw.filter((t) => t.length >= 2 && !STOP.has(t));
}

function vector(tokens: string[]): Map<string, number> {
  const v = new Map<string, number>();
  for (const t of tokens) v.set(t, (v.get(t) ?? 0) + 1);
  return v;
}

function cosine(a: Map<string, number>, b: Map<string, number>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const v of a.values()) na += v * v;
  for (const v of b.values()) nb += v * v;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const [k, v] of small) {
    const w = large.get(k);
    if (w) dot += v * w;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

function docText(p: Paper): string {
  return `${p.title} ${p.authors.join(' ')} ${(p.tags || []).join(' ')}`;
}

/** Returns the top-K most related OTHER papers in the library, sorted by similarity. */
export function useRelatedPapers(
  current: Paper | null | undefined,
  all: Paper[],
  k = 3,
): { paper: Paper; similarity: number }[] {
  return useMemo(() => {
    if (!current || all.length < 2) return [];
    const curVec = vector(tokenize(docText(current)));
    const scored = all
      .filter((p) => p.id !== current.id)
      .map((p) => ({ paper: p, similarity: cosine(curVec, vector(tokenize(docText(p)))) }))
      .filter((x) => x.similarity > 0.04) // filter near-noise
      .sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, k);
  }, [current?.id, all, k]);
}
