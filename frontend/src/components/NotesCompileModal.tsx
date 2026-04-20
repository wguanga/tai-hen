import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api';
import { Markdown } from './Markdown';
import { Mossling } from './Mossling';

interface Props {
  paperId: string;
  paperTitle: string;
  onClose: () => void;
}

export function NotesCompileModal({ paperId, paperTitle, onClose }: Props) {
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.compileNotes(paperId)
      .then((r) => { if (!cancelled) setMarkdown(r.markdown); })
      .catch((e) => { if (!cancelled) setMarkdown(`（合并失败：${(e as Error).message}）`); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [paperId]);

  const download = () => {
    if (!markdown) return;
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${paperTitle}-读书稿.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copy = async () => {
    if (!markdown) return;
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch { /* ignore */ }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center pt-[5vh] p-6 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[88vh] rounded-2xl glass-panel border border-indigo-200 dark:border-indigo-800/60 shadow-[0_30px_80px_rgba(80,40,120,.45)] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-indigo-100 dark:border-indigo-900/40 bg-gradient-to-r from-indigo-500/10 via-fuchsia-500/10 to-rose-500/10">
          <div className="flex items-center gap-2">
            <span>📘</span>
            <span className="font-semibold bg-gradient-to-r from-indigo-600 via-fuchsia-600 to-rose-500 bg-clip-text text-transparent">
              苔苔为你整理的读书稿
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={copy}
              disabled={!markdown || loading}
              className="text-xs px-2.5 py-1 rounded-full border border-indigo-200 dark:border-indigo-800/50 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 disabled:opacity-40"
            >
              {copied ? '✓ 已复制' : '📋 复制'}
            </button>
            <button
              onClick={download}
              disabled={!markdown || loading}
              className="magic-btn text-xs px-3 py-1 rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white shadow-[0_2px_8px_rgba(168,85,247,.3)] disabled:opacity-40"
            >
              📥 下载 .md
            </button>
            <button
              onClick={onClose}
              className="text-xs text-gray-400 hover:text-gray-600 px-2 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              Esc
            </button>
          </div>
        </div>

        <div className="p-5 overflow-y-auto">
          {loading && (
            <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400 py-8">
              <div style={{ animation: 'creatureWiggle 2.5s ease-in-out infinite' }}>
                <Mossling emotion="thinking" size={48} keyId="nc" />
              </div>
              <div>
                <div className="font-medium">苔苔正在整理你的高亮和笔记…</div>
                <div className="text-xs opacity-80 mt-1">按章节归类 · 补充术语表 · 总结你的结论</div>
              </div>
            </div>
          )}
          {!loading && markdown && (
            <div className="markdown-body drop-cap text-sm text-gray-800 dark:text-gray-100">
              <Markdown>{markdown}</Markdown>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
