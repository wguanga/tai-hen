import type { StreamStatus } from '../hooks/useStream';

/**
 * A cute, animated progress bar with a running unicorn.
 *
 * Stages the backend emits:
 *   reading  → 通读全文中（indeterminate, 5% fill）
 *   map      → 分块处理，chunk / total 给出确定进度
 *   reduce   → 整合要点中（85%）
 *   writing  → 开始吐 token（95% → 100% 等 done）
 *   fallback → 切换到更小分块
 */
export function FantasyProgress({ status }: { status: StreamStatus | null }) {
  const { percent, label, indeterminate } = computeProgress(status);

  return (
    <div className="my-3">
      {/* Track */}
      <div className="relative h-8 rounded-full overflow-visible bg-gradient-to-r from-indigo-100 via-fuchsia-100 to-rose-100 dark:from-indigo-900/40 dark:via-fuchsia-900/40 dark:to-rose-900/40 border border-indigo-200/60 dark:border-indigo-700/40 shadow-inner">
        {/* Magical fill */}
        <div
          className={
            'absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-indigo-400 via-fuchsia-400 to-rose-400 shadow-[0_0_12px_rgba(168,85,247,0.55)] transition-[width] duration-700 ease-out ' +
            (indeterminate ? 'animate-pulse' : '')
          }
          style={{ width: `${Math.max(4, percent)}%` }}
        />
        {/* Sparkle trail (behind creature) */}
        <div
          className="absolute top-1/2 -translate-y-1/2 select-none pointer-events-none text-[10px] leading-none flex gap-1 transition-[left] duration-700 ease-out"
          style={{ left: `max(0%, calc(${percent}% - 56px))` }}
          aria-hidden
        >
          <span className="opacity-40 animate-[sparkle_1.2s_ease-in-out_infinite]">✨</span>
          <span className="opacity-60 animate-[sparkle_1.2s_ease-in-out_infinite_0.3s]">✨</span>
          <span className="opacity-80 animate-[sparkle_1.2s_ease-in-out_infinite_0.6s]">·</span>
        </div>
        {/* Running unicorn */}
        <div
          className="absolute top-1/2 -translate-y-1/2 text-2xl select-none pointer-events-none transition-[left] duration-700 ease-out drop-shadow-[0_0_8px_rgba(236,72,153,0.6)]"
          style={{
            left: `calc(${percent}% - 14px)`,
            animation: 'unicornRun 0.5s ease-in-out infinite alternate',
          }}
          aria-label="progress-creature"
        >
          🦄
        </div>
      </div>

      {/* Status text */}
      <div className="mt-2 flex items-baseline gap-2 text-xs">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-fuchsia-500 animate-pulse" />
        <span className="text-gray-700 dark:text-gray-200 font-medium">{label}</span>
        {!indeterminate && status?.chunk && status.total && (
          <span className="text-gray-400 dark:text-gray-500 tabular-nums">
            {status.chunk}/{status.total}
          </span>
        )}
      </div>
    </div>
  );
}

function computeProgress(status: StreamStatus | null): {
  percent: number;
  label: string;
  indeterminate: boolean;
} {
  if (!status) {
    return { percent: 5, label: '准备中…', indeterminate: true };
  }
  switch (status.stage) {
    case 'reading':
      return {
        percent: 8,
        label: status.msg || '正在通读全文…',
        indeterminate: true,
      };
    case 'map': {
      const chunk = status.chunk ?? 0;
      const total = status.total ?? 1;
      // Map phase occupies 10% → 75%
      const pct = 10 + (chunk / total) * 65;
      return {
        percent: Math.min(75, pct),
        label: status.msg || `提炼第 ${chunk}/${total} 段要点…`,
        indeterminate: false,
      };
    }
    case 'reduce':
      return {
        percent: 82,
        label: status.msg || '整合最终摘要…',
        indeterminate: true,
      };
    case 'writing':
      return {
        percent: 96,
        label: status.msg || '摘要生成中…',
        indeterminate: false,
      };
    case 'fallback':
      return {
        percent: 10,
        label: status.msg || '切换策略重试…',
        indeterminate: true,
      };
    default:
      return { percent: 50, label: status.msg || '处理中…', indeterminate: true };
  }
}
