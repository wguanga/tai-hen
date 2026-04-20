import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api';
import { useAppStore } from '../store/app-store';
import { useToast } from './Toast';
import { COLOR_HEX, COLOR_LABELS, type AppConfig, type HighlightColor } from '../types';
import { THEME_LABELS, type Theme, type FontSize } from '../hooks/useAppPrefs';

interface PrefsLike {
  theme: Theme;
  setTheme: (t: Theme) => void;
  fontSize: FontSize;
  cycleFontSize: () => void;
  twoPage: boolean;
  setTwoPage: (v: boolean) => void;
}

interface ToolbarProps {
  onOpenSettings: () => void;
  onOpenGlobalSearch: () => void;
  onOpenCompare: () => void;
  onOpenGlossary: () => void;
  leftCollapsed: boolean;
  onToggleLeft: () => void;
  rightCollapsed: boolean;
  onToggleRight: () => void;
  dark: boolean;
  onToggleDark: () => void;
  focusMode: boolean;
  onToggleFocus: () => void;
  config: AppConfig | null;
  prefs: PrefsLike;
  onOpenMilestones: () => void;
  mosslingLevel: number;
  onOpenAudioTour: () => void;
  hasCurrentPaper: boolean;
  onOpenAIPrefs: () => void;
  onOpenCompanion: () => void;
  aiLevel: 'conservative' | 'balanced' | 'generous';
  companionEnabled: boolean;
}

const isArxivOrPdfUrl = (s: string) =>
  /^(https?:\/\/)?(www\.)?arxiv\.org\/(abs|pdf)\/[\w.\-/]+/i.test(s.trim()) ||
  /^https?:\/\/.+\.pdf(\?.*)?$/i.test(s.trim());

