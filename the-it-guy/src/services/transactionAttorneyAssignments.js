import {
  getAuthenticatedUser,
  isMissingColumnError,
  isMissingTableError,
  normalizeText,
  requireClient,
} from './attorneyFirmServiceShared'
import { getAttorneyFirmMembers } from './attorneyFirmMembers'
import { getAttorneyFirmById, getAttorneyFirmDepartments } from './attorneyFirms'

export const ATTORNEY_ASSIGNMENT_TYPES = ['transfer', 'bond', 'transfer_and_bond']
export const ATTORNEY_ASSIGNMENT_STATUSES = ['pending', 'active', 'paused', 'completed', 'removed']

const TRANSFER_PRIMARY_ROLES = new Set(['transfer_attorney', 'director_partner', 'firm_admin'])
const BOND_PRIMARY_ROLES = new Set(['bond_attorney', 'director_partner', 'firm_admin'])
const SECRETARY_ALLOWED_ROLES = new Set(['conveyancing_secretary', 'admin_staff', 'candidate_attorney'])
const ADMIN_ALLOWED_ROLES = new Set(['admin_staff', 'conveyancing_secretary', 'candidate_attorney'])

function normalizeType(value) {
  const normalized = normalizeText(value).toLowerCase()
  if (!ATTORNEY_ASSIGNMENT_TYPES.includes(normalized)) {
    throw new Error('Assignment type must be transfer, bond, or transfer_and_bond.')
  }
  return normalized
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
  return {
    id: row.id,
    transactionId: row.transaction_id,
    firmId: row.firm_id,
    assignmentType: row.assignment_type,
    departmentId: row.department_id || null,
    primaryAttorneyId: row.primary_attorney_id || null,
    secretaryId: row.secretary_id || null,
    adminHandlerId: row.admin_handler_id || null,
    status: row.status,
    assignedBy: row.assigned_by || null,
    assignedAt: row.assigned_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  }
}

export function getAssignmentTypeLabel(type) {
  const normalized = normalizeText(type).toLowerCase()
  if (normalized === 'transfer') return 'Transfer Attorney'
  if (normalized === 'bond') return 'Bond Attorney'
  if (normalized === 'transfer_and_bond') return 'Transfer + Bond Attorney'
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

function assertRoleAllowed({ assignmentType, field, memberRole }) {
  const normalizedRole = String(memberRole || '').trim().toLowerCase()
  if (!normalizedRole) return

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

async function assertNoDuplicateActiveAssignment({ client, transactionId, assignmentType, ignoreAssignmentId = null }) {
  const relevantTypes =
    assignmentType === 'transfer_and_bond' ? ['transfer', 'bond', 'transfer_and_bond'] : [assignmentType, 'transfer_and_bond']

  let query = client
    .from('transaction_attorney_assignments')
    .select('id, assignment_type, status')
    .eq('transaction_id', transactionId)
    .in('assignment_type', relevantTypes)
    .eq('status', 'active')

  if (ignoreAssignmentId) {
    query = query.neq('id', ignoreAssignmentId)
  }

  const result = await query
  if (result.error) {
    if (isMissingTableError(result.error, 'transaction_attorney_assignments')) {
      throw new Error('Attorney assignment table is not set up yet.')
    }
    throw result.error
  }

  if ((result.data || []).length > 0) {
    throw new Error('An active assignment already exists for this transaction and assignment type.')
  }
}

async function enrichAssignments(client, assignments = []) {
  if (!assignments.length) return []

  const transactionIds = [...new Set(assignments.map((item) => item.transactionId).filter(Boolean))]
  const firmIds = [...new Set(assignments.map((item) => item.firmId).filter(Boolean))]
  const userIds = [
    ...new Set(
      assignments
        .flatMap((item) => [item.primaryAttorneyId, item.secretaryId, item.adminHandlerId])
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
    statusLabel: getAssignmentStatusLabel(assignment.status),
    firm: firmsById[assignment.firmId] || null,
    department: departmentsById[assignment.departmentId] || null,
    transaction: transactionsById[assignment.transactionId] || null,
    primaryAttorney: assignment.primaryAttorneyId ? profilesById[assignment.primaryAttorneyId] || null : null,
    secretary: assignment.secretaryId ? profilesById[assignment.secretaryId] || null : null,
    adminHandler: assignment.adminHandlerId ? profilesById[assignment.adminHandlerId] || null : null,
  }))
}

export async function validateAttorneyAssignment(payload = {}, options = {}) {
  const client = options.client || requireClient()

  const transactionId = normalizeText(payload.transactionId)
  const firmId = normalizeText(payload.firmId)
  const assignmentType = normalizeType(payload.assignmentType)
  const status = normalizeStatus(payload.status || 'active')
  const departmentId = normalizeText(payload.departmentId) || null
  const primaryAttorneyId = normalizeText(payload.primaryAttorneyId) || null
  const secretaryId = normalizeText(payload.secretaryId) || null
  const adminHandlerId = normalizeText(payload.adminHandlerId) || null

  if (!transactionId) throw new Error('transaction_id is required.')
  if (!firmId) throw new Error('firm_id is required.')

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
  }

  const membersByUserId = activeMembers.reduce((accumulator, member) => {
    accumulator[member.userId] = member
    return accumulator
  }, {})

  assertUserBelongsToFirm({ userId: primaryAttorneyId, membersByUserId, label: 'Primary attorney' })
  assertUserBelongsToFirm({ userId: secretaryId, membersByUserId, label: 'Secretary' })
  assertUserBelongsToFirm({ userId: adminHandlerId, membersByUserId, label: 'Admin handler' })

  if (primaryAttorneyId) {
    assertRoleAllowed({
      assignmentType,
      field: 'primary',
      memberRole: membersByUserId[primaryAttorneyId]?.role,
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
      assignmentType,
      ignoreAssignmentId: options.assignmentId || null,
    })
  }

  if (financeType === 'cash' && assignmentType === 'bond') {
    // Explicitly allowed by brief; no hard block. Keep note for caller if needed.
  }

  return {
    transactionId,
    firmId,
    assignmentType,
    departmentId,
    primaryAttorneyId,
    secretaryId,
    adminHandlerId,
    status,
    financeType,
    activeMembers,
    activeDepartments,
  }
}

