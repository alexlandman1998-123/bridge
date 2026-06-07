const BANKS = ['FNB', 'Nedbank', 'ABSA', 'Standard Bank', 'Investec']
const PARTNER_TYPES = ['Agency', 'Developer', 'Attorney', 'Bank']

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function toNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function toSlug(value = '') {
  return normalizeLower(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function stableIndex(value = '', size = 1) {
  const source = normalizeText(value) || 'regional-command'
  const total = [...source].reduce((sum, char) => sum + char.charCodeAt(0), 0)
  return Math.abs(total) % Math.max(1, size)
}

function percent(part = 0, total = 0) {
  return total ? Math.round((toNumber(part) / Math.max(1, toNumber(total))) * 100) : 0
}

function average(values = []) {
  const safe = values.map(Number).filter((value) => Number.isFinite(value) && value > 0)
  if (!safe.length) return 0
  return Math.round((safe.reduce((sum, value) => sum + value, 0) / safe.length) * 10) / 10
}

function addDays(date = new Date(), days = 0) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function daysBetween(start = '', end = new Date()) {
  const startDate = new Date(start || '')
  const endDate = new Date(end || '')
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 0
  return Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86400000))
}

function getId(row = {}) {
  return normalizeText(row.id || row.regionId || row.region_id || row.branchId || row.branch_id || row.userId || row.user_id || row.email)
}

function getRegionId(row = {}) {
  return normalizeText(row.regionId || row.region_id || row.assignedRegionId || row.assigned_region_id)
}

function getBranchId(row = {}) {
  return normalizeText(row.branchId || row.branch_id || row.assignedBranchId || row.assigned_branch_id || row.workspaceUnitId || row.workspace_unit_id || row.id)
}

function getConsultantId(row = {}) {
  return normalizeText(row.consultantId || row.assignedConsultantId || row.assigned_consultant_id || row.assignedUserId || row.assigned_user_id || row.userId || row.user_id || row.id)
}

function getSignal(row = {}) {
  return normalizeLower([
    row.status,
    row.stage,
    row.financeStatus,
    row.finance_status,
    row.financeStageKey,
    row.finance_stage_key,
    row.financeStageLabel,
    row.registrationStatus,
    row.nextAction,
    row.next_action,
    row.bankStatus,
    row.bank_status,
    row.documentStatus,
    row.document_status,
    row.transaction?.stage,
    row.transaction?.finance_status,
    row.transaction?.lifecycle_state,
  ].filter(Boolean).join(' '))
}

function isApproved(row = {}) {
  const signal = getSignal(row)
  return signal.includes('approved') || signal.includes('grant') || signal.includes('accepted') || signal.includes('registered')
}

function isDeclined(row = {}) {
  const signal = getSignal(row)
  return signal.includes('declined') || signal.includes('rejected') || signal.includes('lost')
}

function isSubmitted(row = {}) {
  const signal = getSignal(row)
  return signal.includes('submitted') || signal.includes('submission') || signal.includes('bank') || signal.includes('feedback') || isApproved(row) || isDeclined(row)
}

function isActive(row = {}) {
  const signal = getSignal(row)
  if (row.active === false || row.is_active === false) return false
  return !['archived', 'cancelled', 'canceled', 'completed', 'registered', 'declined', 'rejected', 'lost'].some((term) => signal.includes(term))
}

function hasPendingDocs(row = {}) {
  const signal = getSignal(row)
  return getPendingDocumentCount(row) > 0 || signal.includes('doc') || signal.includes('payslip') || signal.includes('statement') || signal.includes('missing')
}

function getPendingDocumentCount(row = {}) {
  const explicit = toNumber(
    row.pendingDocumentCount ??
      row.pendingDocuments ??
      row.pendingDocs ??
      row.missingDocumentsCount ??
      row.missing_documents_count ??
      row.documentsMissing ??
      row.documents_missing,
    Number.NaN,
  )
  if (Number.isFinite(explicit)) return explicit
  const signal = getSignal(row)
  if (signal.includes('statement')) return 2
  if (signal.includes('payslip') || signal.includes('income')) return 1
  if (signal.includes('doc') || signal.includes('missing')) return 1
  return 0
}

function getMoney(row = {}, keys = []) {
  for (const key of keys) {
    const value = key.split('.').reduce((source, part) => source?.[part], row)
    const number = toNumber(value, Number.NaN)
    if (Number.isFinite(number) && number > 0) return number
  }
  return 0
}

