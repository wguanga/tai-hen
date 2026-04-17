import { useCallback, useEffect, useRef, useState } from 'react';

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

function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

export interface VirtualizationControls {
  /** Set of page numbers that should render real PDF content. */
  renderedPages: Set<number>;
  /** Returns a **stable per-page** ref callback so React doesn't re-register on every render. */
  getPageRef: (pageNum: number) => (el: HTMLElement | null) => void;
  /** Current registered element for a page (or undefined). */
  getPageElement: (pageNum: number) => HTMLElement | undefined;
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
  const refCallbacksRef = useRef<Map<number, (el: HTMLElement | null) => void>>(new Map());

  // Mutate-in-place register; guarded against re-registering the same element.
  const registerPage = useCallback((pageNum: number, el: HTMLElement | null) => {
    const prev = pageElsRef.current.get(pageNum);
    if (prev === el) return; // no-op
    if (prev) {
      observerRef.current?.unobserve(prev);
      pageElsRef.current.delete(pageNum);
    }
    if (el) {
      pageElsRef.current.set(pageNum, el);
      observerRef.current?.observe(el);
    }
  }, []);

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
        const merged = new Set(prev);
        expanded.forEach((n) => merged.add(n));
        // Cap: if more than 20 pages loaded, keep only nearest 10 to visible
        if (merged.size > 20) {
          const centers = [...visible];
          const keep = new Set<number>();
          centers.forEach((c) => {
            for (let i = Math.max(1, c - 5); i <= Math.min(pageCount, c + 5); i++) keep.add(i);
          });
          // 🔴 Return prev reference if content unchanged — prevents re-render loops
          return setsEqual(prev, keep) ? prev : keep;
        }
        return setsEqual(prev, merged) ? prev : merged;
      });
    }, { root: scrollRoot.current, rootMargin: ROOT_MARGIN, threshold: 0 });

    observerRef.current = obs;
    // Observe any pages already registered (after a pageCount transition)
    pageElsRef.current.forEach((el) => obs.observe(el));
    return () => { obs.disconnect(); };
  }, [pageCount, scrollRoot]);

  // Stable per-pageNum ref callback. Same function returned for same pageNum across renders
  // so React does not re-invoke the ref on every render (which would unobserve+reobserve
  // the element and trigger IntersectionObserver's initial notification again — causing
  // an infinite re-render loop).
  const getPageRef = useCallback((pageNum: number) => {
    let cb = refCallbacksRef.current.get(pageNum);
    if (!cb) {
      cb = (el: HTMLElement | null) => registerPage(pageNum, el);
      refCallbacksRef.current.set(pageNum, cb);
    }
    return cb;
  }, [registerPage]);

  const setPageHeight = useCallback((pageNum: number, h: number) => {
    const cur = heightsRef.current.get(pageNum);
    if (cur === h) return;
    heightsRef.current.set(pageNum, h);
    forceUpdate((n) => n + 1);
  }, []);

  const heightFor = useCallback((pageNum: number) => {
    return heightsRef.current.get(pageNum) ?? INITIAL_HEIGHT;
  }, []);

  const getPageElement = useCallback((pageNum: number): HTMLElement | undefined => {
    return pageElsRef.current.get(pageNum);
  }, []);

  return { renderedPages, getPageRef, getPageElement, setPageHeight, heightFor };
}
