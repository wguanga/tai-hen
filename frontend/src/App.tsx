import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { AiPanel } from './components/AiPanel';
import { NotesPanel } from './components/NotesPanel';
import { PaperList } from './components/PaperList';
import { PdfReader } from './components/PdfReader';
import { GlobalSearch } from './components/GlobalSearch';
import { SettingsModal } from './components/SettingsModal';
import { SummaryPanel } from './components/SummaryPanel';
import { Toolbar } from './components/Toolbar';
import { ToastProvider, useToast } from './components/Toast';
import { AppStoreProvider, useAppStore } from './store/app-store';

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
  const { dispatch } = useAppStore();
  const { toast } = useToast();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark');

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

  // Ctrl+Shift+F → global notes search; F11 → focus mode
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'F' || e.key === 'f')) {
        e.preventDefault();
        setGlobalSearchOpen(true);
      }
      if (e.key === 'F11') {
        e.preventDefault();
        setFocusMode((v) => !v);
      }
      if (e.key === 'Escape' && focusMode) {
        setFocusMode(false);
      }
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
        />
      )}
      <div className="flex flex-1 min-h-0">
        {!focusMode && !leftCollapsed && <PaperList />}
        <div className="flex-1 min-w-0">
          <PdfReader />
        </div>
        {!focusMode && !rightCollapsed && <RightPanel />}
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

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {globalSearchOpen && <GlobalSearch onClose={() => setGlobalSearchOpen(false)} />}

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

type RightTab = 'summary' | 'ai';

function RightPanel() {
  const [tab, setTab] = useState<RightTab>('summary');
  return (
    <div className="w-96 border-l flex flex-col flex-shrink-0">
      <div className="flex border-b bg-white dark:bg-gray-800 flex-shrink-0">
        <button
          onClick={() => setTab('summary')}
          className={
            'flex-1 text-sm py-1.5 ' +
            (tab === 'summary'
              ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-medium border-b-2 border-indigo-500'
              : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700')
          }
        >
          📑 摘要
        </button>
        <button
          onClick={() => setTab('ai')}
          className={
            'flex-1 text-sm py-1.5 ' +
            (tab === 'ai'
              ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-medium border-b-2 border-indigo-500'
              : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700')
          }
        >
          🤖 AI 对话
        </button>
      </div>
      <div className="flex-1 min-h-0">
        {tab === 'summary' ? <SummaryPanel /> : <AiPanel />}
      </div>
      <div className="h-56 border-t flex-shrink-0">
        <NotesPanel />
      </div>
    </div>
  );
}
