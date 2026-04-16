import { useEffect } from 'react';
import { api } from '../api';
import { useAppStore } from '../store/app-store';
import { useToast } from './Toast';

export function PaperList() {
  const { state, dispatch } = useAppStore();
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.listPapers();
        if (!cancelled) dispatch({ type: 'SET_PAPERS', papers: res.items });
      } catch (e) {
        console.error('listPapers failed', e);
      }
    })();
    return () => { cancelled = true; };
  }, [dispatch]);

  async function openPaper(id: string) {
    try {
      const [paper, hl, notes] = await Promise.all([
        api.getPaper(id),
        api.listHighlights(id),
        api.listNotes(id),
      ]);
      dispatch({ type: 'OPEN_PAPER', paper, highlights: hl.items, notes: notes.items });
    } catch (e) {
      console.error(e);
    }
  }

  async function remove(id: string) {
    if (!confirm('删除该论文及所有高亮、笔记？此操作不可恢复。')) return;
    try {
      await api.deletePaper(id);
      dispatch({ type: 'REMOVE_PAPER', id });
      toast('论文已删除', 'info');
    } catch (e) {
      console.error(e);
      toast('删除失败', 'error');
    }
  }

  return (
    <div className="w-60 border-r bg-white flex-shrink-0 flex flex-col">
      <div className="px-3 py-2 border-b text-sm font-medium">论文库 ({state.papers.length})</div>
      <div className="flex-1 overflow-y-auto">
        {state.papers.length === 0 && (
          <div className="text-xs text-gray-400 p-3">上传 PDF 开始</div>
        )}
        {state.papers.map((p) => (
          <div
            key={p.id}
            onClick={() => openPaper(p.id)}
            className={
              'group px-3 py-2 border-b cursor-pointer ' +
              (state.currentPaper?.id === p.id ? 'bg-indigo-50' : 'hover:bg-gray-50')
            }
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate" title={p.title}>
                  {p.title}
                </div>
                <div className="text-xs text-gray-500 truncate">
                  {p.authors.length ? p.authors.slice(0, 2).join(', ') : '未知作者'}
                  {p.year ? ` · ${p.year}` : ''} · {p.total_pages} 页
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); remove(p.id); }}
                className="opacity-0 group-hover:opacity-100 text-xs text-gray-400 hover:text-red-500"
                title="删除"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
