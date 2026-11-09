// access owns these operations and their existing recovery behavior.
import { resolveProfileIdsByEmail } from '../developments/configurationActions.js'
import { updateRecordByIdWithMissingColumnFallback } from '../../lib/api/shared/schemaCompatibility.js'
import { normalizeNullableUuid, normalizeNullableText, isMissingTableError, isMissingColumnError, isPermissionDeniedError, normalizeTextValue } from '../../lib/api/shared/readHelpers.js'
import { FIRM_FIRST_ATTORNEY_ROLE_TYPES, isFirmFirstAttorneyAllocation } from '../transactions/attorneyAllocation.js'
import { prepareFirmFirstAttorneyRoleplayer, resolveTransactionRoleplayerSelectionSource, resolveRoleplayerSelectionScope, recordUniversalRolePlayerAssignmentEvent } from '../transactions/creationApi.js'
import { normalizeTransactionRoleplayerRoleType } from '../bond/financeRead.js'

export function normalizeTransactionRoleplayerSelection(item = {}) {
  const roleType = normalizeTransactionRoleplayerRoleType(item.roleType || item.role_type || '')
  const allowedRoleTypes = new Set([
    'transfer_attorney',
    'bond_originator',
    'bond_attorney',
    'cancellation_attorney',
    'developer_contact',
    'agent',
    'other',
  ])
  if (!allowedRoleTypes.has(roleType)) return null

  const partner = item.partner && typeof item.partner === 'object' ? item.partner : item
  const organisationId = normalizeNullableUuid(
    item.organisationId || item.organisation_id || partner.organisationId || partner.organisation_id,
  )
  const relationshipId = normalizeNullableUuid(
    item.relationshipId || item.relationship_id || partner.relationshipId || partner.relationship_id,
  )
  const userId = normalizeNullableUuid(item.userId || item.user_id || partner.userId || partner.user_id)
  const workspaceUnitId = normalizeNullableUuid(
    item.workspaceUnitId || item.workspace_unit_id || partner.workspaceUnitId || partner.workspace_unit_id,
  )
  const regionId = normalizeNullableUuid(item.regionId || item.region_id || partner.regionId || partner.region_id)
  const branchId = normalizeNullableUuid(item.branchId || item.branch_id || partner.branchId || partner.branch_id)
  const teamId = normalizeNullableUuid(item.teamId || item.team_id || partner.teamId || partner.team_id)
  const companyName = normalizeNullableText(
    partner.companyName || partner.organisationName || partner.partnerName || partner.name,
  )
  const contactPerson = normalizeNullableText(
    partner.contactPerson || partner.contactName || partner.name || companyName,
  )
  const email =
    normalizeNullableText(partner.email || partner.emailAddress || partner.email_address)?.toLowerCase() || null
  const assignmentStatus =
    normalizeTextValue(item.assignmentStatus || item.assignment_status || item.status || 'selected').toLowerCase() ||
    'selected'
  const activationTrigger =
    normalizeTextValue(item.activationTrigger || item.activation_trigger) ||
    (roleType === 'bond_originator'
      ? 'buyer_selects_bond_or_hybrid'
      : roleType === 'bond_attorney'
        ? 'bond_approved'
        : roleType === 'transfer_attorney'
          ? 'attorney_instruction_stage'
          : 'manual')
  const firmFirstAllocation = FIRM_FIRST_ATTORNEY_ROLE_TYPES.has(roleType) &&
    (item.firmFirstAllocation === true || item.firm_first_allocation === true)
  const preferredAttorneyUserId = normalizeNullableUuid(
    item.preferredAttorneyUserId || item.preferred_attorney_user_id || partner.preferredAttorneyUserId,
  )

  if (roleType === 'transfer_attorney' && !organisationId && !companyName && !email) return null
  if (roleType !== 'transfer_attorney' && !organisationId && !companyName && !email) return null

  const selection = {
    roleType,
    organisationId,
    relationshipId,
    userId,
    regionId,
    workspaceUnitId,
    branchId,
    teamId,
    companyName,
    contactPerson,
    email,
    phone: normalizeNullableText(partner.phone || partner.phoneNumber || partner.phone_number),
    selectionSource: resolveTransactionRoleplayerSelectionSource(item, partner),
    assignmentStatus,
    activationTrigger,
    firmFirstAllocation,
    preferredAttorneyUserId,
    snapshot: {
      roleType,
      organisationId,
      relationshipId,
      userId,
      regionId,
      workspaceUnitId,
      branchId,
      teamId,
      scopeType: normalizeNullableText(item.scopeType || item.scope_type || partner.scopeType),
      scopeId: normalizeNullableText(item.scopeId || item.scope_id || partner.scopeId),
      scopeLabel: normalizeNullableText(item.scopeLabel || item.scope_label || partner.scopeLabel),
      preferred: Boolean(item.preferred || partner.preferred),
      companyName,
      contactPerson,
      email,
      activationTrigger,
      firmFirstAllocation,
      preferredAttorneyUserId,
    },
  }
  return firmFirstAllocation ? prepareFirmFirstAttorneyRoleplayer(selection) : selection
}

