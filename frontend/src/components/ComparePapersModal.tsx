import { useEffect, useState } from 'react';
import { streamSSE } from '../hooks/useStream';
import { useAppStore } from '../store/app-store';
import { Markdown } from './Markdown';
import { useToast } from './Toast';

export function ComparePapersModal({ onClose }: { onClose: () => void }) {
  const { state } = useAppStore();
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set(state.currentPaper ? [state.currentPaper.id] : []));
  const [result, setResult] = useState('');
  const [streaming, setStreaming] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size >= 5) {
        toast('最多比较 5 篇论文', 'info');
        return prev;
      }
      else next.add(id);
      return next;
    });
  }

  async function run() {
    if (selected.size < 2) {
      toast('请至少选择 2 篇论文', 'error');
      return;
    }
    setStreaming(true);
    setResult('');
    let acc = '';
    await streamSSE('/ai/compare_papers', { paper_ids: [...selected] }, {
      onChunk: (t) => { acc += t; setResult(acc); },
      onDone: () => setStreaming(false),
      onError: (_c, m) => { toast('对比失败：' + m, 'error'); setStreaming(false); },
    });
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[760px] max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-2 border-b dark:border-gray-700 flex items-center justify-between">
          <div className="text-sm font-medium dark:text-gray-100">⚖️ 论文对比（选 2-5 篇）</div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div className="p-3 border-b dark:border-gray-700 max-h-44 overflow-y-auto">
          {state.papers.length === 0 && <div className="text-xs text-gray-400">暂无论文</div>}
          {state.papers.map((p) => (
            <label key={p.id} className="flex items-center gap-2 py-0.5 text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 px-1 rounded">
              <input
                type="checkbox"
                checked={selected.has(p.id)}
                onChange={() => toggle(p.id)}
                className="accent-indigo-500"
              />
              <span className="flex-1 truncate dark:text-gray-100" title={p.title}>{p.title}</span>
              <span className="text-xs text-gray-400">{p.total_pages}p</span>
            </label>
          ))}
        </div>

        <div className="px-3 py-2 border-b dark:border-gray-700 flex items-center gap-2">
          <span className="text-xs text-gray-500">已选 {selected.size}</span>
          <div className="flex-1" />
          <button
            onClick={run}
            disabled={streaming || selected.size < 2}
            className="text-sm px-3 py-1 rounded bg-indigo-500 text-white disabled:opacity-50 hover:bg-indigo-600"
          >
            {streaming ? '对比中…' : '开始对比'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 min-h-[200px]">
          {!result && !streaming && (
            <div className="text-xs text-gray-400">
              AI 将输出结构化报告：问题设定 / 方法 / 实验结果 / 相同点 / 不同点 / 综合评价。
              已有 AI 摘要的论文会优先使用摘要，否则读取前 6000 字。
            </div>
          )}
          {streaming && !result && <div className="text-xs text-gray-400 italic">思考中…</div>}
          {result && (
            <div className="markdown-body text-sm dark:text-gray-100">
              <Markdown>{result}</Markdown>
              {streaming && <span className="text-gray-400">▋</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
