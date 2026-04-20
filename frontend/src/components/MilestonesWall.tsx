import { useEffect, useMemo } from 'react';
import { MILESTONES, type MilestoneCategory } from '../hooks/useAppStats';

interface Props {
  unlocked: Set<string>;
  level: number;
  xp: number;
  prevAt: number;
  nextAt: number;
  stats: {
    papersOpened: number;
    papersFinished: number;
    highlightsCreated: number;
    notesCreated: number;
    aiInteractions: number;
    streak: number;
    exportsCount?: number;
    citationsClicked?: number;
    compareUsed?: number;
    tagsAdded?: number;
    cmdPaletteUsed?: number;
    colorsUsedCount?: number;
    nightSessions?: number;
    dawnSessions?: number;
    totalSessions?: number;
  };
  onClose: () => void;
}

const CATEGORY_ORDER: MilestoneCategory[] = ['阅读', '标注', '笔记', 'AI', '坚持', '苔苔', '探索', '时辰', '彩蛋'];
const CATEGORY_EMOJI: Record<MilestoneCategory, string> = {
  阅读: '📖', 标注: '🖍️', 笔记: '✏️', AI: '🤖',
  坚持: '🔥', 苔苔: '🌿', 探索: '🧭', 时辰: '🌙', 彩蛋: '🎁',
};

export function MilestonesWall({ unlocked, level, xp, prevAt, nextAt, stats, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const earnedCount = [...unlocked].filter((id) => MILESTONES.some((m) => m.id === id)).length;
  const pct = Math.min(100, Math.max(0, ((xp - prevAt) / Math.max(1, nextAt - prevAt)) * 100));
  const grouped = useMemo(() => {
    const map = new Map<MilestoneCategory, typeof MILESTONES>();
    for (const m of MILESTONES) {
      const arr = map.get(m.category) ?? [];
      arr.push(m);
      map.set(m.category, arr);
    }
    return CATEGORY_ORDER.filter((c) => map.has(c)).map((c) => ({ cat: c, items: map.get(c)! }));
  }, []);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[82vh] rounded-2xl glass-panel border border-indigo-200 dark:border-indigo-800/60 shadow-[0_30px_80px_rgba(80,40,120,.45)] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-indigo-100 dark:border-indigo-900/40 bg-gradient-to-r from-indigo-500/10 via-fuchsia-500/10 to-rose-500/10">
          <div className="flex items-center gap-2">
            <span className="text-lg">🏆</span>
            <span className="font-semibold bg-gradient-to-r from-indigo-600 via-fuchsia-600 to-rose-500 bg-clip-text text-transparent">
              成就 & 苔苔成长
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 px-2 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            Esc
          </button>
        </div>

        {/* Level bar */}
        <div className="px-5 py-4 border-b border-indigo-100/60 dark:border-indigo-900/30">
          <div className="flex items-baseline justify-between mb-2">
            <div>
              <span className="text-2xl font-bold bg-gradient-to-r from-indigo-500 to-fuchsia-500 bg-clip-text text-transparent">
                Lv {level}
              </span>
              <span className="ml-2 text-xs text-gray-500">苔苔等级</span>
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 font-mono tabular-nums">
              {xp} / {nextAt} XP
            </div>
          </div>
          <div className="relative h-3 rounded-full bg-indigo-100/60 dark:bg-indigo-950/50 overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-indigo-400 via-fuchsia-400 to-rose-400 shadow-[0_0_10px_rgba(168,85,247,.5)] transition-all duration-700"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-1 text-[11px] text-gray-400 dark:text-gray-500 flex items-center justify-between">
            <span>上一级：{prevAt}</span>
            <span>距下一级：{Math.max(0, nextAt - xp)} XP</span>
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 px-5 py-3 border-b border-indigo-100/60 dark:border-indigo-900/30">
          <Stat label="论文" value={stats.papersOpened} />
          <Stat label="通读" value={stats.papersFinished} />
          <Stat label="高亮" value={stats.highlightsCreated} />
          <Stat label="笔记" value={stats.notesCreated} />
          <Stat label="AI" value={stats.aiInteractions} />
          <Stat label="连击" value={stats.streak} suffix="天" />
          <Stat label="导出" value={stats.exportsCount ?? 0} />
          <Stat label="引用" value={stats.citationsClicked ?? 0} />
          <Stat label="对比" value={stats.compareUsed ?? 0} />
          <Stat label="标签" value={stats.tagsAdded ?? 0} />
          <Stat label="⌘K" value={stats.cmdPaletteUsed ?? 0} />
          <Stat label="夜读" value={stats.nightSessions ?? 0} />
        </div>

        {/* Badges grid, grouped by category */}
        <div className="px-5 py-4 overflow-y-auto">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            已获得 <span className="font-semibold text-fuchsia-600 dark:text-fuchsia-300">{earnedCount}</span> / {MILESTONES.length} 枚
          </div>
          {grouped.map(({ cat, items }) => {
            const earnedInCat = items.filter((m) => unlocked.has(m.id)).length;
            return (
              <div key={cat} className="mb-5 last:mb-0">
                <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-gray-700 dark:text-gray-200 uppercase tracking-wider">
                  <span className="text-base">{CATEGORY_EMOJI[cat]}</span>
                  <span>{cat}</span>
                  <span className="text-[10px] text-gray-400 font-normal normal-case">
                    {earnedInCat} / {items.length}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  {items.map((m) => {
                    const ok = unlocked.has(m.id);
                    return (
                      <div
                        key={m.id}
                        className={
                          'rounded-xl p-3 text-center transition-all ' +
                          (ok
                            ? 'bg-gradient-to-br from-indigo-50 via-fuchsia-50 to-rose-50 dark:from-indigo-900/40 dark:via-fuchsia-900/40 dark:to-rose-900/30 border border-fuchsia-200 dark:border-fuchsia-800/60 shadow-[0_2px_10px_rgba(236,72,153,.15)]'
                            : 'bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 opacity-60 grayscale')
                        }
                        title={m.desc}
                      >
                        <div className="text-3xl mb-1">{ok ? m.emoji : '🔒'}</div>
                        <div className={'text-xs font-semibold ' + (ok ? 'text-gray-800 dark:text-gray-100' : 'text-gray-400')}>
                          {m.name}
                        </div>
                        <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 leading-tight">
                          {m.desc}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="text-center">
      <div className="text-lg font-semibold tabular-nums bg-gradient-to-br from-indigo-500 to-fuchsia-500 bg-clip-text text-transparent">
        {value}{suffix ?? ''}
      </div>
      <div className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider">{label}</div>
    </div>
  );
}
