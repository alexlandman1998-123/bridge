import {
  getAuthenticatedUser,
  isMissingColumnError,
  isPermissionDeniedError,
  isMissingTableError,
  normalizeText,
  requireClient,
} from './attorneyFirmServiceShared'
import { getAttorneyFirmMembers } from './attorneyFirmMembers'
import { getAttorneyFirmById, getAttorneyFirmDepartments, getCurrentUserAttorneyFirms } from './attorneyFirms'
import { prepareBondAssignmentPayload } from './bondAssignmentService'
import { recordUniversalAssignmentEvent, UNIVERSAL_ASSIGNMENT_METHODS } from './universalAssignmentService'

export const ATTORNEY_ASSIGNMENT_TYPES = ['transfer', 'bond', 'transfer_and_bond', 'cancellation']
export const TRANSACTION_ATTORNEY_ROLES = ['transfer_attorney', 'bond_attorney', 'cancellation_attorney']
export const ATTORNEY_ASSIGNMENT_STATUSES = ['pending', 'active', 'paused', 'completed', 'removed']
const ATTORNEY_ASSIGNMENTS_MIGRATION_HINT = 'Attorney assignment table is not set up yet. Run the attorney assignment migrations and refresh.'
const APPOINTED_FIRM_MIGRATION_HINT = 'Appointed-firm acceptance is not set up yet. Run the Phase 4 legal role migration and refresh.'
const ASSIGNMENT_SELECT =
  'id, transaction_id, firm_id, attorney_firm_id, assignment_type, attorney_role, department_id, attorney_department_id, primary_attorney_id, attorney_user_id, secretary_id, admin_handler_id, status, assignment_status, is_primary, visibility_scope, can_edit, can_manage_documents, can_manage_signing, can_add_internal_notes, can_add_shared_updates, can_update_workflow_lane, assigned_by, assigned_at, created_at, updated_at'

const TRANSFER_PRIMARY_ROLES = new Set(['transfer_attorney', 'director_partner', 'firm_admin'])
const BOND_PRIMARY_ROLES = new Set(['bond_attorney', 'director_partner', 'firm_admin'])
const CANCELLATION_PRIMARY_ROLES = new Set(['cancellation_attorney', 'director_partner', 'firm_admin'])
const SECRETARY_ALLOWED_ROLES = new Set(['conveyancing_secretary', 'admin_staff', 'candidate_attorney'])
const ADMIN_ALLOWED_ROLES = new Set(['admin_staff', 'conveyancing_secretary', 'candidate_attorney'])
const BANK_APPOINTED_ATTORNEY_ROLES = new Set(['bond_attorney', 'cancellation_attorney'])

export function isBankAppointedAttorneyRole(role) {
  return BANK_APPOINTED_ATTORNEY_ROLES.has(normalizeText(role).toLowerCase())
}

function normalizeType(value) {
  const normalized = normalizeText(value).toLowerCase()
  if (!ATTORNEY_ASSIGNMENT_TYPES.includes(normalized)) {
    throw new Error('Assignment type must be transfer, bond, transfer_and_bond, or cancellation.')
  }
  return normalized
}

function typeToAttorneyRole(value) {
  const normalized = normalizeText(value).toLowerCase()
  if (normalized === 'bond') return 'bond_attorney'
  if (normalized === 'cancellation') return 'cancellation_attorney'
  return 'transfer_attorney'
}

function attorneyRoleToType(value) {
  const normalized = normalizeText(value).toLowerCase()
  if (normalized === 'bond_attorney') return 'bond'
  if (normalized === 'cancellation_attorney') return 'cancellation'
  return 'transfer'
}

function normalizeAttorneyRole(value, fallbackType = 'transfer') {
  const normalized = normalizeText(value).toLowerCase()
  if (TRANSACTION_ATTORNEY_ROLES.includes(normalized)) return normalized
  return typeToAttorneyRole(fallbackType)
}

function normalizeStatus(value, fallback = 'active') {
  const normalized = normalizeText(value || fallback).toLowerCase()
  if (!ATTORNEY_ASSIGNMENT_STATUSES.includes(normalized)) {
    throw new Error('Assignment status must be pending, active, paused, completed, or removed.')
  }
  return normalized
}

function isActiveMembership(member) {
  return String(member?.status || '').trim().toLowerCase() === 'active'
}

function mapAssignmentRow(row) {
  if (!row) return null
  const assignmentType = row.assignment_type || attorneyRoleToType(row.attorney_role)
  const attorneyRole = normalizeAttorneyRole(row.attorney_role, assignmentType)
  const isPrimary = row.is_primary !== false
  const attorneyUserId = row.attorney_user_id || row.primary_attorney_id || null
  return {
    id: row.id,
    transactionId: row.transaction_id,
    firmId: row.attorney_firm_id || row.firm_id,
    attorneyFirmId: row.attorney_firm_id || row.firm_id,
    assignmentType,
    attorneyRole,
    attorneyRoleLabel: getAttorneyRoleLabel(attorneyRole),
    departmentId: row.attorney_department_id || row.department_id || null,
    attorneyDepartmentId: row.attorney_department_id || row.department_id || null,
    attorneyUserId,
    primaryAttorneyId: isPrimary ? attorneyUserId : row.primary_attorney_id || null,
    secretaryId: row.secretary_id || null,
    adminHandlerId: row.admin_handler_id || null,
    status: row.assignment_status || row.status,
    assignmentStatus: row.assignment_status || row.status,
    isPrimary,
    visibilityScope: row.visibility_scope || 'assigned_matter',
    canEdit: row.can_edit !== false,
    canManageDocuments: row.can_manage_documents !== false,
    canManageSigning: row.can_manage_signing !== false,
    canAddInternalNotes: row.can_add_internal_notes !== false,
    canAddSharedUpdates: row.can_add_shared_updates !== false,
    canUpdateWorkflowLane: row.can_update_workflow_lane !== false,
    assignedBy: row.assigned_by || null,
    assignedAt: row.assigned_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  }
}

