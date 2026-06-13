import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { recordUniversalAssignmentEvent, UNIVERSAL_ASSIGNMENT_METHODS } from './universalAssignmentService'

export const QUEUE_TYPE_OPTIONS = Object.freeze([
  { value: 'transfer_matters', label: 'Transfer Matters' },
  { value: 'bond_matters', label: 'Bond Matters' },
  { value: 'bond_applications', label: 'Bond Applications' },
  { value: 'developments', label: 'Developments' },
  { value: 'commercial_matters', label: 'Commercial Matters' },
  { value: 'general', label: 'General Work' },
])

export const ASSIGNMENT_RULE_OPTIONS = Object.freeze([
  { value: 'manual_queue', label: 'Manual Queue' },
  { value: 'round_robin', label: 'Round Robin' },
  { value: 'branch_based', label: 'Branch Based' },
  { value: 'region_based', label: 'Region Based' },
  { value: 'manager_assignment', label: 'Manager Assignment' },
  { value: 'capacity_based', label: 'Capacity Based' },
])

function requireClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured for assignment queues.')
  }
  return supabase
}

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function toNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function assertRpcSuccess(result, fallbackMessage) {
  if (result.error) throw result.error
  if (result.data?.success === false) {
    throw new Error(result.data.code || fallbackMessage)
  }
  return result.data || {}
}

export function getQueueTypeLabel(value) {
  const normalized = normalizeLower(value)
  return QUEUE_TYPE_OPTIONS.find((option) => option.value === normalized)?.label || 'General Work'
}

export function getAssignmentRuleLabel(value) {
  const normalized = normalizeLower(value)
  return ASSIGNMENT_RULE_OPTIONS.find((option) => option.value === normalized)?.label || 'Manual Queue'
}

export function toWorkQueue(row = {}) {
  const queueType = normalizeLower(row.queue_type || row.queueType) || 'general'
  return {
    id: row.id || '',
    organizationId: row.organization_id || row.organizationId || '',
    branchId: row.branch_id || row.branchId || null,
    branchName: normalizeText(row.branch_name || row.branchName),
    queueName: normalizeText(row.queue_name || row.queueName) || getQueueTypeLabel(queueType),
    queueType,
    queueTypeLabel: getQueueTypeLabel(queueType),
    status: normalizeLower(row.status) || 'active',
    slaHours: toNumber(row.sla_hours || row.slaHours || 24),
    waitingCount: toNumber(row.waiting_count || row.waitingCount),
    assignedCount: toNumber(row.assigned_count || row.assignedCount),
    completedCount: toNumber(row.completed_count || row.completedCount),
    slaWarningCount: toNumber(row.sla_warning_count || row.slaWarningCount),
    averageAssignmentMinutes: toNumber(row.average_assignment_minutes || row.averageAssignmentMinutes),
    createdAt: row.created_at || row.createdAt || null,
    updatedAt: row.updated_at || row.updatedAt || null,
  }
}

export function toAssignmentRule(row = {}) {
  const ruleType = normalizeLower(row.rule_type || row.ruleType) || 'manual_queue'
  return {
    id: row.id || '',
    organizationId: row.organization_id || row.organizationId || '',
    branchId: row.branch_id || row.branchId || null,
    queueId: row.queue_id || row.queueId || '',
    ruleName: normalizeText(row.rule_name || row.ruleName) || getAssignmentRuleLabel(ruleType),
    ruleType,
    ruleTypeLabel: getAssignmentRuleLabel(ruleType),
    priority: toNumber(row.priority || 100),
    active: row.active !== false,
    config: row.config && typeof row.config === 'object' ? row.config : {},
    createdAt: row.created_at || row.createdAt || null,
    updatedAt: row.updated_at || row.updatedAt || null,
  }
}

export function toQueueItem(row = {}) {
  const status = normalizeLower(row.status) || 'waiting'
  return {
    id: row.id || '',
    transactionId: row.transaction_id || row.transactionId || '',
    roleplayerId: row.roleplayer_id || row.roleplayerId || null,
    queueId: row.queue_id || row.queueId || '',
    queueName: normalizeText(row.queue_name || row.queueName),
    queueType: normalizeLower(row.queue_type || row.queueType),
    organizationId: row.organization_id || row.organizationId || '',
    regionId: row.region_id || row.regionId || null,
    branchId: row.branch_id || row.branchId || null,
    branchName: normalizeText(row.branch_name || row.branchName),
    assignedUserId: row.assigned_user_id || row.assignedUserId || null,
    assignedUserName: normalizeText(row.assigned_user_name || row.assignedUserName),
    status,
    sourceRoleType: normalizeLower(row.source_role_type || row.sourceRoleType),
    assignmentMethod: normalizeLower(row.assignment_method || row.assignmentMethod),
    assignmentMethodLabel: getAssignmentRuleLabel(row.assignment_method || row.assignmentMethod),
    reference: normalizeText(row.transaction_reference || row.transactionReference || row.matter_number || row.matterNumber),
    propertyLabel: normalizeText([row.property_address_line_1 || row.propertyAddressLine1, row.suburb, row.city].filter(Boolean).join(', ')),
    arrivedAt: row.arrived_at || row.arrivedAt || null,
    assignedAt: row.assigned_at || row.assignedAt || null,
    completedAt: row.completed_at || row.completedAt || null,
    metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
  }
}

