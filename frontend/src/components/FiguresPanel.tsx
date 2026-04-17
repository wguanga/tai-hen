import { useEffect, useState } from 'react';
import { api } from '../api';
import { streamSSE } from '../hooks/useStream';
import { useAppStore } from '../store/app-store';
import { Markdown } from './Markdown';
import { useToast } from './Toast';

type Figure = {
  number: number;
  page: number;
  kind: 'figure' | 'table';
  caption: string;
  image_xref: number | null;
};

export function FiguresPanel({ onGoToPage }: { onGoToPage: (page: number) => void }) {
  const { state } = useAppStore();
  const { toast } = useToast();
  const paper = state.currentPaper;

  const [figures, setFigures] = useState<Figure[]>([]);
  const [loading, setLoading] = useState(false);
  const [visionSupported, setVisionSupported] = useState<boolean | null>(null);

  const [explaining, setExplaining] = useState<string | null>(null); // key: page-number
  const [explanations, setExplanations] = useState<Record<string, string>>({});

  useEffect(() => {
    api.getConfig().then((c) => setVisionSupported(c.supports_vision)).catch(() => setVisionSupported(false));
  }, []);

  useEffect(() => {
    if (!paper) { setFigures([]); return; }
    setLoading(true);
    let cancelled = false;
    api.getFigures(paper.id)
      .then((res) => { if (!cancelled) setFigures(res.items); })
      .catch(() => { if (!cancelled) setFigures([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [paper?.id]);

  async function explain(fig: Figure) {
    if (!paper) return;
    if (!visionSupported) {
      toast('当前模型不支持图像，请在设置中切换（如 gpt-4o / claude-3.x）', 'error');
      return;
    }
    if (fig.image_xref == null) {
      toast('未能从 PDF 提取该图像', 'error');
      return;
    }
    const key = `${fig.page}-${fig.number}-${fig.kind}`;
    setExplaining(key);
    setExplanations((m) => ({ ...m, [key]: '' }));
    let acc = '';
    await streamSSE('/ai/explain_figure', {
      paper_id: paper.id,
      number: fig.number,
      page: fig.page,
      kind: fig.kind,
      caption: fig.caption,
      image_xref: fig.image_xref,
    }, {
      onChunk: (t) => {
        acc += t;
        setExplanations((m) => ({ ...m, [key]: acc }));
      },
      onDone: () => setExplaining(null),
      onError: (_c, m) => {
        toast('解释失败：' + m, 'error');
        setExplaining(null);
      },
    });
  }

  if (!paper) {
    return <div className="h-full flex items-center justify-center text-xs text-gray-400">打开论文后显示图表</div>;
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-white dark:bg-gray-800">
        <div className="text-sm font-medium dark:text-gray-200">📊 图表 ({figures.length})</div>
        <div className="text-[10px] text-gray-400">
          视觉模型：{visionSupported === null ? '…' : visionSupported ? '✓ 支持' : '✗ 不支持'}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {loading && <div className="text-xs text-gray-400 italic">扫描图表…</div>}
        {!loading && figures.length === 0 && (
          <div className="text-xs text-gray-400 p-2">
            未检测到 "Figure N." / "Table N." 形式的图表标题。
          </div>
        )}
        {figures.map((f) => {
          const key = `${f.page}-${f.number}-${f.kind}`;
          const explanation = explanations[key];
          const isExplaining = explaining === key;
          return (
            <div key={key} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-2">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => onGoToPage(f.page)}
                  className="text-xs font-medium text-indigo-600 dark:text-indigo-300 hover:underline"
                >
                  {f.kind === 'figure' ? '🖼️' : '📋'} {f.kind === 'figure' ? 'Figure' : 'Table'} {f.number} · p.{f.page}
                </button>
                <button
                  onClick={() => explain(f)}
                  disabled={isExplaining || !visionSupported || f.image_xref == null}
                  title={
                    !visionSupported
                      ? '当前模型不支持图像（在设置中切换 gpt-4o / claude-3.x / llava 等）'
                      : f.image_xref == null
                        ? '未能从 PDF 提取该图像'
                        : 'AI 解读此图/表'
                  }
                  className={
                    'text-xs px-2 py-0.5 rounded ' +
                    (isExplaining
                      ? 'bg-indigo-300 text-white'
                      : visionSupported && f.image_xref != null
                        ? 'bg-indigo-500 text-white hover:bg-indigo-600'
                        : 'bg-gray-200 text-gray-400 cursor-not-allowed dark:bg-gray-700 dark:text-gray-500')
                  }
                >
                  {isExplaining ? '解读中…' : '🤖 AI 解读'}
                </button>
              </div>
              {f.image_xref != null && (
                <img
                  src={api.figureImageUrl(paper.id, f.image_xref)}
                  alt={f.caption}
                  className="mt-1 max-h-60 object-contain border border-gray-200 dark:border-gray-700 rounded bg-white"
                  loading="lazy"
                />
              )}
              <div className="text-xs text-gray-600 dark:text-gray-300 mt-1 italic line-clamp-3">
                {f.caption}
              </div>
              {explanation && (
                <div className="mt-2 p-2 bg-indigo-50 dark:bg-indigo-900/20 rounded text-sm text-gray-800 dark:text-gray-200 markdown-body">
                  <Markdown>{explanation}</Markdown>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
