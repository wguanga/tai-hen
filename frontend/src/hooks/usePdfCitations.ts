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
        // Skip already-processed
        if ((span as HTMLElement).dataset.citeProcessed === '1') return;
        // Skip spans that already contain nested elements (we inject cite-mark spans)
        if (span.querySelector('.cite-mark')) {
          (span as HTMLElement).dataset.citeProcessed = '1';
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
          html += `<span class="cite-mark" data-cite-nums="${m[1]}" style="color:#4f46e5;border-bottom:1px dotted #4f46e5;cursor:pointer;pointer-events:auto;">${escapeHtml(m[0])}</span>`;
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