export function toQueueUser(row = {}) {
  return {
    userId: row.user_id || row.userId || '',
    fullName: normalizeText(row.full_name || row.fullName || row.email) || 'Unnamed user',
    email: normalizeText(row.email),
    branchId: row.branch_id || row.branchId || null,
    branchName: normalizeText(row.branch_name || row.branchName),
    activeWorkCount: toNumber(row.active_work_count || row.activeWorkCount),
  }
}

export function normalizeQueueDashboardPayload(data = {}) {
  return {
    queues: (Array.isArray(data.queues) ? data.queues : []).map(toWorkQueue),
    items: (Array.isArray(data.items) ? data.items : []).map(toQueueItem),
    rules: (Array.isArray(data.rules) ? data.rules : []).map(toAssignmentRule),
    users: (Array.isArray(data.users) ? data.users : []).map(toQueueUser),
    canManageQueues: data.canManageQueues === true || data.can_manage_queues === true,
  }
}

export async function getQueueDashboard(organizationId) {
  const client = requireClient()
  if (!organizationId) throw new Error('Organization is required.')
  const result = await client.rpc('bridge_phase6_list_queue_dashboard', {
    p_organization_id: organizationId,
  })
  if (result.error?.code === '42883') {
    return normalizeQueueDashboardPayload({})
  }
  return normalizeQueueDashboardPayload(assertRpcSuccess(result, 'Unable to load queues.'))
}

export async function createWorkQueue({ organizationId, queue } = {}) {
  const client = requireClient()
  if (!organizationId) throw new Error('Organization is required.')
  const result = await client.rpc('bridge_phase6_create_queue', {
    p_organization_id: organizationId,
    p_queue: {
      queueName: normalizeText(queue?.queueName),
      queueType: normalizeLower(queue?.queueType) || 'general',
      branchId: queue?.branchId || null,
      slaHours: queue?.slaHours || 24,
    },
  })
  const data = assertRpcSuccess(result, 'Unable to create queue.')
  return toWorkQueue(data.queue || {})
}

export async function upsertAssignmentRule({ organizationId, rule } = {}) {
  const client = requireClient()
  if (!organizationId) throw new Error('Organization is required.')
  const result = await client.rpc('bridge_phase6_upsert_assignment_rule', {
    p_organization_id: organizationId,
    p_rule: {
      id: rule?.id || null,
      queueId: rule?.queueId || '',
      ruleName: normalizeText(rule?.ruleName),
      ruleType: normalizeLower(rule?.ruleType) || 'manual_queue',
      priority: rule?.priority || 100,
      active: rule?.active !== false,
      config: rule?.config || {},
    },
  })
  const data = assertRpcSuccess(result, 'Unable to save assignment rule.')
  return toAssignmentRule(data.rule || {})
}

export async function assignQueueItem({ queueItemId, assignedUserId = null, assignmentMethod = 'manual' } = {}) {
  const client = requireClient()
  if (!queueItemId) throw new Error('Queue item is required.')
  const result = await client.rpc('bridge_phase6_assign_queue_item', {
    p_queue_item_id: queueItemId,
    p_assigned_user_id: assignedUserId || null,
    p_assignment_method: assignmentMethod,
  })
  const data = assertRpcSuccess(result, 'Unable to assign queue item.')
  const queueItem = toQueueItem(data.queueItem || data.queue_item || {})
  try {
    await recordUniversalAssignmentEvent('assignment.queue_allocated', {
      itemType: 'queue_item',
      itemId: queueItem.id || queueItemId,
      assignedUserId: queueItem.assignedUserId || assignedUserId || null,
      assignedQueueId: queueItem.queueId || null,
      organisationId: queueItem.organizationId || null,
      branchId: queueItem.branchId || null,
      regionId: queueItem.regionId || null,
      assignmentMethod: assignmentMethod || UNIVERSAL_ASSIGNMENT_METHODS.queueAllocation,
      sourceModule: 'assignment_engine',
      sourceEvent: 'assign_queue_item',
      reason: 'Queue item assigned through the universal assignment engine.',
    })
  } catch (error) {
    console.warn('[assignmentEngineService] universal assignment event skipped', error)
  }
  return queueItem
}

export async function completeQueueItem(queueItemId) {
  const client = requireClient()
  if (!queueItemId) throw new Error('Queue item is required.')
  const result = await client.rpc('bridge_phase6_complete_queue_item', {
    p_queue_item_id: queueItemId,
  })
  const data = assertRpcSuccess(result, 'Unable to complete queue item.')
  const queueItem = toQueueItem(data.queueItem || data.queue_item || {})
  try {
    await recordUniversalAssignmentEvent('assignment.completed', {
      itemType: 'queue_item',
      itemId: queueItem.id || queueItemId,
      assignedUserId: queueItem.assignedUserId || null,
      assignedQueueId: queueItem.queueId || null,
      organizationId: queueItem.organizationId || null,
      branchId: queueItem.branchId || null,
      regionId: queueItem.regionId || null,
      assignmentMethod: UNIVERSAL_ASSIGNMENT_METHODS.systemGenerated,
      sourceModule: 'assignment_engine',
      sourceEvent: 'complete_queue_item',
      reason: 'Queue item completed through the universal assignment engine.',
    })
  } catch (error) {
    console.warn('[assignmentEngineService] universal completion event skipped', error)
  }
  return queueItem
}

export const __assignmentEngineServiceTestUtils = {
  getAssignmentRuleLabel,
  getQueueTypeLabel,
  normalizeQueueDashboardPayload,
  toAssignmentRule,
  toQueueItem,
  toQueueUser,
  toWorkQueue,
}
