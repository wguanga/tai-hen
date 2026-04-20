import { useCallback, useEffect, useState } from 'react';

export type AILevel = 'conservative' | 'balanced' | 'generous';

export type AIFeature =
  // Reading-time (auto-fires while you're on the page)
  | 'hover_translate'       // 鼠标悬停秒译
  | 'tag_highlight'         // 新高亮自动打 AI 标签
  | 'confusion_help'        // 90s 卡住时主动问候
  | 'figure_insight'        // 图表 AR 标签
  | 'action_suggest'        // 上下文动作推荐
  // On-paper-open
  | 'suggest_questions'     // 开卷问题卡片
  | 'reading_companion'     // 伴读提问
  // On-demand (user explicitly triggers)
  | 'compile_notes'         // 笔记智能合并
  | 'format_note'           // 笔记自动排版
  | 'semantic_search'       // 语义搜索
  | 'interpret_command';    // NL 命令解析

const LS_LEVEL = 'ai_prefs_level';
const LS_OVERRIDES = 'ai_prefs_overrides';

/** Default enablement per level. Missing keys default to `true` for on-demand features. */
const LEVEL_DEFAULTS: Record<AILevel, Partial<Record<AIFeature, boolean>>> = {
  conservative: {
    hover_translate: false,
    tag_highlight: false,
    confusion_help: false,
    figure_insight: false,
    action_suggest: false,
    suggest_questions: false,
    reading_companion: false,
    // On-demand stuff is always available even in conservative
    compile_notes: true,
    format_note: true,
    semantic_search: true,
    interpret_command: true,
  },
  balanced: {
    hover_translate: true,
    tag_highlight: true,
    confusion_help: true,
    figure_insight: false,  // N×LLM calls on open, pricey
    action_suggest: true,
    suggest_questions: true,
    reading_companion: true,
    compile_notes: true,
    format_note: true,
    semantic_search: true,
    interpret_command: true,
  },
  generous: {
    hover_translate: true,
    tag_highlight: true,
    confusion_help: true,
    figure_insight: true,
    action_suggest: true,
    suggest_questions: true,
    reading_companion: true,
    compile_notes: true,
    format_note: true,
    semantic_search: true,
    interpret_command: true,
  },
};

export const LEVEL_META: Record<AILevel, { name: string; emoji: string; hint: string; estimate: string }> = {
  conservative: {
    name: '节约',
    emoji: '🌱',
    hint: '只在你明确点击时调用 AI',
    estimate: '~100-300 tokens/论文',
  },
  balanced: {
    name: '均衡',
    emoji: '⚖️',
    hint: '常用自动能力开启，昂贵的留给你手动触发',
    estimate: '~1000-2500 tokens/论文',
  },
  generous: {
    name: '畅快',
    emoji: '✨',
    hint: '全部能力放飞自我，最大化 AI 反馈',
    estimate: '~3500-6000 tokens/论文',
  },
};

export const FEATURE_META: Record<AIFeature, { name: string; desc: string; group: '阅读时' | '打开论文时' | '按需调用'; weight: number }> = {
  hover_translate:   { name: '悬停秒译',       desc: '鼠标停留单词 0.5s 弹出中文', group: '阅读时', weight: 2 },
  tag_highlight:     { name: '高亮实时 AI 标签', desc: '新高亮自动打 7 类标签',      group: '阅读时', weight: 2 },
  confusion_help:    { name: '困惑主动问候',   desc: '停留 90s 时苔苔主动拆解此页', group: '阅读时', weight: 1 },
  figure_insight:    { name: '图表 AR 标签',   desc: '每张图/表旁浮出 AI 洞察',     group: '阅读时', weight: 3 },
  action_suggest:    { name: '智能动作建议',   desc: '根据上下文推荐下一步',        group: '阅读时', weight: 1 },
  suggest_questions: { name: '开卷问题卡片',   desc: '打开论文时生成 3 个起手问题', group: '打开论文时', weight: 1 },
  reading_companion: { name: '伴读提问',       desc: '带着问题读 + 检查是否读懂',   group: '打开论文时', weight: 2 },
  compile_notes:     { name: '笔记智能合并',   desc: '一键把高亮+笔记合成读书稿',   group: '按需调用', weight: 3 },
  format_note:       { name: '笔记自动排版',   desc: '帮手写笔记整理成 Markdown',   group: '按需调用', weight: 1 },
  semantic_search:   { name: '语义搜索',       desc: '命令面板里用语义查论文',      group: '按需调用', weight: 2 },
  interpret_command: { name: '自然语言命令',   desc: '命令面板理解中文指令',        group: '按需调用', weight: 1 },
};

function readLevel(): AILevel {
  try {
    const v = localStorage.getItem(LS_LEVEL);
    if (v === 'conservative' || v === 'balanced' || v === 'generous') return v;
  } catch { /* ignore */ }
  return 'balanced';
}
function readOverrides(): Partial<Record<AIFeature, boolean>> {
  try {
    const raw = localStorage.getItem(LS_OVERRIDES);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

export function useAIPrefs() {
  const [level, setLevelState] = useState<AILevel>(readLevel);
  const [overrides, setOverridesState] = useState<Partial<Record<AIFeature, boolean>>>(readOverrides);

  useEffect(() => { try { localStorage.setItem(LS_LEVEL, level); } catch { /* ignore */ } }, [level]);
  useEffect(() => { try { localStorage.setItem(LS_OVERRIDES, JSON.stringify(overrides)); } catch { /* ignore */ } }, [overrides]);

  const isEnabled = useCallback((f: AIFeature): boolean => {
    if (Object.prototype.hasOwnProperty.call(overrides, f)) return !!overrides[f];
    const lvl = LEVEL_DEFAULTS[level][f];
    return lvl !== undefined ? !!lvl : true;
  }, [level, overrides]);

  const toggle = useCallback((f: AIFeature) => {
    setOverridesState((prev) => {
      const currentEffective = Object.prototype.hasOwnProperty.call(prev, f)
        ? !!prev[f]
        : !!LEVEL_DEFAULTS[level][f];
      return { ...prev, [f]: !currentEffective };
    });
  }, [level]);

  /** Clear user override and fall back to the level default for that feature. */
  const resetOverride = useCallback((f: AIFeature) => {
    setOverridesState((prev) => {
      const { [f]: _drop, ...rest } = prev;
      void _drop;
      return rest;
    });
  }, []);

  const setLevel = useCallback((lvl: AILevel) => {
    setLevelState(lvl);
    // Clear overrides on level change — fresh start from the level defaults
    setOverridesState({});
  }, []);

  return { level, setLevel, isEnabled, toggle, resetOverride, overrides };
}
