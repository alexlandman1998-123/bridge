// access owns these operations and their existing recovery behavior.
import { updateRecordByIdWithMissingColumnFallback } from '../../lib/api/shared/schemaCompatibility.js'
import { logTransactionEventIfPossible } from '../transactions/eventActions.js'
import { normalizeNullableUuid, normalizeNullableText, isMissingTableError, isMissingColumnError, isMissingSchemaError, isPermissionDeniedError, normalizeTextValue } from '../../lib/api/shared/readHelpers.js'
import { normalizeEmailAddress } from '../developments/profileNormalization.js'
import { readTransactionHandoffDispatchMode } from '../../services/transactionHandoffRegisterService.js'
import { isBondFinanceType, normalizeFinanceType } from '../../core/transactions/financeType'
import { buildSignedOtpHandoffReleaseDecision } from '../../core/transactions/signedOtpHandoffRelease.js'
import { getRolePermissions, normalizeRoleType } from '../../core/transactions/permissions'
import { checkAndNotifyBondOtpReady, notifyBondIntakeStartedForOnboarding } from '../../services/bondIntakeNotificationService'
import { resolveTransactionRoutingProfile } from '../../services/transactionRoutingProfileService'
import { syncAttorneyIncomingInstructionStatus } from '../../services/attorneyIncomingMatterInstructionSync'
import { ATTORNEY_INCOMING_INSTRUCTION_STATUSES } from '../../core/transactions/attorneyIncomingMatterContract'
import { resolveAttorneyInstructionActivationLane, shouldActivateAttorneyRoleplayerAtSignedOtp } from '../../core/transactions/attorneyInstructionActivation'
import { normalizeAttorneyLegalRole, fetchOnboardingFormDataForTransaction, upsertTransactionParticipantsRowsWithFallback, advanceTransactionMainStageIfNeeded } from '../transactions/participantInfrastructure.js'
import { notifyRolesForTransaction, fetchTransactionRolePlayersIfPossible } from '../bond/financeRead.js'
import { isFirmFirstAttorneyAllocation } from '../transactions/attorneyAllocation.js'
import { ensureBondApplicationWorkspaceRecord } from '../transactions/creationApi.js'
import { sendRoleplayerHandoffEmailForOnboarding } from '../attorney/instructionApi.js'
import { addTransactionDiscussionComment } from '../transactions/discussionApi.js'
import { getOrCreateClientPortalLinkRecord } from '../clientPortal/accessApi.js'
import { deriveOnboardingFinanceManagedBy, resolveTransactionAndContext } from '../onboarding/contextRead.js'

export function isBondActivationRequestedForOnboarding({ financeType = '', formData = {}, transaction = null } = {}) {
  const normalizedFinanceType = normalizeFinanceType(
    financeType ||
      formData?.purchase_finance_type ||
      formData?.purchaseFinanceType ||
      formData?.finance_type ||
      formData?.financeType ||
      formData?.finance?.purchase_finance_type ||
      formData?.finance?.purchaseFinanceType ||
      formData?.finance?.finance_type ||
      formData?.finance?.financeType ||
      transaction?.finance_type ||
      transaction?.financeType ||
      'cash',
    { allowUnknown: true },
  )
  if (!isBondFinanceType(normalizedFinanceType)) return false

  const financeManagedBy = deriveOnboardingFinanceManagedBy({
    formData,
    transaction: {
      ...(transaction && typeof transaction === 'object' ? transaction : {}),
      finance_type: normalizedFinanceType,
    },
  })
  return financeManagedBy === 'bond_originator'
}

function hasAttorneyActivationRoutingFacts(transaction = {}) {
  return [
    'routing_profile_json',
    'routingProfile',
    'routing_profile',
    'seller_has_existing_bond',
    'sellerHasExistingBond',
    'existing_bond',
    'existingBond',
    'cancellation_required',
    'cancellationRequired',
  ].some((key) => Object.prototype.hasOwnProperty.call(transaction || {}, key))
}

async function resolveAttorneyActivationRoutingProfile(client, transaction = {}) {
  const transactionId = normalizeNullableUuid(transaction?.id || transaction?.transaction_id)
  let routingTransaction = transaction

  // The OTP context intentionally uses a small transaction projection. Read
  // the existing routing facts only when that projection does not include
  // them, so a selected cancellation attorney is activated only for a matter
  // whose seller-bond/cancellation route actually requires one.
  if (transactionId && !hasAttorneyActivationRoutingFacts(transaction)) {
    const selectCandidates = [
      'id, finance_type, seller_has_existing_bond, existing_bond, cancellation_required, routing_profile_json',
      'id, finance_type, seller_has_existing_bond, existing_bond, cancellation_required',
      'id, finance_type',
    ]

    for (const select of selectCandidates) {
      const query = await client.from('transactions').select(select).eq('id', transactionId).maybeSingle()
      if (!query.error) {
        routingTransaction = query.data ? { ...transaction, ...query.data } : transaction
        break
      }
      if (isMissingColumnError(query.error) || isMissingSchemaError(query.error)) continue
      if (isPermissionDeniedError(query.error)) break
      throw query.error
    }
  }

  return resolveTransactionRoutingProfile({ transaction: routingTransaction })
}

async function fetchPartnerRelationshipForRoleplayer(client, roleplayer = {}) {
  const relationshipId = normalizeTextValue(
    roleplayer?.partnerRelationshipId ||
      roleplayer?.partner_relationship_id ||
      roleplayer?.snapshot?.partnerRelationshipId,
  )
  if (!relationshipId) return null
  const query = await client
    .from('organisation_partners')
    .select(
      'id, organisation_id, partner_organisation_id, partner_type, scope_type, scope_id, scope_name, preferred, status, relationship_status',
    )
    .eq('id', relationshipId)
    .maybeSingle()
  if (query.error) {
    if (
      isMissingTableError(query.error, 'organisation_partners') ||
      isPermissionDeniedError(query.error) ||
      isMissingColumnError(query.error)
    )
      return null
    throw query.error
  }
  return query.data || null
}