function getPipelineValue(row = {}) {
  return getMoney(row, [
    'pipelineValue',
    'pipeline_value',
    'bondAmount',
    'bond_amount',
    'loanAmount',
    'loan_amount',
    'purchasePrice',
    'purchase_price',
    'transaction.purchase_price',
    'transaction.sales_price',
    'transaction.bond_amount',
    'unit.price',
  ])
}

function getRevenueValue(row = {}) {
  const explicit = getMoney(row, [
    'forecastRevenue',
    'forecast_revenue',
    'estimatedRevenue',
    'estimated_revenue',
    'revenue',
    'grossCommissionAmount',
    'gross_commission_amount',
    'bondCommissionAmount',
    'bond_commission_amount',
  ])
  if (explicit) return explicit
  const pipeline = getPipelineValue(row)
  return pipeline ? Math.round(pipeline * 0.0205) : 0
}

function getDate(row = {}, fallbackOffset = 0) {
  const raw = normalizeText(row.lastActivityAt || row.updatedAt || row.updated_at || row.submittedAt || row.submitted_at || row.createdAt || row.created_at || row.transaction?.updated_at || row.transaction?.created_at)
  if (raw && !Number.isNaN(new Date(raw).getTime())) return raw
  return addDays(new Date('2026-06-07T08:30:00.000Z'), -fallbackOffset).toISOString()
}

function getClientName(row = {}, index = 0) {
  return normalizeText(row.client || row.clientName || row.buyerName || row.buyer?.name || row.applicantName || row.applicant?.fullName) || `Client ${index + 1}`
}

function getApplicationStage(row = {}) {
  const signal = getSignal(row)
  if (isApproved(row)) return 'Approved'
  if (isDeclined(row)) return 'Declined'
  if (signal.includes('feedback')) return 'Bank Feedback'
  if (signal.includes('submitted')) return 'Submitted'
  if (hasPendingDocs(row)) return 'Documents'
  if (signal.includes('condition')) return 'Conditions'
  if (signal.includes('review')) return 'Review'
  return normalizeText(row.financeStageLabel || row.status || row.stage) || 'In Progress'
}

function getBankName(row = {}, seed = '') {
  return normalizeText(row.bankName || row.bank_name || row.bank || row.lenderName || row.lender_name || row.transaction?.bank_name || row.transaction?.bank) || BANKS[stableIndex(seed, BANKS.length)]
}

function getPartnerName(row = {}, seed = '') {
  return normalizeText(row.partnerName || row.partner_name || row.agencyName || row.agency_name || row.developmentName || row.development_name || row.referralPartnerName || row.referral_partner_name) || `Regional Partner ${stableIndex(seed, 6) + 1}`
}

function getPartnerType(row = {}, seed = '') {
  return normalizeText(row.partnerType || row.partner_type || row.sourceType || row.source_type) || PARTNER_TYPES[stableIndex(seed, PARTNER_TYPES.length)]
}