export function Toolbar({
  onOpenSettings,
  onOpenGlobalSearch,
  onOpenCompare,
  onOpenGlossary,
  leftCollapsed,
  onToggleLeft,
  rightCollapsed,
  onToggleRight,
  dark,
  onToggleDark,
  focusMode,
  onToggleFocus,
  config,
  prefs,
  onOpenMilestones,
  mosslingLevel,
  onOpenAudioTour,
  hasCurrentPaper,
  onOpenAIPrefs,
  onOpenCompanion,
  aiLevel,
  companionEnabled,
}: ToolbarProps) {
  const { state, dispatch } = useAppStore();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [showUrlImport, setShowUrlImport] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [importing, setImporting] = useState(false);

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
  const activeModel = config ? (config.provider === 'ollama' ? config.ollama_model : config.model) : '';
  const configured = config && (config.provider === 'ollama' || config.has_api_key);

  return (
    <div className="glass-panel flex items-center gap-2 px-3 h-11 border-b border-indigo-100/60 dark:border-indigo-900/40 flex-shrink-0">
      <button onClick={onToggleLeft} title={leftCollapsed ? '展开论文栏' : '收起论文栏'}
        className="text-xs px-1 py-0.5 rounded hover:bg-indigo-50 dark:hover:bg-indigo-900/30 text-gray-500">
        {leftCollapsed ? '▶' : '◀'}
      </button>
      <div className="font-semibold text-sm bg-gradient-to-r from-indigo-600 via-fuchsia-600 to-rose-500 bg-clip-text text-transparent">
        ✦ Paper Reader
      </div>

      <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={handleUpload} />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="magic-btn text-xs px-3 py-1 rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white shadow-[0_2px_8px_rgba(168,85,247,0.3)] hover:shadow-[0_2px_12px_rgba(168,85,247,0.45)] disabled:opacity-50 disabled:cursor-wait"
      >
        {uploading ? '上传中…' : '📤 上传 PDF'}
      </button>
      <div className="relative">
        <button
          onClick={() => setShowUrlImport((v) => !v)}
          disabled={importing}
          title="从 arXiv 链接或 PDF URL 导入"
          className="text-xs px-2.5 py-1 rounded-full border border-indigo-100 dark:border-indigo-800/50 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 disabled:opacity-50"
        >
          {importing ? '下载中…' : '🔗 URL'}
        </button>
        {showUrlImport && (
          <div className="absolute top-full left-0 mt-1 w-80 glass-panel border border-indigo-200 dark:border-indigo-800/60 rounded-xl shadow-2xl p-2 z-50">
            <div className="text-[11px] text-gray-500 dark:text-gray-400 mb-1.5">
              粘贴 arXiv 链接或 PDF 直链：
            </div>
            <div className="flex gap-1.5">
              <input
                autoFocus
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key === 'Enter' && urlInput.trim() && !importing) {
                    setImporting(true);
                    try {
                      const p = await api.importUrl(urlInput.trim());
                      dispatch({ type: 'ADD_PAPER', paper: p });
                      const [hl, notes] = await Promise.all([
                        api.listHighlights(p.id),
                        api.listNotes(p.id),
                      ]);
                      dispatch({ type: 'OPEN_PAPER', paper: p, highlights: hl.items, notes: notes.items });
                      toast(`已导入：${p.title}`, 'success');
                      setUrlInput('');
                      setShowUrlImport(false);
                    } catch (err) {
                      toast('导入失败：' + (err as Error).message, 'error');
                    } finally {
                      setImporting(false);
                    }
                  } else if (e.key === 'Escape') {
                    setShowUrlImport(false);
                    setUrlInput('');
                  }
                }}
                placeholder="https://arxiv.org/abs/2301.12345"
                className="flex-1 text-xs px-2 py-1 rounded border border-indigo-200 dark:border-indigo-800/50 bg-white/70 dark:bg-gray-800/70 focus:outline-none focus:ring-1 focus:ring-fuchsia-400"
              />
              <button
                onClick={() => {
                  setShowUrlImport(false);
                  setUrlInput('');
                }}
                className="text-xs text-gray-400 px-1.5"
              >
                ✕
              </button>
            </div>
            <div className="mt-1.5 text-[10px] text-gray-400 dark:text-gray-500">
              {urlInput && !isArxivOrPdfUrl(urlInput)
                ? '⚠️ 看起来不是 arXiv 或 .pdf 链接，仍可尝试'
                : '✓ 支持 arxiv.org/abs/... · arxiv.org/pdf/... · 或任意 .pdf 直链'}
            </div>
          </div>
        )}
      </div>

      <div className="h-5 w-px bg-gradient-to-b from-transparent via-indigo-200/70 to-transparent dark:via-indigo-700/50" />

      <div className="flex items-center gap-1.5">
        <span className="text-xs text-gray-500 dark:text-gray-400 mr-1">高亮</span>
        {colors.map((c) => (
          <button
            key={c}
            title={COLOR_LABELS[c]}
            onClick={() => dispatch({ type: 'SET_ACTIVE_COLOR', color: c })}
            className={
              'w-6 h-6 rounded-full transition-all ' +
              (state.activeColor === c
                ? 'ring-2 ring-offset-1 ring-indigo-500 scale-110 shadow-md'
                : 'ring-1 ring-gray-200 dark:ring-gray-700 hover:scale-105 hover:ring-indigo-300')
            }
            style={{ background: COLOR_HEX[c] }}
          />
        ))}
      </div>

      <div className="flex-1" />

      {paper && (
        <div className="text-xs text-gray-500 truncate max-w-md flex items-center gap-2">
          <span className="truncate" title={paper.title}>{paper.title}</span>
          <span className="text-gray-400 flex items-center gap-2 whitespace-nowrap">
            <span>📄 {paper.total_pages}</span>
            <span>🎨 {state.highlights.length}</span>
            <span>📝 {state.notes.length}</span>
          </span>
        </div>
      )}

      <button onClick={onToggleFocus} title="专注模式 (F11)"
        className="text-xs px-2 py-1 rounded-full border border-indigo-100 dark:border-indigo-800/50 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors">
        {focusMode ? '🪟' : '🎯'}
      </button>
      <button onClick={onOpenGlobalSearch} title="跨论文笔记搜索 (Ctrl+Shift+F)"
        className="text-xs px-2.5 py-1 rounded-full border border-indigo-100 dark:border-indigo-800/50 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors">
        🔎 搜笔记
      </button>
      <button onClick={onOpenCompare} title="对比 2-5 篇论文"
        className="text-xs px-2.5 py-1 rounded-full border border-indigo-100 dark:border-indigo-800/50 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors">
        ⚖️ 对比
      </button>
      <button onClick={onOpenGlossary} title="术语库"
        className="text-xs px-2.5 py-1 rounded-full border border-indigo-100 dark:border-indigo-800/50 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors">
        📖 术语
      </button>
      <button
        onClick={onOpenMilestones}
        title={`成就墙 · 苔苔 Lv ${mosslingLevel}`}
        className="magic-btn text-xs px-2.5 py-1 rounded-full border border-fuchsia-200 dark:border-fuchsia-800/50 bg-gradient-to-r from-amber-50 via-fuchsia-50 to-pink-50 dark:from-amber-900/20 dark:via-fuchsia-900/20 dark:to-pink-900/20 hover:shadow-[0_2px_10px_rgba(236,72,153,0.3)] transition-all"
      >
        🏆 <span className="font-mono font-semibold text-fuchsia-700 dark:text-fuchsia-300">Lv{mosslingLevel}</span>
      </button>
      <button
        onClick={onOpenAudioTour}
        disabled={!hasCurrentPaper}
        title={hasCurrentPaper ? '2 分钟语音导览（基于摘要）' : '打开论文后可用'}
        className="text-xs px-2.5 py-1 rounded-full border border-indigo-100 dark:border-indigo-800/50 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        🎙 导览
      </button>
      {companionEnabled && (
        <button
          onClick={onOpenCompanion}
          disabled={!hasCurrentPaper}
          title={hasCurrentPaper ? 'AI 伴读提问（带着问题读 / 检查理解）' : '打开论文后可用'}
          className="text-xs px-2.5 py-1 rounded-full border border-indigo-100 dark:border-indigo-800/50 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          🎓 伴读
        </button>
      )}
      <button
        onClick={onOpenAIPrefs}
        title={`AI 能力设置 · 当前档位：${aiLevel === 'conservative' ? '节约' : aiLevel === 'balanced' ? '均衡' : '畅快'}`}
        className="text-xs px-2 py-1 rounded-full border border-indigo-100 dark:border-indigo-800/50 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
      >
        🧠 <span className="text-[10px] font-semibold text-fuchsia-600 dark:text-fuchsia-300">
          {aiLevel === 'conservative' ? '节约' : aiLevel === 'balanced' ? '均衡' : '畅快'}
        </span>
      </button>

      <button onClick={prefs.cycleFontSize}
        title={`字号：${prefs.fontSize === 'sm' ? '小' : prefs.fontSize === 'md' ? '中' : '大'}（点击切换）`}
        className="text-xs px-2 py-1 rounded-full border border-indigo-100 dark:border-indigo-800/50 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors">
        {prefs.fontSize === 'sm' ? 'a' : prefs.fontSize === 'md' ? 'Aa' : 'AA'}
      </button>

      <button onClick={() => prefs.setTwoPage(!prefs.twoPage)}
        title={prefs.twoPage ? '切回单页' : '双页并排'}
        className={
          'text-xs px-2 py-1 rounded-full border transition-colors ' +
          (prefs.twoPage
            ? 'bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white border-transparent shadow-[0_2px_8px_rgba(168,85,247,0.35)]'
            : 'border-indigo-100 dark:border-indigo-800/50 hover:bg-indigo-50 dark:hover:bg-indigo-900/30')
        }>
        {prefs.twoPage ? '⎘' : '▭'}
      </button>

      {/* Theme dropdown is portal'd so `backdrop-filter` panels never cover it */}
      <ThemeSwitcher prefs={prefs} />

      <button onClick={onToggleDark} title={dark ? '浅色模式' : '深色模式'}
        className="text-xs px-2 py-1 rounded-full border border-indigo-100 dark:border-indigo-800/50 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors">
        {dark ? '☀️' : '🌙'}
      </button>

      <button
        onClick={onOpenSettings}
        title={configured ? '点击修改模型 / 服务商' : '点击配置 AI 模型'}
        className={
          'text-xs px-2 py-1 rounded-full border max-w-[160px] truncate transition-colors ' +
          (configured
            ? 'border-indigo-100 dark:border-indigo-800/50 text-gray-700 dark:text-gray-200 hover:bg-indigo-50 dark:hover:bg-indigo-900/30'
            : 'border-orange-400 text-orange-600 bg-orange-50 hover:bg-orange-100 dark:bg-orange-900/30 dark:text-orange-300')
        }
      >
        {configured ? `🤖 ${activeModel || '?'}` : '⚠️ 未配置 AI'}
      </button>
      <button
        onClick={onOpenSettings}
        title="设置"
        className="text-xs px-2 py-1 rounded-full border border-indigo-100 dark:border-indigo-800/50 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
      >
        ⚙️
      </button>
      <button onClick={onToggleRight} title={rightCollapsed ? '展开 AI 栏' : '收起 AI 栏'}
        className="text-xs px-1 py-0.5 rounded hover:bg-indigo-50 dark:hover:bg-indigo-900/30 text-gray-500">
        {rightCollapsed ? '◀' : '▶'}
      </button>
    </div>
  );
}

