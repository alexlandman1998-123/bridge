import { fetchOrganisationSettings } from '../lib/settingsApi'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { recordSecurityAuditEvent } from './auditLogService'

const SUPPORT_ROLES = new Set(['assistant', 'transaction_coordinator', 'listing_coordinator', 'admin_coordinator', 'admin_staff'])
const TRANSACTION_STATUSES_DONE = new Set(['registered', 'completed', 'archived', 'cancelled', 'canceled', 'deleted'])
const LISTING_STATUSES_DONE = new Set(['sold', 'archived', 'withdrawn', 'deleted'])
const LEAD_STATUSES_DONE = new Set(['lost', 'archived', 'converted', 'converted to transaction'])

export const SUPPORT_ROLE_PRESETS = Object.freeze({
  assistant: Object.freeze({
    label: 'Assistant',
    scope: 'Assigned agent scope',
    canOwnAssets: false,
    canReceiveCommission: false,
    canInviteUsers: false,
    canManageOrganisation: false,
    permissions: ['Edit assigned records', 'Upload documents', 'Schedule appointments', 'Send reminders', 'Coordinate communications'],
  }),
  transaction_coordinator: Object.freeze({
    label: 'Transaction Coordinator',
    scope: 'Branch transaction scope',
    canOwnAssets: false,
    canReceiveCommission: false,
    canInviteUsers: false,
    canManageOrganisation: false,
    permissions: ['Coordinate transactions', 'Upload transaction documents', 'Manage deadlines', 'Send reminders'],
  }),
  listing_coordinator: Object.freeze({
    label: 'Listing Coordinator',
    scope: 'Branch listing scope',
    canOwnAssets: false,
    canReceiveCommission: false,
    canInviteUsers: false,
    canManageOrganisation: false,
    permissions: ['Prepare listings', 'Upload photos', 'Edit descriptions', 'Coordinate seller documents', 'Manage publishing'],
  }),
  admin_coordinator: Object.freeze({
    label: 'Admin Coordinator',
    scope: 'Branch operational support scope',
    canOwnAssets: false,
    canReceiveCommission: false,
    canInviteUsers: false,
    canManageOrganisation: false,
    permissions: ['Create operational records', 'Edit branch records', 'Schedule appointments', 'Manage document follow-ups'],
  }),
})

export const SUPPORT_ACTIVITY_MATRIX = Object.freeze([
  { activity: 'Create lead', agent: true, assistant: false, coordinator: true },
  { activity: 'Edit assigned lead', agent: true, assistant: true, coordinator: true },
  { activity: 'Assign lead owner', agent: false, assistant: false, coordinator: false },
  { activity: 'Upload listing photos', agent: true, assistant: true, coordinator: true },
  { activity: 'Edit listing description', agent: true, assistant: true, coordinator: true },
  { activity: 'Transfer listing ownership', agent: false, assistant: false, coordinator: false },
  { activity: 'Upload transaction documents', agent: true, assistant: true, coordinator: true },
  { activity: 'Coordinate roleplayers', agent: true, assistant: true, coordinator: true },
  { activity: 'Transfer transaction owner', agent: false, assistant: false, coordinator: false },
  { activity: 'Create appointment', agent: true, assistant: true, coordinator: true },
  { activity: 'Reschedule appointment', agent: true, assistant: true, coordinator: true },
  { activity: 'Invite users', agent: false, assistant: false, coordinator: false },
])

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

function isMissingSchemaError(error) {
  const code = normalizeText(error?.code).toUpperCase()
  const message = normalizeLower(error?.message)
  return code === '42P01' || code === '42703' || code === 'PGRST204' || message.includes('schema cache') || message.includes('does not exist')
}

function getUserKeys(row = {}) {
  return [
    row.user_id,
    row.userId,
    row.assigned_user_id,
    row.assignedUserId,
    row.assigned_agent_id,
    row.assignedAgentId,
    row.owner_user_id,
    row.ownerUserId,
    row.created_by,
    row.createdBy,
    row.assigned_agent_email,
    row.assignedAgentEmail,
    row.email,
  ].map((value) => normalizeLower(value)).filter(Boolean)
}

