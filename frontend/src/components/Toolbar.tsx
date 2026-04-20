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

      <div className="flex items-center gap-1">
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
        <div className="text-xs text-gray-500 truncate max-w-[280px] flex items-center gap-2 min-w-0">
          <span className="truncate" title={paper.title}>{paper.title}</span>
          <span className="text-gray-400 flex items-center gap-1.5 whitespace-nowrap flex-shrink-0" title={`${paper.total_pages} 页 · ${state.highlights.length} 高亮 · ${state.notes.length} 笔记`}>
            <span>📄{paper.total_pages}</span>
            <span>🎨{state.highlights.length}</span>
            <span>📝{state.notes.length}</span>
          </span>
        </div>
      )}

      {/* Grouped overflow menu — AI tools + view controls */}
      <ToolbarMoreMenu
        prefs={prefs}
        dark={dark}
        focusMode={focusMode}
        hasCurrentPaper={hasCurrentPaper}
        companionEnabled={companionEnabled}
        mosslingLevel={mosslingLevel}
        onToggleFocus={onToggleFocus}
        onToggleDark={onToggleDark}
        onOpenGlobalSearch={onOpenGlobalSearch}
        onOpenCompare={onOpenCompare}
        onOpenGlossary={onOpenGlossary}
        onOpenMilestones={onOpenMilestones}
        onOpenAudioTour={onOpenAudioTour}
        onOpenCompanion={onOpenCompanion}
      />

      <button
        onClick={onOpenAIPrefs}
        title={`AI 能力设置 · 当前档位：${aiLevel === 'conservative' ? '节约' : aiLevel === 'balanced' ? '均衡' : '畅快'}`}
        className="text-xs px-2 py-1 rounded-full border border-indigo-100 dark:border-indigo-800/50 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
      >
        🧠 <span className="text-[10px] font-semibold text-fuchsia-600 dark:text-fuchsia-300">
          {aiLevel === 'conservative' ? '节约' : aiLevel === 'balanced' ? '均衡' : '畅快'}
        </span>
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

/* ========================================================================
 * Grouped overflow menu — hides secondary toolbar actions behind a single
 * 🛠 button. Keeps the primary row breathable on narrow screens.
 * ======================================================================== */

interface MoreMenuProps {
  prefs: PrefsLike;
  dark: boolean;
  focusMode: boolean;
  hasCurrentPaper: boolean;
  companionEnabled: boolean;
  mosslingLevel: number;
  onToggleFocus: () => void;
  onToggleDark: () => void;
  onOpenGlobalSearch: () => void;
  onOpenCompare: () => void;
  onOpenGlossary: () => void;
  onOpenMilestones: () => void;
  onOpenAudioTour: () => void;
  onOpenCompanion: () => void;
}

