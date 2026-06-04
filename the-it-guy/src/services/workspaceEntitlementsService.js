import {
  ENTITLEMENT_KEYS,
  WORKSPACE_PLAN_KEYS,
  WORKSPACE_SUBSCRIPTION_STATUSES,
  getWorkspacePlanDefinition,
  mergeEntitlements,
  normalizePlanKey,
  resolveDefaultWorkspacePlanKey,
} from '../constants/workspaceEntitlements'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'

function normalizeText(value) {
  return String(value || '').trim()
}

export class WorkspaceEntitlementLimitError extends Error {
  constructor(message, details = {}) {
    super(message)
    this.name = 'WorkspaceEntitlementLimitError'
    this.code = 'WORKSPACE_ENTITLEMENT_LIMIT_EXCEEDED'
    this.details = details
  }
}

function isMissingSchemaError(error, token = '') {
  if (!error) return false
  const code = String(error.code || '').toLowerCase()
  const message = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase()
  return (
    code === '42p01' ||
    code === '42703' ||
    code === '42883' ||
    code === 'pgrst202' ||
    code === 'pgrst204' ||
    code === 'pgrst205' ||
    message.includes(token.toLowerCase())
  )
}

function requireClient() {
  if (!isSupabaseConfigured || !supabase) {
    return null
  }
  return supabase
}

function buildFallbackSubscription({ workspaceId = '', workspaceType = '', workspaceKind = '' } = {}) {
  const planKey = resolveDefaultWorkspacePlanKey({ workspaceType, workspaceKind })
  const plan = getWorkspacePlanDefinition(planKey)
  return {
    id: '',
    workspaceId: normalizeText(workspaceId),
    planKey,
    planName: plan.name,
    description: plan.description,
    status: WORKSPACE_SUBSCRIPTION_STATUSES.trialing,
    billingCycle: 'monthly',
    monthlyAmount: plan.monthlyAmount,
    trialEndsAt: null,
    currentPeriodEndsAt: null,
    entitlements: { ...plan.entitlements },
    source: 'fallback',
  }
}

function normalizeSubscriptionRow(row = {}, workspace = {}) {
  const fallbackPlanKey = resolveDefaultWorkspacePlanKey({
    workspaceType: workspace.workspaceType,
    workspaceKind: workspace.workspaceKind,
  })
  const planKey = normalizePlanKey(row.plan_key || row.planKey, fallbackPlanKey)
  const plan = getWorkspacePlanDefinition(planKey)
  const entitlements = mergeEntitlements(plan.entitlements, row.entitlements || row.entitlement_overrides || {})
  return {
    id: normalizeText(row.id),
    workspaceId: normalizeText(row.organisation_id || row.organisationId || workspace.workspaceId),
    planKey,
    planName: normalizeText(row.plan_name || row.planName) || plan.name,
    description: normalizeText(row.description) || plan.description,
    status: normalizeText(row.status) || WORKSPACE_SUBSCRIPTION_STATUSES.trialing,
    billingCycle: normalizeText(row.billing_cycle || row.billingCycle) || 'monthly',
    monthlyAmount: row.monthly_amount !== undefined ? Number(row.monthly_amount || 0) / 100 : plan.monthlyAmount,
    trialEndsAt: row.trial_ends_at || row.trialEndsAt || null,
    currentPeriodEndsAt: row.current_period_ends_at || row.currentPeriodEndsAt || null,
    entitlements,
    source: row.id ? 'database' : 'fallback',
  }
}

function normalizePlanCatalogRow(row = {}) {
  const planKey = normalizePlanKey(row.plan_key || row.planKey)
  const localPlan = getWorkspacePlanDefinition(planKey)
  return {
    key: planKey,
    name: normalizeText(row.plan_name || row.planName) || localPlan.name,
    description: normalizeText(row.description) || localPlan.description,
    billingModel: normalizeText(row.billing_model || row.billingModel) || (planKey === WORKSPACE_PLAN_KEYS.enterprise ? 'contract' : 'subscription'),
    monthlyAmount: row.monthly_amount !== undefined ? Number(row.monthly_amount || 0) / 100 : localPlan.monthlyAmount,
    entitlements: row.default_entitlements || row.entitlements || localPlan.entitlements,
    active: row.active !== false,
    sortOrder: Number(row.sort_order || row.sortOrder || 100),
  }
}