function rowBelongsToSupportedUser(row = {}, supportedKeys = new Set()) {
  if (!supportedKeys.size) return false
  return getUserKeys(row).some((key) => supportedKeys.has(key))
}

function isOpenLead(row = {}) {
  return !LEAD_STATUSES_DONE.has(normalizeLower(row.status || row.stage))
}

function isOpenListing(row = {}) {
  return !LISTING_STATUSES_DONE.has(normalizeLower(row.listing_status || row.stage || row.status))
}

function isOpenTransaction(row = {}) {
  return !TRANSACTION_STATUSES_DONE.has(normalizeLower(row.lifecycle_state || row.stage || row.current_main_stage))
}

async function safeSelect(table, fields, organisationId, { order = 'updated_at', limit = 1000 } = {}) {
  if (!isSupabaseConfigured || !supabase || !organisationId) return []
  let query = supabase.from(table).select(fields).eq('organisation_id', organisationId)
  if (order) query = query.order(order, { ascending: false })
  if (limit) query = query.limit(limit)
  const { data, error } = await query
  if (error) {
    if (isMissingSchemaError(error)) return []
    throw error
  }
  return Array.isArray(data) ? data : []
}

async function listSupportAssignments(organisationId, assistantUserId) {
  if (!isSupabaseConfigured || !supabase || !organisationId || !assistantUserId) return []
  const { data, error } = await supabase
    .from('agent_support_assignments')
    .select('id, organisation_id, branch_id, assistant_user_id, supported_user_id, support_role, status, notification_enabled, created_at, updated_at')
    .eq('organisation_id', organisationId)
    .eq('assistant_user_id', assistantUserId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })

  if (error) {
    if (isMissingSchemaError(error)) return []
    throw error
  }
  return Array.isArray(data) ? data : []
}

async function listOrganisationUsers(organisationId) {
  return safeSelect(
    'organisation_users',
    'id, organisation_id, user_id, branch_id, primary_branch_id, first_name, last_name, email, role, status, last_active_at, updated_at, created_at',
    organisationId,
    { order: 'created_at', limit: 1000 },
  )
}

function normalizeUser(row = {}) {
  return {
    id: normalizeText(row.id),
    userId: normalizeText(row.user_id || row.userId),
    branchId: normalizeText(row.branch_id || row.primary_branch_id),
    name: [row.first_name, row.last_name].map(normalizeText).filter(Boolean).join(' ') || normalizeText(row.email) || 'Agent',
    email: normalizeText(row.email),
    role: normalizeLower(row.role),
    status: normalizeLower(row.status) || 'active',
    lastActiveAt: row.last_active_at || row.updated_at || row.created_at || null,
  }
}

export function isSupportRole(role = '') {
  return SUPPORT_ROLES.has(normalizeLower(role))
}

export function canSupportRoleOwnAssets(role = '') {
  return !isSupportRole(role)
}

function assertSupportAssignmentPayload({ assistantUserId = '', supportedUserId = '', supportRole = 'assistant' } = {}) {
  if (!assistantUserId) throw new Error('Assistant user is required.')
  if (!supportedUserId) throw new Error('Supported agent is required.')
  if (assistantUserId === supportedUserId) throw new Error('A user cannot support themselves as an assistant.')
  if (!SUPPORT_ROLE_PRESETS[supportRole]) throw new Error('Unsupported assistant/coordinator role.')
}

