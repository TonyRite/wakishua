import React from 'react';

export default function Toast({ toast, onClose }) {
  return (
    <div
      className="toast"
      onClick={() => toast.onClick && toast.onClick()}
      style={{ cursor: toast.onClick ? 'pointer' : 'default' }}
      role="status"
    >
      <span>{toast.message}</span>
      <button
        className="toast-close"
        aria-label="Dismiss"
        onClick={(e) => {
          e.stopPropagation();
          onClose(toast.id);
        }}
      >
        ×
      </button>
    </div>
  );
}
