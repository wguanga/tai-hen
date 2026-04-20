import { useEffect } from 'react';

interface Shortcut {
  keys: string[];
  label: string;
}
interface Section {
  title: string;
  icon: string;
  items: Shortcut[];
}

const SECTIONS: Section[] = [
  {
    title: '导航',
    icon: '🧭',
    items: [
      { keys: ['←', '→'], label: '上一页 / 下一页' },
      { keys: ['Ctrl', 'F'], label: '在 PDF 内搜索' },
      { keys: ['Ctrl', 'K'], label: '打开命令面板' },
      { keys: ['Ctrl+Shift', 'F'], label: '跨论文搜笔记' },
      { keys: ['?'], label: '显示本快捷键面板' },
    ],
  },
  {
    title: '高亮',
    icon: '🎨',
    items: [
      { keys: ['1'], label: '黄 · 重要概念' },
      { keys: ['2'], label: '蓝 · 方法细节' },
      { keys: ['3'], label: '绿 · 实验结论' },
      { keys: ['4'], label: '紫 · 不理解（并触发 AI 解释）' },
    ],
  },
  {
    title: 'AI 与笔记',
    icon: '🤖',
    items: [
      { keys: ['E'], label: '解释选中内容' },
      { keys: ['T'], label: '翻译选中段落' },
      { keys: ['N'], label: '对选中文字做手动笔记' },
      { keys: ['Ctrl', 'S'], label: '导出 Markdown 笔记' },
    ],
  },
  {
    title: '视图',
    icon: '🪟',
    items: [
      { keys: ['F11'], label: '专注模式 / 退出' },
      { keys: ['Esc'], label: '退出专注 / 关闭弹层' },
    ],
  },
];

export function ShortcutHelp({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl glass-panel border border-indigo-200 dark:border-indigo-800/60 shadow-[0_30px_80px_rgba(80,40,120,.45)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-indigo-100 dark:border-indigo-900/40 bg-gradient-to-r from-indigo-500/10 via-transparent to-fuchsia-500/10">
          <div className="flex items-center gap-2">
            <span className="text-lg">⌨️</span>
            <span className="font-semibold bg-gradient-to-r from-indigo-600 to-fuchsia-600 bg-clip-text text-transparent">
              快捷键手册
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 px-2 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            Esc
          </button>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 p-5">
          {SECTIONS.map((s) => (
            <div key={s.title}>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-300 mb-2 uppercase tracking-wider">
                <span>{s.icon}</span>
                <span>{s.title}</span>
              </div>
              <div className="space-y-1.5">
                {s.items.map((it, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-gray-600 dark:text-gray-300 truncate">{it.label}</span>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {it.keys.map((k, j) => (
                        <span key={j} className="inline-flex items-center">
                          <kbd className="px-1.5 py-0.5 text-[10px] font-mono rounded border border-indigo-200 dark:border-indigo-800/60 bg-white/80 dark:bg-gray-800/80 shadow-sm text-gray-700 dark:text-gray-200">
                            {k}
                          </kbd>
                          {j < it.keys.length - 1 && <span className="mx-0.5 text-gray-300">+</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="px-5 py-2.5 text-center text-[11px] text-gray-400 dark:text-gray-500 border-t border-indigo-100/50 dark:border-indigo-900/30">
          🦄 把这份手册记在心里，下次就不用再打开了
        </div>
      </div>
    </div>
  );
}
