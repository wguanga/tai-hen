import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

/**
 * Project-wide Markdown renderer with:
 * - GitHub-flavored markdown (via react-markdown default)
 * - KaTeX math rendering: inline $...$ and block $$...$$
 *
 * 🔴 Always use this instead of raw ReactMarkdown so every surface
 * (notes, AI replies, summaries) renders math consistently.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
      {children}
    </ReactMarkdown>
  );
}
