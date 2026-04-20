import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api';
import { useAppStore } from '../store/app-store';
import { useToast } from './Toast';

interface Props {
  paperId: string;
  currentFolderId: string | null | undefined;
  x: number;
  y: number;
  onClose: () => void;
}

/**
 * Portal-rendered popover that lists every folder and lets the user pick one.
 * Fires api.updatePaper + optimistically patches store; also fires 'tag-added'
 * style events? No — moving folder isn't a tag. Kept separate.
 */
export function MoveToFolderMenu({ paperId, currentFolderId, x, y, onClose }: Props) {
  const { state, dispatch } = useAppStore();
  const { toast } = useToast();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    // defer a tick so the opening click doesn't immediately close
    const t = window.setTimeout(() => window.addEventListener('click', onClick), 0);
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('click', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const move = async (folder_id: string | null) => {
    if (folder_id === (currentFolderId ?? null)) { onClose(); return; }
    try {
      const updated = await api.updatePaper(paperId, { folder_id });
      dispatch({ type: 'ADD_PAPER', paper: updated });
      if (state.currentPaper?.id === paperId) {
        dispatch({ type: 'OPEN_PAPER', paper: updated, highlights: state.highlights, notes: state.notes });
      }
      // Refresh folder counts so chips show the new total
      api.listFolders().then((r) => dispatch({ type: 'SET_FOLDERS', folders: r.items })).catch(() => {});
      toast(folder_id ? '已移入分组' : '已移出分组', 'success');
    } catch (e: any) {
      toast(e?.message ?? '移动失败', 'error');
    } finally {
      onClose();
    }
  };

  const left = Math.min(window.innerWidth - 220, Math.max(8, x));
  const top = Math.min(window.innerHeight - 200, y);

  return createPortal(
    <div
      ref={ref}
      className="fixed z-[70] w-52 max-h-[40vh] overflow-y-auto bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 py-1 text-sm"
      style={{ left, top }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">
        移动到分组
      </div>
      <button
        onClick={() => move(null)}
        className={
          'w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-700 ' +
          (!currentFolderId ? 'font-semibold text-indigo-600 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-200')
        }
      >
        <span className="text-sm opacity-60">📂</span> 未分组
        {!currentFolderId && <span className="ml-auto text-indigo-500">✓</span>}
      </button>
      {state.folders.length === 0 && (
        <div className="px-3 py-2 text-[11px] text-gray-400 italic">
          还没有分组 —— 到顶部列表里 "+ 新建" 一个
        </div>
      )}
      {state.folders.map((f) => {
        const active = currentFolderId === f.id;
        return (
          <button
            key={f.id}
            onClick={() => move(f.id)}
            className={
              'w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-700 ' +
              (active ? 'font-semibold text-indigo-600 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-200')
            }
          >
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ background: f.color ?? '#9ca3af' }}
            />
            <span className="truncate flex-1">{f.name}</span>
            <span className="text-[10px] text-gray-400 tabular-nums">{f.paper_count}</span>
            {active && <span className="text-indigo-500">✓</span>}
          </button>
        );
      })}
    </div>,
    document.body,
  );
}
