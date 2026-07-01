import React from 'react';
import { useT } from '../i18n/LanguageContext.jsx';
import { formatExpiry, formatBudget, categoryLabel, badgeClass } from '../utils/format.js';

// Flexible task card. `variant`:
//  - 'mine'   : customer/provider viewing their own task (status badge + CTA)
//  - 'nearby' : provider browsing an open task (distance + Interested CTA)
export default function TaskCard({ task, variant = 'mine', role, onPrimary, onChat, primaryLabel }) {
  const { t } = useT();
  const label = categoryLabel(task.category, t);
  const area = task.location_name || t('nearby_area');

  return (
    <div className="task-card">
      <div className="card-top">
        <span className="card-title">
          <span aria-hidden="true">📋</span> {label}
        </span>
        {variant === 'nearby' ? (
          <span className="card-badge badge-orange">{t('km_away', { km: task.distance_km })}</span>
        ) : (
          <span className={`card-badge ${badgeClass(task.status)}`}>{task.status}</span>
        )}
      </div>

      {task.details && <p className="card-details">{task.details}</p>}

      <div className="card-meta-grid">
        <div className="meta-item">💰 {formatBudget(task, t)}</div>
        <div className="meta-item">⏱️ {formatExpiry(task.expires_at, t)}</div>
        <div className="meta-item meta-area">📍 {area}</div>
        {variant === 'mine' && task.distance_km != null && (
          <div className="meta-item">📏 {task.distance_km} km</div>
        )}
      </div>

      {variant === 'nearby' && (
        <button className="btn btn-primary btn-block btn-sm mt-2" onClick={() => onPrimary(task)}>
          {t('interested')}
        </button>
      )}

      {variant === 'mine' && role === 'customer' && task.status === 'published' && (
        <button className="btn btn-outline btn-block btn-sm mt-2" onClick={() => onPrimary(task)}>
          {primaryLabel || t('view_applicants')}
        </button>
      )}

      {variant === 'mine' && task.status === 'wip' && (
        <button className="btn btn-success btn-block btn-sm mt-2" onClick={() => onChat(task)}>
          {t('open_chat')}
        </button>
      )}
    </div>
  );
}