export function getAttorneyRoleLabel(role) {
  const normalized = normalizeAttorneyRole(role)
  if (normalized === 'transfer_attorney') return 'Transfer Attorney'
  if (normalized === 'bond_attorney') return 'Bond Attorney'
  if (normalized === 'cancellation_attorney') return 'Cancellation Attorney'
  return 'Attorney'
}

export function getAssignmentTypeLabel(type) {
  const normalized = normalizeText(type).toLowerCase()
  if (TRANSACTION_ATTORNEY_ROLES.includes(normalized)) return getAttorneyRoleLabel(normalized)
  if (normalized === 'transfer') return 'Transfer Attorney'
  if (normalized === 'bond') return 'Bond Attorney'
  if (normalized === 'transfer_and_bond') return 'Transfer + Bond Attorney'
  if (normalized === 'cancellation') return 'Cancellation Attorney'
  return 'Attorney Assignment'
}

export function getAssignmentStatusLabel(status) {
  const normalized = normalizeText(status).toLowerCase()
  if (normalized === 'pending') return 'Pending'
  if (normalized === 'active') return 'Active'
  if (normalized === 'paused') return 'Paused'
  if (normalized === 'completed') return 'Completed'
  if (normalized === 'removed') return 'Removed'
  return 'Unknown'
}

async function getMembersByFirm(firmId) {
  const members = await getAttorneyFirmMembers(firmId)
  return members.filter(isActiveMembership)
}

function assertUserBelongsToFirm({ userId, membersByUserId, label }) {
  if (!userId) return
  if (!membersByUserId[userId]) {
    throw new Error(`${label} must belong to the selected firm and be active.`)
  }
}

async function assertActorCanManageAssignment(client, { actorId, firmId }) {
  const normalizedActorId = normalizeText(actorId)
  const normalizedFirmId = normalizeText(firmId)
  if (!normalizedActorId || !normalizedFirmId) {
    throw new Error('You do not have permission to assign attorneys to this transaction.')
  }

  const query = await client
    .from('attorney_firm_members')
    .select('id, role, status')
    .eq('firm_id', normalizedFirmId)
    .eq('user_id', normalizedActorId)
    .eq('status', 'active')
    .maybeSingle()

  if (query.error) {
    if (isMissingTableError(query.error, 'attorney_firm_members')) {
      throw new Error('You do not have permission to assign attorneys to this transaction.')
    }
    throw query.error
  }

  const role = normalizeText(query.data?.role).toLowerCase()
  if (['firm_admin', 'director_partner'].includes(role)) {
    return
  }

  const ownerFallback = await client
    .from('attorney_firms')
    .select('id, created_by')
    .eq('id', normalizedFirmId)
    .eq('created_by', normalizedActorId)
    .maybeSingle()

  if (ownerFallback.error || !ownerFallback.data?.id) {
    throw new Error('You do not have permission to assign attorneys to this transaction.')
  }
}

async function assertBankAppointedFirmAssignmentAuthority(client, { transactionId, attorneyRole, firmId, assignmentStatus, status }) {
  if (!isBankAppointedAttorneyRole(attorneyRole)) return

  if (assignmentStatus === 'removed' || status === 'removed') {
    throw new Error('A bank-appointed firm cannot be removed through staff assignment. Start the appointment replacement workflow instead.')
  }

  const query = await client
    .from('transaction_legal_role_appointments')
    .select('id, accepted_firm_id, coordination_state, staff_assignment_status')
    .eq('transaction_id', transactionId)
    .eq('role_type', attorneyRole)
    .in('coordination_state', ['invite_accepted', 'instruction_confirmed', 'active'])
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (query.error) {
    if (isMissingTableError(query.error, 'transaction_legal_role_appointments') || isMissingColumnError(query.error)) {
      throw new Error(APPOINTED_FIRM_MIGRATION_HINT)
    }
    throw query.error
  }

  if (!query.data?.accepted_firm_id) {
    throw new Error('The bank-appointed firm must accept its invitation before staff can be assigned.')
  }
  if (query.data.accepted_firm_id !== firmId) {
    throw new Error('Bond and cancellation staff must be assigned from the bank-appointed firm.')
  }
}

function assertRoleAllowed({ assignmentType, field, memberRole }) {
  const normalizedRole = String(memberRole || '').trim().toLowerCase()
  if (!normalizedRole) return

  if (field === 'supporting') {
    return
  }

  if (field === 'primary') {
    if (assignmentType === 'transfer' && !TRANSFER_PRIMARY_ROLES.has(normalizedRole)) {
      throw new Error('Primary transfer attorney role is not valid for this assignment.')
    }
    if (assignmentType === 'bond' && !BOND_PRIMARY_ROLES.has(normalizedRole)) {
      throw new Error('Primary bond attorney role is not valid for this assignment.')
    }
    if (assignmentType === 'transfer_and_bond' && !TRANSFER_PRIMARY_ROLES.has(normalizedRole) && !BOND_PRIMARY_ROLES.has(normalizedRole)) {
      throw new Error('Primary attorney role is not valid for a transfer and bond assignment.')
    }
    if (assignmentType === 'cancellation' && !CANCELLATION_PRIMARY_ROLES.has(normalizedRole)) {
      throw new Error('Primary cancellation attorney role is not valid for this assignment.')
    }
  }

  if (field === 'secretary' && !SECRETARY_ALLOWED_ROLES.has(normalizedRole)) {
    throw new Error('Selected secretary role is not valid for attorney assignments.')
  }

  if (field === 'admin' && !ADMIN_ALLOWED_ROLES.has(normalizedRole)) {
    throw new Error('Selected admin handler role is not valid for attorney assignments.')
  }
}