async function resolveProfileIdForEmail(client, email = '') {
  const normalizedEmail = normalizeEmailAddress(email)
  if (!normalizedEmail) return null
  const query = await client.from('profiles').select('id, email').ilike('email', normalizedEmail).limit(1).maybeSingle()

  if (query.error) {
    if (
      isMissingTableError(query.error, 'profiles') ||
      isMissingSchemaError(query.error) ||
      isPermissionDeniedError(query.error)
    ) {
      return null
    }
    throw query.error
  }

  return normalizeNullableUuid(query.data?.id)
}

async function ensureRoleplayerParticipantForOnboarding(
  client,
  {
    transactionId,
    roleplayer = {},
    participantRole = '',
    legalRole = 'none',
    financeManagedBy = 'bond_originator',
  } = {},
) {
  const normalizedTransactionId = normalizeNullableUuid(transactionId)
  const normalizedRole = normalizeRoleType(participantRole)
  if (!normalizedTransactionId || !normalizedRole) return null

  const email = normalizeEmailAddress(roleplayer.emailAddress || roleplayer.email_address || roleplayer.email || '')
  const participantName =
    normalizeNullableText(
      roleplayer.partnerName || roleplayer.partner_name || roleplayer.contactPerson || roleplayer.contact_person,
    ) || (normalizedRole === 'attorney' ? 'Attorney / Conveyancer' : 'Bond Originator')
  const userId = await resolveProfileIdForEmail(client, email)
  const permissions = getRolePermissions({
    role: normalizedRole,
    financeManagedBy,
  })
  const now = new Date().toISOString()
  const row = {
    transaction_id: normalizedTransactionId,
    user_id: userId,
    role_type: normalizedRole,
    legal_role: normalizedRole === 'attorney' ? normalizeAttorneyLegalRole(legalRole, 'transfer') : 'none',
    status: 'active',
    invited_at: now,
    accepted_at: now,
    removed_at: null,
    visibility_scope: 'internal',
    is_internal: true,
    participant_name: participantName,
    participant_email: email || null,
    participant_scope: 'transaction',
    assignment_source: 'transaction_direct',
    can_view: permissions.canView,
    can_comment: permissions.canComment,
    can_upload_documents: permissions.canUploadDocuments,
    can_edit_finance_workflow: permissions.canEditFinanceWorkflow,
    can_edit_attorney_workflow: permissions.canEditAttorneyWorkflow,
    can_edit_core_transaction: permissions.canEditCoreTransaction,
  }

  let result = await upsertTransactionParticipantsRowsWithFallback(client, {
    rows: [row],
    onConflict: 'transaction_id,role_type,legal_role',
    rowSelect: 'id, transaction_id, user_id, role_type, legal_role, participant_email, status',
    matchOnLegalRole: true,
  })

  if (
    result.error &&
    (isMissingColumnError(result.error, 'user_id') ||
      isMissingColumnError(result.error, 'legal_role') ||
      isMissingColumnError(result.error, 'status') ||
      isMissingColumnError(result.error, 'invited_at') ||
      isMissingColumnError(result.error, 'accepted_at') ||
      isMissingColumnError(result.error, 'removed_at') ||
      isMissingColumnError(result.error, 'visibility_scope') ||
      isMissingColumnError(result.error, 'is_internal') ||
      isMissingColumnError(result.error, 'participant_scope') ||
      isMissingColumnError(result.error, 'assignment_source') ||
      isMissingColumnError(result.error, 'can_edit_core_transaction'))
  ) {
    const fallback = { ...row }
    for (const key of [
      'user_id',
      'status',
      'invited_at',
      'accepted_at',
      'removed_at',
      'visibility_scope',
      'is_internal',
      'participant_scope',
      'assignment_source',
      'can_edit_core_transaction',
    ]) {
      if (isMissingColumnError(result.error, key)) delete fallback[key]
    }
    if (isMissingColumnError(result.error, 'legal_role')) delete fallback.legal_role

    result = await upsertTransactionParticipantsRowsWithFallback(client, {
      rows: [fallback],
      onConflict: fallback.legal_role ? 'transaction_id,role_type,legal_role' : 'transaction_id,role_type',
      rowSelect: fallback.legal_role
        ? 'id, transaction_id, role_type, legal_role, participant_email'
        : 'id, transaction_id, role_type, participant_email',
      matchOnLegalRole: Boolean(fallback.legal_role),
    })
  }

  if (result.error) {
    if (
      isMissingTableError(result.error, 'transaction_participants') ||
      isMissingSchemaError(result.error) ||
      isPermissionDeniedError(result.error)
    ) {
      return null
    }
    throw result.error
  }
  return result.data?.[0] || null
}

