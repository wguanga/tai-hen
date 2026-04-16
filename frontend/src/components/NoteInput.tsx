import { useEffect, useRef, useState } from 'react';

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

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onCancel}>
      <div className="bg-white rounded-lg shadow-lg w-96 p-4" onClick={(e) => e.stopPropagation()}>
        <div className="text-sm font-medium mb-2">添加手动笔记</div>
        <div className="text-xs text-gray-500 mb-2 line-clamp-2">
          选中内容：{selectedText.slice(0, 120)}
        </div>
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="输入笔记内容…"
          rows={4}
          className="w-full text-sm border border-gray-300 rounded p-2 resize-none focus:outline-none focus:ring-1 focus:ring-indigo-400"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              if (value.trim()) onSubmit(value.trim());
            }
            if (e.key === 'Escape') onCancel();
          }}
        />
        <div className="flex justify-between items-center mt-2">
          <span className="text-xs text-gray-400">Ctrl+Enter 提交</span>
          <div className="flex gap-2">
            <button onClick={onCancel} className="text-sm px-3 py-1 rounded border border-gray-300 hover:bg-gray-100">
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
