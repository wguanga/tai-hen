import { useState } from 'react';
import { api } from '../api';
import { useAppStore } from '../store/app-store';
import { useToast } from './Toast';
import type { Folder } from '../types';

interface Props {
  /** Currently-selected folder id; `null` = "全部", `"unfiled"` = 未分组 */
  selected: string | null;
  onSelect: (v: string | null) => void;
}

const PRESET_COLORS = ['#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#6b7280'];

/**
 * Scrollable row of folder chips at the top of the paper list. Handles:
 *   - All / Unfiled / user folders as filter chips
 *   - Inline "new folder" input
 *   - Double-click a folder chip to rename; Alt-click to delete
 *   - paper_count badge on each chip (rolled up from backend)
 */
export function FolderChipsBar({ selected, onSelect }: Props) {
  const { state, dispatch } = useAppStore();
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  const totalPapers = state.papers.length;
  const unfiledCount = state.papers.filter((p) => !p.folder_id).length;

  const submitNew = async () => {
    const name = draftName.trim();
    if (!name) { setAdding(false); setDraftName(''); return; }
    try {
      const color = PRESET_COLORS[state.folders.length % PRESET_COLORS.length];
      const folder = await api.createFolder({ name, color });
      dispatch({ type: 'ADD_FOLDER', folder });
      setAdding(false);
      setDraftName('');
      onSelect(folder.id);
    } catch (e: any) {
      toast(e?.message ?? '新建失败', 'error');
    }
  };

  const commitRename = async (f: Folder) => {
    const name = renameDraft.trim();
    setRenameId(null);
    if (!name || name === f.name) return;
    try {
      const updated = await api.updateFolder(f.id, { name });
      dispatch({ type: 'UPDATE_FOLDER', folder: updated });
    } catch (e: any) {
      toast(e?.message ?? '改名失败', 'error');
    }
  };

  const remove = async (f: Folder) => {
    if (!confirm(`删除分组「${f.name}」？其中 ${f.paper_count} 篇论文将移到"未分组"，论文本身不会被删。`)) return;
    try {
      await api.deleteFolder(f.id);
      dispatch({ type: 'REMOVE_FOLDER', id: f.id });
      if (selected === f.id) onSelect(null);
      toast('已删除分组', 'info');
    } catch (e: any) {
      toast(e?.message ?? '删除失败', 'error');
    }
  };

  const chip = (label: string, opts: {
    active: boolean;
    onClick: () => void;
    count?: number;
    color?: string | null;
    extra?: React.ReactNode;
  }) => (
    <button
      onClick={opts.onClick}
      className={
        'shrink-0 inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full transition-all ' +
        (opts.active
          ? 'bg-indigo-500 text-white shadow-sm'
          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600')
      }
    >
      {opts.color && (
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ background: opts.color }}
        />
      )}
      <span>{label}</span>
      {typeof opts.count === 'number' && (
        <span
          className={
            'text-[10px] font-mono tabular-nums px-1 rounded ' +
            (opts.active ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-600')
          }
        >
          {opts.count}
        </span>
      )}
      {opts.extra}
    </button>
  );

  return (
    <div className="px-3 py-2 border-b border-indigo-100/60 dark:border-indigo-900/40 flex gap-1.5 overflow-x-auto">
      {chip('全部', { active: selected === null, onClick: () => onSelect(null), count: totalPapers })}
      {chip('未分组', { active: selected === 'unfiled', onClick: () => onSelect('unfiled'), count: unfiledCount })}

      {state.folders.map((f) => {
        const isActive = selected === f.id;
        if (renameId === f.id) {
          return (
            <input
              key={f.id}
              autoFocus
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              onBlur={() => commitRename(f)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename(f);
                if (e.key === 'Escape') setRenameId(null);
              }}
              className="shrink-0 text-[11px] px-2 py-1 rounded-full border border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white dark:bg-gray-800"
              style={{ width: Math.max(80, renameDraft.length * 9) }}
            />
          );
        }
        return (
          <span
            key={f.id}
            onDoubleClick={() => { setRenameId(f.id); setRenameDraft(f.name); }}
            title="双击改名 · Alt+点击 删除"
            onClick={(e) => {
              if (e.altKey) { e.preventDefault(); e.stopPropagation(); remove(f); }
            }}
          >
            {chip(f.name, {
              active: isActive,
              onClick: () => onSelect(isActive ? null : f.id),
              count: f.paper_count,
              color: f.color,
            })}
          </span>
        );
      })}

      {adding ? (
        <input
          autoFocus
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          placeholder="分组名…"
          onBlur={submitNew}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submitNew();
            if (e.key === 'Escape') { setAdding(false); setDraftName(''); }
          }}
          className="shrink-0 text-[11px] px-2 py-1 rounded-full border border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white dark:bg-gray-800 w-24"
        />
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="shrink-0 text-[11px] px-2 py-1 rounded-full border border-dashed border-indigo-300 text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/40"
          title="新建分组"
        >
          + 新建
        </button>
      )}
    </div>
  );
}
