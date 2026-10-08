const DAY_MS = 86_400_000

export function statisticsDate(value, label = 'date') {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label} must use YYYY-MM-DD.`)
  const date = new Date(`${value}T00:00:00Z`)
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error(`${label} must be a valid calendar date.`)
  return value
}

export function shiftStatisticsDate(value, days) {
  return new Date(Date.parse(`${statisticsDate(value)}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

export function listingStatisticsWindow({ days = 90, startDate, endDate, now = new Date() } = {}) {
  if (!Number.isInteger(days) || days < 1 || days > 90) throw new Error('days must be an integer between 1 and 90.')
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const part = (type) => parts.find((item) => item.type === type).value
  const yesterday = shiftStatisticsDate(`${part('year')}-${part('month')}-${part('day')}`, -1)
  const end = endDate ? statisticsDate(endDate, 'endDate') : yesterday
  const start = startDate ? statisticsDate(startDate, 'startDate') : shiftStatisticsDate(end, 1 - days)
  const length = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS) + 1
  if (length < 1 || length > 90 || end > yesterday) throw new Error('Statistics windows must contain 1–90 completed days.')
  return { startDate: start, endDate: end, days: length }
}

export function statisticsDays(window) {
  return Array.from({ length: window.days }, (_, index) => shiftStatisticsDate(window.startDate, index))
}
