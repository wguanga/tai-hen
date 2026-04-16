import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export interface MenuItem {
  label: string;
  onClick: () => void;
  divider?: boolean;
  dot?: string;
}

export function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const handleDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const handleScroll = () => onClose();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleDown);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleDown);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  return createPortal(
    <ul
      ref={ref}
      className="ctx-menu"
      style={{ position: 'fixed', left: x, top: y, zIndex: 1000 }}
    >
      {items.map((item, i) =>
        item.divider ? (
          <li key={`div-${i}`} className="divider" />
        ) : (
          <li
            key={item.label}
            onClick={() => {
              item.onClick();
              onClose();
            }}
          >
            {item.dot && (
              <span
                style={{
                  display: 'inline-block',
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: item.dot,
                  marginRight: 8,
                  verticalAlign: 'middle',
                }}
              />
            )}
            {item.label}
          </li>
        ),
      )}
    </ul>,
    document.body,
  );
}
