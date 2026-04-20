import { useEffect, useRef, useState } from 'react';
import { api } from '../api';

interface GlossaryEntry {
  term: string;
  definition: string;
  paperId: string | null;
}

/**
 * Cross-paper glossary sharing —
 * Once loaded, every PDF text span is scanned for known terms. Matching
 * segments get underlined + hoverable so you can see YOUR definition
 * (written in any paper) while reading any paper.
 *
 * Terms <= 1 char are skipped to avoid noise. Word boundaries enforced for
 * English. Chinese terms matched directly (no concept of boundaries).
 */
export function useGlossaryHighlight(
  scrollRef: React.RefObject<HTMLElement | null>,
  enabled: boolean,
) {
  const [entries, setEntries] = useState<GlossaryEntry[] | null>(null);
  const mapRef = useRef<Map<string, GlossaryEntry> | null>(null);

  // Fetch all terms once on mount
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    api.listGlossary()
      .then((r) => {
        if (cancelled) return;
        const list = r.items
          .map((e) => ({ term: e.term.trim(), definition: e.definition, paperId: e.paper_id }))
          .filter((e) => e.term.length >= 2);
        const map = new Map<string, GlossaryEntry>();
        // Prefer the longest definition for duplicate terms (user probably wrote more later)
        for (const e of list) {
          const key = e.term.toLowerCase();
          const existing = map.get(key);
          if (!existing || e.definition.length > existing.definition.length) map.set(key, e);
        }
        mapRef.current = map;
        setEntries(list);
      })
      .catch(() => { if (!cancelled) setEntries([]); });
    return () => { cancelled = true; };
  }, [enabled]);

  // Scan text layer whenever entries or scroll ref are ready
  useEffect(() => {
    if (!enabled || !entries || entries.length === 0) return;
    const root = scrollRef.current;
    if (!root) return;

    const map = mapRef.current!;
    // Precompile one big regex of all term literals (escape regex specials)
    const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(
      '(' + entries.map((e) => escape(e.term)).sort((a, b) => b.length - a.length).join('|') + ')',
      'gi',
    );

    const processLayer = (layer: Element) => {
      const spans = layer.querySelectorAll('span');
      spans.forEach((span) => {
        const el = span as HTMLElement;
        if (el.dataset.glossaryProcessed === '1') return;
        if (el.classList.contains('cite-mark') || el.classList.contains('glossary-term')) {
          el.dataset.glossaryProcessed = '1';
          return;
        }
        if (span.querySelector('.glossary-term, .cite-mark')) {
          el.dataset.glossaryProcessed = '1';
          return;
        }
        const text = span.textContent || '';
        if (!text) return;

        let m: RegExpExecArray | null;
        let lastIdx = 0;
        let html = '';
        let any = false;
        pattern.lastIndex = 0;
        while ((m = pattern.exec(text)) !== null) {
          const matched = m[0];
          const entry = map.get(matched.toLowerCase());
          if (!entry) continue;
          any = true;
          html += escapeHtml(text.slice(lastIdx, m.index));
          // data-gloss-term stores the canonical term; definition pulled on hover
          html += `<span class="glossary-term" data-gloss-term="${escapeHtml(entry.term)}">${escapeHtml(matched)}</span>`;
          lastIdx = m.index + matched.length;
        }
        if (any) {
          html += escapeHtml(text.slice(lastIdx));
          span.innerHTML = html;
        }
        el.dataset.glossaryProcessed = '1';
      });
    };

    const processAll = () => {
      root.querySelectorAll('.react-pdf__Page__textContent').forEach(processLayer);
    };
    processAll();

    const observer = new MutationObserver(processAll);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [enabled, entries, scrollRef]);

  /** Lookup a term's definition (used by the tooltip). */
  const lookup = (term: string): GlossaryEntry | undefined => {
    return mapRef.current?.get(term.toLowerCase());
  };

  return { lookup, entryCount: entries?.length ?? 0 };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
