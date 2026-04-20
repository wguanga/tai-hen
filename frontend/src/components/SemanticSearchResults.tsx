import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface Hit { page: number; excerpt: string; why: string }

/**
 * Listens for `nl-search-results` events (fired by the NL command palette
 * after a /ai/semantic_search response) and shows a centered popover with
 * clickable result cards.
 */
export function SemanticSearchResults() {
  const [state, setState] = useState<{ query: string; hits: Hit[] } | null>(null);

  useEffect(() => {
    const onResults = (e: Event) => {
      const d = (e as CustomEvent).detail as { query: string; hits: Hit[] } | undefined;
      if (!d) return;
      setState(d);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setState(null); };
    window.addEventListener('nl-search-results', onResults);
    window.addEventListener('keydown', onEsc);
    return () => {
      window.removeEventListener('nl-search-results', onResults);
      window.removeEventListener('keydown', onEsc);
    };
  }, []);

  if (!state) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[58] flex items-start justify-center pt-[10vh] px-6 bg-black/30 backdrop-blur-sm"
      onClick={() => setState(null)}
    >
      <div
        className="w-full max-w-2xl rounded-2xl glass-panel border border-indigo-200 dark:border-indigo-800/60 shadow-[0_30px_80px_rgba(80,40,120,.45)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-indigo-100 dark:border-indigo-900/40 bg-gradient-to-r from-indigo-500/10 to-fuchsia-500/10">
          <div className="flex items-center gap-2">
            <span className="text-base">🔎</span>
            <span className="font-semibold text-sm">语义搜索结果</span>
            <span className="text-xs text-gray-400 ml-1">
              · "{state.query.length > 40 ? state.query.slice(0, 40) + '…' : state.query}"
            </span>
          </div>
          <button
            onClick={() => setState(null)}
            className="text-xs text-gray-400 hover:text-gray-600 px-2 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            Esc
          </button>
        </div>
        <div className="p-4 max-h-[60vh] overflow-y-auto space-y-2">
          {state.hits.length === 0 && (
            <div className="text-center text-sm text-gray-400 py-8">
              🌙 没找到明显相关的段落
            </div>
          )}
          {state.hits.map((hit, i) => (
            <button
              key={i}
              onClick={() => {
                (window as any).__goToPage?.(hit.page);
                setState(null);
              }}
              className="w-full text-left p-3 rounded-xl border border-indigo-100 dark:border-indigo-900/40 bg-gradient-to-br from-white/70 via-indigo-50/50 to-fuchsia-50/40 dark:from-gray-800/60 dark:via-indigo-900/20 dark:to-fuchsia-900/20 hover:border-fuchsia-300 hover:shadow-[0_6px_20px_rgba(168,85,247,0.2)] transition-all group"
            >
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded bg-fuchsia-100 dark:bg-fuchsia-900/40 text-fuchsia-700 dark:text-fuchsia-300 font-semibold">
                  p.{hit.page}
                </span>
                <span className="text-[11px] text-gray-500 dark:text-gray-400 italic">
                  {hit.why}
                </span>
              </div>
              <div className="text-xs leading-relaxed text-gray-700 dark:text-gray-200">
                "{hit.excerpt}"
              </div>
              <div className="text-[10px] text-right text-fuchsia-500 opacity-0 group-hover:opacity-100 mt-1">
                跳到第 {hit.page} 页 →
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
