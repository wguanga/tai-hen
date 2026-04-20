import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url';

import { api } from '../api';
import { useAppStore } from '../store/app-store';
import { COLOR_HEX, COLOR_LABELS } from '../types';
import type { Highlight, HighlightColor } from '../types';
import { ContextMenu, type MenuItem } from './ContextMenu';
import { useHighlight, type CapturedSelection } from '../hooks/useHighlight';
import { useKeyboard } from '../hooks/useKeyboard';
import { usePageVirtualization } from '../hooks/usePageVirtualization';
import { usePdfCitations } from '../hooks/usePdfCitations';
import { streamSSE } from '../hooks/useStream';
import { useToast } from './Toast';
import { NoteInput } from './NoteInput';
import { TocPanel } from './TocPanel';
import { SearchBar } from './SearchBar';
import { HighlightMinimap } from './HighlightMinimap';
import { SuggestHighlightsModal } from './SuggestHighlightsModal';
import { BilingualPopover } from './BilingualPopover';
import { SelectionToolbar } from './SelectionToolbar';
import { Fireflies } from './Fireflies';
import { CreatureScrollbar } from './CreatureScrollbar';
import { HighlightPreview } from './HighlightPreview';
import { CompletionCelebration } from './CompletionCelebration';
import { useAppPrefs } from '../hooks/useAppPrefs';
import { useBookmarks } from '../hooks/useBookmarks';
import { usePaperAccessory } from '../hooks/usePaperAccessory';
import { useReadingHeatmap } from '../hooks/useReadingHeatmap';
import { useReadingStreak } from '../hooks/useReadingStreak';
import { Constellations } from './Constellations';
import { HoverTranslate } from './HoverTranslate';
import { useAIPrefs } from '../hooks/useAIPrefs';
import { useResumeReminder } from '../hooks/useResumeReminder';
import { useGlossaryHighlight } from '../hooks/useGlossaryHighlight';
import { GlossaryHover } from './GlossaryHover';
import { CitationPopover } from './CitationPopover';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

function friendlyAgo(ts: number): string {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return '刚刚';
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
  const d = Math.floor(s / 86400);
  return d === 1 ? '昨天' : d < 7 ? `${d} 天前` : new Date(ts).toLocaleDateString('zh-CN');
}

// CJK + non-embedded font support. These dirs are copied to public/ by
// frontend/scripts/copy-pdfjs-assets.mjs (postinstall). Without cMapUrl,
// Chinese/Japanese/Korean PDFs render garbled glyphs.
const PDF_OPTIONS = {
  cMapUrl: '/cmaps/',
  cMapPacked: true,
  standardFontDataUrl: '/standard_fonts/',
} as const;