function enrichApplication(row = {}, index = 0, context = {}) {
  const id = normalizeText(row.id || row.applicationId || row.application_id || row.transactionId || row.transaction_id || row.key) || `regional-app-${index + 1}`
  const branch = context.branchById?.get(getBranchId(row)) || {}
  const consultant = context.consultantById?.get(getConsultantId(row)) || {}
  const createdAt = normalizeText(row.createdAt || row.created_at || row.transaction?.created_at) || addDays(new Date('2026-06-07T08:30:00.000Z'), -(index + 6)).toISOString()
  const lastActivityAt = getDate(row, index + 1)
  const ageDays = daysBetween(createdAt, new Date('2026-06-07T10:30:00.000Z'))
  const pendingDocuments = getPendingDocumentCount(row)
  const stage = getApplicationStage(row)
  const bankName = getBankName(row, id)
  return {
    ...row,
    id,
    client: getClientName(row, index),
    branchId: getBranchId(row) || getId(branch),
    branch: normalizeText(row.branch || row.branchName || branch.branch || branch.name) || 'Unassigned Branch',
    consultantId: getConsultantId(row) || getId(consultant),
    consultant: normalizeText(row.consultant || row.consultantName || consultant.consultant || consultant.name) || 'Unassigned',
    partnerName: getPartnerName(row, id),
    partnerType: getPartnerType(row, id),
    stage,
    bankName,
    bankStatus: normalizeText(row.bankStatus || row.bank_status) || (isApproved(row) ? 'Approved' : isDeclined(row) ? 'Declined' : isSubmitted(row) ? 'In bank review' : 'Not submitted'),
    pendingDocuments,
    documentStatus: pendingDocuments ? `${pendingDocuments} missing` : 'Complete',
    submitted: isSubmitted(row),
    approved: isApproved(row),
    declined: isDeclined(row),
    active: isActive(row),
    attentionNeeded: pendingDocuments > 0 || ageDays > 30 || getSignal(row).includes('condition') || daysBetween(lastActivityAt, new Date('2026-06-07T10:30:00.000Z')) >= 7,
    ageDays,
    lastActivityAt,
    lastActivityLabel: normalizeText(row.lastActivityLabel) || `${daysBetween(lastActivityAt, new Date('2026-06-07T10:30:00.000Z'))} days ago`,
    nextAction: normalizeText(row.nextAction || row.next_action) || (pendingDocuments ? 'Request outstanding documents' : isSubmitted(row) ? 'Monitor bank feedback' : 'Prepare for submission'),
    turnaroundDays: toNumber(row.turnaroundDays || row.turnaround_days || row.averageTurnaround || row.avgLeadTime, 0) || Math.min(48, Math.max(7, ageDays)),
    pipelineValue: getPipelineValue(row),
    revenueForecast: getRevenueValue(row),
  }
}

export function getRegionById(regionId = '', snapshot = {}) {
  const key = normalizeText(regionId)
  const slug = toSlug(key)
  if (!key) return null
  const regions = snapshot.regions || []
  const performance = snapshot.regionPerformance || []
  const matchedRegion = [...regions, ...performance].find((region) => {
    const id = normalizeText(region.id || region.regionId)
    const name = normalizeText(region.name || region.region)
    return id === key || name === key || toSlug(id) === slug || toSlug(name) === slug
  })
  if (matchedRegion) return matchedRegion

  return {
    id: key,
    name: key,
    region: key,
    derived: true,
  }
}

export function getBranchesByRegion(regionId = '', snapshot = {}) {
  const region = getRegionById(regionId, snapshot)
  if (!region) return []
  const regionKey = normalizeText(region.id || region.regionId)
  const regionName = normalizeText(region.name || region.region)
  const byId = new Map()
  ;[...(snapshot.branchPerformance || []), ...(snapshot.branches || [])].forEach((branch) => {
    const branchId = getId(branch)
    if (!branchId || byId.has(branchId)) return
    const matches = getRegionId(branch) === regionKey || normalizeText(branch.region || branch.regionName) === regionName
    if (matches) {
      byId.set(branchId, {
        ...branch,
        id: branchId,
        branchId,
        branchName: normalizeText(branch.branchName || branch.branch || branch.name) || 'Branch',
        regionId: regionKey,
        regionName,
      })
    }
  })
  return [...byId.values()]
}

export function getApplicationsByRegion(regionId = '', snapshot = {}) {
  const region = getRegionById(regionId, snapshot)
  if (!region) return []
  const branches = getBranchesByRegion(regionId, snapshot)
  const branchIds = new Set(branches.map((branch) => normalizeText(branch.id || branch.branchId)).filter(Boolean))
  const regionKey = normalizeText(region.id || region.regionId)
  const regionName = normalizeText(region.name || region.region)
  const branchById = new Map(branches.map((branch) => [normalizeText(branch.id || branch.branchId), branch]))
  const consultants = snapshot.consultantPerformance || snapshot.consultants || []
  const consultantById = new Map(consultants.map((consultant) => [getId(consultant), consultant]))
  return (snapshot.applications || [])
    .filter((row) => (
      getRegionId(row) === regionKey ||
      normalizeText(row.region || row.regionName) === regionName ||
      branchIds.has(getBranchId(row))
    ))
    .map((row, index) => enrichApplication(row, index, { branchById, consultantById }))
}

