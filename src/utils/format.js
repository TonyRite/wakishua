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
