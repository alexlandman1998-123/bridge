export const isSnagResolved = status => ['resolved', 'closed', 'completed'].includes(String(status || '').trim().toLowerCase())

function dateValue(value) {
  if (!value) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number)
    const date = new Date(year, month - 1, day)
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function getSnagCountdown({ handoverDate, periodDays, deadline, now = Date.now() }) {
  const handover = dateValue(handoverDate)
  let end = dateValue(deadline)
  if (!end) {
    if (!handover) return { state: 'no-handover', label: 'Handover not recorded' }
    if (!Number.isInteger(Number(periodDays)) || Number(periodDays) <= 0) return { state: 'no-period', label: 'Snag period not set' }
    end = new Date(handover)
    end.setDate(end.getDate() + Number(periodDays))
  }
  const remaining = end.getTime() - Number(now)
  if (handover && handover.getTime() > Number(now)) return { state: 'scheduled', label: 'Starts at handover', deadline: end }
  if (remaining <= 0) return { state: 'expired', label: 'Period ended', deadline: end, remaining: 0 }
  const minutes = Math.ceil(remaining / 60000)
  return { state: remaining <= 7 * 86400000 ? 'closing' : 'active', deadline: end, remaining, days: Math.floor(minutes / 1440), hours: Math.floor(minutes % 1440 / 60), minutes: minutes % 60 }
}

export function groupDevelopmentSnags(issues = []) {
  const groups = new Map()
  const seen = new Set()
  for (const issue of issues) {
    if (!issue.id || seen.has(issue.id)) continue
    seen.add(issue.id)
    const key = `${issue.unit_id || issue.id}:${issue.transaction_id || issue.buyer_id || 'unassigned'}`
    if (!groups.has(key)) groups.set(key, { id: key, unit: issue.unit, owner: issue.buyer, handover: issue.handover, unitId: issue.unit_id, transactionId: issue.transaction_id, issues: [] })
    groups.get(key).issues.push(issue)
  }
  return [...groups.values()].map(group => ({
    ...group,
    openCount: group.issues.filter(issue => !isSnagResolved(issue.status)).length,
    resolvedCount: group.issues.filter(issue => isSnagResolved(issue.status)).length,
    latestSubmission: group.issues.reduce((latest, issue) => issue.created_at > latest ? issue.created_at : latest, ''),
  })).sort((a, b) => b.latestSubmission.localeCompare(a.latestSubmission))
}