export async function upsertTransactionRoleplayerSelection(client, { transactionId, selection, actorProfile }) {
  const now = new Date().toISOString()
  const isFirmFirstAttorneyAllocationForRoleplayer = isFirmFirstAttorneyAllocation(selection)
  const profileIdByEmail =
    !isFirmFirstAttorneyAllocationForRoleplayer && !selection.userId && selection.email
      ? await resolveProfileIdsByEmail(client, [selection.email])
      : {}
  const resolvedUserId = isFirmFirstAttorneyAllocationForRoleplayer
    ? null
    : selection.userId || (selection.email ? profileIdByEmail[selection.email] || null : null)
  const scope = resolveRoleplayerSelectionScope(selection, resolvedUserId)
  const selectionSource = selection.selectionSource || 'transaction_direct'
  const payload = {
    transaction_id: transactionId,
    role_type: selection.roleType,
    selection_source: selectionSource,
    partner_relationship_id: selection.relationshipId || null,
    organisation_id: scope.organisationId,
    workspace_unit_id: scope.workspaceUnitId,
    branch_id: scope.branchId,
    user_id: resolvedUserId,
    assigned_organisation_id: scope.organisationId,
    assigned_workspace_unit_id: scope.workspaceUnitId,
    assigned_branch_id: scope.branchId,
    assigned_region_id: scope.regionId,
    assigned_team_id: scope.teamId,
    assigned_user_id: resolvedUserId,
    scope_level: scope.scopeLevel,
    scope_metadata: {
      source: 'transaction_roleplayer_selection',
      roleType: selection.roleType,
    },
    partner_name: selection.companyName || selection.contactPerson || null,
    contact_person: selection.contactPerson || selection.companyName || null,
    email_address: selection.email || null,
    phone_number: selection.phone || null,
    status: selection.assignmentStatus || 'selected',
    assignment_status: selection.assignmentStatus || 'selected',
    activation_trigger: selection.activationTrigger || null,
    activated_at: selection.assignmentStatus === 'active' ? now : null,
    assigned_by: actorProfile?.userId || null,
    snapshot_json: {
      ...(selection.snapshot || {}),
      userId: resolvedUserId,
      organisationId: scope.organisationId,
      workspaceUnitId: scope.workspaceUnitId,
      branchId: scope.branchId,
      regionId: scope.regionId,
      teamId: scope.teamId,
    },
    updated_at: now,
  }

  const existing = await client
    .from('transaction_role_players')
    .select('id')
    .eq('transaction_id', transactionId)
    .eq('role_type', selection.roleType)
    .is('removed_at', null)
    .limit(1)

  let existingRows = existing
  if (existingRows.error && isMissingColumnError(existingRows.error, 'removed_at')) {
    existingRows = await client
      .from('transaction_role_players')
      .select('id')
      .eq('transaction_id', transactionId)
      .eq('role_type', selection.roleType)
      .limit(1)
  }
  if (existingRows.error) {
    if (isMissingTableError(existingRows.error, 'transaction_role_players')) {
      throw new Error('Transaction roleplayer storage is not set up yet.')
    }
    if (isPermissionDeniedError(existingRows.error)) {
      throw new Error('Your role does not have permission to save transaction roleplayers.')
    }
    throw existingRows.error
  }

  let result = null
  if (existingRows.data?.[0]?.id) {
    result = await updateRecordByIdWithMissingColumnFallback(
      client,
      'transaction_role_players',
      existingRows.data[0].id,
      payload,
      'id, transaction_id, role_type, selection_source, partner_name, contact_person, email_address, phone_number, snapshot_json, created_at, updated_at',
    )
    if (!Array.isArray(result) || !result.length) {
      throw new Error(`Unable to save ${selection.roleType.replaceAll('_', ' ')} roleplayer.`)
    }
    return result
  }

  const insertPayload = {
    ...payload,
    created_at: now,
  }
  result = await client.from('transaction_role_players').insert(insertPayload).select('id').limit(1)
  if (
    result.error &&
    (isMissingColumnError(result.error, 'partner_relationship_id') ||
      isMissingColumnError(result.error, 'organisation_id') ||
      isMissingColumnError(result.error, 'workspace_unit_id') ||
      isMissingColumnError(result.error, 'branch_id') ||
      isMissingColumnError(result.error, 'user_id') ||
      isMissingColumnError(result.error, 'assigned_organisation_id') ||
      isMissingColumnError(result.error, 'assigned_workspace_unit_id') ||
      isMissingColumnError(result.error, 'assigned_branch_id') ||
      isMissingColumnError(result.error, 'assigned_region_id') ||
      isMissingColumnError(result.error, 'assigned_team_id') ||
      isMissingColumnError(result.error, 'assigned_user_id') ||
      isMissingColumnError(result.error, 'scope_level') ||
      isMissingColumnError(result.error, 'scope_metadata') ||
      isMissingColumnError(result.error, 'status') ||
      isMissingColumnError(result.error, 'assignment_status') ||
      isMissingColumnError(result.error, 'activation_trigger') ||
      isMissingColumnError(result.error, 'activated_at') ||
      isMissingColumnError(result.error, 'assigned_by') ||
      isMissingColumnError(result.error, 'removed_at'))
  ) {
    const fallbackPayload = {
      transaction_id: transactionId,
      role_type: selection.roleType,
      selection_source: selectionSource,
      partner_name: selection.companyName || selection.contactPerson || null,
      contact_person: selection.contactPerson || selection.companyName || null,
      email_address: selection.email || null,
      phone_number: selection.phone || null,
      snapshot_json: selection.snapshot || {},
      created_at: now,
      updated_at: now,
    }
    result = await client.from('transaction_role_players').insert(fallbackPayload).select('id').limit(1)
  }

  if (result.error) {
    if (isMissingTableError(result.error, 'transaction_role_players')) {
      throw new Error('Transaction roleplayer storage is not set up yet.')
    }
    if (isPermissionDeniedError(result.error)) {
      throw new Error('Your role does not have permission to save transaction roleplayers.')
    }
    throw result.error
  }
  if (!Array.isArray(result.data) || !result.data.length) {
    throw new Error(`Unable to save ${selection.roleType.replaceAll('_', ' ')} roleplayer.`)
  }
  await recordUniversalRolePlayerAssignmentEvent(client, {
    transactionId,
    roleType: selection.roleType,
    assignedUserId: resolvedUserId,
    organisationId: scope.organisationId,
    regionId: scope.regionId,
    branchId: scope.branchId,
    teamId: scope.teamId,
    sourceModule: 'transaction',
    sourceEvent: 'upsert_transaction_roleplayer_selection',
    assignmentSource: selectionSource,
    selectionSource,
    actorUserId: actorProfile?.userId || null,
    previousOwnerId: null,
    fallbackUsed: selection.assignmentStatus === 'pending_assignment',
    assignmentStatus: selection.assignmentStatus || 'selected',
    metadata: {
      relationshipId: selection.relationshipId || null,
      partnerName: selection.companyName || selection.contactPerson || null,
      email: selection.email || null,
    },
  })
  return result.data || null
}

export function isTransactionSignedOtpReadyForRoleplayerReplay(transaction = {}) {
  const transactionStatus = normalizeTextValue(
    transaction?.onboarding_status || transaction?.onboardingStatus,
  ).toLowerCase()
  return ['signed_otp_received', 'otp_uploaded'].includes(transactionStatus)
}
