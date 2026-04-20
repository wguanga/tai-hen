/**
 * Reusable Taitai SVG with emotion variants.
 * Used by: CreatureScrollbar (primary), AiPanel (thinking indicator),
 * empty states (sleepy), and completion feedback (proud).
 */

export type TaitaiEmotion =
  | 'idle'        // gentle wiggle (default)
  | 'running'     // scroll active — body bounces
  | 'dragging'    // user is dragging the creature
  | 'curious'     // wide eyes, just-opened-paper feeling
  | 'sleepy'      // half-closed eyes + ZZ (inactivity)
  | 'clapping'    // big smile + sparkles (new highlight)
  | 'proud'       // closed happy eyes + sparkles (finished reading)
  | 'thinking';   // eyes up + cloud bubble (AI working)

export type Accessory =
  | 'none' | 'glasses' | 'beaker' | 'stethoscope'
  | 'quill' | 'equation' | 'atom' | 'chip' | 'crown';

interface Props {
  emotion?: TaitaiEmotion;
  accessory?: Accessory;
  /** Reading streak count — shows a flame badge when ≥ 2 */
  streak?: number;
  /** Taitai evolution tier (1-15+). Unlocks extra leaves / flowers / glow. */
  level?: number;
  size?: number;
  /** Unique id suffix when rendering multiple on the same page (avoids defs collision) */
  keyId?: string;
}

export function Taitai({ emotion = 'idle', accessory = 'none', streak = 0, level = 1, size = 54, keyId = 'm' }: Props) {
  const bodyGrad = `moss-body-${keyId}`;
  const aura = `moss-aura-${keyId}`;

  const eyes = renderEyes(emotion);
  const mouth = renderMouth(emotion);
  const emotionAcc = renderAccessory(emotion);

  return (
    <svg viewBox="-30 -30 60 60" width={size} height={size} className="taitai-svg">
      <defs>
        <radialGradient id={bodyGrad} cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#d4f8b8" />
          <stop offset="100%" stopColor="#6fc85a" />
        </radialGradient>
        <radialGradient id={aura} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#f9a8d4" stopOpacity="0.65" />
          <stop offset="100%" stopColor="#f9a8d4" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* Lv 10+ golden halo behind the pink aura — sign of mastery */}
      {level >= 10 && (
        <circle r="26" fill="none" stroke="#fde68a" strokeWidth="0.6" strokeDasharray="1 1.5"
          style={{ filter: 'drop-shadow(0 0 4px rgba(253, 230, 138, .9))' }} />
      )}
      {/* pink magical aura */}
      <circle r="24" fill={`url(#${aura})`} />
      {/* Lv 15+ spinning inner ring */}
      {level >= 15 && (
        <circle r="22" fill="none" stroke="rgba(252, 211, 77, 0.55)" strokeWidth="0.4"
          strokeDasharray="0.8 2"
          style={{ transformOrigin: 'center', animation: 'creatureHaloSpin 18s linear infinite' }} />
      )}
      {/* tail */}
      <g className="creature-tail">
        <path d="M -14 8 Q -22 18 -14 22 Q -8 18 -10 10 Z" fill="#4a9a38" />
      </g>
      {/* body */}
      <g className="creature-body">
        <ellipse cx="0" cy="2" rx="18" ry="16" fill={`url(#${bodyGrad})`} />
        <ellipse cx="0" cy="8" rx="10" ry="6" fill="#e8f9d8" opacity=".75" />
        {/* leaf on head — extra leaves as level grows */}
        <path d="M -4 -16 Q 0 -24 6 -18 Q 2 -14 -4 -16 Z" fill="#4a9a38" />
        <path d="M 0 -16 L 0 -12" stroke="#2f6a22" strokeWidth="1" strokeLinecap="round" />
        {level >= 3 && (
          <path d="M -8 -14 Q -12 -20 -6 -20 Q -5 -16 -8 -14 Z" fill="#5aa848" />
        )}
        {level >= 5 && (
          <path d="M 8 -14 Q 13 -20 9 -20 Q 5 -16 8 -14 Z" fill="#5aa848" transform="rotate(-6, 8, -16)" />
        )}
        {/* Lv 7+ small pink bloom */}
        {level >= 7 && (
          <g>
            <circle cx="-2" cy="-19" r="1.6" fill="#f9a8d4" />
            <circle cx="-1" cy="-20.5" r="1" fill="#ec4899" />
            <circle cx="-3.2" cy="-20" r="1" fill="#ec4899" />
            <circle cx="-1.5" cy="-17.8" r="1" fill="#f472b6" />
          </g>
        )}
        {/* Lv 10+ berries on the body */}
        {level >= 10 && (
          <g>
            <circle cx="-12" cy="0" r="1.6" fill="#ef4444" />
            <circle cx="-11.3" cy="-.5" r=".5" fill="#fef2f2" opacity=".7" />
            <circle cx="13" cy="2" r="1.4" fill="#b91c1c" />
            <circle cx="13.5" cy="1.6" r=".4" fill="#fef2f2" opacity=".7" />
          </g>
        )}
        {/* cheeks */}
        <circle cx="-11" cy="4" r="3" fill="#ffb3c1" opacity=".6" />
        <circle cx="11" cy="4" r="3" fill="#ffb3c1" opacity=".6" />
        {eyes}
        {mouth}
        {/* feet — extra paws up if clapping */}
        {emotion === 'clapping' ? (
          <>
            <ellipse cx="-10" cy="8" rx="3.5" ry="2.2" fill="#4a9a38" transform="rotate(-20, -10, 8)" />
            <ellipse cx="10" cy="8" rx="3.5" ry="2.2" fill="#4a9a38" transform="rotate(20, 10, 8)" />
          </>
        ) : (
          <>
            <ellipse cx="-7" cy="17" rx="4" ry="2" fill="#4a9a38" />
            <ellipse cx="7" cy="17" rx="4" ry="2" fill="#4a9a38" />
          </>
        )}
      </g>
      {renderAccessory2(accessory)}
      {emotionAcc /* emotion-specific overlay (zz / sparkles / thinkbubble) */}
      {streak >= 2 && (
        <g className="creature-streak">
          {/* Flame body (orange → yellow gradient, teardrop shape) */}
          <path
            d="M 20 -18 Q 16 -22 17 -27 Q 21 -24 22 -20 Q 26 -22 24 -17 Q 26 -15 23 -12 Q 19 -13 20 -18 Z"
            fill="url(#streak-flame-grad)"
            stroke="#c2410c"
            strokeWidth=".4"
          />
          <defs>
            <linearGradient id="streak-flame-grad" x1="0%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="#fb923c" />
              <stop offset="60%" stopColor="#fde047" />
              <stop offset="100%" stopColor="#fef9c3" />
            </linearGradient>
          </defs>
          <text
            x="22"
            y="-8"
            textAnchor="middle"
            fontSize="7"
            fontWeight="700"
            fill="#c2410c"
            fontFamily="'JetBrains Mono', monospace"
          >
            {streak}
          </text>
        </g>
      )}
    </svg>
  );
}

