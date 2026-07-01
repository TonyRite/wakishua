import React from 'react';
import { formatExpiry, categoryLabel } from '../utils/format.js';

// A public post — either a help request or a service offer. Contact details are
// shown directly (no-auth MVP), so people can reach each other immediately.
export default function PostCard({ post, t }) {
  const isOffer = post.post_type === 'offer';
  const budget = post.budget_amount
    ? `TZS ${Number(post.budget_amount).toLocaleString()}`
    : t('flexible');
  const telHref = `tel:${(post.contact_phone || '').replace(/\s+/g, '')}`;

  return (
    <article className={`post-card ${isOffer ? 'post-card-offer' : 'post-card-need'}`}>
      <div className="post-card-top">
        <span className={`post-badge ${isOffer ? 'post-badge-offer' : 'post-badge-need'}`}>
          {isOffer ? t('badge_offer') : t('badge_need')}
        </span>
        <span className="post-time" aria-label="time left">⏳ {formatExpiry(post.expires_at, t)}</span>
      </div>

      <h3 className="post-title">{post.title}</h3>

      {post.category && (
        <span className="post-cat">{categoryLabel(post.category, t)}</span>
      )}

      {post.details && <p className="post-details">{post.details}</p>}

      <div className="post-meta">
        <span>📍 {post.location_name || t('nearby_area')}{post.distance_km != null ? ` · ${post.distance_km} km` : ''}</span>
        <span>💰 {budget}</span>
      </div>

      <div className="post-contact">
        <div className="post-contact-who">
          <span className="post-contact-name">{post.contact_name || t('badge_customer')}</span>
          <span className="post-contact-phone">{post.contact_phone}</span>
        </div>
        <a className="btn btn-primary btn-sm" href={telHref}>{t('call')}</a>
      </div>
    </article>
  );
}