function normalizePlanChangeRequestRow(row = {}) {
  return {
    id: normalizeText(row.id),
    workspaceId: normalizeText(row.organisation_id || row.organisationId),
    currentPlanKey: normalizeText(row.current_plan_key || row.currentPlanKey),
    requestedPlanKey: normalizeText(row.requested_plan_key || row.requestedPlanKey),
    status: normalizeText(row.status) || 'pending',
    note: normalizeText(row.note),
    reviewNote: normalizeText(row.review_note || row.reviewNote),
    requestedBy: normalizeText(row.requested_by || row.requestedBy),
    reviewedBy: normalizeText(row.reviewed_by || row.reviewedBy),
    reviewedAt: row.reviewed_at || row.reviewedAt || null,
    metadata: row.metadata || {},
    createdAt: row.created_at || row.createdAt || null,
    updatedAt: row.updated_at || row.updatedAt || null,
  }
}

function normalizeBillingEventRow(row = {}) {
  return {
    id: normalizeText(row.id),
    workspaceId: normalizeText(row.organisation_id || row.organisationId),
    subscriptionId: normalizeText(row.subscription_id || row.subscriptionId),
    requestId: normalizeText(row.request_id || row.requestId),
    eventType: normalizeText(row.event_type || row.eventType),
    actorUserId: normalizeText(row.actor_user_id || row.actorUserId),
    previousPlanKey: normalizeText(row.previous_plan_key || row.previousPlanKey),
    nextPlanKey: normalizeText(row.next_plan_key || row.nextPlanKey),
    metadata: row.metadata || {},
    createdAt: row.created_at || row.createdAt || null,
  }
}

function applyOverrideRows(subscription, rows = []) {
  if (!rows.length) return subscription
  const overrides = rows.reduce((accumulator, row) => {
    const key = normalizeText(row.entitlement_key)
    if (!key) return accumulator
    accumulator[key] = row.entitlement_value
    return accumulator
  }, {})
  return {
    ...subscription,
    entitlements: mergeEntitlements(subscription.entitlements, overrides),
    overrideCount: rows.length,
  }
}

async function fetchUsage(client, workspaceId) {
  if (!client || !workspaceId) return { activeUsers: 0, activeBranches: 0, monthlyBondApplications: 0 }
  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()

  const [users, branches, applications] = await Promise.all([
    client
      .from('organisation_users')
      .select('id', { count: 'exact', head: true })
      .eq('organisation_id', workspaceId)
      .in('status', ['active', 'invited', 'pending']),
    client
      .from('organisation_branches')
      .select('id', { count: 'exact', head: true })
      .eq('organisation_id', workspaceId)
      .eq('is_active', true),
    client
      .from('transaction_bond_applications')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_organisation_id', workspaceId)
      .gte('created_at', monthStart),
  ])

  return {
    activeUsers: users.error && isMissingSchemaError(users.error, 'organisation_users') ? 0 : users.count || 0,
    activeBranches: branches.error && isMissingSchemaError(branches.error, 'organisation_branches') ? 0 : branches.count || 0,
    monthlyBondApplications: applications.error && isMissingSchemaError(applications.error, 'transaction_bond_applications') ? 0 : applications.count || 0,
  }
}

export async function resolveWorkspaceEntitlements({
  workspaceId = '',
  workspaceType = '',
  workspaceKind = '',
} = {}) {
  const safeWorkspace = {
    workspaceId: normalizeText(workspaceId),
    workspaceType: normalizeText(workspaceType),
    workspaceKind: normalizeText(workspaceKind),
  }
  const fallback = buildFallbackSubscription(safeWorkspace)
  const client = requireClient()
  if (!client || !safeWorkspace.workspaceId) {
    return {
      subscription: fallback,
      usage: { activeUsers: 0, activeBranches: 0, monthlyBondApplications: 0 },
      source: fallback.source,
    }
  }

  const subscriptionQuery = await client
    .from('workspace_subscriptions')
    .select('id, organisation_id, plan_key, plan_name, description, status, billing_cycle, monthly_amount, trial_ends_at, current_period_ends_at, entitlements')
    .eq('organisation_id', safeWorkspace.workspaceId)
    .maybeSingle()

  if (subscriptionQuery.error && !isMissingSchemaError(subscriptionQuery.error, 'workspace_subscriptions')) {
    throw subscriptionQuery.error
  }

  let subscription = normalizeSubscriptionRow(subscriptionQuery.data || fallback, safeWorkspace)
  const overridesQuery = await client
    .from('workspace_entitlement_overrides')
    .select('entitlement_key, entitlement_value')
    .eq('organisation_id', safeWorkspace.workspaceId)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)

  if (!overridesQuery.error) {
    subscription = applyOverrideRows(subscription, overridesQuery.data || [])
  } else if (!isMissingSchemaError(overridesQuery.error, 'workspace_entitlement_overrides')) {
    throw overridesQuery.error
  }

  const usage = await fetchUsage(client, safeWorkspace.workspaceId)
  return {
    subscription,
    usage,
    source: subscription.source,
  }
}

