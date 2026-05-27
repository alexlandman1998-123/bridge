import { BOND_INTAKE_STATUSES, getBondIntakeSummary } from '../core/transactions/bondIntakeSelectors'
import { supabase } from '../lib/supabaseClient'

export const BOND_INTAKE_DECLINE_REASONS = Object.freeze([
  'Buyer not finance-ready',
  'Documents incomplete',
  'Outside mandate',
  'Duplicate application',
  'Incorrect originator',
  'Other',
])

const MANAGER_ROLE_KEYS = new Set([
  'owner',
  'principal',
  'director',
  'manager',
  'hq_manager',
  'regional_manager',
  'branch_manager',
  'team_lead',
  'admin',
  'admin_staff',
])

const MUTATING_ROLE_KEYS = new Set([
  ...MANAGER_ROLE_KEYS,
  'bond_originator',
  'consultant',
  'processor',
  'bond_consultant',
  'bond_processor',
])

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function normalizeRoleKey(value) {
  return normalizeLower(value).replace(/[\s-]+/g, '_')
}

function normalizeEmail(value) {
  return normalizeLower(value)
}

function isMissingColumnError(error, column = '') {
  const message = normalizeLower(error?.message || error?.details || error?.hint)
  const code = normalizeText(error?.code)
  if (!message) return false
  if (code === '42703') return !column || message.includes(normalizeLower(column))
  return Boolean(column && message.includes(normalizeLower(column)) && message.includes('column'))
}

function isMissingTableError(error, table = '') {
  const message = normalizeLower(error?.message || error?.details || error?.hint)
  const code = normalizeText(error?.code)
  if (code === '42P01') return true
  return Boolean(table && message.includes(normalizeLower(table)) && (message.includes('does not exist') || message.includes('not found')))
}

function isPermissionDeniedError(error) {
  const message = normalizeLower(error?.message || error?.details || error?.hint)
  const code = normalizeText(error?.code)
  return code === '42501' || message.includes('permission denied') || message.includes('row-level security')
}

function getClient(options = {}) {
  const client = options.client || supabase
  if (!client) {
    throw new Error('Supabase is not configured.')
  }
  return client
}

function compactObject(payload = {}) {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined))
}

function resolveCurrentUser(user = {}) {
  const profile = user.profile || user.authState?.profile || user
  const currentWorkspace = user.currentWorkspace || user.workspace || user.authState?.currentWorkspace || null
  const currentMembership = user.currentMembership || user.authState?.currentMembership || null
  const workspaceRole =
    user.workspaceRole ||
    user.organisationRole ||
    user.membershipRole ||
    currentMembership?.workspaceRole ||
    currentMembership?.workspace_role ||
    profile?.workspaceRole ||
    profile?.workspace_role ||
    profile?.organisationRole ||
    profile?.organisation_role ||
    user.role ||
    profile?.role ||
    ''

  return {
    id: normalizeText(user.userId || user.id || profile?.id),
    email: normalizeEmail(user.email || profile?.email),
    name:
      normalizeText(user.name || user.fullName || user.full_name || profile?.fullName || profile?.full_name) ||
      normalizeText([profile?.first_name, profile?.last_name].filter(Boolean).join(' ')) ||
      normalizeEmail(user.email || profile?.email) ||
      'Bond consultant',
    workspaceId:
      normalizeText(user.workspaceId || currentWorkspace?.id || currentMembership?.organisationId || currentMembership?.organisation_id) ||
      null,
    workspaceName:
      normalizeText(user.workspaceName || currentWorkspace?.name || currentMembership?.workspace?.name) ||
      'Bond originator',
    roleKey: normalizeRoleKey(workspaceRole),
    appRole: normalizeRoleKey(user.role || profile?.role),
  }
}

function canMutateBondIntake(user = {}) {
  const actor = resolveCurrentUser(user)
  return Boolean(actor.id && (MUTATING_ROLE_KEYS.has(actor.roleKey) || actor.appRole === 'bond_originator'))
}

export function canAssignBondIntake(user = {}) {
  const actor = resolveCurrentUser(user)
  return Boolean(actor.id && MANAGER_ROLE_KEYS.has(actor.roleKey))
}

export function canDeclineBondIntake(user = {}) {
  return canMutateBondIntake(user)
}

export function canAcceptBondIntake(user = {}, row = {}) {
  if (!canMutateBondIntake(user)) return false
  const summary = getBondIntakeSummary(getBondIntakeInput(row, user))
  return summary.intakeStatus === BOND_INTAKE_STATUSES.READY_FOR_REVIEW
}

