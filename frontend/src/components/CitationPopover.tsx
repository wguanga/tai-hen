import { useState } from 'react';
import { api, type ArxivHit } from '../api';
import { useAppStore } from '../store/app-store';
import { useOpenPaper } from '../hooks/useOpenPaper';
import { useToast } from './Toast';

interface Props {
  nums: number[];
  x: number;
  y: number;
  refIndex: Map<number, string>;
  onClose: () => void;
}

/**
 * Popover shown when the user clicks a [n] citation inside the PDF.
 * For each referenced entry:
 *   - shows the raw reference text
 *   - "🔎 arXiv" button → search arXiv with the ref text; show top 3 hits;
 *     each hit has an "导入" button wired to api.importUrl(pdf_url).
 *
 * Local per-entry state tracks the mini-search lifecycle (idle/loading/hits/empty).
 */
export function CitationPopover({ nums, x, y, refIndex, onClose }: Props) {
  const { dispatch, state } = useAppStore();
  const openPaper = useOpenPaper();
  const { toast } = useToast();
  const [searchState, setSearchState] = useState<Record<number, {
    status: 'idle' | 'loading' | 'hits' | 'empty' | 'error';
    hits?: ArxivHit[];
    error?: string;
  }>>({});
  const [importing, setImporting] = useState<string | null>(null);

  const runSearch = async (n: number) => {
    const text = refIndex.get(n);
    if (!text) return;
    setSearchState((s) => ({ ...s, [n]: { status: 'loading' } }));
    try {
      const r = await api.searchArxiv(text);
      if (!r.items || r.items.length === 0) {
        setSearchState((s) => ({ ...s, [n]: { status: 'empty' } }));
      } else {
        setSearchState((s) => ({ ...s, [n]: { status: 'hits', hits: r.items } }));
      }
    } catch (e: any) {
      setSearchState((s) => ({ ...s, [n]: { status: 'error', error: e?.message ?? '搜索失败' } }));
    }
  };

  const runImport = async (hit: ArxivHit) => {
    const existing = state.papers.find((p) => p.title.trim().toLowerCase() === hit.title.trim().toLowerCase());
    if (existing) {
      toast('论文已在库中，正在切换', 'info');
      openPaper(existing.id).catch(() => {});
      onClose();
      return;
    }
    setImporting(hit.arxiv_id);
    try {
      const paper = await api.importUrl(hit.pdf_url);
      dispatch({ type: 'ADD_PAPER', paper });
      toast(`已导入：${paper.title}`, 'success');
      openPaper(paper.id).catch(() => {});
      onClose();
    } catch (e: any) {
      toast(`导入失败：${e?.message ?? '未知错误'}`, 'error');
    } finally {
      setImporting(null);
    }
  };

  return (
    <div
      className="fixed z-[55] bg-gray-900 text-white text-xs rounded shadow-2xl p-2 w-[360px] max-h-[60vh] overflow-y-auto"
      style={{
        left: Math.min(window.innerWidth - 380, x),
        top: Math.min(window.innerHeight - 260, y + 16),
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="font-medium">📚 参考文献</span>
        <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
      </div>
      {nums.map((n) => {
        const text = refIndex.get(n);
        const s = searchState[n];
        return (
          <div key={n} className="mb-2 last:mb-0 leading-relaxed border-b border-gray-700/40 last:border-b-0 pb-2 last:pb-0">
            <div>
              <span className="text-indigo-300 mr-1">[{n}]</span>
              {text ?? <span className="text-gray-400 italic">未在参考文献中找到</span>}
            </div>
            {text && (
              <div className="mt-1 flex items-center gap-2">
                <button
                  onClick={() => runSearch(n)}
                  disabled={s?.status === 'loading'}
                  className="text-[11px] px-2 py-0.5 rounded bg-indigo-600/80 hover:bg-indigo-500 disabled:opacity-60"
                >
                  {s?.status === 'loading' ? '搜索中…' : '🔎 在 arXiv 查找'}
                </button>
                {s?.status === 'empty' && (
                  <span className="text-gray-400 italic text-[11px]">没有找到 arXiv 匹配</span>
                )}
                {s?.status === 'error' && (
                  <span className="text-rose-300 italic text-[11px]">{s.error}</span>
                )}
              </div>
            )}
            {s?.status === 'hits' && s.hits && (
              <div className="mt-1 space-y-1">
                {s.hits.map((h) => (
                  <div key={h.arxiv_id} className="bg-gray-800/60 rounded px-2 py-1.5">
                    <div className="text-[11px] text-gray-200 line-clamp-2">{h.title}</div>
                    <div className="text-[10px] text-gray-400 mt-0.5 truncate">
                      {h.authors.slice(0, 3).join(', ')}
                      {h.authors.length > 3 ? ' et al.' : ''} · arXiv:{h.arxiv_id}
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <button
                        onClick={() => runImport(h)}
                        disabled={importing === h.arxiv_id}
                        className="text-[11px] px-2 py-0.5 rounded bg-emerald-600/80 hover:bg-emerald-500 disabled:opacity-60"
                      >
                        {importing === h.arxiv_id ? '下载中…' : '⬇ 导入'}
                      </button>
                      <a
                        href={h.abs_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-indigo-300 hover:text-indigo-200"
                      >
                        arXiv ↗
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