export async function listWorkspacePlanCatalog() {
  const localPlans = Object.values(WORKSPACE_PLAN_KEYS)
    .map((planKey) => normalizePlanCatalogRow({ plan_key: planKey }))
    .sort((left, right) => left.sortOrder - right.sortOrder)
  const client = requireClient()
  if (!client) return localPlans

  const query = await client
    .from('workspace_plan_catalog')
    .select('plan_key, plan_name, description, billing_model, monthly_amount, default_entitlements, active, sort_order')
    .eq('active', true)
    .order('sort_order', { ascending: true })

  if (query.error) {
    if (isMissingSchemaError(query.error, 'workspace_plan_catalog')) return localPlans
    throw query.error
  }

  return (query.data || []).map(normalizePlanCatalogRow)
}

export async function requestWorkspacePlanChange({
  workspaceId = '',
  planKey = '',
  note = '',
} = {}) {
  const safeWorkspaceId = normalizeText(workspaceId)
  const safePlanKey = normalizePlanKey(planKey, '')
  if (!safeWorkspaceId) throw new Error('Workspace is required before requesting a plan change.')
  if (!safePlanKey) throw new Error('Choose a valid workspace plan before requesting a plan change.')

  const client = requireClient()
  if (!client) {
    return {
      id: '',
      workspaceId: safeWorkspaceId,
      requestedPlanKey: safePlanKey,
      status: 'pending',
      source: 'local',
    }
  }

  const rpc = await client.rpc('bridge_request_workspace_plan_change', {
    p_organisation_id: safeWorkspaceId,
    p_plan_key: safePlanKey,
    p_note: normalizeText(note) || null,
  })

  if (!rpc.error) {
    return {
      ...(rpc.data || {}),
      workspaceId: safeWorkspaceId,
      requestedPlanKey: safePlanKey,
      status: rpc.data?.status || 'pending',
      source: 'database',
    }
  }

  if (isMissingSchemaError(rpc.error, 'bridge_request_workspace_plan_change')) {
    throw new Error('Plan change requests are not installed yet. Apply the Phase 6 billing operations migration first.')
  }

  throw rpc.error
}

export async function listWorkspaceBillingActivity({ workspaceId = '', limit = 10 } = {}) {
  const safeWorkspaceId = normalizeText(workspaceId)
  if (!safeWorkspaceId) return { requests: [], events: [] }

  const client = requireClient()
  if (!client) return { requests: [], events: [] }

  const safeLimit = Math.max(1, Math.min(Number(limit) || 10, 50))
  const [requestsQuery, eventsQuery] = await Promise.all([
    client
      .from('workspace_plan_change_requests')
      .select('id, organisation_id, current_plan_key, requested_plan_key, status, note, requested_by, reviewed_by, reviewed_at, review_note, metadata, created_at, updated_at')
      .eq('organisation_id', safeWorkspaceId)
      .order('created_at', { ascending: false })
      .limit(safeLimit),
    client
      .from('workspace_billing_events')
      .select('id, organisation_id, subscription_id, request_id, event_type, actor_user_id, previous_plan_key, next_plan_key, metadata, created_at')
      .eq('organisation_id', safeWorkspaceId)
      .order('created_at', { ascending: false })
      .limit(safeLimit),
  ])

  if (requestsQuery.error && !isMissingSchemaError(requestsQuery.error, 'workspace_plan_change_requests')) {
    throw requestsQuery.error
  }
  if (eventsQuery.error && !isMissingSchemaError(eventsQuery.error, 'workspace_billing_events')) {
    throw eventsQuery.error
  }

  return {
    requests: requestsQuery.error ? [] : (requestsQuery.data || []).map(normalizePlanChangeRequestRow),
    events: eventsQuery.error ? [] : (eventsQuery.data || []).map(normalizeBillingEventRow),
  }
}

export async function cancelWorkspacePlanChange({ requestId = '' } = {}) {
  const safeRequestId = normalizeText(requestId)
  if (!safeRequestId) throw new Error('Plan change request is required before it can be canceled.')

  const client = requireClient()
  if (!client) {
    return { id: safeRequestId, status: 'canceled', source: 'local' }
  }

  const rpc = await client.rpc('bridge_cancel_workspace_plan_change', {
    p_request_id: safeRequestId,
  })

  if (!rpc.error) {
    return {
      ...(rpc.data || {}),
      id: rpc.data?.id || safeRequestId,
      status: rpc.data?.status || 'canceled',
      source: 'database',
    }
  }

  if (isMissingSchemaError(rpc.error, 'bridge_cancel_workspace_plan_change')) {
    throw new Error('Plan change cancellation is not installed yet. Apply the Phase 7 billing activity migration first.')
  }

  throw rpc.error
}

