import { useEffect } from 'react';

/**
 * Decorate react-pdf text layer: find [n] (or [1,2]) substrings inside text spans
 * and wrap them with a styled inline element. Click dispatches a custom event
 * 'pdf-citation-click' with the numbers payload.
 *
 * Runs when page renders (text layer is async). Uses MutationObserver to catch
 * re-renders on zoom change.
 */
export function usePdfCitations(
  scrollRef: React.RefObject<HTMLElement | null>,
  refIndex: Map<number, string>,
) {
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || refIndex.size === 0) return;

    const processLayer = (layer: Element) => {
      const spans = layer.querySelectorAll('span');
      spans.forEach((span) => {
        const el = span as HTMLElement;
        // Skip already-processed
        if (el.dataset.citeProcessed === '1') return;
        // CRITICAL: skip cite-marks we injected ourselves, otherwise the
        // observer sees our own insertion, re-wraps [n] inside cite-mark,
        // triggers another mutation, etc. — infinite microtask loop freezes UI.
        if (el.classList.contains('cite-mark')) {
          el.dataset.citeProcessed = '1';
          return;
        }
        // Skip spans that already contain a cite-mark (already handled)
        if (span.querySelector('.cite-mark')) {
          el.dataset.citeProcessed = '1';
          return;
        }
        const text = span.textContent || '';
        if (!text) return;
        const regex = /\[(\d{1,3}(?:\s*,\s*\d{1,3})*)\]/g;
        let any = false;
        let html = '';
        let lastIdx = 0;
        let m: RegExpExecArray | null;
        while ((m = regex.exec(text)) !== null) {
          const nums = m[1].split(/\s*,\s*/).map((n) => parseInt(n, 10)).filter((n) => !isNaN(n));
          const hasAny = nums.some((n) => refIndex.has(n));
          if (!hasAny) continue;
          any = true;
          html += escapeHtml(text.slice(lastIdx, m.index));
          // Don't override the inherited `color: transparent` from react-pdf's
          // text layer — otherwise our overlay renders [n] ON TOP of the canvas
          // pixel, causing visible ghosting. Leave text transparent; only draw
          // a dotted underline + clickable box positioned to match.
          html += `<span class="cite-mark" data-cite-nums="${m[1]}" style="border-bottom:1px dotted #4f46e5;cursor:pointer;pointer-events:auto;background:rgba(79,70,229,0.08);border-radius:2px;">${escapeHtml(m[0])}</span>`;
          lastIdx = m.index + m[0].length;
        }
        if (any) {
          html += escapeHtml(text.slice(lastIdx));
          span.innerHTML = html;
        }
        (span as HTMLElement).dataset.citeProcessed = '1';
      });
    };

    const processAll = () => {
      root.querySelectorAll('.react-pdf__Page__textContent').forEach(processLayer);
    };

    processAll();
    const obs = new MutationObserver(processAll);
    obs.observe(root, { childList: true, subtree: true });

    return () => obs.disconnect();
  }, [scrollRef, refIndex]);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
