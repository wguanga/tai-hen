import { useEffect, useRef, useState } from 'react';
import { Markdown } from './Markdown';
import { api } from '../api';
import { streamSSE } from '../hooks/useStream';
import { useAppStore } from '../store/app-store';
import { Taitai } from './Taitai';
import { useAIPrefs } from '../hooks/useAIPrefs';

export function AiPanel() {
  const { state, dispatch } = useAppStore();
  const [input, setInput] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const aiPrefs = useAIPrefs();

  const paper = state.currentPaper;

  const lastAssistantContent = [...state.messages].reverse().find((m) => m.role === 'assistant')?.content;

  async function send() {
    if (!paper || !input.trim() || state.streaming) return;
    const msg = { role: 'user' as const, content: input.trim() };
    dispatch({ type: 'CHAT_START', userMessage: msg });
    setInput('');

    const nextMessages = [...state.messages, msg];
    const controller = new AbortController();
    abortRef.current = controller;
    let full = '';
    await streamSSE(
      '/ai/chat',
      {
        paper_id: paper.id,
        highlight_id: state.activeHighlight?.id ?? null,
        messages: nextMessages,
      },
      {
        signal: controller.signal,
        onChunk: (text) => {
          full += text;
          dispatch({ type: 'CHAT_CHUNK', text });
        },
        onDone: () => dispatch({ type: 'CHAT_DONE', finalText: full }),
        onError: (_c, m) => dispatch({ type: 'CHAT_ERROR', text: m }),
      },
    );
  }

  async function saveAsNote() {
    if (!paper || !lastAssistantContent) return;
    const lastUser = [...state.messages].reverse().find((m) => m.role === 'user');
    try {
      const note = await api.createNote(paper.id, {
        highlight_id: state.activeHighlight?.id ?? undefined,
        title: lastUser?.content.slice(0, 40),
        content: lastAssistantContent,
        source: 'ai_answer',
      });
      dispatch({ type: 'ADD_NOTE', note });
    } catch (e) {
      console.error(e);
    }
  }

  async function summarize() {
    if (!paper || state.streaming) return;
    dispatch({ type: 'CHAT_RESET' });
    dispatch({
      type: 'CHAT_START',
      userMessage: { role: 'user', content: '📑 生成整篇论文摘要' },
    });
    const controller = new AbortController();
    abortRef.current = controller;
    let full = '';
    await streamSSE(
      '/ai/summarize',
      { paper_id: paper.id },
      {
        signal: controller.signal,
        onChunk: (t) => { full += t; dispatch({ type: 'CHAT_CHUNK', text: t }); },
        onDone: async () => {
          dispatch({ type: 'CHAT_DONE', finalText: full });
          if (full.trim() && paper) {
            try {
              const note = await api.createNote(paper.id, {
                title: '整篇摘要',
                content: full,
                source: 'ai_summary',
              });
              dispatch({ type: 'ADD_NOTE', note });
            } catch { /* ignore */ }
          }
        },
        onError: (_c, m) => dispatch({ type: 'CHAT_ERROR', text: m }),
      },
    );
  }

  if (!paper) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-gray-400">
        打开论文后可以对话
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-indigo-100/60 dark:border-indigo-900/40 bg-gradient-to-r from-indigo-50/60 via-transparent to-fuchsia-50/60 dark:from-indigo-900/20 dark:to-fuchsia-900/20">
        <div className="text-sm font-semibold dark:text-gray-200 flex items-center gap-1.5">
          <span>🤖</span>
          <span>AI 助手</span>
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={summarize}
            disabled={state.streaming}
            className="magic-btn text-xs px-2.5 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-800/50 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 disabled:opacity-50 transition-colors"
          >
            📑 摘要
          </button>
          <button
            onClick={saveAsNote}
            disabled={!lastAssistantContent || state.streaming}
            className="magic-btn text-xs px-3 py-0.5 rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white shadow-[0_2px_8px_rgba(168,85,247,0.3)] hover:shadow-[0_2px_12px_rgba(168,85,247,0.5)] disabled:opacity-50"
          >
            存为笔记
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {state.messages.length === 0 && !state.streaming && paper && aiPrefs.isEnabled('suggest_questions') && (
          <StarterQuestions paperId={paper.id} onPick={(prompt) => {
            setInput(prompt);
            // send immediately
            setTimeout(() => {
              const btn = document.activeElement;
              void btn;
              // Reuse `send` by setting input first, then calling
            }, 0);
          }} onAsk={(prompt) => {
            // Directly send this prompt without relying on setState timing
            if (!paper || state.streaming) return;
            const msg = { role: 'user' as const, content: prompt };
            dispatch({ type: 'CHAT_START', userMessage: msg });
            const nextMessages = [...state.messages, msg];
            const controller = new AbortController();
            abortRef.current = controller;
            let full = '';
            streamSSE('/ai/chat', {
              paper_id: paper.id,
              highlight_id: state.activeHighlight?.id ?? null,
              messages: nextMessages,
            }, {
              signal: controller.signal,
              onChunk: (text) => { full += text; dispatch({ type: 'CHAT_CHUNK', text }); },
              onDone: () => dispatch({ type: 'CHAT_DONE', finalText: full }),
              onError: (_c, m) => dispatch({ type: 'CHAT_ERROR', text: m }),
            });
          }} />
        )}
        {state.messages.length === 0 && !state.streaming && !paper && (
          <div className="text-xs text-gray-400">打开论文后可以对话</div>
        )}
        {state.messages.length === 0 && !state.streaming && paper && !aiPrefs.isEnabled('suggest_questions') && (
          <div className="text-xs text-gray-400 text-center py-4">
            直接在下方提问，或按 <kbd className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-[10px]">Ctrl+K</kbd> 打开命令面板
          </div>
        )}
        {state.messages.map((m, i) => (
          <Bubble key={i} role={m.role} content={m.content} />
        ))}
        {state.streaming && state.streamBuffer && (
          <Bubble role="assistant" content={state.streamBuffer} streaming />
        )}
        {state.streaming && !state.streamBuffer && (
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 italic">
            <div style={{ animation: 'creatureWiggle 2.5s ease-in-out infinite' }}>
              <Taitai emotion="thinking" size={40} keyId="ai" />
            </div>
            <span className="ai-thinking-dots">苔苔翻阅中<span className="inline-block w-6 text-left">
              <span className="dots-pulse" />
            </span></span>
          </div>
        )}
      </div>

      <div className="border-t px-3 py-2 flex gap-2 bg-white">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={state.activeHighlight ? '针对选中高亮追问…' : '向 AI 提问…'}
          className="flex-1 text-sm px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-400"
        />
        <button
          onClick={send}
          disabled={!input.trim() || state.streaming}
          className="text-sm px-3 py-1 rounded bg-indigo-500 text-white disabled:opacity-50"
        >
          发送
        </button>
      </div>
    </div>
  );
}

