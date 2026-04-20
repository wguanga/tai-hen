import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import type { AppConfig } from './types';
import { AiPanel } from './components/AiPanel';
import { NotesPanel } from './components/NotesPanel';
import { LeftSidebar } from './components/LeftSidebar';
import { PdfReader } from './components/PdfReader';
import { ComparePapersModal } from './components/ComparePapersModal';
import { FiguresPanel } from './components/FiguresPanel';
import { GlobalSearch } from './components/GlobalSearch';
import { GlossaryModal } from './components/GlossaryModal';
import { SettingsModal } from './components/SettingsModal';
import { SummaryPanel } from './components/SummaryPanel';
import { Toolbar } from './components/Toolbar';
import { ToastProvider, useToast } from './components/Toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import { CommandPalette } from './components/CommandPalette';
import { ShortcutHelp } from './components/ShortcutHelp';
import { PaperTabs } from './components/PaperTabs';
import { MilestoneToastHost } from './components/MilestoneToast';
import { MilestonesWall } from './components/MilestonesWall';
import { NotePath } from './components/NotePath';
import { AudioTour } from './components/AudioTour';
import { SemanticSearchResults } from './components/SemanticSearchResults';
import { AIPrefsModal } from './components/AIPrefsModal';
import { ReadingCompanion } from './components/ReadingCompanion';
import { useAIPrefs } from './hooks/useAIPrefs';
import { useAppStats } from './hooks/useAppStats';
import { useReadingStreak } from './hooks/useReadingStreak';
import { AppStoreProvider, useAppStore } from './store/app-store';
import { useAppPrefs, useTimeOfDayTint, THEME_LABELS, type Theme, type FontSize } from './hooks/useAppPrefs';
import { useResizable } from './hooks/useResizable';

export default function App() {
  return (
    <ToastProvider>
      <AppStoreProvider>
        <Layout />
      </AppStoreProvider>
    </ToastProvider>
  );
}

