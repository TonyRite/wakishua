import React from 'react';
import { useT } from '../i18n/LanguageContext.jsx';

// Used both in the directory and in the interested-helpers sheet.
export default function ProviderCard({ provider, action, footer }) {
  const { t } = useT();
  const verified = provider.verification_status === 'verified';

  return (
    <div className="provider-card">
      <div className="provider-row">
        <div className="provider-pfp" aria-hidden="true">👤</div>
        <div className="provider-text-meta">
          <h4>
            {provider.name}
            {verified && <span className="verify-badge" title={t('verified')}>✓</span>}
          </h4>
          <p className="provider-tagline">
            ⭐ {provider.rating_avg} · {t('jobs_completed', { n: provider.jobs_completed })}
          </p>
        </div>
      </div>

      <div className="card-meta-grid">
        {provider.distance_km != null && <div className="meta-item">📍 {provider.distance_km} km</div>}
        <div className="meta-item">⏱️ {t('responds_in', { mins: provider.response_time_mins })}</div>
      </div>

      {action}
      {footer}
    </div>
  );
}