async function resolveAttorneyFirmForRoleplayer(client, roleplayer = {}) {
  const organisationId = normalizeNullableUuid(
    roleplayer.organisationId ||
      roleplayer.organisation_id ||
      roleplayer.snapshot?.organisationId ||
      roleplayer.snapshot?.organisation_id,
  )
  if (organisationId) {
    const byOrganisation = await client
      .from('attorney_firms')
      .select('id, name, organisation_id')
      .eq('organisation_id', organisationId)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()
    if (!byOrganisation.error && byOrganisation.data?.id) return byOrganisation.data
    if (
      byOrganisation.error &&
      !isMissingColumnError(byOrganisation.error, 'organisation_id') &&
      !isMissingColumnError(byOrganisation.error, 'is_active') &&
      !isMissingTableError(byOrganisation.error, 'attorney_firms') &&
      !isMissingSchemaError(byOrganisation.error) &&
      !isPermissionDeniedError(byOrganisation.error)
    ) {
      throw byOrganisation.error
    }
  }

  const email = normalizeEmailAddress(roleplayer.emailAddress || roleplayer.email_address || roleplayer.email || '')
  if (email) {
    const byEmail = await client
      .from('attorney_firms')
      .select('id, name, email')
      .ilike('email', email)
      .limit(1)
      .maybeSingle()
    if (!byEmail.error && byEmail.data?.id) return byEmail.data
    if (
      byEmail.error &&
      !isMissingColumnError(byEmail.error, 'email') &&
      !isMissingTableError(byEmail.error, 'attorney_firms') &&
      !isMissingSchemaError(byEmail.error) &&
      !isPermissionDeniedError(byEmail.error)
    ) {
      throw byEmail.error
    }
  }

  const name = normalizeTextValue(
    roleplayer.partnerName || roleplayer.partner_name || roleplayer.contactPerson || roleplayer.contact_person,
  )
  if (!name) return null
  const byName = await client.from('attorney_firms').select('id, name').ilike('name', name).limit(1).maybeSingle()
  if (!byName.error && byName.data?.id) return byName.data
  if (
    byName.error &&
    !isMissingTableError(byName.error, 'attorney_firms') &&
    !isMissingSchemaError(byName.error) &&
    !isPermissionDeniedError(byName.error)
  ) {
    throw byName.error
  }
  return null
}

async function resolveAttorneyFirmAssignmentPeople(client, { firmId, assignmentType = 'transfer', email = '' } = {}) {
  const normalizedFirmId = normalizeNullableUuid(firmId)
  if (!normalizedFirmId) return { primaryAttorneyId: null, departmentId: null }

  const emailUserId = await resolveProfileIdForEmail(client, email)
  let membersQuery = await client
    .from('attorney_firm_members')
    .select('user_id, department_id, role, status')
    .eq('firm_id', normalizedFirmId)
    .eq('status', 'active')

  if (membersQuery.error && isMissingColumnError(membersQuery.error, 'status')) {
    membersQuery = await client
      .from('attorney_firm_members')
      .select('user_id, department_id, role')
      .eq('firm_id', normalizedFirmId)
  }

  if (membersQuery.error) {
    if (
      isMissingTableError(membersQuery.error, 'attorney_firm_members') ||
      isMissingSchemaError(membersQuery.error) ||
      isPermissionDeniedError(membersQuery.error)
    ) {
      return { primaryAttorneyId: emailUserId, departmentId: null }
    }
    throw membersQuery.error
  }

  const members = membersQuery.data || []
  const rolePriority =
    assignmentType === 'bond'
      ? ['bond_attorney', 'director_partner', 'firm_admin']
      : ['transfer_attorney', 'director_partner', 'firm_admin']
  const memberByEmail = emailUserId
    ? members.find((member) => normalizeNullableUuid(member.user_id) === emailUserId)
    : null
  const primaryMember =
    memberByEmail ||
    rolePriority
      .map((role) => members.find((member) => normalizeTextValue(member.role).toLowerCase() === role))
      .find(Boolean) ||
    members[0] ||
    null

  let departmentId = normalizeNullableUuid(primaryMember?.department_id)
  if (!departmentId) {
    const departmentType = assignmentType === 'bond' ? 'bond' : 'transfer'
    let departmentQuery = await client
      .from('attorney_firm_departments')
      .select('id, department_type, is_active')
      .eq('firm_id', normalizedFirmId)
      .eq('department_type', departmentType)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()
    if (departmentQuery.error && isMissingColumnError(departmentQuery.error, 'is_active')) {
      departmentQuery = await client
        .from('attorney_firm_departments')
        .select('id, department_type')
        .eq('firm_id', normalizedFirmId)
        .eq('department_type', departmentType)
        .limit(1)
        .maybeSingle()
    }
    if (!departmentQuery.error) {
      departmentId = normalizeNullableUuid(departmentQuery.data?.id)
    } else if (
      !isMissingTableError(departmentQuery.error, 'attorney_firm_departments') &&
      !isMissingSchemaError(departmentQuery.error) &&
      !isPermissionDeniedError(departmentQuery.error)
    ) {
      throw departmentQuery.error
    }
  }

  return {
    primaryAttorneyId: normalizeNullableUuid(primaryMember?.user_id) || emailUserId,
    departmentId,
  }
}