function Layout() {
  const { state: _appState, dispatch } = useAppStore();
  const { toast } = useToast();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark');
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const prefs = useAppPrefs();
  useTimeOfDayTint();
  const { streak } = useReadingStreak();
  const appStats = useAppStats({ streak });
  const [milestonesOpen, setMilestonesOpen] = useState(false);
  const [audioTourOpen, setAudioTourOpen] = useState(false);
  const [aiPrefsOpen, setAiPrefsOpen] = useState(false);
  const [companionOpen, setCompanionOpen] = useState(false);
  const aiPrefs = useAIPrefs();
  const audioTourPaperId = _appState.currentPaper?.id;
  // Publish level to window so PdfReader's creature scrollbar can pick it up
  useEffect(() => {
    (window as any).__mosslingLevel = appStats.level;
  }, [appStats.level]);

  // NL command bus: cmd palette dispatches events → we route to the right action
  useEffect(() => {
    const onSettings = () => setSettingsOpen(true);
    const onFocus = () => setFocusMode((v) => !v);
    const onShortcuts = () => setShortcutsOpen(true);
    window.addEventListener('nl-open-settings', onSettings);
    window.addEventListener('nl-toggle-focus', onFocus);
    window.addEventListener('nl-open-shortcuts', onShortcuts);
    return () => {
      window.removeEventListener('nl-open-settings', onSettings);
      window.removeEventListener('nl-toggle-focus', onFocus);
      window.removeEventListener('nl-open-shortcuts', onShortcuts);
    };
  }, []);

  const refreshConfig = useCallback(() => {
    api.getConfig().then(setConfig).catch(() => setConfig(null));
  }, []);

  useEffect(() => {
    refreshConfig();
  }, [refreshConfig]);

  const toggleDark = useCallback(() => {
    setDark((d) => {
      const next = !d;
      localStorage.setItem('theme', next ? 'dark' : 'light');
      document.documentElement.classList.toggle('dark', next);
      return next;
    });
  }, []);

  // Apply dark class on mount
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, []);

  // Global shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const inInput = (e.target as HTMLElement)?.matches?.('input, textarea, [contenteditable="true"]');

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setCmdPaletteOpen(true);
        window.dispatchEvent(new CustomEvent('app-event', { detail: { type: 'cmd-palette' } }));
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'F' || e.key === 'f')) {
        e.preventDefault();
        setGlobalSearchOpen(true);
        return;
      }
      if (!inInput && e.key === '?') {
        e.preventDefault();
        setShortcutsOpen(true);
        return;
      }
      if (e.key === 'F11') {
        e.preventDefault();
        setFocusMode((v) => !v);
      }
      if (e.key === 'Escape' && focusMode) setFocusMode(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [focusMode]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.name.endsWith('.pdf')) {
      toast('请拖入 PDF 文件', 'error');
      return;
    }
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
      toast('上传失败：' + (err as Error).message, 'error');
    }
  }, [dispatch, toast]);

  return (
    <div
      className="h-screen flex flex-col overflow-hidden"
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={handleDrop}
    >
      {/* #10 Time-of-day ambient tint overlay */}
      <div className="time-tint" aria-hidden />
      {!focusMode && (
        <Toolbar
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenGlobalSearch={() => setGlobalSearchOpen(true)}
          leftCollapsed={leftCollapsed}
          onToggleLeft={() => setLeftCollapsed((v) => !v)}
          rightCollapsed={rightCollapsed}
          onToggleRight={() => setRightCollapsed((v) => !v)}
          dark={dark}
          onToggleDark={toggleDark}
          focusMode={focusMode}
          onToggleFocus={() => setFocusMode((v) => !v)}
          onOpenCompare={() => { setCompareOpen(true); window.dispatchEvent(new CustomEvent('app-event', { detail: { type: 'compare-open' } })); }}
          onOpenGlossary={() => setGlossaryOpen(true)}
          config={config}
          prefs={prefs}
          onOpenMilestones={() => setMilestonesOpen(true)}
          mosslingLevel={appStats.level}
          onOpenAudioTour={() => setAudioTourOpen(true)}
          hasCurrentPaper={!!audioTourPaperId}
          onOpenAIPrefs={() => setAiPrefsOpen(true)}
          onOpenCompanion={() => setCompanionOpen(true)}
          aiLevel={aiPrefs.level}
          companionEnabled={aiPrefs.isEnabled('reading_companion')}
        />
      )}
      <div className="flex flex-1 min-h-0">
        {!focusMode && !leftCollapsed && (
          <ErrorBoundary label="LeftSidebar"><LeftSidebar /></ErrorBoundary>
        )}
        <div className="flex-1 min-w-0 flex flex-col">
          {!focusMode && <PaperTabs />}
          <div className="flex-1 min-h-0">
            <ErrorBoundary label="PdfReader">
              <PdfReader />
            </ErrorBoundary>
          </div>
        </div>
        {!focusMode && !rightCollapsed && (
          <ErrorBoundary label="RightPanel"><RightPanel /></ErrorBoundary>
        )}
      </div>
      {focusMode && (
        <button
          onClick={() => setFocusMode(false)}
          className="fixed top-2 right-2 text-xs px-2 py-1 rounded bg-gray-900/70 text-white hover:bg-gray-900 z-40"
          title="退出专注模式 (Esc / F11)"
        >
          退出专注
        </button>
      )}

      {settingsOpen && (
        <SettingsModal
          onClose={() => {
            setSettingsOpen(false);
            refreshConfig();
          }}
        />
      )}
      {cmdPaletteOpen && (
        <CommandPalette
          onClose={() => setCmdPaletteOpen(false)}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenShortcuts={() => setShortcutsOpen(true)}
          onToggleFocus={() => setFocusMode((v) => !v)}
          onToggleDark={toggleDark}
        />
      )}
      {shortcutsOpen && <ShortcutHelp onClose={() => setShortcutsOpen(false)} />}
      {milestonesOpen && (
        <MilestonesWall
          unlocked={appStats.unlocked}
          level={appStats.level}
          xp={appStats.xp}
          prevAt={appStats.prevAt}
          nextAt={appStats.nextAt}
          stats={appStats.stats}
          onClose={() => setMilestonesOpen(false)}
        />
      )}
      {audioTourOpen && audioTourPaperId && (
        <AudioTour paperId={audioTourPaperId} onClose={() => setAudioTourOpen(false)} />
      )}
      {aiPrefsOpen && (
        <AIPrefsModal
          level={aiPrefs.level}
          setLevel={aiPrefs.setLevel}
          isEnabled={aiPrefs.isEnabled}
          toggle={aiPrefs.toggle}
          onClose={() => setAiPrefsOpen(false)}
        />
      )}
      {companionOpen && audioTourPaperId && (
        <ReadingCompanion paperId={audioTourPaperId} onClose={() => setCompanionOpen(false)} />
      )}
      {/* Global listeners / overlays */}
      <MilestoneToastHost />
      <NotePath />
      <SemanticSearchResults />
      {globalSearchOpen && <GlobalSearch onClose={() => setGlobalSearchOpen(false)} />}
      {compareOpen && <ComparePapersModal onClose={() => setCompareOpen(false)} />}
      {glossaryOpen && <GlossaryModal onClose={() => setGlossaryOpen(false)} />}

      {/* close Layout root below */}

      {/* Drag overlay */}
      {dragging && (
        <div className="fixed inset-0 bg-indigo-500/20 z-50 flex items-center justify-center pointer-events-none">
          <div className="bg-white rounded-xl shadow-lg px-8 py-6 text-center">
            <div className="text-3xl mb-2">📄</div>
            <div className="text-lg font-medium text-indigo-700">松开以上传 PDF</div>
          </div>
        </div>
      )}
    </div>
  );
}

