import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAppStore } from '../store/app-store';
import { useToast } from './Toast';
import { COLOR_HEX, COLOR_LABELS, type HighlightColor, type HighlightPosition } from '../types';

interface Suggestion {
  text: string;
  page: number;
  color: HighlightColor;
  reason: string;
  position: HighlightPosition | null;
  locatable: boolean;
}

export function SuggestHighlightsModal({
  paperId,
  onClose,
  onGoToPage,
}: {
  paperId: string;
  onClose: () => void;
  onGoToPage: (page: number) => void;
}) {
  const { dispatch } = useAppStore();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [accepted, setAccepted] = useState<Set<number>>(new Set());

  useEffect(() => {
    let cancelled = false;
    api.suggestHighlights(paperId)
      .then((res) => { if (!cancelled) setItems(res.items); })
      .catch(() => { if (!cancelled) toast('AI 建议失败', 'error'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [paperId, toast]);

  async function accept(idx: number) {
    const s = items[idx];
    if (!s.position) {
      toast('未能在 PDF 中定位该句，建议跳转后手动高亮', 'info');
      onGoToPage(s.page);
      return;
    }
    try {
      const hl = await api.createHighlight(paperId, {
        text: s.text,
        color: s.color,
        page: s.page,
        position: s.position,
      });
      dispatch({ type: 'ADD_HIGHLIGHT', highlight: hl });
      setAccepted((prev) => new Set(prev).add(idx));
      toast('已添加高亮', 'success');
    } catch (e) {
      toast('添加失败：' + (e as Error).message, 'error');
    }
  }

  async function acceptAll() {
    const locatable = items
      .map((s, i) => ({ s, i }))
      .filter(({ s, i }) => s.locatable && !accepted.has(i));
    for (const { i } of locatable) await accept(i);
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[680px] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-2 border-b dark:border-gray-700 flex items-center justify-between">
          <div className="text-sm font-medium dark:text-gray-100">✨ AI 建议高亮</div>
          <div className="flex gap-2">
            {items.length > 0 && (
              <button onClick={acceptAll}
                className="text-xs px-2 py-0.5 rounded bg-indigo-500 text-white hover:bg-indigo-600">
                全部采纳
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {loading && (
            <div className="text-xs text-gray-400 italic">AI 正在通读论文并挑选重点，约 20-40 秒…</div>
          )}
          {!loading && items.length === 0 && (
            <div className="text-xs text-gray-400">AI 未能生成建议，可能是 API Key 配置或模型输出问题。</div>
          )}
          {items.map((s, i) => {
            const isAccepted = accepted.has(i);
            return (
              <div
                key={i}
                className={
                  'mb-2 p-2 border rounded ' +
                  (isAccepted
                    ? 'bg-green-50 dark:bg-green-900/20 border-green-200'
                    : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700')
                }
                style={{ borderLeft: `4px solid ${COLOR_HEX[s.color]}` }}
              >
                <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                  <span className="font-medium" style={{ color: COLOR_HEX[s.color] }}>● {COLOR_LABELS[s.color]}</span>
                  <button
                    onClick={() => onGoToPage(s.page)}
                    className="text-indigo-500 hover:underline"
                    title="跳转到该页"
                  >
                    p.{s.page}
                  </button>
                  {!s.locatable && <span className="text-orange-500">⚠ 未定位</span>}
                </div>
                <div className="text-sm italic mb-1 dark:text-gray-200">"{s.text}"</div>
                {s.reason && <div className="text-xs text-gray-500 dark:text-gray-400">💡 {s.reason}</div>}
                <div className="mt-1.5 flex gap-2">
                  {!isAccepted ? (
                    <button
                      onClick={() => accept(i)}
                      className="text-xs px-2 py-0.5 rounded bg-indigo-500 text-white hover:bg-indigo-600"
                    >
                      采纳
                    </button>
                  ) : (
                    <span className="text-xs text-green-600 dark:text-green-400">✓ 已添加</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
