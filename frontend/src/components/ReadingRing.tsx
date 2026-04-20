/**
 * Small circular progress ring used to show "how far into this paper am I?"
 * on each PaperList card. Fed by `reading_progress_{paperId}` in localStorage.
 */
export function ReadingRing({
  percent,
  size = 22,
  strokeWidth = 2.2,
}: {
  percent: number;
  size?: number;
  strokeWidth?: number;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const dash = (clamped / 100) * c;
  const cx = size / 2;
  const cy = size / 2;
  const gradId = `ring-grad-${size}`;

  const done = clamped >= 99;
  const cold = clamped < 5;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-label={`已读 ${Math.round(clamped)}%`}>
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={done ? '#10b981' : '#6366f1'} />
          <stop offset="50%" stopColor={done ? '#22c55e' : '#a855f7'} />
          <stop offset="100%" stopColor={done ? '#84cc16' : '#ec4899'} />
        </linearGradient>
      </defs>
      {/* Background circle (faint) */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={cold ? 'rgba(156, 163, 175, 0.25)' : 'rgba(165, 180, 252, 0.25)'}
        strokeWidth={strokeWidth}
      />
      {/* Progress arc */}
      {clamped > 0 && (
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={strokeWidth}
          strokeDasharray={`${dash} ${c - dash}`}
          strokeDashoffset={c * 0.25}  /* start at 12 o'clock */
          strokeLinecap="round"
          style={{ filter: done ? 'drop-shadow(0 0 3px rgba(34,197,94,.6))' : undefined }}
        />
      )}
      {/* Inner dot for completed papers */}
      {done && (
        <circle cx={cx} cy={cy} r={r * 0.35} fill="#22c55e" opacity="0.85">
          <title>已读完</title>
        </circle>
      )}
    </svg>
  );
}