async function upsertAttorneyAssignmentForRoleplayer(
  client,
  { transactionId, roleplayer = {}, assignmentType = 'transfer', attorneyRole = 'transfer_attorney' } = {},
) {
  const normalizedTransactionId = normalizeNullableUuid(transactionId)
  if (!normalizedTransactionId) return null
  const firm = await resolveAttorneyFirmForRoleplayer(client, roleplayer)
  const firmId = normalizeNullableUuid(firm?.id)
  if (!firmId) return null

  const now = new Date().toISOString()
  const email = normalizeEmailAddress(roleplayer.emailAddress || roleplayer.email_address || roleplayer.email || '')
  const people = await resolveAttorneyFirmAssignmentPeople(client, {
    firmId,
    assignmentType,
    email,
  })
  const payload = {
    transaction_id: normalizedTransactionId,
    firm_id: firmId,
    attorney_firm_id: firmId,
    assignment_type: assignmentType,
    attorney_role: attorneyRole,
    department_id: people.departmentId,
    attorney_department_id: people.departmentId,
    primary_attorney_id: people.primaryAttorneyId,
    attorney_user_id: people.primaryAttorneyId,
    status: 'active',
    assignment_status: 'active',
    is_primary: true,
    visibility_scope: 'assigned_matter',
    can_edit: true,
    can_manage_documents: true,
    can_manage_signing: true,
    can_add_internal_notes: true,
    can_add_shared_updates: true,
    can_update_workflow_lane: true,
    assigned_by: null,
    assigned_at: now,
    updated_at: now,
  }

  let existingQuery = await client
    .from('transaction_attorney_assignments')
    .select('id')
    .eq('transaction_id', normalizedTransactionId)
    .eq('attorney_role', attorneyRole)
    .limit(1)
    .maybeSingle()

  if (
    existingQuery.error &&
    (isMissingColumnError(existingQuery.error, 'attorney_role') ||
      isMissingColumnError(existingQuery.error, 'assignment_status'))
  ) {
    existingQuery = await client
      .from('transaction_attorney_assignments')
      .select('id')
      .eq('transaction_id', normalizedTransactionId)
      .eq('assignment_type', assignmentType)
      .limit(1)
      .maybeSingle()
  }

  if (existingQuery.error) {
    if (
      isMissingTableError(existingQuery.error, 'transaction_attorney_assignments') ||
      isMissingSchemaError(existingQuery.error) ||
      isPermissionDeniedError(existingQuery.error)
    ) {
      return null
    }
    throw existingQuery.error
  }

  const write = async (nextPayload) =>
    existingQuery.data?.id
      ? client
          .from('transaction_attorney_assignments')
          .update(nextPayload)
          .eq('id', existingQuery.data.id)
          .select(
            'id, transaction_id, firm_id, attorney_firm_id, assignment_type, attorney_role, assignment_status, status',
          )
          .maybeSingle()
      : client
          .from('transaction_attorney_assignments')
          .insert({ ...nextPayload, created_at: now })
          .select(
            'id, transaction_id, firm_id, attorney_firm_id, assignment_type, attorney_role, assignment_status, status',
          )
          .maybeSingle()

  let currentPayload = { ...payload }
  let result = await write(currentPayload)
  let guard = 0
  while (result.error && guard < 16) {
    const missingKey = Object.keys(currentPayload).find((key) => isMissingColumnError(result.error, key))
    if (!missingKey) break
    delete currentPayload[missingKey]
    if (!Object.keys(currentPayload).length) return null
    result = await write(currentPayload)
    guard += 1
  }

  if (result.error) {
    if (
      isMissingTableError(result.error, 'transaction_attorney_assignments') ||
      isMissingSchemaError(result.error) ||
      isPermissionDeniedError(result.error)
    ) {
      return null
    }
    throw result.error
  }

  return result.data || null
}

function resolveBondActivationScope({ transaction = {}, roleplayer = {}, relationship = null } = {}) {
  const snapshot = roleplayer?.snapshot || {}
  const scopeType = normalizeTextValue(
    snapshot.scopeType || snapshot.scope_type || relationship?.scope_type || '',
  ).toLowerCase()
  const scopeId = normalizeTextValue(snapshot.scopeId || snapshot.scope_id || relationship?.scope_id || '')
  const bondWorkspaceId = normalizeTextValue(
    transaction?.bond_workspace_id ||
      roleplayer?.organisationId ||
      roleplayer?.organisation_id ||
      snapshot.organisationId ||
      snapshot.organisation_id ||
      relationship?.partner_organisation_id ||
      '',
  )
  return {
    bondWorkspaceId,
    bondRegionId: scopeType === 'region' ? scopeId : normalizeTextValue(transaction?.bond_region_id || ''),
    bondWorkspaceUnitId: ['branch', 'team'].includes(scopeType)
      ? scopeId
      : normalizeTextValue(transaction?.bond_workspace_unit_id || ''),
    scopeType,
    scopeId,
    scopeName: normalizeTextValue(snapshot.scopeLabel || snapshot.scope_label || relationship?.scope_name || ''),
  }
}

async function createAgentBondOriginatorMissingNotification(
  client,
  { transaction, financeType, buyer = null, formData = {}, source = 'buyer_onboarding_completed' } = {},
) {
  const transactionId = normalizeTextValue(transaction?.id || transaction?.transaction_id)
  if (!transactionId) return null
  await logTransactionEventIfPossible(client, {
    transactionId,
    eventType: 'buyer_selected_bond_finance',
    createdByRole: 'client',
    eventData: {
      source,
      financeType,
      buyerName: buyer?.name || formData.full_name || null,
    },
  })
  await logTransactionEventIfPossible(client, {
    transactionId,
    eventType: 'bond_originator_missing',
    createdByRole: 'client',
    eventData: {
      source,
      financeType,
      message: 'No bond originator selected for this transaction. Please assign one to continue.',
    },
  })

  const agentEmail = normalizeTextValue(transaction?.assigned_agent_email || '').toLowerCase()
  if (!agentEmail) return null
  const profileQuery = await client.from('profiles').select('id, email').eq('email', agentEmail).maybeSingle()
  if (profileQuery.error) {
    if (isMissingTableError(profileQuery.error, 'profiles') || isPermissionDeniedError(profileQuery.error)) return null
    throw profileQuery.error
  }
  const userId = profileQuery.data?.id
  if (!userId) return null

  const dedupeKey = `bond_originator_missing:${transactionId}:${userId}`
  const existing = await client
    .from('transaction_notifications')
    .select('id')
    .eq('user_id', userId)
    .eq('dedupe_key', dedupeKey)
    .limit(1)
    .maybeSingle()
  if (
    existing.error &&
    (isMissingTableError(existing.error, 'transaction_notifications') ||
      isMissingColumnError(existing.error, 'dedupe_key') ||
      isPermissionDeniedError(existing.error))
  ) {
    return null
  }
  if (existing.error) throw existing.error
  if (existing.data) return existing.data

  const payload = {
    transaction_id: transactionId,
    user_id: userId,
    role_type: 'agent',
    notification_type: 'bond_originator_required',
    title: 'Bond originator required',
    message: 'No bond originator selected for this transaction. Please assign one to continue.',
    is_read: false,
    dedupe_key: dedupeKey,
    event_type: 'bond_originator_missing',
    event_data: {
      source,
      financeType,
    },
  }
  let insertResult = await client
    .from('transaction_notifications')
    .insert(payload)
    .select('id, transaction_id, user_id, notification_type, title, message, created_at')
    .single()
  if (
    insertResult.error &&
    (isMissingColumnError(insertResult.error, 'dedupe_key') ||
      isMissingColumnError(insertResult.error, 'event_type') ||
      isMissingColumnError(insertResult.error, 'event_data'))
  ) {
    const fallbackPayload = { ...payload }
    delete fallbackPayload.dedupe_key
    delete fallbackPayload.event_type
    delete fallbackPayload.event_data
    insertResult = await client
      .from('transaction_notifications')
      .insert(fallbackPayload)
      .select('id, transaction_id, user_id, notification_type, title, message, created_at')
      .single()
  }
  if (insertResult.error) {
    if (
      isMissingTableError(insertResult.error, 'transaction_notifications') ||
      isPermissionDeniedError(insertResult.error)
    )
      return null
    throw insertResult.error
  }
  return insertResult.data || null
}