type RightTab = 'summary' | 'ai' | 'figures';

function RightPanel() {
  const [tab, setTab] = useState<RightTab>('summary');
  const tabs: { key: RightTab; label: string }[] = [
    { key: 'summary', label: '📑 摘要' },
    { key: 'ai', label: '🤖 AI' },
    { key: 'figures', label: '📊 图表' },
  ];
  const { size: width, startDrag: startDragW } = useResizable({
    storageKey: 'rightPanelWidth', initial: 384, min: 280, max: 640, side: 'left',
  });
  const { size: notesHeight, startDrag: startDragH } = useResizable({
    storageKey: 'notesHeight', initial: 224, min: 120, max: 520, side: 'top',
  });
  return (
    <div
      style={{ width }}
      className="relative border-l border-indigo-100/60 dark:border-indigo-900/40 glass-panel flex flex-col flex-shrink-0"
    >
      <div
        className="resize-handle resize-handle-v"
        style={{ left: -2 }}
        onPointerDown={startDragW}
        title="拖动调整面板宽度"
      />
      <div className="flex border-b border-indigo-100/60 dark:border-indigo-900/40 flex-shrink-0">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={
              'flex-1 text-sm py-2 transition-all relative ' +
              (tab === t.key
                ? 'text-fuchsia-700 dark:text-fuchsia-300 font-semibold'
                : 'text-gray-500 dark:text-gray-400 hover:text-indigo-500 dark:hover:text-indigo-300')
            }
          >
            {t.label}
            {tab === t.key && (
              <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 rounded-full bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-rose-500" />
            )}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0">
        {tab === 'summary' && <SummaryPanel />}
        {tab === 'ai' && <AiPanel />}
        {tab === 'figures' && <FiguresPanel onGoToPage={(p) => (window as any).__goToPage?.(p)} />}
      </div>
      <div
        style={{ height: notesHeight }}
        className="relative border-t border-indigo-100/60 dark:border-indigo-900/40 flex-shrink-0"
      >
        <div
          className="resize-handle resize-handle-h"
          style={{ top: -2 }}
          onPointerDown={startDragH}
          title="拖动调整笔记栏高度"
        />
        <NotesPanel />
      </div>
    </div>
  );
}
