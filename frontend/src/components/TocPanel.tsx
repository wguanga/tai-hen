import { useEffect, useState } from 'react';
import { api } from '../api';

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
  const [items, setItems] = useState<TocItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.getOutline(paperId)
      .then((res) => setItems(res.items))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [paperId]);

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
          onClick={() => onGoToPage(item.page)}
          className={
            'px-3 py-1 cursor-pointer truncate hover:bg-gray-100 dark:hover:bg-gray-700 ' +
            (i === activeIdx ? 'bg-indigo-50 text-indigo-700 font-medium dark:bg-indigo-900/30 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-300')
          }
          style={{ paddingLeft: `${8 + (item.level - 1) * 14}px` }}
          title={`${item.title} (p.${item.page})`}
        >
          {item.title}
          <span className="ml-1 text-gray-400">{item.page}</span>
        </div>
      ))}
    </div>
  );
}