async function activateSelectedAttorneyRoleplayersForOnboarding(
  client,
  {
    transaction,
    financeType,
    buyer = null,
    formData = {},
    source = 'buyer_onboarding_completed',
    createdByRole = 'client',
  } = {},
) {
  const transactionId = normalizeTextValue(transaction?.id || transaction?.transaction_id)
  if (!transactionId) {
    return []
  }

  const rolePlayers = await fetchTransactionRolePlayersIfPossible(client, transactionId)
  const bondActivationRequested = isBondActivationRequestedForOnboarding({
    financeType,
    formData,
    transaction,
  })
  const routingProfile = await resolveAttorneyActivationRoutingProfile(client, transaction)
  const cancellationActivationRequested = Boolean(
    routingProfile?.requiresCancellationAttorney || routingProfile?.cancellationRequired,
  )
  const selectedAttorneyRoleplayers = rolePlayers.filter((item) =>
    !isFirmFirstAttorneyAllocation(item) &&
    shouldActivateAttorneyRoleplayerAtSignedOtp(item, {
      bondActivationRequested,
      cancellationActivationRequested,
    }),
  )

  const now = new Date().toISOString()
  const activated = []
  for (const roleplayer of selectedAttorneyRoleplayers) {
    const lane = resolveAttorneyInstructionActivationLane(roleplayer)
    if (!lane) continue

    if (roleplayer.id) {
      await updateRecordByIdWithMissingColumnFallback(
        client,
        'transaction_role_players',
        roleplayer.id,
        {
          status: 'active',
          assignment_status: 'active',
          activated_at: roleplayer.activatedAt || now,
          updated_at: now,
        },
        'id, status, assignment_status, activated_at, updated_at',
      )
    }

    await ensureRoleplayerParticipantForOnboarding(client, {
      transactionId,
      roleplayer,
      participantRole: 'attorney',
      legalRole: lane.legalRole,
      financeManagedBy: isBondFinanceType(financeType) ? 'bond_originator' : transaction?.finance_managed_by,
    })

    await upsertAttorneyAssignmentForRoleplayer(client, {
      transactionId,
      roleplayer,
      assignmentType: lane.assignmentType,
      attorneyRole: lane.roleType,
    })

    await logTransactionEventIfPossible(client, {
      transactionId,
      eventType: lane.activationEventType,
      createdByRole,
      eventData: {
        source,
        financeType,
        legalRole: lane.legalRole,
        buyerName: buyer?.name || formData.full_name || null,
        attorneyName: roleplayer.partnerName || roleplayer.contactPerson || null,
        attorneyEmail: roleplayer.emailAddress || null,
        roleplayerId: roleplayer.id || null,
      },
    })
    activated.push(roleplayer)
  }

  return activated
}

async function promoteMandateTransferAttorneyAllocationToInstruction(
  client,
  { transaction, source = 'signed_otp_received' } = {},
) {
  const transactionId = normalizeNullableUuid(transaction?.id || transaction?.transaction_id)
  const listingId = normalizeNullableUuid(
    transaction?.listing_id ||
      transaction?.listingId ||
      transaction?.private_listing_id ||
      transaction?.privateListingId,
  )
  if (!transactionId || !listingId) return { updatedCount: 0, reason: 'missing_transaction_or_listing' }

  const allocationsQuery = await client
    .from('private_listing_role_players')
    .select('*')
    .eq('private_listing_id', listingId)
    .eq('role_type', 'transfer_attorney')
    .in('allocation_status', ['awaiting_buyer', 'under_offer', 'instructed'])

  if (allocationsQuery.error) {
    if (
      isMissingTableError(allocationsQuery.error, 'private_listing_role_players') ||
      isPermissionDeniedError(allocationsQuery.error)
    ) {
      return { updatedCount: 0, reason: 'allocation_unavailable' }
    }
    throw allocationsQuery.error
  }

  const instructedAt = new Date().toISOString()
  let updatedCount = 0
  for (const allocation of allocationsQuery.data || []) {
    const updated = await updateRecordByIdWithMissingColumnFallback(
      client,
      'private_listing_role_players',
      allocation.id,
      {
        allocation_status: 'instructed',
        transaction_id: transactionId,
        instructed_at: allocation.instructed_at || instructedAt,
        instruction_source: allocation.instruction_source || source,
        updated_at: instructedAt,
      },
      'id, allocation_status, transaction_id, instructed_at, instruction_source, updated_at',
    )
    if (updated?.length) updatedCount += 1
  }

  return { updatedCount, transactionId, listingId, instructedAt }
}

