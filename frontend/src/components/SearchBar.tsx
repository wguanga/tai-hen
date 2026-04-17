import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';

interface SearchResult {
  page: number;
  index: number;
  snippet: string;
}

export function SearchBar({
  paperId,
  onGoToPage,
  onClose,
}: {
  paperId: string;
  onGoToPage: (page: number) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const doSearch = useCallback((q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    api.searchPaper(paperId, q.trim())
      .then((res) => { setResults(res.items); setActiveIdx(0); })
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  }, [paperId]);

  function onChange(val: string) {
    setQuery(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => doSearch(val), 300);
  }

  function goToResult(idx: number) {
    if (idx >= 0 && idx < results.length) {
      setActiveIdx(idx);
      onGoToPage(results[idx].page);
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'Enter') {
      if (e.shiftKey) goToResult(activeIdx - 1);
      else goToResult(activeIdx + 1 < results.length ? activeIdx + 1 : activeIdx);
    }
  }

  return (
    <div className="border-b bg-white dark:bg-gray-800 px-3 py-1.5 flex items-center gap-2 flex-shrink-0">
      <span className="text-xs text-gray-400">🔍</span>
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKey}
        placeholder="搜索论文内容…  Enter 下一个 · Shift+Enter 上一个 · Esc 关闭"
        className="flex-1 text-sm px-2 py-0.5 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white dark:bg-gray-700 dark:text-gray-100"
      />
      {results.length > 0 && (
        <span className="text-xs text-gray-500 whitespace-nowrap">
          {activeIdx + 1} / {results.length}
        </span>
      )}
      {loading && <span className="text-xs text-gray-400">搜索中…</span>}
      <button onClick={() => goToResult(activeIdx - 1)} disabled={activeIdx <= 0}
        className="text-xs px-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30">▲</button>
      <button onClick={() => goToResult(activeIdx + 1 < results.length ? activeIdx + 1 : activeIdx)}
        disabled={activeIdx >= results.length - 1}
        className="text-xs px-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30">▼</button>
      <button onClick={onClose} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
    </div>
  );
}
