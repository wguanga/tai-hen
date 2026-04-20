import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useAppStore } from '../store/app-store';
import { useOpenPaper } from '../hooks/useOpenPaper';
import { useToast } from './Toast';
import { ReadingRing } from './ReadingRing';

function readingPercentFor(paperId: string, totalPages: number): number {
  if (totalPages <= 0) return 0;
  try {
    const saved = localStorage.getItem(`reading_progress_${paperId}`);
    const page = saved ? Number(saved) : 0;
    if (!Number.isFinite(page) || page <= 0) return 0;
    return Math.min(100, (page / totalPages) * 100);
  } catch {
    return 0;
  }
}

export function PaperList() {
  const { state, dispatch } = useAppStore();
  const { toast } = useToast();
  const openPaper = useOpenPaper();
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [editingTagsFor, setEditingTagsFor] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState('');

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

  async function commitTags(paperId: string) {
    const tags = tagDraft.split(/[,，\s]+/).map((t) => t.trim()).filter(Boolean);
    try {
      const updated = await api.updatePaper(paperId, { tags });
      dispatch({ type: 'ADD_PAPER', paper: updated });
      if (state.currentPaper?.id === paperId) {
        dispatch({ type: 'OPEN_PAPER', paper: updated, highlights: state.highlights, notes: state.notes });
      }
      setEditingTagsFor(null);
      toast('标签已更新', 'success');
    } catch (e) {
      toast('更新标签失败', 'error');
    }
  }

  function startEditTags(paperId: string, current: string[]) {
    setEditingTagsFor(paperId);
    setTagDraft(current.join(', '));
  }

  const allTags = useMemo(() => {
    const s = new Set<string>();
    for (const p of state.papers) for (const t of p.tags || []) s.add(t);
    return [...s].sort();
  }, [state.papers]);

  const filtered = useMemo(() => {
    return state.papers.filter((p) => {
      if (tagFilter && !(p.tags || []).includes(tagFilter)) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!p.title.toLowerCase().includes(q) &&
            !p.authors.some((a) => a.toLowerCase().includes(q))) return false;
      }
      return true;
    });
  }, [state.papers, search, tagFilter]);

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b border-indigo-100/60 dark:border-indigo-900/40">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索标题/作者…"
          className="w-full text-xs px-2 py-1 border border-gray-200 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-indigo-300"
        />
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            <button onClick={() => setTagFilter(null)}
              className={'text-xs px-1.5 py-0.5 rounded ' +
                (!tagFilter ? 'bg-indigo-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300')}>
              全部
            </button>
            {allTags.map((t) => (
              <button key={t} onClick={() => setTagFilter(tagFilter === t ? null : t)}
                className={'text-xs px-1.5 py-0.5 rounded ' +
                  (tagFilter === t ? 'bg-indigo-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200')}>
                {t}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <div className="text-xs text-gray-400 dark:text-gray-500 p-4 text-center">
            <div className="text-3xl mb-2 opacity-60">📖</div>
            {search || tagFilter ? '无匹配结果' : '把 PDF 拖进来开始阅读之旅'}
          </div>
        )}
        {filtered.map((p) => {
          const editing = editingTagsFor === p.id;
          const isActive = state.currentPaper?.id === p.id;
          return (
            <div
              key={p.id}
              onClick={() => !editing && openPaper(p.id).catch(() => toast('打开失败', 'error'))}
              className={
                'card-lift group px-3 py-2 border-b border-indigo-50/80 dark:border-indigo-900/30 cursor-pointer relative ' +
                (isActive
                  ? 'bg-gradient-to-r from-indigo-100/70 via-fuchsia-50/60 to-transparent dark:from-indigo-900/40 dark:via-fuchsia-900/20 dark:to-transparent border-l-2 border-l-fuchsia-500'
                  : 'hover:bg-indigo-50/50 dark:hover:bg-indigo-900/20')
              }
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate dark:text-gray-100" title={p.title}>
                    {p.title}
                  </div>
                  <div className="text-xs text-gray-500 truncate">
                    {p.authors.length ? p.authors.slice(0, 2).join(', ') : '未知作者'}
                    {p.year ? ` · ${p.year}` : ''} · {p.total_pages} 页
                  </div>
                  {editing ? (
                    <div className="mt-1 flex gap-1" onClick={(e) => e.stopPropagation()}>
                      <input
                        autoFocus
                        value={tagDraft}
                        onChange={(e) => setTagDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitTags(p.id);
                          if (e.key === 'Escape') setEditingTagsFor(null);
                        }}
                        placeholder="用逗号分隔"
                        className="flex-1 text-xs px-1 py-0.5 border border-gray-300 dark:border-gray-600 rounded"
                      />
                      <button onClick={() => commitTags(p.id)}
                        className="text-xs px-1 rounded bg-indigo-500 text-white">✓</button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {(p.tags || []).map((t) => (
                        <span key={t} className="text-[10px] px-1 py-0 rounded bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-200">
                          {t}
                        </span>
                      ))}
                      <button
                        onClick={(e) => { e.stopPropagation(); startEditTags(p.id, p.tags || []); }}
                        className="text-[10px] text-gray-400 hover:text-indigo-500 opacity-0 group-hover:opacity-100"
                        title="编辑标签"
                      >
                        +标签
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-center gap-1 flex-shrink-0">
                  <div
                    title={`已读 ${Math.round(readingPercentFor(p.id, p.total_pages))}% · 第 ${Math.round((readingPercentFor(p.id, p.total_pages) / 100) * p.total_pages)} / ${p.total_pages} 页`}
                  >
                    <ReadingRing percent={readingPercentFor(p.id, p.total_pages)} />
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