export function getConsultantsByRegion(regionId = '', snapshot = {}) {
  const branches = getBranchesByRegion(regionId, snapshot)
  const branchIds = new Set(branches.map((branch) => normalizeText(branch.id || branch.branchId)).filter(Boolean))
  const apps = getApplicationsByRegion(regionId, snapshot)
  const appsByConsultant = new Map()
  apps.forEach((app) => {
    const key = normalizeText(app.consultantId) || normalizeLower(app.consultant)
    if (!key) return
    appsByConsultant.set(key, [...(appsByConsultant.get(key) || []), app])
  })
  return (snapshot.consultantPerformance || snapshot.consultants || [])
    .filter((consultant) => (
      branchIds.has(normalizeText(consultant.branchId || consultant.branch_id || consultant.workspaceUnitId || consultant.workspace_unit_id)) ||
      appsByConsultant.has(getId(consultant)) ||
      appsByConsultant.has(normalizeLower(consultant.consultant || consultant.name))
    ))
    .map((consultant) => {
      const keyRows = appsByConsultant.get(getId(consultant)) || appsByConsultant.get(normalizeLower(consultant.consultant || consultant.name)) || []
      const rows = keyRows.length ? keyRows : apps.filter((app) => normalizeText(app.branchId) === normalizeText(consultant.branchId))
      const submitted = rows.filter((row) => row.submitted)
      const approved = rows.filter((row) => row.approved)
      const activeApplications = rows.filter((row) => row.active).length || toNumber(consultant.activeApplications)
      const capacityPercent = Math.round((activeApplications / 25) * 100)
      return {
        ...consultant,
        id: getId(consultant) || normalizeLower(consultant.consultant || consultant.name),
        consultant: normalizeText(consultant.consultant || consultant.name) || 'Consultant',
        branch: normalizeText(consultant.branch || consultant.branchName) || branches.find((branch) => normalizeText(branch.id) === normalizeText(consultant.branchId))?.branchName || 'Unassigned',
        activeApplications,
        submittedApplications: submitted.length || toNumber(consultant.submittedApplications),
        approvalRate: submitted.length ? percent(approved.length, submitted.length) : toNumber(consultant.approvalRate, 0),
        averageTurnaround: average(rows.map((row) => row.turnaroundDays)) || toNumber(consultant.averageTurnaround || consultant.avgLeadTime),
        pendingDocuments: rows.reduce((sum, row) => sum + toNumber(row.pendingDocuments), 0) || toNumber(consultant.pendingDocuments || consultant.pendingDocs),
        overdueApplications: rows.filter((row) => row.ageDays > 30).length,
        revenueContribution: rows.reduce((sum, row) => sum + row.revenueForecast, 0),
        capacityPercent,
        capacityStatus: capacityPercent >= 100 ? 'Over Capacity' : capacityPercent >= 80 ? 'High' : capacityPercent <= 35 ? 'Low' : 'Medium',
      }
    })
}

export function getPartnersByRegion(regionId = '', snapshot = {}) {
  const apps = getApplicationsByRegion(regionId, snapshot)
  const explicitPartners = snapshot.partnerPerformance || []
  const byName = new Map()
  apps.forEach((app) => {
    const key = normalizeText(app.partnerName) || 'Regional Partner'
    const existing = byName.get(key) || {
      id: normalizeLower(key).replace(/[^a-z0-9]+/g, '-'),
      partnerName: key,
      partnerType: app.partnerType,
      applications: [],
    }
    existing.applications.push(app)
    byName.set(key, existing)
  })
  explicitPartners.forEach((partner) => {
    const key = normalizeText(partner.name || partner.partnerName)
    if (!key || byName.has(key)) return
    byName.set(key, { id: getId(partner) || toSlug(key), partnerName: key, partnerType: partner.type || partner.partnerType || 'Agency', applications: [] })
  })
  return [...byName.values()].map((partner) => {
    const rows = partner.applications || []
    const submitted = rows.filter((row) => row.submitted)
    const approved = rows.filter((row) => row.approved)
    const healthScore = rows.length ? Math.max(52, Math.min(96, percent(approved.length + rows.filter((row) => !row.attentionNeeded).length, Math.max(1, rows.length * 2)))) : 72
    return {
      ...partner,
      referrals: rows.length,
      applicationsContributed: rows.length,
      conversionRate: submitted.length ? percent(approved.length, submitted.length) : rows.length ? 45 + stableIndex(partner.partnerName, 38) : 0,
      activeApplications: rows.filter((row) => row.active).length,
      revenueContribution: rows.reduce((sum, row) => sum + row.revenueForecast, 0),
      lastActivity: rows[0]?.lastActivityLabel || 'No recent activity',
      healthScore,
      healthStatus: healthScore >= 80 ? 'Strong' : healthScore >= 65 ? 'Watch' : 'Needs Attention',
    }
  }).sort((left, right) => right.applicationsContributed - left.applicationsContributed || right.revenueContribution - left.revenueContribution)
}

