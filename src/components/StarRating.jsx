import React from 'react';

export default function StarRating({ value, onChange }) {
  const interactive = typeof onChange === 'function';
  return (
    <div className="rating-stars" role={interactive ? 'radiogroup' : 'img'} aria-label={`Rating ${value} of 5`}>
      {[1, 2, 3, 4, 5].map((val) => (
        <span
          key={val}
          className={`star ${value >= val ? 'active' : ''}`}
          role={interactive ? 'radio' : undefined}
          aria-checked={interactive ? value === val : undefined}
          tabIndex={interactive ? 0 : undefined}
          onClick={interactive ? () => onChange(val) : undefined}
          onKeyDown={
            interactive
              ? (e) => (e.key === 'Enter' || e.key === ' ') && onChange(val)
              : undefined
          }
        >
          ★
        </span>
      ))}
    </div>
  );
}
