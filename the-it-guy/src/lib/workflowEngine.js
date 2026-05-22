import { createAgencyCrmLeadActivity, createAgencyCrmLeadTask, updateAgencyCrmLeadRecord } from './agencyCrmRepository'
import { refreshBridgeIntelligenceForLifecycleEvent } from './bridgeIntelligenceEngine'
import { isSupabaseConfigured, supabase } from './supabaseClient'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const WORKFLOW_EVENTS = {
  VIEWING_CREATED: 'viewing_created',
  VIEWING_COMPLETED: 'viewing_completed',
  OFFER_CREATED: 'offer_created',
  OFFER_SUBMITTED: 'offer_submitted',
  OFFER_COUNTERED: 'offer_countered',
  OFFER_ACCEPTED: 'offer_accepted',
  ONBOARDING_STARTED: 'onboarding_started',
  TRANSACTION_CREATED: 'transaction_created',
  REGISTRATION_CONFIRMED: 'registration_confirmed',
  MANUAL_STAGE_TRANSITION: 'manual_stage_transition',
}

export const BUYER_WORKFLOW_STAGES = [
  'New Lead',
  'Contacted',
  'Qualified',
  'Viewing Scheduled',
  'Viewing Completed',
  'Offer Draft',
  'Offer Submitted',
  'Negotiating',
  'Offer Accepted',
  'Onboarding',
  'Finance',
  'Transfer',
  'Registered',
  'Lost',
]

const BUYER_STAGE_TRANSITIONS = {
  'New Lead': ['Contacted', 'Qualified', 'Lost'],
  Contacted: ['Qualified', 'Viewing Scheduled', 'Lost'],
  Qualified: ['Viewing Scheduled', 'Offer Draft', 'Lost'],
  'Viewing Scheduled': ['Viewing Completed', 'Lost'],
  'Viewing Completed': ['Offer Draft', 'Offer Submitted', 'Lost'],
  'Offer Draft': ['Offer Submitted', 'Lost'],
  'Offer Submitted': ['Negotiating', 'Offer Accepted', 'Lost'],
  Negotiating: ['Offer Submitted', 'Offer Accepted', 'Lost'],
  'Offer Accepted': ['Onboarding', 'Lost'],
  Onboarding: ['Finance', 'Lost'],
  Finance: ['Transfer', 'Lost'],
  Transfer: ['Registered', 'Lost'],
  Registered: [],
  Lost: [],
}

const STAGE_REQUIREMENTS = {
  'Viewing Completed': [
    { type: 'appointment', key: 'completed_viewing', message: 'A completed viewing is required before moving to Viewing Completed.' },
  ],
  'Offer Submitted': [
    { type: 'offer', key: 'submitted_offer', message: 'A submitted offer is required before moving to Offer Submitted.' },
  ],
  'Offer Accepted': [
    { type: 'offer', key: 'accepted_offer', message: 'An accepted offer is required before moving to Offer Accepted.' },
  ],
  Onboarding: [
    { type: 'offer', key: 'accepted_offer', message: 'An accepted offer is required before starting buyer onboarding.' },
  ],
  Finance: [
    { type: 'transaction', key: 'transaction_created', message: 'A transaction created from an accepted offer is required before Finance.' },
  ],
  Registered: [
    { type: 'transfer', key: 'transfer_registered', message: 'The transfer lane must be registered before closing the buyer workflow.' },
  ],
}

