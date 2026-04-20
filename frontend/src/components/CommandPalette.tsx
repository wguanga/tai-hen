import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { useAppStore } from '../store/app-store';
import type { Paper } from '../types';

interface Command {
  id: string;
  icon: string;
  label: string;
  hint?: string;
  onSelect: () => void;
  group: '论文' | '章节' | '笔记' | '操作';
}

interface Props {
  onClose: () => void;
  onOpenSettings?: () => void;
  onOpenShortcuts?: () => void;
  onToggleFocus?: () => void;
  onToggleDark?: () => void;
}

async function runNaturalLanguage(query: string, paperId: string | undefined, dispatch: ReturnType<typeof useAppStore>['dispatch']): Promise<string | null> {
  try {
    const r = await api.interpretCommand(query, paperId);
    const action = String(r.action);
    switch (action) {
      case 'goto_page': {
        const n = Number((r as any).page);
        if (Number.isFinite(n)) { (window as any).__goToPage?.(n); return `🎯 跳到第 ${n} 页`; }
        break;
      }
      case 'goto_chapter': {
        const q = String((r as any).query || '').toLowerCase();
        // Find outline match via global event bus — simple approach: match on toc cache.
        // Caller handles fallback; here we just emit a search event.
        window.dispatchEvent(new CustomEvent('nl-goto-chapter', { detail: { query: q } }));
        return `🧭 搜索章节：${q}`;
      }
      case 'filter_highlights': {
        const c = String((r as any).color || '');
        if (['yellow', 'blue', 'green', 'purple'].includes(c)) {
          window.dispatchEvent(new CustomEvent('nl-filter-highlights', { detail: { color: c } }));
          return `🎨 筛选 ${c} 高亮`;
        }
        break;
      }
      case 'semantic_search': {
        const q = String((r as any).query || query);
        if (!paperId) return '先打开论文再用语义搜索';
        // Fire & display results asynchronously via a separate event
        (async () => {
          try {
            const res = await api.semanticSearch(paperId, q);
            window.dispatchEvent(new CustomEvent('nl-search-results', {
              detail: { query: q, hits: res.hits },
            }));
          } catch { /* silent */ }
        })();
        return `🔎 语义搜索："${q}" 中…`;
      }
      case 'ask':
      case 'explain': {
        const q = String((r as any).query || query);
        // Push into chat: CHAT_RESET + CHAT_START → let AiPanel's chat endpoint handle it
        window.dispatchEvent(new CustomEvent('nl-ask', { detail: { query: q } }));
        return `🤖 已发送给 AI：${q.slice(0, 40)}${q.length > 40 ? '…' : ''}`;
      }
      case 'summarize':
        window.dispatchEvent(new CustomEvent('nl-summarize'));
        return '📑 生成全文摘要';
      case 'translate': {
        const q = String((r as any).query || query);
        window.dispatchEvent(new CustomEvent('nl-translate', { detail: { query: q } }));
        return `🌐 翻译：${q.slice(0, 40)}`;
      }
      case 'open_settings':
        window.dispatchEvent(new CustomEvent('nl-open-settings'));
        return '⚙️ 打开设置';
      case 'toggle_focus':
        window.dispatchEvent(new CustomEvent('nl-toggle-focus'));
        return '🎯 切换专注模式';
      case 'open_shortcuts':
        window.dispatchEvent(new CustomEvent('nl-open-shortcuts'));
        return '⌨️ 显示快捷键';
    }
    return '我没看懂这条指令，再试试换个说法？';
  } catch {
    return null;
  }
}

