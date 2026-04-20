import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api';
import { Mossling } from './Mossling';

type Mode = 'preread' | 'comprehension';

interface Question {
  q: string;
  hint?: string;
  reference_answer?: string;
}

interface Props {
  paperId: string;
  onClose: () => void;
}

type Verdict = 'right' | 'partial' | 'wrong';

/**
 * AI reading companion —
 *  tab "带着问题读": generates 4 open-ended questions to keep in mind while reading
 *  tab "检查理解": generates 3 comprehension questions, user answers, AI grades.
 */
export function ReadingCompanion({ paperId, onClose }: Props) {
  const [mode, setMode] = useState<Mode>('preread');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [verdicts, setVerdicts] = useState<Record<number, { verdict: Verdict; feedback: string; checking?: boolean }>>({});

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const loadQuestions = async (m: Mode) => {
    setLoading(true);
    setQuestions([]);
    setAnswers({});
    setVerdicts({});
    try {
      const r = await api.readingQuestions(paperId, m);
      setQuestions(r.questions);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { loadQuestions(mode); /* eslint-disable-next-line */ }, [mode]);

  const check = async (idx: number) => {
    const q = questions[idx];
    const ans = answers[idx];
    if (!q || !ans?.trim()) return;
    setVerdicts((v) => ({ ...v, [idx]: { verdict: 'partial', feedback: '', checking: true } }));
    try {
      const r = await api.checkAnswer(paperId, q.q, ans);
      setVerdicts((v) => ({ ...v, [idx]: { verdict: r.verdict, feedback: r.feedback } }));
    } catch {
      setVerdicts((v) => ({ ...v, [idx]: { verdict: 'partial', feedback: '评分失败' } }));
    }
  };

  const verdictStyle: Record<Verdict, { label: string; emoji: string; cls: string }> = {
    right:   { label: '对',     emoji: '✅', cls: 'bg-emerald-50 dark:bg-emerald-900/40 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-200' },
    partial: { label: '部分对', emoji: '⚠️', cls: 'bg-amber-50 dark:bg-amber-900/40 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-200' },
    wrong:   { label: '不对',   emoji: '❌', cls: 'bg-rose-50 dark:bg-rose-900/40 border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-200' },
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center pt-[6vh] p-6 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] rounded-2xl glass-panel border border-indigo-200 dark:border-indigo-800/60 shadow-[0_30px_80px_rgba(80,40,120,.45)] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-indigo-100 dark:border-indigo-900/40 bg-gradient-to-r from-indigo-500/10 via-fuchsia-500/10 to-rose-500/10">
          <div className="flex items-center gap-2">
            <span>🎓</span>
            <span className="font-semibold bg-gradient-to-r from-indigo-600 via-fuchsia-600 to-rose-500 bg-clip-text text-transparent">
              AI 伴读
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 px-2 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            Esc
          </button>
        </div>

        {/* Mode tabs */}
        <div className="flex border-b border-indigo-100 dark:border-indigo-900/40">
          <TabBtn active={mode === 'preread'}       onClick={() => setMode('preread')}       label="🌱 带着问题读"     hint="阅读前 · 激发好奇心" />
          <TabBtn active={mode === 'comprehension'} onClick={() => setMode('comprehension')} label="🎯 检查我的理解"   hint="阅读后 · AI 评分" />
        </div>

        <div className="p-5 overflow-y-auto">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <div style={{ animation: 'creatureWiggle 2.5s ease-in-out infinite' }}>
                <Mossling emotion="thinking" size={36} keyId="rc" />
              </div>
              <span>苔苔正在准备问题…</span>
            </div>
          )}

          {!loading && questions.length === 0 && (
            <div className="text-sm text-gray-400 text-center py-6">
              没能生成问题，稍后再试
            </div>
          )}

          {!loading && mode === 'preread' && questions.length > 0 && (
            <div className="space-y-3">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                带着这些问题去读，注意力会更聚焦：
              </div>
              {questions.map((q, i) => (
                <div key={i} className="p-3 rounded-xl border border-indigo-100 dark:border-indigo-900/40 bg-gradient-to-br from-indigo-50/50 via-fuchsia-50/30 to-transparent dark:from-indigo-900/20 dark:via-fuchsia-900/10">
                  <div className="flex gap-2 items-start">
                    <span className="text-fuchsia-500 font-bold text-sm mt-0.5">Q{i + 1}</span>
                    <div className="flex-1">
                      <div className="font-medium text-sm text-gray-800 dark:text-gray-100 mb-1">{q.q}</div>
                      {q.hint && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 italic">💡 {q.hint}</div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && mode === 'comprehension' && questions.length > 0 && (
            <div className="space-y-4">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                读完后来答一下，看苔苔怎么评：
              </div>
              {questions.map((q, i) => {
                const v = verdicts[i];
                return (
                  <div key={i} className="p-3 rounded-xl border border-indigo-100 dark:border-indigo-900/40">
                    <div className="flex gap-2 items-start mb-2">
                      <span className="text-fuchsia-500 font-bold text-sm mt-0.5">Q{i + 1}</span>
                      <div className="flex-1 font-medium text-sm text-gray-800 dark:text-gray-100">{q.q}</div>
                    </div>
                    <textarea
                      value={answers[i] ?? ''}
                      onChange={(e) => setAnswers((a) => ({ ...a, [i]: e.target.value }))}
                      placeholder="在这里写下你的理解…"
                      className="w-full text-sm p-2 rounded-lg border border-indigo-200 dark:border-indigo-800/50 bg-white/70 dark:bg-gray-800/70 focus:outline-none focus:ring-2 focus:ring-fuchsia-400 resize-y min-h-[60px]"
                      disabled={!!v}
                    />
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <button
                        onClick={() => check(i)}
                        disabled={!answers[i]?.trim() || !!v?.checking}
                        className="text-xs px-3 py-1 rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white disabled:opacity-40 shadow-[0_2px_8px_rgba(168,85,247,.3)] hover:shadow-[0_2px_14px_rgba(168,85,247,.5)] transition-shadow"
                      >
                        {v?.checking ? '评分中…' : v ? '已评' : '让苔苔评一下'}
                      </button>
                      {v && !v.checking && (
                        <div className={'flex-1 flex items-center gap-2 px-2 py-1 rounded-lg border text-xs ' + verdictStyle[v.verdict].cls}>
                          <span>{verdictStyle[v.verdict].emoji}</span>
                          <span className="font-semibold">{verdictStyle[v.verdict].label}</span>
                          <span className="flex-1">{v.feedback}</span>
                        </div>
                      )}
                    </div>
                    {q.reference_answer && v && !v.checking && (
                      <details className="mt-2 text-xs">
                        <summary className="cursor-pointer text-indigo-500 hover:text-fuchsia-500">参考答案</summary>
                        <div className="mt-1 p-2 rounded bg-indigo-50/60 dark:bg-indigo-900/20 text-gray-700 dark:text-gray-200">
                          {q.reference_answer}
                        </div>
                      </details>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function TabBtn({ active, onClick, label, hint }: { active: boolean; onClick: () => void; label: string; hint: string }) {
  return (
    <button
      onClick={onClick}
      className={
        'flex-1 py-3 px-4 text-left transition-all ' +
        (active
          ? 'bg-gradient-to-br from-indigo-50 via-fuchsia-50 to-rose-50 dark:from-indigo-900/40 dark:via-fuchsia-900/40 dark:to-rose-900/20 border-b-2 border-fuchsia-500'
          : 'border-b-2 border-transparent hover:bg-indigo-50/40 dark:hover:bg-indigo-900/20')
      }
    >
      <div className={'text-sm font-semibold ' + (active ? 'text-fuchsia-700 dark:text-fuchsia-300' : 'text-gray-600 dark:text-gray-300')}>{label}</div>
      <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{hint}</div>
    </button>
  );
}
