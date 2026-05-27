import {
  getFinanceReadinessAnalytics,
  getFinanceReadinessSummary,
} from '../core/finance/financeReadinessSelectors'

export const FINANCE_INTELLIGENCE_DISCLAIMER =
  'Bridge operational insights are estimates based on workflow and onboarding data. Final financial approval remains subject to lender assessment and supporting documentation.'

const analyticsCache = new Map()

function text(value) {
  return String(value || '').trim()
}

function lower(value) {
  return text(value).toLowerCase()
}

function number(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, number(value)))
}

function timestamp(value) {
  const parsed = new Date(value || 0).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

function daysBetween(start, end = Date.now()) {
  const left = timestamp(start)
  const right = typeof end === 'number' ? end : timestamp(end)
  if (!left || !right || right < left) return 0
  return Math.floor((right - left) / 86400000)
}

function daysSince(value) {
  return daysBetween(value, Date.now())
}

function getTransaction(row = {}) {
  return row?.transaction || row || {}
}

function getFormData(row = {}) {
  const form = row?.onboardingFormData || row?.onboarding_form_data || row?.onboarding?.formData || row?.onboarding?.form_data || {}
  return form?.form_data || form?.formData || form
}

function getDocumentStats(row = {}) {
  const summary = row?.documentSummary || {}
  const requests = Array.isArray(row?.documentRequests) ? row.documentRequests : []
  const documents = Array.isArray(row?.documents) ? row.documents : []
  const total = number(summary.totalRequired, requests.length)
  const uploaded = number(summary.uploadedCount, documents.length)
  const rejected = requests.filter((item) => /reject|revise|declined/i.test(text(item.status || item.outcome))).length +
    documents.filter((item) => /reject|revise|declined/i.test(text(item.status || item.outcome))).length
  return {
    total,
    uploaded,
    missing: Number.isFinite(Number(summary.missingCount)) ? number(summary.missingCount) : Math.max(total - uploaded, 0),
    rejected,
    readiness: total ? clamp((uploaded / total) * 100) : 0,
  }
}

function getStageKey(row = {}) {
  const transaction = getTransaction(row)
  const stage = lower(transaction.current_main_stage || transaction.stage || row.stage)
  const nextAction = lower(transaction.next_action)
  if (/reg|registered/.test(stage)) return 'registration'
  if (/approval|approved|grant/.test(stage)) return 'approval'
  if (/feedback|bank/.test(stage) || nextAction.includes('bank')) return 'feedback'
  if (/submit|submitted/.test(stage)) return 'submission'
  if (/doc|document/.test(stage) || getDocumentStats(row).missing > 0) return 'docs'
  return 'lead'
}

function getBank(row = {}) {
  return text(getTransaction(row).bank || getTransaction(row).selected_bank || 'Bank pending')
}

function getConsultant(row = {}) {
  const tx = getTransaction(row)
  return text(tx.bond_originator || tx.assigned_bond_originator_email || tx.assigned_agent || tx.assigned_agent_email || 'Unassigned')
}

function getDevelopment(row = {}) {
  const tx = getTransaction(row)
  return text(row?.development?.name || tx.development_name || tx.property_description || tx.suburb || 'Portfolio')
}

function getBranch(row = {}) {
  const tx = getTransaction(row)
  return text(tx.assigned_branch_name || tx.branch_name || tx.assigned_branch_id || 'Branch pending')
}

function getReadinessInputs(input = {}) {
  const source = input.row || input.transaction || input
  const summary = input.financeReadiness || getFinanceReadinessSummary(source)
  const readiness = summary.readinessScore || {}
  const docs = input.documentStats || getDocumentStats(source)
  const formData = getFormData(source)
  const readinessInputs = summary.inputs || {}
  const income = number(readinessInputs.monthlyIncome) + number(readinessInputs.otherIncome)
  const debt = number(readinessInputs.monthlyDebt)
  const debtRatio = income ? debt / income : 1
  return {
    summary,
    docs,
    formData,
    readinessScore: number(input.readinessScore, number(readiness.score)),
    depositStrength: text(input.depositStrength || summary.depositStrength),
    debtRatio: number(input.debtRatio, debtRatio),
    onboardingCompleteness: clamp(number(input.onboardingCompleteness, number(readinessInputs.onboardingCompleteness) * 100)),
    documentReadiness: clamp(number(input.documentReadiness, docs.readiness)),
    employmentDurationMonths: number(input.employmentDurationMonths, number(readinessInputs.employmentDurationMonths)),
    bankHistoryIndicators: input.bankHistoryIndicators || {},
    historicalPatterns: input.historicalPatterns || {},
  }
}

export function calculateApprovalProbability(input = {}) {
  const readiness = getReadinessInputs(input)
  const strengths = []
  const risks = []
  let score = 0

  score += readiness.readinessScore * 0.38
  score += readiness.documentReadiness * 0.18
  score += readiness.onboardingCompleteness * 0.14
  score += readiness.employmentDurationMonths >= 24 ? 10 : readiness.employmentDurationMonths >= 6 ? 6 : 1
  score += readiness.depositStrength === 'Strong' ? 10 : readiness.depositStrength === 'Moderate' ? 6 : 1
  score += readiness.debtRatio <= 0.22 ? 10 : readiness.debtRatio <= 0.32 ? 5 : 0

  if (readiness.readinessScore >= 75) strengths.push('Strong buyer readiness profile')
  if (readiness.documentReadiness >= 80) strengths.push('Supporting documents are mostly ready')
  if (readiness.depositStrength === 'Strong') strengths.push('Strong deposit position')
  if (readiness.debtRatio <= 0.25) strengths.push('Manageable captured debt exposure')
  if (readiness.readinessScore < 45) risks.push('Buyer readiness needs attention')
  if (readiness.documentReadiness < 65) risks.push('Document pack is incomplete')
  if (readiness.debtRatio > 0.35) risks.push('High captured debt exposure')
  if (readiness.employmentDurationMonths > 0 && readiness.employmentDurationMonths < 6) risks.push('Short employment history')

  const confidence =
    readiness.readinessScore <= 0 || readiness.onboardingCompleteness < 35 ? 'Low' :
    readiness.documentReadiness < 50 ? 'Medium' :
    'Medium-High'
  score = clamp(score)
  const probabilityBand =
    readiness.readinessScore <= 0 ? 'Insufficient Data' :
    confidence === 'Low' ? 'Low Confidence' :
    score >= 76 ? 'High Probability' :
    score >= 56 ? 'Moderate Probability' :
    'Needs Attention'

  return {
    score: Math.round(score),
    confidence,
    probabilityBand,
    strengths,
    risks,
    explanation: `Estimated approval confidence uses buyer readiness, document completion, deposit strength, debt exposure, and operational completeness. ${FINANCE_INTELLIGENCE_DISCLAIMER}`,
  }
}

export function calculateOperationalRisk(input = {}) {
  const row = input.row || input.transaction || input
  const tx = getTransaction(row)
  const docs = getDocumentStats(row)
  const ageDays = daysSince(tx.updated_at || tx.created_at)
  const formData = getFormData(row)
  const revisions = number(input.revisions, docs.rejected)
  const buyerResponseDays = calculateBuyerResponsiveness(row).averageResponseDays
  const bottlenecks = []
  const recommendations = []
  let riskScore = 0

  if (docs.missing > 0) {
    riskScore += Math.min(28, docs.missing * 7)
    bottlenecks.push('Missing supporting documents')
    recommendations.push('Request outstanding buyer documents before submission.')
  }
  if (ageDays >= 10) {
    riskScore += Math.min(25, ageDays * 1.5)
    bottlenecks.push('Workflow has been stale')
    recommendations.push('Escalate stale file to the assigned consultant.')
  }
  if (buyerResponseDays >= 4) {
    riskScore += 14
    bottlenecks.push('Slow buyer response pattern')
  }
  if (revisions > 0) {
    riskScore += Math.min(18, revisions * 6)
    bottlenecks.push('Rejected or revised documents')
  }
  if (!formData?.finance_readiness && !formData?.financeReadiness) {
    riskScore += 10
    bottlenecks.push('Finance readiness profile incomplete')
  }

  riskScore = Math.round(clamp(riskScore))
  const riskLevel = riskScore >= 70 ? 'High' : riskScore >= 42 ? 'Elevated' : riskScore >= 18 ? 'Watch' : 'Low'
  const predictedDelays = []
  if (docs.missing > 0) predictedDelays.push(`${Math.min(7, docs.missing * 2)}d document delay`)
  if (ageDays >= 10) predictedDelays.push('Escalation delay likely')
  if (!predictedDelays.length) predictedDelays.push('No major operational delay predicted')

  return {
    riskScore,
    riskLevel,
    bottlenecks,
    predictedDelays,
    escalationRequired: riskScore >= 55,
    recommendations: recommendations.length ? recommendations : ['Keep the file moving through the next workflow milestone.'],
  }
}

export function calculateTransactionVelocity(input = {}) {
  const row = input.row || input.transaction || input
  const tx = getTransaction(row)
  const docs = getDocumentStats(row)
  const stageKey = getStageKey(row)
  const ageDays = daysSince(tx.created_at || tx.updated_at)
  const stageAge = daysSince(tx.updated_at || tx.created_at)
  const operationalRisk = calculateOperationalRisk(row)
  const stageBase = {
    lead: 28,
    docs: 22,
    submission: 16,
    feedback: 12,
    approval: 8,
    registration: 4,
  }
  const baseRemaining = stageBase[stageKey] || 24
  const missingDocPenalty = docs.missing * 2
  const riskPenalty = Math.round(operationalRisk.riskScore / 10)
  const expectedCompletionDays = Math.max(4, baseRemaining + missingDocPenalty + riskPenalty)
  const expectedApprovalDays = Math.max(2, Math.round(expectedCompletionDays * 0.55))
  const velocityScore = clamp(100 - stageAge * 3 - docs.missing * 8 - operationalRisk.riskScore * 0.35)
  const delayProbability = clamp(operationalRisk.riskScore * 0.8 + docs.missing * 8 + (ageDays > 14 ? 12 : 0))

  return {
    velocityScore: Math.round(velocityScore),
    expectedCompletionDays,
    expectedApprovalDays,
    stagePerformance: {
      stageKey,
      stageAgeDays: stageAge,
      documentReadiness: docs.readiness,
    },
    delayProbability: Math.round(delayProbability),
  }
}

export function generateFinanceInsights(input = {}) {
  const row = input.row || input.transaction || input
  const approval = calculateApprovalProbability(row)
  const risk = calculateOperationalRisk(row)
  const velocity = calculateTransactionVelocity(row)
  const readiness = getFinanceReadinessSummary(row)
  const insights = []
  const recommendations = []
  const operationalWarnings = []
  const conversionOpportunities = []

  if (approval.score >= 75 && risk.riskScore < 35) conversionOpportunities.push('Fast-track candidate based on readiness and low operational risk.')
  if (readiness.riskFlags?.length) insights.push(`Buyer readiness needs focus: ${readiness.riskFlags[0]}.`)
  if (approval.probabilityBand === 'High Probability') insights.push('Buyer appears finance-ready based on captured workflow data.')
  if (risk.escalationRequired) operationalWarnings.push(`Escalation recommended: ${risk.bottlenecks[0] || 'workflow risk is elevated'}.`)
  if (velocity.delayProbability >= 55) operationalWarnings.push('Application may be delayed based on stage age and missing inputs.')
  recommendations.push(readiness.nextRecommendedAction || risk.recommendations[0] || 'Review next workflow action.')

  return {
    insights,
    recommendations: [...new Set(recommendations)],
    operationalWarnings,
    conversionOpportunities,
  }
}

export function predictApprovalTimeline(row = {}) {
  const velocity = calculateTransactionVelocity(row)
  return {
    expectedApprovalDays: velocity.expectedApprovalDays,
    confidence: velocity.delayProbability > 60 ? 'Low' : velocity.delayProbability > 35 ? 'Medium' : 'Medium-High',
    delayProbability: velocity.delayProbability,
  }
}

export function predictRegistrationTimeline(row = {}) {
  const velocity = calculateTransactionVelocity(row)
  return {
    expectedRegistrationDays: velocity.expectedCompletionDays + 21,
    confidence: velocity.delayProbability > 60 ? 'Low' : 'Medium',
  }
}

export function predictWorkflowBottleneck(row = {}) {
  const risk = calculateOperationalRisk(row)
  return {
    bottleneck: risk.bottlenecks[0] || 'No dominant bottleneck',
    riskLevel: risk.riskLevel,
    recommendations: risk.recommendations,
  }
}

export function calculateBuyerResponsiveness(row = {}) {
  const events = Array.isArray(row?.transactionEvents) ? row.transactionEvents : []
  const responseEvents = events.filter((event) => /buyer|client|document|onboarding/i.test(text(event.event_type || event.type)))
  if (responseEvents.length < 2) {
    const age = daysSince(getTransaction(row).updated_at || getTransaction(row).created_at)
    return { averageResponseDays: age > 0 ? Math.min(age, 7) : 0, label: age > 4 ? 'Slow' : 'Unknown' }
  }
  const sorted = responseEvents.sort((a, b) => timestamp(a.created_at) - timestamp(b.created_at))
  const gaps = sorted.slice(1).map((event, index) => daysBetween(sorted[index].created_at, event.created_at))
  const average = gaps.reduce((sum, value) => sum + value, 0) / Math.max(1, gaps.length)
  return {
    averageResponseDays: Math.round(average),
    label: average <= 1 ? 'Fast' : average <= 3 ? 'Steady' : 'Slow',
  }
}

export function calculateDocumentTurnaround(row = {}) {
  const requests = Array.isArray(row?.documentRequests) ? row.documentRequests : []
  const documents = Array.isArray(row?.documents) ? row.documents : []
  const values = documents.map((document) => {
    const request = requests.find((item) => text(item.id || item.document_request_id) === text(document.document_request_id))
    return daysBetween(request?.created_at || getTransaction(row).created_at, document.uploaded_at || document.created_at)
  }).filter((value) => value >= 0)
  return {
    averageDays: values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0,
    uploadedCount: documents.length,
    requestedCount: requests.length,
  }
}

export function calculateConsultantPerformance(rows = []) {
  const buckets = new Map()
  for (const row of rows) {
    const consultant = getConsultant(row)
    const bucket = buckets.get(consultant) || { consultant, activeFiles: 0, riskScoreTotal: 0, velocityTotal: 0, approvals: 0 }
    bucket.activeFiles += 1
    bucket.riskScoreTotal += calculateOperationalRisk(row).riskScore
    bucket.velocityTotal += calculateTransactionVelocity(row).velocityScore
    if (/approved|grant|registered/i.test(text(getTransaction(row).stage || getTransaction(row).current_main_stage))) bucket.approvals += 1
    buckets.set(consultant, bucket)
  }
  return [...buckets.values()].map((bucket) => ({
    ...bucket,
    averageRiskScore: Math.round(bucket.riskScoreTotal / Math.max(1, bucket.activeFiles)),
    averageVelocityScore: Math.round(bucket.velocityTotal / Math.max(1, bucket.activeFiles)),
    approvalRate: Math.round((bucket.approvals / Math.max(1, bucket.activeFiles)) * 100),
  }))
}

export function calculateBankEfficiency(rows = []) {
  const buckets = new Map()
  for (const row of rows) {
    const bank = getBank(row)
    const bucket = buckets.get(bank) || { bank, submissions: 0, approvals: 0, declines: 0, leadTimeTotal: 0 }
    bucket.submissions += 1
    const stage = lower(getTransaction(row).stage || getTransaction(row).current_main_stage)
    if (/approved|grant|registered/.test(stage)) bucket.approvals += 1
    if (/declined|cancelled/.test(stage)) bucket.declines += 1
    bucket.leadTimeTotal += Math.max(1, daysBetween(getTransaction(row).created_at, getTransaction(row).updated_at || Date.now()))
    buckets.set(bank, bucket)
  }
  return [...buckets.values()].map((bucket) => ({
    bank: bucket.bank,
    submissionVolume: bucket.submissions,
    approvalRate: Math.round((bucket.approvals / Math.max(1, bucket.submissions)) * 100),
    declineRatio: Math.round((bucket.declines / Math.max(1, bucket.submissions)) * 100),
    averageApprovalDays: Math.round(bucket.leadTimeTotal / Math.max(1, bucket.submissions)),
    responsiveness: bucket.leadTimeTotal / Math.max(1, bucket.submissions) <= 8 ? 'Fast' : 'Watch',
  }))
}

export function calculateReadinessDistribution(rows = []) {
  const buckets = { high: 0, moderate: 0, atRisk: 0, incomplete: 0 }
  for (const row of rows) {
    const score = getFinanceReadinessSummary(row).readinessScore?.score || 0
    if (score >= 76) buckets.high += 1
    else if (score >= 55) buckets.moderate += 1
    else if (score >= 25) buckets.atRisk += 1
    else buckets.incomplete += 1
  }
  return buckets
}

export function buildReadinessFunnel(rows = []) {
  const total = rows.length || 0
  const stages = [
    { key: 'lead', label: 'Lead', count: total },
    { key: 'finance_readiness', label: 'Finance Readiness', count: rows.filter((row) => getFinanceReadinessSummary(row).readinessScore?.score > 0).length },
    { key: 'bond_application', label: 'Bond Application', count: rows.filter((row) => getFormData(row).bond_application).length },
    { key: 'documents_complete', label: 'Documents Complete', count: rows.filter((row) => getDocumentStats(row).missing === 0 && getDocumentStats(row).total > 0).length },
    { key: 'submitted', label: 'Submitted', count: rows.filter((row) => /submit|bank/i.test(lower(getTransaction(row).stage || getTransaction(row).current_main_stage))).length },
    { key: 'approved', label: 'Approved', count: rows.filter((row) => /approved|grant|registered/i.test(lower(getTransaction(row).stage || getTransaction(row).current_main_stage))).length },
    { key: 'registered', label: 'Registered', count: rows.filter((row) => /registered|reg/i.test(lower(getTransaction(row).stage || getTransaction(row).current_main_stage))).length },
  ]
  return stages.map((stage, index) => ({
    ...stage,
    conversionRate: total ? Math.round((stage.count / total) * 100) : 0,
    falloutFromPrevious: index === 0 ? 0 : Math.max(0, stages[index - 1].count - stage.count),
  }))
}

export function buildOperationalHeatmapModel(rows = [], { groupBy = 'bank' } = {}) {
  const columns = [
    { key: 'lead', label: 'Lead' },
    { key: 'docs', label: 'Docs' },
    { key: 'submission', label: 'Submission' },
    { key: 'feedback', label: 'Feedback' },
    { key: 'approval', label: 'Approval' },
    { key: 'registration', label: 'Registration' },
  ]
  const getGroup = groupBy === 'consultant' ? getConsultant : groupBy === 'development' ? getDevelopment : groupBy === 'branch' ? getBranch : getBank
  const buckets = new Map()
  for (const row of rows) {
    const label = getGroup(row)
    const bucket = buckets.get(label) || {
      key: label.toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'unknown',
      label,
      total: 0,
      stages: columns.map((column) => ({ ...column, count: 0, riskCount: 0, intensity: 0 })),
    }
    const stage = bucket.stages.find((item) => item.key === getStageKey(row)) || bucket.stages[0]
    stage.count += 1
    if (calculateOperationalRisk(row).riskScore >= 42) stage.riskCount += 1
    bucket.total += 1
    buckets.set(label, bucket)
  }
  const model = [...buckets.values()]
  const max = Math.max(...model.flatMap((row) => row.stages.map((stage) => stage.count + stage.riskCount * 1.5)), 1)
  return model.map((row) => ({
    ...row,
    stages: row.stages.map((stage) => ({
      ...stage,
      intensity: (stage.count + stage.riskCount * 1.5) / max,
    })),
  }))
}

export function buildExecutiveReportModel(rows = [], { title = 'Bond Operations Report' } = {}) {
  const readinessAnalytics = getFinanceReadinessAnalytics(rows)
  const bankEfficiency = calculateBankEfficiency(rows)
  const consultantPerformance = calculateConsultantPerformance(rows)
  const readinessFunnel = buildReadinessFunnel(rows)
  const riskRows = rows.map((row) => ({
    transactionId: getTransaction(row).id || '',
    buyer: row?.buyer?.name || getTransaction(row).buyer_name || 'Buyer pending',
    approvalConfidence: calculateApprovalProbability(row),
    operationalRisk: calculateOperationalRisk(row),
    velocity: calculateTransactionVelocity(row),
  }))
  return {
    title,
    generatedAt: new Date().toISOString(),
    disclaimer: FINANCE_INTELLIGENCE_DISCLAIMER,
    kpis: {
      totalApplications: rows.length,
      averageReadinessScore: readinessAnalytics.averageReadinessScore,
      averageRiskScore: riskRows.length ? Math.round(riskRows.reduce((sum, row) => sum + row.operationalRisk.riskScore, 0) / riskRows.length) : 0,
      highConfidenceCount: riskRows.filter((row) => row.approvalConfidence.score >= 76).length,
    },
    charts: {
      approvalConfidenceDistribution: calculateReadinessDistribution(rows),
      readinessFunnel,
      bankEfficiency,
      consultantPerformance,
      heatmaps: {
        bank: buildOperationalHeatmapModel(rows, { groupBy: 'bank' }),
        consultant: buildOperationalHeatmapModel(rows, { groupBy: 'consultant' }),
        development: buildOperationalHeatmapModel(rows, { groupBy: 'development' }),
      },
      buyerReadiness: readinessAnalytics,
    },
    rows: riskRows,
    futureAiHooks: {
      approvalPredictionModelInput: 'approvalConfidence + readiness + document + workflow features',
      documentAnomalyDetectionInput: 'documentRequests + documents + revision history',
      bankRecommendationInput: 'bankEfficiency + buyer profile + historical outcome features',
      workflowOptimizationInput: 'operationalRisk + velocity + bottleneck heatmaps',
    },
  }
}

export function getCachedFinanceIntelligence(rows = [], cacheKey = 'default') {
  const rowCount = rows.length
  const latest = rows.reduce((max, row) => Math.max(max, timestamp(getTransaction(row).updated_at || getTransaction(row).created_at)), 0)
  const key = `${cacheKey}:${rowCount}:${latest}`
  if (analyticsCache.has(key)) return analyticsCache.get(key)
  const value = {
    readinessDistribution: calculateReadinessDistribution(rows),
    readinessFunnel: buildReadinessFunnel(rows),
    bankEfficiency: calculateBankEfficiency(rows),
    consultantPerformance: calculateConsultantPerformance(rows),
    heatmaps: {
      bank: buildOperationalHeatmapModel(rows, { groupBy: 'bank' }),
      consultant: buildOperationalHeatmapModel(rows, { groupBy: 'consultant' }),
      development: buildOperationalHeatmapModel(rows, { groupBy: 'development' }),
      branch: buildOperationalHeatmapModel(rows, { groupBy: 'branch' }),
    },
    reportModels: {
      bondOperations: buildExecutiveReportModel(rows, { title: 'Bond Operations Report' }),
      executivePipeline: buildExecutiveReportModel(rows, { title: 'Executive Pipeline Report' }),
      bankPerformance: buildExecutiveReportModel(rows, { title: 'Bank Performance Report' }),
      buyerReadiness: buildExecutiveReportModel(rows, { title: 'Buyer Readiness Report' }),
      operationalRisk: buildExecutiveReportModel(rows, { title: 'Operational Risk Report' }),
    },
  }
  analyticsCache.clear()
  analyticsCache.set(key, value)
  return value
}

export function isPredictiveCopySafe(value = '') {
  return !/(guaranteed|guarantee|pre-approved|approved by bank|accepted by bank|will be approved)/i.test(text(value))
}

