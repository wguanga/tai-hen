import { useEffect, useRef, useState } from 'react';

const TEMPLATES: { label: string; body: string }[] = [
  { label: '📌 核心贡献', body: '**核心贡献**：\n\n**我的理解**：\n' },
  { label: '🔬 方法细节', body: '**步骤 / 关键公式**：\n- \n\n**实现要点**：\n' },
  { label: '📊 实验结论', body: '**实验设置**：\n\n**关键数字**：\n- \n\n**解读**：\n' },
  { label: '❓ 疑问', body: '**我不理解的地方**：\n\n**可能的解释**：\n' },
  { label: '⚖️ 对比', body: '**与 X 相比**：\n- 相同：\n- 不同：\n\n**启示**：\n' },
  { label: '💡 批注', body: '' },
];

export function NoteInput({
  onSubmit,
  onCancel,
  selectedText,
}: {
  onSubmit: (text: string) => void;
  onCancel: () => void;
  selectedText: string;
}) {
  const [value, setValue] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  function applyTemplate(body: string) {
    // Replace if textarea is empty; otherwise append with blank line
    if (!value.trim()) setValue(body);
    else setValue((v) => v.trimEnd() + '\n\n' + body);
    setTimeout(() => ref.current?.focus(), 0);
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onCancel}>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg w-[480px] p-4" onClick={(e) => e.stopPropagation()}>
        <div className="text-sm font-medium mb-2 dark:text-gray-100">添加手动笔记</div>
        <div className="text-xs text-gray-500 mb-2 line-clamp-2 italic">
          "{selectedText.slice(0, 150)}{selectedText.length > 150 ? '…' : ''}"
        </div>
        <div className="flex flex-wrap gap-1 mb-2">
          {TEMPLATES.map((t) => (
            <button
              key={t.label}
              onClick={() => applyTemplate(t.body)}
              className="text-xs px-2 py-0.5 rounded border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
              title="点击插入模板"
            >
              {t.label}
            </button>
          ))}
        </div>
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="输入笔记内容，或选择上方模板…"
          rows={6}
          className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded p-2 resize-y focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white dark:bg-gray-900 dark:text-gray-100"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              if (value.trim()) onSubmit(value.trim());
            }
            if (e.key === 'Escape') onCancel();
          }}
        />
        <div className="flex justify-between items-center mt-2">
          <span className="text-xs text-gray-400">Ctrl+Enter 提交 · Esc 取消</span>
          <div className="flex gap-2">
            <button onClick={onCancel} className="text-sm px-3 py-1 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700">
              取消
            </button>
            <button
              onClick={() => { if (value.trim()) onSubmit(value.trim()); }}
              disabled={!value.trim()}
              className="text-sm px-3 py-1 rounded bg-indigo-500 text-white disabled:opacity-50"
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
