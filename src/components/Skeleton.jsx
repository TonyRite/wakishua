import React from 'react';

// Renders a few placeholder cards while a feed is loading.
export default function Skeleton({ count = 3 }) {
  return (
    <div className="task-list" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div className="skeleton-card" key={i}>
          <div className="skeleton-line skeleton-line-title"></div>
          <div className="skeleton-line"></div>
          <div className="skeleton-line skeleton-line-short"></div>
        </div>
      ))}
    </div>
  );
}