export async function fetchBondConsultantOptions({ user = {}, client = null } = {}) {
  const actor = resolveCurrentUser(user)
  const currentOption = {
    id: actor.id,
    name: actor.name,
    email: actor.email,
    label: `${actor.name}${actor.email ? ` · ${actor.email}` : ''}`,
  }
  if (!actor.workspaceId) return currentOption.id || currentOption.email ? [currentOption] : []

  try {
    const db = getClient({ client })
    let query = await db
      .from('organisation_users')
      .select('id, organisation_id, user_id, first_name, last_name, email, role, workspace_role, organisation_role, status')
      .eq('organisation_id', actor.workspaceId)
      .in('status', ['active', 'approved'])

    if (
      query.error &&
      (isMissingColumnError(query.error, 'workspace_role') ||
        isMissingColumnError(query.error, 'organisation_role') ||
        isMissingColumnError(query.error, 'status'))
    ) {
      query = await db
        .from('organisation_users')
        .select('id, organisation_id, user_id, first_name, last_name, email, role')
        .eq('organisation_id', actor.workspaceId)
    }

    if (query.error) {
      if (isMissingTableError(query.error, 'organisation_users') || isPermissionDeniedError(query.error)) {
        return currentOption.id || currentOption.email ? [currentOption] : []
      }
      throw query.error
    }

    const allowedRoles = new Set(['consultant', 'processor', 'branch_manager', 'team_lead', 'manager', 'bond_originator'])
    const options = (query.data || [])
      .filter((row) => {
        const roleKey = normalizeRoleKey(row.workspace_role || row.organisation_role || row.role)
        return !roleKey || allowedRoles.has(roleKey)
      })
      .map((row) => {
        const name = normalizeText([row.first_name, row.last_name].filter(Boolean).join(' ')) || normalizeEmail(row.email) || 'Team member'
        return {
          id: normalizeText(row.user_id || row.id),
          name,
          email: normalizeEmail(row.email),
          label: `${name}${row.email ? ` · ${normalizeEmail(row.email)}` : ''}`,
        }
      })
      .filter((option) => option.id || option.email)

    const byKey = new Map()
    for (const option of [currentOption, ...options]) {
      const key = option.id || option.email
      if (key && !byKey.has(key)) byKey.set(key, option)
    }
    return [...byKey.values()]
  } catch {
    return currentOption.id || currentOption.email ? [currentOption] : []
  }
}

function getRolePlayers(row = {}) {
  if (Array.isArray(row.rolePlayers)) return row.rolePlayers
  if (Array.isArray(row.transactionRolePlayers)) return row.transactionRolePlayers
  if (Array.isArray(row.transaction_role_players)) return row.transaction_role_players
  if (Array.isArray(row?.transaction?.rolePlayers)) return row.transaction.rolePlayers
  if (Array.isArray(row?.transaction?.transactionRolePlayers)) return row.transaction.transactionRolePlayers
  if (Array.isArray(row?.transaction?.transaction_role_players)) return row.transaction.transaction_role_players
  return []
}

function getBondIntakeInput(row = {}, user = {}) {
  const actor = resolveCurrentUser(user)
  return {
    transaction: row?.transaction || row || {},
    onboardingFormData:
      row?.onboardingFormData ||
      row?.onboarding_form_data ||
      row?.onboarding?.formData ||
      row?.onboarding?.form_data ||
      null,
    documentRequests: row?.documentRequests || row?.document_requests || [],
    documents: row?.documents || [],
    rolePlayers: getRolePlayers(row),
    currentOrganisationId: actor.workspaceId || row?.transaction?.bond_workspace_id || row?.transaction?.organisation_id || null,
  }
}

function resolveAssignee({ user = {}, assignee = {} } = {}) {
  const actor = resolveCurrentUser(user)
  return {
    id: normalizeText(assignee.id || assignee.userId) || actor.id || null,
    name: normalizeText(assignee.name || assignee.fullName || assignee.label) || actor.name,
    email: normalizeEmail(assignee.email) || actor.email || null,
  }
}

async function updateByIdWithMissingColumnFallback(client, table, id, payload = {}, select = 'id') {
  let remainingPayload = compactObject(payload)
  while (Object.keys(remainingPayload).length) {
    const result = await client.from(table).update(remainingPayload).eq('id', id).select(select).maybeSingle()
    if (!result.error) return result.data || null

    const missingColumn = Object.keys(remainingPayload).find((key) => isMissingColumnError(result.error, key))
    if (!missingColumn) throw result.error
    remainingPayload = { ...remainingPayload }
    delete remainingPayload[missingColumn]
  }
  return null
}