function ToolbarMoreMenu(props: MoreMenuProps) {
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

  const close = () => setOpen(false);
  const wrap = (fn: () => void) => () => { fn(); close(); };

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        title="更多工具"
        className="text-xs px-2 py-1 rounded-full border border-indigo-100 dark:border-indigo-800/50 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
      >
        🛠
      </button>
      {open && anchor && createPortal(
        <>
          <div className="fixed inset-0 z-[90]" onClick={close} />
          <div
            className="fixed w-64 glass-panel border border-indigo-200 dark:border-indigo-800/60 rounded-xl shadow-[0_20px_50px_rgba(80,40,120,.4)] p-1.5 z-[95]"
            style={{ top: anchor.top, right: anchor.right }}
          >
            <MenuSection label="AI 助手">
              <MenuItem icon="🔎" label="跨论文搜笔记"     hint="Ctrl+Shift+F" onClick={wrap(props.onOpenGlobalSearch)} />
              <MenuItem icon="🎙" label="2 分钟语音导览"    disabled={!props.hasCurrentPaper} onClick={wrap(props.onOpenAudioTour)} />
              {props.companionEnabled && (
                <MenuItem icon="🎓" label="AI 伴读提问"     disabled={!props.hasCurrentPaper} onClick={wrap(props.onOpenCompanion)} />
              )}
              <MenuItem icon="⚖️" label="对比论文"         onClick={wrap(props.onOpenCompare)} />
              <MenuItem icon="📖" label="术语库"           onClick={wrap(props.onOpenGlossary)} />
              <MenuItem
                icon="🏆"
                label={`成就 & 苔苔`}
                hint={`Lv${props.mosslingLevel}`}
                onClick={wrap(props.onOpenMilestones)}
                highlight
              />
            </MenuSection>
            <MenuDivider />
            <MenuSection label="视图">
              <MenuItem
                icon={props.focusMode ? '🪟' : '🎯'}
                label={props.focusMode ? '退出专注' : '专注模式'}
                hint="F11"
                onClick={wrap(props.onToggleFocus)}
              />
              <MenuItem
                icon="Aa"
                label={`字号：${props.prefs.fontSize === 'sm' ? '小' : props.prefs.fontSize === 'md' ? '中' : '大'}`}
                hint="点击切换"
                onClick={() => { props.prefs.cycleFontSize(); }}
              />
              <MenuItem
                icon={props.prefs.twoPage ? '⎘' : '▭'}
                label={props.prefs.twoPage ? '切回单页' : '双页并排'}
                onClick={() => { props.prefs.setTwoPage(!props.prefs.twoPage); }}
                active={props.prefs.twoPage}
              />
              <ThemeInlineRow
                currentTheme={props.prefs.theme}
                setTheme={(t) => props.prefs.setTheme(t)}
              />
              <MenuItem
                icon={props.dark ? '☀️' : '🌙'}
                label={props.dark ? '浅色模式' : '深色模式'}
                onClick={wrap(props.onToggleDark)}
              />
            </MenuSection>
          </div>
        </>,
        document.body,
      )}
    </>
  );
}

function MenuSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="px-2 pt-1.5 pb-1 text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">
        {label}
      </div>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

function MenuDivider() {
  return <div className="h-px my-1.5 bg-gradient-to-r from-transparent via-indigo-200/50 to-transparent dark:via-indigo-800/40" />;
}

function MenuItem({
  icon, label, hint, onClick, disabled, active, highlight,
}: {
  icon: string;
  label: string;
  hint?: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  highlight?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={
        'flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-left transition-colors ' +
        (disabled
          ? 'opacity-40 cursor-not-allowed'
          : active
            ? 'bg-gradient-to-r from-indigo-500/25 to-fuchsia-500/25 text-indigo-700 dark:text-indigo-200 font-medium'
            : highlight
              ? 'bg-gradient-to-r from-amber-50 via-fuchsia-50 to-pink-50 dark:from-amber-900/20 dark:via-fuchsia-900/20 dark:to-pink-900/20 hover:shadow-[0_2px_8px_rgba(236,72,153,0.2)]'
              : 'hover:bg-indigo-50/70 dark:hover:bg-indigo-900/30 text-gray-700 dark:text-gray-200')
      }
    >
      <span className="w-5 text-center text-base">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {hint && <span className="text-[10px] text-gray-400 dark:text-gray-500 font-mono">{hint}</span>}
    </button>
  );
}

function ThemeInlineRow({
  currentTheme,
  setTheme,
}: {
  currentTheme: Theme;
  setTheme: (t: Theme) => void;
}) {
  return (
    <div className="flex items-center gap-1 px-2 py-1.5 rounded-lg">
      <span className="w-5 text-center text-base">🎨</span>
      <span className="text-xs text-gray-700 dark:text-gray-200 flex-shrink-0">主题</span>
      <div className="flex-1 flex items-center gap-1 justify-end">
        {(Object.keys(THEME_LABELS) as Theme[]).map((t) => (
          <button
            key={t}
            onClick={() => setTheme(t)}
            title={THEME_LABELS[t].name}
            className={
              'w-7 h-7 rounded-full text-sm transition-all ' +
              (currentTheme === t
                ? 'ring-2 ring-fuchsia-400 scale-110 bg-gradient-to-br from-indigo-100 to-fuchsia-100 dark:from-indigo-900/60 dark:to-fuchsia-900/60'
                : 'hover:bg-indigo-50 dark:hover:bg-indigo-900/30 opacity-70 hover:opacity-100')
            }
          >
            {THEME_LABELS[t].emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
