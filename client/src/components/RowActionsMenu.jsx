import { useEffect, useRef, useState } from 'react';

export default function RowActionsMenu({ items }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div className="row-actions-menu" ref={ref}>
      <button
        type="button"
        className="row-actions-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Row actions"
      >
        &#8942;
      </button>
      {open && (
        <div className="row-actions-dropdown">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              className={`row-actions-item${item.danger ? ' row-actions-item-danger' : ''}`}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