function renderAccessory2(a: Accessory) {
  switch (a) {
    case 'glasses':
      return (
        <g className="acc-glasses">
          <circle cx="-6" cy="-2" r="4.2" fill="none" stroke="#1b2a1a" strokeWidth="1.2" />
          <circle cx="6" cy="-2" r="4.2" fill="none" stroke="#1b2a1a" strokeWidth="1.2" />
          <line x1="-1.8" y1="-2" x2="1.8" y2="-2" stroke="#1b2a1a" strokeWidth="1.2" />
          <circle cx="-6" cy="-2" r="3.8" fill="#a5b4fc" opacity=".25" />
          <circle cx="6" cy="-2" r="3.8" fill="#a5b4fc" opacity=".25" />
        </g>
      );
    case 'beaker':
      return (
        <g>
          <path d="M 12 -18 L 12 -14 L 8 -8 L 16 -8 L 12 -14 L 12 -18 Z" fill="#a5f3fc" stroke="#0891b2" strokeWidth=".8" />
          <circle cx="12" cy="-10" r="1.2" fill="#06b6d4" opacity=".7" />
        </g>
      );
    case 'stethoscope':
      return (
        <g>
          <path d="M -14 -8 Q -18 -4 -16 0 Q -14 4 -10 2" stroke="#374151" strokeWidth="1.4" fill="none" strokeLinecap="round" />
          <circle cx="-9" cy="3" r="2.5" fill="#374151" />
          <circle cx="-9" cy="3" r="1.2" fill="#6b7280" />
        </g>
      );
    case 'quill':
      return (
        <g transform="rotate(-20, 14, -14)">
          <path d="M 10 -6 L 18 -22 L 20 -20 L 12 -4 Z" fill="#f9e2af" stroke="#92400e" strokeWidth=".6" />
          <line x1="10" y1="-6" x2="18" y2="-22" stroke="#92400e" strokeWidth=".4" />
        </g>
      );
    case 'equation':
      return (
        <g>
          <rect x="-14" y="-22" width="28" height="6" rx="3" fill="#fbcfe8" opacity=".9" />
          <text x="0" y="-17" textAnchor="middle" fontSize="5" fill="#701a75" fontFamily="serif" fontStyle="italic">
            ∑ f(x) dx
          </text>
        </g>
      );
    case 'atom':
      return (
        <g>
          <ellipse cx="0" cy="-18" rx="12" ry="4" fill="none" stroke="#0ea5e9" strokeWidth=".8" opacity=".75" />
          <ellipse cx="0" cy="-18" rx="12" ry="4" fill="none" stroke="#8b5cf6" strokeWidth=".8" opacity=".75" transform="rotate(60, 0, -18)" />
          <ellipse cx="0" cy="-18" rx="12" ry="4" fill="none" stroke="#f472b6" strokeWidth=".8" opacity=".75" transform="rotate(-60, 0, -18)" />
          <circle cx="0" cy="-18" r="1.4" fill="#fde68a" />
        </g>
      );
    case 'chip':
      return (
        <g>
          <rect x="-14" y="-22" width="28" height="6" rx="1.2" fill="#1e293b" stroke="#475569" strokeWidth=".5" />
          <rect x="-11" y="-20.5" width="22" height="3" rx=".8" fill="#334155" />
          <circle cx="-6" cy="-19" r=".7" fill="#22d3ee" />
          <circle cx="0" cy="-19" r=".7" fill="#f472b6" />
          <circle cx="6" cy="-19" r=".7" fill="#a5b4fc" />
        </g>
      );
    case 'crown':
      return (
        <g>
          <path d="M -10 -16 L -8 -22 L -4 -18 L 0 -24 L 4 -18 L 8 -22 L 10 -16 Z"
                fill="#fde68a" stroke="#b45309" strokeWidth=".8" strokeLinejoin="round" />
          <circle cx="-8" cy="-22" r="1.2" fill="#ec4899" />
          <circle cx="0"  cy="-24" r="1.3" fill="#8b5cf6" />
          <circle cx="8"  cy="-22" r="1.2" fill="#10b981" />
        </g>
      );
    default:
      return null;
  }
}

