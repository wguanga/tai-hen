import { useAppStore } from '../store/app-store';
import { useOpenTabs } from '../hooks/useOpenTabs';
import { useOpenPaper } from '../hooks/useOpenPaper';
import { useToast } from './Toast';

/**
 * Horizontal strip of recently-opened papers. Sits above the PDF reader
 * and lets you ping-pong between papers without re-finding them in the sidebar.
 *
 * Hidden when there are 0 or 1 tabs — a single-paper session doesn't need it.
 */
export function PaperTabs() {
  const { state, dispatch } = useAppStore();
  const { tabs, close } = useOpenTabs();
  const openPaper = useOpenPaper();
  const { toast } = useToast();

  if (tabs.length <= 1) return null;

  const handleOpen = async (id: string) => {
    if (state.currentPaper?.id === id) return;
    try {
      await openPaper(id);
    } catch {
      toast('切换失败', 'error');
    }
  };

  const handleClose = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const wasCurrent = state.currentPaper?.id === id;
    close(id);
    if (wasCurrent) dispatch({ type: 'CLOSE_PAPER' });
  };

  return (
    <div className="paper-tabs flex items-stretch gap-1 px-2 py-1 border-b border-indigo-100/60 dark:border-indigo-900/40 bg-white/40 dark:bg-gray-900/30 backdrop-blur-sm overflow-x-auto">
      {tabs.map((p) => {
        const active = state.currentPaper?.id === p.id;
        return (
          <div
            key={p.id}
            onClick={() => handleOpen(p.id)}
            title={p.title}
            className={
              'group flex items-center gap-1.5 max-w-[220px] pl-3 pr-1.5 py-1 rounded-t-lg cursor-pointer text-xs transition-colors flex-shrink-0 ' +
              (active
                ? 'bg-white dark:bg-gray-800 text-indigo-700 dark:text-indigo-200 shadow-[0_-2px_8px_rgba(99,102,241,.1)] border border-b-0 border-indigo-200 dark:border-indigo-800'
                : 'bg-transparent text-gray-500 dark:text-gray-400 hover:bg-white/70 dark:hover:bg-gray-800/50 hover:text-indigo-600 dark:hover:text-indigo-300')
            }
          >
            <span className="truncate flex-1" style={{ maxWidth: 180 }}>
              {active && <span className="inline-block w-1 h-1 rounded-full bg-emerald-500 mr-1.5 align-middle animate-pulse" />}
              {p.title}
            </span>
            <button
              onClick={(e) => handleClose(e, p.id)}
              className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-700 opacity-60 group-hover:opacity-100"
              title={active ? '关闭当前论文' : '从标签移除'}
              aria-label="关闭"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