async function resolveTransactionFinanceType(client, transactionId) {
  const query = await client
    .from('transactions')
    .select('id, finance_type')
    .eq('id', transactionId)
    .maybeSingle()

  if (query.error) {
    if (isMissingTableError(query.error, 'transactions')) return null
    throw query.error
  }

  return String(query.data?.finance_type || '').trim().toLowerCase() || null
}

async function assertNoDuplicateActiveAssignment({
  client,
  transactionId,
  attorneyRole,
  attorneyUserId = null,
  isPrimary = true,
  ignoreAssignmentId = null,
}) {
  const normalizedRole = normalizeAttorneyRole(attorneyRole)

  if (isPrimary) {
    let primaryQuery = client
      .from('transaction_attorney_assignments')
      .select('id, attorney_role, assignment_status, is_primary')
      .eq('transaction_id', transactionId)
      .eq('attorney_role', normalizedRole)
      .eq('assignment_status', 'active')
      .eq('is_primary', true)

    if (ignoreAssignmentId) {
      primaryQuery = primaryQuery.neq('id', ignoreAssignmentId)
    }

    const primaryResult = await primaryQuery
    if (primaryResult.error) {
      if (isMissingTableError(primaryResult.error, 'transaction_attorney_assignments')) {
        throw new Error(ATTORNEY_ASSIGNMENTS_MIGRATION_HINT)
      }
      throw primaryResult.error
    }

    if ((primaryResult.data || []).length > 0) {
      throw new Error('A primary attorney already exists for this role.')
    }
  }

  if (!attorneyUserId) return

  let userQuery = client
    .from('transaction_attorney_assignments')
    .select('id, attorney_role, attorney_user_id, assignment_status')
    .eq('transaction_id', transactionId)
    .eq('attorney_role', normalizedRole)
    .eq('attorney_user_id', attorneyUserId)
    .neq('assignment_status', 'removed')

  if (ignoreAssignmentId) {
    userQuery = userQuery.neq('id', ignoreAssignmentId)
  }

  const result = await userQuery
  if (result.error) {
    if (isMissingTableError(result.error, 'transaction_attorney_assignments')) {
      throw new Error(ATTORNEY_ASSIGNMENTS_MIGRATION_HINT)
    }
    throw result.error
  }

  if ((result.data || []).length > 0) {
    throw new Error('This attorney is already assigned to this transaction role.')
  }
}

async function enrichAssignments(client, assignments = []) {
  if (!assignments.length) return []

  const transactionIds = [...new Set(assignments.map((item) => item.transactionId).filter(Boolean))]
  const firmIds = [...new Set(assignments.map((item) => item.firmId).filter(Boolean))]
  const userIds = [
    ...new Set(
      assignments
        .flatMap((item) => [item.attorneyUserId, item.primaryAttorneyId, item.secretaryId, item.adminHandlerId])
        .filter(Boolean),
    ),
  ]

  const [transactionsQuery, firms, profilesQuery, departmentsQuery] = await Promise.all([
    transactionIds.length
      ? client
          .from('transactions')
          .select('id, transaction_reference, finance_type, stage, current_main_stage, updated_at')
          .in('id', transactionIds)
      : Promise.resolve({ data: [], error: null }),
    Promise.all(firmIds.map((firmId) => getAttorneyFirmById(firmId))),
    userIds.length
      ? client.from('profiles').select('id, full_name, first_name, last_name, email').in('id', userIds)
      : Promise.resolve({ data: [], error: null }),
    firmIds.length
      ? Promise.all(firmIds.map((firmId) => getAttorneyFirmDepartments(firmId))).then((rows) => rows.flat())
      : Promise.resolve([]),
  ])

  if (transactionsQuery?.error && !isMissingTableError(transactionsQuery.error, 'transactions')) {
    throw transactionsQuery.error
  }
  if (profilesQuery?.error && !isMissingTableError(profilesQuery.error, 'profiles')) {
    throw profilesQuery.error
  }

  const transactionsById = (transactionsQuery?.data || []).reduce((accumulator, row) => {
    accumulator[row.id] = row
    return accumulator
  }, {})

  const firmsById = (firms || []).reduce((accumulator, firm) => {
    if (firm?.id) accumulator[firm.id] = firm
    return accumulator
  }, {})

  const profilesById = (profilesQuery?.data || []).reduce((accumulator, row) => {
    const fullName =
      String(row.full_name || '').trim() ||
      [row.first_name, row.last_name].map((value) => String(value || '').trim()).filter(Boolean).join(' ').trim()
    accumulator[row.id] = {
      id: row.id,
      name: fullName || row.email || 'Team Member',
      email: row.email || '',
    }
    return accumulator
  }, {})

  const departmentsById = (departmentsQuery || []).reduce((accumulator, department) => {
    if (department?.id) accumulator[department.id] = department
    return accumulator
  }, {})

  return assignments.map((assignment) => ({
    ...assignment,
    assignmentTypeLabel: getAssignmentTypeLabel(assignment.assignmentType),
    attorneyRoleLabel: getAttorneyRoleLabel(assignment.attorneyRole),
    statusLabel: getAssignmentStatusLabel(assignment.status),
    firm: firmsById[assignment.firmId] || null,
    department: departmentsById[assignment.departmentId] || null,
    transaction: transactionsById[assignment.transactionId] || null,
    attorneyUser: assignment.attorneyUserId ? profilesById[assignment.attorneyUserId] || null : null,
    primaryAttorney: assignment.primaryAttorneyId ? profilesById[assignment.primaryAttorneyId] || null : null,
    secretary: assignment.secretaryId ? profilesById[assignment.secretaryId] || null : null,
    adminHandler: assignment.adminHandlerId ? profilesById[assignment.adminHandlerId] || null : null,
  }))
}