export function evaluateEntitlementLimit(entitlements = {}, usage = {}, entitlementKey = '') {
  const limit = entitlements[entitlementKey]
  const usageKeyByEntitlement = {
    [ENTITLEMENT_KEYS.maxUsers]: 'activeUsers',
    [ENTITLEMENT_KEYS.maxBranches]: 'activeBranches',
    [ENTITLEMENT_KEYS.monthlyBondApplications]: 'monthlyBondApplications',
  }
  const used = Number(usage[entitlementKey] ?? usage[usageKeyByEntitlement[entitlementKey]] ?? 0)
  if (limit === null || limit === undefined) return { limited: false, limit: null, used, remaining: null }
  const numericLimit = Number(limit)
  if (!Number.isFinite(numericLimit)) return { limited: false, limit, used, remaining: null }
  return {
    limited: true,
    limit: numericLimit,
    used,
    remaining: Math.max(0, numericLimit - used),
    exceeded: used > numericLimit,
  }
}

export function buildEntitlementLimitMessage({ entitlementKey = '', planName = 'your current plan', limit = null } = {}) {
  const limitText = limit === null || limit === undefined ? 'the included limit' : limit
  if (entitlementKey === ENTITLEMENT_KEYS.maxUsers) {
    return `This workspace has reached the ${limitText}-user limit on ${planName}. Upgrade the plan or remove a user before inviting another member.`
  }
  if (entitlementKey === ENTITLEMENT_KEYS.maxBranches) {
    return `This workspace has reached the ${limitText}-branch limit on ${planName}. Upgrade the plan or archive a branch before creating another one.`
  }
  if (entitlementKey === ENTITLEMENT_KEYS.monthlyBondApplications) {
    return `This workspace has reached the ${limitText}-application monthly limit on ${planName}. Upgrade the plan or wait for the next billing period before accepting another bond application.`
  }
  return `This workspace has reached an entitlement limit on ${planName}.`
}

export async function assertWorkspaceEntitlementLimit({
  workspaceId = '',
  workspaceType = '',
  workspaceKind = '',
  entitlementKey = '',
  increment = 1,
  usage = null,
} = {}) {
  const entitlementContext = await resolveWorkspaceEntitlements({ workspaceId, workspaceType, workspaceKind })
  const subscription = entitlementContext.subscription || {}
  const nextUsage = {
    ...(entitlementContext.usage || {}),
    ...(usage || {}),
  }
  const usageKeyByEntitlement = {
    [ENTITLEMENT_KEYS.maxUsers]: 'activeUsers',
    [ENTITLEMENT_KEYS.maxBranches]: 'activeBranches',
    [ENTITLEMENT_KEYS.monthlyBondApplications]: 'monthlyBondApplications',
  }
  const usageKey = usageKeyByEntitlement[entitlementKey] || entitlementKey
  nextUsage[usageKey] = Number(nextUsage[usageKey] || 0) + Number(increment || 0)
  const evaluation = evaluateEntitlementLimit(subscription.entitlements || {}, nextUsage, entitlementKey)
  if (!evaluation.limited || !evaluation.exceeded) {
    return {
      ok: true,
      entitlementContext,
      evaluation,
    }
  }

  const message = buildEntitlementLimitMessage({
    entitlementKey,
    planName: subscription.planName,
    limit: evaluation.limit,
  })
  throw new WorkspaceEntitlementLimitError(message, {
    entitlementKey,
    planKey: subscription.planKey,
    planName: subscription.planName,
    limit: evaluation.limit,
    used: evaluation.used,
    remaining: evaluation.remaining,
    workspaceId,
  })
}

export function buildBillingSummary(entitlementContext = {}) {
  const subscription = entitlementContext.subscription || buildFallbackSubscription()
  const usage = entitlementContext.usage || {}
  return {
    planName: subscription.planName,
    planKey: subscription.planKey || WORKSPACE_PLAN_KEYS.freeTrial,
    status: subscription.status,
    billingType: subscription.billingCycle,
    monthlyAmount: subscription.monthlyAmount,
    renewalDate: subscription.currentPeriodEndsAt,
    trialEndsAt: subscription.trialEndsAt,
    activeUsers: usage.activeUsers || 0,
    activeBranches: usage.activeBranches || 0,
    monthlyBondApplications: usage.monthlyBondApplications || 0,
    includedUsers: subscription.entitlements?.[ENTITLEMENT_KEYS.maxUsers] ?? null,
    includedBranches: subscription.entitlements?.[ENTITLEMENT_KEYS.maxBranches] ?? null,
    includedMonthlyBondApplications: subscription.entitlements?.[ENTITLEMENT_KEYS.monthlyBondApplications] ?? null,
    entitlements: subscription.entitlements || {},
    source: entitlementContext.source || subscription.source,
  }
}
