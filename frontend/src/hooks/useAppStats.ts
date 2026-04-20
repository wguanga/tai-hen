import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../store/app-store';
import type { HighlightColor } from '../types';

/** All-time accumulated counters across sessions (localStorage-backed). */
interface Stats {
  papersOpened: number;        // distinct paper IDs ever opened
  papersFinished: number;      // read to 98%+
  highlightsCreated: number;   // cumulative, across all papers
  notesCreated: number;        // cumulative
  aiInteractions: number;      // each saved ai_answer/ai_summary note
  streak: number;              // days
  // ── extended counters (populated via window 'app-event' CustomEvent) ──
  exportsCount: number;        // markdown exports from NotesPanel
  citationsClicked: number;    // [n] citation popover opens
  compareUsed: number;         // compare-papers modal opens
  tagsAdded: number;           // tags committed on any paper
  cmdPaletteUsed: number;      // cmd-K invocations
  colorsUsedCount: number;     // distinct highlight colors ever used (0–4)
  nightSessions: number;       // sessions started between 22:00–04:00
  dawnSessions: number;        // sessions started between 05:00–07:00
  totalSessions: number;       // app mount count
}

const LS = {
  papersOpened: 'stats_papers_opened',
  papersFinished: 'stats_papers_finished',
  highlightsCreated: 'stats_highlights_created',
  notesCreated: 'stats_notes_created',
  aiInteractions: 'stats_ai_interactions',
  exportsCount: 'stats_exports',
  citationsClicked: 'stats_citations_clicked',
  compareUsed: 'stats_compare_used',
  tagsAdded: 'stats_tags_added',
  cmdPaletteUsed: 'stats_cmd_palette',
  colorsUsed: 'stats_colors_used_set',
  nightSessions: 'stats_night_sessions',
  dawnSessions: 'stats_dawn_sessions',
  totalSessions: 'stats_total_sessions',
};

function readSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []);
  } catch { return new Set(); }
}
function saveSet(key: string, s: Set<string>) {
  try { localStorage.setItem(key, JSON.stringify([...s])); } catch { /* ignore */ }
}
function readNum(key: string): number {
  try { return Number(localStorage.getItem(key) ?? 0) || 0; } catch { return 0; }
}
function writeNum(key: string, v: number) {
  try { localStorage.setItem(key, String(v)); } catch { /* ignore */ }
}

/* ================== Level & XP ==================
   XP formula:
     paper opened      +20
     highlight          +3
     note               +6
     paper finished    +50
     ai interaction     +8
     streak day        +10
     export             +5
     citation click     +1
     compare            +5
     tag added          +2
     distinct color     +5 (up to 20 for all four)
     cmd-palette use    +1
     night session      +3
     dawn session       +3

   Level thresholds grow quadratically past Lv 10 so the creature has room
   to evolve long-term without the bar ever fully filling in a week.
*/
const LEVEL_XP: number[] = [
  0, 40, 120, 240, 420, 680, 1050, 1500, 2100, 2900, 3900,
  5200, 6800, 8800, 11200, 14000, 17500, 21500, 26000, 31000, 37000,
];

export function computeXp(s: Stats): number {
  return s.papersOpened * 20
    + s.highlightsCreated * 3
    + s.notesCreated * 6
    + s.papersFinished * 50
    + s.aiInteractions * 8
    + s.streak * 10
    + s.exportsCount * 5
    + s.citationsClicked * 1
    + s.compareUsed * 5
    + s.tagsAdded * 2
    + s.colorsUsedCount * 5
    + s.cmdPaletteUsed * 1
    + s.nightSessions * 3
    + s.dawnSessions * 3;
}
export function computeLevel(xp: number): { level: number; nextAt: number; prevAt: number } {
  let level = 1;
  for (let i = 0; i < LEVEL_XP.length; i++) {
    if (xp >= LEVEL_XP[i]) level = i + 1;
  }
  const prevAt = LEVEL_XP[level - 1] ?? 0;
  const nextAt = LEVEL_XP[level] ?? LEVEL_XP[LEVEL_XP.length - 1] + 5000;
  return { level, nextAt, prevAt };
}