async function logAttorneyAssignmentEvent(client, { transactionId, eventType, assignment, previousAssignment = null, actorId = null } = {}) {
  if (!transactionId || !eventType) return

  const assignmentLabel = assignment?.attorneyRoleLabel || getAttorneyRoleLabel(assignment?.attorneyRole)
  const firmName = assignment?.firm?.name || assignment?.firmId || 'Attorney firm'
  const attorneyName =
    assignment?.attorneyUser?.name ||
    assignment?.primaryAttorney?.name ||
    assignment?.attorneyUser?.email ||
    assignment?.primaryAttorney?.email ||
    'Unassigned attorney'
  const primaryLabel = assignment?.isPrimary ? 'primary' : 'supporting'

  const messages = {
    attorney_primary_assigned: `${assignmentLabel} assigned: ${firmName} / ${attorneyName}`,
    attorney_supporting_assigned: `Supporting attorney added to ${assignmentLabel}: ${firmName} / ${attorneyName}`,
    attorney_assignment_updated: `${assignmentLabel} assignment updated: ${firmName} / ${attorneyName}`,
    attorney_assignment_removed: `${assignmentLabel} assignment removed: ${firmName} / ${attorneyName}`,
    attorney_primary_replaced: `${assignmentLabel} reassigned: ${firmName} / ${attorneyName}`,
  }

  const insert = await client.from('transaction_events').insert({
    transaction_id: transactionId,
    event_type: eventType,
    event_data: {
      message: messages[eventType] || `${assignmentLabel} assignment changed.`,
      visibility: 'internal',
      attorneyRole: assignment?.attorneyRole || null,
      attorneyRoleLabel: assignmentLabel,
      assignmentId: assignment?.id || null,
      firmId: assignment?.firmId || null,
      attorneyUserId: assignment?.attorneyUserId || null,
      isPrimary: Boolean(assignment?.isPrimary),
      assignmentKind: primaryLabel,
      previousAssignmentId: previousAssignment?.id || null,
      previousAttorneyUserId: previousAssignment?.attorneyUserId || null,
    },
    created_by: actorId || null,
    created_by_role: 'attorney',
  })

  if (insert.error && !isMissingTableError(insert.error, 'transaction_events') && !isMissingColumnError(insert.error)) {
    throw insert.error
  }
}

export async function validateAttorneyAssignment(payload = {}, options = {}) {
  const client = options.client || requireClient()

  const transactionId = normalizeText(payload.transactionId)
  const firmId = normalizeText(payload.attorneyFirmId || payload.firmId)
  const assignmentType = normalizeType(payload.assignmentType || attorneyRoleToType(payload.attorneyRole))
  const attorneyRole = normalizeAttorneyRole(payload.attorneyRole, assignmentType)
  const status = normalizeStatus(payload.assignmentStatus || payload.status || 'active')
  const departmentId = normalizeText(payload.attorneyDepartmentId || payload.departmentId) || null
  const isPrimary = payload.isPrimary !== false
  const attorneyUserId = normalizeText(payload.attorneyUserId || payload.primaryAttorneyId) || null
  const primaryAttorneyId = isPrimary ? attorneyUserId : null
  const secretaryId = normalizeText(payload.secretaryId) || null
  const adminHandlerId = normalizeText(payload.adminHandlerId) || null
  const visibilityScope = normalizeText(payload.visibilityScope || payload.visibility_scope || 'assigned_matter') || 'assigned_matter'

  if (!transactionId) throw new Error('transaction_id is required.')
  if (!firmId) throw new Error('firm_id is required.')
  if (!attorneyUserId && !secretaryId && !adminHandlerId) throw new Error('Select at least one attorney or staff member for this assignment.')
  if (isPrimary && !attorneyUserId) throw new Error('A primary attorney is required for this role.')

  const [departments, activeMembers, financeType] = await Promise.all([
    getAttorneyFirmDepartments(firmId),
    getMembersByFirm(firmId),
    resolveTransactionFinanceType(client, transactionId),
  ])

  const activeDepartments = departments.filter((department) => department.isActive)
  const departmentsById = activeDepartments.reduce((accumulator, department) => {
    accumulator[department.id] = department
    return accumulator
  }, {})

  if (departmentId) {
    const department = departmentsById[departmentId]
    if (!department) {
      throw new Error('Selected department must belong to the selected firm and be active.')
    }

    const departmentType = String(department.departmentType || '').toLowerCase()
    if (assignmentType === 'transfer' && departmentType !== 'transfer' && departmentType !== 'management') {
      throw new Error('Transfer assignments must use the Transfer Department (or Management).')
    }
    if (assignmentType === 'bond' && departmentType !== 'bond' && departmentType !== 'management') {
      throw new Error('Bond assignments must use the Bond Department (or Management).')
    }
    if (
      assignmentType === 'cancellation' &&
      departmentType !== 'transfer' &&
      departmentType !== 'admin' &&
      departmentType !== 'management'
    ) {
      throw new Error('Cancellation assignments must use the Transfer, Admin, or Management Department.')
    }
  }

  const membersByUserId = activeMembers.reduce((accumulator, member) => {
    accumulator[member.userId] = member
    return accumulator
  }, {})

  assertUserBelongsToFirm({ userId: attorneyUserId, membersByUserId, label: isPrimary ? 'Primary attorney' : 'Supporting attorney' })
  assertUserBelongsToFirm({ userId: secretaryId, membersByUserId, label: 'Secretary' })
  assertUserBelongsToFirm({ userId: adminHandlerId, membersByUserId, label: 'Admin handler' })

  if (attorneyUserId) {
    assertRoleAllowed({
      assignmentType,
      field: isPrimary ? 'primary' : 'supporting',
      memberRole: membersByUserId[attorneyUserId]?.role,
    })
  }

  if (secretaryId) {
    assertRoleAllowed({
      assignmentType,
      field: 'secretary',
      memberRole: membersByUserId[secretaryId]?.role,
    })
  }

  if (adminHandlerId) {
    assertRoleAllowed({
      assignmentType,
      field: 'admin',
      memberRole: membersByUserId[adminHandlerId]?.role,
    })
  }

  if (status === 'active') {
    await assertNoDuplicateActiveAssignment({
      client,
      transactionId,
      attorneyRole,
      attorneyUserId,
      isPrimary,
      ignoreAssignmentId: options.assignmentId || null,
    })
  }

  if (financeType === 'cash' && assignmentType === 'bond') {
    // Explicitly allowed by brief; no hard block. Keep note for caller if needed.
  }

  return {
    transactionId,
    firmId,
    attorneyFirmId: firmId,
    assignmentType,
    attorneyRole,
    departmentId,
    attorneyDepartmentId: departmentId,
    attorneyUserId,
    primaryAttorneyId,
    secretaryId,
    adminHandlerId,
    status,
    assignmentStatus: status,
    isPrimary,
    visibilityScope,
    canEdit: payload.canEdit !== false,
    canManageDocuments: payload.canManageDocuments !== false,
    canManageSigning: payload.canManageSigning !== false,
    canAddInternalNotes: payload.canAddInternalNotes !== false,
    canAddSharedUpdates: payload.canAddSharedUpdates !== false,
    canUpdateWorkflowLane: payload.canUpdateWorkflowLane !== false,
    financeType,
    activeMembers,
    activeDepartments,
  }
}

