import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../store/app-store';

/** All-time accumulated counters across sessions (localStorage-backed). */
interface Stats {
  papersOpened: number;        // distinct paper IDs ever opened
  papersFinished: number;      // read to 98%+
  highlightsCreated: number;   // cumulative, across all papers
  notesCreated: number;        // cumulative
  aiInteractions: number;      // each saved ai_answer/ai_summary note
  streak: number;              // days
}

const LS = {
  papersOpened: 'stats_papers_opened',
  papersFinished: 'stats_papers_finished',
  highlightsCreated: 'stats_highlights_created',
  notesCreated: 'stats_notes_created',
  aiInteractions: 'stats_ai_interactions',
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
   XP formula: 1 paper = 20, highlight = 3, note = 6, finished = 50, AI = 8, streak-day = 10
   Level tier thresholds (chosen so early levels feel rewarding, later ones spacey)
*/
const LEVEL_XP: number[] = [0, 40, 120, 240, 420, 680, 1050, 1500, 2100, 2900, 3900, 5200, 6800, 8800, 11200];

export function computeXp(s: Stats): number {
  return s.papersOpened * 20
    + s.highlightsCreated * 3
    + s.notesCreated * 6
    + s.papersFinished * 50
    + s.aiInteractions * 8
    + s.streak * 10;
}
export function computeLevel(xp: number): { level: number; nextAt: number; prevAt: number } {
  let level = 1;
  for (let i = 0; i < LEVEL_XP.length; i++) {
    if (xp >= LEVEL_XP[i]) level = i + 1;
  }
  const prevAt = LEVEL_XP[level - 1] ?? 0;
  const nextAt = LEVEL_XP[level] ?? LEVEL_XP[LEVEL_XP.length - 1] + 3000;
  return { level, nextAt, prevAt };
}

/* ================== Milestones ================== */
export interface Milestone {
  id: string;
  name: string;
  emoji: string;
  desc: string;
  check: (s: Stats & { level: number }) => boolean;
}

export const MILESTONES: Milestone[] = [
  { id: 'first-paper',   name: '启程',       emoji: '🌱', desc: '打开第一篇论文',            check: s => s.papersOpened >= 1 },
  { id: 'five-papers',   name: '初窥门径',   emoji: '📖', desc: '浏览 5 篇论文',             check: s => s.papersOpened >= 5 },
  { id: 'twenty-papers', name: '博览者',     emoji: '📚', desc: '打开 20 篇论文',            check: s => s.papersOpened >= 20 },
  { id: 'first-hl',      name: '初次标注',   emoji: '🖍️', desc: '留下第一个高亮',            check: s => s.highlightsCreated >= 1 },
  { id: 'fifty-hl',      name: '精读者',     emoji: '🎯', desc: '累计 50 个高亮',            check: s => s.highlightsCreated >= 50 },
  { id: 'two-hundred-hl',name: '标注大师',   emoji: '✨', desc: '累计 200 个高亮',           check: s => s.highlightsCreated >= 200 },
  { id: 'first-note',    name: '笔耕伊始',   emoji: '✏️', desc: '写下第一条笔记',            check: s => s.notesCreated >= 1 },
  { id: 'thirty-notes',  name: '笔耕不辍',   emoji: '📝', desc: '累计 30 条笔记',            check: s => s.notesCreated >= 30 },
  { id: 'first-finish',  name: '一本读完',   emoji: '🏆', desc: '通读完第一篇论文',          check: s => s.papersFinished >= 1 },
  { id: 'ten-finish',    name: '通读达人',   emoji: '📘', desc: '通读完 10 篇论文',          check: s => s.papersFinished >= 10 },
  { id: 'ai-x10',        name: '与 AI 同行', emoji: '🤖', desc: '保存 10 条 AI 解释',        check: s => s.aiInteractions >= 10 },
  { id: 'streak-3',      name: '三日连击',   emoji: '🔥', desc: '连续阅读 3 天',             check: s => s.streak >= 3 },
  { id: 'streak-7',      name: '一周不辍',   emoji: '⚡', desc: '连续阅读 7 天',             check: s => s.streak >= 7 },
  { id: 'streak-30',     name: '月度学霸',   emoji: '🌟', desc: '连续阅读 30 天',            check: s => s.streak >= 30 },
  { id: 'level-5',       name: '苔苔长大了', emoji: '🌿', desc: '陪伴苔苔升到 Lv 5',         check: s => s.level >= 5 },
  { id: 'level-10',      name: '苔苔开花了', emoji: '🌸', desc: '陪伴苔苔升到 Lv 10',        check: s => s.level >= 10 },
];

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

  const stats: Stats = useMemo(() => ({
    papersOpened: papersOpened.size,
    papersFinished: papersFinished.size,
    highlightsCreated,
    notesCreated,
    aiInteractions,
    streak: opts.streak,
  }), [papersOpened, papersFinished, highlightsCreated, notesCreated, aiInteractions, opts.streak]);

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
      if (!unlocked.has(m.id) && m.check(statsWithLevel)) {
        newly.push(m);
      }
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
