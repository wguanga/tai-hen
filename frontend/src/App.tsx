import { useCallback, useState } from 'react';
import { api } from './api';
import { AiPanel } from './components/AiPanel';
import { NotesPanel } from './components/NotesPanel';
import { PaperList } from './components/PaperList';
import { PdfReader } from './components/PdfReader';
import { SettingsModal } from './components/SettingsModal';
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
  const [dragging, setDragging] = useState(false);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

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
      <Toolbar
        onOpenSettings={() => setSettingsOpen(true)}
        leftCollapsed={leftCollapsed}
        onToggleLeft={() => setLeftCollapsed((v) => !v)}
        rightCollapsed={rightCollapsed}
        onToggleRight={() => setRightCollapsed((v) => !v)}
      />
      <div className="flex flex-1 min-h-0">
        {!leftCollapsed && <PaperList />}
        <div className="flex-1 min-w-0">
          <PdfReader />
        </div>
        {!rightCollapsed && (
          <div className="w-96 border-l flex flex-col flex-shrink-0">
            <div className="flex-1 min-h-0">
              <AiPanel />
            </div>
            <div className="h-56 border-t flex-shrink-0">
              <NotesPanel />
            </div>
          </div>
        )}
      </div>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}

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