export async function createAgentSupportAssignment({
  assistantUserId = '',
  supportedUserId = '',
  branchId = '',
  supportRole = 'assistant',
  notificationEnabled = true,
  metadata = {},
} = {}) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is required before assigning assistants.')
  }
  const context = await fetchOrganisationSettings()
  const organisationId = normalizeText(context?.organisation?.id)
  const actorId = normalizeText(context?.profile?.id)
  const normalizedSupportRole = SUPPORT_ROLE_PRESETS[normalizeLower(supportRole)] ? normalizeLower(supportRole) : 'assistant'
  assertSupportAssignmentPayload({ assistantUserId, supportedUserId, supportRole: normalizedSupportRole })
  if (!organisationId) throw new Error('Organisation context is required before assigning assistants.')

  const payload = {
    organisation_id: organisationId,
    assistant_user_id: assistantUserId,
    supported_user_id: supportedUserId,
    branch_id: branchId || context?.membershipBranchId || context?.membershipPrimaryBranchId || null,
    support_role: normalizedSupportRole,
    status: 'active',
    notification_enabled: notificationEnabled !== false,
    metadata_json: metadata && typeof metadata === 'object' ? metadata : {},
  }

  const existing = await supabase
    .from('agent_support_assignments')
    .select('id')
    .eq('organisation_id', organisationId)
    .eq('assistant_user_id', assistantUserId)
    .eq('supported_user_id', supportedUserId)
    .eq('support_role', normalizedSupportRole)
    .eq('status', 'active')
    .maybeSingle()

  if (existing.error) throw existing.error

  const result = existing.data?.id
    ? await supabase
      .from('agent_support_assignments')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', existing.data.id)
      .select('id, organisation_id, branch_id, assistant_user_id, supported_user_id, support_role, status, notification_enabled, created_at, updated_at')
      .single()
    : await supabase
      .from('agent_support_assignments')
      .insert(payload)
      .select('id, organisation_id, branch_id, assistant_user_id, supported_user_id, support_role, status, notification_enabled, created_at, updated_at')
      .single()

  if (result.error) throw result.error
  const data = result.data

  void recordSecurityAuditEvent({
    userId: actorId,
    workspaceId: organisationId,
    action: 'assistant_assigned',
    targetType: 'agent_support_assignment',
    targetId: data?.id,
    metadata: {
      assistantUserId,
      supportedUserId,
      supportRole: normalizedSupportRole,
      ownershipChanged: false,
      commissionAttributionChanged: false,
    },
  })

  return data
}

export async function revokeAgentSupportAssignment(assignmentId = '', reason = 'Support assignment revoked') {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is required before revoking assistant assignments.')
  }
  const context = await fetchOrganisationSettings()
  const organisationId = normalizeText(context?.organisation?.id)
  const actorId = normalizeText(context?.profile?.id)
  const safeAssignmentId = normalizeText(assignmentId)
  if (!organisationId || !safeAssignmentId) throw new Error('Assignment and organisation context are required.')

  const { data, error } = await supabase
    .from('agent_support_assignments')
    .update({ status: 'revoked', updated_at: new Date().toISOString() })
    .eq('id', safeAssignmentId)
    .eq('organisation_id', organisationId)
    .select('id, assistant_user_id, supported_user_id, support_role')
    .single()

  if (error) throw error

  void recordSecurityAuditEvent({
    userId: actorId,
    workspaceId: organisationId,
    action: 'assistant_assignment_revoked',
    targetType: 'agent_support_assignment',
    targetId: safeAssignmentId,
    metadata: {
      assistantUserId: data?.assistant_user_id || null,
      supportedUserId: data?.supported_user_id || null,
      supportRole: data?.support_role || null,
      reason,
      ownershipChanged: false,
      commissionAttributionChanged: false,
    },
  })

  return data
}

