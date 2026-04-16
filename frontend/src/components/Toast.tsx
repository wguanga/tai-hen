import { createContext, useCallback, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastCtx {
  toast: (message: string, type?: ToastType) => void;
}

const Ctx = createContext<ToastCtx>({ toast: () => {} });

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++nextId;
    setItems((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 3000);
  }, []);

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      {createPortal(
        <div className="fixed top-3 right-3 z-[9999] flex flex-col gap-2 pointer-events-none">
          {items.map((t) => (
            <div
              key={t.id}
              className={
                'pointer-events-auto px-4 py-2 rounded shadow-lg text-sm animate-slide-in ' +
                (t.type === 'error'
                  ? 'bg-red-600 text-white'
                  : t.type === 'success'
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-800 text-white')
              }
            >
              {t.message}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </Ctx.Provider>
  );
}

export function useToast() {
  return useContext(Ctx);
}