function renderEyes(emotion: TaitaiEmotion) {
  switch (emotion) {
    case 'sleepy':
      return (
        <g className="creature-eyes">
          <path d="M -9 -2 Q -6 -0.5 -3 -2" stroke="#1b2a1a" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          <path d="M 3 -2 Q 6 -0.5 9 -2" stroke="#1b2a1a" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </g>
      );
    case 'clapping':
    case 'proud':
      return (
        <g className="creature-eyes">
          <path d="M -9 -3 Q -6 -6 -3 -3" stroke="#1b2a1a" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          <path d="M 3 -3 Q 6 -6 9 -3" stroke="#1b2a1a" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </g>
      );
    case 'curious':
      return (
        <g className="creature-eyes">
          <ellipse cx="-6" cy="-2" rx="3" ry="3.6" fill="#1b2a1a" />
          <ellipse cx="6" cy="-2" rx="3" ry="3.6" fill="#1b2a1a" />
          <circle cx="-5" cy="-3.6" r="1.2" fill="#fff" />
          <circle cx="7" cy="-3.6" r="1.2" fill="#fff" />
        </g>
      );
    case 'thinking':
      // Eyes look up-left (toward think bubble)
      return (
        <g className="creature-eyes">
          <ellipse cx="-6" cy="-3" rx="2.2" ry="2.8" fill="#1b2a1a" />
          <ellipse cx="6" cy="-3" rx="2.2" ry="2.8" fill="#1b2a1a" />
          <circle cx="-5" cy="-4.3" r=".9" fill="#fff" />
          <circle cx="7" cy="-4.3" r=".9" fill="#fff" />
        </g>
      );
    default:
      return (
        <g className="creature-eyes">
          <ellipse cx="-6" cy="-2" rx="2.2" ry="2.8" fill="#1b2a1a" />
          <ellipse cx="6" cy="-2" rx="2.2" ry="2.8" fill="#1b2a1a" />
          <circle cx="-5.3" cy="-2.8" r=".8" fill="#fff" />
          <circle cx="6.7" cy="-2.8" r=".8" fill="#fff" />
        </g>
      );
  }
}

function renderMouth(emotion: TaitaiEmotion) {
  if (emotion === 'clapping' || emotion === 'proud') {
    return <path d="M -4 5 Q 0 9 4 5" stroke="#1b2a1a" strokeWidth="1.5" fill="none" strokeLinecap="round" />;
  }
  if (emotion === 'sleepy') {
    return <ellipse cx="0" cy="6" rx="1.4" ry="1" fill="#1b2a1a" />;
  }
  if (emotion === 'curious') {
    return <circle cx="0" cy="6" r="1.5" fill="#1b2a1a" />;
  }
  return <path d="M -2 5 Q 0 6.2 2 5" stroke="#1b2a1a" strokeWidth="1.3" fill="none" strokeLinecap="round" />;
}

function renderAccessory(emotion: TaitaiEmotion) {
  if (emotion === 'sleepy') {
    return (
      <g className="creature-zz">
        <text x="11" y="-14" fill="#9ca3af" fontSize="10" fontWeight="700" fontFamily="monospace">
          z
        </text>
        <text x="17" y="-20" fill="#d1d5db" fontSize="7" fontWeight="700" fontFamily="monospace">
          z
        </text>
      </g>
    );
  }
  if (emotion === 'clapping' || emotion === 'proud') {
    return (
      <g className="creature-sparkles">
        <text x="-22" y="-10" fontSize="9">✨</text>
        <text x="14" y="-14" fontSize="9">✨</text>
      </g>
    );
  }
  if (emotion === 'thinking') {
    return (
      <g className="creature-thinkbubble">
        <circle cx="14" cy="-18" r="2.8" fill="#f0f9ff" stroke="#cbd5e1" strokeWidth=".6" />
        <circle cx="19" cy="-23" r="1.5" fill="#f0f9ff" stroke="#cbd5e1" strokeWidth=".5" />
        <text x="12" y="-16" fontSize="4" fill="#64748b" fontFamily="monospace">
          ...
        </text>
      </g>
    );
  }
  return null;
}
