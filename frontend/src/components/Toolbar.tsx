import { useRef, useState } from 'react';
import { api } from '../api';
import { useAppStore } from '../store/app-store';
import { useToast } from './Toast';
import { COLOR_HEX, COLOR_LABELS, type HighlightColor } from '../types';

interface ToolbarProps {
  onOpenSettings: () => void;
  leftCollapsed: boolean;
  onToggleLeft: () => void;
  rightCollapsed: boolean;
  onToggleRight: () => void;
  dark: boolean;
  onToggleDark: () => void;
}

export function Toolbar({ onOpenSettings, leftCollapsed, onToggleLeft, rightCollapsed, onToggleRight, dark, onToggleDark }: ToolbarProps) {
  const { state, dispatch } = useAppStore();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const paper = state.currentPaper;

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const p = await api.uploadPaper(file);
      dispatch({ type: 'ADD_PAPER', paper: p });
      const [hl, notes] = await Promise.all([
        api.listHighlights(p.id),
        api.listNotes(p.id),
      ]);
      dispatch({ type: 'OPEN_PAPER', paper: p, highlights: hl.items, notes: notes.items });
      toast(`已上传：${p.title}`, 'success');
    } catch (err) {
      console.error(err);
      toast('上传失败：' + (err as Error).message, 'error');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const colors: HighlightColor[] = ['yellow', 'blue', 'green', 'purple'];

  return (
    <div className="flex items-center gap-2 px-3 h-10 border-b bg-white flex-shrink-0">
      <button onClick={onToggleLeft} title={leftCollapsed ? '展开论文栏' : '收起论文栏'}
        className="text-xs px-1 py-0.5 rounded hover:bg-gray-100 text-gray-500">{leftCollapsed ? '▶' : '◀'}</button>
      <div className="font-semibold text-sm">📖 Paper Reader</div>

      <input
        ref={fileRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={handleUpload}
      />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-50"
      >
        {uploading ? '上传中…' : '📤 上传 PDF'}
      </button>

      <div className="h-5 w-px bg-gray-200" />

      <div className="flex items-center gap-1">
        <span className="text-xs text-gray-500 mr-1">高亮：</span>
        {colors.map((c) => (
          <button
            key={c}
            title={COLOR_LABELS[c]}
            onClick={() => dispatch({ type: 'SET_ACTIVE_COLOR', color: c })}
            className={
              'w-6 h-6 rounded border ' +
              (state.activeColor === c ? 'border-gray-700 ring-1 ring-gray-400' : 'border-gray-300')
            }
            style={{ background: COLOR_HEX[c] }}
          />
        ))}
      </div>

      <div className="flex-1" />

      {paper && (
        <div className="text-xs text-gray-500 truncate max-w-md">
          {paper.title} · {paper.total_pages} 页
        </div>
      )}

      <button onClick={onToggleDark} title={dark ? '浅色模式' : '深色模式'}
        className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700">
        {dark ? '☀️' : '🌙'}
      </button>
      <button
        onClick={onOpenSettings}
        className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
      >
        ⚙️ 设置
      </button>
      <button onClick={onToggleRight} title={rightCollapsed ? '展开 AI 栏' : '收起 AI 栏'}
        className="text-xs px-1 py-0.5 rounded hover:bg-gray-100 text-gray-500">{rightCollapsed ? '◀' : '▶'}</button>
    </div>
  );
}
