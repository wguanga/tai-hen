import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAppStore } from '../store/app-store';
import { streamSSE } from '../hooks/useStream';

interface TocItem {
  level: number;
  title: string;
  page: number;
}

export function TocPanel({
  paperId,
  currentPage,
  onGoToPage,
}: {
  paperId: string;
  currentPage: number;
  onGoToPage: (page: number) => void;
}) {
  const { dispatch } = useAppStore();
  const [items, setItems] = useState<TocItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [explainingIdx, setExplainingIdx] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    api.getOutline(paperId)
      .then((res) => setItems(res.items))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [paperId]);

  async function explainSection(idx: number) {
    const item = items[idx];
    const next = items[idx + 1];
    setExplainingIdx(idx);
    dispatch({ type: 'SET_ACTIVE_HIGHLIGHT', highlight: null });
    dispatch({ type: 'CHAT_RESET' });
    dispatch({ type: 'CHAT_START', userMessage: { role: 'user', content: `📖 解释章节：${item.title}` } });
    let full = '';
    await streamSSE('/ai/explain_section', {
      paper_id: paperId,
      title: item.title,
      start_page: item.page,
      end_page: next?.page ?? null,
    }, {
      onChunk: (t) => { full += t; dispatch({ type: 'CHAT_CHUNK', text: t }); },
      onDone: () => dispatch({ type: 'CHAT_DONE', finalText: full }),
      onError: (_c, m) => dispatch({ type: 'CHAT_ERROR', text: m }),
    });
    setExplainingIdx(null);
  }

  if (loading) return <div className="text-xs text-gray-400 p-3">加载目录…</div>;
  if (items.length === 0) return <div className="text-xs text-gray-400 p-3">此 PDF 无目录信息</div>;

  // Find the active item: last toc entry whose page <= currentPage
  let activeIdx = 0;
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].page <= currentPage) { activeIdx = i; break; }
  }

  return (
    <div className="overflow-y-auto text-xs">
      {items.map((item, i) => (
        <div
          key={i}
          className={
            'group px-3 py-1 flex items-center gap-1 hover:bg-gray-100 dark:hover:bg-gray-700 ' +
            (i === activeIdx ? 'bg-indigo-50 text-indigo-700 font-medium dark:bg-indigo-900/30 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-300')
          }
          style={{ paddingLeft: `${8 + (item.level - 1) * 14}px` }}
        >
          <div
            onClick={() => onGoToPage(item.page)}
            className="flex-1 cursor-pointer truncate"
            title={`${item.title} (p.${item.page})`}
          >
            {item.title}
            <span className="ml-1 text-gray-400">{item.page}</span>
          </div>
          <button
            onClick={() => explainSection(i)}
            disabled={explainingIdx !== null}
            className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-indigo-500 disabled:opacity-50"
            title="AI 解释本节"
          >
            {explainingIdx === i ? '…' : '📖'}
          </button>
        </div>
      ))}
    </div>
  );
}
