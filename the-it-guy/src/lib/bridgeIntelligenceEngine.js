import { isSupabaseConfigured, supabase } from './supabaseClient'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const INTELLIGENCE_MODEL_VERSION = 'deterministic_v1'

export const BUYER_HEAT_CATEGORIES = {
  COLD: 'Cold',
  WARM: 'Warm',
  HOT: 'Hot',
  READY_TO_OFFER: 'Ready To Offer',
  READY_TO_CLOSE: 'Ready To Close',
  INVESTOR: 'Investor',
  AT_RISK: 'At Risk',
}

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function isUuidLike(value) {
  return UUID_PATTERN.test(normalizeText(value))
}

function toNullableUuid(value) {
  const normalized = normalizeText(value)
  return isUuidLike(normalized) ? normalized : null
}

function clamp(value, min = 0, max = 100) {
  const number = Number(value)
  if (!Number.isFinite(number)) return min
  return Math.max(min, Math.min(max, number))
}

function daysBetween(left, right = new Date()) {
  const leftTime = new Date(left || 0).getTime()
  const rightTime = new Date(right || 0).getTime()
  if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) return null
  return Math.max(0, Math.round((rightTime - leftTime) / (24 * 60 * 60 * 1000)))
}

function addDays(date, days) {
  const next = new Date(date || Date.now())
  next.setDate(next.getDate() + Number(days || 0))
  return next.toISOString().slice(0, 10)
}

function isMissingTableError(error, tableName = '') {
  const message = normalizeLower(error?.message)
  return String(error?.code || '') === '42P01' || (tableName && message.includes(`relation "public.${tableName}" does not exist`))
}

function isMissingColumnError(error) {
  return String(error?.code || '') === '42703' || /column .* does not exist/i.test(String(error?.message || ''))
}

async function safeRows(table, buildQuery, fallback = []) {
  if (!isSupabaseConfigured || !supabase) return fallback
  try {
    const result = await buildQuery(supabase.from(table))
    if (result.error) {
      if (isMissingTableError(result.error, table) || isMissingColumnError(result.error)) return fallback
      throw result.error
    }
    return Array.isArray(result.data) ? result.data : fallback
  } catch {
    return fallback
  }
}

async function safeSingle(table, buildQuery, fallback = null) {
  if (!isSupabaseConfigured || !supabase) return fallback
  try {
    const result = await buildQuery(supabase.from(table))
    if (result.error) {
      if (isMissingTableError(result.error, table) || isMissingColumnError(result.error)) return fallback
      throw result.error
    }
    return result.data || fallback
  } catch {
    return fallback
  }
}

function signal({
  signalType = 'buyer_intent',
  signalKey = '',
  scoreDelta = 0,
  confidence = 0.75,
  severity = 'info',
  title = '',
  explanation = '',
  source = {},
} = {}) {
  return {
    signalType,
    signalKey: signalKey || signalType,
    scoreDelta,
    confidence,
    severity,
    title: title || signalKey || signalType,
    explanation,
    source,
  }
}

function resolveBuyerHeatCategory(score, signals = []) {
  const hasAcceptedOffer = signals.some((item) => item.signalKey === 'accepted_offer')
  const hasSubmittedOffer = signals.some((item) => item.signalKey === 'submitted_offer')
  const investorSignal = signals.some((item) => item.signalKey === 'investor_behaviour')
  const atRiskSignal = signals.some((item) => item.severity === 'critical' || item.signalKey === 'stalled_buyer')
  if (atRiskSignal && score < 55) return BUYER_HEAT_CATEGORIES.AT_RISK
  if (hasAcceptedOffer) return BUYER_HEAT_CATEGORIES.READY_TO_CLOSE
  if (hasSubmittedOffer || score >= 80) return BUYER_HEAT_CATEGORIES.READY_TO_OFFER
  if (investorSignal) return BUYER_HEAT_CATEGORIES.INVESTOR
  if (score >= 65) return BUYER_HEAT_CATEGORIES.HOT
  if (score >= 40) return BUYER_HEAT_CATEGORIES.WARM
  return BUYER_HEAT_CATEGORIES.COLD
}

