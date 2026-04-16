import { useEffect } from 'react';
import type { HighlightColor } from '../types';

export interface KeyboardActions {
  setColor: (color: HighlightColor) => void;
  explain: () => void;
  translate: () => void;
  addNote: () => void;
  exportMd: () => void;
}

export function useKeyboard(actions: KeyboardActions, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      // Ctrl+S → export (works even in inputs)
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        actions.exportMd();
        return;
      }

      // Skip remaining shortcuts if user is typing in an input
      if (inInput) return;

      switch (e.key) {
        case '1': actions.setColor('yellow'); break;
        case '2': actions.setColor('blue'); break;
        case '3': actions.setColor('green'); break;
        case '4': actions.setColor('purple'); break;
        case 'e':
        case 'E': actions.explain(); break;
        case 't':
        case 'T': actions.translate(); break;
        case 'n':
        case 'N': actions.addNote(); break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [actions, enabled]);
}
