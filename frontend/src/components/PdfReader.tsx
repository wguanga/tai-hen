import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';

import { api } from '../api';
import { useAppStore } from '../store/app-store';
import { COLOR_HEX, COLOR_LABELS } from '../types';
import type { Highlight, HighlightColor } from '../types';
import { ContextMenu, type MenuItem } from './ContextMenu';
import { useHighlight, type CapturedSelection } from '../hooks/useHighlight';
import { useKeyboard } from '../hooks/useKeyboard';
import { usePageVirtualization } from '../hooks/usePageVirtualization';
import { streamSSE } from '../hooks/useStream';
import { useToast } from './Toast';
import { NoteInput } from './NoteInput';
import { TocPanel } from './TocPanel';
import { SearchBar } from './SearchBar';
import { HighlightMinimap } from './HighlightMinimap';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.js',
  import.meta.url,
).toString();

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
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLElement>>(new Map());

  const paper = state.currentPaper;
  const pageWidth = Math.round(780 * zoom);
  const { renderedPages, registerPage, setPageHeight, heightFor } = usePageVirtualization(pageCount, scrollRef);

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
  }), [paper, capture, clearSelection, dispatch, toast]);
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

  const hlCounts = useMemo(() => {
    const c = { yellow: 0, blue: 0, green: 0, purple: 0, total: 0 };
    for (const h of state.highlights) {
      c[h.color as HighlightColor]++;
      c.total++;
    }
    return c;
  }, [state.highlights]);

  // Track current page via scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || pageCount === 0) return;
    const onScroll = () => {
      const scrollMid = el.scrollTop + el.clientHeight / 3;
      let best = 1;
      pageRefs.current.forEach((div, num) => {
        if (div.offsetTop <= scrollMid) best = num;
      });
      setCurrentPage(best);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [pageCount]);

  // Right-click on PDF text
  useEffect(() => {
    if (!paper) return;
    const onContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest('.pdf-page')) return;
      const captured = capture();
      if (!captured) return;
      e.preventDefault();
      setHlMenu(null);
      setMenu({ x: e.clientX, y: e.clientY, captured });
    };
    window.addEventListener('contextmenu', onContextMenu);
    return () => window.removeEventListener('contextmenu', onContextMenu);
  }, [paper?.id, capture]);

  // Click on existing highlight
  useEffect(() => {
    if (!paper) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
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
  }, [paper?.id, state.highlights]);

  const goToPage = useCallback((page: number) => {
    const el = pageRefs.current.get(page);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  if (!paper) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        <div className="text-center">
          <div className="text-5xl mb-2">📄</div>
          <div>左侧选择论文，或上传新 PDF</div>
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
      label: '🌐 翻译选中内容',
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
      <div className="flex items-center gap-2 px-3 py-1 border-b bg-white dark:bg-gray-800 text-sm flex-shrink-0">
        <button onClick={() => setShowToc((v) => !v)} title="目录"
          className={'px-1 rounded text-xs ' + (showToc ? 'bg-indigo-100 text-indigo-700' : 'hover:bg-gray-100 text-gray-500')}>☰</button>
        <button onClick={() => setShowSearch((v) => !v)} title="搜索 (Ctrl+F)"
          className={'px-1 rounded text-xs ' + (showSearch ? 'bg-indigo-100 text-indigo-700' : 'hover:bg-gray-100 text-gray-500')}>🔍</button>
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

      {/* PDF area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto bg-gray-100 dark:bg-gray-900 py-4">
        <Document
          file={fileUrl}
          onLoadSuccess={(pdf) => setPageCount(pdf.numPages)}
          loading={<div className="text-center text-gray-500 pt-10">加载 PDF…</div>}
          error={<div className="text-center text-red-500 pt-10">PDF 加载失败</div>}
        >
          {Array.from({ length: pageCount }, (_, i) => i + 1).map((pageNum) => {
            const shouldRender = renderedPages.has(pageNum);
            return (
              <div
                key={pageNum}
                className="pdf-page"
                data-page-number={pageNum}
                style={{ width: pageWidth, minHeight: heightFor(pageNum) }}
                ref={(el) => {
                  if (el) pageRefs.current.set(pageNum, el);
                  registerPage(pageNum, el);
                }}
              >
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
                    className="flex items-center justify-center text-xs text-gray-300 dark:text-gray-600"
                    style={{ height: heightFor(pageNum) }}
                  >
                    第 {pageNum} 页
                  </div>
                )}
                {shouldRender && (highlightsByPage.get(pageNum) ?? []).map((h) =>
                  h.position.rects.map((r, idx) => (
                    <div
                      key={`${h.id}-${idx}`}
                      className="highlight-rect"
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
                    />
                  )),
                )}
              </div>
            );
          })}
        </Document>
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
