import { useEffect, useState } from 'react';
import { api } from '../api';
import { Markdown } from './Markdown';
import { useAppStore } from '../store/app-store';
import { useToast } from './Toast';

type SummaryData = { id: string; content: string; created_at: string; updated_at: string } | null;

const AUTO_KEY = 'paper_auto_summary';

export function SummaryPanel() {
  const { state, dispatch } = useAppStore();
  const { toast } = useToast();
  const paper = state.currentPaper;

  const [summary, setSummary] = useState<SummaryData>(null);
  const [loading, setLoading] = useState(false);
  const [autoEnabled, setAutoEnabled] = useState(() => localStorage.getItem(AUTO_KEY) === '1');

  // Fetch existing summary when paper opens
  useEffect(() => {
    if (!paper) { setSummary(null); return; }
    let cancelled = false;
    api.getSummary(paper.id)
      .then((res) => {
        if (cancelled) return;
        setSummary(res.summary);
        // Auto-generate if no summary exists and the flag is on
        if (!res.summary && autoEnabled) {
          generate(false);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paper?.id]);

  async function generate(regenerate: boolean) {
    if (!paper) return;
    setLoading(true);
    try {
      const res = await api.generateSummary(paper.id, regenerate);
      setSummary(res.summary);
      // Also reflect in notes store (replace any old ai_summary note)
      if (res.summary) {
        dispatch({
          type: 'ADD_NOTE',
          note: {
            id: res.summary.id,
            paper_id: paper.id,
            highlight_id: null,
            title: '整篇摘要',
            content: res.summary.content,
            source: 'ai_summary',
            created_at: res.summary.created_at,
            updated_at: res.summary.updated_at,
          },
        });
        if (!res.cached) toast('摘要已生成', 'success');
      }
    } catch (e) {
      toast('摘要生成失败：' + (e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }

  function toggleAuto() {
    setAutoEnabled((v) => {
      const next = !v;
      localStorage.setItem(AUTO_KEY, next ? '1' : '0');
      return next;
    });
  }

  if (!paper) {
    return <div className="h-full flex items-center justify-center text-xs text-gray-400">打开论文后显示摘要</div>;
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-white dark:bg-gray-800">
        <div className="text-sm font-medium dark:text-gray-200">📑 摘要</div>
        <div className="flex items-center gap-1">
          <label className="text-[11px] text-gray-500 flex items-center gap-1 cursor-pointer" title="打开论文时若无摘要，自动生成">
            <input type="checkbox" checked={autoEnabled} onChange={toggleAuto} className="accent-indigo-500" />
            自动
          </label>
          {summary ? (
            <button
              onClick={() => generate(true)}
              disabled={loading}
              className="text-xs px-2 py-0.5 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
            >
              {loading ? '重生成中…' : '🔄 重新生成'}
            </button>
          ) : (
            <button
              onClick={() => generate(false)}
              disabled={loading}
              className="text-xs px-2 py-0.5 rounded bg-indigo-500 text-white disabled:opacity-50"
            >
              {loading ? '生成中…' : '✨ 生成摘要'}
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {loading && !summary && (
          <div className="text-xs text-gray-400 italic">AI 正在通读论文并提炼要点，通常需要 10-30 秒…</div>
        )}
        {!loading && !summary && (
          <div className="text-xs text-gray-400">
            还没有摘要。点"生成摘要"让 AI 阅读论文并输出结构化要点（核心贡献、方法、实验结论、局限、关键术语）。
          </div>
        )}
        {summary && (
          <div className="markdown-body text-sm text-gray-800 dark:text-gray-200">
            <Markdown>{summary.content}</Markdown>
          </div>
        )}
      </div>
    </div>
  );
}
