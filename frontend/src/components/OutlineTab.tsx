import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAppStore } from '../store/app-store';

interface TocItem {
  level: number;
  title: string;
  page: number;
}

/** Outline view rendered inside the left sidebar's "大纲" tab. */
export function OutlineTab() {
  const { state } = useAppStore();
  const paper = state.currentPaper;
  const [items, setItems] = useState<TocItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!paper) { setItems([]); return; }
    setLoading(true);
    let cancelled = false;
    api.getOutline(paper.id)
      .then((r) => { if (!cancelled) setItems(r.items); })
      .catch(() => { if (!cancelled) setItems([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [paper?.id]);

  if (!paper) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="text-center text-xs text-gray-400 dark:text-gray-500">
          <div className="text-3xl mb-2 opacity-60">📑</div>
          打开一篇论文<br />这里会显示它的章节大纲
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="text-xs text-gray-400 dark:text-gray-500 p-4 text-center">加载目录…</div>;
  }

  if (items.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="text-center text-xs text-gray-400 dark:text-gray-500">
          <div className="text-3xl mb-2 opacity-60">🌿</div>
          这篇 PDF 没有嵌入目录<br />
          <span className="text-[10px] opacity-70">（作者未在源文件里写章节书签）</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto py-2 text-xs">
      {items.map((item, i) => (
        <button
          key={i}
          onClick={() => (window as any).__goToPage?.(item.page)}
          className="w-full text-left px-3 py-1.5 flex items-start gap-2 hover:bg-indigo-50/70 dark:hover:bg-indigo-900/20 transition-colors group"
          style={{ paddingLeft: `${10 + (item.level - 1) * 12}px` }}
          title={`${item.title} (p.${item.page})`}
        >
          <span
            className="text-gray-300 group-hover:text-indigo-400 mt-0.5"
            style={{ fontSize: item.level === 1 ? 10 : 8 }}
          >
            {item.level === 1 ? '◆' : '·'}
          </span>
          <span
            className={
              'flex-1 truncate ' +
              (item.level === 1
                ? 'text-gray-700 dark:text-gray-200 font-medium'
                : 'text-gray-500 dark:text-gray-400')
            }
          >
            {item.title}
          </span>
          <span className="text-[10px] font-mono text-gray-300 dark:text-gray-600 tabular-nums">
            {item.page}
          </span>
        </button>
      ))}
    </div>
  );
}