export function getRegionBankMix(regionId = '', snapshot = {}) {
  const apps = getApplicationsByRegion(regionId, snapshot).filter((row) => row.submitted || row.approved)
  const total = Math.max(1, apps.length)
  const rows = [...apps.reduce((map, app) => {
    const bank = normalizeText(app.bankName) || 'Other'
    map.set(bank, [...(map.get(bank) || []), app])
    return map
  }, new Map()).entries()]
    .map(([bank, bankRows]) => ({
      bank,
      count: bankRows.length,
      approvals: bankRows.filter((row) => row.approved).length,
      approvalRate: percent(bankRows.filter((row) => row.approved).length, bankRows.length),
      share: percent(bankRows.length, total),
      avgLeadTime: average(bankRows.map((row) => row.turnaroundDays)),
    }))
    .sort((left, right) => right.approvals - left.approvals || right.count - left.count)
  return rows.length ? rows : BANKS.slice(0, 4).map((bank, index) => ({ bank, count: 0, approvals: 0, approvalRate: 0, share: index === 0 ? 100 : 0, avgLeadTime: 0 }))
}

export function getRegionPerformanceTrend(regionId = '', snapshot = {}) {
  const metrics = getRegionOverviewMetrics(regionId, snapshot)
  const baseApproval = metrics.approvalRate || 62
  const baseRevenue = metrics.revenueForecast || 120000
  return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'].map((month, index) => ({
    month,
    approvalRate: Math.max(35, Math.min(95, baseApproval - 10 + index * 2 + (index % 2 ? 1 : -1))),
    revenue: Math.round(baseRevenue * (0.68 + index * 0.07)),
    applications: Math.max(1, Math.round((metrics.activeApplications || 12) * (0.68 + index * 0.08))),
    turnaround: Math.max(7, Math.round((metrics.averageTurnaround || 28) + 4 - index * 0.9)),
  }))
}

export function getRegionRiskAlerts(regionId = '', snapshot = {}) {
  const apps = getApplicationsByRegion(regionId, snapshot)
  const branches = getBranchesByRegion(regionId, snapshot)
  const consultants = getConsultantsByRegion(regionId, snapshot)
  const overdue = apps.filter((row) => row.ageDays > 30).length
  const missingDocs = apps.reduce((sum, row) => sum + toNumber(row.pendingDocuments), 0)
  const belowTargetBranch = branches.find((branch) => toNumber(branch.approvalRate, 100) < 65)
  const overCapacity = consultants.filter((consultant) => normalizeLower(consultant.capacityStatus).includes('over')).length
  return [
    { key: 'overdue', label: `${overdue} applications overdue > 30 days`, count: overdue, severity: overdue ? 'High' : 'Clear' },
    { key: 'documents', label: `${missingDocs} document items outstanding`, count: missingDocs, severity: missingDocs ? 'Medium' : 'Clear' },
    { key: 'branch-target', label: belowTargetBranch ? `${belowTargetBranch.branchName || belowTargetBranch.branch} below approval target` : 'No branch below approval target', count: belowTargetBranch ? 1 : 0, severity: belowTargetBranch ? 'Medium' : 'Clear' },
    { key: 'capacity', label: `${overCapacity} consultants over capacity`, count: overCapacity, severity: overCapacity ? 'High' : 'Clear' },
  ]
}