const AUTOMATION_TASKS = {
  [WORKFLOW_EVENTS.VIEWING_COMPLETED]: [
    {
      title: 'Follow up after viewing',
      description: 'Contact the buyer, capture feedback, and confirm whether an offer should be prepared.',
      dueDays: 1,
      priority: 'High',
    },
    {
      title: 'Prepare offer next step',
      description: 'If the buyer is interested, create an offer draft from the buyer workspace.',
      dueDays: 1,
      priority: 'Medium',
    },
  ],
  [WORKFLOW_EVENTS.OFFER_SUBMITTED]: [
    {
      title: 'Review submitted offer',
      description: 'Check price, suspensive conditions, finance type, expiry, and supporting documents.',
      dueDays: 1,
      priority: 'High',
    },
    {
      title: 'Contact seller about offer',
      description: 'Prepare seller feedback and route the offer for seller decision.',
      dueDays: 1,
      priority: 'High',
    },
  ],
  [WORKFLOW_EVENTS.OFFER_ACCEPTED]: [
    {
      title: 'Start buyer onboarding',
      description: 'Send or confirm buyer onboarding and capture purchaser, FICA, and finance details.',
      dueDays: 1,
      priority: 'High',
    },
    {
      title: 'Collect buyer FICA',
      description: 'Confirm purchaser type and request the matching FICA document pack.',
      dueDays: 2,
      priority: 'High',
    },
  ],
  [WORKFLOW_EVENTS.ONBOARDING_STARTED]: [
    {
      title: 'Verify purchaser profile',
      description: 'Confirm buyer type, marital status, finance type, and document requirements.',
      dueDays: 2,
      priority: 'Medium',
    },
  ],
  [WORKFLOW_EVENTS.TRANSACTION_CREATED]: [
    {
      title: 'Open finance lane',
      description: 'Confirm finance route, deposit proof, and bond originator handoff where required.',
      dueDays: 2,
      priority: 'High',
    },
    {
      title: 'Open transfer lane',
      description: 'Confirm attorney allocation, FICA status, and transfer instruction readiness.',
      dueDays: 2,
      priority: 'High',
    },
  ],
}