/* ================== Milestones ================== */
export type MilestoneCategory =
  | '阅读' | '标注' | '笔记' | 'AI' | '坚持' | '苔苔' | '探索' | '时辰' | '彩蛋';

export interface Milestone {
  id: string;
  name: string;
  emoji: string;
  desc: string;
  category: MilestoneCategory;
  check: (s: Stats & { level: number }) => boolean;
}

export const MILESTONES: Milestone[] = [
  // ── 📖 阅读 ────────────────────────────────────────────────
  { id: 'first-paper',     category: '阅读', name: '启程',       emoji: '🌱', desc: '打开第一篇论文',            check: s => s.papersOpened >= 1 },
  { id: 'five-papers',     category: '阅读', name: '初窥门径',   emoji: '📖', desc: '浏览 5 篇论文',             check: s => s.papersOpened >= 5 },
  { id: 'twenty-papers',   category: '阅读', name: '博览者',     emoji: '📚', desc: '打开 20 篇论文',            check: s => s.papersOpened >= 20 },
  { id: 'fifty-papers',    category: '阅读', name: '图书馆员',   emoji: '🏛️', desc: '打开 50 篇论文',            check: s => s.papersOpened >= 50 },
  { id: 'hundred-papers',  category: '阅读', name: '百篇不惑',   emoji: '🎓', desc: '打开 100 篇论文',           check: s => s.papersOpened >= 100 },
  { id: 'first-finish',    category: '阅读', name: '一本读完',   emoji: '🏆', desc: '通读完第一篇论文',          check: s => s.papersFinished >= 1 },
  { id: 'three-finish',    category: '阅读', name: '三连通读',   emoji: '📗', desc: '通读完 3 篇论文',           check: s => s.papersFinished >= 3 },
  { id: 'ten-finish',      category: '阅读', name: '通读达人',   emoji: '📘', desc: '通读完 10 篇论文',          check: s => s.papersFinished >= 10 },
  { id: 'thirty-finish',   category: '阅读', name: '学术常客',   emoji: '📙', desc: '通读完 30 篇论文',          check: s => s.papersFinished >= 30 },

  // ── 🖍️ 标注 ────────────────────────────────────────────────
  { id: 'first-hl',        category: '标注', name: '初次标注',   emoji: '🖍️', desc: '留下第一个高亮',            check: s => s.highlightsCreated >= 1 },
  { id: 'ten-hl',          category: '标注', name: '十划秀才',   emoji: '🌼', desc: '累计 10 个高亮',            check: s => s.highlightsCreated >= 10 },
  { id: 'fifty-hl',        category: '标注', name: '精读者',     emoji: '🎯', desc: '累计 50 个高亮',            check: s => s.highlightsCreated >= 50 },
  { id: 'two-hundred-hl',  category: '标注', name: '标注大师',   emoji: '✨', desc: '累计 200 个高亮',           check: s => s.highlightsCreated >= 200 },
  { id: 'thousand-hl',     category: '标注', name: '标注之海',   emoji: '🌊', desc: '累计 1000 个高亮',          check: s => s.highlightsCreated >= 1000 },
  { id: 'rainbow',         category: '标注', name: '四色齐舞',   emoji: '🌈', desc: '四种颜色都用过一次',        check: s => s.colorsUsedCount >= 4 },

  // ── ✏️ 笔记 ────────────────────────────────────────────────
  { id: 'first-note',      category: '笔记', name: '笔耕伊始',   emoji: '✏️', desc: '写下第一条笔记',            check: s => s.notesCreated >= 1 },
  { id: 'ten-notes',       category: '笔记', name: '小试牛刀',   emoji: '📝', desc: '累计 10 条笔记',            check: s => s.notesCreated >= 10 },
  { id: 'thirty-notes',    category: '笔记', name: '笔耕不辍',   emoji: '🖊️', desc: '累计 30 条笔记',            check: s => s.notesCreated >= 30 },
  { id: 'hundred-notes',   category: '笔记', name: '百记心得',   emoji: '📓', desc: '累计 100 条笔记',           check: s => s.notesCreated >= 100 },
  { id: 'first-export',    category: '笔记', name: '首次成册',   emoji: '📤', desc: '导出第一份阅读笔记',        check: s => s.exportsCount >= 1 },
  { id: 'ten-exports',     category: '笔记', name: '出版者',     emoji: '📖', desc: '累计导出 10 份笔记',        check: s => s.exportsCount >= 10 },

  // ── 🤖 AI ──────────────────────────────────────────────────
  { id: 'first-ai',        category: 'AI',   name: '初遇 AI',    emoji: '🤖', desc: '保存第一条 AI 回答',        check: s => s.aiInteractions >= 1 },
  { id: 'ai-x10',          category: 'AI',   name: '与 AI 同行', emoji: '💫', desc: '保存 10 条 AI 解释',        check: s => s.aiInteractions >= 10 },
  { id: 'ai-x50',          category: 'AI',   name: 'AI 搭档',    emoji: '🧠', desc: '保存 50 条 AI 解释',        check: s => s.aiInteractions >= 50 },
  { id: 'ai-x200',         category: 'AI',   name: '人机共读',   emoji: '🚀', desc: '保存 200 条 AI 解释',       check: s => s.aiInteractions >= 200 },

  // ── 🔥 坚持 ────────────────────────────────────────────────
  { id: 'streak-3',        category: '坚持', name: '三日连击',   emoji: '🔥', desc: '连续阅读 3 天',             check: s => s.streak >= 3 },
  { id: 'streak-7',        category: '坚持', name: '一周不辍',   emoji: '⚡', desc: '连续阅读 7 天',             check: s => s.streak >= 7 },
  { id: 'streak-14',       category: '坚持', name: '双周修行',   emoji: '🌀', desc: '连续阅读 14 天',            check: s => s.streak >= 14 },
  { id: 'streak-30',       category: '坚持', name: '月度学霸',   emoji: '🌟', desc: '连续阅读 30 天',            check: s => s.streak >= 30 },
  { id: 'streak-100',      category: '坚持', name: '百日筑基',   emoji: '💎', desc: '连续阅读 100 天',           check: s => s.streak >= 100 },

  // ── 🌿 苔苔 ────────────────────────────────────────────────
  { id: 'level-3',         category: '苔苔', name: '苔苔冒芽',   emoji: '🌱', desc: '陪伴苔苔升到 Lv 3',         check: s => s.level >= 3 },
  { id: 'level-5',         category: '苔苔', name: '苔苔长大了', emoji: '🌿', desc: '陪伴苔苔升到 Lv 5',         check: s => s.level >= 5 },
  { id: 'level-10',        category: '苔苔', name: '苔苔开花了', emoji: '🌸', desc: '陪伴苔苔升到 Lv 10',        check: s => s.level >= 10 },
  { id: 'level-15',        category: '苔苔', name: '苔苔结果了', emoji: '🍇', desc: '陪伴苔苔升到 Lv 15',        check: s => s.level >= 15 },
  { id: 'level-20',        category: '苔苔', name: '苔苔成仙了', emoji: '🦄', desc: '陪伴苔苔升到 Lv 20',        check: s => s.level >= 20 },

  // ── 🧭 探索 ────────────────────────────────────────────────
  { id: 'first-cite',      category: '探索', name: '查证',       emoji: '🔎', desc: '首次点击 [n] 查参考文献',  check: s => s.citationsClicked >= 1 },
  { id: 'cite-x50',        category: '探索', name: '追根溯源',   emoji: '🧭', desc: '累计 50 次参考文献跳转',   check: s => s.citationsClicked >= 50 },
  { id: 'first-compare',   category: '探索', name: '对照阅读',   emoji: '🔀', desc: '首次打开论文对比',          check: s => s.compareUsed >= 1 },
  { id: 'compare-x10',     category: '探索', name: '博采众长',   emoji: '🧩', desc: '累计对比 10 次',            check: s => s.compareUsed >= 10 },
  { id: 'first-tag',       category: '探索', name: '归类好手',   emoji: '🏷️', desc: '首次给论文打标签',          check: s => s.tagsAdded >= 1 },
  { id: 'tags-x20',        category: '探索', name: '井井有条',   emoji: '🗂️', desc: '累计打 20 个标签',          check: s => s.tagsAdded >= 20 },
  { id: 'cmd-palette',     category: '探索', name: '快意江湖',   emoji: '⌨️', desc: '首次用 Ctrl+K 命令面板',    check: s => s.cmdPaletteUsed >= 1 },
  { id: 'cmd-x30',         category: '探索', name: '键盘侠客',   emoji: '🎹', desc: '累计打开命令面板 30 次',    check: s => s.cmdPaletteUsed >= 30 },

  // ── 🌙 时辰 ────────────────────────────────────────────────
  { id: 'night-owl',       category: '时辰', name: '夜读者',     emoji: '🌙', desc: '深夜（22:00 后）开启一次', check: s => s.nightSessions >= 1 },
  { id: 'night-x10',       category: '时辰', name: '月下独酌',   emoji: '🌕', desc: '累计 10 次深夜阅读',        check: s => s.nightSessions >= 10 },
  { id: 'early-bird',      category: '时辰', name: '晨读客',     emoji: '🌅', desc: '凌晨（05:00-07:00）开启一次', check: s => s.dawnSessions >= 1 },
  { id: 'sessions-50',     category: '时辰', name: '常客',       emoji: '🪷', desc: '累计 50 次启动阅读',        check: s => s.totalSessions >= 50 },

  // ── 🎁 彩蛋 ────────────────────────────────────────────────
  { id: 'polymath',        category: '彩蛋', name: '六艺通达',   emoji: '🎨', desc: '同时达成：论文 20 + 高亮 200 + 笔记 30', check: s => s.papersOpened >= 20 && s.highlightsCreated >= 200 && s.notesCreated >= 30 },
  { id: 'completionist',   category: '彩蛋', name: '圆满',       emoji: '🎖️', desc: '解锁其它全部成就',          check: (() => null as any) /* patched below */ },
];

