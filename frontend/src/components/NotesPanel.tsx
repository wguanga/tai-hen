import { useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { api } from '../api';
import { useAppStore } from '../store/app-store';
import { useToast } from './Toast';
import { COLOR_HEX } from '../types';
import type { Note } from '../types';

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
  const editRef = useRef<HTMLTextAreaElement>(null);
  const noteRefs = useRef<Map<string, HTMLElement>>(new Map());

  const highlightColor = (highlightId?: string | null) => {
    if (!highlightId) return undefined;
    const h = state.highlights.find((x) => x.id === highlightId);
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

  if (!paper) {
    return <div className="h-full flex items-center justify-center text-xs text-gray-400">暂无笔记</div>;
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-white">
        <div className="text-sm font-medium">笔记 ({state.notes.length})</div>
        <button
          onClick={exportMd}
          className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-100"
        >
          📤 导出 MD
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {state.notes.length === 0 && (
          <div className="text-xs text-gray-400 p-2">
            暂无笔记。选中文字右键 → AI 解释或添加笔记。<br />
            快捷键：E 解释 · T 翻译 · N 笔记 · 1234 切色
          </div>
        )}
        {state.notes.map((n) => {
          const color = highlightColor(n.highlight_id);
          const isEditing = editingId === n.id;
          return (
            <div
              key={n.id}
              ref={(el) => { if (el) noteRefs.current.set(n.id, el); }}
              className="bg-white border border-gray-200 rounded p-2 transition-all"
              style={color ? { borderLeft: `3px solid ${color}` } : undefined}
            >
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
                  <div className="flex justify-end gap-2 mt-1">
                    <button onClick={() => setEditingId(null)} className="text-xs px-2 py-0.5 rounded border border-gray-300 hover:bg-gray-100">取消</button>
                    <button onClick={() => saveEdit(n)} className="text-xs px-2 py-0.5 rounded bg-indigo-500 text-white">保存</button>
                  </div>
                </div>
              ) : (
                <div className="markdown-body text-sm text-gray-800">
                  <ReactMarkdown>{n.content}</ReactMarkdown>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