export function getRegionOverviewMetrics(regionId = '', snapshot = {}) {
  const apps = getApplicationsByRegion(regionId, snapshot)
  const branches = getBranchesByRegion(regionId, snapshot)
  const consultants = getConsultantsByRegion(regionId, snapshot)
  const partners = getPartnersByRegion(regionId, snapshot)
  const bankMix = getRegionBankMix(regionId, snapshot)
  const active = apps.filter((row) => row.active)
  const submitted = apps.filter((row) => row.submitted)
  const approved = apps.filter((row) => row.approved)
  const pendingDocuments = active.reduce((sum, row) => sum + toNumber(row.pendingDocuments), 0)
  const revenueForecast = active.reduce((sum, row) => sum + row.revenueForecast, 0)
  return {
    activeApplications: active.length,
    submittedApplications: submitted.length,
    pendingDocuments,
    approvalRate: submitted.length ? percent(approved.length, submitted.length) : percent(approved.length, apps.length),
    averageTurnaround: average(apps.map((row) => row.turnaroundDays)),
    revenueForecast,
    branches: branches.length,
    consultants: consultants.length,
    activePartners: partners.filter((partner) => normalizeLower(partner.healthStatus) !== 'disabled').length,
    banksActive: bankMix.filter((row) => row.count > 0).length || bankMix.length,
    topPerformingBank: bankMix[0]?.bank || 'Pending',
    topPerformingBankShare: bankMix[0]?.approvalRate || 0,
  }
}

export function buildRegionalCommandCentreViewModel(regionId = '', snapshot = {}) {
  const region = getRegionById(regionId, snapshot)
  if (!region) return null
  const resolvedRegionId = normalizeText(region.id || region.regionId || region.name || region.region)
  const branches = getBranchesByRegion(resolvedRegionId, snapshot)
  const applications = getApplicationsByRegion(resolvedRegionId, snapshot)
  const consultants = getConsultantsByRegion(resolvedRegionId, snapshot)
  const partners = getPartnersByRegion(resolvedRegionId, snapshot)
  const metrics = getRegionOverviewMetrics(resolvedRegionId, snapshot)
  const bankMix = getRegionBankMix(resolvedRegionId, snapshot)
  const trend = getRegionPerformanceTrend(resolvedRegionId, snapshot)
  const riskAlerts = getRegionRiskAlerts(resolvedRegionId, snapshot)
  const attention = {
    waitingOnDocuments: applications.filter(hasPendingDocs).length,
    overdue: applications.filter((row) => row.ageDays > 30).length,
    conditionsOutstanding: applications.filter((row) => getSignal(row).includes('condition')).length || Math.ceil(metrics.pendingDocuments / 3),
    stalled: applications.filter((row) => row.attentionNeeded && daysBetween(row.lastActivityAt, new Date('2026-06-07T10:30:00.000Z')) >= 7).length,
  }
  return {
    region: {
      id: resolvedRegionId,
      name: normalizeText(region.name || region.region) || resolvedRegionId || 'Region',
      code: normalizeText(region.code),
      manager: normalizeText(region.manager || region.managerName) || 'Unassigned',
      status: normalizeText(region.status) || 'active',
      derived: Boolean(region.derived || snapshot.derivedSources?.regions),
    },
    metrics,
    branches: branches.map((branch) => ({
      ...branch,
      activeApplications: toNumber(branch.activeApplications),
      approvalRate: toNumber(branch.approvalRate),
      averageTurnaround: toNumber(branch.averageTurnaround || branch.avgLeadTime),
      revenueForecast: toNumber(branch.forecastRevenue) || applications.filter((app) => normalizeText(app.branchId) === normalizeText(branch.id)).reduce((sum, app) => sum + app.revenueForecast, 0),
    })).sort((left, right) => right.activeApplications - left.activeApplications),
    applications: applications.sort((left, right) => Number(right.attentionNeeded) - Number(left.attentionNeeded) || right.ageDays - left.ageDays),
    consultants: consultants.sort((left, right) => right.activeApplications - left.activeApplications),
    partners,
    bankMix,
    trend,
    riskAlerts,
    attention,
    consultantCapacity: [
      { key: 'high', label: 'High capacity', count: consultants.filter((row) => ['low', 'medium'].includes(normalizeLower(row.capacityStatus))).length, color: '#2f9e62' },
      { key: 'medium', label: 'Medium capacity', count: consultants.filter((row) => normalizeLower(row.capacityStatus) === 'high').length, color: '#f59e0b' },
      { key: 'low', label: 'Low capacity', count: consultants.filter((row) => toNumber(row.activeApplications) <= 2).length, color: '#3b82f6' },
      { key: 'over', label: 'Over capacity', count: consultants.filter((row) => normalizeLower(row.capacityStatus).includes('over')).length, color: '#ef4444' },
    ],
    thinDataMessage: branches.length <= 1 || applications.length < 5
      ? 'This region is currently using branch-level demo data. Add more branches or applications to unlock deeper regional reporting.'
      : '',
  }
}