async function insertEventIfPossible(client, { transactionId, eventType, eventData, actor }) {
  const payload = compactObject({
    transaction_id: transactionId,
    event_type: eventType,
    event_data: eventData || {},
    created_by: actor.id || null,
    created_by_role: actor.roleKey || actor.appRole || null,
  })

  let remainingPayload = payload
  while (Object.keys(remainingPayload).length) {
    const result = await client
      .from('transaction_events')
      .insert(remainingPayload)
      .select('id, transaction_id, event_type, event_data, created_at')
      .single()

    if (!result.error) return result.data || null
    if (isMissingTableError(result.error, 'transaction_events') || isPermissionDeniedError(result.error)) return null

    const missingColumn = Object.keys(remainingPayload).find((key) => isMissingColumnError(result.error, key))
    if (!missingColumn) throw result.error
    remainingPayload = { ...remainingPayload }
    delete remainingPayload[missingColumn]
  }
  return null
}

async function upsertRolePlayerMarker(client, {
  transactionId,
  actor,
  assignee,
  action,
  reason = '',
  note = '',
  source = 'new_applications_queue',
}) {
  const now = new Date().toISOString()
  const intakeStatus = action === 'decline' ? 'DECLINED' : 'ACCEPTED'
  const snapshot = {
    accepted_at: action === 'decline' ? null : now,
    accepted_by: action === 'decline' ? null : actor.id,
    accepted_by_name: action === 'decline' ? null : actor.name,
    accepted_by_email: action === 'decline' ? null : actor.email,
    accepted_organisation_id: actor.workspaceId,
    accepted_organisation_name: actor.workspaceName,
    assigned_user_id: action === 'decline' ? null : assignee.id,
    assigned_user_name: action === 'decline' ? null : assignee.name,
    assigned_user_email: action === 'decline' ? null : assignee.email,
    declined_at: action === 'decline' ? now : null,
    declined_by: action === 'decline' ? actor.id : null,
    declined_by_name: action === 'decline' ? actor.name : null,
    declined_reason: action === 'decline' ? reason : null,
    declined_note: action === 'decline' ? note : null,
    intake_status: intakeStatus,
    source,
  }
  const payload = compactObject({
    transaction_id: transactionId,
    role_type: 'bond_originator',
    selection_source: 'manual',
    partner_name: actor.workspaceName || assignee.name || 'Bond originator',
    contact_person: assignee.name || actor.name,
    email_address: assignee.email || actor.email,
    notes: note || reason || null,
    snapshot_json: snapshot,
    updated_at: now,
    created_at: now,
  })

  let result = await client
    .from('transaction_role_players')
    .upsert(payload, { onConflict: 'transaction_id,role_type' })
    .select('id')
    .limit(1)
  if (!result.error) return result.data || null

  const fallbackShouldUpdate =
    normalizeLower(result.error?.message).includes('conflict') ||
    normalizeLower(result.error?.message).includes('constraint')

  if (fallbackShouldUpdate) {
    const lookup = await client
      .from('transaction_role_players')
      .select('id')
      .eq('transaction_id', transactionId)
      .eq('role_type', 'bond_originator')
      .limit(1)
    if (!lookup.error && lookup.data?.[0]?.id) {
      return updateByIdWithMissingColumnFallback(client, 'transaction_role_players', lookup.data[0].id, payload, 'id')
    }
    if (!lookup.error) {
      const insertResult = await client.from('transaction_role_players').insert(payload).select('id').limit(1)
      if (!insertResult.error) return insertResult.data || null
      result = insertResult
    }
  }

  if (
    result.error &&
    (isMissingColumnError(result.error, 'selection_source') ||
      isMissingColumnError(result.error, 'partner_name') ||
      isMissingColumnError(result.error, 'contact_person') ||
      isMissingColumnError(result.error, 'email_address') ||
      isMissingColumnError(result.error, 'snapshot_json') ||
      isMissingColumnError(result.error, 'notes'))
  ) {
    const fallbackPayload = {
      transaction_id: transactionId,
      role_type: 'bond_originator',
      updated_at: now,
      created_at: now,
    }
    result = await client.from('transaction_role_players').insert(fallbackPayload).select('id').limit(1)
    if (!result.error) return result.data || null
  }

  if (isMissingTableError(result.error, 'transaction_role_players') || isPermissionDeniedError(result.error)) {
    return null
  }

  throw result.error
}

async function persistAcceptedAssignment(client, { transactionId, actor, assignee, action }) {
  const now = new Date().toISOString()
  const source = action === 'assign' ? 'assigned_from_intake' : 'accepted_from_intake'
  return updateByIdWithMissingColumnFallback(
    client,
    'transactions',
    transactionId,
    {
      assigned_bond_originator_email: assignee.email || actor.email || null,
      bond_originator: assignee.name || actor.name || null,
      primary_bond_consultant_user_id: assignee.id || actor.id || null,
      finance_managed_by: 'bond_originator',
      bond_assignment_status: 'consultant_assigned',
      bond_assignment_source: source,
      finance_status: 'Accepted by bond originator',
      last_meaningful_activity_at: now,
      updated_at: now,
    },
    'id, assigned_bond_originator_email, bond_originator, primary_bond_consultant_user_id, bond_assignment_status, bond_assignment_source, finance_status, updated_at',
  )
}