export async function getAssistantDashboardModel() {
  const context = await fetchOrganisationSettings()
  const organisationId = normalizeText(context?.organisation?.id)
  const currentUserId = normalizeText(context?.profile?.id)
  const currentRole = normalizeLower(context?.membershipRole || 'viewer')
  const branchId = normalizeText(context?.membershipBranchId || context?.membershipPrimaryBranchId)
  const supportRole = SUPPORT_ROLE_PRESETS[currentRole] ? currentRole : 'assistant'

  if (!organisationId || !currentUserId) {
    return {
      context,
      supportRole,
      preset: SUPPORT_ROLE_PRESETS[supportRole],
      assignments: [],
      assignedAgents: [],
      leads: [],
      listings: [],
      transactions: [],
      appointments: [],
      pendingDocuments: [],
      totals: { agents: 0, leads: 0, listings: 0, transactions: 0, appointments: 0, pendingDocuments: 0 },
    }
  }

  const [assignments, users, leads, listings, transactions, appointments, documentRequests] = await Promise.all([
    listSupportAssignments(organisationId, currentUserId),
    listOrganisationUsers(organisationId),
    safeSelect('leads', 'lead_id, organisation_id, branch_id, assigned_user_id, assigned_agent_id, assigned_agent_email, lead_category, status, stage, created_at, updated_at', organisationId),
    safeSelect('private_listings', 'id, organisation_id, branch_id, assigned_agent_id, assigned_agent_email, listing_title, title, listing_status, stage, created_at, updated_at', organisationId),
    safeSelect('transactions', 'id, organisation_id, assigned_branch_id, assigned_user_id, assigned_agent_id, assigned_agent_email, owner_user_id, transaction_reference, property_address_line_1, lifecycle_state, stage, current_main_stage, created_at, updated_at', organisationId),
    safeSelect('appointments', 'appointment_id, organisation_id, branch_id, agent_id, assigned_user_id, title, appointment_type, status, date_time, appointment_date, created_at, updated_at', organisationId, { order: 'date_time', limit: 1000 }),
    safeSelect('document_requests', 'id, organisation_id, transaction_id, assigned_to_user_id, created_by, title, status, request_type, created_at, updated_at', organisationId),
  ])

  const usersByUserId = new Map(users.map(normalizeUser).filter((user) => user.userId).map((user) => [user.userId, user]))
  const supportedUserIds = new Set(assignments.map((row) => normalizeText(row.supported_user_id)).filter(Boolean))
  const supportedKeys = new Set()
  for (const supportedUserId of supportedUserIds) {
    supportedKeys.add(normalizeLower(supportedUserId))
    const user = usersByUserId.get(supportedUserId)
    if (user?.email) supportedKeys.add(normalizeLower(user.email))
  }

  const branchScopedCoordinator = ['transaction_coordinator', 'listing_coordinator', 'admin_coordinator'].includes(currentRole)
  const inBranch = (row = {}) => {
    if (!branchScopedCoordinator || !branchId) return false
    return [row.branch_id, row.branchId, row.assigned_branch_id, row.assignedBranchId].map(normalizeText).includes(branchId)
  }
  const visibleByDelegation = (row = {}) => rowBelongsToSupportedUser(row, supportedKeys)
  const visibleRecords = (rows = []) => rows.filter((row) => visibleByDelegation(row) || inBranch(row))

  const visibleLeads = currentRole === 'transaction_coordinator'
    ? []
    : visibleRecords(leads).filter(isOpenLead)
  const visibleListings = currentRole === 'transaction_coordinator'
    ? []
    : visibleRecords(listings).filter(isOpenListing)
  const visibleTransactions = currentRole === 'listing_coordinator'
    ? []
    : visibleRecords(transactions).filter(isOpenTransaction)
  const visibleAppointments = visibleRecords(appointments).filter((row) => !['cancelled', 'canceled', 'completed'].includes(normalizeLower(row.status)))
  const visibleDocumentRequests = documentRequests.filter((row) =>
    visibleTransactions.some((transaction) => normalizeText(transaction.id) === normalizeText(row.transaction_id)) ||
    supportedKeys.has(normalizeLower(row.assigned_to_user_id)) ||
    supportedKeys.has(normalizeLower(row.created_by)),
  )

  const assignedAgents = [...supportedUserIds]
    .map((userId) => usersByUserId.get(userId))
    .filter(Boolean)

  return {
    context,
    supportRole,
    preset: SUPPORT_ROLE_PRESETS[supportRole],
    assignments,
    assignedAgents,
    leads: visibleLeads,
    listings: visibleListings,
    transactions: visibleTransactions,
    appointments: visibleAppointments,
    pendingDocuments: visibleDocumentRequests,
    totals: {
      agents: assignedAgents.length,
      leads: visibleLeads.length,
      listings: visibleListings.length,
      transactions: visibleTransactions.length,
      appointments: visibleAppointments.length,
      pendingDocuments: visibleDocumentRequests.length,
      workload: toNumber(visibleLeads.length) + toNumber(visibleListings.length) + toNumber(visibleTransactions.length) + toNumber(visibleAppointments.length) + toNumber(visibleDocumentRequests.length),
    },
  }
}
