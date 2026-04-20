import { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { useAppStore } from '../store/app-store';

/**
 * Project-wide Markdown renderer with:
 * - GitHub-flavored markdown (via react-markdown default)
 * - KaTeX math rendering: inline $...$ and block $$...$$
 * - Interactive [n] citation links with hover preview (uses paper's references)
 *
 * 🔴 Always use this instead of raw ReactMarkdown so every surface
 * (notes, AI replies, summaries) renders math + citations consistently.
 */
export function Markdown({ children }: { children: string }) {
  const { state } = useAppStore();
  const refIndex = useMemo(() => {
    const m = new Map<number, string>();
    for (const r of state.references) m.set(r.index, r.text);
    return m;
  }, [state.references]);

  // Custom text component that splits [n] patterns into hoverable spans
  const components = {
    p: ({ children: c }: any) => <p>{renderWithCitations(c, refIndex)}</p>,
    li: ({ children: c }: any) => <li>{renderWithCitations(c, refIndex)}</li>,
  };

  return (
    <ReactMarkdown
      remarkPlugins={[remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={components}
    >
      {children}
    </ReactMarkdown>
  );
}

const CITE_RE = /\[(\d{1,3}(?:\s*,\s*\d{1,3})*)\]/g;
// Page-reference patterns: "p.3", "p. 3", "page 3", "第 3 页", "pp.3-5"
const PAGE_RE = /(?:\bp{1,2}\.\s*|\bpage\s+|第\s*)(\d{1,4})(?:\s*-\s*(\d{1,4}))?(?:\s*页)?/gi;

function renderWithCitations(children: unknown, refIndex: Map<number, string>): any {
  if (typeof children === 'string') return splitText(children, refIndex);
  if (Array.isArray(children)) {
    return children.map((child, i) => {
      if (typeof child === 'string') {
        return <span key={i}>{splitText(child, refIndex)}</span>;
      }
      return child;
    });
  }
  return children;
}

/** Two-pass tokenizer: [n] bibliography refs, then p.N / 第N页 page refs. */
function splitText(text: string, refIndex: Map<number, string>) {
  type Token = { type: 'text'; value: string } | { type: 'cite'; match: RegExpMatchArray } | { type: 'page'; match: RegExpMatchArray };
  let tokens: Token[] = [{ type: 'text', value: text }];

  // Pass 1: bibliography [n] refs
  if (refIndex.size > 0) {
    tokens = tokens.flatMap<Token>((t) => {
      if (t.type !== 'text') return [t];
      const out: Token[] = [];
      let last = 0;
      for (const m of t.value.matchAll(CITE_RE)) {
        const start = m.index!;
        if (start > last) out.push({ type: 'text', value: t.value.slice(last, start) });
        out.push({ type: 'cite', match: m });
        last = start + m[0].length;
      }
      if (last < t.value.length) out.push({ type: 'text', value: t.value.slice(last) });
      return out;
    });
  }

  // Pass 2: page refs (only in remaining text tokens)
  tokens = tokens.flatMap<Token>((t) => {
    if (t.type !== 'text') return [t];
    const out: Token[] = [];
    let last = 0;
    for (const m of t.value.matchAll(PAGE_RE)) {
      const start = m.index!;
      if (start > last) out.push({ type: 'text', value: t.value.slice(last, start) });
      out.push({ type: 'page', match: m });
      last = start + m[0].length;
    }
    if (last < t.value.length) out.push({ type: 'text', value: t.value.slice(last) });
    return out;
  });

  // Render
  let key = 0;
  return tokens.map((t) => {
    if (t.type === 'text') return t.value;
    if (t.type === 'cite') {
      const inner = t.match[1];
      const nums = inner.split(/\s*,\s*/).map((n) => parseInt(n, 10)).filter((n) => !isNaN(n));
      const hasAny = nums.some((n) => refIndex.has(n));
      return hasAny
        ? <Citation key={`c${key++}`} nums={nums} refIndex={refIndex} raw={t.match[0]} />
        : t.match[0];
    }
    // page
    const startPage = parseInt(t.match[1], 10);
    if (isNaN(startPage)) return t.match[0];
    return <PageRef key={`p${key++}`} page={startPage} raw={t.match[0]} />;
  });
}

function PageRef({ page, raw }: { page: number; raw: string }) {
  return (
    <button
      type="button"
      onClick={() => (window as any).__goToPage?.(page)}
      className="inline-flex items-baseline align-baseline text-fuchsia-600 dark:text-fuchsia-300 hover:bg-fuchsia-100 dark:hover:bg-fuchsia-900/40 px-1 rounded transition-colors cursor-pointer border-b border-dashed border-fuchsia-400"
      title={`跳到第 ${page} 页`}
    >
      {raw}
    </button>
  );
}

function Citation({ nums, refIndex, raw }: { nums: number[]; refIndex: Map<number, string>; raw: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className="relative inline-block"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <span className="text-indigo-600 dark:text-indigo-300 cursor-help underline decoration-dotted">
        {raw}
      </span>
      {open && (
        <span
          className="absolute z-50 left-0 top-full mt-1 w-80 p-2 bg-gray-900 text-white text-xs rounded shadow-lg pointer-events-none"
          style={{ whiteSpace: 'normal' }}
        >
          {nums.map((n) => (
            <span key={n} className="block mb-1 last:mb-0">
              <span className="text-indigo-300 mr-1">[{n}]</span>
              {refIndex.get(n) ?? <span className="text-gray-400 italic">未在参考文献中找到</span>}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}
