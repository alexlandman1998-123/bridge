export function formatNumber(value, suffix = '') {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return suffix ? `0 ${suffix}` : '0'
  return `${new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 0 }).format(parsed)}${suffix ? ` ${suffix}` : ''}`
}

export function formatCurrency(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return '-'
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(parsed)
}

export function formatDate(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

export function formatList(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join(', ') || '-'
  return value || '-'
}

export function titleize(value) {
  return String(value || '-')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
}