function resolveReadinessCategory({ category = '', acceptedOffers = 0, submittedOffers = 0, completedViewings = 0, financeReady = false } = {}) {
  if (acceptedOffers > 0) return 'Ready To Close'
  if (submittedOffers > 0) return 'Offer In Play'
  if (completedViewings > 0 && financeReady) return 'Ready To Offer'
  if (category === BUYER_HEAT_CATEGORIES.HOT) return 'High Intent'
  return 'Nurture'
}

function buildBuyerRecommendations({ category, completedViewings, submittedOffers, acceptedOffers, recentActivityCount, staleDays, financeReady }) {
  const recommendations = []
  if (acceptedOffers > 0) {
    recommendations.push({
      type: 'buyer_onboarding',
      priority: 'high',
      title: 'Start buyer onboarding',
      rationale: 'The buyer has an accepted offer. Onboarding and FICA should move immediately.',
      actionKey: 'start_onboarding',
    })
  } else if (submittedOffers > 0) {
    recommendations.push({
      type: 'offer_review',
      priority: 'high',
      title: 'Review and route offer',
      rationale: 'A submitted offer is waiting for seller routing or negotiation feedback.',
      actionKey: 'review_offer',
    })
  } else if (completedViewings > 0) {
    recommendations.push({
      type: 'create_offer',
      priority: financeReady ? 'high' : 'medium',
      title: 'Create offer draft',
      rationale: financeReady
        ? 'The buyer completed a viewing and appears finance-ready.'
        : 'The buyer completed a viewing. Capture feedback and prepare the offer path.',
      actionKey: 'create_offer',
    })
  }

  if (staleDays !== null && staleDays >= 7 && recentActivityCount === 0) {
    recommendations.push({
      type: 'reactivation',
      priority: 'medium',
      title: 'Re-engage buyer',
      rationale: 'No recent activity has been captured for this buyer.',
      actionKey: 'send_follow_up',
    })
  }

  if (category === BUYER_HEAT_CATEGORIES.HOT && completedViewings === 0) {
    recommendations.push({
      type: 'schedule_viewing',
      priority: 'high',
      title: 'Schedule a viewing',
      rationale: 'The buyer is showing intent but has not completed a tracked viewing yet.',
      actionKey: 'schedule_viewing',
    })
  }

  return recommendations.slice(0, 5)
}

