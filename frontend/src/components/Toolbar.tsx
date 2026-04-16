import { useRef } from 'react';
import { api } from '../api';
import { useAppStore } from '../store/app-store';
import { COLOR_HEX, COLOR_LABELS, type HighlightColor } from '../types';

export function Toolbar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { state, dispatch } = useAppStore();
  const fileRef = useRef<HTMLInputElement>(null);

  const paper = state.currentPaper;

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const p = await api.uploadPaper(file);
      dispatch({ type: 'ADD_PAPER', paper: p });
      const [hl, notes] = await Promise.all([
        api.listHighlights(p.id),
        api.listNotes(p.id),
      ]);
      dispatch({ type: 'OPEN_PAPER', paper: p, highlights: hl.items, notes: notes.items });
    } catch (err) {
      console.error(err);
      alert('上传失败：' + (err as Error).message);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const colors: HighlightColor[] = ['yellow', 'blue', 'green', 'purple'];

  return (
    <div className="flex items-center gap-3 px-3 h-10 border-b bg-white flex-shrink-0">
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
        className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-100"
      >
        📤 上传 PDF
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

      <button
        onClick={onOpenSettings}
        className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-100"
      >
        ⚙️ 设置
      </button>
    </div>
  );
}
