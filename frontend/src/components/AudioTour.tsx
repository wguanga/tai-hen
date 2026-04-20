import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api';

interface Props {
  paperId: string;
  onClose: () => void;
}

/**
 * "2-minute podcast tour" —
 * Fetches the paper's existing summary, then uses the browser's SpeechSynthesis
 * API to read it aloud, one sentence at a time, with play/pause, speed, and
 * the current sentence highlighted.
 */
export function AudioTour({ paperId, onClose }: Props) {
  const [sentences, setSentences] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1.0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const currentUtterRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Fetch summary on mount
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.getSummary(paperId)
      .then((res) => {
        if (cancelled) return;
        if (!res.summary?.content) {
          setError('没有生成摘要，无法朗读。先去摘要面板生成一份吧。');
        } else {
          setSentences(splitIntoSentences(res.summary.content));
        }
      })
      .catch(() => { if (!cancelled) setError('加载摘要失败'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => {
      cancelled = true;
      window.speechSynthesis.cancel();
    };
  }, [paperId]);

  const speakSentence = (i: number) => {
    if (i < 0 || i >= sentences.length) {
      setPlaying(false);
      return;
    }
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(sentences[i]);
    // Pick a Chinese voice if available; otherwise default
    const zhVoice = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith('zh'));
    if (zhVoice) utter.voice = zhVoice;
    utter.rate = rate;
    utter.pitch = 1.05;
    utter.onend = () => {
      // Auto-advance if still playing
      if (!document.hidden && currentUtterRef.current === utter) {
        setIdx((n) => {
          const next = n + 1;
          if (next >= sentences.length) {
            setPlaying(false);
          } else {
            speakSentence(next);
          }
          return next;
        });
      }
    };
    utter.onerror = () => {
      setPlaying(false);
    };
    currentUtterRef.current = utter;
    window.speechSynthesis.speak(utter);
  };

  const toggle = () => {
    if (playing) {
      window.speechSynthesis.cancel();
      setPlaying(false);
    } else {
      setPlaying(true);
      speakSentence(idx);
    }
  };

  const prev = () => {
    window.speechSynthesis.cancel();
    const i = Math.max(0, idx - 1);
    setIdx(i);
    if (playing) speakSentence(i);
  };
  const next = () => {
    window.speechSynthesis.cancel();
    const i = Math.min(sentences.length - 1, idx + 1);
    setIdx(i);
    if (playing) speakSentence(i);
  };

  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  // If rate changes mid-play, restart current sentence with new rate
  useEffect(() => {
    if (playing) {
      speakSentence(idx);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rate]);

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-black/45 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-2xl glass-panel border border-indigo-200 dark:border-indigo-800/60 shadow-[0_30px_80px_rgba(80,40,120,.45)] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-indigo-100 dark:border-indigo-900/40 bg-gradient-to-r from-indigo-500/10 to-fuchsia-500/10">
          <div className="flex items-center gap-2">
            <span className="text-base">🎙</span>
            <span className="font-semibold bg-gradient-to-r from-indigo-600 to-fuchsia-600 bg-clip-text text-transparent">
              语音导览
            </span>
            {sentences.length > 0 && (
              <span className="text-xs text-gray-400 ml-2 font-mono tabular-nums">
                {idx + 1} / {sentences.length}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-xs text-gray-400 hover:text-gray-600 px-2 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            关闭
          </button>
        </div>

        <div className="p-5 max-h-[50vh] overflow-y-auto">
          {loading && <div className="text-center text-sm text-gray-400 py-8">苔苔在准备…</div>}
          {error && <div className="text-center text-sm text-rose-500 py-8">{error}</div>}
          {!loading && !error && sentences.length > 0 && (
            <div className="space-y-2">
              {sentences.map((s, i) => (
                <div
                  key={i}
                  className={
                    'text-sm leading-relaxed rounded-lg px-3 py-2 transition-all ' +
                    (i === idx
                      ? 'bg-gradient-to-r from-indigo-100 via-fuchsia-100 to-rose-100 dark:from-indigo-900/50 dark:via-fuchsia-900/50 dark:to-rose-900/40 text-indigo-900 dark:text-indigo-100 shadow-sm font-medium'
                      : i < idx
                        ? 'opacity-40'
                        : 'opacity-80')
                  }
                  onClick={() => {
                    window.speechSynthesis.cancel();
                    setIdx(i);
                    if (playing) speakSentence(i);
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  {s}
                </div>
              ))}
            </div>
          )}
        </div>

        {!loading && !error && sentences.length > 0 && (
          <div className="px-5 py-3 border-t border-indigo-100 dark:border-indigo-900/40 flex items-center gap-3 bg-white/60 dark:bg-gray-800/60">
            <button
              onClick={prev}
              className="text-lg w-9 h-9 rounded-full hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-colors"
              title="上一句"
            >
              ⏮
            </button>
            <button
              onClick={toggle}
              className="text-xl w-11 h-11 rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white shadow-[0_4px_16px_rgba(168,85,247,.4)] hover:shadow-[0_6px_22px_rgba(168,85,247,.55)] transition-all"
              title={playing ? '暂停' : '播放'}
            >
              {playing ? '⏸' : '▶'}
            </button>
            <button
              onClick={next}
              className="text-lg w-9 h-9 rounded-full hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-colors"
              title="下一句"
            >
              ⏭
            </button>
            <div className="flex-1" />
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <span>语速</span>
              {[0.75, 1.0, 1.25, 1.5].map((r) => (
                <button
                  key={r}
                  onClick={() => setRate(r)}
                  className={
                    'px-2 py-0.5 rounded-full transition-colors ' +
                    (rate === r
                      ? 'bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white'
                      : 'border border-indigo-200 dark:border-indigo-800/50 hover:bg-indigo-50 dark:hover:bg-indigo-900/30')
                  }
                >
                  {r}×
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Split markdown summary into human-readable sentences for TTS. */
function splitIntoSentences(md: string): string[] {
  // Strip markdown headings / bullets / bold markers for speech
  const plain = md
    .replace(/^#+\s*/gm, '')
    .replace(/^\s*[-*]\s*/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .trim();
  // Split on 。!？ and newlines, preserve the terminator
  const parts = plain.split(/(?<=[。！？.!?])\s+|\n{2,}/).map((x) => x.trim()).filter((x) => x.length > 2);
  // Collapse ultra-short fragments into the previous
  const merged: string[] = [];
  for (const p of parts) {
    if (p.length < 8 && merged.length > 0) {
      merged[merged.length - 1] += ' ' + p;
    } else {
      merged.push(p);
    }
  }
  return merged.slice(0, 60); // cap to 60 sentences
}