// `completionist` unlocks when every *other* milestone is earned.
// We patch the check closure post-hoc so it can reference MILESTONES.
(() => {
  const self = MILESTONES.find((m) => m.id === 'completionist')!;
  self.check = () => {
    // Caller passes us statsWithLevel; the check here needs access to `unlocked`,
    // which isn't in Stats. Instead, this milestone is evaluated in the hook
    // below against the `unlocked` set directly — not via `check`. We keep this
    // placeholder so the grid shows it; the real gate is in useAppStats.
    return false;
  };
})();

/** Hook: tracks stats across sessions, auto-detects milestone unlocks, emits
 *  `milestone-unlock` CustomEvents for any newly-earned badge. */
export function useAppStats(opts: { streak: number }) {
  const { state } = useAppStore();

  // Hydrate cached stats
  const [papersOpened, setPapersOpened] = useState<Set<string>>(() => readSet(LS.papersOpened));
  const [papersFinished, setPapersFinished] = useState<Set<string>>(() => readSet(LS.papersFinished));
  const [highlightsCreated, setHighlightsCreated] = useState<number>(() => readNum(LS.highlightsCreated));
  const [notesCreated, setNotesCreated] = useState<number>(() => readNum(LS.notesCreated));
  const [aiInteractions, setAiInteractions] = useState<number>(() => readNum(LS.aiInteractions));
  const [exportsCount, setExportsCount] = useState<number>(() => readNum(LS.exportsCount));
  const [citationsClicked, setCitationsClicked] = useState<number>(() => readNum(LS.citationsClicked));
  const [compareUsed, setCompareUsed] = useState<number>(() => readNum(LS.compareUsed));
  const [tagsAdded, setTagsAdded] = useState<number>(() => readNum(LS.tagsAdded));
  const [cmdPaletteUsed, setCmdPaletteUsed] = useState<number>(() => readNum(LS.cmdPaletteUsed));
  const [colorsUsed, setColorsUsed] = useState<Set<string>>(() => readSet(LS.colorsUsed));
  const [nightSessions, setNightSessions] = useState<number>(() => readNum(LS.nightSessions));
  const [dawnSessions, setDawnSessions] = useState<number>(() => readNum(LS.dawnSessions));
  const [totalSessions, setTotalSessions] = useState<number>(() => readNum(LS.totalSessions));

  // Session bump (once per mount)
  const bumpedSessionRef = useRef(false);
  useEffect(() => {
    if (bumpedSessionRef.current) return;
    bumpedSessionRef.current = true;
    setTotalSessions((n) => { const v = n + 1; writeNum(LS.totalSessions, v); return v; });
    const h = new Date().getHours();
    if (h >= 22 || h < 4) {
      setNightSessions((n) => { const v = n + 1; writeNum(LS.nightSessions, v); return v; });
    } else if (h >= 5 && h < 7) {
      setDawnSessions((n) => { const v = n + 1; writeNum(LS.dawnSessions, v); return v; });
    }
  }, []);

  // Track distinct paper opens
  useEffect(() => {
    const p = state.currentPaper;
    if (!p) return;
    if (!papersOpened.has(p.id)) {
      setPapersOpened((prev) => {
        const next = new Set(prev);
        next.add(p.id);
        saveSet(LS.papersOpened, next);
        return next;
      });
    }
  }, [state.currentPaper?.id, papersOpened]);

  // Delta tracking for highlights / notes / AI notes within the same paper
  const prevHlRef = useRef<{ paperId: string | null; count: number }>({ paperId: null, count: 0 });
  const prevNoteRef = useRef<{ paperId: string | null; count: number; ai: number }>({ paperId: null, count: 0, ai: 0 });

  useEffect(() => {
    const pid = state.currentPaper?.id ?? null;
    const curCount = state.highlights.length;
    if (prevHlRef.current.paperId === pid) {
      const delta = curCount - prevHlRef.current.count;
      if (delta > 0) {
        setHighlightsCreated((n) => { const v = n + delta; writeNum(LS.highlightsCreated, v); return v; });
        // New highlight(s): make sure every color we currently own is recorded
        const colorsSeen = new Set(state.highlights.slice(-delta).map((h) => h.color as HighlightColor));
        setColorsUsed((prev) => {
          let changed = false;
          const next = new Set(prev);
          colorsSeen.forEach((c) => { if (!next.has(c)) { next.add(c); changed = true; } });
          if (changed) saveSet(LS.colorsUsed, next);
          return changed ? next : prev;
        });
      }
    }
    prevHlRef.current = { paperId: pid, count: curCount };
  }, [state.highlights.length, state.currentPaper?.id]);

  useEffect(() => {
    const pid = state.currentPaper?.id ?? null;
    const curCount = state.notes.length;
    const curAi = state.notes.filter(
      (n) => n.source === 'ai_answer' || n.source === 'ai_summary',
    ).length;
    if (prevNoteRef.current.paperId === pid) {
      const dTotal = curCount - prevNoteRef.current.count;
      const dAi = curAi - prevNoteRef.current.ai;
      if (dTotal > 0) {
        setNotesCreated((n) => { const v = n + dTotal; writeNum(LS.notesCreated, v); return v; });
      }
      if (dAi > 0) {
        setAiInteractions((n) => { const v = n + dAi; writeNum(LS.aiInteractions, v); return v; });
      }
    }
    prevNoteRef.current = { paperId: pid, count: curCount, ai: curAi };
  }, [state.notes, state.currentPaper?.id]);

  // Listen for 'paper-finished' CustomEvents (fired by PdfReader on celebration)
  useEffect(() => {
    const onFin = (e: Event) => {
      const id = (e as CustomEvent).detail?.paperId as string | undefined;
      if (!id) return;
      setPapersFinished((prev) => {
        if (prev.has(id)) return prev;
        const next = new Set(prev);
        next.add(id);
        saveSet(LS.papersFinished, next);
        return next;
      });
    };
    window.addEventListener('paper-finished', onFin);
    return () => window.removeEventListener('paper-finished', onFin);
  }, []);

  // Central event bus for lightweight counters — components emit with
  //   window.dispatchEvent(new CustomEvent('app-event', { detail: { type: 'export' } }))
  useEffect(() => {
    const onEvt = (e: Event) => {
      const t = (e as CustomEvent).detail?.type as string | undefined;
      if (!t) return;
      switch (t) {
        case 'export':
          setExportsCount((n) => { const v = n + 1; writeNum(LS.exportsCount, v); return v; }); break;
        case 'citation-click':
          setCitationsClicked((n) => { const v = n + 1; writeNum(LS.citationsClicked, v); return v; }); break;
        case 'compare-open':
          setCompareUsed((n) => { const v = n + 1; writeNum(LS.compareUsed, v); return v; }); break;
        case 'tag-added': {
          const count = (e as CustomEvent).detail?.count ?? 1;
          const delta = typeof count === 'number' ? count : 1;
          setTagsAdded((n) => { const v = n + delta; writeNum(LS.tagsAdded, v); return v; });
          break;
        }
        case 'cmd-palette':
          setCmdPaletteUsed((n) => { const v = n + 1; writeNum(LS.cmdPaletteUsed, v); return v; }); break;
      }
    };
    window.addEventListener('app-event', onEvt);
    return () => window.removeEventListener('app-event', onEvt);
  }, []);

  const stats: Stats = useMemo(() => ({
    papersOpened: papersOpened.size,
    papersFinished: papersFinished.size,
    highlightsCreated,
    notesCreated,
    aiInteractions,
    streak: opts.streak,
    exportsCount,
    citationsClicked,
    compareUsed,
    tagsAdded,
    cmdPaletteUsed,
    colorsUsedCount: colorsUsed.size,
    nightSessions,
    dawnSessions,
    totalSessions,
  }), [
    papersOpened, papersFinished, highlightsCreated, notesCreated, aiInteractions,
    opts.streak, exportsCount, citationsClicked, compareUsed, tagsAdded,
    cmdPaletteUsed, colorsUsed, nightSessions, dawnSessions, totalSessions,
  ]);

  const xp = computeXp(stats);
  const { level, nextAt, prevAt } = computeLevel(xp);
  const statsWithLevel = useMemo(() => ({ ...stats, level }), [stats, level]);

  // Unlock milestones
  const [unlocked, setUnlocked] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('milestones_unlocked');
      const arr = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(arr) ? arr : []);
    } catch { return new Set(); }
  });

  useEffect(() => {
    const newly: Milestone[] = [];
    for (const m of MILESTONES) {
      if (m.id === 'completionist') continue; // evaluated separately below
      if (!unlocked.has(m.id) && m.check(statsWithLevel)) {
        newly.push(m);
      }
    }
    // Completionist: every other milestone earned
    const otherIds = MILESTONES.filter((m) => m.id !== 'completionist').map((m) => m.id);
    const allOthersEarned = otherIds.every((id) => unlocked.has(id) || newly.some((n) => n.id === id));
    if (allOthersEarned && !unlocked.has('completionist')) {
      const c = MILESTONES.find((m) => m.id === 'completionist');
      if (c) newly.push(c);
    }
    if (newly.length === 0) return;
    setUnlocked((prev) => {
      const next = new Set(prev);
      newly.forEach((m) => next.add(m.id));
      try { localStorage.setItem('milestones_unlocked', JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
    // Stagger-emit unlock events so multiple badges don't stack at once
    newly.forEach((m, i) => {
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent('milestone-unlock', { detail: { milestone: m } }));
      }, i * 900);
    });
  }, [statsWithLevel, unlocked]);

  return { stats: statsWithLevel, xp, level, nextAt, prevAt, unlocked };
}
