function normalizeNumber(value = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function formatPercent(value = 0) {
  return `${Math.round(normalizeNumber(value))}%`
}

function formatDaysFromHours(value = 0) {
  const days = Math.round((normalizeNumber(value) / 24) * 10) / 10
  return `${days} days`
}

function strongestRegion(regionalRows = []) {
  return [...regionalRows].sort((left, right) => normalizeNumber(right.applications) - normalizeNumber(left.applications))[0] || null
}

export function buildBankRelationshipInsights(model = {}) {
  const rows = Array.isArray(model.performanceMatrix) ? model.performanceMatrix : []
  const regionalRows = Array.isArray(model.regionalPerformance) ? model.regionalPerformance : []
  const insights = []
  const best = [...rows].filter((row) => normalizeNumber(row.applications) > 0).sort((left, right) => normalizeNumber(right.healthScore) - normalizeNumber(left.healthScore))[0]
  const fastest = [...rows].filter((row) => normalizeNumber(row.averageResponseTime) > 0).sort((left, right) => normalizeNumber(left.averageResponseTime) - normalizeNumber(right.averageResponseTime))[0]
  const mostUsed = [...rows].filter((row) => normalizeNumber(row.applications) > 0).sort((left, right) => normalizeNumber(right.applications) - normalizeNumber(left.applications))[0]
  const highestRevenue = [...rows].filter((row) => normalizeNumber(row.revenueGenerated) > 0).sort((left, right) => normalizeNumber(right.revenueGenerated) - normalizeNumber(left.revenueGenerated))[0]
  const risk = [...rows].filter((row) => ['Poor', 'Critical'].includes(row.healthStatus)).sort((left, right) => normalizeNumber(left.healthScore) - normalizeNumber(right.healthScore))[0]
  const region = strongestRegion(regionalRows)

  if (best) {
    insights.push({
      id: 'best-bank',
      tone: 'positive',
      title: `${best.bankName} is the strongest current banking relationship.`,
      description: `Health score ${Math.round(normalizeNumber(best.healthScore))}, approval rate ${formatPercent(best.approvalRate)}.`,
    })
  }

  if (fastest) {
    insights.push({
      id: 'fastest-bank',
      tone: 'positive',
      title: `${fastest.bankName} is responding fastest.`,
      description: `Average response time is ${formatDaysFromHours(fastest.averageResponseTime)} across scoped applications.`,
    })
  }

  if (mostUsed) {
    insights.push({
      id: 'most-used-bank',
      tone: 'neutral',
      title: `${mostUsed.bankName} receives the highest application volume.`,
      description: `${mostUsed.applications} applications are currently linked to this bank.`,
    })
  }

  if (highestRevenue) {
    insights.push({
      id: 'highest-revenue-bank',
      tone: 'positive',
      title: `${highestRevenue.bankName} is generating the highest bank revenue.`,
      description: `Estimated revenue is based on approved applications and the configured platform revenue per successful bond.`,
    })
  }

  if (risk) {
    insights.push({
      id: 'risk-bank',
      tone: 'warning',
      title: `${risk.bankName} requires relationship attention.`,
      description: `${risk.escalations} escalations and a ${formatPercent(risk.approvalRate)} approval rate are pulling health down.`,
    })
  }

  if (region) {
    insights.push({
      id: 'regional-volume',
      tone: 'neutral',
      title: `${region.regionName} is the highest-volume regional bank market.`,
      description: `${region.applications} bank applications are visible in this region-bank segment.`,
    })
  }

  if (!insights.length) {
    insights.push({
      id: 'no-insights',
      tone: 'neutral',
      title: 'Bank relationship insights will appear once applications move through banks.',
      description: 'The rules engine needs scoped applications, approvals, response times, or escalations to generate observations.',
    })
  }

  return insights.slice(0, 6)
}