function ThemeSwitcher({ prefs }: { prefs: PrefsLike }) {
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);

  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setAnchor({ top: r.bottom + 6, right: Math.max(12, window.innerWidth - r.right) });
    }
    setOpen(!open);
  };

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        title={`主题：${THEME_LABELS[prefs.theme].name}`}
        className="text-xs px-2 py-1 rounded-full border border-indigo-100 dark:border-indigo-800/50 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
      >
        {THEME_LABELS[prefs.theme].emoji}
      </button>
      {open && anchor && createPortal(
        <>
          <div className="fixed inset-0 z-[90]" onClick={() => setOpen(false)} />
          <div
            className="fixed w-52 glass-panel border border-indigo-200 dark:border-indigo-800/60 rounded-xl shadow-[0_20px_50px_rgba(80,40,120,.4)] p-1 z-[95]"
            style={{ top: anchor.top, right: anchor.right }}
          >
            {(Object.keys(THEME_LABELS) as Theme[]).map((t) => (
              <button
                key={t}
                onClick={() => { prefs.setTheme(t); setOpen(false); }}
                className={
                  'w-full text-left px-2 py-1.5 rounded-lg flex items-center gap-2 text-xs transition-colors ' +
                  (prefs.theme === t
                    ? 'bg-gradient-to-r from-indigo-500/25 to-fuchsia-500/25 text-indigo-700 dark:text-indigo-200 font-medium'
                    : 'hover:bg-indigo-50/70 dark:hover:bg-indigo-900/30 text-gray-600 dark:text-gray-300')
                }
              >
                <span className="text-base">{THEME_LABELS[t].emoji}</span>
                <div className="flex-1">
                  <div>{THEME_LABELS[t].name}</div>
                  <div className="text-[10px] text-gray-400 dark:text-gray-500">{THEME_LABELS[t].hint}</div>
                </div>
              </button>
            ))}
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
