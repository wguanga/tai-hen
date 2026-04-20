import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { Markdown } from './Markdown';
import { useAppStore } from '../store/app-store';
import { useToast } from './Toast';
import { COLOR_HEX } from '../types';
import type { Note } from '../types';
import { NotesCompileModal } from './NotesCompileModal';
import { useAIPrefs } from '../hooks/useAIPrefs';

const SOURCE_LABEL: Record<string, string> = {
  manual: '手动',
  ai_answer: 'AI 回答',
  ai_summary: 'AI 摘要',
};

function timeAgo(iso: string): string {
  try {
    const d = new Date(iso);
    const now = Date.now();
    const diff = now - d.getTime();
    if (diff < 60_000) return '刚刚';
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
    if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`;
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  } catch { return ''; }
}

export function NotesPanel() {
  const { state, dispatch } = useAppStore();
  const { toast } = useToast();
  const paper = state.currentPaper;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [sortBy, setSortBy] = useState<'time' | 'page'>('time');
  const editRef = useRef<HTMLTextAreaElement>(null);
  const noteRefs = useRef<Map<string, HTMLElement>>(new Map());
  const [compileOpen, setCompileOpen] = useState(false);
  const [formattingEdit, setFormattingEdit] = useState(false);
  const aiPrefs = useAIPrefs();
  // Track which note IDs are "fresh" (added after initial mount) — they get a particle burst
  const seenIdsRef = useRef<Set<string> | null>(null);
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const current = new Set(state.notes.map((n) => n.id));
    if (seenIdsRef.current === null) {
      // First mount — everything is "already seen", no burst
      seenIdsRef.current = current;
      return;
    }
    const newcomers: string[] = [];
    for (const id of current) {
      if (!seenIdsRef.current.has(id)) newcomers.push(id);
    }
    seenIdsRef.current = current;
    if (newcomers.length === 0) return;
    setFreshIds((prev) => {
      const next = new Set(prev);
      newcomers.forEach((id) => next.add(id));
      return next;
    });
    // Clear after animation finishes
    const t = window.setTimeout(() => {
      setFreshIds((prev) => {
        const next = new Set(prev);
        newcomers.forEach((id) => next.delete(id));
        return next;
      });
    }, 1200);
    return () => window.clearTimeout(t);
  }, [state.notes]);

  const getHighlight = (highlightId?: string | null) => {
    if (!highlightId) return undefined;
    return state.highlights.find((x) => x.id === highlightId);
  };

  const highlightColor = (highlightId?: string | null) => {
    const h = getHighlight(highlightId);
    return h ? COLOR_HEX[h.color] : undefined;
  };

  function startEdit(n: Note) {
    setEditingId(n.id);
    setEditContent(n.content);
    setTimeout(() => editRef.current?.focus(), 50);
  }

  async function saveEdit(n: Note) {
    if (!paper || !editContent.trim()) return;
    try {
      const updated = await api.updateNote(paper.id, n.id, { content: editContent.trim() });
      dispatch({ type: 'UPDATE_NOTE', id: n.id, patch: updated });
      setEditingId(null);
      toast('笔记已更新', 'success');
    } catch (e) {
      console.error(e);
      toast('更新失败', 'error');
    }
  }

  async function remove(id: string) {
    if (!paper) return;
    if (!confirm('删除这条笔记？')) return;
    try {
      await api.deleteNote(paper.id, id);
      dispatch({ type: 'REMOVE_NOTE', id });
      toast('笔记已删除', 'info');
    } catch (e) {
      console.error(e);
      toast('删除失败', 'error');
    }
  }

  async function exportMd() {
    if (!paper) return;
    try {
      const md = await api.exportMarkdown(paper.id);
      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${paper.title}-notes.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast('导出成功', 'success');
    } catch (e) {
      console.error(e);
      toast('导出失败', 'error');
    }
  }

  // Expose scroll-to for highlight click linkage
  function scrollToNote(highlightId: string) {
    const notes = state.notes.filter((n) => n.highlight_id === highlightId);
    if (notes.length > 0) {
      const el = noteRefs.current.get(notes[0].id);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el?.classList.add('ring-2', 'ring-indigo-400');
      setTimeout(() => el?.classList.remove('ring-2', 'ring-indigo-400'), 1500);
    }
  }
  // Expose via window for PdfReader to call
  (window as any).__scrollToNote = scrollToNote;

  // IMPORTANT: keep all hooks above any early return (rules of hooks).
  const sortedNotes = useMemo(() => {
    if (sortBy === 'page') {
      return [...state.notes].sort((a, b) => {
        const aPage = state.highlights.find((x) => x.id === a.highlight_id)?.page ?? 9999;
        const bPage = state.highlights.find((x) => x.id === b.highlight_id)?.page ?? 9999;
        return aPage - bPage;
      });
    }
    return state.notes; // already newest-first from store
  }, [state.notes, state.highlights, sortBy]);

  if (!paper) {
    return <div className="h-full flex items-center justify-center text-xs text-gray-400">暂无笔记</div>;
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-indigo-100/60 dark:border-indigo-900/40 bg-gradient-to-r from-indigo-50/60 via-transparent to-fuchsia-50/60 dark:from-indigo-900/20 dark:to-fuchsia-900/20">
        <div className="text-sm font-semibold dark:text-gray-200 flex items-center gap-1.5">
          <span>📝</span>
          <span>笔记</span>
          <span className="text-xs font-normal text-gray-400 dark:text-gray-500">({state.notes.length})</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setSortBy(sortBy === 'time' ? 'page' : 'time')}
            className="text-xs px-2 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-800/50 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 text-gray-500 transition-colors"
            title={sortBy === 'time' ? '按时间排序' : '按页码排序'}>
            {sortBy === 'time' ? '⏱ 时间' : '📄 页码'}
          </button>
          {aiPrefs.isEnabled('compile_notes') && (
            <button
              onClick={() => setCompileOpen(true)}
              disabled={state.notes.length === 0 && state.highlights.length === 0}
              title="AI 合并所有高亮和笔记为结构化读书稿"
              className="magic-btn text-xs px-2 py-0.5 rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white shadow-[0_2px_8px_rgba(168,85,247,.3)] hover:shadow-[0_2px_12px_rgba(168,85,247,.5)] disabled:opacity-40 transition-all"
            >
              📘 合并
            </button>
          )}
          <button
            onClick={exportMd}
            className="text-xs px-2 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-800/50 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
          >
            📤 导出
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {state.notes.length === 0 && (
          <div className="text-xs text-gray-400 p-2">
            暂无笔记。选中文字右键 → AI 解释或添加笔记。<br />
            快捷键：E 解释 · T 翻译 · N 笔记 · 1234 切色
          </div>
        )}
        {sortedNotes.map((n) => {
          const hl = getHighlight(n.highlight_id);
          const color = hl ? COLOR_HEX[hl.color] : undefined;
          const isEditing = editingId === n.id;
          return (
            <div
              key={n.id}
              ref={(el) => { if (el) noteRefs.current.set(n.id, el); }}
              className={'soft-card p-2.5' + (freshIds.has(n.id) ? ' note-born' : '')}
              style={color ? { borderLeft: `3px solid ${color}` } : undefined}
              onMouseEnter={(e) => {
                if (!n.highlight_id) return;
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                window.dispatchEvent(new CustomEvent('highlight-ping', {
                  detail: {
                    highlightId: n.highlight_id,
                    noteRect: { x: r.left, y: r.top + r.height / 2, width: r.width, height: r.height },
                  },
                }));
              }}
              onMouseLeave={() => {
                window.dispatchEvent(new CustomEvent('note-path-hide'));
              }}
            >
              {freshIds.has(n.id) && (
                <>
                  <span className="note-spark tl" />
                  <span className="note-spark tr" />
                  <span className="note-spark bl" />
                  <span className="note-spark br" />
                  <span className="note-spark top" style={{ animationDelay: '.08s' }} />
                  <span className="note-spark bottom" style={{ animationDelay: '.08s' }} /></>
              )}
              {hl && (
                <div className="text-xs text-gray-400 dark:text-gray-500 mb-1 line-clamp-2 italic border-l-2 border-gray-200 pl-2">
                  "{hl.text.slice(0, 120)}{hl.text.length > 120 ? '…' : ''}"
                  <span className="ml-1 not-italic text-gray-300">p.{hl.page}</span>
                </div>
              )}
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs text-gray-500">
                  <span className="font-medium text-gray-700">
                    {n.title || SOURCE_LABEL[n.source]}
                  </span>
                  <span className="ml-2">· {SOURCE_LABEL[n.source]}</span>
                  <span className="ml-2 text-gray-400">{timeAgo(n.created_at)}</span>
                </div>
                <div className="flex items-center gap-1">
                  {!isEditing && (
                    <button
                      onClick={() => startEdit(n)}
                      className="text-xs text-gray-400 hover:text-indigo-500"
                      title="编辑"
                    >
                      ✎
                    </button>
                  )}
                  <button
                    onClick={() => remove(n.id)}
                    className="text-xs text-gray-400 hover:text-red-500"
                    title="删除"
                  >
                    ✕
                  </button>
                </div>
              </div>
              {isEditing ? (
                <div>
                  <textarea
                    ref={editRef}
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={5}
                    className="w-full text-sm border border-gray-300 rounded p-2 resize-y focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveEdit(n); }
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                  />
                  <div className="flex items-center gap-2 mt-1">
                    {aiPrefs.isEnabled('format_note') && (
                      <button
                        type="button"
                        onClick={async () => {
                          if (!editContent.trim() || formattingEdit) return;
                          setFormattingEdit(true);
                          try {
                            const r = await api.formatNote(editContent);
                            if (r.formatted) setEditContent(r.formatted);
                          } catch { /* ignore */ }
                          finally { setFormattingEdit(false); }
                        }}
                        disabled={formattingEdit || !editContent.trim()}
                        title="让 AI 只整理格式（不改内容）"
                        className="magic-btn text-xs px-2 py-0.5 rounded-full border border-fuchsia-200 dark:border-fuchsia-800/50 text-fuchsia-600 dark:text-fuchsia-300 hover:bg-fuchsia-50 dark:hover:bg-fuchsia-900/30 disabled:opacity-40"
                      >
                        {formattingEdit ? '整理中…' : '✨ AI 排版'}
                      </button>
                    )}
                    <div className="flex-1" />
                    <button onClick={() => setEditingId(null)} className="text-xs px-2 py-0.5 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700">取消</button>
                    <button onClick={() => saveEdit(n)} className="text-xs px-2 py-0.5 rounded bg-indigo-500 text-white hover:bg-indigo-600">保存</button>
                  </div>
                </div>
              ) : (
                <div className="markdown-body text-sm text-gray-800">
                  <Markdown>{n.content}</Markdown>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {compileOpen && paper && (
        <NotesCompileModal
          paperId={paper.id}
          paperTitle={paper.title}
          onClose={() => setCompileOpen(false)}
        />
      )}
    </div>
  );
}
