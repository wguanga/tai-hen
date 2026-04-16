import { useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { api } from '../api';
import { streamSSE } from '../hooks/useStream';
import { useAppStore } from '../store/app-store';

export function AiPanel() {
  const { state, dispatch } = useAppStore();
  const [input, setInput] = useState('');
  const abortRef = useRef<AbortController | null>(null);

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
      <div className="flex items-center justify-between px-3 py-2 border-b bg-white">
        <div className="text-sm font-medium">AI 助手</div>
        <div className="flex gap-2">
          <button
            onClick={summarize}
            disabled={state.streaming}
            className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-50"
          >
            总结全文
          </button>
          <button
            onClick={saveAsNote}
            disabled={!lastAssistantContent || state.streaming}
            className="text-xs px-2 py-1 rounded bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-50"
          >
            存为笔记
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {state.messages.length === 0 && !state.streaming && (
          <div className="text-xs text-gray-400">
            在左侧 PDF 选中文字，右键 → AI 解释。或直接在下方输入问题。
          </div>
        )}
        {state.messages.map((m, i) => (
          <Bubble key={i} role={m.role} content={m.content} />
        ))}
        {state.streaming && state.streamBuffer && (
          <Bubble role="assistant" content={state.streamBuffer} streaming />
        )}
        {state.streaming && !state.streamBuffer && (
          <div className="text-xs text-gray-400 italic">思考中…</div>
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
          'inline-block max-w-full text-left px-3 py-2 rounded ' +
          (isUser ? 'bg-indigo-50 text-indigo-900' : 'bg-gray-100 text-gray-900')
        }
      >
        {isUser ? (
          <span className="text-sm whitespace-pre-wrap">{content}</span>
        ) : (
          <div className="markdown-body">
            <ReactMarkdown>{content}</ReactMarkdown>
            {streaming && <span className="text-gray-400">▋</span>}
          </div>
        )}
      </div>
    </div>
  );
}
