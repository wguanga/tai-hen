import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { streamSSE, type StreamStatus } from '../hooks/useStream';
import { Markdown } from './Markdown';
import { useAppStore } from '../store/app-store';
import { useToast } from './Toast';
import { FantasyProgress } from './FantasyProgress';
import { useRelatedPapers } from '../hooks/useRelatedPapers';

type SummaryData = { id: string; content: string; created_at: string; updated_at: string } | null;

const AUTO_KEY = 'paper_auto_summary';

export function SummaryPanel() {
  const { state, dispatch } = useAppStore();
  const { toast } = useToast();
  const paper = state.currentPaper;
  const related = useRelatedPapers(paper, state.papers);

  const [summary, setSummary] = useState<SummaryData>(null);
  const [loading, setLoading] = useState(false);
  const [streamBuf, setStreamBuf] = useState('');
  const [status, setStatus] = useState<StreamStatus | null>(null);
  const [autoEnabled, setAutoEnabled] = useState(() => localStorage.getItem(AUTO_KEY) === '1');
  const abortRef = useRef<AbortController | null>(null);

  // Fetch existing summary when paper opens
  useEffect(() => {
    if (!paper) { setSummary(null); return; }
    let cancelled = false;
    api.getSummary(paper.id)
      .then((res) => {
        if (cancelled) return;
        setSummary(res.summary);
        if (!res.summary && autoEnabled) generate();
      })
      .catch(() => {});
    return () => { cancelled = true; abortRef.current?.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paper?.id]);

  async function generate() {
    if (!paper || loading) return;
    setLoading(true);
    setStreamBuf('');
    setStatus(null);
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    let acc = '';
    await streamSSE('/ai/summarize', { paper_id: paper.id }, {
      signal: ac.signal,
      onChunk: (t) => {
        acc += t;
        setStreamBuf(acc);
      },
      onStatus: (s) => setStatus(s),
      onDone: async () => {
        // Server persisted it via on_done. Fetch fresh summary from DB for final state.
        try {
          const res = await api.getSummary(paper.id);
          if (res.summary) {
            setSummary(res.summary);
            dispatch({
              type: 'ADD_NOTE',
              note: {
                id: res.summary.id,
                paper_id: paper.id,
                highlight_id: null,
                title: '整篇摘要',
                content: res.summary.content,
                source: 'ai_summary',
                created_at: res.summary.created_at,
                updated_at: res.summary.updated_at,
              },
            });
            toast('摘要已生成 ✨', 'success');
          }
        } catch { /* ignore */ }
        setLoading(false);
        setStreamBuf('');
        setStatus(null);
      },
      onError: (_c, m) => {
        toast('摘要生成失败：' + m, 'error');
        setLoading(false);
        setStreamBuf('');
        setStatus(null);
      },
    });
  }

  function cancel() {
    abortRef.current?.abort();
    setLoading(false);
    setStreamBuf('');
    setStatus(null);
  }

  function toggleAuto() {
    setAutoEnabled((v) => {
      const next = !v;
      localStorage.setItem(AUTO_KEY, next ? '1' : '0');
      return next;
    });
  }

  if (!paper) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-gray-400 dark:text-gray-500 p-4">
        <div className="text-center">
          <div className="text-4xl mb-2 opacity-60">📜</div>
          <div>打开一篇论文来召唤它的摘要</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-gradient-to-r from-indigo-50/70 via-white/40 to-fuchsia-50/70 dark:from-indigo-900/20 dark:via-transparent dark:to-fuchsia-900/20">
        <div className="text-sm font-semibold dark:text-gray-200 flex items-center gap-1.5">
          <span className="text-base">📜</span>
          <span>摘要</span>
        </div>
        <div className="flex items-center gap-1.5">
          <label
            className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1 cursor-pointer px-1.5 py-0.5 rounded hover:bg-white/60 dark:hover:bg-gray-700/40"
            title="打开论文时若无摘要，自动生成"
          >
            <input type="checkbox" checked={autoEnabled} onChange={toggleAuto} className="accent-fuchsia-500" />
            自动
          </label>
          {loading ? (
            <button
              onClick={cancel}
              className="text-xs px-2.5 py-1 rounded-full border border-rose-300 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/30"
            >
              停止
            </button>
          ) : summary ? (
            <button
              onClick={generate}
              className="magic-btn text-xs px-2.5 py-1 rounded-full border border-indigo-200 dark:border-indigo-700 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30"
            >
              🔄 重新生成
            </button>
          ) : (
            <button
              onClick={generate}
              className="magic-btn text-xs px-3 py-1 rounded-full bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-rose-500 text-white shadow-[0_2px_10px_rgba(168,85,247,0.35)] hover:shadow-[0_2px_14px_rgba(168,85,247,0.5)]"
            >
              ✨ 生成摘要
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {loading && (
          <>
            <FantasyProgress status={status} />
            {streamBuf && (
              <div className="markdown-body drop-cap text-sm text-gray-800 dark:text-gray-200 mt-2 opacity-95">
                <Markdown>{streamBuf}</Markdown>
                <span className="inline-block w-1.5 h-4 bg-fuchsia-500 ml-0.5 align-middle animate-pulse" />
              </div>
            )}
          </>
        )}

        {!loading && !summary && (
          <div className="text-center text-sm text-gray-500 dark:text-gray-400 mt-6 px-4">
            <div className="text-5xl mb-3 opacity-70">🔮</div>
            <div className="mb-2">还没有摘要</div>
            <div className="text-xs text-gray-400 dark:text-gray-500 leading-relaxed">
              让 🦄 为你通读全文，提炼出核心贡献、方法、实验结论、局限与关键术语。
            </div>
          </div>
        )}

        {!loading && related.length > 0 && (
          <div className="mb-4">
            <div className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5 flex items-center gap-1">
              <span>🔗</span>
              <span>你库里可能相关的论文</span>
            </div>
            <div className="space-y-1.5">
              {related.map(({ paper: p, similarity }) => (
                <button
                  key={p.id}
                  onClick={async () => {
                    try {
                      const [paper2, hl, notes] = await Promise.all([
                        api.getPaper(p.id),
                        api.listHighlights(p.id),
                        api.listNotes(p.id),
                      ]);
                      dispatch({ type: 'OPEN_PAPER', paper: paper2, highlights: hl.items, notes: notes.items });
                      api.getReferences(p.id).then((r) => dispatch({ type: 'SET_REFERENCES', references: r.items })).catch(() => {});
                    } catch { /* ignore */ }
                  }}
                  className="w-full text-left p-2 rounded-lg border border-indigo-100 dark:border-indigo-900/40 hover:border-fuchsia-300 hover:bg-indigo-50/60 dark:hover:bg-indigo-900/20 transition-colors group"
                  title={`相似度 ${Math.round(similarity * 100)}%`}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-xs text-fuchsia-500 mt-0.5">▸</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-gray-700 dark:text-gray-200 truncate">{p.title}</div>
                      <div className="text-[10px] text-gray-400 truncate">
                        {p.authors.slice(0, 2).join(', ') || '未知作者'}
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <span
                          key={i}
                          className="w-1 h-2 rounded-sm"
                          style={{
                            background: i < Math.round(similarity * 10 / 2)
                              ? 'linear-gradient(to top, #6366f1, #d946ef)'
                              : 'rgba(165,180,252,.25)',
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {!loading && summary && (
          <div className="markdown-body drop-cap text-sm text-gray-800 dark:text-gray-200">
            <Markdown>{summary.content}</Markdown>
          </div>
        )}
      </div>
    </div>
  );
}