async function activateSelectedBondOriginatorForOnboarding(
  client,
  {
    transaction,
    financeType,
    buyer = null,
    formData = {},
    source = 'buyer_onboarding_completed',
    createdByRole = 'client',
  } = {},
) {
  const transactionId = normalizeTextValue(transaction?.id || transaction?.transaction_id)
  if (
    !transactionId ||
    !isBondActivationRequestedForOnboarding({
      financeType,
      formData,
      transaction,
    })
  ) {
    return {
      activated: false,
      reason: isBondFinanceType(financeType || transaction?.finance_type)
        ? 'finance_not_originator_managed'
        : 'not_bond_finance',
    }
  }

  const rolePlayers = await fetchTransactionRolePlayersIfPossible(client, transactionId)
  const selectedBondOriginator = rolePlayers.find(
    (item) =>
      item.roleType === 'bond_originator' &&
      !['removed', 'declined'].includes(normalizeTextValue(item.assignmentStatus || item.status).toLowerCase()),
  )
  if (!selectedBondOriginator?.id) {
    await createAgentBondOriginatorMissingNotification(client, {
      transaction,
      financeType,
      buyer,
      formData,
      source,
    })
    return { activated: false, reason: 'no_selected_bond_originator' }
  }

  const now = new Date().toISOString()
  const relationship = await fetchPartnerRelationshipForRoleplayer(client, selectedBondOriginator)
  const scope = resolveBondActivationScope({
    transaction,
    roleplayer: selectedBondOriginator,
    relationship,
  })
  const bondOriginatorProfileId = await resolveProfileIdForEmail(client, selectedBondOriginator.emailAddress)
  await updateRecordByIdWithMissingColumnFallback(
    client,
    'transaction_role_players',
    selectedBondOriginator.id,
    {
      status: 'active',
      assignment_status: 'active',
      activated_at: selectedBondOriginator.activatedAt || now,
      updated_at: now,
    },
    'id, status, assignment_status, activated_at, updated_at',
  )

  await ensureRoleplayerParticipantForOnboarding(client, {
    transactionId,
    roleplayer: selectedBondOriginator,
    participantRole: 'bond_originator',
    legalRole: 'none',
    financeManagedBy: 'bond_originator',
  })

  await updateRecordByIdWithMissingColumnFallback(
    client,
    'transactions',
    transactionId,
    {
      bond_originator:
        selectedBondOriginator.partnerName ||
        selectedBondOriginator.contactPerson ||
        transaction?.bond_originator ||
        null,
      assigned_bond_originator_email:
        selectedBondOriginator.emailAddress || transaction?.assigned_bond_originator_email || null,
      bond_workspace_id: scope.bondWorkspaceId || transaction?.bond_workspace_id || null,
      bond_region_id: scope.bondRegionId || null,
      bond_workspace_unit_id: scope.bondWorkspaceUnitId || null,
      primary_bond_consultant_user_id: bondOriginatorProfileId || transaction?.primary_bond_consultant_user_id || null,
      bond_assignment_source: 'workflow_assignment',
      finance_managed_by: 'bond_originator',
      finance_status: 'Bond originator activated · Pipeline created',
      last_meaningful_activity_at: now,
      updated_at: now,
    },
    'id, bond_originator, assigned_bond_originator_email, bond_workspace_id, bond_region_id, bond_workspace_unit_id, primary_bond_consultant_user_id, bond_assignment_source, finance_managed_by, finance_status, updated_at',
  )

  await logTransactionEventIfPossible(client, {
    transactionId,
    eventType: 'buyer_selected_bond_finance',
    createdByRole,
    eventData: {
      source,
      financeType,
      buyerName: buyer?.name || formData.full_name || null,
    },
  })

  await logTransactionEventIfPossible(client, {
    transactionId,
    eventType: 'bond_originator_activated',
    createdByRole,
    eventData: {
      source,
      financeType,
      buyerName: buyer?.name || formData.full_name || null,
      bondOriginatorName: selectedBondOriginator.partnerName || selectedBondOriginator.contactPerson || null,
      bondOriginatorEmail: selectedBondOriginator.emailAddress || null,
      roleplayerId: selectedBondOriginator.id,
      scopeType: scope.scopeType || null,
      scopeId: scope.scopeId || null,
    },
  })

  await ensureBondApplicationWorkspaceRecord(client, {
    transactionId,
    buyerId: buyer?.id || transaction?.buyer_id || transaction?.buyerId || null,
    selection: {
      roleType: 'bond_originator',
      organisationId: selectedBondOriginator.organisationId || selectedBondOriginator.organisation_id || null,
      partnerOrganisationId:
        selectedBondOriginator.organisationId ||
        selectedBondOriginator.organisation_id ||
        scope.bondWorkspaceId ||
        null,
      regionId:
        selectedBondOriginator.snapshot?.regionId ||
        selectedBondOriginator.snapshot?.region_id ||
        scope.bondRegionId ||
        null,
      workspaceUnitId:
        selectedBondOriginator.snapshot?.workspaceUnitId ||
        selectedBondOriginator.snapshot?.workspace_unit_id ||
        selectedBondOriginator.snapshot?.branchId ||
        selectedBondOriginator.snapshot?.branch_id ||
        scope.bondWorkspaceUnitId ||
        null,
      branchId:
        selectedBondOriginator.snapshot?.branchId ||
        selectedBondOriginator.snapshot?.branch_id ||
        selectedBondOriginator.snapshot?.workspaceUnitId ||
        selectedBondOriginator.snapshot?.workspace_unit_id ||
        scope.bondWorkspaceUnitId ||
        null,
      teamId: selectedBondOriginator.snapshot?.teamId || selectedBondOriginator.snapshot?.team_id || null,
      userId:
        bondOriginatorProfileId ||
        selectedBondOriginator.snapshot?.userId ||
        selectedBondOriginator.snapshot?.user_id ||
        null,
      companyName: selectedBondOriginator.partnerName || null,
      contactPerson: selectedBondOriginator.contactPerson || selectedBondOriginator.partnerName || null,
      email: selectedBondOriginator.emailAddress || null,
      phone: selectedBondOriginator.phoneNumber || null,
      snapshot: selectedBondOriginator.snapshot || {},
    },
    actorProfile: { userId: null, role: 'client' },
  })

  return {
    activated: true,
    roleplayer: selectedBondOriginator,
    scope,
  }
}