function StarterQuestions({
  paperId,
  onPick: _onPick,
  onAsk,
}: {
  paperId: string;
  onPick: (prompt: string) => void;
  onAsk: (prompt: string) => void;
}) {
  const [questions, setQuestions] = useState<{ icon: string; label: string; prompt: string }[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.suggestQuestions(paperId)
      .then((r) => { if (!cancelled) setQuestions(r.questions); })
      .catch(() => { if (!cancelled) setQuestions([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [paperId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        <div style={{ animation: 'creatureWiggle 2.5s ease-in-out infinite' }}>
          <Taitai emotion="thinking" size={32} keyId="sq" />
        </div>
        <span>苔苔在想你可能关心什么…</span>
      </div>
    );
  }

  if (!questions || questions.length === 0) {
    return (
      <div className="text-xs text-gray-400">
        在左侧 PDF 选中文字，右键 → AI 解释。或直接在下方输入问题。
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-1">
        <span>✨</span>
        <span>苔苔推荐的起手问题</span>
      </div>
      {questions.map((q, i) => (
        <button
          key={i}
          onClick={() => onAsk(q.prompt)}
          className="starter-card group w-full text-left p-3 rounded-xl border border-indigo-100 dark:border-indigo-900/40 bg-gradient-to-br from-white/70 via-indigo-50/60 to-fuchsia-50/50 dark:from-gray-800/60 dark:via-indigo-900/30 dark:to-fuchsia-900/20 hover:border-fuchsia-300 hover:shadow-[0_6px_20px_rgba(168,85,247,0.2)] transition-all"
          style={{ animationDelay: `${i * 80}ms` }}
        >
          <div className="flex items-start gap-2">
            <span className="text-xl mt-0.5">{q.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 mb-0.5">
                {q.label}
              </div>
              <div className="text-[11px] text-gray-600 dark:text-gray-300 leading-relaxed">
                {q.prompt}
              </div>
            </div>
            <span className="text-indigo-300 opacity-0 group-hover:opacity-100 transition-opacity">→</span>
          </div>
        </button>
      ))}
    </div>
  );
}

function Bubble({
  role,
  content,
  streaming,
}: {
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
}) {
  const isUser = role === 'user';
  return (
    <div className={isUser ? 'text-right' : ''}>
      <div
        className={
          'inline-block max-w-full text-left px-3.5 py-2.5 text-gray-800 dark:text-gray-100 ' +
          (isUser ? 'chat-user' : 'chat-bot')
        }
      >
        {isUser ? (
          <span className="text-sm whitespace-pre-wrap">{content}</span>
        ) : (
          <div className="markdown-body">
            <Markdown>{content}</Markdown>
            {streaming && <StreamingCursor content={content} />}
          </div>
        )}
      </div>
    </div>
  );
}

/** Blinking caret + burst ring each time a new chunk lands. */
function StreamingCursor({ content }: { content: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.classList.remove('cursor-pulse');
    // force reflow so adding the class re-triggers the animation
    void el.offsetWidth;
    el.classList.add('cursor-pulse');
  }, [content]);
  return <span ref={ref} className="ai-stream-cursor" aria-hidden />;
}
