import React from 'react';

export default function CategoryCard({ icon, label, onClick }) {
  return (
    <button className="category-card" onClick={onClick} aria-label={label}>
      <span className="category-icon" aria-hidden="true">{icon}</span>
      <span className="category-label">{label}</span>
    </button>
  );
}
