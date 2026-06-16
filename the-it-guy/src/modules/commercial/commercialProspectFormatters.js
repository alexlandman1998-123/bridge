export function normalizeText(value) {
  return String(value ?? '').trim()
}

export function normalizeKey(value) {
  return normalizeText(value).toLowerCase()
}

export function formatCurrencyZAR(value, { compact = true } = {}) {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount <= 0) return 'R0'

  if (!compact) {
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: 'ZAR',
      maximumFractionDigits: 0,
    }).format(amount)
  }

  const absAmount = Math.abs(amount)
  const sign = amount < 0 ? '-' : ''
  if (absAmount >= 1_000_000_000) return `${sign}R${(absAmount / 1_000_000_000).toFixed(2).replace(/\.00$/, '')}B`
  if (absAmount >= 1_000_000) return `${sign}R${(absAmount / 1_000_000).toFixed(2).replace(/0$/, '').replace(/\.00$/, '')}M`
  if (absAmount >= 1_000) return `${sign}R${(absAmount / 1_000).toFixed(1).replace(/\.0$/, '')}K`
  return `${sign}R${new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 0 }).format(absAmount)}`
}

export function formatPercentage(value, { signed = false, precision = 0 } = {}) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '0%'
  const prefix = signed && amount > 0 ? '+' : ''
  return `${prefix}${amount.toFixed(precision).replace(/\.0+$/, '')}%`
}

export function calculateMonthDelta(current = 0, previous = 0) {
  const next = Number(current)
  const before = Number(previous)
  if (!Number.isFinite(next) || !Number.isFinite(before) || before <= 0) return 0
  return Math.round(((next - before) / before) * 100)
}

export function formatShortDate(value) {
  if (!value) return 'No date set'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'No date set'
  return parsed.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatRelativeDate(value) {
  if (!value) return 'No date set'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'No date set'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(parsed)
  target.setHours(0, 0, 0, 0)
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  if (diffDays === -1) return 'Yesterday'
  if (diffDays > 0 && diffDays < 7) return `In ${diffDays} days`
  if (diffDays < 0 && diffDays > -7) return `${Math.abs(diffDays)} days ago`
  return formatShortDate(value)
}

export function formatRelativeTime(value) {
  if (!value) return 'No activity yet'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'No activity yet'
  const diffMs = Date.now() - parsed.getTime()
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  if (diffMs < minute) return 'Just now'
  if (diffMs < hour) {
    const minutes = Math.max(1, Math.round(diffMs / minute))
    return `${minutes} min ago`
  }
  if (diffMs < day) {
    const hours = Math.max(1, Math.round(diffMs / hour))
    return `${hours} hour${hours === 1 ? '' : 's'} ago`
  }
  const days = Math.max(1, Math.round(diffMs / day))
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`
  return formatShortDate(value)
}