export function computeBuyerHeatScore({
  lead = {},
  activities = [],
  appointments = [],
  offers = [],
  tasks = [],
} = {}) {
  const signals = []
  let score = 20
  const now = new Date()
  const leadCreatedDays = daysBetween(lead?.created_at || lead?.createdAt, now)
  const recentActivities = activities.filter((activity) => {
    const age = daysBetween(activity?.activity_date || activity?.activityDate || activity?.created_at, now)
    return age !== null && age <= 14
  })
  const completedViewings = appointments.filter((appointment) =>
    normalizeLower(appointment?.appointment_type || appointment?.appointmentType).includes('viewing') &&
    normalizeLower(appointment?.status).includes('completed')
  ).length
  const scheduledViewings = appointments.filter((appointment) =>
    normalizeLower(appointment?.appointment_type || appointment?.appointmentType).includes('viewing') &&
    ['requested', 'pending', 'confirmed', 'accepted'].some((status) => normalizeLower(appointment?.status).includes(status))
  ).length
  const submittedOffers = offers.filter((offer) => ['submitted', 'under_review', 'countered'].includes(normalizeLower(offer?.status))).length
  const acceptedOffers = offers.filter((offer) => ['accepted', 'converted_to_transaction'].includes(normalizeLower(offer?.status))).length
  const financeReady = offers.some((offer) => ['cash', 'bond', 'hybrid'].includes(normalizeLower(offer?.finance_type || offer?.financeType)))
  const openCriticalTasks = tasks.filter((task) =>
    ['pending', 'open', 'overdue'].includes(normalizeLower(task?.status)) &&
    normalizeLower(task?.priority).includes('high')
  ).length

  if (recentActivities.length >= 3) {
    score += 12
    signals.push(signal({
      signalKey: 'recent_engagement',
      scoreDelta: 12,
      severity: 'positive',
      title: 'Recent buyer engagement',
      explanation: `${recentActivities.length} buyer activities were captured in the last 14 days.`,
      source: { recentActivityCount: recentActivities.length },
    }))
  }

  if (scheduledViewings > 0) {
    score += 10
    signals.push(signal({
      signalKey: 'viewing_scheduled',
      scoreDelta: 10,
      severity: 'positive',
      title: 'Viewing scheduled',
      explanation: 'The buyer has at least one active viewing appointment.',
      source: { scheduledViewings },
    }))
  }

  if (completedViewings > 0) {
    const delta = Math.min(25, completedViewings * 14)
    score += delta
    signals.push(signal({
      signalKey: 'completed_viewing',
      scoreDelta: delta,
      severity: 'positive',
      title: 'Viewing completed',
      explanation: `${completedViewings} completed viewing${completedViewings === 1 ? '' : 's'} indicate stronger intent.`,
      source: { completedViewings },
    }))
  }

  if (submittedOffers > 0) {
    score += 24
    signals.push(signal({
      signalKey: 'submitted_offer',
      scoreDelta: 24,
      severity: 'positive',
      title: 'Offer submitted',
      explanation: 'The buyer has moved from interest into offer behaviour.',
      source: { submittedOffers },
    }))
  }

  if (acceptedOffers > 0) {
    score += 35
    signals.push(signal({
      signalKey: 'accepted_offer',
      scoreDelta: 35,
      severity: 'positive',
      title: 'Offer accepted',
      explanation: 'The buyer has an accepted or converted offer.',
      source: { acceptedOffers },
    }))
  }

  if (financeReady) {
    score += 10
    signals.push(signal({
      signalKey: 'finance_ready',
      scoreDelta: 10,
      severity: 'positive',
      title: 'Finance route captured',
      explanation: 'Offer data includes a finance route.',
      source: { financeReady },
    }))
  }

  if (normalizeLower(lead?.lead_category || lead?.leadCategory).includes('investor')) {
    score += 8
    signals.push(signal({
      signalKey: 'investor_behaviour',
      scoreDelta: 8,
      severity: 'positive',
      title: 'Investor profile',
      explanation: 'The buyer is tagged with investor intent.',
      source: { leadCategory: lead?.lead_category || lead?.leadCategory },
    }))
  }

  if (leadCreatedDays !== null && leadCreatedDays > 14 && recentActivities.length === 0 && submittedOffers === 0) {
    score -= 18
    signals.push(signal({
      signalKey: 'stalled_buyer',
      scoreDelta: -18,
      severity: 'warning',
      title: 'Buyer activity has stalled',
      explanation: 'The buyer has no recent activity and no submitted offer.',
      source: { leadCreatedDays },
    }))
  }

  if (openCriticalTasks > 0) {
    score -= Math.min(12, openCriticalTasks * 6)
    signals.push(signal({
      signalType: 'operational_risk',
      signalKey: 'open_critical_tasks',
      scoreDelta: -Math.min(12, openCriticalTasks * 6),
      severity: 'warning',
      title: 'Critical tasks are open',
      explanation: 'Important buyer tasks remain open and may slow progression.',
      source: { openCriticalTasks },
    }))
  }

  const heatScore = clamp(score)
  const heatCategory = resolveBuyerHeatCategory(heatScore, signals)
  const readinessCategory = resolveReadinessCategory({
    category: heatCategory,
    acceptedOffers,
    submittedOffers,
    completedViewings,
    financeReady,
  })
  const recommendations = buildBuyerRecommendations({
    category: heatCategory,
    completedViewings,
    submittedOffers,
    acceptedOffers,
    recentActivityCount: recentActivities.length,
    staleDays: leadCreatedDays,
    financeReady,
  })

  return {
    heatScore,
    heatCategory,
    readinessCategory,
    intentSummary: `${heatCategory}: ${readinessCategory}`,
    riskSummary: signals.some((item) => item.severity === 'warning' || item.severity === 'critical')
      ? 'Attention required on stalled or incomplete operational items.'
      : 'No major buyer risk signals detected.',
    signals,
    recommendations,
  }
}

