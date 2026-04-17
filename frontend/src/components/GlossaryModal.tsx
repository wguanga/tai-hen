import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useToast } from './Toast';

interface Entry {
  id: string;
  term: string;
  definition: string;
  paper_id: string | null;
  source: string;
  created_at: string;
}

export function GlossaryModal({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const [items, setItems] = useState<Entry[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{ term: string; definition: string }>({ term: '', definition: '' });
  const [newTerm, setNewTerm] = useState('');
  const [newDef, setNewDef] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback((q?: string) => {
    setLoading(true);
    api.listGlossary(q)
      .then((r) => setItems(r.items))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function onQueryChange(v: string) {
    setQuery(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => load(v.trim() || undefined), 300);
  }

  async function addNew() {
    if (!newTerm.trim() || !newDef.trim()) return;
    try {
      await api.createGlossary({ term: newTerm.trim(), definition: newDef.trim() });
      setNewTerm(''); setNewDef('');
      load(query.trim() || undefined);
      toast('已添加术语', 'success');
    } catch (e) {
      toast('添加失败：' + (e as Error).message, 'error');
    }
  }

  async function save(id: string) {
    try {
      await api.updateGlossary(id, { term: editDraft.term.trim(), definition: editDraft.definition.trim() });
      setEditingId(null);
      load(query.trim() || undefined);
      toast('已更新', 'success');
    } catch (e) {
      toast('更新失败：' + (e as Error).message, 'error');
    }
  }

  async function remove(id: string) {
    if (!confirm('删除这个术语？')) return;
    await api.deleteGlossary(id);
    setItems((arr) => arr.filter((x) => x.id !== id));
    toast('已删除', 'info');
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[680px] max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-3 py-2 border-b dark:border-gray-700 flex items-center justify-between">
          <div className="text-sm font-medium dark:text-gray-100">📖 术语库 ({items.length})</div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div className="px-3 py-2 border-b dark:border-gray-700">
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="搜索术语或定义…"
            className="w-full text-sm px-2 py-1 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
        </div>

        <div className="px-3 py-2 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40">
          <div className="text-xs text-gray-500 mb-1">➕ 新增</div>
          <div className="flex gap-1 items-start">
            <input
              value={newTerm}
              onChange={(e) => setNewTerm(e.target.value)}
              placeholder="术语"
              className="w-32 text-sm px-2 py-1 border border-gray-300 dark:border-gray-600 rounded"
            />
            <input
              value={newDef}
              onChange={(e) => setNewDef(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addNew()}
              placeholder="定义"
              className="flex-1 text-sm px-2 py-1 border border-gray-300 dark:border-gray-600 rounded"
            />
            <button
              onClick={addNew}
              disabled={!newTerm.trim() || !newDef.trim()}
              className="text-sm px-3 py-1 rounded bg-indigo-500 text-white disabled:opacity-50"
            >
              +
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {loading && <div className="text-xs text-gray-400 italic">加载中…</div>}
          {!loading && items.length === 0 && (
            <div className="text-xs text-gray-400 p-3">
              {query ? '无匹配术语' : '暂无术语。生成摘要后 AI 会自动填充关键术语，或手动添加。'}
            </div>
          )}
          {items.map((e) => (
            <div key={e.id} className="group border-b dark:border-gray-700 py-1.5">
              {editingId === e.id ? (
                <div className="flex gap-1">
                  <input
                    value={editDraft.term}
                    onChange={(ev) => setEditDraft((d) => ({ ...d, term: ev.target.value }))}
                    className="w-32 text-sm px-1 py-0.5 border border-gray-300 dark:border-gray-600 rounded"
                  />
                  <input
                    value={editDraft.definition}
                    onChange={(ev) => setEditDraft((d) => ({ ...d, definition: ev.target.value }))}
                    className="flex-1 text-sm px-1 py-0.5 border border-gray-300 dark:border-gray-600 rounded"
                  />
                  <button onClick={() => save(e.id)} className="text-xs px-2 rounded bg-indigo-500 text-white">✓</button>
                  <button onClick={() => setEditingId(null)} className="text-xs px-2 rounded border">✕</button>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <span className="text-sm font-medium dark:text-gray-100 min-w-0 max-w-[180px] truncate" title={e.term}>
                    {e.term}
                  </span>
                  <span className="text-sm text-gray-700 dark:text-gray-300 flex-1 min-w-0">{e.definition}</span>
                  <span className="text-[10px] text-gray-400 whitespace-nowrap">
                    {e.source === 'summary' ? '📑 摘要' : e.source === 'ai_explain' ? '🤖 AI' : '✍️ 手动'}
                  </span>
                  <button
                    onClick={() => { setEditingId(e.id); setEditDraft({ term: e.term, definition: e.definition }); }}
                    className="opacity-0 group-hover:opacity-100 text-xs text-gray-400 hover:text-indigo-500"
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => remove(e.id)}
                    className="opacity-0 group-hover:opacity-100 text-xs text-gray-400 hover:text-red-500"
                  >
                    🗑
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
