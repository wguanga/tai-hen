import ReactMarkdown from 'react-markdown';
import { api } from '../api';
import { useAppStore } from '../store/app-store';
import { COLOR_HEX } from '../types';

const SOURCE_LABEL: Record<string, string> = {
  manual: '手动',
  ai_answer: 'AI 回答',
  ai_summary: 'AI 摘要',
};

export function NotesPanel() {
  const { state, dispatch } = useAppStore();
  const paper = state.currentPaper;

  const highlightColor = (highlightId?: string | null) => {
    if (!highlightId) return undefined;
    const h = state.highlights.find((x) => x.id === highlightId);
    return h ? COLOR_HEX[h.color] : undefined;
  };

  async function remove(id: string) {
    if (!paper) return;
    if (!confirm('删除这条笔记？')) return;
    try {
      await api.deleteNote(paper.id, id);
      dispatch({ type: 'REMOVE_NOTE', id });
    } catch (e) {
      console.error(e);
    }
  }

  async function exportMd() {
    if (!paper) return;
    try {
      const md = await api.exportMarkdown(paper.id);
      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${paper.title}-notes.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
    }
  }

  if (!paper) {
    return <div className="h-full flex items-center justify-center text-xs text-gray-400">暂无笔记</div>;
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-white">
        <div className="text-sm font-medium">笔记 ({state.notes.length})</div>
        <button
          onClick={exportMd}
          className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-100"
        >
          📤 导出 MD
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {state.notes.length === 0 && (
          <div className="text-xs text-gray-400 p-2">
            暂无笔记。在 AI 面板点「存为笔记」即可保存。
          </div>
        )}
        {state.notes.map((n) => {
          const color = highlightColor(n.highlight_id);
          return (
            <div
              key={n.id}
              className="bg-white border border-gray-200 rounded p-2"
              style={color ? { borderLeft: `3px solid ${color}` } : undefined}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs text-gray-500">
                  <span className="font-medium text-gray-700">
                    {n.title || SOURCE_LABEL[n.source]}
                  </span>
                  <span className="ml-2">· {SOURCE_LABEL[n.source]}</span>
                </div>
                <button
                  onClick={() => remove(n.id)}
                  className="text-xs text-gray-400 hover:text-red-500"
                  title="删除"
                >
                  ✕
                </button>
              </div>
              <div className="markdown-body text-sm text-gray-800">
                <ReactMarkdown>{n.content}</ReactMarkdown>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
