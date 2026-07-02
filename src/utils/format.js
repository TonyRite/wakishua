// Shared display formatters.

export function formatExpiry(expiryDate, t) {
  if (!expiryDate) return '';
  const diff = new Date(expiryDate.replace(' ', 'T') + 'Z') - new Date();
  if (diff <= 0) return t ? t('expires') : 'Expired';
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

// Milliseconds until a post expires (negative once expired). Server timestamps are
// UTC "YYYY-MM-DD HH:MM:SS", so normalise to ISO + 'Z'.
export function msUntilExpiry(expiryDate) {
  if (!expiryDate) return Infinity;
  return new Date(expiryDate.replace(' ', 'T') + 'Z') - new Date();
}

// Compact "time since posted", e.g. "5m", "2h", "3d".
export function formatAgo(dateStr, t) {
  if (!dateStr) return '';
  const diff = new Date() - new Date(dateStr.replace(' ', 'T') + 'Z');
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t ? t('time_now') : 'just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

export function formatBudget(task, t) {
  if (task.budget_amount) return `TZS ${Number(task.budget_amount).toLocaleString()}`;
  return t ? t('flexible') : 'Flexible';
}

export function categoryLabel(category, t) {
  const key = `cat_${category}`;
  const label = t(key);
  return label === key ? category : label;
}

export function badgeClass(status) {
  if (status === 'published') return 'badge-green';
  if (status === 'wip') return 'badge-blue';
  if (status === 'completed') return 'badge-green';
  return 'badge-orange';
}