export async function createTransactionAttorneyAssignment(payload = {}) {
  const client = requireClient()
  const actor = await getAuthenticatedUser(client)

  const validated = await validateAttorneyAssignment(payload, { client })

  const insertPayload = {
    transaction_id: validated.transactionId,
    firm_id: validated.firmId,
    assignment_type: validated.assignmentType,
    department_id: validated.departmentId,
    primary_attorney_id: validated.primaryAttorneyId,
    secretary_id: validated.secretaryId,
    admin_handler_id: validated.adminHandlerId,
    status: validated.status,
    assigned_by: actor.id,
    assigned_at: new Date().toISOString(),
  }

  const query = await client
    .from('transaction_attorney_assignments')
    .insert(insertPayload)
    .select('id, transaction_id, firm_id, assignment_type, department_id, primary_attorney_id, secretary_id, admin_handler_id, status, assigned_by, assigned_at, created_at, updated_at')
    .single()

  if (query.error) {
    if (isMissingTableError(query.error, 'transaction_attorney_assignments')) {
      throw new Error('Attorney assignment table is not set up yet.')
    }
    throw query.error
  }

  const mapped = mapAssignmentRow(query.data)
  const [enriched] = await enrichAssignments(client, [mapped])
  return enriched || mapped
}

export async function updateTransactionAttorneyAssignment(assignmentId, payload = {}) {
  const client = requireClient()
  const normalizedAssignmentId = normalizeText(assignmentId)
  if (!normalizedAssignmentId) {
    throw new Error('Assignment id is required.')
  }

  const existingQuery = await client
    .from('transaction_attorney_assignments')
    .select('id, transaction_id, firm_id, assignment_type, department_id, primary_attorney_id, secretary_id, admin_handler_id, status, assigned_by, assigned_at, created_at, updated_at')
    .eq('id', normalizedAssignmentId)
    .maybeSingle()

  if (existingQuery.error) {
    if (isMissingTableError(existingQuery.error, 'transaction_attorney_assignments')) {
      throw new Error('Attorney assignment table is not set up yet.')
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
      firmId: payload.firmId ?? existing.firmId,
      assignmentType: payload.assignmentType ?? existing.assignmentType,
      departmentId: payload.departmentId ?? existing.departmentId,
      primaryAttorneyId: payload.primaryAttorneyId ?? existing.primaryAttorneyId,
      secretaryId: payload.secretaryId ?? existing.secretaryId,
      adminHandlerId: payload.adminHandlerId ?? existing.adminHandlerId,
      status: payload.status ?? existing.status,
    },
    { client, assignmentId: existing.id },
  )

  const updatePayload = {
    transaction_id: validated.transactionId,
    firm_id: validated.firmId,
    assignment_type: validated.assignmentType,
    department_id: validated.departmentId,
    primary_attorney_id: validated.primaryAttorneyId,
    secretary_id: validated.secretaryId,
    admin_handler_id: validated.adminHandlerId,
    status: validated.status,
    assigned_at: new Date().toISOString(),
  }

  const query = await client
    .from('transaction_attorney_assignments')
    .update(updatePayload)
    .eq('id', normalizedAssignmentId)
    .select('id, transaction_id, firm_id, assignment_type, department_id, primary_attorney_id, secretary_id, admin_handler_id, status, assigned_by, assigned_at, created_at, updated_at')
    .single()

  if (query.error) {
    if (isMissingTableError(query.error, 'transaction_attorney_assignments')) {
      throw new Error('Attorney assignment table is not set up yet.')
    }
    throw query.error
  }

  const mapped = mapAssignmentRow(query.data)
  const [enriched] = await enrichAssignments(client, [mapped])
  return enriched || mapped
}