async function persistDecline(client, { transactionId, actor, reason, note }) {
  const now = new Date().toISOString()
  return updateByIdWithMissingColumnFallback(
    client,
    'transactions',
    transactionId,
    {
      bond_assignment_status: 'declined',
      bond_assignment_source: 'declined_from_intake',
      finance_status: `Bond intake declined: ${reason}`,
      last_meaningful_activity_at: now,
      updated_at: now,
    },
    'id, bond_assignment_status, bond_assignment_source, finance_status, updated_at',
  )
}

function assertReady(row = {}, user = {}) {
  const summary = getBondIntakeSummary(getBondIntakeInput(row, user))
  if (summary.intakeStatus !== BOND_INTAKE_STATUSES.READY_FOR_REVIEW) {
    throw new Error('Buyer application and documents must be complete before acceptance.')
  }
}

function getTransactionId(row = {}, explicitTransactionId = '') {
  const transactionId = normalizeText(explicitTransactionId || row?.transaction?.id || row?.id)
  if (!transactionId) {
    throw new Error('Transaction is required.')
  }
  return transactionId
}

export async function acceptBondIntakeApplication({ row = {}, transactionId = '', user = {}, assignee = {}, note = '', client = null } = {}) {
  if (!canMutateBondIntake(user)) {
    throw new Error('You do not have permission to accept this application.')
  }
  assertReady(row, user)

  const db = getClient({ client })
  const actor = resolveCurrentUser(user)
  const resolvedAssignee = resolveAssignee({ user, assignee })
  const id = getTransactionId(row, transactionId)

  await upsertRolePlayerMarker(db, { transactionId: id, actor, assignee: resolvedAssignee, action: 'accept', note })
  const transaction = await persistAcceptedAssignment(db, { transactionId: id, actor, assignee: resolvedAssignee, action: 'accept' })
  const activity = await insertEventIfPossible(db, {
    transactionId: id,
    eventType: 'bond_intake_accepted',
    actor,
    eventData: {
      message: `Bond application accepted by ${actor.name}`,
      assigned_user_id: resolvedAssignee.id,
      assigned_user_name: resolvedAssignee.name,
      intake_status: 'ACCEPTED',
      source: 'new_applications_queue',
    },
  })

  return { transaction, activity, message: 'Application accepted and moved to My Applications.' }
}

export async function assignBondIntakeApplication({ row = {}, transactionId = '', user = {}, assignee = {}, note = '', client = null } = {}) {
  if (!canAssignBondIntake(user)) {
    throw new Error('You do not have permission to assign this application.')
  }
  assertReady(row, user)

  const db = getClient({ client })
  const actor = resolveCurrentUser(user)
  const resolvedAssignee = resolveAssignee({ user, assignee })
  const id = getTransactionId(row, transactionId)

  await upsertRolePlayerMarker(db, { transactionId: id, actor, assignee: resolvedAssignee, action: 'assign', note })
  const transaction = await persistAcceptedAssignment(db, { transactionId: id, actor, assignee: resolvedAssignee, action: 'assign' })
  const activity = await insertEventIfPossible(db, {
    transactionId: id,
    eventType: 'bond_intake_assigned',
    actor,
    eventData: {
      message: `Bond application assigned to ${resolvedAssignee.name}`,
      assigned_user_id: resolvedAssignee.id,
      assigned_user_name: resolvedAssignee.name,
      note,
      intake_status: 'ACCEPTED',
      source: 'new_applications_queue',
    },
  })

  return { transaction, activity, message: 'Application assigned and moved to My Applications.' }
}

export async function declineBondIntakeApplication({ row = {}, transactionId = '', user = {}, reason = '', note = '', client = null } = {}) {
  if (!canDeclineBondIntake(user)) {
    throw new Error('You do not have permission to decline this application.')
  }
  const declineReason = normalizeText(reason)
  if (!declineReason) {
    throw new Error('Decline reason is required.')
  }

  const db = getClient({ client })
  const actor = resolveCurrentUser(user)
  const id = getTransactionId(row, transactionId)
  const assignee = resolveAssignee({ user })

  await upsertRolePlayerMarker(db, { transactionId: id, actor, assignee, action: 'decline', reason: declineReason, note })
  const transaction = await persistDecline(db, { transactionId: id, actor, reason: declineReason, note })
  const activity = await insertEventIfPossible(db, {
    transactionId: id,
    eventType: 'bond_intake_declined',
    actor,
    eventData: {
      message: `Bond application declined: ${declineReason}`,
      reason: declineReason,
      note,
      intake_status: 'DECLINED',
      source: 'new_applications_queue',
    },
  })

  return { transaction, activity, message: 'Bond application declined.' }
}