function buildClientPortalAccessMetadata(link = null) {
  const token = normalizeNullableText(link?.token)
  if (!token) {
    return {
      clientPortalPath: '',
      clientPortalToken: '',
      buyerPortalPath: '',
      buyerPortalToken: '',
    }
  }

  const path = `/client/${token}`
  return {
    clientPortalPath: path,
    clientPortalToken: token,
    buyerPortalPath: path,
    buyerPortalToken: token,
  }
}

async function resolveBuyerBondApplicationPortalMetadata(client, { transaction = {}, buyer = {}, unit = {} } = {}) {
  const transactionId = normalizeNullableUuid(transaction?.id || transaction?.transaction_id)
  const developmentId = normalizeNullableUuid(
    unit?.development_id ||
      unit?.development?.id ||
      transaction?.development_id ||
      transaction?.developmentId,
  )
  const unitId = normalizeNullableUuid(unit?.id || transaction?.unit_id || transaction?.unitId)
  const buyerId = normalizeNullableUuid(buyer?.id || transaction?.buyer_id || transaction?.buyerId)

  if (!transactionId || !buyerId) {
    return {
      ...buildClientPortalAccessMetadata(null),
      portalLinkSource: 'missing_context',
    }
  }

  const link = await getOrCreateClientPortalLinkRecord(client, {
    developmentId,
    unitId,
    transactionId,
    buyerId,
    requireDevelopmentSettings: false,
  })

  return {
    ...buildClientPortalAccessMetadata(link),
    portalLinkSource: link?.token ? 'client_portal_links' : 'unavailable',
  }
}

async function markTransactionSignedOtpReceived(client, { transactionId, nextAction = '' } = {}) {
  const normalizedTransactionId = normalizeNullableUuid(transactionId)
  if (!normalizedTransactionId) return null

  const nowIso = new Date().toISOString()
  const resolvedNextAction = normalizeNullableText(nextAction)

  await updateRecordByIdWithMissingColumnFallback(
    client,
    'transactions',
    normalizedTransactionId,
    {
      onboarding_status: 'signed_otp_received',
      next_action: resolvedNextAction,
      comment: resolvedNextAction,
      last_meaningful_activity_at: nowIso,
      updated_at: nowIso,
    },
    'id, onboarding_status, next_action, comment, last_meaningful_activity_at, updated_at',
  )

  await syncAttorneyIncomingInstructionStatus(client, {
    transactionId: normalizedTransactionId,
    status: ATTORNEY_INCOMING_INSTRUCTION_STATUSES.readyForAcceptance,
    occurredAt: nowIso,
    source: 'signed_otp_received',
  })

  return {
    onboardingStatus: 'signed_otp_received',
    nextAction: resolvedNextAction,
  }
}

