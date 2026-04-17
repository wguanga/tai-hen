import { useEffect, useRef, useState } from 'react';

const VISIBLE_BUFFER = 2;        // Pages to pre-render around visible ones
const ROOT_MARGIN = '400px 0px'; // Trigger earlier to avoid flashing
const INITIAL_HEIGHT = 1100;     // Reasonable default for A4/Letter @ width 780

export function expandAround(visible: Set<number>, pageCount: number, buffer = VISIBLE_BUFFER): Set<number> {
  const next = new Set<number>();
  visible.forEach((n) => {
    for (let i = Math.max(1, n - buffer); i <= Math.min(pageCount, n + buffer); i++) {
      next.add(i);
    }
  });
  return next;
}

export interface VirtualizationControls {
  /** Set of page numbers that should render real PDF content. */
  renderedPages: Set<number>;
  /** Register a page wrapper element so the observer can watch it. */
  registerPage: (pageNum: number, el: HTMLElement | null) => void;
  /** Called by <Page> onRenderSuccess to cache actual page height. */
  setPageHeight: (pageNum: number, h: number) => void;
  /** Height to use for a page (measured or estimated). */
  heightFor: (pageNum: number) => number;
}

export function usePageVirtualization(
  pageCount: number,
  scrollRoot: React.RefObject<HTMLElement | null>,
): VirtualizationControls {
  const [renderedPages, setRenderedPages] = useState<Set<number>>(() => new Set([1, 2, 3]));
  const heightsRef = useRef<Map<number, number>>(new Map());
  const [, forceUpdate] = useState(0);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const pageElsRef = useRef<Map<number, HTMLElement>>(new Map());

  // (Re)create observer when pageCount changes
  useEffect(() => {
    if (pageCount === 0) return;
    observerRef.current?.disconnect();
    const obs = new IntersectionObserver((entries) => {
      const visible = new Set<number>();
      entries.forEach((e) => {
        if (e.isIntersecting) {
          const n = Number((e.target as HTMLElement).dataset.pageNumber);
          if (n) visible.add(n);
        }
      });
      if (visible.size === 0) return;
      setRenderedPages((prev) => {
        const expanded = expandAround(visible, pageCount);
        // Merge with prev to avoid unloading already-rendered pages on quick scroll
        const merged = new Set(prev);
        expanded.forEach((n) => merged.add(n));
        // Cap: if more than 20 pages loaded, keep only nearest 10 to visible
        if (merged.size > 20) {
          const centers = [...visible];
          const keep = new Set<number>();
          centers.forEach((c) => {
            for (let i = Math.max(1, c - 5); i <= Math.min(pageCount, c + 5); i++) keep.add(i);
          });
          return keep;
        }
        return merged;
      });
    }, { root: scrollRoot.current, rootMargin: ROOT_MARGIN, threshold: 0 });

    observerRef.current = obs;
    pageElsRef.current.forEach((el) => obs.observe(el));
    return () => { obs.disconnect(); };
  }, [pageCount, scrollRoot]);

  function registerPage(pageNum: number, el: HTMLElement | null) {
    if (el) {
      pageElsRef.current.set(pageNum, el);
      observerRef.current?.observe(el);
    } else {
      const existing = pageElsRef.current.get(pageNum);
      if (existing) observerRef.current?.unobserve(existing);
      pageElsRef.current.delete(pageNum);
    }
  }

  function setPageHeight(pageNum: number, h: number) {
    const cur = heightsRef.current.get(pageNum);
    if (cur === h) return;
    heightsRef.current.set(pageNum, h);
    forceUpdate((n) => n + 1);
  }

  function heightFor(pageNum: number): number {
    return heightsRef.current.get(pageNum) ?? INITIAL_HEIGHT;
  }

  return { renderedPages, registerPage, setPageHeight, heightFor };
}