export function computeTransactionPrediction({
  transaction = {},
  lanes = [],
  alerts = [],
  tasks = [],
  documentRequests = [],
} = {}) {
  const bottlenecks = []
  let riskScore = 25
  let predictedDelayDays = 0

  const blockedLanes = lanes.filter((lane) => lane?.blocked || normalizeLower(lane?.status) === 'blocked')
  if (blockedLanes.length) {
    riskScore += blockedLanes.length * 18
    predictedDelayDays += blockedLanes.length * 10
    bottlenecks.push({
      key: 'blocked_lanes',
      severity: 'critical',
      title: 'Workflow lane blocked',
      count: blockedLanes.length,
    })
  }

  const staleLanes = lanes.filter((lane) => {
    const age = daysBetween(lane?.updated_at || lane?.created_at)
    return age !== null && age >= 10 && !['completed', 'cancelled'].includes(normalizeLower(lane?.status))
  })
  if (staleLanes.length) {
    riskScore += staleLanes.length * 12
    predictedDelayDays += staleLanes.length * 6
    bottlenecks.push({
      key: 'stale_lanes',
      severity: 'warning',
      title: 'Workflow lane stale',
      count: staleLanes.length,
    })
  }

  const openAlerts = alerts.filter((alert) => normalizeLower(alert?.status) === 'open')
  if (openAlerts.length) {
    const criticalCount = openAlerts.filter((alert) => normalizeLower(alert?.severity) === 'critical').length
    riskScore += openAlerts.length * 8 + criticalCount * 12
    predictedDelayDays += openAlerts.length * 3
    bottlenecks.push({
      key: 'open_alerts',
      severity: criticalCount ? 'critical' : 'warning',
      title: 'Open workflow alerts',
      count: openAlerts.length,
    })
  }

  const overdueTasks = tasks.filter((task) => {
    const status = normalizeLower(task?.status)
    const dueDate = task?.due_date || task?.dueDate || task?.due_at
    return ['pending', 'open', 'overdue'].includes(status) && dueDate && new Date(dueDate).getTime() < Date.now()
  })
  if (overdueTasks.length) {
    riskScore += overdueTasks.length * 7
    predictedDelayDays += overdueTasks.length * 2
    bottlenecks.push({
      key: 'overdue_tasks',
      severity: 'warning',
      title: 'Overdue operational tasks',
      count: overdueTasks.length,
    })
  }

  const outstandingDocs = documentRequests.filter((request) => {
    const status = normalizeLower(request?.status)
    return status && !['completed', 'approved', 'uploaded', 'waived'].includes(status)
  })
  if (outstandingDocs.length) {
    riskScore += Math.min(20, outstandingDocs.length * 5)
    predictedDelayDays += Math.min(14, outstandingDocs.length * 2)
    bottlenecks.push({
      key: 'outstanding_documents',
      severity: 'warning',
      title: 'Outstanding documents',
      count: outstandingDocs.length,
    })
  }

  const stage = normalizeLower(transaction?.stage || transaction?.current_main_stage || transaction?.currentMainStage)
  if (stage.includes('registered')) {
    riskScore = 5
    predictedDelayDays = 0
  }

  const finalRiskScore = clamp(riskScore)
  const registrationProbability = clamp(100 - finalRiskScore)
  const financeApprovalProbability = clamp(90 - blockedLanes.length * 15 - outstandingDocs.length * 4)
  const fallThroughRisk = clamp(finalRiskScore * 0.72)

  return {
    riskScore: finalRiskScore,
    registrationProbability,
    financeApprovalProbability,
    fallThroughRisk,
    predictedDelayDays,
    predictedCloseDate: addDays(new Date(), 75 + predictedDelayDays),
    bottlenecks,
    recommendationKeys: bottlenecks.map((item) => item.key),
  }
}

async function createRun({
  organisationId = '',
  runType = 'lifecycle_event',
  triggerEvent = '',
  entityType = '',
  entityId = '',
  leadId = '',
  transactionId = '',
  offerId = '',
  metadata = {},
} = {}) {
  if (!isSupabaseConfigured || !supabase || !toNullableUuid(organisationId)) return null
  const result = await supabase.from('bridge_intelligence_runs').insert({
    organisation_id: toNullableUuid(organisationId),
    run_type: runType,
    trigger_event: normalizeText(triggerEvent) || null,
    entity_type: normalizeText(entityType) || null,
    entity_id: toNullableUuid(entityId),
    lead_id: toNullableUuid(leadId),
    transaction_id: toNullableUuid(transactionId),
    offer_id: toNullableUuid(offerId),
    status: 'running',
    model_version: INTELLIGENCE_MODEL_VERSION,
    metadata_json: metadata && typeof metadata === 'object' ? metadata : {},
  }).select('id').maybeSingle()
  if (result.error && !isMissingTableError(result.error, 'bridge_intelligence_runs')) throw result.error
  return result.data || null
}