export async function createTransactionAttorneyAssignment(payload = {}) {
  const client = requireClient()
  const actor = await getAuthenticatedUser(client)

  const validated = await validateAttorneyAssignment(payload, { client })
  await assertBankAppointedFirmAssignmentAuthority(client, validated)
  await assertActorCanManageAssignment(client, { actorId: actor.id, firmId: validated.firmId })

  const insertPayload = {
    transaction_id: validated.transactionId,
    firm_id: validated.firmId,
    attorney_firm_id: validated.attorneyFirmId,
    assignment_type: validated.assignmentType,
    attorney_role: validated.attorneyRole,
    department_id: validated.departmentId,
    attorney_department_id: validated.attorneyDepartmentId,
    primary_attorney_id: validated.primaryAttorneyId,
    attorney_user_id: validated.attorneyUserId,
    secretary_id: validated.secretaryId,
    admin_handler_id: validated.adminHandlerId,
    status: validated.status,
    assignment_status: validated.assignmentStatus,
    is_primary: validated.isPrimary,
    visibility_scope: validated.visibilityScope,
    can_edit: validated.canEdit,
    can_manage_documents: validated.canManageDocuments,
    can_manage_signing: validated.canManageSigning,
    can_add_internal_notes: validated.canAddInternalNotes,
    can_add_shared_updates: validated.canAddSharedUpdates,
    can_update_workflow_lane: validated.canUpdateWorkflowLane,
    assigned_by: actor.id,
    assigned_at: new Date().toISOString(),
  }

  const query = await client
    .from('transaction_attorney_assignments')
    .insert(insertPayload)
    .select(ASSIGNMENT_SELECT)
    .single()

  if (query.error) {
    if (isMissingTableError(query.error, 'transaction_attorney_assignments')) {
      throw new Error(ATTORNEY_ASSIGNMENTS_MIGRATION_HINT)
    }
    throw query.error
  }

  const mapped = mapAssignmentRow(query.data)
  const [enriched] = await enrichAssignments(client, [mapped])
  const result = enriched || mapped
  await logAttorneyAssignmentEvent(client, {
    transactionId: result.transactionId,
    eventType: result.isPrimary ? 'attorney_primary_assigned' : 'attorney_supporting_assigned',
    assignment: result,
    actorId: actor.id,
  })
  try {
    await recordUniversalAssignmentEvent('assignment.created', {
      itemType: 'transaction_attorney_assignment',
      itemId: result.id,
      transactionId: result.transactionId,
      organisationId: result.attorneyFirmId || result.firmId || null,
      assignedUserId: result.attorneyUserId || result.primaryAttorneyId || null,
      assignedQueueId: null,
      assignmentMethod: UNIVERSAL_ASSIGNMENT_METHODS.manual,
      sourceModule: 'attorney',
      sourceEvent: 'create_transaction_attorney_assignment',
      reason: 'Attorney assignment created.',
      actorUserId: actor.id,
      metadata: {
        attorneyRole: result.attorneyRole,
        assignmentType: result.assignmentType,
        departmentId: result.departmentId,
      },
    })
  } catch (error) {
    console.warn('[transactionAttorneyAssignments] universal assignment event skipped', error)
  }
  await syncTransactionAssignmentLegacyFields(result.transactionId).catch(() => null)
  return result
}

