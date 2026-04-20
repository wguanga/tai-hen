import { useEffect } from 'react';
import {
  FEATURE_META, LEVEL_META, type AIFeature, type AILevel,
} from '../hooks/useAIPrefs';

interface Props {
  level: AILevel;
  setLevel: (l: AILevel) => void;
  isEnabled: (f: AIFeature) => boolean;
  toggle: (f: AIFeature) => void;
  onClose: () => void;
}

const GROUPS: ('阅读时' | '打开论文时' | '按需调用')[] = ['阅读时', '打开论文时', '按需调用'];
const GROUP_HINTS: Record<string, string> = {
  '阅读时': '这些能力在你阅读时自动触发。关掉能省 token',
  '打开论文时': '每次打开论文调用一次',
  '按需调用': '只在你主动点按钮时调用，默认安全',
};

export function AIPrefsModal({ level, setLevel, isEnabled, toggle, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center pt-[6vh] p-6 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] rounded-2xl glass-panel border border-indigo-200 dark:border-indigo-800/60 shadow-[0_30px_80px_rgba(80,40,120,.45)] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-indigo-100 dark:border-indigo-900/40 bg-gradient-to-r from-indigo-500/10 via-fuchsia-500/10 to-rose-500/10">
          <div className="flex items-center gap-2">
            <span>🧠</span>
            <span className="font-semibold bg-gradient-to-r from-indigo-600 via-fuchsia-600 to-rose-500 bg-clip-text text-transparent">
              AI 能力设置
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 px-2 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            Esc
          </button>
        </div>

        <div className="p-5 overflow-y-auto">
          {/* Level selector */}
          <div className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
            Token 消耗档位
          </div>
          <div className="grid grid-cols-3 gap-2 mb-6">
            {(Object.keys(LEVEL_META) as AILevel[]).map((lv) => (
              <button
                key={lv}
                onClick={() => setLevel(lv)}
                className={
                  'text-left p-3 rounded-xl border transition-all ' +
                  (level === lv
                    ? 'border-fuchsia-400 bg-gradient-to-br from-indigo-100 via-fuchsia-100 to-rose-100 dark:from-indigo-900/50 dark:via-fuchsia-900/50 dark:to-rose-900/40 shadow-[0_4px_16px_rgba(168,85,247,.25)]'
                    : 'border-indigo-100 dark:border-indigo-900/30 hover:border-fuchsia-200 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/20')
                }
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl">{LEVEL_META[lv].emoji}</span>
                  <span className="font-semibold text-sm">{LEVEL_META[lv].name}</span>
                </div>
                <div className="text-[11px] text-gray-600 dark:text-gray-300 leading-tight mb-1">
                  {LEVEL_META[lv].hint}
                </div>
                <div className="text-[10px] font-mono text-fuchsia-600 dark:text-fuchsia-300">
                  {LEVEL_META[lv].estimate}
                </div>
              </button>
            ))}
          </div>

          {/* Per-feature toggles grouped */}
          <div className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
            细项开关（覆盖档位默认值）
          </div>
          {GROUPS.map((g) => {
            const items = (Object.keys(FEATURE_META) as AIFeature[]).filter((f) => FEATURE_META[f].group === g);
            return (
              <div key={g} className="mb-4">
                <div className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 mb-0.5">{g}</div>
                <div className="text-[10px] text-gray-400 mb-2">{GROUP_HINTS[g]}</div>
                <div className="space-y-1.5">
                  {items.map((f) => {
                    const enabled = isEnabled(f);
                    const weight = FEATURE_META[f].weight;
                    return (
                      <div
                        key={f}
                        className="flex items-start gap-3 p-2.5 rounded-lg border border-indigo-50 dark:border-indigo-900/20 hover:border-indigo-200 hover:bg-indigo-50/40 dark:hover:bg-indigo-900/20 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-xs font-medium">{FEATURE_META[f].name}</span>
                            <div className="flex items-center gap-0.5" title={`token 消耗权重 ${weight}/3`}>
                              {Array.from({ length: 3 }).map((_, i) => (
                                <span
                                  key={i}
                                  className={
                                    'w-1 h-2 rounded-sm ' +
                                    (i < weight
                                      ? 'bg-gradient-to-t from-indigo-400 to-fuchsia-400'
                                      : 'bg-gray-200 dark:bg-gray-700')
                                  }
                                />
                              ))}
                            </div>
                          </div>
                          <div className="text-[11px] text-gray-500 dark:text-gray-400">
                            {FEATURE_META[f].desc}
                          </div>
                        </div>
                        <button
                          onClick={() => toggle(f)}
                          role="switch"
                          aria-checked={enabled}
                          className={
                            'relative inline-flex h-5 w-9 flex-shrink-0 rounded-full transition-colors ' +
                            (enabled
                              ? 'bg-gradient-to-r from-indigo-500 to-fuchsia-500'
                              : 'bg-gray-300 dark:bg-gray-700')
                          }
                        >
                          <span
                            className={
                              'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ' +
                              (enabled ? 'left-[18px]' : 'left-0.5')
                            }
                          />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div className="mt-4 text-[10px] text-gray-400 dark:text-gray-500 leading-relaxed border-t border-indigo-100/60 dark:border-indigo-900/30 pt-3">
            切换档位会重置细项覆盖。档位是起点，细项是精调。<br />
            ⚡ 填充条 = 预估 token 消耗（1-3 级）。免费模型（如 glm-4-flash）可全开，付费按档位推荐即可。
          </div>
        </div>
      </div>
    </div>
  );
}