async function completeRun(runId, summary = {}, status = 'completed') {
  if (!isSupabaseConfigured || !supabase || !toNullableUuid(runId)) return null
  const result = await supabase
    .from('bridge_intelligence_runs')
    .update({
      status,
      completed_at: new Date().toISOString(),
      summary_json: summary && typeof summary === 'object' ? summary : {},
    })
    .eq('id', runId)
    .select('id')
    .maybeSingle()
  if (result.error && !isMissingTableError(result.error, 'bridge_intelligence_runs')) throw result.error
  return result.data || null
}

async function persistSignals({
  organisationId = '',
  runId = '',
  lead = {},
  transactionId = '',
  offerId = '',
  signals = [],
} = {}) {
  if (!isSupabaseConfigured || !supabase || !toNullableUuid(organisationId) || !signals.length) return []
  const leadId = toNullableUuid(lead?.lead_id || lead?.leadId)
  const rows = signals.map((item) => ({
    organisation_id: toNullableUuid(organisationId),
    run_id: toNullableUuid(runId),
    signal_type: item.signalType || 'buyer_intent',
    signal_key: item.signalKey || item.signalType || 'signal',
    entity_type: leadId ? 'lead' : 'transaction',
    entity_id: leadId || toNullableUuid(transactionId),
    lead_id: leadId,
    contact_id: toNullableUuid(lead?.contact_id || lead?.contactId),
    transaction_id: toNullableUuid(transactionId),
    offer_id: toNullableUuid(offerId),
    score_delta: Number(item.scoreDelta || 0),
    confidence: Number(item.confidence || 0.75),
    severity: item.severity || 'info',
    title: item.title || item.signalKey || 'Intelligence signal',
    explanation: item.explanation || null,
    source_json: item.source && typeof item.source === 'object' ? item.source : {},
  }))
  const result = await supabase.from('bridge_intelligence_signals').insert(rows).select('id')
  if (result.error && !isMissingTableError(result.error, 'bridge_intelligence_signals') && !isMissingColumnError(result.error)) {
    throw result.error
  }
  return Array.isArray(result.data) ? result.data : []
}

async function persistRecommendations({
  organisationId = '',
  lead = {},
  transactionId = '',
  offerId = '',
  recommendations = [],
} = {}) {
  if (!isSupabaseConfigured || !supabase || !toNullableUuid(organisationId) || !recommendations.length) return []
  const leadId = toNullableUuid(lead?.lead_id || lead?.leadId)
  const created = []
  for (const recommendation of recommendations) {
    const existing = await supabase
      .from('bridge_recommendations')
      .select('id')
      .eq('organisation_id', toNullableUuid(organisationId))
      .eq('status', 'open')
      .eq('recommendation_type', recommendation.type)
      .eq(leadId ? 'lead_id' : 'transaction_id', leadId || toNullableUuid(transactionId))
      .maybeSingle()
    if (existing.error && !isMissingTableError(existing.error, 'bridge_recommendations') && !isMissingColumnError(existing.error)) {
      throw existing.error
    }
    if (existing.data?.id) {
      created.push(existing.data)
      continue
    }

    const result = await supabase.from('bridge_recommendations').insert({
      organisation_id: toNullableUuid(organisationId),
      recommendation_type: recommendation.type,
      entity_type: leadId ? 'lead' : 'transaction',
      entity_id: leadId || toNullableUuid(transactionId),
      lead_id: leadId,
      contact_id: toNullableUuid(lead?.contact_id || lead?.contactId),
      transaction_id: toNullableUuid(transactionId),
      offer_id: toNullableUuid(offerId),
      priority: recommendation.priority || 'medium',
      title: recommendation.title,
      rationale: recommendation.rationale || null,
      action_key: recommendation.actionKey || null,
      action_config_json: recommendation.actionConfig || {},
      expires_at: addDays(new Date(), 14),
      metadata_json: recommendation.metadata || {},
    }).select('id').maybeSingle()
    if (result.error && !isMissingTableError(result.error, 'bridge_recommendations') && !isMissingColumnError(result.error)) {
      throw result.error
    }
    if (result.data) created.push(result.data)
  }
  return created
}