export async function triggerPostSigningWorkflowIfNeeded(
  client,
  {
    transactionId,
    financeType = '',
    actorUserId = null,
    actorRole = 'client',
    source = 'client_otp_signed_final',
  } = {},
) {
  const normalizedTransactionId = normalizeNullableText(transactionId)
  if (!normalizedTransactionId) {
    return { triggered: false, reason: 'missing_transaction' }
  }

  const { transaction, buyer, unit } = await resolveTransactionAndContext(client, normalizedTransactionId)
  const formDataRow = await fetchOnboardingFormDataForTransaction(
    client,
    normalizedTransactionId,
    transaction?.purchaser_type || 'individual',
  )
  const onboardingFormData = formDataRow?.formData || {}
  const normalizedFinanceType = normalizeFinanceType(financeType || transaction?.finance_type || 'cash', {
    allowUnknown: true,
  })
  const bondFinance = isBondFinanceType(normalizedFinanceType)
  const financeManagedBy = deriveOnboardingFinanceManagedBy({
    formData: onboardingFormData,
    transaction: {
      ...transaction,
      finance_type: normalizedFinanceType,
    },
  })
  const originatorManagedFinance = bondFinance && financeManagedBy === 'bond_originator'
  const targetMainStage = originatorManagedFinance ? 'FIN' : 'ATT'
  const nextAction = originatorManagedFinance
    ? 'Finance workflow triggered from signed OTP. Begin finance processing.'
    : bondFinance
      ? 'Signed OTP finalised. Buyer-managed finance selected; track external finance proof and continue transfer preparation.'
      : 'Signed OTP finalised. Continue transfer preparation.'
  const workflowMessage = originatorManagedFinance
    ? 'Signed OTP finalised. Finance workflow has been triggered.'
    : bondFinance
      ? 'Signed OTP finalised. Buyer-managed finance is being handled outside the bond originator pipeline.'
      : 'Signed OTP finalised. Transfer workflow can proceed.'

  await markTransactionSignedOtpReceived(client, {
    transactionId: normalizedTransactionId,
    nextAction,
  })

  const durableDispatch = await readTransactionHandoffDispatchMode(client, normalizedTransactionId)

  let activation = null
  let attorneyActivation = []
  let mandateAllocationPromotion = null
  let signedOtpHandoffRelease = null
  if (!durableDispatch) {
    try {
      attorneyActivation = await activateSelectedAttorneyRoleplayersForOnboarding(client, {
        transaction,
        financeType: normalizedFinanceType,
        buyer,
        formData: onboardingFormData,
        source: 'signed_otp_received',
        createdByRole: actorRole,
      })
      await syncAttorneyIncomingInstructionStatus(client, {
        transactionId: normalizedTransactionId,
        status: ATTORNEY_INCOMING_INSTRUCTION_STATUSES.readyForAcceptance,
        occurredAt: new Date().toISOString(),
        source: 'signed_otp_attorney_activation',
      })
      mandateAllocationPromotion = await promoteMandateTransferAttorneyAllocationToInstruction(client, {
        transaction,
        source: 'signed_otp_received',
      })
      activation = await activateSelectedBondOriginatorForOnboarding(client, {
        transaction,
        financeType: normalizedFinanceType,
        buyer,
        formData: onboardingFormData,
        source: 'signed_otp_received',
        createdByRole: actorRole,
      })
      if (activation?.activated) {
        let buyerBondApplicationPortalMetadata = {}
        try {
          buyerBondApplicationPortalMetadata = await resolveBuyerBondApplicationPortalMetadata(client, {
            transaction,
            buyer,
            unit,
          })
        } catch (portalLinkError) {
          buyerBondApplicationPortalMetadata = { portalLinkSource: 'resolution_failed' }
          console.warn('Buyer bond application portal link resolution failed', {
            transactionId: normalizedTransactionId,
            error: portalLinkError,
          })
        }
        await notifyBondIntakeStartedForOnboarding({
          transaction: {
            ...transaction,
            finance_type: normalizedFinanceType,
            buyer_name: buyer?.name || null,
            buyer_email: buyer?.email || null,
            bond_workspace_id: activation.scope?.bondWorkspaceId || transaction?.bond_workspace_id || null,
            bond_region_id: activation.scope?.bondRegionId || transaction?.bond_region_id || null,
            bond_workspace_unit_id: activation.scope?.bondWorkspaceUnitId || transaction?.bond_workspace_unit_id || null,
            transaction_role_players: [
              {
                ...activation.roleplayer,
                status: 'active',
                assignment_status: 'active',
              },
            ],
            unit_number: unit?.unit_number || null,
            development_name:
              unit?.development && Array.isArray(unit.development)
                ? unit.development[0]?.name || null
                : unit?.development?.name || null,
          },
          formData: onboardingFormData,
          actor: { id: actorUserId || null, roleType: actorRole },
          client,
          emailEnabled: true,
          metadata: {
            source: 'signed_otp_received',
            ...buyerBondApplicationPortalMetadata,
          },
        })
        const notifiedAt = new Date().toISOString()
        await updateRecordByIdWithMissingColumnFallback(
          client,
          'transaction_role_players',
          activation.roleplayer.id,
          {
            status: 'active',
            assignment_status: 'active',
            notified_at: notifiedAt,
            updated_at: notifiedAt,
          },
          'id, status, assignment_status, notified_at, updated_at',
        )
      }

      await sendRoleplayerHandoffEmailForOnboarding(client, {
        transactionId: normalizedTransactionId,
      })
    } catch (handoffSetupError) {
      console.warn('Signed OTP handoff activation failed', {
        transactionId: normalizedTransactionId,
        error: handoffSetupError,
      })
    }

  }

  const stageResult = await advanceTransactionMainStageIfNeeded(client, {
    transactionId: normalizedTransactionId,
    targetMainStage,
    allowedCurrentMainStages: originatorManagedFinance ? ['OTP', 'DEP', 'FIN'] : ['OTP', 'DEP', 'FIN', 'ATT'],
    nextAction,
    comment: workflowMessage,
    source,
    actorRole,
  })

  if (originatorManagedFinance && !durableDispatch) {
    await checkAndNotifyBondOtpReady({
      transaction: {
        id: normalizedTransactionId,
        finance_type: normalizedFinanceType,
        finance_managed_by: financeManagedBy,
      },
      previousOtpReady: false,
      currentOtpReady: true,
      actor: { id: actorUserId || null, roleType: actorRole },
      metadata: {
        source: 'signed_otp_received',
        workflow: 'finance',
        financeManagedBy,
      },
      client,
    })
  }

  signedOtpHandoffRelease = buildSignedOtpHandoffReleaseDecision({
    durableDispatch,
    transaction,
    financeType: normalizedFinanceType,
    financeManagedBy,
    originatorManagedFinance,
    bondOriginatorActivation: activation,
    attorneyActivation,
    mandateAllocationPromotion,
    stageResult,
    nextAction,
    releasedAt: new Date().toISOString(),
    source: 'signed_otp_received',
  })
  try {
    await logTransactionEventIfPossible(client, {
      transactionId: normalizedTransactionId,
      eventType: signedOtpHandoffRelease.event.type,
      createdByRole: actorRole,
      eventData: signedOtpHandoffRelease.event.data,
    })
    await notifyRolesForTransaction(client, {
      transactionId: normalizedTransactionId,
      ...signedOtpHandoffRelease.notification,
      excludeUserId: actorUserId || null,
    })
  } catch (handoffReleaseProjectionError) {
    if (!isPermissionDeniedError(handoffReleaseProjectionError) && !isMissingSchemaError(handoffReleaseProjectionError)) {
      throw handoffReleaseProjectionError
    }
    console.warn('Signed OTP handoff release projection skipped', handoffReleaseProjectionError)
  }

  if (stageResult?.advanced) {
    await addTransactionDiscussionComment({
      transactionId: normalizedTransactionId,
      authorName: 'Arch9 System',
      authorRole: 'internal_admin',
      commentText: `[system] ${workflowMessage}`,
      client,
    })
  }

  return {
    triggered: true,
    workflow: originatorManagedFinance ? 'finance' : 'attorney',
    financeManagedBy,
    originatorManagedFinance,
    activation,
    attorneyActivation,
    mandateAllocationPromotion,
    signedOtpHandoffRelease,
    stageResult,
  }
}
