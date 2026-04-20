import { useCallback, useEffect, useRef, useState } from 'react';

export type ResizeSide = 'right' | 'left' | 'top' | 'bottom';

interface Options {
  storageKey: string;
  initial: number;
  min: number;
  max: number;
  /** Which edge of the panel the drag handle lives on.
   *  - 'right': handle on panel's right edge; drag right → grow (e.g. LeftSidebar)
   *  - 'left':  handle on panel's left edge;  drag left  → grow (e.g. RightPanel)
   *  - 'top':   handle on panel's top edge;   drag up    → grow (e.g. bottom Notes section)
   *  - 'bottom':handle on panel's bottom edge;drag down  → grow                         */
  side: ResizeSide;
}

/** Returns { size, startDrag, resetting } and persists size across reloads. */
export function useResizable({ storageKey, initial, min, max, side }: Options) {
  const [size, setSize] = useState<number>(() => {
    try {
      const v = localStorage.getItem(storageKey);
      const n = v ? Number(v) : initial;
      return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : initial;
    } catch {
      return initial;
    }
  });
  const sizeRef = useRef(size);
  sizeRef.current = size;

  useEffect(() => {
    try { localStorage.setItem(storageKey, String(size)); } catch { /* ignore */ }
  }, [storageKey, size]);

  const startDrag = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const isHorizontal = side === 'right' || side === 'left';
    const startPos = isHorizontal ? e.clientX : e.clientY;
    const startSize = sizeRef.current;
    document.body.style.cursor = isHorizontal ? 'ew-resize' : 'ns-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev: PointerEvent) => {
      const curPos = isHorizontal ? ev.clientX : ev.clientY;
      let delta = curPos - startPos;
      // For "left" and "top" handles, dragging backward grows the panel
      if (side === 'left' || side === 'top') delta = -delta;
      const next = Math.max(min, Math.min(max, startSize + delta));
      setSize(next);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [side, min, max]);

  const reset = useCallback(() => setSize(initial), [initial]);

  return { size, startDrag, reset };
}
