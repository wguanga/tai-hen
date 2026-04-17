import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useAppStore } from '../store/app-store';
import { useToast } from './Toast';

interface Result {
  id: string;
  paper_id: string;
  paper_title: string;
  title: string | null;
  content: string;
  source: 'manual' | 'ai_answer' | 'ai_summary';
  created_at: string;
}

export function GlobalSearch({ onClose }: { onClose: () => void }) {
  const { dispatch } = useAppStore();
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const doSearch = useCallback((q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    api.searchNotesGlobal(q.trim())
      .then((res) => setResults(res.items))
      .catch(() => toast('搜索失败', 'error'))
      .finally(() => setLoading(false));
  }, [toast]);

  function onChange(val: string) {
    setQuery(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => doSearch(val), 300);
  }

  async function openPaperAndScroll(paperId: string) {
    try {
      const [paper, hl, notes] = await Promise.all([
        api.getPaper(paperId),
        api.listHighlights(paperId),
        api.listNotes(paperId),
      ]);
      dispatch({ type: 'OPEN_PAPER', paper, highlights: hl.items, notes: notes.items });
      onClose();
    } catch {
      toast('论文打开失败', 'error');
    }
  }

  function highlightMatch(text: string, q: string): React.ReactNode {
    if (!q.trim()) return text;
    const lower = text.toLowerCase();
    const idx = lower.indexOf(q.toLowerCase());
    if (idx === -1) return text.slice(0, 200);
    const start = Math.max(0, idx - 40);
    const end = Math.min(text.length, idx + q.length + 60);
    const before = text.slice(start, idx);
    const match = text.slice(idx, idx + q.length);
    const after = text.slice(idx + q.length, end);
    return (
      <>
        {start > 0 && '…'}
        {before}
        <mark className="bg-yellow-200 dark:bg-yellow-700 dark:text-yellow-100">{match}</mark>
        {after}
        {end < text.length && '…'}
      </>
    );
  }

  return (
    <div
      className="fixed inset-0 bg-black/30 flex items-start justify-center z-50 pt-20"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[600px] max-h-[70vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-3 py-2 border-b dark:border-gray-700 flex items-center gap-2">
          <span className="text-gray-400">🔎</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && onClose()}
            placeholder="搜索所有论文的笔记…"
            className="flex-1 text-sm px-2 py-1 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
          {loading && <span className="text-xs text-gray-400">搜索中…</span>}
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {!query && (
            <div className="text-xs text-gray-400 p-3">
              在此输入关键词，搜索所有论文的笔记内容。
            </div>
          )}
          {query && !loading && results.length === 0 && (
            <div className="text-xs text-gray-400 p-3">无匹配结果</div>
          )}
          {results.map((r) => (
            <div
              key={r.id}
              onClick={() => openPaperAndScroll(r.paper_id)}
              className="p-2 border-b dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <div className="text-xs text-gray-500 flex items-center justify-between">
                <span className="font-medium text-indigo-600 dark:text-indigo-300 truncate">
                  📄 {r.paper_title}
                </span>
                <span className="text-gray-400 text-[10px] ml-2">
                  {r.source === 'manual' ? '手动' : r.source === 'ai_answer' ? 'AI' : '摘要'}
                </span>
              </div>
              {r.title && <div className="text-sm font-medium mt-0.5 dark:text-gray-100">{r.title}</div>}
              <div className="text-xs text-gray-600 dark:text-gray-300 mt-0.5 line-clamp-2">
                {highlightMatch(r.content, query)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