const AUTOMATION_ALERTS = {
  [WORKFLOW_EVENTS.OFFER_SUBMITTED]: [
    {
      alertType: 'offer_review_due',
      severity: 'warning',
      title: 'Offer review required',
      message: 'A buyer offer has been submitted and needs agent review before seller routing.',
      dueHours: 24,
    },
  ],
  [WORKFLOW_EVENTS.OFFER_ACCEPTED]: [
    {
      alertType: 'onboarding_required',
      severity: 'warning',
      title: 'Buyer onboarding required',
      message: 'Accepted offer is waiting for buyer onboarding and transaction setup.',
      dueHours: 24,
    },
  ],
  [WORKFLOW_EVENTS.TRANSACTION_CREATED]: [
    {
      alertType: 'lanes_opened',
      severity: 'info',
      title: 'Finance and transfer lanes opened',
      message: 'Transaction lanes are active and ready for operational tracking.',
      dueHours: 48,
    },
  ],
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

function dueIso({ days = 0, hours = 0 } = {}) {
  return new Date(Date.now() + (Number(days || 0) * 24 + Number(hours || 0)) * 60 * 60 * 1000).toISOString()
}

function isMissingTableError(error, tableName = '') {
  const message = normalizeLower(error?.message)
  return String(error?.code || '') === '42P01' || (tableName && message.includes(`relation "public.${tableName}" does not exist`))
}

function isMissingColumnError(error) {
  return String(error?.code || '') === '42703' || /column .* does not exist/i.test(String(error?.message || ''))
}

export function normalizeBuyerWorkflowStage(stage, fallback = 'New Lead') {
  const normalized = normalizeText(stage)
  if (!normalized || normalized === 'Lead') return fallback
  return BUYER_WORKFLOW_STAGES.find((candidate) => normalizeLower(candidate) === normalizeLower(normalized)) || fallback
}

export function isBuyerWorkflowStage(stage) {
  const normalized = normalizeText(stage)
  return normalized === 'Lead' || BUYER_WORKFLOW_STAGES.some((candidate) => normalizeLower(candidate) === normalizeLower(normalized))
}

function resolveActorRole(actor = {}) {
  if (actor?.isPrincipal) return 'principal'
  return normalizeLower(actor?.role || actor?.roleKey || actor?.membershipRole || actor?.type || 'agent').replace(/\s+/g, '_')
}

function canOverrideWorkflow(actor = {}, options = {}) {
  return options.override === true && ['principal', 'owner', 'admin', 'manager'].includes(resolveActorRole(actor))
}

async function queryExists(table, buildQuery) {
  if (!isSupabaseConfigured || !supabase) return { ok: true, skipped: true }
  try {
    const query = buildQuery(supabase.from(table).select('*', { count: 'exact', head: true }))
    const result = await query
    if (result.error) {
      if (isMissingTableError(result.error, table) || isMissingColumnError(result.error)) {
        return { ok: false, skipped: true, reason: `${table}_unavailable` }
      }
      throw result.error
    }
    return { ok: Number(result.count || 0) > 0, skipped: false }
  } catch (error) {
    return { ok: false, skipped: false, reason: error?.message || 'workflow_requirement_query_failed' }
  }
}

async function evaluateRequirement({ organisationId = '', leadId = '', transactionId = '', stage = '', requirement = {} } = {}) {
  const scopedOrganisationId = toNullableUuid(organisationId)
  const scopedLeadId = toNullableUuid(leadId)
  const scopedTransactionId = toNullableUuid(transactionId)

  if (!scopedOrganisationId) {
    return { ok: true, skipped: true, reason: 'workflow_requires_database_organisation' }
  }

  if (requirement.type === 'appointment' && requirement.key === 'completed_viewing') {
    const result = await queryExists('appointments', (query) =>
      query
        .eq('organisation_id', scopedOrganisationId)
        .eq('lead_id', scopedLeadId)
        .eq('appointment_type', 'viewing')
        .eq('status', 'completed')
    )
    return { ...result, requirement, stage }
  }

  if (requirement.type === 'offer') {
    const expectedStatus = requirement.key === 'accepted_offer' ? 'accepted' : 'submitted'
    const result = await queryExists('offers', (query) =>
      query
        .eq('organisation_id', scopedOrganisationId)
        .eq('buyer_lead_id', scopedLeadId)
        .eq('status', expectedStatus)
    )
    return { ...result, requirement, stage }
  }

  if (requirement.type === 'transaction' && requirement.key === 'transaction_created') {
    const leadResult = await queryExists('leads', (query) =>
      query
        .eq('organisation_id', scopedOrganisationId)
        .eq('lead_id', scopedLeadId)
        .not('converted_transaction_id', 'is', null)
    )
    if (leadResult.ok) return { ...leadResult, requirement, stage }
    const transactionResult = await queryExists('transactions', (query) =>
      query
        .eq('organisation_id', scopedOrganisationId)
        .eq('originating_buyer_lead_id', scopedLeadId)
    )
    return { ...transactionResult, requirement, stage }
  }

  if (requirement.type === 'finance' && requirement.key === 'finance_lane_active') {
    const result = await queryExists('transaction_workflow_lanes', (query) =>
      query
        .eq('organisation_id', scopedOrganisationId)
        .eq('transaction_id', scopedTransactionId)
        .eq('lane_type', 'finance')
        .in('status', ['active', 'blocked', 'completed'])
    )
    return { ...result, requirement, stage }
  }

  if (requirement.type === 'transfer' && requirement.key === 'transfer_registered') {
    const result = await queryExists('transaction_workflow_lanes', (query) =>
      query
        .eq('organisation_id', scopedOrganisationId)
        .eq('transaction_id', scopedTransactionId)
        .eq('lane_type', 'transfer')
        .eq('current_stage', 'Registered')
    )
    return { ...result, requirement, stage }
  }

  return { ok: true, skipped: true, requirement, stage }
}

export async function recordWorkflowAudit({
  organisationId = '',
  workflowType = 'buyer',
  entityType = 'lead',
  entityId = '',
  leadId = '',
  transactionId = '',
  offerId = '',
  fromStage = '',
  toStage = '',
  eventType = WORKFLOW_EVENTS.MANUAL_STAGE_TRANSITION,
  actor = null,
  allowed = true,
  overrideReason = '',
  metadata = {},
} = {}) {
  if (!isSupabaseConfigured || !supabase || !toNullableUuid(organisationId)) return null
  const payload = {
    organisation_id: toNullableUuid(organisationId),
    workflow_type: normalizeText(workflowType) || 'buyer',
    entity_type: normalizeText(entityType) || 'lead',
    entity_id: toNullableUuid(entityId),
    lead_id: toNullableUuid(leadId),
    transaction_id: toNullableUuid(transactionId),
    offer_id: toNullableUuid(offerId),
    from_stage: normalizeText(fromStage) || null,
    to_stage: normalizeText(toStage) || null,
    event_type: normalizeText(eventType) || WORKFLOW_EVENTS.MANUAL_STAGE_TRANSITION,
    actor_id: toNullableUuid(actor?.id),
    actor_role: resolveActorRole(actor),
    allowed: allowed !== false,
    override_reason: normalizeText(overrideReason) || null,
    metadata_json: metadata && typeof metadata === 'object' ? metadata : {},
  }

  const result = await supabase.from('workflow_audit_log').insert(payload).select('id').maybeSingle()
  if (result.error && !isMissingTableError(result.error, 'workflow_audit_log') && !isMissingColumnError(result.error)) {
    throw result.error
  }
  return result.data || null
}

export async function validateBuyerStageTransition({
  organisationId = '',
  lead = null,
  leadId = '',
  fromStage = '',
  toStage = '',
  transactionId = '',
  actor = null,
  options = {},
} = {}) {
  const scopedLeadId = normalizeText(leadId || lead?.leadId || lead?.lead_id)
  const currentStage = normalizeBuyerWorkflowStage(fromStage || lead?.stage || lead?.status)
  const nextStage = normalizeBuyerWorkflowStage(toStage)
  const overrideAllowed = canOverrideWorkflow(actor, options)
  const actorRole = resolveActorRole(actor)

  if (!scopedLeadId) return { allowed: false, reason: 'Lead is required before moving workflow stage.' }
  if (currentStage === nextStage) return { allowed: false, reason: 'This buyer lead is already in that workflow stage.' }
  if (['attorney', 'bond_originator', 'conveyancer'].includes(actorRole)) {
    return { allowed: false, reason: 'This role cannot move buyer workflow stages.' }
  }

  const allowedTargets = BUYER_STAGE_TRANSITIONS[currentStage] || []
  if (!allowedTargets.includes(nextStage) && !overrideAllowed) {
    await recordWorkflowAudit({
      organisationId,
      leadId: scopedLeadId,
      fromStage: currentStage,
      toStage: nextStage,
      eventType: WORKFLOW_EVENTS.MANUAL_STAGE_TRANSITION,
      actor,
      allowed: false,
      metadata: { reason: 'illegal_stage_transition', allowedTargets },
    }).catch(() => null)
    return {
      allowed: false,
      reason: `${currentStage} cannot move directly to ${nextStage}. Complete the required workflow step first.`,
      allowedTargets,
    }
  }

  const blockingRequirements = STAGE_REQUIREMENTS[nextStage] || []
  const requirementResults = []
  for (const requirement of blockingRequirements) {
    const result = await evaluateRequirement({
      organisationId,
      leadId: scopedLeadId,
      transactionId: transactionId || lead?.convertedTransactionId || lead?.convertedDealId,
      stage: nextStage,
      requirement,
    })
    requirementResults.push(result)
    if (!result.ok && !result.skipped && !overrideAllowed) {
      await recordWorkflowAudit({
        organisationId,
        leadId: scopedLeadId,
        fromStage: currentStage,
        toStage: nextStage,
        eventType: WORKFLOW_EVENTS.MANUAL_STAGE_TRANSITION,
        actor,
        allowed: false,
        metadata: { reason: 'blocking_requirement_failed', requirement },
      }).catch(() => null)
      return { allowed: false, reason: requirement.message, requirements: requirementResults }
    }
  }

  return {
    allowed: true,
    reason: null,
    fromStage: currentStage,
    toStage: nextStage,
    override: overrideAllowed,
    requirements: requirementResults,
  }
}

async function createGeneratedTaskRecord({
  organisationId = '',
  event = '',
  task = {},
  leadId = '',
  transactionId = '',
  offerId = '',
  actor = null,
  metadata = {},
} = {}) {
  const scopedOrganisationId = toNullableUuid(organisationId)
  const scopedLeadId = toNullableUuid(leadId)
  const dueAt = dueIso({ days: task.dueDays || 1 })
  let crmTask = null
  if (scopedLeadId) {
    crmTask = await createAgencyCrmLeadTask(
      scopedOrganisationId,
      scopedLeadId,
      {
        assignedAgent: actor,
        title: task.title,
        description: task.description,
        dueDate: dueAt.slice(0, 10),
        status: 'Pending',
        priority: task.priority || 'Medium',
      },
      { actor },
    ).catch(() => null)
  }

  if (!isSupabaseConfigured || !supabase || !scopedOrganisationId) return crmTask
  const existing = await supabase
    .from('workflow_generated_tasks')
    .select('id')
    .eq('organisation_id', scopedOrganisationId)
    .eq('trigger_event', event)
    .eq('title', task.title)
    .eq('status', 'open')
    .eq(scopedLeadId ? 'lead_id' : 'transaction_id', scopedLeadId || toNullableUuid(transactionId))
    .maybeSingle()

  if (existing.error && !isMissingTableError(existing.error, 'workflow_generated_tasks') && !isMissingColumnError(existing.error)) {
    throw existing.error
  }
  if (existing.data?.id) return crmTask || existing.data

  const result = await supabase.from('workflow_generated_tasks').insert({
    organisation_id: scopedOrganisationId,
    workflow_type: 'buyer',
    trigger_event: event,
    entity_type: scopedLeadId ? 'lead' : 'transaction',
    entity_id: scopedLeadId || toNullableUuid(transactionId),
    lead_id: scopedLeadId,
    transaction_id: toNullableUuid(transactionId),
    offer_id: toNullableUuid(offerId),
    task_id: toNullableUuid(crmTask?.taskId || crmTask?.task_id),
    title: task.title,
    description: task.description || null,
    assigned_role: task.assignedRole || 'agent',
    assigned_agent_id: toNullableUuid(actor?.id),
    due_at: dueAt,
    priority: normalizeLower(task.priority || 'medium'),
    metadata_json: metadata && typeof metadata === 'object' ? metadata : {},
  }).select('id').maybeSingle()

  if (result.error && !isMissingTableError(result.error, 'workflow_generated_tasks') && !isMissingColumnError(result.error)) {
    throw result.error
  }
  return crmTask || result.data || null
}

async function createWorkflowAlert({
  organisationId = '',
  event = '',
  alert = {},
  leadId = '',
  transactionId = '',
  offerId = '',
  actor = null,
  metadata = {},
} = {}) {
  if (!isSupabaseConfigured || !supabase || !toNullableUuid(organisationId)) return null
  const scopedOrganisationId = toNullableUuid(organisationId)
  const scopedLeadId = toNullableUuid(leadId)
  const scopedTransactionId = toNullableUuid(transactionId)
  const existing = await supabase
    .from('workflow_alerts')
    .select('id')
    .eq('organisation_id', scopedOrganisationId)
    .eq('alert_type', alert.alertType)
    .eq('status', 'open')
    .eq(scopedLeadId ? 'lead_id' : 'transaction_id', scopedLeadId || scopedTransactionId)
    .maybeSingle()

  if (existing.error && !isMissingTableError(existing.error, 'workflow_alerts') && !isMissingColumnError(existing.error)) {
    throw existing.error
  }
  if (existing.data?.id) return existing.data

  const result = await supabase.from('workflow_alerts').insert({
    organisation_id: scopedOrganisationId,
    workflow_type: 'buyer',
    alert_type: alert.alertType || event,
    severity: alert.severity || 'info',
    title: alert.title || 'Workflow alert',
    message: alert.message || null,
    entity_type: scopedLeadId ? 'lead' : 'transaction',
    entity_id: scopedLeadId || scopedTransactionId,
    lead_id: scopedLeadId,
    transaction_id: scopedTransactionId,
    offer_id: toNullableUuid(offerId),
    assigned_role: alert.assignedRole || 'agent_manager',
    assigned_user_id: toNullableUuid(actor?.id),
    due_at: dueIso({ hours: alert.dueHours || 24 }),
    metadata_json: metadata && typeof metadata === 'object' ? metadata : {},
  }).select('id').maybeSingle()

  if (result.error && !isMissingTableError(result.error, 'workflow_alerts') && !isMissingColumnError(result.error)) {
    throw result.error
  }
  return result.data || null
}

export async function ensureTransactionWorkflowLanes({
  organisationId = '',
  transactionId = '',
  actor = null,
  metadata = {},
} = {}) {
  const scopedOrganisationId = toNullableUuid(organisationId)
  const scopedTransactionId = toNullableUuid(transactionId)
  if (!isSupabaseConfigured || !supabase || !scopedOrganisationId || !scopedTransactionId) return []

  const laneSeeds = [
    { lane_type: 'main', current_stage: 'Transaction Open', owner_role: 'agent' },
    { lane_type: 'finance', current_stage: 'Application Started', owner_role: 'bond_originator' },
    { lane_type: 'transfer', current_stage: 'Instruction Received', owner_role: 'attorney' },
  ]

  const rows = laneSeeds.map((lane) => ({
    organisation_id: scopedOrganisationId,
    transaction_id: scopedTransactionId,
    lane_type: lane.lane_type,
    current_stage: lane.current_stage,
    status: 'active',
    owner_role: lane.owner_role,
    owner_user_id: lane.owner_role === 'agent' ? toNullableUuid(actor?.id) : null,
    metadata_json: metadata && typeof metadata === 'object' ? metadata : {},
  }))

  const result = await supabase
    .from('transaction_workflow_lanes')
    .upsert(rows, { onConflict: 'transaction_id,lane_type', ignoreDuplicates: true })
    .select('*')

  if (result.error && !isMissingTableError(result.error, 'transaction_workflow_lanes') && !isMissingColumnError(result.error)) {
    throw result.error
  }
  return Array.isArray(result.data) ? result.data : []
}

export async function runWorkflowAutomations({
  organisationId = '',
  event = '',
  leadId = '',
  transactionId = '',
  offerId = '',
  actor = null,
  fromStage = '',
  toStage = '',
  metadata = {},
} = {}) {
  const normalizedEvent = normalizeLower(event)
  if (!normalizedEvent) return { tasks: [], alerts: [], lanes: [] }

  await recordWorkflowAudit({
    organisationId,
    leadId,
    transactionId,
    offerId,
    fromStage,
    toStage,
    eventType: normalizedEvent,
    actor,
    allowed: true,
    metadata,
  }).catch(() => null)

  const taskConfigs = AUTOMATION_TASKS[normalizedEvent] || []
  const alertConfigs = AUTOMATION_ALERTS[normalizedEvent] || []
  const tasks = []
  const alerts = []

  for (const task of taskConfigs) {
    const created = await createGeneratedTaskRecord({
      organisationId,
      event: normalizedEvent,
      task,
      leadId,
      transactionId,
      offerId,
      actor,
      metadata,
    }).catch(() => null)
    if (created) tasks.push(created)
  }

  for (const alert of alertConfigs) {
    const created = await createWorkflowAlert({
      organisationId,
      event: normalizedEvent,
      alert,
      leadId,
      transactionId,
      offerId,
      actor,
      metadata,
    }).catch(() => null)
    if (created) alerts.push(created)
  }

  const lanes = normalizedEvent === WORKFLOW_EVENTS.TRANSACTION_CREATED
    ? await ensureTransactionWorkflowLanes({ organisationId, transactionId, actor, metadata }).catch(() => [])
    : []

  await refreshBridgeIntelligenceForLifecycleEvent({
    organisationId,
    event: normalizedEvent,
    leadId,
    transactionId,
    offerId,
    metadata: {
      ...metadata,
      workflowAutomation: {
        generatedTaskCount: tasks.length,
        generatedAlertCount: alerts.length,
        generatedLaneCount: lanes.length,
      },
    },
  }).catch(() => null)

  return { tasks, alerts, lanes }
}

export async function transitionBuyerLeadStage({
  organisationId = '',
  lead = null,
  leadId = '',
  toStage = '',
  actor = null,
  options = {},
} = {}) {
  const scopedLeadId = normalizeText(leadId || lead?.leadId || lead?.lead_id)
  const currentStage = normalizeBuyerWorkflowStage(lead?.stage || lead?.status)
  const validation = await validateBuyerStageTransition({
    organisationId,
    lead,
    leadId: scopedLeadId,
    fromStage: currentStage,
    toStage,
    actor,
    options,
  })

  if (!validation.allowed) {
    throw new Error(validation.reason || 'Workflow transition is blocked.')
  }

  const nextStage = validation.toStage
  await updateAgencyCrmLeadRecord(organisationId, scopedLeadId, {
    currentStage: nextStage,
    stage: nextStage,
    status: nextStage,
  })
  await createAgencyCrmLeadActivity(
    organisationId,
    scopedLeadId,
    {
      agent: { id: actor?.id, name: actor?.fullName || actor?.name, email: actor?.email },
      activityType: validation.override ? 'Workflow Override' : 'Stage Change',
      activityNote: options.activityNote || `Workflow stage moved from ${validation.fromStage} to ${nextStage}`,
      outcome: nextStage,
    },
    { actor },
  ).catch(() => null)
  await runWorkflowAutomations({
    organisationId,
    event: WORKFLOW_EVENTS.MANUAL_STAGE_TRANSITION,
    leadId: scopedLeadId,
    actor,
    fromStage: validation.fromStage,
    toStage: nextStage,
    metadata: {
      override: validation.override,
      requirements: validation.requirements || [],
    },
  }).catch(() => null)

  return {
    leadId: scopedLeadId,
    stage: nextStage,
    validation,
  }
}