export async function removeTransactionAttorneyAssignment(assignmentId) {
  return updateTransactionAttorneyAssignment(assignmentId, { status: 'removed' })
}

export async function getTransactionAttorneyAssignments(transactionId, { includeRemoved = false } = {}) {
  const client = requireClient()
  const normalizedTransactionId = normalizeText(transactionId)
  if (!normalizedTransactionId) {
    throw new Error('Transaction id is required.')
  }

  let query = client
    .from('transaction_attorney_assignments')
    .select('id, transaction_id, firm_id, assignment_type, department_id, primary_attorney_id, secretary_id, admin_handler_id, status, assigned_by, assigned_at, created_at, updated_at')
    .eq('transaction_id', normalizedTransactionId)
    .order('created_at', { ascending: true })

  if (!includeRemoved) {
    query = query.neq('status', 'removed')
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

export async function getFirmAttorneyAssignments(firmId, { includeInactive = false } = {}) {
  const client = requireClient()
  const normalizedFirmId = normalizeText(firmId)
  if (!normalizedFirmId) {
    throw new Error('Firm id is required.')
  }

  let query = client
    .from('transaction_attorney_assignments')
    .select('id, transaction_id, firm_id, assignment_type, department_id, primary_attorney_id, secretary_id, admin_handler_id, status, assigned_by, assigned_at, created_at, updated_at')
    .eq('firm_id', normalizedFirmId)
    .order('updated_at', { ascending: false })

  if (!includeInactive) {
    query = query.in('status', ['pending', 'active', 'paused'])
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
    .select('id, transaction_id, firm_id, assignment_type, department_id, primary_attorney_id, secretary_id, admin_handler_id, status, assigned_by, assigned_at, created_at, updated_at')
    .eq('firm_id', normalizedFirmId)
    .or(`primary_attorney_id.eq.${normalizedUserId},secretary_id.eq.${normalizedUserId},admin_handler_id.eq.${normalizedUserId}`)
    .order('updated_at', { ascending: false })

  if (!includeInactive) {
    query = query.in('status', ['pending', 'active', 'paused'])
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
  const client = requireClient()
  const user = await getAuthenticatedUser(client)

  const membershipQuery = await client
    .from('attorney_firm_members')
    .select('firm_id, role, status')
    .eq('user_id', user.id)
    .eq('status', 'active')

  if (membershipQuery.error) {
    if (isMissingTableError(membershipQuery.error, 'attorney_firm_members')) {
      return []
    }
    throw membershipQuery.error
  }

  const rows = membershipQuery.data || []
  const firmIds = [...new Set(rows.map((item) => item.firm_id).filter(Boolean))]
  if (!firmIds.length) return []

  const firmsQuery = await client
    .from('attorney_firms')
    .select('id, name, is_active')
    .in('id', firmIds)
    .eq('is_active', true)

  if (firmsQuery.error) {
    if (isMissingTableError(firmsQuery.error, 'attorney_firms')) {
      return []
    }
    throw firmsQuery.error
  }

  const roleByFirmId = rows.reduce((accumulator, item) => {
    accumulator[item.firm_id] = item.role
    return accumulator
  }, {})

  return (firmsQuery.data || []).map((firm) => ({
    id: firm.id,
    name: firm.name,
    membershipRole: roleByFirmId[firm.id] || null,
  }))
}

export async function syncTransactionAssignmentLegacyFields(transactionId, assignments = null) {
  const client = requireClient()
  const normalizedTransactionId = normalizeText(transactionId)
  if (!normalizedTransactionId) return

  const resolvedAssignments = assignments || (await getTransactionAttorneyAssignments(normalizedTransactionId))

  const transferAssignment = resolvedAssignments.find((item) => item.assignmentType === 'transfer' || item.assignmentType === 'transfer_and_bond') || null
  const bondAssignment = resolvedAssignments.find((item) => item.assignmentType === 'bond' || item.assignmentType === 'transfer_and_bond') || null

  const updatePayload = {
    attorney: transferAssignment?.primaryAttorney?.name || transferAssignment?.firm?.name || null,
    assigned_attorney_email: transferAssignment?.primaryAttorney?.email?.toLowerCase() || null,
    assigned_bond_originator_email: null,
  }

  if (bondAssignment?.primaryAttorney?.email) {
    updatePayload.assigned_bond_originator_email = updatePayload.assigned_bond_originator_email || null
  }

  const query = await client.from('transactions').update(updatePayload).eq('id', normalizedTransactionId)
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