export async function updateTransactionAttorneyAssignment(assignmentId, payload = {}) {
  const client = requireClient()
  const actor = await getAuthenticatedUser(client)
  const normalizedAssignmentId = normalizeText(assignmentId)
  if (!normalizedAssignmentId) {
    throw new Error('Assignment id is required.')
  }

  const existingQuery = await client
    .from('transaction_attorney_assignments')
    .select(ASSIGNMENT_SELECT)
    .eq('id', normalizedAssignmentId)
    .maybeSingle()

  if (existingQuery.error) {
    if (isMissingTableError(existingQuery.error, 'transaction_attorney_assignments')) {
      throw new Error(ATTORNEY_ASSIGNMENTS_MIGRATION_HINT)
    }
    throw existingQuery.error
  }

  if (!existingQuery.data) {
    throw new Error('Assignment not found.')
  }

  const existing = mapAssignmentRow(existingQuery.data)

  const validated = await validateAttorneyAssignment(
    {
      transactionId: payload.transactionId ?? existing.transactionId,
      firmId: payload.attorneyFirmId ?? payload.firmId ?? existing.firmId,
      attorneyRole: payload.attorneyRole ?? existing.attorneyRole,
      assignmentType: payload.assignmentType ?? existing.assignmentType,
      departmentId: payload.attorneyDepartmentId ?? payload.departmentId ?? existing.departmentId,
      attorneyUserId: payload.attorneyUserId ?? payload.primaryAttorneyId ?? existing.attorneyUserId,
      primaryAttorneyId: payload.primaryAttorneyId ?? existing.primaryAttorneyId,
      secretaryId: payload.secretaryId ?? existing.secretaryId,
      adminHandlerId: payload.adminHandlerId ?? existing.adminHandlerId,
      status: payload.assignmentStatus ?? payload.status ?? existing.status,
      isPrimary: payload.isPrimary ?? existing.isPrimary,
      visibilityScope: payload.visibilityScope ?? existing.visibilityScope,
      canEdit: payload.canEdit ?? existing.canEdit,
      canManageDocuments: payload.canManageDocuments ?? existing.canManageDocuments,
      canManageSigning: payload.canManageSigning ?? existing.canManageSigning,
      canAddInternalNotes: payload.canAddInternalNotes ?? existing.canAddInternalNotes,
      canAddSharedUpdates: payload.canAddSharedUpdates ?? existing.canAddSharedUpdates,
      canUpdateWorkflowLane: payload.canUpdateWorkflowLane ?? existing.canUpdateWorkflowLane,
    },
    { client, assignmentId: existing.id },
  )
  await assertBankAppointedFirmAssignmentAuthority(client, validated)
  await assertActorCanManageAssignment(client, { actorId: actor.id, firmId: validated.firmId })

  const updatePayload = {
    transaction_id: validated.transactionId,
    firm_id: validated.firmId,
    attorney_firm_id: validated.attorneyFirmId,
    assignment_type: validated.assignmentType,
    attorney_role: validated.attorneyRole,
    department_id: validated.departmentId,
    attorney_department_id: validated.attorneyDepartmentId,
    primary_attorney_id: validated.primaryAttorneyId,
    attorney_user_id: validated.attorneyUserId,
    secretary_id: validated.secretaryId,
    admin_handler_id: validated.adminHandlerId,
    status: validated.status,
    assignment_status: validated.assignmentStatus,
    is_primary: validated.isPrimary,
    visibility_scope: validated.visibilityScope,
    can_edit: validated.canEdit,
    can_manage_documents: validated.canManageDocuments,
    can_manage_signing: validated.canManageSigning,
    can_add_internal_notes: validated.canAddInternalNotes,
    can_add_shared_updates: validated.canAddSharedUpdates,
    can_update_workflow_lane: validated.canUpdateWorkflowLane,
    assigned_at: new Date().toISOString(),
  }

  const query = await client
    .from('transaction_attorney_assignments')
    .update(updatePayload)
    .eq('id', normalizedAssignmentId)
    .select(ASSIGNMENT_SELECT)
    .single()

  if (query.error) {
    if (isMissingTableError(query.error, 'transaction_attorney_assignments')) {
      throw new Error(ATTORNEY_ASSIGNMENTS_MIGRATION_HINT)
    }
    throw query.error
  }

  const mapped = mapAssignmentRow(query.data)
  const [enriched] = await enrichAssignments(client, [mapped])
  const result = enriched || mapped
  await logAttorneyAssignmentEvent(client, {
    transactionId: result.transactionId,
    eventType: result.status === 'removed' ? 'attorney_assignment_removed' : 'attorney_assignment_updated',
    assignment: result,
    previousAssignment: existing,
    actorId: actor.id,
  })
  try {
    await recordUniversalAssignmentEvent(result.status === 'removed' ? 'assignment.removed' : 'assignment.reassigned', {
      itemType: 'transaction_attorney_assignment',
      itemId: result.id,
      transactionId: result.transactionId,
      organisationId: result.attorneyFirmId || result.firmId || null,
      assignedUserId: result.attorneyUserId || result.primaryAttorneyId || null,
      assignedQueueId: null,
      previousOwnerId: existing.attorneyUserId || existing.primaryAttorneyId || null,
      assignmentMethod: result.status === 'removed' ? UNIVERSAL_ASSIGNMENT_METHODS.remove : UNIVERSAL_ASSIGNMENT_METHODS.managerAssignment,
      sourceModule: 'attorney',
      sourceEvent: result.status === 'removed' ? 'remove_transaction_attorney_assignment' : 'update_transaction_attorney_assignment',
      reason: result.status === 'removed' ? 'Attorney assignment removed.' : 'Attorney assignment updated.',
      actorUserId: actor.id,
      metadata: {
        attorneyRole: result.attorneyRole,
        assignmentType: result.assignmentType,
        previousAttorneyUserId: existing.attorneyUserId || existing.primaryAttorneyId || null,
      },
    }, existing)
  } catch (error) {
    console.warn('[transactionAttorneyAssignments] universal assignment update skipped', error)
  }
  await syncTransactionAssignmentLegacyFields(result.transactionId).catch(() => null)
  return result
}

export async function removeTransactionAttorneyAssignment(assignmentId) {
  return updateTransactionAttorneyAssignment(assignmentId, { status: 'removed' })
}

export async function assignAttorneyToTransaction(payload = {}) {
  return createTransactionAttorneyAssignment(payload)
}

export async function updateAttorneyAssignment(assignmentId, updates = {}) {
  return updateTransactionAttorneyAssignment(assignmentId, updates)
}

export async function removeAttorneyAssignment(assignmentId) {
  return removeTransactionAttorneyAssignment(assignmentId)
}

