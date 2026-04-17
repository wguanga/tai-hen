import { useEffect, useRef, useState } from 'react';
import { streamSSE } from '../hooks/useStream';
import { Markdown } from './Markdown';

/**
 * Floating popover anchored near the selected text, streaming the translation
 * inline. Closes on outside click or Esc.
 */
export function BilingualPopover({
  paperId,
  sourceText,
  anchor,
  onClose,
}: {
  paperId: string;
  sourceText: string;
  anchor: { x: number; y: number };
  onClose: () => void;
}) {
  const [translation, setTranslation] = useState('');
  const [streaming, setStreaming] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let acc = '';
    streamSSE(
      '/ai/translate',
      { paper_id: paperId, text: sourceText },
      {
        onChunk: (t) => {
          acc += t;
          if (!cancelled) setTranslation(acc);
        },
        onDone: () => { if (!cancelled) setStreaming(false); },
        onError: () => { if (!cancelled) setStreaming(false); },
      },
    );
    return () => { cancelled = true; };
  }, [paperId, sourceText]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    function onClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) onClose();
    }
    window.addEventListener('keydown', onKey);
    // Defer to avoid immediately catching the menu click
    const t = setTimeout(() => document.addEventListener('mousedown', onClick), 100);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
      clearTimeout(t);
    };
  }, [onClose]);

  // Clamp within viewport
  const width = 420;
  const left = Math.max(8, Math.min(window.innerWidth - width - 8, anchor.x));
  const top = Math.min(window.innerHeight - 200, anchor.y + 20);

  return (
    <div
      ref={ref}
      className="fixed z-[55] bg-white dark:bg-gray-800 border border-indigo-300 dark:border-indigo-700 rounded-lg shadow-2xl"
      style={{ left, top, width }}
    >
      <div className="flex items-center justify-between px-2 py-1 border-b bg-indigo-50 dark:bg-indigo-900/40">
        <span className="text-xs font-medium text-indigo-700 dark:text-indigo-200">🌐 双语对照</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
      </div>
      <div className="p-2 border-b dark:border-gray-700 text-xs text-gray-600 dark:text-gray-400 italic max-h-20 overflow-y-auto">
        "{sourceText.slice(0, 300)}{sourceText.length > 300 ? '…' : ''}"
      </div>
      <div className="p-2 text-sm dark:text-gray-100 max-h-60 overflow-y-auto">
        {streaming && !translation && <span className="text-gray-400 italic">翻译中…</span>}
        {translation && (
          <div className="markdown-body">
            <Markdown>{translation}</Markdown>
            {streaming && <span className="text-gray-400">▋</span>}
          </div>
        )}
      </div>
    </div>
  );
}