export function CommandPalette({
  onClose,
  onOpenSettings,
  onOpenShortcuts,
  onToggleFocus,
  onToggleDark,
}: Props) {
  const { state, dispatch } = useAppStore();
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const [outline, setOutline] = useState<{ level: number; title: string; page: number }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const p = state.currentPaper;
    if (!p) return;
    api.getOutline(p.id).then((r) => setOutline(r.items)).catch(() => setOutline([]));
  }, [state.currentPaper?.id]);

  const openPaper = async (p: Paper) => {
    try {
      const [paper, hl, notes] = await Promise.all([
        api.getPaper(p.id),
        api.listHighlights(p.id),
        api.listNotes(p.id),
      ]);
      dispatch({ type: 'OPEN_PAPER', paper, highlights: hl.items, notes: notes.items });
      api.getReferences(p.id)
        .then((r) => dispatch({ type: 'SET_REFERENCES', references: r.items }))
        .catch(() => {});
    } catch { /* ignore */ }
  };

  const commands = useMemo<Command[]>(() => {
    const cmds: Command[] = [];

    // Papers
    for (const p of state.papers) {
      cmds.push({
        id: `paper:${p.id}`,
        icon: '📄',
        label: p.title,
        hint: p.authors.slice(0, 2).join(', ') || '未知作者',
        onSelect: () => { openPaper(p); onClose(); },
        group: '论文',
      });
    }

    // Chapters (only if paper open)
    if (state.currentPaper) {
      for (const ch of outline) {
        cmds.push({
          id: `chap:${ch.page}:${ch.title}`,
          icon: ch.level === 1 ? '◆' : '·',
          label: ch.title,
          hint: `p.${ch.page}`,
          onSelect: () => { (window as any).__goToPage?.(ch.page); onClose(); },
          group: '章节',
        });
      }
      // Notes of current paper
      for (const n of state.notes) {
        cmds.push({
          id: `note:${n.id}`,
          icon: '📝',
          label: (n.title || n.content.slice(0, 50)) + (n.title ? '' : ''),
          hint: n.source === 'ai_answer' ? 'AI 回答' : n.source === 'ai_summary' ? 'AI 摘要' : '手动',
          onSelect: () => { (window as any).__scrollToNote?.(n.highlight_id ?? ''); onClose(); },
          group: '笔记',
        });
      }
    }

    // Actions
    if (onOpenSettings) cmds.push({ id: 'act:settings', icon: '⚙️', label: '打开设置', onSelect: () => { onOpenSettings(); onClose(); }, group: '操作' });
    if (onOpenShortcuts) cmds.push({ id: 'act:shortcuts', icon: '⌨️', label: '显示快捷键', hint: '?', onSelect: () => { onOpenShortcuts(); onClose(); }, group: '操作' });
    if (onToggleFocus) cmds.push({ id: 'act:focus', icon: '🎯', label: '切换专注模式', hint: 'F11', onSelect: () => { onToggleFocus(); onClose(); }, group: '操作' });
    if (onToggleDark) cmds.push({ id: 'act:dark', icon: '🌙', label: '切换明/暗模式', onSelect: () => { onToggleDark(); onClose(); }, group: '操作' });
    return cmds;
  }, [state.papers, state.currentPaper?.id, state.notes, outline, onClose]);

  const [nlRunning, setNlRunning] = useState(false);
  const [nlStatus, setNlStatus] = useState<string | null>(null);
  const runNl = async () => {
    if (!q.trim() || nlRunning) return;
    setNlRunning(true);
    setNlStatus(null);
    const status = await runNaturalLanguage(q, state.currentPaper?.id, dispatch);
    setNlStatus(status);
    setNlRunning(false);
    if (status) {
      // Close after a short delay so user sees the acknowledgment
      window.setTimeout(() => onClose(), 450);
    }
  };

  const filtered = useMemo(() => {
    if (!q.trim()) return commands.slice(0, 50);
    const ql = q.toLowerCase();
    const scored = commands
      .map((c) => {
        const hay = (c.label + ' ' + (c.hint || '')).toLowerCase();
        if (!hay.includes(ql)) return null;
        // Score: earlier match = higher; exact label match bonus
        const labelLower = c.label.toLowerCase();
        const score = labelLower.startsWith(ql) ? 3 : labelLower.includes(ql) ? 2 : 1;
        return { c, score };
      })
      .filter((x): x is { c: Command; score: number } => !!x)
      .sort((a, b) => b.score - a.score);
    const baseFiltered = scored.slice(0, 50).map((x) => x.c);
    // Always append a "Ask AI" magic command at the bottom for free-form queries
    const aiCmd: Command = {
      id: 'ai:nl',
      icon: '🪄',
      label: `问 Grove · "${q.length > 40 ? q.slice(0, 40) + '…' : q}"`,
      hint: nlRunning ? '解析中…' : nlStatus ? nlStatus : 'AI 执行',
      onSelect: runNl,
      group: '操作',
    };
    return [...baseFiltered, aiCmd];
  }, [q, commands, nlRunning, nlStatus]);

  // Reset idx when filter changes
  useEffect(() => { setIdx(0); }, [q]);

  // Ensure selected item scrolls into view
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLDivElement>(`[data-idx="${idx}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [idx]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(filtered.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = filtered[idx];
      if (cmd) cmd.onSelect();
    }
  };

  // Group rendering
  const grouped = useMemo(() => {
    const groups: Record<string, { cmd: Command; globalIdx: number }[]> = {};
    filtered.forEach((cmd, i) => {
      if (!groups[cmd.group]) groups[cmd.group] = [];
      groups[cmd.group].push({ cmd, globalIdx: i });
    });
    return groups;
  }, [filtered]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center p-6 pt-[8vh] bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-2xl glass-panel border border-indigo-200 dark:border-indigo-800/60 shadow-[0_30px_80px_rgba(80,40,120,.45)] overflow-hidden flex flex-col max-h-[70vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-indigo-100 dark:border-indigo-900/40">
          <span className="text-base">🔍</span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="搜索论文、章节、笔记、操作…"
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-gray-400 dark:text-gray-100"
          />
          <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-indigo-200 dark:border-indigo-800/60 bg-white/60 dark:bg-gray-800/60 text-gray-500">
            Esc
          </kbd>
        </div>
        {/* List */}
        <div ref={listRef} className="flex-1 overflow-y-auto py-1">
          {filtered.length === 0 && (
            <div className="text-center text-sm text-gray-400 dark:text-gray-500 py-10">
              <div className="text-3xl mb-2 opacity-60">🌙</div>
              没有找到匹配项
            </div>
          )}
          {Object.entries(grouped).map(([group, items]) => (
            <div key={group}>
              <div className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                {group}
              </div>
              {items.map(({ cmd, globalIdx }) => (
                <div
                  key={cmd.id}
                  data-idx={globalIdx}
                  onClick={() => cmd.onSelect()}
                  onMouseMove={() => setIdx(globalIdx)}
                  className={
                    'flex items-center gap-3 px-4 py-2 cursor-pointer transition-colors ' +
                    (idx === globalIdx
                      ? 'bg-gradient-to-r from-indigo-500/15 via-fuchsia-500/10 to-transparent'
                      : 'hover:bg-indigo-50/60 dark:hover:bg-indigo-900/20')
                  }
                >
                  <span className="text-base w-5 text-center flex-shrink-0">{cmd.icon}</span>
                  <span className="flex-1 text-sm text-gray-700 dark:text-gray-200 truncate">
                    {cmd.label}
                  </span>
                  {cmd.hint && (
                    <span className="text-xs text-gray-400 dark:text-gray-500 truncate max-w-[40%]">
                      {cmd.hint}
                    </span>
                  )}
                  {idx === globalIdx && (
                    <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-indigo-300 dark:border-indigo-700 bg-white/80 dark:bg-gray-800/80 text-indigo-600 dark:text-indigo-300">
                      ↵
                    </kbd>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
        {/* Footer hints */}
        <div className="px-4 py-2 border-t border-indigo-100/60 dark:border-indigo-900/30 flex items-center justify-between text-[10px] text-gray-400 dark:text-gray-500">
          <span>↑ ↓ 导航 · ↵ 打开</span>
          <span>🦄 Ctrl+K 唤醒我</span>
        </div>
      </div>
    </div>
  );
}