export async function replacePrimaryAttorneyForRole({
  transactionId,
  attorneyRole,
  attorneyFirmId,
  attorneyUserId,
  attorneyDepartmentId = null,
  secretaryId = null,
  adminHandlerId = null,
} = {}) {
  const client = requireClient()
  const normalizedTransactionId = normalizeText(transactionId)
  const normalizedRole = normalizeAttorneyRole(attorneyRole)
  if (!normalizedTransactionId) throw new Error('Transaction id is required.')

  const existingQuery = await client
    .from('transaction_attorney_assignments')
    .select(ASSIGNMENT_SELECT)
    .eq('transaction_id', normalizedTransactionId)
    .eq('attorney_role', normalizedRole)
    .eq('assignment_status', 'active')
    .eq('is_primary', true)
    .maybeSingle()

  if (existingQuery.error) {
    if (isMissingTableError(existingQuery.error, 'transaction_attorney_assignments')) {
      throw new Error(ATTORNEY_ASSIGNMENTS_MIGRATION_HINT)
    }
    throw existingQuery.error
  }

  const payload = {
    transactionId: normalizedTransactionId,
    attorneyRole: normalizedRole,
    assignmentType: attorneyRoleToType(normalizedRole),
    attorneyFirmId,
    firmId: attorneyFirmId,
    attorneyUserId,
    primaryAttorneyId: attorneyUserId,
    attorneyDepartmentId,
    departmentId: attorneyDepartmentId,
    secretaryId,
    adminHandlerId,
    isPrimary: true,
    status: 'active',
  }

  const result = existingQuery.data
    ? await updateTransactionAttorneyAssignment(existingQuery.data.id, payload)
    : await createTransactionAttorneyAssignment(payload)

  await logAttorneyAssignmentEvent(client, {
    transactionId: normalizedTransactionId,
    eventType: 'attorney_primary_replaced',
    assignment: result,
    previousAssignment: existingQuery.data ? mapAssignmentRow(existingQuery.data) : null,
  })
  try {
    await recordUniversalAssignmentEvent('assignment.transferred', {
      itemType: 'transaction_attorney_assignment',
      itemId: result.id,
      transactionId: normalizedTransactionId,
      organisationId: result.attorneyFirmId || result.firmId || attorneyFirmId || null,
      assignedUserId: result.attorneyUserId || result.primaryAttorneyId || attorneyUserId || null,
      assignedQueueId: null,
      previousOwnerId: existingQuery.data?.attorney_user_id || existingQuery.data?.primary_attorney_id || null,
      assignmentMethod: UNIVERSAL_ASSIGNMENT_METHODS.transfer,
      sourceModule: 'attorney',
      sourceEvent: 'replace_primary_attorney_for_role',
      reason: 'Primary attorney replaced for role.',
      metadata: {
        attorneyRole: normalizedRole,
        assignmentType: result.assignmentType,
      },
    }, existingQuery.data ? mapAssignmentRow(existingQuery.data) : null)
  } catch (error) {
    console.warn('[transactionAttorneyAssignments] universal transfer event skipped', error)
  }

  return result
}

export async function getTransactionAttorneyAssignments(transactionId, { includeRemoved = false } = {}) {
  const client = requireClient()
  const normalizedTransactionId = normalizeText(transactionId)
  if (!normalizedTransactionId) {
    throw new Error('Transaction id is required.')
  }

  let query = client
    .from('transaction_attorney_assignments')
    .select(ASSIGNMENT_SELECT)
    .eq('transaction_id', normalizedTransactionId)
    .order('created_at', { ascending: true })

  if (!includeRemoved) {
    query = query.neq('assignment_status', 'removed')
  }

  const result = await query
  if (result.error) {
    if (isMissingTableError(result.error, 'transaction_attorney_assignments')) {
      return []
    }
    throw result.error
  }

  const mapped = (result.data || []).map(mapAssignmentRow)
  return enrichAssignments(client, mapped)
}

export async function getAttorneyAssignmentsForTransaction(transactionId, options = {}) {
  return getTransactionAttorneyAssignments(transactionId, options)
}

export async function getFirmAttorneyAssignments(firmId, { includeInactive = false } = {}) {
  const client = requireClient()
  const normalizedFirmId = normalizeText(firmId)
  if (!normalizedFirmId) {
    throw new Error('Firm id is required.')
  }

  let query = client
    .from('transaction_attorney_assignments')
    .select(ASSIGNMENT_SELECT)
    .eq('attorney_firm_id', normalizedFirmId)
    .order('updated_at', { ascending: false })

  if (!includeInactive) {
    query = query.in('assignment_status', ['pending', 'active', 'paused'])
  }

  const result = await query
  if (result.error) {
    if (isMissingTableError(result.error, 'transaction_attorney_assignments')) {
      return []
    }
    if (isPermissionDeniedError(result.error)) {
      console.warn('[Attorney Assignments] firm assignment lookup blocked by RLS; continuing with empty assignments.', result.error)
      return []
    }
    throw result.error
  }

  const mapped = (result.data || []).map(mapAssignmentRow)
  return enrichAssignments(client, mapped)
}

export async function getAttorneyAssignmentsForFirm(firmId, options = {}) {
  return getFirmAttorneyAssignments(firmId, options)
}

export async function getUserAttorneyAssignments(firmId, userId, { includeInactive = false } = {}) {
  const client = requireClient()
  const normalizedFirmId = normalizeText(firmId)
  const normalizedUserId = normalizeText(userId)

  if (!normalizedFirmId) {
    throw new Error('Firm id is required.')
  }
  if (!normalizedUserId) {
    throw new Error('User id is required.')
  }

  let query = client
    .from('transaction_attorney_assignments')
    .select(ASSIGNMENT_SELECT)
    .eq('attorney_firm_id', normalizedFirmId)
    .or(`attorney_user_id.eq.${normalizedUserId},primary_attorney_id.eq.${normalizedUserId},secretary_id.eq.${normalizedUserId},admin_handler_id.eq.${normalizedUserId}`)
    .order('updated_at', { ascending: false })

  if (!includeInactive) {
    query = query.in('assignment_status', ['pending', 'active', 'paused'])
  }

  const result = await query
  if (result.error) {
    if (isMissingTableError(result.error, 'transaction_attorney_assignments')) {
      return []
    }
    throw result.error
  }

  const mapped = (result.data || []).map(mapAssignmentRow)
  return enrichAssignments(client, mapped)
}

