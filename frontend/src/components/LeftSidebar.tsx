import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAppStore } from '../store/app-store';
import { PaperList } from './PaperList';
import { OutlineTab } from './OutlineTab';
import { useResizable } from '../hooks/useResizable';

type Tab = 'papers' | 'outline';

/** Left sidebar with 论文库 / 大纲 tabs and a sliding active-indicator. */
export function LeftSidebar() {
  const { state } = useAppStore();
  const [tab, setTab] = useState<Tab>('papers');
  const [userSwitched, setUserSwitched] = useState(false);
  const paper = state.currentPaper;

  // Auto-switch to Outline on first paper open; respect manual choice after.
  useEffect(() => {
    if (paper && !userSwitched) setTab('outline');
    if (!paper) setTab('papers');
  }, [paper?.id, userSwitched]);

  const pick = (t: Tab) => { setUserSwitched(true); setTab(t); };

  // Indicator geometry — measured from the active tab button
  const papersRef = useRef<HTMLButtonElement>(null);
  const outlineRef = useRef<HTMLButtonElement>(null);
  const [indicator, setIndicator] = useState({ left: 6, width: 0, opacity: 0 });

  useLayoutEffect(() => {
    const active = tab === 'papers' ? papersRef.current : outlineRef.current;
    if (!active?.parentElement) return;
    const r = active.getBoundingClientRect();
    const pr = active.parentElement.getBoundingClientRect();
    setIndicator({ left: r.left - pr.left, width: r.width, opacity: 1 });
  }, [tab, paper?.id, state.papers.length]);

  const { size: width, startDrag } = useResizable({
    storageKey: 'leftSidebarWidth',
    initial: 240,
    min: 180,
    max: 480,
    side: 'right',
  });

  return (
    <div
      style={{ width }}
      className="relative border-r border-indigo-100/60 dark:border-indigo-900/40 glass-panel flex-shrink-0 flex flex-col"
    >
      <div
        className="resize-handle resize-handle-v"
        style={{ right: -2 }}
        onPointerDown={startDrag}
        title="拖动调整侧栏宽度"
      />
      {/* Tab strip with sliding indicator */}
      <div className="relative flex gap-1 p-1.5 border-b border-indigo-100/60 dark:border-indigo-900/40">
        {/* Sliding pill */}
        <div
          className="absolute top-1.5 bottom-1.5 rounded-md bg-gradient-to-r from-indigo-500/90 to-fuchsia-500/90 shadow-[0_2px_10px_rgba(168,85,247,0.4)] transition-[left,width,opacity] duration-[320ms] ease-[cubic-bezier(.2,.9,.3,1.1)] pointer-events-none"
          style={{ left: indicator.left, width: indicator.width, opacity: indicator.opacity }}
          aria-hidden
        />
        <TabButton
          refEl={papersRef}
          active={tab === 'papers'}
          onClick={() => pick('papers')}
          label="论文库"
          icon="📚"
          count={state.papers.length}
        />
        <TabButton
          refEl={outlineRef}
          active={tab === 'outline'}
          onClick={() => pick('outline')}
          label="大纲"
          icon="📑"
          disabled={!paper}
        />
      </div>
      <div className="flex-1 min-h-0">
        {tab === 'papers' ? <PaperList /> : <OutlineTab />}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
  icon,
  count,
  disabled,
  refEl,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: string;
  count?: number;
  disabled?: boolean;
  refEl: React.MutableRefObject<HTMLButtonElement | null>;
}) {
  return (
    <button
      ref={(el) => { refEl.current = el; }}
      onClick={onClick}
      disabled={disabled}
      className={
        'relative z-10 flex-1 text-xs py-1.5 px-2 rounded-md transition-colors flex items-center justify-center gap-1 ' +
        (active
          ? 'text-white'
          : disabled
            ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
            : 'text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-300')
      }
    >
      <span>{icon}</span>
      <span className="font-medium">{label}</span>
      {count !== undefined && (
        <span className={'text-[10px] font-normal ' + (active ? 'opacity-80' : 'opacity-60')}>
          ({count})
        </span>
      )}
    </button>
  );
}
