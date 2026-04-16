import { useEffect, useMemo, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';

import { api } from '../api';
import { useAppStore } from '../store/app-store';
import { COLOR_HEX } from '../types';
import type { Highlight } from '../types';
import { ContextMenu, type MenuItem } from './ContextMenu';
import { useHighlight, type CapturedSelection } from '../hooks/useHighlight';
import { streamSSE } from '../hooks/useStream';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.js',
  import.meta.url,
).toString();

const PAGE_WIDTH = 780;

export function PdfReader() {
  const { state, dispatch } = useAppStore();
  const { activeColor, capture, clearSelection } = useHighlight();
  const [pageCount, setPageCount] = useState(0);
  const [menu, setMenu] = useState<{ x: number; y: number; captured: CapturedSelection } | null>(null);

  const paper = state.currentPaper;

  const fileUrl = useMemo(
    () => (paper ? api.paperFileUrl(paper.id) : null),
    [paper?.id],
  );

  const highlightsByPage = useMemo(() => {
    const map = new Map<number, Highlight[]>();
    for (const h of state.highlights) {
      const arr = map.get(h.page) ?? [];
      arr.push(h);
      map.set(h.page, arr);
    }
    return map;
  }, [state.highlights]);

  useEffect(() => {
    if (!paper) return;
    const onContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (!target.closest('.pdf-page')) return;
      const captured = capture();
      if (!captured) return;
      e.preventDefault();
      setMenu({ x: e.clientX, y: e.clientY, captured });
    };
    window.addEventListener('contextmenu', onContextMenu);
    return () => window.removeEventListener('contextmenu', onContextMenu);
  }, [paper?.id, capture]);

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

  async function explainHighlight(captured: CapturedSelection, hl: Highlight) {
    if (!paper) return;
    dispatch({ type: 'SET_ACTIVE_HIGHLIGHT', highlight: hl });
    dispatch({ type: 'CHAT_RESET' });
    dispatch({
      type: 'CHAT_START',
      userMessage: { role: 'user', content: `请解释：${captured.text.slice(0, 120)}` },
    });
    const controller = new AbortController();
    let full = '';
    await streamSSE(
      '/ai/explain',
      {
        paper_id: paper.id,
        highlight_id: hl.id,
        text: captured.text,
        level: 'simple',
      },
      {
        signal: controller.signal,
        onChunk: (text) => {
          full += text;
          dispatch({ type: 'CHAT_CHUNK', text });
        },
        onDone: () => dispatch({ type: 'CHAT_DONE', finalText: full }),
        onError: (_code, msg) => dispatch({ type: 'CHAT_ERROR', text: msg }),
      },
    );
  }

  const buildMenuItems = (captured: CapturedSelection): MenuItem[] => {
    const items: MenuItem[] = [
      {
        label: '🤖 AI 解释选中内容',
        onClick: async () => {
          const hl = await saveHighlight(captured);
          if (hl) await explainHighlight(captured, hl);
        },
      },
      { label: '', onClick: () => {}, divider: true },
      {
        label: '高亮：重要概念',
        dot: COLOR_HEX.yellow,
        onClick: () => saveHighlight(captured, 'yellow'),
      },
      {
        label: '高亮：方法细节',
        dot: COLOR_HEX.blue,
        onClick: () => saveHighlight(captured, 'blue'),
      },
      {
        label: '高亮：实验结论',
        dot: COLOR_HEX.green,
        onClick: () => saveHighlight(captured, 'green'),
      },
      {
        label: '高亮：不理解 (+ AI 解释)',
        dot: COLOR_HEX.purple,
        onClick: async () => {
          const hl = await saveHighlight(captured, 'purple');
          if (hl) await explainHighlight(captured, hl);
        },
      },
    ];
    return items;
  };

  return (
    <div className="w-full h-full overflow-y-auto bg-gray-100 py-4">
      <Document
        file={fileUrl}
        onLoadSuccess={(pdf) => setPageCount(pdf.numPages)}
        loading={<div className="text-center text-gray-500 pt-10">加载 PDF…</div>}
        error={<div className="text-center text-red-500 pt-10">PDF 加载失败</div>}
      >
        {Array.from({ length: pageCount }, (_, i) => i + 1).map((pageNum) => (
          <div
            key={pageNum}
            className="pdf-page"
            data-page-number={pageNum}
            style={{ width: PAGE_WIDTH }}
          >
            <Page pageNumber={pageNum} width={PAGE_WIDTH} />
            {(highlightsByPage.get(pageNum) ?? []).map((h) =>
              h.position.rects.map((r, i) => (
                <div
                  key={`${h.id}-${i}`}
                  className="highlight-rect"
                  data-hl={h.id}
                  style={{
                    left: r.x,
                    top: r.y,
                    width: r.width,
                    height: r.height,
                    background: COLOR_HEX[h.color],
                    opacity: 0.4,
                  }}
                />
              )),
            )}
          </div>
        ))}
      </Document>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={buildMenuItems(menu.captured)}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
