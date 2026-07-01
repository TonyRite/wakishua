import React from 'react';

export default function BottomSheet({ open, onClose, title, desc, children }) {
  if (!open) return null;
  return (
    <div className="bottom-sheet open" role="dialog" aria-modal="true" aria-label={title}>
      <div className="sheet-backdrop" onClick={onClose}></div>
      <div className="sheet-content">
        <button
          className="sheet-handle"
          aria-label="Close"
          onClick={onClose}
        ></button>
        {title && <h3 className="sheet-title">{title}</h3>}
        {desc && <p className="sheet-desc">{desc}</p>}
        {children}
      </div>
    </div>
  );
}
