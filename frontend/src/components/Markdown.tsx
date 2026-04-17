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

function renderWithCitations(children: unknown, refIndex: Map<number, string>): any {
  if (refIndex.size === 0) return children;
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

function splitText(text: string, refIndex: Map<number, string>) {
  const parts: (string | JSX.Element)[] = [];
  let lastIndex = 0;
  let key = 0;
  for (const m of text.matchAll(CITE_RE)) {
    const start = m.index!;
    if (start > lastIndex) parts.push(text.slice(lastIndex, start));
    const inner = m[1];
    const nums = inner.split(/\s*,\s*/).map((n) => parseInt(n, 10)).filter((n) => !isNaN(n));
    // Only turn into citation if at least one ref exists
    const hasAny = nums.some((n) => refIndex.has(n));
    if (hasAny) {
      parts.push(<Citation key={`c${key++}`} nums={nums} refIndex={refIndex} raw={m[0]} />);
    } else {
      parts.push(m[0]);
    }
    lastIndex = start + m[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
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