async function fetchBuyerContext({ organisationId = '', leadId = '' } = {}) {
  const scopedOrganisationId = toNullableUuid(organisationId)
  const scopedLeadId = toNullableUuid(leadId)
  if (!scopedOrganisationId || !scopedLeadId) return null
  const lead = await safeSingle('leads', (query) =>
    query.select('*').eq('organisation_id', scopedOrganisationId).eq('lead_id', scopedLeadId).maybeSingle()
  )
  if (!lead) return null
  const [activities, appointments, offers, tasks] = await Promise.all([
    safeRows('lead_activities', (query) =>
      query.select('*').eq('organisation_id', scopedOrganisationId).eq('lead_id', scopedLeadId).order('activity_date', { ascending: false }).limit(100)
    ),
    safeRows('appointments', (query) =>
      query.select('*').eq('organisation_id', scopedOrganisationId).eq('lead_id', scopedLeadId).order('date_time', { ascending: false }).limit(50)
    ),
    safeRows('offers', (query) =>
      query.select('*').eq('organisation_id', scopedOrganisationId).eq('buyer_lead_id', scopedLeadId).order('updated_at', { ascending: false }).limit(50)
    ),
    safeRows('tasks', (query) =>
      query.select('*').eq('organisation_id', scopedOrganisationId).eq('lead_id', scopedLeadId).order('updated_at', { ascending: false }).limit(80)
    ),
  ])
  return { lead, activities, appointments, offers, tasks }
}

async function fetchTransactionContext({ organisationId = '', transactionId = '' } = {}) {
  const scopedOrganisationId = toNullableUuid(organisationId)
  const scopedTransactionId = toNullableUuid(transactionId)
  if (!scopedOrganisationId || !scopedTransactionId) return null
  const transaction = await safeSingle('transactions', (query) =>
    query.select('*').eq('organisation_id', scopedOrganisationId).eq('id', scopedTransactionId).maybeSingle()
  )
  if (!transaction) return null
  const [lanes, alerts, tasks, documentRequests] = await Promise.all([
    safeRows('transaction_workflow_lanes', (query) =>
      query.select('*').eq('organisation_id', scopedOrganisationId).eq('transaction_id', scopedTransactionId).order('updated_at', { ascending: false })
    ),
    safeRows('workflow_alerts', (query) =>
      query.select('*').eq('organisation_id', scopedOrganisationId).eq('transaction_id', scopedTransactionId).order('created_at', { ascending: false }).limit(80)
    ),
    safeRows('workflow_generated_tasks', (query) =>
      query.select('*').eq('organisation_id', scopedOrganisationId).eq('transaction_id', scopedTransactionId).order('created_at', { ascending: false }).limit(80)
    ),
    safeRows('document_requests', (query) =>
      query.select('*').eq('transaction_id', scopedTransactionId).order('created_at', { ascending: false }).limit(120)
    ),
  ])
  return { transaction, lanes, alerts, tasks, documentRequests }
}

export async function refreshBuyerIntelligence({ organisationId = '', leadId = '', runId = '', triggerEvent = '' } = {}) {
  const context = await fetchBuyerContext({ organisationId, leadId })
  if (!context) return null
  const result = computeBuyerHeatScore(context)
  const scopedOrganisationId = toNullableUuid(organisationId)
  const scopedLeadId = toNullableUuid(leadId)

  await persistSignals({
    organisationId: scopedOrganisationId,
    runId,
    lead: context.lead,
    offerId: context.offers[0]?.id,
    signals: result.signals,
  })
  await persistRecommendations({
    organisationId: scopedOrganisationId,
    lead: context.lead,
    offerId: context.offers[0]?.id,
    recommendations: result.recommendations,
  })

  if (isSupabaseConfigured && supabase && scopedOrganisationId && scopedLeadId) {
    const profilePayload = {
      organisation_id: scopedOrganisationId,
      buyer_lead_id: scopedLeadId,
      contact_id: toNullableUuid(context.lead?.contact_id),
      heat_score: result.heatScore,
      heat_category: result.heatCategory,
      readiness_category: result.readinessCategory,
      intent_summary: result.intentSummary,
      risk_summary: result.riskSummary,
      last_signal_at: new Date().toISOString(),
      signals_json: result.signals.slice(0, 12),
      recommendations_json: result.recommendations,
      computed_at: new Date().toISOString(),
    }
    const upsert = await supabase
      .from('buyer_intelligence_profiles')
      .upsert(profilePayload, { onConflict: 'organisation_id,buyer_lead_id' })
      .select('id')
      .maybeSingle()
    if (upsert.error && !isMissingTableError(upsert.error, 'buyer_intelligence_profiles') && !isMissingColumnError(upsert.error)) {
      throw upsert.error
    }
  }

  return {
    ...result,
    triggerEvent,
    leadId: scopedLeadId,
  }
}