export async function getAttorneyAssignmentsForUser(userId, { firmId = null, includeInactive = false } = {}) {
  const client = requireClient()
  const normalizedUserId = normalizeText(userId)
  if (!normalizedUserId) throw new Error('User id is required.')

  let query = client
    .from('transaction_attorney_assignments')
    .select(ASSIGNMENT_SELECT)
    .or(`attorney_user_id.eq.${normalizedUserId},primary_attorney_id.eq.${normalizedUserId},secretary_id.eq.${normalizedUserId},admin_handler_id.eq.${normalizedUserId}`)
    .order('updated_at', { ascending: false })

  if (firmId) query = query.eq('attorney_firm_id', normalizeText(firmId))
  if (!includeInactive) query = query.in('assignment_status', ['pending', 'active', 'paused'])

  const result = await query
  if (result.error) {
    if (isMissingTableError(result.error, 'transaction_attorney_assignments')) return []
    throw result.error
  }

  return enrichAssignments(client, (result.data || []).map(mapAssignmentRow))
}

export async function getAssignableAttorneyFirmMembers(firmId, assignmentType = 'transfer') {
  const normalizedFirmId = normalizeText(firmId)
  if (!normalizedFirmId) {
    throw new Error('Firm id is required.')
  }

  const normalizedAssignmentType = normalizeType(assignmentType)
  const members = await getMembersByFirm(normalizedFirmId)

  const memberUserIds = members.map((member) => member.userId).filter(Boolean)
  const client = requireClient()

  const profileQuery = memberUserIds.length
    ? await client
        .from('profiles')
        .select('id, full_name, first_name, last_name, email')
        .in('id', memberUserIds)
    : { data: [], error: null }

  if (profileQuery.error && !isMissingTableError(profileQuery.error, 'profiles')) {
    throw profileQuery.error
  }

  const profilesById = (profileQuery.data || []).reduce((accumulator, row) => {
    const fullName =
      String(row.full_name || '').trim() ||
      [row.first_name, row.last_name].map((value) => String(value || '').trim()).filter(Boolean).join(' ').trim()

    accumulator[row.id] = {
      id: row.id,
      name: fullName || row.email || 'Team Member',
      email: row.email || '',
    }
    return accumulator
  }, {})

  const enrichedMembers = members.map((member) => ({
    ...member,
    profile: profilesById[member.userId] || { id: member.userId, name: 'Team Member', email: '' },
  }))

  const primaryRoleSet =
    normalizedAssignmentType === 'bond'
      ? BOND_PRIMARY_ROLES
      : normalizedAssignmentType === 'cancellation'
        ? CANCELLATION_PRIMARY_ROLES
      : normalizedAssignmentType === 'transfer'
        ? TRANSFER_PRIMARY_ROLES
        : new Set([...TRANSFER_PRIMARY_ROLES, ...BOND_PRIMARY_ROLES])

  const toOption = (member) => ({
    userId: member.userId,
    memberId: member.id,
    role: member.role,
    departmentId: member.departmentId || null,
    label: member.profile?.email ? `${member.profile.name} (${member.profile.email})` : member.profile.name,
    name: member.profile.name,
    email: member.profile.email,
  })

  const primaryAttorneys = enrichedMembers.filter((member) => primaryRoleSet.has(member.role)).map(toOption)
  const secretaries = enrichedMembers.filter((member) => SECRETARY_ALLOWED_ROLES.has(member.role)).map(toOption)
  const adminHandlers = enrichedMembers.filter((member) => ADMIN_ALLOWED_ROLES.has(member.role)).map(toOption)

  return {
    assignmentType: normalizedAssignmentType,
    members: enrichedMembers.map(toOption),
    primaryAttorneys,
    secretaries,
    adminHandlers,
  }
}

export async function listAttorneyFirmsForAssignment() {
  const firms = await getCurrentUserAttorneyFirms()
  return firms
    .filter((firm) => firm.isActive !== false && firm.membershipStatus === 'active')
    .map((firm) => ({
    id: firm.id,
    name: firm.name,
    membershipRole: firm.membershipRole || null,
  }))
}

export async function syncTransactionAssignmentLegacyFields(transactionId, assignments = null) {
  const client = requireClient()
  const normalizedTransactionId = normalizeText(transactionId)
  if (!normalizedTransactionId) return

  const resolvedAssignments = assignments || (await getTransactionAttorneyAssignments(normalizedTransactionId))

  const assignmentPayload = prepareBondAssignmentPayload({
    transaction: {},
    assignments: resolvedAssignments,
  })
  const updatePayload = {
    attorney: assignmentPayload.attorney,
    assigned_attorney_email: assignmentPayload.assigned_attorney_email,
    assigned_bond_originator_email: assignmentPayload.assigned_bond_originator_email,
    bond_originator: assignmentPayload.bond_originator,
  }

  let query = await client.from('transactions').update(updatePayload).eq('id', normalizedTransactionId)
  if (query.error && isMissingColumnError(query.error, 'bond_originator')) {
    const fallbackPayload = { ...updatePayload }
    delete fallbackPayload.bond_originator
    query = await client.from('transactions').update(fallbackPayload).eq('id', normalizedTransactionId)
  }

  if (query.error) {
    if (
      isMissingTableError(query.error, 'transactions') ||
      isMissingColumnError(query.error, 'assigned_attorney_email') ||
      isMissingColumnError(query.error, 'attorney')
    ) {
      return
    }
    throw query.error
  }
}