export function PdfReader() {
  const { state, dispatch } = useAppStore();
  const { toast } = useToast();
  const { activeColor, capture, clearSelection } = useHighlight();
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(1.0);
  const [menu, setMenu] = useState<{ x: number; y: number; captured: CapturedSelection } | null>(null);
  const [hlMenu, setHlMenu] = useState<{ x: number; y: number; highlight: Highlight } | null>(null);
  const [noteInput, setNoteInput] = useState<{ captured: CapturedSelection } | null>(null);
  const [hlFilter, setHlFilter] = useState<HighlightColor | null>(null);
  const [showToc, setShowToc] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showSuggest, setShowSuggest] = useState(false);
  const [bilingual, setBilingual] = useState<{ text: string; x: number; y: number } | null>(null);
  const [selMenu, setSelMenu] = useState<{ x: number; y: number; captured: CapturedSelection } | null>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [showPageIndicator, setShowPageIndicator] = useState(false);
  const pageIndicatorTimer = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [outlineTicks, setOutlineTicks] = useState<{ pct: number; title: string; page: number }[]>([]);
  const [hlHover, setHlHover] = useState<{ highlight: Highlight; x: number; y: number } | null>(null);
  const hlHoverTimer = useRef<number | null>(null);
  const [ripples, setRipples] = useState<{ id: number; page: number; x: number; y: number; color: HighlightColor }[]>([]);
  const rippleIdRef = useRef(0);
  const [celebrating, setCelebrating] = useState(false);
  const celebratedRef = useRef<string | null>(null);
  // Creature emotion overlay (priorities are handled in effectiveFor)
  const [creatureMood, setCreatureMood] = useState<import('./Mossling').MosslingEmotion | null>(null);
  const moodTimer = useRef<number | null>(null);
  const flashMood = useCallback((m: import('./Mossling').MosslingEmotion, ms: number) => {
    if (moodTimer.current) window.clearTimeout(moodTimer.current);
    setCreatureMood(m);
    moodTimer.current = window.setTimeout(() => setCreatureMood(null), ms);
  }, []);
  // Note fly overlays: when a note is saved, a small colored orb flies from
  // the highlight's screen position toward the right side (notes panel).
  const [noteFlies, setNoteFlies] = useState<{ id: number; x: number; y: number; color: string }[]>([]);
  const flyIdRef = useRef(0);

  const paper = state.currentPaper;
  const prefs = useAppPrefs();
  const bookmarks = useBookmarks(paper?.id);
  const accessory = usePaperAccessory(paper);
  const aiPrefs = useAIPrefs();
  const resume = useResumeReminder({
    currentPaperId: paper?.id,
    paperTitle: paper?.title,
    currentPage,
    totalPages: pageCount,
    hasPaperOpen: !!paper,
  });
  const glossary = useGlossaryHighlight(scrollRef, !!paper);
  const heatmap = useReadingHeatmap(paper?.id, currentPage);
  const { streak, markReadToday } = useReadingStreak();
  useEffect(() => { if (paper) markReadToday(); }, [paper?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Level is surfaced via window.__mosslingLevel by App so we don't have to
  // drill the app-stats hook through props here
  const mosslingLevel = typeof window !== 'undefined' ? (window as any).__mosslingLevel || 1 : 1;
  const [openingRing, setOpeningRing] = useState(0); // incrementing key triggers animation re-mount
  // In two-page mode shrink individual page width so a pair fits comfortably
  const pageWidth = Math.round((prefs.twoPage ? 560 : 780) * zoom);
  const { renderedPages, getPageRef, getPageElement, setPageHeight, heightFor } = usePageVirtualization(pageCount, scrollRef);

  // PDF [n] citations → build a map and let the hook process text layer
  const refIndex = useMemo(() => {
    const m = new Map<number, string>();
    for (const r of state.references) m.set(r.index, r.text);
    return m;
  }, [state.references]);
  usePdfCitations(scrollRef, refIndex);

  const [citePopover, setCitePopover] = useState<{ nums: number[]; x: number; y: number } | null>(null);

  // 🌱 Curious when a paper opens (first 3 seconds) + opening ring burst
  useEffect(() => {
    if (paper) {
      flashMood('curious', 2800);
      setOpeningRing((n) => n + 1);
    }
  }, [paper?.id, flashMood]);

  // 😴 Sleepy after 25s of no scroll activity on the same page (only if no other mood)
  useEffect(() => {
    if (!paper) return;
    const t = window.setTimeout(() => {
      setCreatureMood((prev) => (prev == null ? 'sleepy' : prev));
    }, 25_000);
    return () => window.clearTimeout(t);
  }, [paper?.id, currentPage]);

  // 💡 Fetch figures + lazily generate AI insights (capped at 10 to avoid cost)
  useEffect(() => {
    if (!paper) { setFigures([]); return; }
    let cancelled = false;
    api.getFigures(paper.id).then((r) => {
      if (cancelled) return;
      setFigures(r.items);
      if (!aiPrefs.isEnabled('figure_insight')) return;
      // Fire off insight requests for the first N figures (sequential, gentle)
      (async () => {
        for (const f of r.items.slice(0, 10)) {
          if (cancelled) return;
          try {
            const ins = await api.figureInsight(paper.id, {
              number: f.number, kind: f.kind, caption: f.caption, page: f.page,
            });
            if (cancelled) return;
            if (ins.insight) {
              setFigures((prev) => prev.map((x) =>
                x.number === f.number && x.page === f.page && x.kind === f.kind
                  ? { ...x, insight: ins.insight } : x,
              ));
            }
          } catch { /* silent, skip */ }
        }
      })();
    }).catch(() => setFigures([]));
    return () => { cancelled = true; };
  }, [paper?.id]);

  // 🧠 Confusion helper: after 90s on the same page, offer a page breakdown
  const [confusionOffer, setConfusionOffer] = useState<{ page: number } | null>(null);
  const confusionShownRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!paper) { setConfusionOffer(null); return; }
    if (!aiPrefs.isEnabled('confusion_help')) { setConfusionOffer(null); return; }
    setConfusionOffer(null);
    const key = `${paper.id}:${currentPage}`;
    if (confusionShownRef.current.has(key)) return;
    const t = window.setTimeout(() => {
      confusionShownRef.current.add(key);
      setConfusionOffer({ page: currentPage });
    }, 90_000);
    return () => window.clearTimeout(t);
  }, [paper?.id, currentPage, aiPrefs]);

  const acceptConfusionHelp = useCallback(async () => {
    if (!paper || !confusionOffer) return;
    const page = confusionOffer.page;
    setConfusionOffer(null);
    // Push into AI panel as a user message → stream an explanation
    dispatch({ type: 'SET_ACTIVE_HIGHLIGHT', highlight: null });
    dispatch({ type: 'CHAT_RESET' });
    dispatch({ type: 'CHAT_START', userMessage: { role: 'user', content: `拆解第 ${page} 页` } });
    try {
      const r = await api.confusionHelp(paper.id, page);
      dispatch({ type: 'CHAT_CHUNK', text: r.explanation });
      dispatch({ type: 'CHAT_DONE', finalText: r.explanation });
    } catch (e) {
      dispatch({ type: 'CHAT_ERROR', text: (e as Error).message });
    }
  }, [paper, confusionOffer, dispatch]);

  // 🎉 Proud for 5s after completion celebration kicks in
  useEffect(() => {
    if (celebrating) flashMood('proud', 5_000);
  }, [celebrating, flashMood]);

  // ✨ Note → highlight bridge: when user hovers a note card, ping the
  // corresponding highlight on the PDF for ~1.2s (gold pulse + auto-scroll).
  const [pingedHlId, setPingedHlId] = useState<string | null>(null);
  const pingTimer = useRef<number | null>(null);
  useEffect(() => {
    const onPing = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | { highlightId: string; noteRect?: { x: number; y: number; width: number; height: number } }
        | undefined;
      const id = detail?.highlightId;
      if (!id) return;
      setPingedHlId(id);
      if (pingTimer.current) window.clearTimeout(pingTimer.current);
      pingTimer.current = window.setTimeout(() => setPingedHlId(null), 1300);
      // Auto-scroll the highlight into view, then draw a path from note → highlight
      const hl = state.highlights.find((h) => h.id === id);
      if (hl) {
        const pageEl = getPageElement(hl.page);
        const container = scrollRef.current;
        if (pageEl && container) {
          const pageTop = pageEl.offsetTop;
          const hlOffsetWithinPage = (hl.position.rects[0]?.y ?? 0) * zoom;
          container.scrollTo({
            top: pageTop + hlOffsetWithinPage - container.clientHeight / 2 + 60,
            behavior: 'smooth',
          });
        }
        // Compute highlight's on-screen center AFTER the smooth-scroll lands
        if (detail?.noteRect && pageEl) {
          window.setTimeout(() => {
            const pageRect = pageEl.getBoundingClientRect();
            const r0 = hl.position.rects[0];
            if (!r0) return;
            const hlCenter = {
              x: pageRect.left + (r0.x + r0.width / 2) * zoom,
              y: pageRect.top + (r0.y + r0.height / 2) * zoom,
            };
            const noteAnchor = {
              x: detail.noteRect!.x,           // left edge of the note card
              y: detail.noteRect!.y,           // middle vertically
            };
            window.dispatchEvent(new CustomEvent('note-path-show', {
              detail: { from: noteAnchor, to: hlCenter },
            }));
          }, 380);
        }
      }
    };
    window.addEventListener('highlight-ping', onPing);
    return () => window.removeEventListener('highlight-ping', onPing);
  }, [state.highlights, getPageElement, zoom]);

  // 📝 Note-fly: anywhere in the app dispatches a 'note-fly' CustomEvent
  // with {x, y, color} → we launch a flying orb toward the right panel.
  useEffect(() => {
    const onFly = (e: Event) => {
      const detail = (e as CustomEvent).detail as { x: number; y: number; color?: string };
      if (!detail) return;
      const id = ++flyIdRef.current;
      setNoteFlies((arr) => [...arr, { id, x: detail.x, y: detail.y, color: detail.color || '#fde68a' }]);
      window.setTimeout(() => setNoteFlies((arr) => arr.filter((f) => f.id !== id)), 1000);
    };
    window.addEventListener('note-fly', onFly);
    return () => window.removeEventListener('note-fly', onFly);
  }, []);

  // Fetch outline (top-level chapters only) for scrollbar tick marks
  useEffect(() => {
    if (!paper || pageCount === 0) { setOutlineTicks([]); return; }
    let cancelled = false;
    api.getOutline(paper.id)
      .then((r) => {
        if (cancelled) return;
        const topLevel = r.items.filter((x) => x.level === 1);
        const ticks = topLevel
          .map((x) => ({
            pct: Math.max(0, Math.min(1, (x.page - 1) / Math.max(1, pageCount - 1))),
            title: x.title,
            page: x.page,
          }))
          .filter((t, i, arr) => arr.findIndex((o) => Math.abs(o.pct - t.pct) < 0.01) === i);
        // Cap to avoid cluttering the rail on huge books
        setOutlineTicks(ticks.slice(0, 24));
      })
      .catch(() => setOutlineTicks([]));
    return () => { cancelled = true; };
  }, [paper?.id, pageCount]);

  // Reading progress: save current page
  useEffect(() => {
    if (!paper || !currentPage) return;
    const key = `reading_progress_${paper.id}`;
    localStorage.setItem(key, String(currentPage));
  }, [paper?.id, currentPage]);

  // Reading progress: restore on paper open
  useEffect(() => {
    if (!paper) return;
    const key = `reading_progress_${paper.id}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      const page = Number(saved);
      if (page > 1) {
        // Delay to wait for pages to render
        setTimeout(() => goToPage(page), 500);
      }
    }
  }, [paper?.id]);

  // Ctrl+F to open search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f' && paper) {
        e.preventDefault();
        setShowSearch(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [paper?.id]);

  // Keyboard shortcuts
  const kbActions = useMemo(() => ({
    setColor: (c: HighlightColor) => {
      dispatch({ type: 'SET_ACTIVE_COLOR', color: c });
      toast(`高亮颜色：${COLOR_LABELS[c]}`, 'info');
    },
    explain: () => {
      const c = capture();
      if (c) setMenu({ x: window.innerWidth / 2, y: 120, captured: c });
    },
    translate: () => {
      const c = capture();
      if (c && paper) {
        dispatch({ type: 'SET_ACTIVE_HIGHLIGHT', highlight: null });
        dispatch({ type: 'CHAT_RESET' });
        dispatch({ type: 'CHAT_START', userMessage: { role: 'user', content: `翻译：${c.text.slice(0, 80)}` } });
        let full = '';
        streamSSE('/ai/translate', { paper_id: paper.id, text: c.text }, {
          onChunk: (t) => { full += t; dispatch({ type: 'CHAT_CHUNK', text: t }); },
          onDone: () => dispatch({ type: 'CHAT_DONE', finalText: full }),
          onError: (_x, m) => dispatch({ type: 'CHAT_ERROR', text: m }),
        });
        clearSelection();
      }
    },
    addNote: () => {
      const c = capture();
      if (c) setNoteInput({ captured: c });
    },
    exportMd: async () => {
      if (!paper) return;
      try {
        const md = await api.exportMarkdown(paper.id);
        const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${paper.title}-notes.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast('导出成功', 'success');
      } catch { toast('导出失败', 'error'); }
    },
    toggleBookmark: () => {
      if (!paper) return;
      bookmarks.toggle(currentPage);
      toast(
        bookmarks.has(currentPage)
          ? `书签已移除 · 第 ${currentPage} 页`
          : `🔖 书签已添加 · 第 ${currentPage} 页`,
        'success',
      );
    },
  }), [paper, capture, clearSelection, dispatch, toast, bookmarks, currentPage]);
  useKeyboard(kbActions, !!paper);

  const fileUrl = useMemo(
    () => (paper ? api.paperFileUrl(paper.id) : null),
    [paper?.id],
  );

  const highlightsByPage = useMemo(() => {
    const map = new Map<number, Highlight[]>();
    const items = hlFilter ? state.highlights.filter((h) => h.color === hlFilter) : state.highlights;
    for (const h of items) {
      const arr = map.get(h.page) ?? [];
      arr.push(h);
      map.set(h.page, arr);
    }
    return map;
  }, [state.highlights, hlFilter]);

  /** Figure list + per-figure AI insights (#26 AR labels) */
  const [figures, setFigures] = useState<Array<{
    number: number; page: number; kind: 'figure' | 'table';
    caption: string; caption_bbox?: number[] | null;
    insight?: string;
  }>>([]);

  /** AI-tagged highlights: highlight_id → {tag, icon}. Filled async after save. */
  const [hlTags, setHlTags] = useState<Map<string, { tag: string; icon: string; fresh: boolean }>>(new Map());

  /** Set of highlight IDs that have at least one AI-sourced note attached. */
  const aiExplainedHighlights = useMemo(() => {
    const s = new Set<string>();
    for (const n of state.notes) {
      if (n.highlight_id && (n.source === 'ai_answer' || n.source === 'ai_summary')) {
        s.add(n.highlight_id);
      }
    }
    return s;
  }, [state.notes]);

  const hlCounts = useMemo(() => {
    const c = { yellow: 0, blue: 0, green: 0, purple: 0, total: 0 };
    for (const h of state.highlights) {
      c[h.color as HighlightColor]++;
      c.total++;
    }
    return c;
  }, [state.highlights]);

  // Track current page + reading progress + back-to-top visibility via scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || pageCount === 0) return;
    const onScroll = () => {
      const scrollMid = el.scrollTop + el.clientHeight / 3;
      let best = 1;
      for (let n = 1; n <= pageCount; n++) {
        const div = getPageElement(n);
        if (div && div.offsetTop <= scrollMid) best = n;
      }
      setCurrentPage(best);
      const maxScroll = el.scrollHeight - el.clientHeight;
      const pct = maxScroll > 0 ? (el.scrollTop / maxScroll) * 100 : 0;
      setScrollProgress(pct);
      setShowBackToTop(el.scrollTop > 600);
      // 🌟 First time reaching 98%+ on this paper → celebrate
      if (
        paper &&
        pct >= 98 &&
        celebratedRef.current !== paper.id &&
        pageCount >= 2
      ) {
        celebratedRef.current = paper.id;
        setCelebrating(true);
        toast('读完啦 🌟 给自己一个掌声！', 'success');
        window.dispatchEvent(new CustomEvent('paper-finished', { detail: { paperId: paper.id } }));
      }
      // Show the floating page indicator while actively scrolling
      setShowPageIndicator(true);
      if (pageIndicatorTimer.current) window.clearTimeout(pageIndicatorTimer.current);
      pageIndicatorTimer.current = window.setTimeout(() => setShowPageIndicator(false), 1200);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener('scroll', onScroll);
  }, [pageCount, getPageElement, paper?.id, toast]);

  // ⌨️ Space / Shift+Space → scroll a viewport; PageDown/PageUp → same.
  //    Don't intercept when typing in inputs.
  useEffect(() => {
    if (!paper) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.matches?.('input, textarea, [contenteditable="true"]')) return;
      const el = scrollRef.current;
      if (!el) return;
      const step = el.clientHeight * 0.85;
      if (e.key === ' ' || e.key === 'PageDown') {
        e.preventDefault();
        const dir = e.shiftKey && e.key === ' ' ? -1 : 1;
        el.scrollBy({ top: dir * step, behavior: 'smooth' });
      } else if (e.key === 'PageUp') {
        e.preventDefault();
        el.scrollBy({ top: -step, behavior: 'smooth' });
      } else if (e.key === 'Home' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        el.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (e.key === 'End' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paper?.id]);

  // 🔍 Ctrl/⌘ + scroll wheel → zoom (Figma / Google Docs convention)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !paper) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.1 : -0.1;
      setZoom((z) => Math.max(0.5, Math.min(3, +(z + delta).toFixed(2))));
    };
    // passive:false so preventDefault works
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [paper?.id]);

  // #7 Drag-to-scroll — grab empty page area (between lines / margins) and drag
  //    vertically. Text selection on spans still works; interactive elements
  //    (highlights, citations, buttons) are exempted.
  useEffect(() => {
    const container = scrollRef.current;
    if (!paper || !container) return;
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (t.closest('button, a, input, textarea, [data-hl], .cite-mark, .creature, .creature-track, .resize-handle, .ctx-menu, .selection-toolbar, .hl-preview')) return;
      // Allow text selection: spans inside text layer are kept interactive
      if (t.tagName === 'SPAN') return;
      if (!t.closest('.pdf-page')) return;
      const startY = e.clientY;
      const startScroll = container.scrollTop;
      let moved = false;
      const onMove = (ev: MouseEvent) => {
        const dy = ev.clientY - startY;
        if (Math.abs(dy) > 3) moved = true;
        container.scrollTop = startScroll - dy;
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
        if (moved) document.body.style.userSelect = '';
      };
      // Only change cursor / block selection once user actually starts moving
      document.body.style.cursor = 'grabbing';
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    };
    container.addEventListener('mousedown', onMouseDown);
    return () => container.removeEventListener('mousedown', onMouseDown);
  }, [paper?.id]);

  // Right-click on PDF text → full context menu
  useEffect(() => {
    if (!paper) return;
    const onContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest('.pdf-page')) return;
      const captured = capture();
      if (!captured) return;
      e.preventDefault();
      setHlMenu(null);
      setSelMenu(null);
      setMenu({ x: e.clientX, y: e.clientY, captured });
    };
    window.addEventListener('contextmenu', onContextMenu);
    return () => window.removeEventListener('contextmenu', onContextMenu);
  }, [paper?.id, capture]);

  // Mouseup after selection → show mini floating toolbar near selection
  useEffect(() => {
    if (!paper) return;
    const onMouseUp = (e: MouseEvent) => {
      // Only left-button; right-click should go exclusively to the context menu
      if (e.button !== 0) return;
      // Ignore mouseups inside existing menus/toolbars
      const t = e.target as HTMLElement | null;
      if (t?.closest('.selection-toolbar, .ctx-menu')) return;
      if (!t?.closest('.pdf-page')) { setSelMenu(null); return; }
      // Slight delay so the browser finalizes the selection range first
      setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.toString().trim().length < 2) {
          setSelMenu(null);
          return;
        }
        const captured = capture();
        if (!captured) { setSelMenu(null); return; }
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return;
        setMenu(null);
        setHlMenu(null);
        setSelMenu({
          x: rect.left + rect.width / 2,
          y: rect.top - 10,
          captured,
        });
      }, 10);
    };
    const onScroll = () => setSelMenu(null);
    window.addEventListener('mouseup', onMouseUp);
    scrollRef.current?.addEventListener('scroll', onScroll, { passive: true });
    const scrollEl = scrollRef.current;
    return () => {
      window.removeEventListener('mouseup', onMouseUp);
      scrollEl?.removeEventListener('scroll', onScroll);
    };
  }, [paper?.id, capture]);

  // Dismiss citation popover on outside click / Esc
  useEffect(() => {
    if (!citePopover) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setCitePopover(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [citePopover]);

  // Click on existing highlight OR citation [n]
  useEffect(() => {
    if (!paper) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Citation click inside PDF text layer
      if (target?.classList?.contains('cite-mark')) {
        const raw = target.dataset.citeNums || '';
        const nums = raw.split(/\s*,\s*/).map((n) => parseInt(n, 10)).filter((n) => !isNaN(n));
        if (nums.length > 0) {
          e.stopPropagation();
          setMenu(null);
          setHlMenu(null);
          setCitePopover({ nums, x: e.clientX, y: e.clientY });
          window.dispatchEvent(new CustomEvent('app-event', { detail: { type: 'citation-click' } }));
          return;
        }
      }
      // Any non-citation click closes the cite popover
      if (citePopover) setCitePopover(null);
      const hlId = target.dataset?.hl;
      if (!hlId) return;
      const hl = state.highlights.find((h) => h.id === hlId);
      if (!hl) return;
      e.stopPropagation();
      setMenu(null);
      setHlMenu({ x: e.clientX, y: e.clientY, highlight: hl });
    };
    window.addEventListener('click', onClick);
    return () => window.removeEventListener('click', onClick);
  }, [paper?.id, state.highlights, citePopover]);

  const goToPage = useCallback((page: number) => {
    const el = getPageElement(page);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [getPageElement]);

  // Expose goToPage globally so other panels (figures, etc.) can use it
  useEffect(() => {
    (window as any).__goToPage = goToPage;
    return () => { delete (window as any).__goToPage; };
  }, [goToPage]);

  if (!paper) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="text-center max-w-md w-full">
          <div className="text-6xl mb-4 select-none" style={{ animation: 'unicornRun 1.4s ease-in-out infinite alternate' }}>
            🦄
          </div>
          <div className="text-base font-medium bg-gradient-to-r from-indigo-600 via-fuchsia-600 to-rose-500 bg-clip-text text-transparent">
            欢迎来到你的阅读小屋
          </div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-2 leading-relaxed">
            从左侧论文库挑一篇翻阅，或把 PDF 拖进这个窗口<br />
            ✨ 划线 · 💬 AI 解释 · 📜 自动摘要
          </div>
          {resume.banner && (
            <div className="mt-8 p-4 rounded-2xl border border-fuchsia-200 dark:border-fuchsia-800/60 bg-gradient-to-br from-indigo-50 via-fuchsia-50 to-rose-50 dark:from-indigo-900/30 dark:via-fuchsia-900/30 dark:to-rose-900/20 shadow-[0_8px_24px_rgba(168,85,247,.15)] text-left">
              <div className="text-[10px] uppercase tracking-wider text-fuchsia-500 mb-1">↩ 上次读到这里</div>
              <div className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate" title={resume.banner.title}>
                《{resume.banner.title}》
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 font-mono tabular-nums">
                p.{resume.banner.page} / {resume.banner.totalPages} · {friendlyAgo(resume.banner.ts)}
              </div>
              <div className="flex items-center justify-end gap-2 mt-3">
                <button
                  onClick={resume.dismiss}
                  className="text-xs px-3 py-1 rounded-full border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  稍后
                </button>
                <button
                  onClick={async () => {
                    try {
                      const p = await api.getPaper(resume.banner!.id);
                      const [hl, notes] = await Promise.all([
                        api.listHighlights(p.id),
                        api.listNotes(p.id),
                      ]);
                      dispatch({ type: 'OPEN_PAPER', paper: p, highlights: hl.items, notes: notes.items });
                      api.getReferences(p.id).then((r) => dispatch({ type: 'SET_REFERENCES', references: r.items })).catch(() => {});
                    } catch {
                      resume.clearPersisted();
                      resume.dismiss();
                    }
                  }}
                  className="magic-btn text-xs px-3 py-1 rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white shadow-[0_2px_10px_rgba(168,85,247,.35)] hover:shadow-[0_2px_14px_rgba(168,85,247,.5)]"
                >
                  继续阅读 →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!fileUrl) return null;

  async function saveHighlight(captured: CapturedSelection, color = activeColor) {
    if (!paper) return null;
    try {
      const hl = await api.createHighlight(paper.id, {
        text: captured.text,
        color,
        page: captured.page,
        position: captured.position,
      });
      dispatch({ type: 'ADD_HIGHLIGHT', highlight: hl });
      clearSelection();
      // 👏 Mossling claps briefly for the user
      flashMood('clapping', 1400);
      // ✨ Fire-and-forget AI tagging for this new highlight (gated by prefs)
      if (aiPrefs.isEnabled('tag_highlight')) (async () => {
        try {
          const t = await api.tagHighlight(paper.id, captured.text, captured.page);
          if (t.tag) {
            setHlTags((prev) => {
              const next = new Map(prev);
              next.set(hl.id, { tag: t.tag, icon: t.icon || '✨', fresh: true });
              return next;
            });
            // Let the "fresh" animation play briefly
            window.setTimeout(() => {
              setHlTags((prev) => {
                const next = new Map(prev);
                const v = next.get(hl.id);
                if (v) next.set(hl.id, { ...v, fresh: false });
                return next;
              });
            }, 4500);
          }
        } catch { /* silent */ }
      })();
      // ✨ Trigger a ripple at the center of the first rect
      const first = captured.position.rects[0];
      if (first) {
        const id = ++rippleIdRef.current;
        setRipples((r) => [
          ...r,
          {
            id,
            page: captured.page,
            x: (first.x + first.width / 2) * zoom,
            y: (first.y + first.height / 2) * zoom,
            color,
          },
        ]);
        window.setTimeout(
          () => setRipples((r) => r.filter((x) => x.id !== id)),
          1500,
        );
      }
      return hl;
    } catch (e) {
      console.error('createHighlight failed', e);
      return null;
    }
  }

  async function aiStream(
    path: string,
    body: object,
    userLabel: string,
    highlight?: Highlight | null,
  ) {
    if (!paper) return;
    dispatch({ type: 'SET_ACTIVE_HIGHLIGHT', highlight: highlight ?? null });
    dispatch({ type: 'CHAT_RESET' });
    dispatch({ type: 'CHAT_START', userMessage: { role: 'user', content: userLabel } });
    const controller = new AbortController();
    let full = '';
    await streamSSE(path, body, {
      signal: controller.signal,
      onChunk: (text) => { full += text; dispatch({ type: 'CHAT_CHUNK', text }); },
      onDone: () => dispatch({ type: 'CHAT_DONE', finalText: full }),
      onError: (_c, msg) => dispatch({ type: 'CHAT_ERROR', text: msg }),
    });
  }

  async function handleDeleteHighlight(hl: Highlight) {
    if (!paper) return;
    try {
      await api.deleteHighlight(paper.id, hl.id);
      dispatch({ type: 'REMOVE_HIGHLIGHT', id: hl.id });
    } catch (e) {
      console.error(e);
    }
  }

  async function handleChangeColor(hl: Highlight, color: HighlightColor) {
    if (!paper) return;
    try {
      const updated = await api.updateHighlight(paper.id, hl.id, { color });
      dispatch({ type: 'UPDATE_HIGHLIGHT', id: hl.id, patch: updated });
    } catch (e) {
      console.error(e);
    }
  }

  async function handleManualNote(captured: CapturedSelection, noteText: string) {
    if (!paper) return;
    const hl = await saveHighlight(captured);
    if (!hl) return;
    try {
      const note = await api.createNote(paper.id, {
        highlight_id: hl.id,
        title: captured.text.slice(0, 40),
        content: noteText,
        source: 'manual',
      });
      dispatch({ type: 'ADD_NOTE', note });
      // Fire a note-fly orb from the highlight center toward notes panel
      const firstRect = captured.position.rects[0];
      const pageEl = getPageElement(captured.page);
      if (firstRect && pageEl) {
        const pageRect = pageEl.getBoundingClientRect();
        window.dispatchEvent(new CustomEvent('note-fly', {
          detail: {
            x: pageRect.left + (firstRect.x + firstRect.width / 2) * zoom,
            y: pageRect.top + (firstRect.y + firstRect.height / 2) * zoom,
            color: COLOR_HEX[hl.color],
          },
        }));
      }
    } catch (e) {
      console.error(e);
    }
  }

  const buildMenuItems = (captured: CapturedSelection): MenuItem[] => [
    {
      label: '🤖 AI 解释',
      onClick: async () => {
        const hl = await saveHighlight(captured);
        if (hl) await aiStream('/ai/explain', {
          paper_id: paper!.id, highlight_id: hl.id, text: captured.text, page: captured.page, level: 'simple',
        }, `请解释：${captured.text.slice(0, 80)}`, hl);
      },
    },
    {
      label: '🌐 双语对照（悬浮）',
      onClick: () => {
        // Anchor popover near the selection's last rect
        const lastRect = captured.position.rects[captured.position.rects.length - 1];
        const pageEl = getPageElement(captured.page);
        const pageRect = pageEl?.getBoundingClientRect();
        const anchor = pageRect
          ? { x: pageRect.left + lastRect.x * zoom, y: pageRect.top + (lastRect.y + lastRect.height) * zoom }
          : { x: window.innerWidth / 2 - 200, y: 120 };
        setBilingual({ text: captured.text, x: anchor.x, y: anchor.y });
      },
    },
    {
      label: '🌐 翻译（在 AI 面板）',
      onClick: async () => {
        await aiStream('/ai/translate', {
          paper_id: paper!.id, text: captured.text,
        }, `翻译：${captured.text.slice(0, 80)}`);
      },
    },
    { label: '', onClick: () => {}, divider: true },
    ...(['yellow', 'blue', 'green', 'purple'] as HighlightColor[]).map((c) => ({
      label: `高亮：${COLOR_LABELS[c]}` + (c === 'purple' ? ' (+ AI)' : ''),
      dot: COLOR_HEX[c],
      onClick: async () => {
        const hl = await saveHighlight(captured, c);
        if (c === 'purple' && hl) {
          await aiStream('/ai/explain', {
            paper_id: paper!.id, highlight_id: hl.id, text: captured.text, page: captured.page, level: 'simple',
          }, `请解释：${captured.text.slice(0, 80)}`, hl);
        }
      },
    })),
    { label: '', onClick: () => {}, divider: true },
    {
      label: '📝 添加手动笔记',
      onClick: () => setNoteInput({ captured }),
    },
  ];

  const buildHlMenuItems = (hl: Highlight): MenuItem[] => {
    const hasNotes = state.notes.some((n) => n.highlight_id === hl.id);
    return [
      ...(['yellow', 'blue', 'green', 'purple'] as HighlightColor[])
        .filter((c) => c !== hl.color)
        .map((c) => ({
          label: `改色：${COLOR_LABELS[c]}`,
          dot: COLOR_HEX[c],
          onClick: () => handleChangeColor(hl, c),
        })),
      { label: '', onClick: () => {}, divider: true },
      {
        label: '🤖 AI 解释此高亮',
        onClick: () => aiStream('/ai/explain', {
          paper_id: paper!.id, highlight_id: hl.id, text: hl.text, page: hl.page, level: 'simple',
        }, `请解释：${hl.text.slice(0, 80)}`, hl),
      },
      ...(hasNotes ? [{
        label: '📝 查看关联笔记',
        onClick: () => (window as any).__scrollToNote?.(hl.id),
      }] : []),
      {
        label: '📖 加入术语库',
        onClick: async () => {
          const term = hl.text.trim().slice(0, 120);
          const definition = prompt(`定义 "${term.slice(0, 40)}"：`) || '';
          if (!definition.trim()) return;
          try {
            await api.createGlossary({
              term,
              definition: definition.trim(),
              paper_id: paper!.id,
              source: 'manual',
            });
            toast('已加入术语库', 'success');
          } catch (e) {
            toast('添加失败：' + (e as Error).message, 'error');
          }
        },
      },
      {
        label: '📋 复制原文',
        onClick: async () => {
          try {
            await navigator.clipboard.writeText(hl.text);
            toast('已复制到剪贴板', 'success');
          } catch {
            toast('复制失败', 'error');
          }
        },
      },
      {
        label: '🗑️ 删除高亮',
        onClick: () => handleDeleteHighlight(hl),
      },
    ];
  };

  return (
    <div className="flex flex-col h-full">
      {/* Page nav bar */}
      <div className="glass-panel flex items-center gap-2 px-3 py-1 border-b border-indigo-100/60 dark:border-indigo-900/40 text-sm flex-shrink-0">
        <button onClick={() => setShowToc((v) => !v)} title="目录"
          className={'px-1 rounded text-xs ' + (showToc ? 'bg-indigo-100 text-indigo-700' : 'hover:bg-gray-100 text-gray-500')}>☰</button>
        <button onClick={() => setShowSearch((v) => !v)} title="搜索 (Ctrl+F)"
          className={'px-1 rounded text-xs ' + (showSearch ? 'bg-indigo-100 text-indigo-700' : 'hover:bg-gray-100 text-gray-500')}>🔍</button>
        <button onClick={() => setShowSuggest(true)} title="AI 建议重点"
          className="px-1 rounded text-xs hover:bg-gray-100 text-gray-500">✨</button>
        <div className="h-4 w-px bg-gray-200" />
        <button onClick={() => goToPage(Math.max(1, currentPage - 1))} disabled={currentPage <= 1}
          className="px-1 hover:bg-gray-100 rounded disabled:opacity-30">◀</button>
        <span className="text-gray-600">
          <input
            type="number"
            min={1}
            max={pageCount}
            value={currentPage}
            onChange={(e) => {
              const p = Math.max(1, Math.min(pageCount, Number(e.target.value) || 1));
              setCurrentPage(p);
              goToPage(p);
            }}
            className="w-12 text-center border border-gray-300 rounded px-1"
          />
          <span className="mx-1">/ {pageCount}</span>
        </span>
        <button onClick={() => goToPage(Math.min(pageCount, currentPage + 1))} disabled={currentPage >= pageCount}
          className="px-1 hover:bg-gray-100 rounded disabled:opacity-30">▶</button>

        <div className="h-4 w-px bg-gray-200 mx-1" />

        <button onClick={() => setZoom((z) => Math.max(0.5, z - 0.15))}
          className="px-1 hover:bg-gray-100 rounded">−</button>
        <span className="text-gray-500 w-12 text-center">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom((z) => Math.min(3, z + 0.15))}
          className="px-1 hover:bg-gray-100 rounded">+</button>
        <button onClick={() => setZoom(1)} className="text-xs text-gray-500 hover:text-gray-700 ml-1">重置</button>

        <div className="h-4 w-px bg-gray-200 mx-1" />
        <button
          onClick={() => paper && kbActions.toggleBookmark?.()}
          disabled={!paper}
          title={bookmarks.has(currentPage) ? '取消书签 (B)' : '添加书签 (B)'}
          className={
            'text-xs px-1.5 py-0.5 rounded transition-colors ' +
            (bookmarks.has(currentPage)
              ? 'text-fuchsia-500'
              : 'text-gray-400 hover:text-fuchsia-500')
          }
        >
          {bookmarks.has(currentPage) ? '🔖' : '🏷️'}
        </button>

        {hlCounts.total > 0 && (<>
          <div className="h-4 w-px bg-gray-200 mx-1" />
          <span className="text-xs text-gray-400">高亮：</span>
          <button onClick={() => setHlFilter(null)}
            className={'text-xs px-1 rounded ' + (!hlFilter ? 'bg-gray-200 font-medium' : 'hover:bg-gray-100 text-gray-500')}>
            全部 {hlCounts.total}
          </button>
          {(['yellow', 'blue', 'green', 'purple'] as HighlightColor[]).map((c) => hlCounts[c] > 0 && (
            <button key={c} onClick={() => setHlFilter(hlFilter === c ? null : c)}
              className={'text-xs px-1 rounded flex items-center gap-0.5 ' + (hlFilter === c ? 'ring-1 ring-gray-400' : 'hover:bg-gray-100')}>
              <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: COLOR_HEX[c] }} />
              <span className="text-gray-500">{hlCounts[c]}</span>
            </button>
          ))}
        </>)}
      </div>

      {/* Search bar */}
      {showSearch && paper && (
        <SearchBar
          paperId={paper.id}
          onGoToPage={goToPage}
          onClose={() => setShowSearch(false)}
        />
      )}

      {/* Main area: optional TOC sidebar + PDF */}
      <div className="flex flex-1 min-h-0">
        {showToc && paper && (
          <div className="w-52 border-r bg-white dark:bg-gray-800 overflow-y-auto flex-shrink-0">
            <TocPanel paperId={paper.id} currentPage={currentPage} onGoToPage={goToPage} />
          </div>
        )}

      {/* PDF area (relative wrapper so the creature scrollbar stays pinned to the viewport) */}
      <div className="relative flex-1 min-w-0">
      <div ref={scrollRef} className="pdf-scroll absolute inset-0 overflow-y-auto py-6">
        {/* Ambient firefly particles behind the pages */}
        <Fireflies />
        {/* Subtle star constellations drifting in and out */}
        <Constellations />
        {/* Reading progress bar (top of PDF area) */}
        {pageCount > 0 && (
          <div
            className="reading-progress"
            style={{ width: `${scrollProgress}%` }}
            aria-hidden
          />
        )}
        <Document
          file={fileUrl}
          options={PDF_OPTIONS}
          onLoadSuccess={(pdf) => setPageCount(pdf.numPages)}
          loading={<div className="text-center text-gray-500 pt-10">加载 PDF…</div>}
          error={<div className="text-center text-red-500 pt-10">PDF 加载失败</div>}
        >
          <div className={prefs.twoPage ? 'pdf-stack-two' : undefined}>
          {Array.from({ length: pageCount }, (_, i) => i + 1).map((pageNum) => {
            const shouldRender = renderedPages.has(pageNum);
            const isActive = pageNum === currentPage;
            const isBookmarked = bookmarks.has(pageNum);
            return (
              <div
                key={pageNum}
                className={'pdf-page' + (isActive ? ' pdf-page--active' : '')}
                data-page-number={pageNum}
                style={{ width: pageWidth, minHeight: heightFor(pageNum) }}
                ref={getPageRef(pageNum)}
              >
                {isBookmarked && (
                  <div
                    className="pdf-page-dogear"
                    title={`取消书签 · 第 ${pageNum} 页`}
                    onClick={(e) => { e.stopPropagation(); bookmarks.toggle(pageNum); }}
                  />
                )}
                {shouldRender ? (
                  <Page
                    pageNumber={pageNum}
                    width={pageWidth}
                    onRenderSuccess={(p: any) => {
                      const h = (p as any)?.height ?? 0;
                      if (h > 0) setPageHeight(pageNum, h);
                    }}
                  />
                ) : (
                  <div
                    className="pdf-page-skeleton"
                    style={{ height: heightFor(pageNum) }}
                  >
                    · {pageNum} ·
                  </div>
                )}
                {shouldRender && (highlightsByPage.get(pageNum) ?? []).map((h) =>
                  h.position.rects.map((r, idx) => (
                    <div
                      key={`${h.id}-${idx}`}
                      className={
                        'highlight-rect'
                        + (aiExplainedHighlights.has(h.id) ? ' highlight-rect--ai' : '')
                        + (pingedHlId === h.id ? ' highlight-rect--ping' : '')
                      }
                      data-hl={h.id}
                      style={{
                        left: r.x * zoom,
                        top: r.y * zoom,
                        width: r.width * zoom,
                        height: r.height * zoom,
                        background: COLOR_HEX[h.color],
                        opacity: 0.4,
                        cursor: 'pointer',
                        pointerEvents: 'auto',
                      }}
                      onMouseEnter={(ev) => {
                        if (hlHoverTimer.current) window.clearTimeout(hlHoverTimer.current);
                        const target = ev.currentTarget;
                        const rect = target.getBoundingClientRect();
                        hlHoverTimer.current = window.setTimeout(() => {
                          setHlHover({
                            highlight: h,
                            x: rect.left + rect.width / 2,
                            y: rect.top,
                          });
                        }, 300);
                      }}
                      onMouseLeave={() => {
                        if (hlHoverTimer.current) window.clearTimeout(hlHoverTimer.current);
                        setHlHover(null);
                      }}
                    />
                  )),
                )}
                {/* #26 AR figure labels — floats next to the figure caption */}
                {shouldRender && figures.filter((f) => f.page === pageNum && f.insight && f.caption_bbox && f.caption_bbox.length >= 4).map((f, idx) => {
                  const [cx0, cy0] = f.caption_bbox as number[];
                  // PDF coords → CSS px (same scale as pageWidth / native)
                  // Heuristic: pageWidth represents the native page width in CSS px at zoom=1,
                  // multiply by zoom for current display. PDF points map: 1pt ≈ 1.33px @ 72dpi but
                  // we normalize to pageWidth / PDF page width ratio. Page native width in PDF points
                  // is stored via `setPageHeight` only (no width). Fallback estimate: assume A4 612pt.
                  const pdfPageWidthPts = 612; // fallback; if known we'd read from <Page>
                  const scale = (pageWidth / pdfPageWidthPts) * 1;
                  return (
                    <div
                      key={`ins-${pageNum}-${f.number}-${idx}`}
                      className={'figure-ar-label figure-ar-label--' + f.kind}
                      style={{
                        left: Math.max(4, cx0 * scale - 10),
                        top: Math.max(4, cy0 * scale - 26),
                      }}
                      title={f.caption}
                    >
                      <span className="figure-ar-icon">{f.kind === 'figure' ? '💡' : '📊'}</span>
                      <span className="figure-ar-insight">{f.insight}</span>
                    </div>
                  );
                })}
                {/* ✨ AI tag badges on first rect of each tagged highlight */}
                {shouldRender && (highlightsByPage.get(pageNum) ?? []).map((h) => {
                  const t = hlTags.get(h.id);
                  if (!t) return null;
                  const r0 = h.position.rects[0];
                  if (!r0) return null;
                  return (
                    <div
                      key={`tag-${h.id}`}
                      className={'hl-ai-tag' + (t.fresh ? ' hl-ai-tag--fresh' : '')}
                      style={{
                        left: (r0.x + r0.width) * zoom + 6,
                        top: r0.y * zoom - 4,
                      }}
                      title={`AI 标签：${t.tag}`}
                    >
                      <span>{t.icon}</span>
                      <span className="hl-ai-tag-label">{t.tag}</span>
                    </div>
                  );
                })}
                {/* Ripples for newly-created highlights (this page only) */}
                {ripples.filter((rp) => rp.page === pageNum).map((rp) => (
                  <div
                    key={rp.id}
                    className="hl-ripple"
                    style={{
                      left: rp.x,
                      top: rp.y,
                      background: `radial-gradient(circle, ${COLOR_HEX[rp.color]} 0%, transparent 70%)`,
                    }}
                  />
                ))}
              </div>
            );
          })}
          </div>
        </Document>
      </div>
      {/* Draggable creature scrollbar — pinned to the viewport */}
      {/* #5 Edge fades so pages blend into the atmospheric backdrop */}
      <div className="pdf-edge-fade pdf-edge-fade-top" aria-hidden />
      <div className="pdf-edge-fade pdf-edge-fade-bottom" aria-hidden />
      <CreatureScrollbar
        scrollRef={scrollRef}
        ticks={outlineTicks}
        overrideEmotion={creatureMood}
        accessory={accessory}
        streak={streak}
        level={mosslingLevel}
        heatmap={heatmap}
        totalPages={pageCount}
      />
      {/* #13 Hover-to-translate words in the PDF text layer */}
      <HoverTranslate scrollRef={scrollRef} enabled={!!paper && aiPrefs.isEnabled('hover_translate')} />

      {/* Cross-paper glossary — hover any known term to see your saved definition */}
      <GlossaryHover scrollRef={scrollRef} lookup={glossary.lookup} />

      {/* #10 Opening ring burst — fires on every paper open */}
      {openingRing > 0 && (
        <div key={openingRing} className="pointer-events-none absolute inset-0 z-20">
          <div className="paper-open-ring ring-1" />
          <div className="paper-open-ring ring-2" />
          <div className="paper-open-ring ring-3" />
        </div>
      )}
      {/* Note-fly orbs: animate from saved highlight position toward the notes panel */}
      {noteFlies.map((f) => (
        <div
          key={f.id}
          className="note-fly-orb"
          style={{
            left: f.x,
            top: f.y,
            background: `radial-gradient(circle, ${f.color}, transparent 70%)`,
          }}
        />
      ))}
      </div>
      {/* Highlight minimap */}
      {pageCount > 1 && state.highlights.length > 0 && (
        <HighlightMinimap
          highlights={state.highlights}
          pageCount={pageCount}
          currentPage={currentPage}
          onGoToPage={goToPage}
        />
      )}
      </div>{/* close main area flex */}

      {/* Context menus */}
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={buildMenuItems(menu.captured)} onClose={() => setMenu(null)} />
      )}
      {hlMenu && (
        <ContextMenu x={hlMenu.x} y={hlMenu.y} items={buildHlMenuItems(hlMenu.highlight)} onClose={() => setHlMenu(null)} />
      )}

      {/* Floating selection mini-toolbar */}
      {selMenu && (
        <SelectionToolbar
          x={selMenu.x}
          y={selMenu.y}
          onPickColor={async (c) => {
            const hl = await saveHighlight(selMenu.captured, c);
            if (c === 'purple' && hl) {
              await aiStream('/ai/explain', {
                paper_id: paper!.id, highlight_id: hl.id,
                text: selMenu.captured.text, page: selMenu.captured.page, level: 'simple',
              }, `请解释：${selMenu.captured.text.slice(0, 80)}`, hl);
            }
            setSelMenu(null);
          }}
          onExplain={async () => {
            const hl = await saveHighlight(selMenu.captured);
            if (hl) {
              await aiStream('/ai/explain', {
                paper_id: paper!.id, highlight_id: hl.id,
                text: selMenu.captured.text, page: selMenu.captured.page, level: 'simple',
              }, `请解释：${selMenu.captured.text.slice(0, 80)}`, hl);
            }
            setSelMenu(null);
          }}
          onTranslate={async () => {
            await aiStream('/ai/translate', {
              paper_id: paper!.id, text: selMenu.captured.text,
            }, `翻译：${selMenu.captured.text.slice(0, 80)}`);
            setSelMenu(null);
          }}
          onAddNote={() => {
            setNoteInput({ captured: selMenu.captured });
            setSelMenu(null);
          }}
          onClose={() => setSelMenu(null)}
        />
      )}

      {/* Floating page indicator (fades in during scroll, fades out when idle) */}
      <div
        className={
          'fixed bottom-6 left-1/2 -translate-x-1/2 z-40 px-4 py-1.5 rounded-full text-sm font-medium pointer-events-none select-none ' +
          'bg-gradient-to-r from-indigo-600/90 via-fuchsia-600/90 to-rose-500/90 text-white ' +
          'backdrop-blur shadow-[0_8px_28px_rgba(168,85,247,0.35)] ' +
          'transition-all duration-300 ease-out ' +
          (showPageIndicator && pageCount > 0
            ? 'opacity-100 translate-y-0'
            : 'opacity-0 translate-y-2')
        }
      >
        <span className="tabular-nums">{currentPage}</span>
        <span className="mx-1 opacity-60">/</span>
        <span className="tabular-nums opacity-80">{pageCount}</span>
      </div>

      {/* #16 Highlight hover preview */}
      {hlHover && (
        <HighlightPreview
          highlight={hlHover.highlight}
          notes={state.notes}
          x={hlHover.x}
          y={hlHover.y}
        />
      )}

      {/* #15 Completion celebration */}
      {celebrating && <CompletionCelebration onDone={() => setCelebrating(false)} />}

      {/* 🧠 Mossling-side gentle offer after 90s on the same page */}
      {confusionOffer && (
        <div className="confusion-offer" role="alert">
          <div className="confusion-offer-content">
            <span className="text-base">🌿</span>
            <div className="flex-1">
              <div className="font-medium text-sm">这页有点复杂？</div>
              <div className="text-xs opacity-80">让苔苔把它拆成 3 点讲给你</div>
            </div>
            <button onClick={acceptConfusionHelp} className="confusion-btn confusion-btn-accept">好的</button>
            <button onClick={() => setConfusionOffer(null)} className="confusion-btn confusion-btn-dismiss">稍后</button>
          </div>
        </div>
      )}

      {/* Floating "back to top" */}
      {showBackToTop && (
        <button
          onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
          className="float-btn fixed bottom-6 right-24 z-40 w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white shadow-[0_6px_20px_rgba(168,85,247,0.45)] hover:shadow-[0_8px_26px_rgba(168,85,247,0.6)] hover:scale-110 active:scale-95 transition-transform flex items-center justify-center"
          title="回到顶部"
        >
          ↑
        </button>
      )}

      {/* Citation popover (from clicking [n] inside PDF) */}
      {citePopover && (
        <CitationPopover
          nums={citePopover.nums}
          x={citePopover.x}
          y={citePopover.y}
          refIndex={refIndex}
          onClose={() => setCitePopover(null)}
        />
      )}

      {/* Bilingual popover */}
      {bilingual && paper && (
        <BilingualPopover
          paperId={paper.id}
          sourceText={bilingual.text}
          anchor={{ x: bilingual.x, y: bilingual.y }}
          onClose={() => setBilingual(null)}
        />
      )}

      {/* AI suggest highlights modal */}
      {showSuggest && paper && (
        <SuggestHighlightsModal
          paperId={paper.id}
          onClose={() => setShowSuggest(false)}
          onGoToPage={(p) => { goToPage(p); }}
        />
      )}

      {/* Manual note modal */}
      {noteInput && (
        <NoteInput
          onSubmit={(text) => { handleManualNote(noteInput.captured, text); setNoteInput(null); }}
          onCancel={() => setNoteInput(null)}
          selectedText={noteInput.captured.text}
        />
      )}
    </div>
  );
}