export async function refreshTransactionIntelligence({ organisationId = '', transactionId = '', runId = '' } = {}) {
  const context = await fetchTransactionContext({ organisationId, transactionId })
  if (!context) return null
  const result = computeTransactionPrediction(context)
  const scopedOrganisationId = toNullableUuid(organisationId)
  const scopedTransactionId = toNullableUuid(transactionId)

  if (isSupabaseConfigured && supabase && scopedOrganisationId && scopedTransactionId) {
    const insert = await supabase.from('transaction_intelligence_snapshots').insert({
      organisation_id: scopedOrganisationId,
      transaction_id: scopedTransactionId,
      buyer_lead_id: toNullableUuid(context.transaction?.originating_buyer_lead_id || context.transaction?.originating_lead_id),
      risk_score: result.riskScore,
      registration_probability: result.registrationProbability,
      finance_approval_probability: result.financeApprovalProbability,
      fall_through_risk: result.fallThroughRisk,
      predicted_close_date: result.predictedCloseDate,
      predicted_delay_days: result.predictedDelayDays,
      bottlenecks_json: result.bottlenecks,
      recommendation_keys_json: result.recommendationKeys,
    }).select('id').maybeSingle()
    if (insert.error && !isMissingTableError(insert.error, 'transaction_intelligence_snapshots') && !isMissingColumnError(insert.error)) {
      throw insert.error
    }
  }

  await persistSignals({
    organisationId: scopedOrganisationId,
    runId,
    lead: { lead_id: context.transaction?.originating_buyer_lead_id || context.transaction?.originating_lead_id },
    transactionId: scopedTransactionId,
    signals: result.bottlenecks.map((item) => signal({
      signalType: 'transaction_risk',
      signalKey: item.key,
      scoreDelta: item.severity === 'critical' ? -25 : -12,
      severity: item.severity,
      title: item.title,
      explanation: `${item.count || 1} ${item.title.toLowerCase()} signal${item.count === 1 ? '' : 's'} detected.`,
      source: item,
    })),
  })

  return result
}

export async function refreshBridgeIntelligenceForLifecycleEvent({
  organisationId = '',
  event = '',
  leadId = '',
  transactionId = '',
  offerId = '',
  metadata = {},
} = {}) {
  const scopedOrganisationId = toNullableUuid(organisationId)
  if (!scopedOrganisationId || !isSupabaseConfigured || !supabase) return null
  const run = await createRun({
    organisationId: scopedOrganisationId,
    runType: 'lifecycle_event',
    triggerEvent: event,
    entityType: toNullableUuid(transactionId) ? 'transaction' : 'lead',
    entityId: toNullableUuid(transactionId) || toNullableUuid(leadId),
    leadId,
    transactionId,
    offerId,
    metadata,
  })

  try {
    const buyer = toNullableUuid(leadId)
      ? await refreshBuyerIntelligence({
          organisationId: scopedOrganisationId,
          leadId,
          runId: run?.id,
          triggerEvent: event,
        })
      : null
    const transaction = toNullableUuid(transactionId)
      ? await refreshTransactionIntelligence({
          organisationId: scopedOrganisationId,
          transactionId,
          runId: run?.id,
        })
      : null

    const summary = {
      buyer: buyer
        ? {
            heatScore: buyer.heatScore,
            heatCategory: buyer.heatCategory,
            readinessCategory: buyer.readinessCategory,
            recommendationCount: buyer.recommendations.length,
          }
        : null,
      transaction: transaction
        ? {
            riskScore: transaction.riskScore,
            registrationProbability: transaction.registrationProbability,
            predictedCloseDate: transaction.predictedCloseDate,
            bottleneckCount: transaction.bottlenecks.length,
          }
        : null,
    }
    await completeRun(run?.id, summary, 'completed')
    return summary
  } catch (error) {
    await completeRun(run?.id, { error: error?.message || 'Bridge intelligence failed.' }, 'failed').catch(() => null)
    throw error
  }
}
