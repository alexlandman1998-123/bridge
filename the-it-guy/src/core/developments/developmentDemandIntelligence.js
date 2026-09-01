const key = (value) => String(value || '').trim().toLowerCase()
const label = (value) => String(value || '').trim()
const isAvailable = (unit = {}) => !/sold|reserved|hold|unreleased|not released/i.test(String(unit.status || unit.transactionStage || ''))

export function buildDevelopmentDemandIntelligence({ units = [], leads = [] } = {}) {
  const stockByType = new Map()
  units.filter(isAvailable).forEach((unit) => {
    const name = label(unit.unitType || unit.unit_type) || 'Unclassified stock'
    const typeKey = key(name)
    const current = stockByType.get(typeKey) || { type: name, available: 0, leadInterest: 0 }
    stockByType.set(typeKey, { ...current, available: current.available + 1 })
  })
  let unclassifiedLeadInterest = 0
  leads.forEach((lead) => {
    const name = label(lead.unitTypeInterest || lead.unit_type_interest)
    if (!name) { unclassifiedLeadInterest += 1; return }
    const typeKey = key(name)
    const current = stockByType.get(typeKey) || { type: name, available: 0, leadInterest: 0 }
    stockByType.set(typeKey, { ...current, leadInterest: current.leadInterest + 1 })
  })
  const rows = [...stockByType.values()].map((row) => ({
    ...row,
    demandPerAvailable: row.available ? Number((row.leadInterest / row.available).toFixed(1)) : row.leadInterest,
    signal: row.available === 0 && row.leadInterest ? 'no_stock' : row.leadInterest > row.available ? 'tight' : row.leadInterest ? 'active' : 'quiet',
  })).sort((left, right) => right.demandPerAvailable - left.demandPerAvailable || right.leadInterest - left.leadInterest || left.type.localeCompare(right.type))
  return { rows, unclassifiedLeadInterest, totalLeadInterest: leads.length, tightTypes: rows.filter((row) => row.signal === 'tight' || row.signal === 'no_stock') }
}
