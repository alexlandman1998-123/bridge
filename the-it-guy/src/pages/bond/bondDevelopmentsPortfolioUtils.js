function normalizeText(value) {
  return String(value || '').trim()
}

const RISK_ORDER = { high: 3, medium: 2, low: 1 }

export function filterAndSortDevelopments(developments = [], filters = {}) {
  const search = normalizeText(filters.search).toLowerCase()
  const status = normalizeText(filters.status)
  const developer = normalizeText(filters.developer)
  const branch = normalizeText(filters.branch)
  const risk = normalizeText(filters.risk).toLowerCase()

  const filtered = developments.filter((development) => {
    const haystack = [
      development.name,
      development.developerName,
      development.location,
      development.branchName,
      development.consultantName,
      development.status,
    ].map((item) => normalizeText(item).toLowerCase()).join(' ')
    if (search && !haystack.includes(search)) return false
    if (status && status !== 'all' && normalizeText(development.status).toLowerCase() !== status.toLowerCase()) return false
    if (developer && developer !== 'all' && normalizeText(development.developerName) !== developer) return false
    if (branch && branch !== 'all' && normalizeText(development.branchName) !== branch) return false
    if (risk && risk !== 'all' && normalizeText(development.riskLevel).toLowerCase() !== risk) return false
    return true
  })

  return [...filtered].sort((left, right) => {
    if (filters.sort === 'Pipeline Value') return Number(right.pipelineValue || 0) - Number(left.pipelineValue || 0)
    if (filters.sort === 'Most Applications') return Number(right.activeApplications || 0) - Number(left.activeApplications || 0)
    if (filters.sort === 'Highest Risk') return (RISK_ORDER[right.riskLevel] || 0) - (RISK_ORDER[left.riskLevel] || 0)
    if (filters.sort === 'Lowest Approval Rate') {
      const leftRate = left.approvalRate === null || left.approvalRate === undefined ? 101 : Number(left.approvalRate)
      const rightRate = right.approvalRate === null || right.approvalRate === undefined ? 101 : Number(right.approvalRate)
      return leftRate - rightRate
    }
    return new Date(right.lastActivityAt || 0) - new Date(left.lastActivityAt || 0)
  })
}
