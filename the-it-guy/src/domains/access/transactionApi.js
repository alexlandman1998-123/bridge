// access owns these operations and their existing recovery behavior.
import { resolveProfileIdsByEmail } from '../developments/configurationActions.js'
import { getOrCreateTransactionOnboardingRecord } from '../onboarding/workflow.js'
import { updateRecordByIdWithMissingColumnFallback } from '../../lib/api/shared/schemaCompatibility.js'
import { logTransactionEventIfPossible, publishWorkflowChangedIfPossible } from '../transactions/eventActions.js'
import { resolveActiveProfileContext, normalizeFirmRole } from './actorContext.js'
import { resolveDevelopmentParticipantsByIdentity, normalizeStakeholderStatus } from '../developments/participantReadApi.js'
import { fetchTransactionRowById } from '../transactions/workspaceReadApi.js'
import { enrichRowsWithReadinessContext } from '../transactions/readinessReadApi.js'
import { fetchTransactionsData } from '../transactions/listReadApi.js'
import { normalizeDocumentVisibilityScope } from '../documents/listReadApi.js'
import { selectWithoutKnownMissingColumns, registerKnownMissingColumns } from '../../lib/api/shared/schemaReadCompatibility.js'
import { normalizeNullableUuid, normalizeNullableText, requireClient, isMissingTableError, isMissingColumnError, isMissingSchemaError, isPermissionDeniedError, normalizeTextValue } from '../../lib/api/shared/readHelpers.js'
import { dedupeTransactionRows } from '../../core/transactions/legacyReadModel.js'
import { normalizeEmailAddress } from '../developments/profileNormalization.js'
import { saveTransactionSellerDetails } from '../../services/transactionSellerSaveService.js'
import { normalizePurchaserType } from '../../lib/purchaserPersonas'
import { isBondFinanceType, normalizeFinanceType } from '../../core/transactions/financeType'
import { normalizeRoleType } from '../../core/transactions/permissions'
import { createPerfTimer } from '../../lib/performanceTrace'
import { resolveTransactionParticipantShape } from '../../services/roleResolutionService'
import { FIRM_TYPE_VALUES } from '../shared/constants.js'
import { normalizeTransactionAccessLevel, normalizeAttorneyLegalRole, isInternalStakeholderRole, fetchOnboardingFormDataForTransaction, normalizeTransactionParticipantRow, upsertTransactionParticipantsRowsWithFallback } from '../transactions/participantInfrastructure.js'
import { ensureTransactionParticipants } from '../transactions/workspaceHydration.js'
import { findOrCreateBuyer, isFirmFirstAttorneyAllocation } from '../transactions/attorneyAllocation.js'
import { resolveAttorneyFirmIdForCreationRoleplayer, propagateTransactionRoleplayersIfPossible, recordUniversalRolePlayerAssignmentEvent, buildStakeholderPermissionPayload } from '../transactions/creationApi.js'
import { normalizeTransactionRoleplayerSelection, upsertTransactionRoleplayerSelection, isTransactionSignedOtpReadyForRoleplayerReplay } from './roleplayerPersistence.js'
import { fetchTransactionById } from '../transactions/detailReadApi.js'
import { fetchTransactionDiscussion } from '../transactions/discussionApi.js'
import { getOnboardingFinanceSnapshot } from '../finance/onboardingSnapshot.js'
import { resolveTransactionAndContext } from '../onboarding/contextRead.js'
import { triggerPostSigningWorkflowIfNeeded } from './roleplayerActivation.js'

const OTP_SIGNING_READY_ONBOARDING_STATUSES = new Set([
  'submitted',
  'reviewed',
  'approved',
  'complete',
  'completed',
  'client_onboarding_complete',
  'awaiting_signed_otp',
  'signed_otp_received',
])

function isMissingRelationshipError(error) {
  if (!error) return false
  const code = String(error.code || '').toUpperCase()
  const message = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase()
  if (code && code !== 'PGRST200') return false
  return code === 'PGRST200' || message.includes('could not find a relationship')
}

function normalizeFirmType(value, fallback = 'attorney') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  return FIRM_TYPE_VALUES.includes(normalized) ? normalized : fallback
}

function isTransactionOnboardingCompleteForRoleplayerReplay(transaction = {}, onboarding = null) {
  const transactionStatus = normalizeTextValue(
    transaction?.onboarding_status || transaction?.onboardingStatus,
  ).toLowerCase()
  const onboardingStatus = normalizeTextValue(onboarding?.status).toLowerCase()
  return (
    OTP_SIGNING_READY_ONBOARDING_STATUSES.has(transactionStatus) ||
    ['submitted', 'reviewed', 'approved', 'complete', 'completed'].includes(onboardingStatus) ||
    Boolean(transaction?.onboarding_completed_at || transaction?.onboardingCompletedAt) ||
    Boolean(transaction?.external_onboarding_submitted_at || transaction?.externalOnboardingSubmittedAt) ||
    Boolean(onboarding?.submittedAt || onboarding?.submitted_at)
  )
}

async function replayRoleplayerAllocationForCompletedOnboarding(
  client,
  { transactionId, transaction: providedTransaction = null, actorProfile = null, actorRole = 'agent' } = {},
) {
  const normalizedTransactionId = normalizeNullableUuid(transactionId || providedTransaction?.id)
  if (!normalizedTransactionId) return { skipped: true, reason: 'missing_transaction' }

  const transaction =
    providedTransaction?.id === normalizedTransactionId
      ? providedTransaction
      : await fetchTransactionRowById(client, normalizedTransactionId)
  if (!transaction?.id) {
    throw new Error('Transaction not found while replaying roleplayer allocation.')
  }

  const onboarding = await getOrCreateTransactionOnboardingRecord(
    client,
    {
      transactionId: normalizedTransactionId,
      purchaserType: transaction.purchaser_type || 'individual',
    },
    { createIfMissing: false },
  )
  if (!isTransactionOnboardingCompleteForRoleplayerReplay(transaction, onboarding)) {
    return { skipped: true, reason: 'onboarding_not_complete' }
  }

  const [context, formDataRow] = await Promise.all([
    resolveTransactionAndContext(client, normalizedTransactionId),
    fetchOnboardingFormDataForTransaction(client, normalizedTransactionId, transaction.purchaser_type || 'individual'),
  ])
  const resolvedTransaction = {
    ...context.transaction,
    ...transaction,
  }
  const formData = formDataRow?.formData || {}
  const financeSnapshot = getOnboardingFinanceSnapshot({
    formData,
    transaction: resolvedTransaction,
  })
  const signedOtpReceived = isTransactionSignedOtpReadyForRoleplayerReplay(resolvedTransaction)

  if (!signedOtpReceived) {
    await logTransactionEventIfPossible(client, {
      transactionId: normalizedTransactionId,
      eventType: 'roleplayer_handoff_pending_signed_otp',
      createdBy: actorProfile?.userId || null,
      createdByRole: normalizeRoleType(actorRole || actorProfile?.role || 'agent'),
      eventData: {
        source: 'roleplayers_saved_after_onboarding_complete',
        onboardingStatus: normalizeTextValue(resolvedTransaction.onboarding_status || ''),
        financeType: financeSnapshot.financeType || resolvedTransaction.finance_type || null,
      },
    })

    return {
      skipped: false,
      pendingSignedOtp: true,
      reason: 'awaiting_signed_otp',
    }
  }

  const workflowResult = await triggerPostSigningWorkflowIfNeeded(client, {
    transactionId: normalizedTransactionId,
    financeType: financeSnapshot.financeType || resolvedTransaction.finance_type,
    actorUserId: actorProfile?.userId || null,
    actorRole: normalizeRoleType(actorRole || actorProfile?.role || 'agent'),
    source: 'roleplayers_saved_after_signed_otp',
  })

  await logTransactionEventIfPossible(client, {
    transactionId: normalizedTransactionId,
    eventType: 'roleplayer_handoff_replayed',
    createdBy: actorProfile?.userId || null,
    createdByRole: normalizeRoleType(actorRole || actorProfile?.role || 'agent'),
    eventData: {
      source: 'roleplayers_saved_after_signed_otp',
      workflowTriggered: Boolean(workflowResult?.triggered),
      workflowType: workflowResult?.workflow || null,
      stageAdvanced: Boolean(workflowResult?.stageResult?.advanced),
      bondOriginatorActivated: Boolean(workflowResult?.activation?.activated),
      bondOriginatorActivationReason: workflowResult?.activation?.reason || null,
    },
  })

  return {
    skipped: false,
    pendingSignedOtp: false,
    workflowTriggered: Boolean(workflowResult?.triggered),
    workflowResult,
  }
}

export async function saveTransactionRoleplayerSelections({ transactionId, roleplayers = [], actorRole = null, preserveUnspecifiedRoleplayers = false, source = 'buyer_onboarding_roleplayer_confirmation', allocationOnly = false } = {}) {
  if (!transactionId) throw new Error('Transaction is required.')
  const timer = createPerfTimer('api.saveTransactionRoleplayerSelections', {
    allocationOnly,
    roleplayerCount: Array.isArray(roleplayers) ? roleplayers.length : 0,
  })
  const client = requireClient()
  const actorProfile = await resolveActiveProfileContext(client)
  timer.mark('actor_profile_resolved')
  const normalizedActorRole = normalizeRoleType(actorRole || actorProfile.role || 'agent')
  if (!['agent', 'agency_admin', 'developer', 'internal_admin', 'admin', 'attorney'].includes(normalizedActorRole)) {
    throw new Error('Your role does not have permission to manage transaction roleplayers.')
  }

  const selections = roleplayers
    .map(normalizeTransactionRoleplayerSelection)
    .filter(Boolean)
    .map((selection) => ({
      ...selection,
      assignmentStatus: selection.assignmentStatus || 'active',
      activationTrigger: selection.activationTrigger || 'immediate',
      snapshot: {
        ...(selection.snapshot || {}),
        assignmentStatus: selection.assignmentStatus || 'active',
        activationTrigger: selection.activationTrigger || 'immediate',
      },
    }))
  const transferAttorney = selections.find((item) => item.roleType === 'transfer_attorney')
  if (!transferAttorney && !allocationOnly) {
    throw new Error('Transfer Attorney is required before buyer onboarding can be sent.')
  }

  if (allocationOnly && !selections.length) throw new Error('Select a transaction professional to allocate.')

  const transaction = await fetchTransactionRowById(client, transactionId)
  if (!transaction?.id) {
    throw new Error('Transaction not found.')
  }
  timer.mark('transaction_loaded')

  if (transferAttorney && (source === 'imported_transaction_conveyancing' || allocationOnly)) {
    const firmId = await resolveAttorneyFirmIdForCreationRoleplayer(client, {
      ...transferAttorney,
      partnerName: transferAttorney.companyName || transferAttorney.contactPerson,
    }, transactionId)
    if (!firmId) throw new Error('The selected partner is not linked to an active attorney workspace.')
  }

  if (allocationOnly && selections.some((selection) => selection.roleType === 'bond_originator') && !isBondFinanceType(normalizeFinanceType(transaction.finance_type, { allowUnknown: true }))) {
    throw new Error('Choose Bond or Combination finance before allocating a bond originator.')
  }

  for (const selection of selections) {
    const savedRows = await upsertTransactionRoleplayerSelection(client, {
      transactionId,
      selection,
      actorProfile,
    })
    if (!Array.isArray(savedRows) || !savedRows.length) {
      throw new Error(`Unable to save ${selection.roleType.replaceAll('_', ' ')} roleplayer.`)
    }
  }
  timer.mark('roleplayers_persisted')

  const bondOriginator = selections.find((item) => item.roleType === 'bond_originator')
  // Standalone allocation changes only the chosen professional; buyer delivery
  // remains an explicit action in the onboarding confirmation flow.
  const preserveOtherAssignments = allocationOnly || preserveUnspecifiedRoleplayers
  const roleplayerPatch = {
    ...(transferAttorney ? {
      attorney: transferAttorney.companyName || transferAttorney.contactPerson || null,
      assigned_attorney_email: transferAttorney.email || null,
    } : {}),
    ...(bondOriginator || !preserveOtherAssignments ? {
      bond_originator: bondOriginator?.companyName || bondOriginator?.contactPerson || null,
      assigned_bond_originator_email: bondOriginator?.email || null,
    } : {}),
    ...(allocationOnly && bondOriginator ? { finance_managed_by: 'bond_originator' } : {}),
    updated_at: new Date().toISOString(),
  }
  const updatedTransaction = { ...transaction, ...roleplayerPatch }
  await updateRecordByIdWithMissingColumnFallback(
    client,
    'transactions',
    transactionId,
    roleplayerPatch,
    'id, attorney, assigned_attorney_email, bond_originator, assigned_bond_originator_email, updated_at',
  )
  timer.mark('transaction_updated')

  await propagateTransactionRoleplayersIfPossible(client, {
    transactionId,
    transaction: updatedTransaction,
    rolePlayers: selections.map((selection) => ({
      roleType: selection.roleType,
      selectionSource: selection.selectionSource,
      assignmentStatus: selection.assignmentStatus,
      activationTrigger: selection.activationTrigger,
      partnerOrganisationId: selection.organisationId || null,
      partnerRelationshipId: selection.relationshipId || null,
      partnerName: selection.companyName || selection.contactPerson || null,
      contactPerson: selection.contactPerson || selection.companyName || null,
      email: selection.email || null,
      phone: selection.phone || null,
      userId: selection.userId || null,
      firmFirstAllocation: selection.firmFirstAllocation === true,
      preferredAttorneyUserId: selection.preferredAttorneyUserId || null,
      workspaceUnitId: selection.workspaceUnitId || null,
      branchId: selection.branchId || null,
      regionId: selection.regionId || null,
      teamId: selection.teamId || null,
      snapshot: selection.snapshot || {},
    })),
    actorProfile,
    actorRole: normalizedActorRole,
    buyerId: transaction.buyer_id || null,
    financeType: transaction.finance_type || 'cash',
    preserveWorkflowState: allocationOnly,
  })
  timer.mark('roleplayers_propagated')

  await logTransactionEventIfPossible(client, {
    transactionId,
    eventType: 'roleplayer_reassigned',
    createdBy: actorProfile.userId || null,
    createdByRole: normalizedActorRole,
    eventData: {
      source,
      roleplayers: selections.map((item) => ({
        roleType: item.roleType,
        organisationId: item.organisationId,
        relationshipId: item.relationshipId,
        partnerName: item.companyName,
        email: item.email,
        activationTrigger: item.activationTrigger,
        assignmentStatus: item.assignmentStatus,
      })),
    },
  })

  for (const selection of selections) {
    const eventType =
      isFirmFirstAttorneyAllocation(selection)
        ? 'attorney_firm_nominated'
        : selection.roleType === 'transfer_attorney'
        ? 'transfer_attorney_assigned'
        : selection.roleType === 'bond_originator'
          ? 'bond_originator_assigned'
          : selection.roleType === 'bond_attorney'
            ? 'roleplayer_visibility_granted'
            : selection.roleType === 'cancellation_attorney'
              ? 'cancellation_attorney_assigned'
              : null
    if (!eventType) continue
    await logTransactionEventIfPossible(client, {
      transactionId,
      eventType,
      createdBy: actorProfile.userId || null,
      createdByRole: normalizedActorRole,
      eventData: {
        source,
        partnerName: selection.companyName,
        email: selection.email,
        organisationId: selection.organisationId,
        relationshipId: selection.relationshipId,
        activationTrigger: selection.activationTrigger,
        firmFirstAllocation: isFirmFirstAttorneyAllocation(selection),
      },
    })
  }
  timer.mark('allocation_events_logged')

  if (!allocationOnly) {
    await replayRoleplayerAllocationForCompletedOnboarding(client, {
      transactionId,
      transaction: updatedTransaction,
      actorProfile,
      actorRole: normalizedActorRole,
    })
  }

  await publishWorkflowChangedIfPossible(client, {
    transactionId,
    triggerType: 'transaction_update',
    triggerId: transactionId,
    reasonCode: 'attorney_lane_requirement_changed',
    userId: actorProfile.userId || null,
    source: 'save_transaction_roleplayer_selections',
    payload: {
      roleplayers: selections.map((selection) => ({
        roleType: selection.roleType,
        organisationId: selection.organisationId || null,
        email: selection.email || null,
      })),
    },
  })
  timer.mark('workflow_change_published')

  // Standalone allocation callers refresh only the active workspace dataset.
  // Returning the full transaction detail here caused the dialog to wait for a
  // broad read, followed by another focused refresh in the page.
  if (allocationOnly) {
    timer.end({ fullTransactionDetailSkipped: true })
    return { transaction: updatedTransaction, allocationOnly: true }
  }
  const detail = await fetchTransactionById(transactionId)
  timer.end({ fullTransactionDetailSkipped: false })
  return detail
}

async function resolveProfileIdentityByUserId(client, userId) {
  if (!userId) {
    return { userId: null, email: '', fullName: '' }
  }

  let profileQuery = await client.from('profiles').select('id, email, full_name').eq('id', userId).maybeSingle()
  if (profileQuery.error && isMissingColumnError(profileQuery.error)) {
    profileQuery = await client.from('profiles').select('id, email').eq('id', userId).maybeSingle()
  }
  if (profileQuery.error) {
    if (isMissingSchemaError(profileQuery.error)) {
      return { userId, email: '', fullName: '' }
    }
    // Profile enrichment must never block transaction/detail loading.
    console.warn('resolveProfileIdentityByUserId fallback: profiles lookup failed', {
      userId,
      code: profileQuery.error?.code,
      message: profileQuery.error?.message,
    })
    return { userId, email: '', fullName: '' }
  }

  let email = normalizeEmailAddress(profileQuery.data?.email)
  let fullName = normalizeTextValue(
    profileQuery.data?.full_name ||
      [profileQuery.data?.first_name, profileQuery.data?.last_name].filter(Boolean).join(' '),
  )
  if (!email) {
    try {
      const authResult = await client.auth.getUser()
      const authUser = authResult?.data?.user || null
      if (authUser?.id === userId) {
        email = normalizeEmailAddress(authUser.email)
        if (!fullName) {
          fullName = normalizeTextValue(
            authUser?.user_metadata?.full_name ||
              authUser?.user_metadata?.name ||
              [authUser?.user_metadata?.first_name, authUser?.user_metadata?.last_name].filter(Boolean).join(' '),
          )
        }
      }
    } catch {
      // Best-effort fallback only; keep access resolution working with userId when auth lookup fails.
    }
  }

  return {
    userId,
    email,
    fullName,
  }
}

function getDirectParticipantTransactionIds(rows = [], normalizedRole = null) {
  const transactionIds = new Set()
  for (const row of rows || []) {
    if (row?.removed_at) continue
    if (row?.status && normalizeStakeholderStatus(row.status, 'active') !== 'active') continue
    if (!normalizedRole || normalizeRoleType(row.role_type) === normalizedRole) {
      if (row?.transaction_id) transactionIds.add(row.transaction_id)
    }
  }
  return transactionIds
}

async function fetchDirectParticipantRowsByIdentity(
  client,
  { identityColumn = '', identityValue = '', organisationId = '' } = {},
) {
  if (!identityColumn || !identityValue) {
    return { rows: [], requiresOrganisationFilter: false }
  }

  const normalizedOrganisationId = normalizeTextValue(organisationId)
  const runQuery = async ({ includeStatus = true, includeOrganisationRelation = Boolean(normalizedOrganisationId) } = {}) => {
    const selectFields = [
      'transaction_id',
      'role_type',
      ...(includeStatus ? ['status', 'removed_at'] : []),
      ...(includeOrganisationRelation ? ['transaction:transactions!transaction_participants_transaction_id_fkey!inner(organisation_id)'] : []),
    ].join(', ')
    let query = client
      .from('transaction_participants')
      .select(selectFields)
      .eq(identityColumn, identityValue)
    if (includeOrganisationRelation) {
      query = query.eq('transaction.organisation_id', normalizedOrganisationId)
    }
    return query
  }

  const runWithSchemaFallback = async () => {
    let query = await runQuery()
    if (query.error && normalizedOrganisationId && isMissingRelationshipError(query.error)) {
      // Some projects can lag PostgREST's relationship cache. Keep the
      // organisation boundary by falling back to a compact participant read
      // and validating every returned transaction id below.
      query = await runQuery({ includeOrganisationRelation: false })
    }
    if (query.error && isMissingColumnError(query.error, 'user_id') && identityColumn === 'user_id') {
      return { data: [], error: null }
    }
    if (
      query.error &&
      (isMissingColumnError(query.error, 'status') || isMissingColumnError(query.error, 'removed_at'))
    ) {
      query = await runQuery({
        includeStatus: false,
        includeOrganisationRelation: Boolean(normalizedOrganisationId) && !isMissingRelationshipError(query.error),
      })
      if (query.error && normalizedOrganisationId && isMissingRelationshipError(query.error)) {
        query = await runQuery({ includeStatus: false, includeOrganisationRelation: false })
      }
    }
    return query
  }

  const query = await runWithSchemaFallback()
  if (query.error && !isMissingSchemaError(query.error)) {
    throw query.error
  }

  return {
    rows: query.data || [],
    requiresOrganisationFilter: Boolean(normalizedOrganisationId),
  }
}

async function filterTransactionIdsToOrganisation(client, transactionIds = [], organisationId = '') {
  const normalizedOrganisationId = normalizeTextValue(organisationId)
  const ids = [...new Set((transactionIds || []).filter(Boolean))]
  if (!normalizedOrganisationId || !ids.length) return new Set()

  const runQuery = async ({ includeActive = true } = {}) => client
    .from('transactions')
    .select(includeActive ? 'id, is_active' : 'id')
    .in('id', ids)
    .eq('organisation_id', normalizedOrganisationId)

  let query = await runQuery()
  if (query.error && isMissingColumnError(query.error, 'is_active')) {
    query = await runQuery({ includeActive: false })
  }
  if (query.error) {
    if (isMissingSchemaError(query.error) || isMissingColumnError(query.error, 'organisation_id')) {
      return new Set()
    }
    throw query.error
  }

  return new Set(
    (query.data || [])
      .filter((row) => row?.id && row?.is_active !== false)
      .map((row) => row.id),
  )
}

async function fetchLegacyAssignedTransactionIds(
  client,
  { participantEmail = '', roleType = null, organisationId = '' } = {},
) {
  const normalizedEmail = normalizeEmailAddress(participantEmail)
  const normalizedOrganisationId = normalizeTextValue(organisationId)
  const normalizedRole = roleType ? normalizeRoleType(roleType) : null
  const legacyAssignmentColumnByRole = {
    attorney: 'assigned_attorney_email',
    agent: 'assigned_agent_email',
    bond_originator: 'assigned_bond_originator_email',
  }
  const legacyColumn = legacyAssignmentColumnByRole[normalizedRole || '']
  if (!normalizedEmail || !legacyColumn) return new Set()

  const runQuery = async ({ includeActive = true } = {}) => {
    let query = client.from('transactions').select(includeActive ? 'id, is_active' : 'id')
    if (normalizedOrganisationId) {
      query = query.eq('organisation_id', normalizedOrganisationId)
    }
    return query.eq(legacyColumn, normalizedEmail)
  }

  let query = await runQuery()
  if (query.error && isMissingColumnError(query.error, 'is_active')) {
    query = await runQuery({ includeActive: false })
  }
  if (
    query.error &&
    !isMissingColumnError(query.error, legacyColumn) &&
    !isMissingSchemaError(query.error)
  ) {
    throw query.error
  }

  return new Set(
    (query.data || [])
      .filter((row) => row?.id && row?.is_active !== false)
      .map((row) => row.id),
  )
}

async function fetchDirectTransactionIdsForUser(
  client,
  { userId = null, participantEmail = '', participantName = '', roleType = null, organisationId = '' } = {},
) {
  const normalizedRole = roleType ? normalizeRoleType(roleType) : null
  const normalizedEmail = normalizeEmailAddress(participantEmail)
  const normalizedName = normalizeTextValue(participantName)
  // Only the Agent dashboard supplies an organisation scope today. Preserve the
  // wider compatibility behaviour for all other callers and roles.
  const scopedOrganisationId = normalizedRole === 'agent' ? normalizeTextValue(organisationId) : ''
  const transactionIds = new Set()

  const [participantRowsByUser, participantRowsByEmail, legacyTransactionIds] = await Promise.all([
    fetchDirectParticipantRowsByIdentity(client, {
      identityColumn: 'user_id',
      identityValue: userId,
      organisationId: scopedOrganisationId,
    }),
    fetchDirectParticipantRowsByIdentity(client, {
      identityColumn: 'participant_email',
      identityValue: normalizedEmail,
      organisationId: scopedOrganisationId,
    }),
    fetchLegacyAssignedTransactionIds(client, {
      participantEmail: normalizedEmail,
      roleType: normalizedRole,
      organisationId: scopedOrganisationId,
    }),
  ])

  const participantResults = [participantRowsByUser, participantRowsByEmail]
  const relationshipFallbackIds = participantResults.flatMap((result) =>
    result.requiresOrganisationFilter ? [...getDirectParticipantTransactionIds(result.rows, normalizedRole)] : [],
  )
  const scopedRelationshipFallbackIds = await filterTransactionIdsToOrganisation(
    client,
    relationshipFallbackIds,
    scopedOrganisationId,
  )

  for (const result of participantResults) {
    const ids = getDirectParticipantTransactionIds(result.rows, normalizedRole)
    for (const transactionId of ids) {
      if (!result.requiresOrganisationFilter || scopedRelationshipFallbackIds.has(transactionId)) {
        transactionIds.add(transactionId)
      }
    }
  }
  for (const transactionId of legacyTransactionIds) {
    transactionIds.add(transactionId)
  }

  if (normalizedRole === 'attorney') {
    let membershipsQuery = await client
      .from('attorney_firm_members')
      .select('firm_id, department_id, professional_role, practice_qualifications, status')
      .eq('user_id', userId)
      .eq('status', 'active')

    if (
      membershipsQuery.error &&
      !isMissingSchemaError(membershipsQuery.error) &&
      !isMissingTableError(membershipsQuery.error, 'attorney_firm_members')
    ) {
      throw membershipsQuery.error
    }

    const membershipsByFirmId = (membershipsQuery.data || []).reduce((accumulator, membership) => {
      const firmId = normalizeTextValue(membership?.firm_id)
      if (firmId) accumulator[firmId] = membership
      return accumulator
    }, {})
    const firmWideRoles = new Set(['firm_admin', 'director_partner'])

    let assignmentQuery = await client
      .from('transaction_attorney_assignments')
      .select(
        'transaction_id, firm_id, attorney_firm_id, department_id, attorney_department_id, primary_attorney_id, attorney_user_id, preferred_attorney_user_id, secretary_id, admin_handler_id, status, assignment_status',
      )

    if (
      assignmentQuery.error &&
      (isMissingColumnError(assignmentQuery.error, 'assignment_status') ||
        isMissingColumnError(assignmentQuery.error, 'attorney_firm_id') ||
        isMissingColumnError(assignmentQuery.error, 'attorney_department_id') ||
        isMissingColumnError(assignmentQuery.error, 'attorney_user_id') ||
        isMissingColumnError(assignmentQuery.error, 'preferred_attorney_user_id'))
    ) {
      assignmentQuery = await client
        .from('transaction_attorney_assignments')
        .select('transaction_id, firm_id, department_id, primary_attorney_id, secretary_id, admin_handler_id, status')
    }

    if (
      assignmentQuery.error &&
      !isMissingSchemaError(assignmentQuery.error) &&
      !isMissingTableError(assignmentQuery.error, 'transaction_attorney_assignments')
    ) {
      throw assignmentQuery.error
    }

    for (const row of assignmentQuery.data || []) {
      const status = normalizeTextValue(row?.assignment_status || row?.status || '').toLowerCase()
      if (status === 'removed' || status === 'inactive' || status === 'suspended') {
        continue
      }
      const assignedUserIds = [
        row?.primary_attorney_id,
        row?.attorney_user_id,
        row?.preferred_attorney_user_id,
        row?.secretary_id,
        row?.admin_handler_id,
      ].map((item) => normalizeTextValue(item))
      const firmId = normalizeTextValue(row?.attorney_firm_id || row?.firm_id)
      const departmentId = normalizeTextValue(row?.attorney_department_id || row?.department_id)
      const membership = firmId ? membershipsByFirmId[firmId] : null
      const membershipDepartmentId = normalizeTextValue(membership?.department_id)
      const membershipRole = normalizeTextValue(membership?.professional_role).toLowerCase()
      const hasAssignmentAccess =
        assignedUserIds.includes(normalizeTextValue(userId)) ||
        (membership && firmWideRoles.has(membershipRole)) ||
        Boolean(membership && membershipDepartmentId && departmentId && membershipDepartmentId === departmentId)

      if (!hasAssignmentAccess) {
        continue
      }
      if (row?.transaction_id) {
        transactionIds.add(row.transaction_id)
      }
    }
  }

  if (userId && normalizedRole === 'bond_originator') {
    let membershipsQuery = await client
      .from('organisation_users')
      .select(
        'organisation_id, status, role, workspace_role, organisation_role, scope_level, region_id, workspace_unit_id, branch_id, primary_branch_id, team_id',
      )
      .eq('user_id', userId)
      .eq('status', 'active')

    if (
      membershipsQuery.error &&
      (isMissingColumnError(membershipsQuery.error, 'status') ||
        isMissingColumnError(membershipsQuery.error, 'scope_level') ||
        isMissingColumnError(membershipsQuery.error, 'region_id') ||
        isMissingColumnError(membershipsQuery.error, 'workspace_unit_id') ||
        isMissingColumnError(membershipsQuery.error, 'team_id'))
    ) {
      membershipsQuery = await client
        .from('organisation_users')
        .select('organisation_id, status, role, workspace_role, organisation_role, branch_id, primary_branch_id')
        .eq('user_id', userId)
    }

    if (
      membershipsQuery.error &&
      !isMissingSchemaError(membershipsQuery.error) &&
      !isMissingTableError(membershipsQuery.error, 'organisation_users') &&
      !isPermissionDeniedError(membershipsQuery.error)
    ) {
      throw membershipsQuery.error
    }

    const organisationIds = [
      ...new Set(
        (membershipsQuery.data || []).map((row) => normalizeNullableUuid(row?.organisation_id)).filter(Boolean),
      ),
    ]

    if (organisationIds.length) {
      let workspaceTransactionsQuery = await client
        .from('transactions')
        .select('id, is_active')
        .in('bond_workspace_id', organisationIds)

      if (workspaceTransactionsQuery.error && isMissingColumnError(workspaceTransactionsQuery.error, 'is_active')) {
        workspaceTransactionsQuery = await client
          .from('transactions')
          .select('id')
          .in('bond_workspace_id', organisationIds)
      }

      if (
        workspaceTransactionsQuery.error &&
        !isMissingColumnError(workspaceTransactionsQuery.error, 'bond_workspace_id') &&
        !isMissingSchemaError(workspaceTransactionsQuery.error)
      ) {
        throw workspaceTransactionsQuery.error
      }

      for (const row of workspaceTransactionsQuery.data || []) {
        if (row?.is_active === false) continue
        if (row?.id) transactionIds.add(row.id)
      }

      let roleplayerQuery = await client
        .from('transaction_role_players')
        .select('transaction_id, role_type, status, assignment_status, organisation_id')
        .eq('role_type', 'bond_originator')
        .in('organisation_id', organisationIds)

      if (
        roleplayerQuery.error &&
        (isMissingColumnError(roleplayerQuery.error, 'status') ||
          isMissingColumnError(roleplayerQuery.error, 'assignment_status'))
      ) {
        roleplayerQuery = await client
          .from('transaction_role_players')
          .select('transaction_id, role_type, organisation_id')
          .eq('role_type', 'bond_originator')
          .in('organisation_id', organisationIds)
      }

      if (
        roleplayerQuery.error &&
        !isMissingColumnError(roleplayerQuery.error, 'organisation_id') &&
        !isMissingSchemaError(roleplayerQuery.error) &&
        !isMissingTableError(roleplayerQuery.error, 'transaction_role_players') &&
        !isPermissionDeniedError(roleplayerQuery.error)
      ) {
        throw roleplayerQuery.error
      }

      for (const row of roleplayerQuery.data || []) {
        const status = normalizeTextValue(row?.assignment_status || row?.status || '').toLowerCase()
        if (['removed', 'declined', 'rejected'].includes(status)) continue
        if (row?.transaction_id) transactionIds.add(row.transaction_id)
      }

      let bondApplicationQuery = await client
        .from('transaction_bond_applications')
        .select(
          'transaction_id, assigned_organisation_id, assigned_region_id, assigned_workspace_unit_id, assigned_branch_id, assigned_team_id, assigned_user_id, assignment_status, status',
        )
        .in('assigned_organisation_id', organisationIds)

      if (
        bondApplicationQuery.error &&
        (isMissingColumnError(bondApplicationQuery.error, 'assigned_region_id') ||
          isMissingColumnError(bondApplicationQuery.error, 'assigned_workspace_unit_id') ||
          isMissingColumnError(bondApplicationQuery.error, 'assigned_branch_id') ||
          isMissingColumnError(bondApplicationQuery.error, 'assigned_team_id') ||
          isMissingColumnError(bondApplicationQuery.error, 'assigned_user_id') ||
          isMissingColumnError(bondApplicationQuery.error, 'assignment_status'))
      ) {
        bondApplicationQuery = await client
          .from('transaction_bond_applications')
          .select('transaction_id, assigned_organisation_id, status')
          .in('assigned_organisation_id', organisationIds)
      }

      if (
        bondApplicationQuery.error &&
        !isMissingColumnError(bondApplicationQuery.error, 'assigned_organisation_id') &&
        !isMissingSchemaError(bondApplicationQuery.error) &&
        !isMissingTableError(bondApplicationQuery.error, 'transaction_bond_applications') &&
        !isPermissionDeniedError(bondApplicationQuery.error)
      ) {
        throw bondApplicationQuery.error
      }

      const activeMemberships = membershipsQuery.data || []
      for (const row of bondApplicationQuery.data || []) {
        const status = normalizeTextValue(row?.assignment_status || row?.status || '').toLowerCase()
        if (['removed', 'declined', 'rejected', 'inactive', 'suspended'].includes(status)) continue
        if (!bondApplicationScopeMatchesMembership(row, activeMemberships, userId)) continue
        if (row?.transaction_id) transactionIds.add(row.transaction_id)
      }
    }

    let assignedApplicationQuery = await client
      .from('transaction_bond_applications')
      .select('transaction_id, assigned_user_id, assignment_status, status')
      .eq('assigned_user_id', userId)

    if (assignedApplicationQuery.error && isMissingColumnError(assignedApplicationQuery.error, 'assignment_status')) {
      assignedApplicationQuery = await client
        .from('transaction_bond_applications')
        .select('transaction_id, assigned_user_id, status')
        .eq('assigned_user_id', userId)
    }

    if (
      assignedApplicationQuery.error &&
      !isMissingColumnError(assignedApplicationQuery.error, 'assigned_user_id') &&
      !isMissingSchemaError(assignedApplicationQuery.error) &&
      !isMissingTableError(assignedApplicationQuery.error, 'transaction_bond_applications') &&
      !isPermissionDeniedError(assignedApplicationQuery.error)
    ) {
      throw assignedApplicationQuery.error
    }

    for (const row of assignedApplicationQuery.data || []) {
      const status = normalizeTextValue(row?.assignment_status || row?.status || '').toLowerCase()
      if (['removed', 'declined', 'rejected', 'inactive', 'suspended'].includes(status)) continue
      if (row?.transaction_id) transactionIds.add(row.transaction_id)
    }
  }

  // Agent access is resolved through transaction_participants and legacy assigned_agent_email.
  // Some production schemas do not expose transactions.assigned_user_id, and probing it adds
  // a failing REST request to every agent pipeline load.

  // Backward compatibility for datasets where bond originator assignment
  // was stored only as a transaction-level display name.
  if (normalizedName && normalizedRole === 'bond_originator') {
    let legacyNameQuery = await client
      .from('transactions')
      .select('id, is_active')
      .ilike('bond_originator', normalizedName)

    if (legacyNameQuery.error && isMissingColumnError(legacyNameQuery.error, 'is_active')) {
      legacyNameQuery = await client.from('transactions').select('id').ilike('bond_originator', normalizedName)
    }

    if (
      legacyNameQuery.error &&
      !isMissingColumnError(legacyNameQuery.error, 'bond_originator') &&
      !isMissingSchemaError(legacyNameQuery.error)
    ) {
      throw legacyNameQuery.error
    }

    for (const row of legacyNameQuery.data || []) {
      if (row?.is_active === false) {
        continue
      }
      if (row?.id) {
        transactionIds.add(row.id)
      }
    }
  }

  return transactionIds
}

function normalizeBondMembershipScopeLevel(membership = {}) {
  const explicit = normalizeTextValue(
    membership?.scope_level || membership?.scopeLevel || membership?.scope,
  ).toLowerCase()
  if (['workspace_hq', 'organisation', 'organization', 'hq', 'all_branches'].includes(explicit)) return 'workspace_hq'
  if (['region', 'regional'].includes(explicit)) return 'region'
  if (['branch', 'branch_only', 'assigned_branch'].includes(explicit)) return 'branch'
  if (['team', 'team_only'].includes(explicit)) return 'team'
  if (['assigned', 'assigned_only', 'user', 'own', 'independent'].includes(explicit)) return 'assigned'

  const role = normalizeTextValue(
    membership?.workspace_role ||
      membership?.workspaceRole ||
      membership?.organisation_role ||
      membership?.organisationRole ||
      membership?.role,
  ).toLowerCase()
  if (['owner', 'principal', 'director', 'partner', 'hq_manager', 'manager', 'admin', 'admin_staff'].includes(role))
    return 'workspace_hq'
  if (['regional_manager', 'bond_regional_manager'].includes(role)) return 'region'
  if (['branch_manager', 'bond_branch_manager'].includes(role)) return 'branch'
  if (['team_lead', 'bond_team_lead'].includes(role)) return 'team'
  return 'assigned'
}

function bondApplicationScopeMatchesMembership(application = {}, memberships = [], userId = '') {
  const applicationOrganisationId = normalizeTextValue(application?.assigned_organisation_id)
  const assignedUserId = normalizeTextValue(application?.assigned_user_id)
  const actorUserId = normalizeTextValue(userId)
  if (actorUserId && assignedUserId && actorUserId === assignedUserId) return true

  const matchingMemberships = (Array.isArray(memberships) ? memberships : []).filter((membership) => {
    const membershipOrganisationId = normalizeTextValue(membership?.organisation_id || membership?.organisationId)
    return (
      applicationOrganisationId && membershipOrganisationId && applicationOrganisationId === membershipOrganisationId
    )
  })
  if (!matchingMemberships.length) return false

  const applicationRegionId = normalizeTextValue(application?.assigned_region_id)
  const applicationUnitIds = [
    application?.assigned_workspace_unit_id,
    application?.assigned_branch_id,
    application?.assigned_team_id,
  ]
    .map((value) => normalizeTextValue(value))
    .filter(Boolean)

  return matchingMemberships.some((membership) => {
    const scopeLevel = normalizeBondMembershipScopeLevel(membership)
    if (scopeLevel === 'workspace_hq') return true

    if (scopeLevel === 'region') {
      const membershipRegionId = normalizeTextValue(membership?.region_id || membership?.regionId)
      return Boolean(applicationRegionId && membershipRegionId && applicationRegionId === membershipRegionId)
    }

    if (scopeLevel === 'branch' || scopeLevel === 'team') {
      const membershipUnitIds = [
        membership?.workspace_unit_id,
        membership?.workspaceUnitId,
        membership?.branch_id,
        membership?.branchId,
        membership?.primary_branch_id,
        membership?.primaryBranchId,
        membership?.team_id,
        membership?.teamId,
      ]
        .map((value) => normalizeTextValue(value))
        .filter(Boolean)
      return applicationUnitIds.some((unitId) => membershipUnitIds.includes(unitId))
    }

    return false
  })
}

async function fetchInheritedDevelopmentTransactionIdsForUser(
  client,
  { userId = null, participantEmail = '', roleType = null } = {},
) {
  const developmentParticipants = await resolveDevelopmentParticipantsByIdentity(client, {
    userId,
    participantEmail,
    roleType,
  })
  const developmentIds = [...new Set(developmentParticipants.map((row) => row.developmentId).filter(Boolean))]
  if (!developmentIds.length) {
    return new Set()
  }

  let query = await client
    .from('transactions')
    .select('id, development_id, is_active')
    .in('development_id', developmentIds)

  if (query.error && isMissingColumnError(query.error, 'is_active')) {
    query = await client.from('transactions').select('id, development_id').in('development_id', developmentIds)
  }

  if (query.error && isMissingColumnError(query.error, 'development_id')) {
    return new Set()
  }

  if (query.error && !isMissingSchemaError(query.error)) {
    throw query.error
  }

  const ids = new Set()
  for (const row of query.data || []) {
    if (row?.is_active === false) {
      continue
    }
    if (row?.id) {
      ids.add(row.id)
    }
  }

  return ids
}

const BOND_HQ_WORKSPACE_ROLES = new Set(['owner', 'director', 'hq_manager'])

function isBondHqOrganisationMembership(row = {}) {
  const workspaceRole = normalizeTextValue(
    row.workspace_role || row.workspaceRole || row.organisation_role || row.organisationRole,
  ).toLowerCase()
  const scopeLevel = normalizeTextValue(row.scope_level || row.scopeLevel).toLowerCase()
  const status = normalizeTextValue(row.status || '').toLowerCase()
  return status !== 'deactivated' && (BOND_HQ_WORKSPACE_ROLES.has(workspaceRole) || scopeLevel === 'workspace_hq')
}

async function resolveBondHqOrganisationMembership(client, { userId = '', email = '', organisationId = '' } = {}) {
  const normalizedOrganisationId = normalizeTextValue(organisationId)
  if (!normalizedOrganisationId || (!userId && !email)) return null

  const selectClause = 'id, user_id, email, organisation_id, workspace_role, organisation_role, scope_level, status'
  const candidates = []

  const [byUser, byEmail] = await Promise.all([
    userId
      ? client
          .from('organisation_users')
          .select(selectClause)
          .eq('organisation_id', normalizedOrganisationId)
          .eq('user_id', userId)
          .limit(3)
      : Promise.resolve({ data: [], error: null }),
    email
      ? client
          .from('organisation_users')
          .select(selectClause)
          .eq('organisation_id', normalizedOrganisationId)
          .ilike('email', email)
          .limit(3)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (byUser.error && !isMissingSchemaError(byUser.error)) throw byUser.error
  if (byEmail.error && !isMissingSchemaError(byEmail.error)) throw byEmail.error
  candidates.push(...(byUser.data || []), ...(byEmail.data || []))

  return candidates.find(isBondHqOrganisationMembership) || null
}

async function fetchActiveTransactionIdsForOrganisation(client, organisationId = '') {
  const normalizedOrganisationId = normalizeTextValue(organisationId)
  if (!normalizedOrganisationId) return []

  let query = await client
    .from('transactions')
    .select('id, organisation_id, is_active')
    .eq('organisation_id', normalizedOrganisationId)

  if (query.error && isMissingColumnError(query.error, 'is_active')) {
    query = await client
      .from('transactions')
      .select('id, organisation_id')
      .eq('organisation_id', normalizedOrganisationId)
  }

  if (query.error) {
    if (isMissingSchemaError(query.error) || isMissingColumnError(query.error, 'organisation_id')) return []
    throw query.error
  }

  return (query.data || []).filter((row) => row?.id && row?.is_active !== false).map((row) => row.id)
}

export async function getAccessibleTransactionIdsForUser({ userId, roleType = null, organisationId = '' } = {}) {
  const client = requireClient()
  if (!userId) {
    return []
  }

  const normalizedRole = roleType ? normalizeRoleType(roleType) : null
  const normalizedOrganisationId = String(organisationId || '').trim()
  const [identity, actorProfile] = await Promise.all([
    resolveProfileIdentityByUserId(client, userId),
    resolveActiveProfileContext(client),
  ])
  if (normalizeRoleType(actorProfile.role) === 'internal_admin') {
    let allTransactionsBuilder = client.from('transactions').select('id, organisation_id, is_active')
    if (normalizedOrganisationId) {
      allTransactionsBuilder = allTransactionsBuilder.eq('organisation_id', normalizedOrganisationId)
    }
    let allTransactionsQuery = await allTransactionsBuilder
    if (allTransactionsQuery.error && isMissingColumnError(allTransactionsQuery.error, 'is_active')) {
      let fallbackBuilder = client.from('transactions').select('id, organisation_id')
      if (normalizedOrganisationId) {
        fallbackBuilder = fallbackBuilder.eq('organisation_id', normalizedOrganisationId)
      }
      allTransactionsQuery = await fallbackBuilder
    }
    if (
      allTransactionsQuery.error &&
      normalizedOrganisationId &&
      isMissingColumnError(allTransactionsQuery.error, 'organisation_id')
    ) {
      return []
    }
    if (allTransactionsQuery.error) {
      if (isMissingSchemaError(allTransactionsQuery.error)) {
        return []
      }
      throw allTransactionsQuery.error
    }
    return (allTransactionsQuery.data || [])
      .filter((row) => row?.id && row?.is_active !== false)
      .filter(
        (row) => !normalizedOrganisationId || String(row?.organisation_id || '').trim() === normalizedOrganisationId,
      )
      .map((row) => row.id)
  }

  if (normalizedRole === 'bond_originator' && normalizedOrganisationId) {
    const hqMembership = await resolveBondHqOrganisationMembership(client, {
      userId: identity.userId,
      email: identity.email,
      organisationId: normalizedOrganisationId,
    })
    if (hqMembership) {
      return fetchActiveTransactionIdsForOrganisation(client, normalizedOrganisationId)
    }
  }

  const directIds = await fetchDirectTransactionIdsForUser(client, {
    userId: identity.userId,
    participantEmail: identity.email,
    participantName: identity.fullName,
    roleType,
    organisationId: normalizedOrganisationId,
  })
  if (normalizedRole === 'agent') {
    return [...directIds]
  }

  const inheritedIds = await fetchInheritedDevelopmentTransactionIdsForUser(client, {
    userId: identity.userId,
    participantEmail: identity.email,
    roleType,
  })
  const candidateIds = [...new Set([...directIds, ...inheritedIds])]
  if (!candidateIds.length) {
    return []
  }

  let rowsQuery = await client
    .from('transactions')
    .select('id, owner_user_id, access_level, is_active')
    .in('id', candidateIds)
  if (
    rowsQuery.error &&
    (isMissingColumnError(rowsQuery.error, 'owner_user_id') || isMissingColumnError(rowsQuery.error, 'access_level'))
  ) {
    rowsQuery = await client.from('transactions').select('id, is_active').in('id', candidateIds)
  }

  if (rowsQuery.error) {
    if (isMissingSchemaError(rowsQuery.error)) {
      return candidateIds
    }
    throw rowsQuery.error
  }

  const filtered = []
  for (const row of rowsQuery.data || []) {
    if (!row?.id || row?.is_active === false) {
      continue
    }
    if (directIds.has(row.id)) {
      filtered.push(row.id)
      continue
    }

    if (row.owner_user_id && row.owner_user_id === identity.userId) {
      filtered.push(row.id)
      continue
    }

    // Attorneys assigned at development level inherit access to all
    // transactions in that development, regardless of collaboration mode.
    if (normalizedRole === 'attorney' && inheritedIds.has(row.id)) {
      filtered.push(row.id)
      continue
    }

    const accessLevel = normalizeTransactionAccessLevel(row.access_level, 'shared')
    if (accessLevel === 'shared' && inheritedIds.has(row.id)) {
      filtered.push(row.id)
    }
  }

  return [...new Set(filtered)]
}

export async function canUserAccessTransaction({ userId, transactionId, roleType = null } = {}) {
  if (!userId || !transactionId) {
    return false
  }

  const normalizedTransactionId = String(transactionId)
  const matchesTransactionId = (candidateId) => String(candidateId) === normalizedTransactionId

  const client = requireClient()

  let transactionQuery = await client
    .from('transactions')
    .select('id, development_id, owner_user_id, access_level, is_active')
    .eq('id', transactionId)
    .maybeSingle()

  if (
    transactionQuery.error &&
    (isMissingColumnError(transactionQuery.error, 'owner_user_id') ||
      isMissingColumnError(transactionQuery.error, 'access_level'))
  ) {
    transactionQuery = await client
      .from('transactions')
      .select('id, development_id, is_active')
      .eq('id', transactionId)
      .maybeSingle()
  }

  if (transactionQuery.error) {
    if (isMissingSchemaError(transactionQuery.error)) {
      const accessibleIds = await getAccessibleTransactionIdsForUser({
        userId,
        roleType,
      })
      return accessibleIds.some(matchesTransactionId)
    }
    throw transactionQuery.error
  }

  const transaction = transactionQuery.data
  if (!transaction || transaction?.is_active === false) {
    return false
  }

  // Keep detail-access decisions aligned with list-access decisions to prevent
  // "visible in list but not openable" split behavior across modules/users.
  const accessibleIds = await getAccessibleTransactionIdsForUser({
    userId,
    roleType,
  })
  return accessibleIds.some(matchesTransactionId)
}

async function fetchTransactionAccessControlRow(client, transactionId) {
  let transactionQuery = await client
    .from('transactions')
    .select('id, development_id, owner_user_id, access_level, is_active')
    .eq('id', transactionId)
    .maybeSingle()

  if (
    transactionQuery.error &&
    (isMissingColumnError(transactionQuery.error, 'owner_user_id') ||
      isMissingColumnError(transactionQuery.error, 'access_level'))
  ) {
    transactionQuery = await client
      .from('transactions')
      .select('id, development_id, is_active')
      .eq('id', transactionId)
      .maybeSingle()
  }

  if (transactionQuery.error) {
    if (isMissingSchemaError(transactionQuery.error)) {
      return null
    }
    throw transactionQuery.error
  }

  return transactionQuery.data || null
}

function canManageTransactionStakeholders({ actorRole = null, actorFirmRole = null, isOwner = false }) {
  const normalizedActorRole = normalizeRoleType(actorRole)
  const normalizedFirmRole = normalizeFirmRole(actorFirmRole, 'attorney')
  if (isOwner) {
    return true
  }
  if (normalizedActorRole === 'internal_admin' || normalizedActorRole === 'developer') {
    return true
  }
  if (normalizedFirmRole === 'firm_admin' || normalizedFirmRole === 'lead_attorney') {
    return true
  }
  return false
}

export function validateLegalRoles(participants = []) {
  const activeParticipants = (participants || []).filter(
    (item) => normalizeStakeholderStatus(item?.stakeholderStatus || item?.status, 'draft') !== 'removed',
  )
  const attorneyParticipants = activeParticipants.filter(
    (item) => normalizeRoleType(item?.roleType || item?.role_type) === 'attorney',
  )
  const counts = {
    transfer: 0,
    bond: 0,
    cancellation: 0,
  }

  for (const participant of attorneyParticipants) {
    const legalRole = normalizeAttorneyLegalRole(participant?.legalRole || participant?.legal_role, 'transfer')
    if (legalRole !== 'none') {
      counts[legalRole] += 1
    }
  }

  const errors = []
  if (counts.transfer !== 1) {
    errors.push('Exactly one Transfer Attorney is required.')
  }
  if (counts.bond > 1) {
    errors.push('Only one Bond Attorney is allowed.')
  }
  if (counts.cancellation > 1) {
    errors.push('Only one Cancellation Attorney is allowed.')
  }

  return {
    valid: errors.length === 0,
    errors,
    counts,
  }
}

export async function getLegalRoleAssignments(transactionId) {
  const client = requireClient()
  if (!transactionId) {
    return {
      transfer: null,
      bond: null,
      cancellation: null,
      participants: [],
      validation: validateLegalRoles([]),
    }
  }

  let query = await client
    .from('transaction_participants')
    .select(
      'id, transaction_id, user_id, role_type, legal_role, status, firm_id, participant_name, participant_email, visibility_scope, invited_at, accepted_at, removed_at, created_at, updated_at',
    )
    .eq('transaction_id', transactionId)
    .eq('role_type', 'attorney')

  if (
    query.error &&
    (isMissingColumnError(query.error, 'legal_role') ||
      isMissingColumnError(query.error, 'status') ||
      isMissingColumnError(query.error, 'firm_id') ||
      isMissingColumnError(query.error, 'visibility_scope') ||
      isMissingColumnError(query.error, 'invited_at') ||
      isMissingColumnError(query.error, 'accepted_at') ||
      isMissingColumnError(query.error, 'removed_at'))
  ) {
    query = await client
      .from('transaction_participants')
      .select('id, transaction_id, user_id, role_type, participant_name, participant_email, created_at, updated_at')
      .eq('transaction_id', transactionId)
      .eq('role_type', 'attorney')
  }

  if (query.error) {
    if (isMissingTableError(query.error, 'transaction_participants') || isMissingSchemaError(query.error)) {
      return {
        transfer: null,
        bond: null,
        cancellation: null,
        participants: [],
        validation: validateLegalRoles([]),
      }
    }
    throw query.error
  }

  const participants = (query.data || []).map((row) => normalizeTransactionParticipantRow(row))
  const activeParticipants = participants.filter(
    (item) => normalizeStakeholderStatus(item.stakeholderStatus, 'active') !== 'removed',
  )
  const transfer = activeParticipants.find((item) => item.legalRole === 'transfer') || null
  const bond = activeParticipants.find((item) => item.legalRole === 'bond') || null
  const cancellation = activeParticipants.find((item) => item.legalRole === 'cancellation') || null
  return {
    transfer,
    bond,
    cancellation,
    participants: activeParticipants,
    validation: validateLegalRoles(activeParticipants),
  }
}

export async function getTransactionOwner(transactionId) {
  const client = requireClient()
  if (!transactionId) {
    return null
  }

  const row = await fetchTransactionAccessControlRow(client, transactionId)
  if (!row) {
    return null
  }

  return {
    transactionId: row.id,
    ownerUserId: row.owner_user_id || null,
    accessLevel: normalizeTransactionAccessLevel(row.access_level, 'shared'),
  }
}

export async function updateTransactionAccessControl({ transactionId, ownerUserId = null, accessLevel = null } = {}) {
  const client = requireClient()
  if (!transactionId) {
    throw new Error('Transaction is required.')
  }

  const actorProfile = await resolveActiveProfileContext(client)
  const transaction = await fetchTransactionAccessControlRow(client, transactionId)
  if (!transaction) {
    throw new Error('Transaction not found.')
  }

  const isOwner = Boolean(
    transaction.owner_user_id && actorProfile.userId && transaction.owner_user_id === actorProfile.userId,
  )
  if (
    !canManageTransactionStakeholders({
      actorRole: actorProfile.role,
      actorFirmRole: actorProfile.firmRole,
      isOwner,
    })
  ) {
    throw new Error('You do not have permission to manage transaction ownership or access level.')
  }

  const payload = {}
  if (ownerUserId !== undefined) {
    payload.owner_user_id = ownerUserId || null
  }
  if (accessLevel !== undefined && accessLevel !== null) {
    payload.access_level = normalizeTransactionAccessLevel(accessLevel, 'shared')
  }
  if (!Object.keys(payload).length) {
    return fetchTransactionById(transactionId)
  }
  payload.updated_at = new Date().toISOString()

  const updateQuery = await client.from('transactions').update(payload).eq('id', transactionId)
  if (updateQuery.error) {
    if (
      isMissingColumnError(updateQuery.error, 'owner_user_id') ||
      isMissingColumnError(updateQuery.error, 'access_level')
    ) {
      throw new Error('Ownership/access columns are not set up yet. Run sql/schema.sql and refresh.')
    }
    throw updateQuery.error
  }

  await logTransactionEventIfPossible(client, {
    transactionId,
    eventType: 'TransactionUpdated',
    createdBy: actorProfile.userId || null,
    createdByRole: actorProfile.role || null,
    eventData: {
      source: 'access_control',
      ownerUserId: payload.owner_user_id ?? transaction.owner_user_id ?? null,
      accessLevel: payload.access_level ?? transaction.access_level ?? 'shared',
    },
  })

  return fetchTransactionById(transactionId)
}

export async function addStakeholder({
  transactionId,
  roleType,
  legalRole = null,
  userId = null,
  participantName = '',
  participantEmail = '',
  firmId = null,
  visibilityScope = null,
  status = 'active',
} = {}) {
  const client = requireClient()
  if (!transactionId) {
    throw new Error('Transaction is required.')
  }

  const participantShape = resolveTransactionParticipantShape({
    role_type: roleType,
    legal_role: legalRole,
  })
  const normalizedRoleType = normalizeRoleType(participantShape.roleType)
  const normalizedLegalRole =
    normalizedRoleType === 'attorney' ? normalizeAttorneyLegalRole(participantShape.legalRole, 'transfer') : 'none'
  const normalizedTransactionRole = participantShape.transactionRole
  const actorProfile = await resolveActiveProfileContext(client)
  const transaction = await fetchTransactionAccessControlRow(client, transactionId)
  if (!transaction) {
    throw new Error('Transaction not found.')
  }
  const isOwner = Boolean(
    transaction.owner_user_id && actorProfile.userId && transaction.owner_user_id === actorProfile.userId,
  )
  if (
    !canManageTransactionStakeholders({
      actorRole: actorProfile.role,
      actorFirmRole: actorProfile.firmRole,
      isOwner,
    })
  ) {
    throw new Error('You do not have permission to add stakeholders to this transaction.')
  }

  const normalizedEmail = normalizeEmailAddress(participantEmail) || null
  const profileIdByEmail = normalizedEmail ? await resolveProfileIdsByEmail(client, [normalizedEmail]) : {}
  const resolvedUserId = userId || (normalizedEmail ? profileIdByEmail[normalizedEmail] || null : null)
  const normalizedStatus = normalizeStakeholderStatus(status, resolvedUserId || normalizedEmail ? 'active' : 'draft')
  const normalizedVisibility = normalizeDocumentVisibilityScope(
    visibilityScope,
    isInternalStakeholderRole(normalizedRoleType) ? 'internal' : 'shared',
  )
  if (normalizedRoleType === 'attorney') {
    const assignments = await getLegalRoleAssignments(transactionId)
    const prospectiveParticipants = [
      ...(assignments.participants || []).filter((participant) => participant.legalRole !== normalizedLegalRole),
      {
        roleType: 'attorney',
        legalRole: normalizedLegalRole,
        stakeholderStatus: normalizedStatus,
      },
    ]
    const validation = validateLegalRoles(prospectiveParticipants)
    if (!validation.valid) {
      throw new Error(validation.errors.join(' • '))
    }
  }
  const now = new Date().toISOString()
  const payload = {
    transaction_id: transactionId,
    role_type: normalizedRoleType,
    legal_role: normalizedLegalRole,
    transaction_role: normalizedTransactionRole,
    status: normalizedStatus,
    user_id: resolvedUserId,
    participant_name: normalizeNullableText(participantName),
    participant_email: normalizedEmail,
    firm_id: firmId || null,
    invited_by_user_id: actorProfile.userId || null,
    invited_at: now,
    accepted_at: normalizedStatus === 'active' ? now : null,
    removed_at: null,
    visibility_scope: normalizedVisibility,
    is_internal: isInternalStakeholderRole(normalizedRoleType),
    participant_scope: 'transaction',
    assignment_source: 'transaction_direct',
    ...buildStakeholderPermissionPayload(normalizedRoleType, 'bond_originator'),
  }

  let upsertQuery = await upsertTransactionParticipantsRowsWithFallback(client, {
    rows: [payload],
    onConflict: 'transaction_id,role_type,legal_role',
    rowSelect:
      'id, transaction_id, user_id, role_type, legal_role, transaction_role, status, firm_id, invited_by_user_id, invitation_token, invitation_expires_at, invited_at, accepted_at, removed_at, visibility_scope, is_internal, participant_name, participant_email, can_view, can_comment, can_upload_documents, can_edit_finance_workflow, can_edit_attorney_workflow, can_edit_core_transaction, created_at, updated_at',
    matchOnLegalRole: true,
  })

  if (!upsertQuery.error && Array.isArray(upsertQuery.data)) {
    upsertQuery = {
      data: upsertQuery.data[0] || null,
      error: null,
    }
  }

  if (
    upsertQuery.error &&
    (isMissingColumnError(upsertQuery.error, 'legal_role') ||
      isMissingColumnError(upsertQuery.error, 'transaction_role') ||
      isMissingColumnError(upsertQuery.error, 'status') ||
      isMissingColumnError(upsertQuery.error, 'firm_id') ||
      isMissingColumnError(upsertQuery.error, 'invited_by_user_id') ||
      isMissingColumnError(upsertQuery.error, 'invitation_token') ||
      isMissingColumnError(upsertQuery.error, 'invitation_expires_at') ||
      isMissingColumnError(upsertQuery.error, 'invited_at') ||
      isMissingColumnError(upsertQuery.error, 'accepted_at') ||
      isMissingColumnError(upsertQuery.error, 'removed_at') ||
      isMissingColumnError(upsertQuery.error, 'visibility_scope') ||
      isMissingColumnError(upsertQuery.error, 'is_internal') ||
      isMissingColumnError(upsertQuery.error, 'participant_scope') ||
      isMissingColumnError(upsertQuery.error, 'assignment_source') ||
      isMissingColumnError(upsertQuery.error, 'can_edit_core_transaction'))
  ) {
    const missingLegalRoleColumn = isMissingColumnError(upsertQuery.error, 'legal_role')
    const missingTransactionRoleColumn = isMissingColumnError(upsertQuery.error, 'transaction_role')
    const missingStatusColumn = isMissingColumnError(upsertQuery.error, 'status')
    const missingFirmIdColumn = isMissingColumnError(upsertQuery.error, 'firm_id')
    const missingInvitedByUserIdColumn = isMissingColumnError(upsertQuery.error, 'invited_by_user_id')
    const missingInvitationTokenColumn = isMissingColumnError(upsertQuery.error, 'invitation_token')
    const missingInvitationExpiresAtColumn = isMissingColumnError(upsertQuery.error, 'invitation_expires_at')
    const missingInvitedAtColumn = isMissingColumnError(upsertQuery.error, 'invited_at')
    const missingAcceptedAtColumn = isMissingColumnError(upsertQuery.error, 'accepted_at')
    const missingRemovedAtColumn = isMissingColumnError(upsertQuery.error, 'removed_at')
    const missingVisibilityScopeColumn = isMissingColumnError(upsertQuery.error, 'visibility_scope')
    const missingIsInternalColumn = isMissingColumnError(upsertQuery.error, 'is_internal')
    const missingParticipantScopeColumn = isMissingColumnError(upsertQuery.error, 'participant_scope')
    const missingAssignmentSourceColumn = isMissingColumnError(upsertQuery.error, 'assignment_source')
    const missingCanEditCoreTransactionColumn = isMissingColumnError(upsertQuery.error, 'can_edit_core_transaction')
    const legacyPayload = { ...payload }
    if (missingLegalRoleColumn) {
      delete legacyPayload.legal_role
    }
    if (missingTransactionRoleColumn) {
      delete legacyPayload.transaction_role
    }
    if (missingStatusColumn) {
      delete legacyPayload.status
    }
    if (missingFirmIdColumn) {
      delete legacyPayload.firm_id
    }
    if (missingInvitedByUserIdColumn) {
      delete legacyPayload.invited_by_user_id
    }
    if (missingInvitationTokenColumn) {
      delete legacyPayload.invitation_token
    }
    if (missingInvitationExpiresAtColumn) {
      delete legacyPayload.invitation_expires_at
    }
    if (missingInvitedAtColumn) {
      delete legacyPayload.invited_at
    }
    if (missingAcceptedAtColumn) {
      delete legacyPayload.accepted_at
    }
    if (missingRemovedAtColumn) {
      delete legacyPayload.removed_at
    }
    if (missingVisibilityScopeColumn) {
      delete legacyPayload.visibility_scope
    }
    if (missingIsInternalColumn) {
      delete legacyPayload.is_internal
    }
    if (missingParticipantScopeColumn) {
      delete legacyPayload.participant_scope
    }
    if (missingAssignmentSourceColumn) {
      delete legacyPayload.assignment_source
    }
    if (missingCanEditCoreTransactionColumn) {
      delete legacyPayload.can_edit_core_transaction
    }

    const legacyRowSelect = missingLegalRoleColumn
      ? missingCanEditCoreTransactionColumn
        ? 'id, transaction_id, user_id, role_type, participant_name, participant_email, can_view, can_comment, can_upload_documents, can_edit_finance_workflow, can_edit_attorney_workflow, created_at, updated_at'
        : 'id, transaction_id, user_id, role_type, participant_name, participant_email, can_view, can_comment, can_upload_documents, can_edit_finance_workflow, can_edit_attorney_workflow, can_edit_core_transaction, created_at, updated_at'
      : missingCanEditCoreTransactionColumn
        ? 'id, transaction_id, user_id, role_type, legal_role, participant_name, participant_email, can_view, can_comment, can_upload_documents, can_edit_finance_workflow, can_edit_attorney_workflow, created_at, updated_at'
        : 'id, transaction_id, user_id, role_type, legal_role, participant_name, participant_email, can_view, can_comment, can_upload_documents, can_edit_finance_workflow, can_edit_attorney_workflow, can_edit_core_transaction, created_at, updated_at'

    upsertQuery = await upsertTransactionParticipantsRowsWithFallback(client, {
      rows: [legacyPayload],
      onConflict: missingLegalRoleColumn ? 'transaction_id,role_type' : 'transaction_id,role_type,legal_role',
      rowSelect: legacyRowSelect,
      matchOnLegalRole: !missingLegalRoleColumn,
    })

    if (!upsertQuery.error && Array.isArray(upsertQuery.data)) {
      upsertQuery = {
        data: upsertQuery.data[0] || null,
        error: null,
      }
    }
  }

  if (upsertQuery.error) {
    if (isMissingTableError(upsertQuery.error, 'transaction_participants') || isMissingSchemaError(upsertQuery.error)) {
      throw new Error('Stakeholder table is not set up yet. Run sql/schema.sql and refresh.')
    }
    throw upsertQuery.error
  }

  const participant = normalizeTransactionParticipantRow(upsertQuery.data)

  await logTransactionEventIfPossible(client, {
    transactionId,
    eventType: 'ParticipantAssigned',
    createdBy: actorProfile.userId || null,
    createdByRole: actorProfile.role || null,
    eventData: {
      source: 'stakeholder_add',
      participantId: participant.id,
      roleType: participant.roleType,
      legalRole: participant.legalRole,
      status: participant.stakeholderStatus,
    },
  })

  await recordUniversalRolePlayerAssignmentEvent(client, {
    transactionId,
    roleType: participant.roleType,
    assignedUserId: participant.userId || null,
    sourceModule: 'transaction',
    sourceEvent: 'add_stakeholder',
    assignmentSource: 'transaction_direct',
    selectionSource: 'transaction_direct',
    actorUserId: actorProfile.userId || null,
    assignmentStatus: participant.stakeholderStatus || 'active',
    metadata: {
      legalRole: participant.legalRole,
      participantEmail: participant.participantEmail,
      visibilityScope: participant.visibilityScope,
    },
  })

  return participant
}

export async function inviteStakeholder({
  transactionId,
  roleType,
  legalRole = null,
  email,
  participantName = '',
  firmId = null,
  expiresDays = 14,
} = {}) {
  const normalizedEmail = normalizeEmailAddress(email)
  if (!normalizedEmail) {
    throw new Error('Recipient email is required.')
  }

  const invitationToken = `stake_${crypto.randomUUID().replaceAll('-', '')}`
  const expiresAt =
    Number(expiresDays) > 0 ? new Date(Date.now() + Number(expiresDays) * 24 * 60 * 60 * 1000).toISOString() : null

  const participant = await addStakeholder({
    transactionId,
    roleType,
    legalRole,
    participantEmail: normalizedEmail,
    participantName,
    firmId,
    status: 'invited',
    visibilityScope: isInternalStakeholderRole(roleType) ? 'internal' : 'shared',
  })

  const client = requireClient()
  const invitationUpdatePayload = {
    invitation_token: invitationToken,
    invitation_expires_at: expiresAt,
    invited_at: new Date().toISOString(),
    accepted_at: null,
    transaction_role: resolveTransactionParticipantShape({
      role_type: roleType,
      legal_role: legalRole,
    }).transactionRole,
    status: 'invited',
  }

  let updateQuery = await client
    .from('transaction_participants')
    .update(invitationUpdatePayload)
    .eq('id', participant.id)
    .select(
      'id, transaction_id, user_id, role_type, legal_role, transaction_role, status, firm_id, invited_by_user_id, invitation_token, invitation_expires_at, invited_at, accepted_at, removed_at, visibility_scope, is_internal, participant_name, participant_email, can_view, can_comment, can_upload_documents, can_edit_finance_workflow, can_edit_attorney_workflow, can_edit_core_transaction, created_at, updated_at',
    )
    .maybeSingle()

  if (
    updateQuery.error &&
    (isMissingColumnError(updateQuery.error, 'legal_role') ||
      isMissingColumnError(updateQuery.error, 'transaction_role') ||
      isMissingColumnError(updateQuery.error, 'status') ||
      isMissingColumnError(updateQuery.error, 'firm_id') ||
      isMissingColumnError(updateQuery.error, 'invited_by_user_id') ||
      isMissingColumnError(updateQuery.error, 'invited_at') ||
      isMissingColumnError(updateQuery.error, 'accepted_at') ||
      isMissingColumnError(updateQuery.error, 'removed_at') ||
      isMissingColumnError(updateQuery.error, 'visibility_scope') ||
      isMissingColumnError(updateQuery.error, 'is_internal') ||
      isMissingColumnError(updateQuery.error, 'can_edit_core_transaction'))
  ) {
    const legacyUpdatePayload = { ...invitationUpdatePayload }
    delete legacyUpdatePayload.status
    delete legacyUpdatePayload.accepted_at
    delete legacyUpdatePayload.invited_at
    if (isMissingColumnError(updateQuery.error, 'transaction_role')) delete legacyUpdatePayload.transaction_role

    updateQuery = await client
      .from('transaction_participants')
      .update(legacyUpdatePayload)
      .eq('id', participant.id)
      .select(
        'id, transaction_id, user_id, role_type, participant_name, participant_email, invitation_token, invitation_expires_at, can_view, can_comment, can_upload_documents, can_edit_finance_workflow, can_edit_attorney_workflow, created_at, updated_at',
      )
      .maybeSingle()
  }

  if (updateQuery.error) {
    if (isMissingColumnError(updateQuery.error, 'invitation_token')) {
      return {
        participant,
        invitationToken: null,
        invitationUrl: null,
      }
    }
    throw updateQuery.error
  }

  try {
    await client.rpc('bridge_create_invite', {
      payload: {
        invite_type: 'transaction_invite',
        token: invitationToken,
        expires_at: expiresAt,
        target_transaction_id: transactionId,
        target_transaction_role: normalizeRoleType(roleType),
        email: normalizedEmail,
        metadata: {
          legacy_source: 'transaction_participants',
          legacy_participant_id: participant.id,
          legal_role: legalRole,
          firm_id: firmId,
        },
      },
    })
  } catch (canonicalInviteError) {
    console.warn('[INVITES] canonical transaction invite mirror failed', canonicalInviteError)
  }

  return {
    participant: normalizeTransactionParticipantRow(updateQuery.data || participant),
    invitationToken,
    invitationUrl: `/invite/${invitationToken}`,
    expiresAt,
  }
}

export async function acceptStakeholderInvite({ invitationToken } = {}) {
  const client = requireClient()
  const normalizedToken = String(invitationToken || '').trim()
  if (!normalizedToken) {
    throw new Error('Invitation token is required.')
  }

  try {
    const canonicalResult = await client.rpc('bridge_accept_invite', {
      p_token: normalizedToken,
    })
    if (!canonicalResult.error && canonicalResult.data?.success) {
      return {
        transactionId: canonicalResult.data.transaction_id || null,
        participantId: canonicalResult.data.participant_id || null,
        roleType: 'stakeholder',
        roleLabel: 'Stakeholder',
        canonicalInvite: canonicalResult.data,
      }
    }
    if (canonicalResult.error && !isMissingSchemaError(canonicalResult.error)) {
      throw canonicalResult.error
    }
    if (canonicalResult.data?.code && !['invite_not_found', 'missing_token'].includes(canonicalResult.data.code)) {
      throw new Error(canonicalResult.data.message || canonicalResult.data.code)
    }
  } catch (canonicalAcceptError) {
    if (
      !String(canonicalAcceptError?.message || '')
        .toLowerCase()
        .includes('invite_not_found')
    ) {
      throw canonicalAcceptError
    }
  }

  const actorProfile = await resolveActiveProfileContext(client)
  const sessionResult = await client.auth.getSession()
  const signedInEmail = normalizeEmailAddress(sessionResult?.data?.session?.user?.email || '')
  let lookupQuery = await client
    .from('transaction_participants')
    .select(
      'id, transaction_id, user_id, role_type, legal_role, transaction_role, status, firm_id, invited_by_user_id, invitation_token, invitation_expires_at, invited_at, accepted_at, removed_at, visibility_scope, is_internal, participant_name, participant_email, can_view, can_comment, can_upload_documents, can_edit_finance_workflow, can_edit_attorney_workflow, can_edit_core_transaction, created_at, updated_at',
    )
    .eq('invitation_token', normalizedToken)
    .maybeSingle()

  if (
    lookupQuery.error &&
    (isMissingColumnError(lookupQuery.error, 'legal_role') ||
      isMissingColumnError(lookupQuery.error, 'transaction_role') ||
      isMissingColumnError(lookupQuery.error, 'status') ||
      isMissingColumnError(lookupQuery.error, 'firm_id') ||
      isMissingColumnError(lookupQuery.error, 'invited_by_user_id') ||
      isMissingColumnError(lookupQuery.error, 'invited_at') ||
      isMissingColumnError(lookupQuery.error, 'accepted_at') ||
      isMissingColumnError(lookupQuery.error, 'removed_at') ||
      isMissingColumnError(lookupQuery.error, 'visibility_scope') ||
      isMissingColumnError(lookupQuery.error, 'is_internal') ||
      isMissingColumnError(lookupQuery.error, 'can_edit_core_transaction'))
  ) {
    lookupQuery = await client
      .from('transaction_participants')
      .select(
        'id, transaction_id, user_id, role_type, participant_name, participant_email, invitation_token, invitation_expires_at, can_view, can_comment, can_upload_documents, can_edit_finance_workflow, can_edit_attorney_workflow, created_at, updated_at',
      )
      .eq('invitation_token', normalizedToken)
      .maybeSingle()
  }

  if (lookupQuery.error && isMissingColumnError(lookupQuery.error, 'invitation_token')) {
    throw new Error('Stakeholder invitations are not set up yet. Run sql/schema.sql and refresh.')
  }
  if (lookupQuery.error) {
    if (isMissingTableError(lookupQuery.error, 'transaction_participants') || isMissingSchemaError(lookupQuery.error)) {
      throw new Error('Stakeholder invitations are not set up yet. Run sql/schema.sql and refresh.')
    }
    throw lookupQuery.error
  }

  const participant = lookupQuery.data
  if (!participant) {
    throw new Error('Invitation not found.')
  }
  if (participant.removed_at) {
    throw new Error('This invitation is no longer active.')
  }
  if (participant.invitation_expires_at && new Date(participant.invitation_expires_at).getTime() < Date.now()) {
    throw new Error('This invitation has expired.')
  }
  const invitedEmail = normalizeEmailAddress(participant.participant_email || '')
  if (invitedEmail && signedInEmail && invitedEmail !== signedInEmail) {
    throw new Error(`Sign in as ${invitedEmail} to accept this invitation.`)
  }

  const now = new Date().toISOString()
  const updatePayload = {
    status: 'active',
    accepted_at: now,
    invitation_token: null,
    invitation_expires_at: null,
    user_id: participant.user_id || actorProfile.userId || null,
    updated_at: now,
  }

  let updateQuery = await client
    .from('transaction_participants')
    .update(updatePayload)
    .eq('id', participant.id)
    .select(
      'id, transaction_id, user_id, role_type, legal_role, transaction_role, status, firm_id, invited_by_user_id, invitation_token, invitation_expires_at, invited_at, accepted_at, removed_at, visibility_scope, is_internal, participant_name, participant_email, can_view, can_comment, can_upload_documents, can_edit_finance_workflow, can_edit_attorney_workflow, can_edit_core_transaction, created_at, updated_at',
    )
    .single()

  if (
    updateQuery.error &&
    (isMissingColumnError(updateQuery.error, 'legal_role') ||
      isMissingColumnError(updateQuery.error, 'transaction_role') ||
      isMissingColumnError(updateQuery.error, 'status') ||
      isMissingColumnError(updateQuery.error, 'firm_id') ||
      isMissingColumnError(updateQuery.error, 'invited_by_user_id') ||
      isMissingColumnError(updateQuery.error, 'invited_at') ||
      isMissingColumnError(updateQuery.error, 'accepted_at') ||
      isMissingColumnError(updateQuery.error, 'removed_at') ||
      isMissingColumnError(updateQuery.error, 'visibility_scope') ||
      isMissingColumnError(updateQuery.error, 'is_internal') ||
      isMissingColumnError(updateQuery.error, 'can_edit_core_transaction'))
  ) {
    const legacyUpdatePayload = { ...updatePayload }
    delete legacyUpdatePayload.status
    delete legacyUpdatePayload.accepted_at

    updateQuery = await client
      .from('transaction_participants')
      .update(legacyUpdatePayload)
      .eq('id', participant.id)
      .select(
        'id, transaction_id, user_id, role_type, participant_name, participant_email, invitation_token, invitation_expires_at, can_view, can_comment, can_upload_documents, can_edit_finance_workflow, can_edit_attorney_workflow, created_at, updated_at',
      )
      .single()
  }

  if (updateQuery.error) {
    throw updateQuery.error
  }

  await logTransactionEventIfPossible(client, {
    transactionId: participant.transaction_id,
    eventType: 'ParticipantAssigned',
    createdBy: actorProfile.userId || null,
    createdByRole: actorProfile.role || null,
    eventData: {
      source: 'stakeholder_invite_accept',
      participantId: participant.id,
    },
  })

  return normalizeTransactionParticipantRow(updateQuery.data)
}

export async function removeStakeholder({ transactionId, stakeholderId } = {}) {
  const client = requireClient()
  if (!transactionId || !stakeholderId) {
    throw new Error('Transaction and stakeholder identifiers are required.')
  }

  const actorProfile = await resolveActiveProfileContext(client)
  const transaction = await fetchTransactionAccessControlRow(client, transactionId)
  if (!transaction) {
    throw new Error('Transaction not found.')
  }
  const isOwner = Boolean(
    transaction.owner_user_id && actorProfile.userId && transaction.owner_user_id === actorProfile.userId,
  )
  if (
    !canManageTransactionStakeholders({
      actorRole: actorProfile.role,
      actorFirmRole: actorProfile.firmRole,
      isOwner,
    })
  ) {
    throw new Error('You do not have permission to remove stakeholders from this transaction.')
  }

  let existingQuery = await client
    .from('transaction_participants')
    .select('id, transaction_id, role_type, legal_role, status, removed_at, participant_name, participant_email')
    .eq('transaction_id', transactionId)
    .eq('id', stakeholderId)
    .maybeSingle()
  if (
    existingQuery.error &&
    (isMissingColumnError(existingQuery.error, 'legal_role') || isMissingColumnError(existingQuery.error, 'status'))
  ) {
    existingQuery = await client
      .from('transaction_participants')
      .select('id, transaction_id, role_type, participant_name, participant_email')
      .eq('transaction_id', transactionId)
      .eq('id', stakeholderId)
      .maybeSingle()
  }
  if (existingQuery.error) {
    if (isMissingTableError(existingQuery.error, 'transaction_participants')) {
      throw new Error('Stakeholder table is not set up yet. Run sql/schema.sql and refresh.')
    }
    throw existingQuery.error
  }
  const existing = existingQuery.data
  if (!existing) {
    return false
  }

  const existingRoleType = normalizeRoleType(existing.role_type)
  const existingLegalRole = normalizeAttorneyLegalRole(
    existing.legal_role,
    existingRoleType === 'attorney' ? 'transfer' : 'none',
  )
  const existingStatus = normalizeStakeholderStatus(existing.status, existing.removed_at ? 'removed' : 'active')
  if (existingRoleType === 'attorney' && existingLegalRole === 'transfer' && existingStatus !== 'removed') {
    const assignments = await getLegalRoleAssignments(transactionId)
    const activeTransferCount = (assignments.participants || []).filter(
      (participant) => participant.legalRole === 'transfer',
    ).length
    if (activeTransferCount <= 1) {
      throw new Error(
        'A Transfer Attorney is required. Assign another transfer attorney before removing this stakeholder.',
      )
    }
  }

  const now = new Date().toISOString()
  const removePayload = {
    status: 'removed',
    removed_at: now,
    invitation_token: null,
    invitation_expires_at: null,
    updated_at: now,
  }

  let removeQuery = await client
    .from('transaction_participants')
    .update(removePayload)
    .eq('transaction_id', transactionId)
    .eq('id', stakeholderId)
    .select('id, transaction_id, role_type, legal_role, status, removed_at, participant_name, participant_email')
    .maybeSingle()

  if (
    removeQuery.error &&
    (isMissingColumnError(removeQuery.error, 'status') ||
      isMissingColumnError(removeQuery.error, 'removed_at') ||
      isMissingColumnError(removeQuery.error, 'legal_role'))
  ) {
    removeQuery = await client
      .from('transaction_participants')
      .delete()
      .eq('transaction_id', transactionId)
      .eq('id', stakeholderId)
      .select('id, transaction_id, role_type, participant_name, participant_email')
      .maybeSingle()
  }

  if (removeQuery.error) {
    if (isMissingTableError(removeQuery.error, 'transaction_participants')) {
      throw new Error('Stakeholder table is not set up yet. Run sql/schema.sql and refresh.')
    }
    throw removeQuery.error
  }

  await logTransactionEventIfPossible(client, {
    transactionId,
    eventType: 'ParticipantRemoved',
    createdBy: actorProfile.userId || null,
    createdByRole: actorProfile.role || null,
    eventData: {
      source: 'stakeholder_remove',
      participantId: stakeholderId,
      removedRoleType: removeQuery.data?.role_type || null,
      removedLegalRole: removeQuery.data?.legal_role || null,
    },
  })

  return Boolean(removeQuery.data)
}

export async function assignTransaction({ transactionId, ownerUserId = null } = {}) {
  return updateTransactionAccessControl({
    transactionId,
    ownerUserId,
  })
}

export async function assignTask({ checklistItemId, ownerUserId = null } = {}) {
  const client = requireClient()
  if (!checklistItemId) {
    throw new Error('Checklist item is required.')
  }

  const updateQuery = await client
    .from('transaction_checklist_items')
    .update({
      owner_user_id: ownerUserId || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', checklistItemId)
    .select('id, transaction_id, owner_user_id')
    .maybeSingle()

  if (updateQuery.error) {
    if (
      isMissingColumnError(updateQuery.error, 'owner_user_id') ||
      isMissingTableError(updateQuery.error, 'transaction_checklist_items')
    ) {
      throw new Error('Checklist assignment columns are not set up yet. Run sql/schema.sql and refresh.')
    }
    throw updateQuery.error
  }

  return updateQuery.data || null
}

export async function getTransactionAccess({ transactionId, userId, roleType = null } = {}) {
  const hasAccess = await canUserAccessTransaction({
    transactionId,
    userId,
    roleType,
  })
  const owner = await getTransactionOwner(transactionId)
  return {
    transactionId,
    hasAccess,
    accessLevel: owner?.accessLevel || 'shared',
    ownerUserId: owner?.ownerUserId || null,
    isOwner: Boolean(owner?.ownerUserId && userId && owner.ownerUserId === userId),
  }
}

export async function getInternalNotes({ transactionId, unitId = null } = {}) {
  return fetchTransactionDiscussion(transactionId, {
    unitId,
    viewer: 'internal',
    includeLegacy: true,
  })
}

export async function getSharedNotes({ transactionId, unitId = null } = {}) {
  return fetchTransactionDiscussion(transactionId, {
    unitId,
    viewer: 'external',
    includeLegacy: true,
  })
}

export async function createFirm({ name, type = 'attorney' } = {}) {
  const client = requireClient()
  const actorProfile = await resolveActiveProfileContext(client)
  if (!actorProfile.userId) {
    throw new Error('Authentication is required to create a firm.')
  }

  const normalizedName = normalizeTextValue(name)
  if (!normalizedName) {
    throw new Error('Firm name is required.')
  }
  const normalizedType = normalizeFirmType(type, 'attorney')

  const insertQuery = await client
    .from('firms')
    .insert({
      name: normalizedName,
      type: normalizedType,
    })
    .select('id, name, type, created_at, updated_at')
    .single()

  if (insertQuery.error) {
    if (isMissingTableError(insertQuery.error, 'firms')) {
      throw new Error('Firm model is not set up yet. Run sql/schema.sql and refresh.')
    }
    throw insertQuery.error
  }

  const firm = insertQuery.data
  await addFirmMember({
    firmId: firm.id,
    userId: actorProfile.userId,
    role: 'firm_admin',
    status: 'active',
  })

  await client
    .from('profiles')
    .update({
      firm_id: firm.id,
      firm_role: 'firm_admin',
      updated_at: new Date().toISOString(),
    })
    .eq('id', actorProfile.userId)

  return {
    id: firm.id,
    name: firm.name,
    type: normalizeFirmType(firm.type),
    createdAt: firm.created_at || null,
    updatedAt: firm.updated_at || null,
  }
}

export async function listFirms() {
  const client = requireClient()
  const query = await client
    .from('firms')
    .select('id, name, type, created_at, updated_at')
    .order('name', { ascending: true })

  if (query.error) {
    if (isMissingTableError(query.error, 'firms')) {
      return []
    }
    throw query.error
  }

  return (query.data || []).map((row) => ({
    id: row.id,
    name: row.name || '',
    type: normalizeFirmType(row.type),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  }))
}

export async function addFirmMember({ firmId, userId, role = 'attorney', status = 'active' } = {}) {
  const client = requireClient()
  if (!firmId || !userId) {
    throw new Error('Firm and user are required.')
  }

  const actorProfile = await resolveActiveProfileContext(client)
  const payload = {
    firm_id: firmId,
    user_id: userId,
    role: normalizeFirmRole(role),
    status:
      normalizeStakeholderStatus(status, 'active') === 'removed'
        ? 'inactive'
        : status === 'invited'
          ? 'invited'
          : 'active',
    invited_at: status === 'invited' ? new Date().toISOString() : null,
    accepted_at: status === 'active' ? new Date().toISOString() : null,
    created_by: actorProfile.userId || null,
  }

  const upsertQuery = await client
    .from('firm_memberships')
    .upsert(payload, { onConflict: 'firm_id,user_id' })
    .select('id, firm_id, user_id, role, status, invited_at, accepted_at, created_at, updated_at')
    .single()

  if (upsertQuery.error) {
    if (isMissingTableError(upsertQuery.error, 'firm_memberships')) {
      throw new Error('Firm memberships are not set up yet. Run sql/schema.sql and refresh.')
    }
    throw upsertQuery.error
  }

  const membership = upsertQuery.data
  return {
    id: membership.id,
    firmId: membership.firm_id,
    userId: membership.user_id,
    role: normalizeFirmRole(membership.role),
    status: membership.status || 'active',
    invitedAt: membership.invited_at || null,
    acceptedAt: membership.accepted_at || null,
    createdAt: membership.created_at || null,
    updatedAt: membership.updated_at || null,
  }
}

export async function getAccessibleTransactionsForUser({ userId, roleType = null } = {}) {
  const client = requireClient()
  const transactionIds = await getAccessibleTransactionIdsForUser({
    userId,
    roleType,
  })
  if (!transactionIds.length) {
    return []
  }

  const allRows = await fetchTransactionsData({ developmentId: null })
  const transactionIdSet = new Set(transactionIds)
  const scopedRows = dedupeTransactionRows(allRows.filter((row) => transactionIdSet.has(row?.transaction?.id)))
  return dedupeTransactionRows(await enrichRowsWithReadinessContext(client, scopedRows))
}

export async function updateTransactionStakeholderContacts({
  transactionId,
  sellerOnly = false,
  buyerName,
  buyerEmail,
  buyerPhone,
  sellerName,
  sellerEmail,
  sellerPhone,
  sellerSaveContext,
  sellerMutationId,
  agentName,
  agentEmail,
  attorneyName,
  attorneyEmail,
  bondOriginatorName,
  bondOriginatorEmail,
  matterOwner,
  actorRole = null,
}) {
  if (!transactionId) {
    throw new Error('Transaction is required.')
  }

  const client = requireClient()
  if (sellerOnly) {
    return saveTransactionSellerDetails({ transactionId, details: { name: sellerName, email: sellerEmail, phone: sellerPhone }, context: sellerSaveContext, mutationId: sellerMutationId, client })
  }
  if ([sellerName, sellerEmail, sellerPhone].some((value) => value !== undefined)) {
    throw new Error('Save seller contacts from the seller details editor so the original saved revision can be checked.')
  }
  const actorProfile = await resolveActiveProfileContext(client)
  const normalizedActorRole = normalizeRoleType(actorRole || actorProfile.role || 'attorney')
  if (!['attorney', 'developer', 'internal_admin', 'agent'].includes(normalizedActorRole)) {
    throw new Error('Your role does not have permission to update stakeholder details.')
  }

  let transactionQuery = await client
    .from('transactions')
    .select(
      selectWithoutKnownMissingColumns(
        'id, organisation_id, buyer_id, purchaser_type, assigned_agent, assigned_agent_email, attorney, assigned_attorney_email, bond_originator, assigned_bond_originator_email, matter_owner, seller_name, seller_email, seller_phone, updated_at',
      ),
    )
    .eq('id', transactionId)
    .maybeSingle()

  if (
    transactionQuery.error &&
    (isMissingColumnError(transactionQuery.error, 'assigned_agent') ||
      isMissingColumnError(transactionQuery.error, 'assigned_agent_email') ||
      isMissingColumnError(transactionQuery.error, 'assigned_attorney_email') ||
      isMissingColumnError(transactionQuery.error, 'assigned_bond_originator_email') ||
      isMissingColumnError(transactionQuery.error, 'organisation_id') ||
      isMissingColumnError(transactionQuery.error, 'matter_owner') ||
      isMissingColumnError(transactionQuery.error, 'seller_name') ||
      isMissingColumnError(transactionQuery.error, 'seller_email') ||
      isMissingColumnError(transactionQuery.error, 'seller_phone'))
  ) {
    registerKnownMissingColumns(transactionQuery.error, [
      'assigned_agent',
      'assigned_agent_email',
      'assigned_attorney_email',
      'assigned_bond_originator_email',
      'organisation_id',
      'matter_owner',
      'seller_name',
      'seller_email',
      'seller_phone',
    ])
    transactionQuery = await client
      .from('transactions')
      .select('id, buyer_id, purchaser_type, attorney, bond_originator, updated_at')
      .eq('id', transactionId)
      .maybeSingle()
  }

  if (transactionQuery.error) {
    throw transactionQuery.error
  }

  const transaction = transactionQuery.data
  if (!transaction) {
    throw new Error('Transaction not found.')
  }

  const normalizedBuyerName = normalizeNullableText(buyerName)
  const normalizedBuyerEmail = normalizeNullableText(buyerEmail)?.toLowerCase() || null
  const normalizedBuyerPhone = normalizeNullableText(buyerPhone)

  let buyer = null
  let effectiveBuyerId = transaction.buyer_id || null

  if (effectiveBuyerId) {
    const buyerLookup = await client
      .from('buyers')
      .select('id, name, email, phone')
      .eq('id', effectiveBuyerId)
      .maybeSingle()
    if (buyerLookup.error) {
      throw buyerLookup.error
    }
    buyer = buyerLookup.data || null
  }

  if (!effectiveBuyerId && (normalizedBuyerName || normalizedBuyerEmail || normalizedBuyerPhone)) {
    const nextBuyer = await findOrCreateBuyer(client, {
      name: normalizedBuyerName || normalizedBuyerEmail || 'Client / Buyer',
      email: normalizedBuyerEmail,
      phone: normalizedBuyerPhone,
      organisationId: transaction.organisation_id,
    })
    effectiveBuyerId = nextBuyer.id
    buyer = nextBuyer
  } else if (effectiveBuyerId && (normalizedBuyerName || normalizedBuyerEmail || normalizedBuyerPhone)) {
    const buyerUpdate = await client
      .from('buyers')
      .update({
        name: normalizedBuyerName || buyer?.name || 'Client / Buyer',
        email: normalizedBuyerEmail,
        phone: normalizedBuyerPhone,
      })
      .eq('id', effectiveBuyerId)
      .select('id, name, email, phone')
      .single()

    if (buyerUpdate.error) {
      throw buyerUpdate.error
    }
    buyer = buyerUpdate.data
  }

  const transactionPayload = {
    buyer_id: effectiveBuyerId,
    assigned_agent: normalizeNullableText(agentName),
    assigned_agent_email: normalizeNullableText(agentEmail)?.toLowerCase() || null,
    attorney: normalizeNullableText(attorneyName),
    assigned_attorney_email: normalizeNullableText(attorneyEmail)?.toLowerCase() || null,
    bond_originator: normalizeNullableText(bondOriginatorName),
    assigned_bond_originator_email: normalizeNullableText(bondOriginatorEmail)?.toLowerCase() || null,
    matter_owner: normalizeNullableText(matterOwner),
    updated_at: new Date().toISOString(),
  }

  const fallbackColumns = [
    'assigned_agent',
    'assigned_agent_email',
    'assigned_attorney_email',
    'assigned_bond_originator_email',
    'matter_owner',
  ]

  let transactionUpdate = await client.from('transactions').update(transactionPayload).eq('id', transactionId)

  if (transactionUpdate.error) {
    let fallbackPayload = { ...transactionPayload }
    let fallbackError = transactionUpdate.error
    let fallbackAttempts = 0

    while (fallbackError && fallbackAttempts < fallbackColumns.length) {
      const missingColumns = fallbackColumns.filter((column) => isMissingColumnError(fallbackError, column))
      if (!missingColumns.length) {
        break
      }

      const beforeKeys = Object.keys(fallbackPayload).length
      missingColumns.forEach((column) => {
        delete fallbackPayload[column]
      })
      if (Object.keys(fallbackPayload).length === beforeKeys) {
        break
      }

      const fallbackResult = await client.from('transactions').update(fallbackPayload).eq('id', transactionId)
      transactionUpdate = fallbackResult
      fallbackError = fallbackResult.error
      fallbackAttempts += 1
      if (!fallbackError) {
        break
      }
    }
  }

  if (transactionUpdate.error) {
    throw transactionUpdate.error
  }

  try {
    const onboardingFormDataQuery = await client
      .from('onboarding_form_data')
      .select('id, form_data, purchaser_type')
      .eq('transaction_id', transactionId)
      .maybeSingle()

    if (!onboardingFormDataQuery.error) {
      const existingFormData =
        onboardingFormDataQuery.data?.form_data && typeof onboardingFormDataQuery.data.form_data === 'object'
          ? { ...onboardingFormDataQuery.data.form_data }
          : {}

      const applyFormDataValue = (key, value) => {
        if (value === null || value === undefined || value === '') {
          delete existingFormData[key]
          return
        }
        existingFormData[key] = String(value)
      }

      applyFormDataValue('full_name', normalizedBuyerName || buyer?.name || '')
      applyFormDataValue('email', normalizedBuyerEmail || buyer?.email || '')
      applyFormDataValue('phone', normalizedBuyerPhone || buyer?.phone || '')

      const onboardingFormDataUpsert = await client.from('onboarding_form_data').upsert(
        {
          transaction_id: transactionId,
          purchaser_type: normalizePurchaserType(
            transaction?.purchaser_type || onboardingFormDataQuery.data?.purchaser_type || 'individual',
          ),
          form_data: existingFormData,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'transaction_id' },
      )

      if (
        onboardingFormDataUpsert.error &&
        !isMissingTableError(onboardingFormDataUpsert.error, 'onboarding_form_data')
      ) {
        throw onboardingFormDataUpsert.error
      }
    } else if (!isMissingTableError(onboardingFormDataQuery.error, 'onboarding_form_data')) {
      throw onboardingFormDataQuery.error
    }
  } catch (onboardingError) {
    if (!isMissingSchemaError(onboardingError)) {
      throw onboardingError
    }
  }

  try {
      await ensureTransactionParticipants(client, {
        transaction: {
          ...transaction,
          id: transactionId,
          buyer_id: effectiveBuyerId,
          assigned_agent: transactionPayload.assigned_agent,
          assigned_agent_email: transactionPayload.assigned_agent_email,
          attorney: transactionPayload.attorney,
          assigned_attorney_email: transactionPayload.assigned_attorney_email,
          bond_originator: transactionPayload.bond_originator,
          assigned_bond_originator_email: transactionPayload.assigned_bond_originator_email,
        },
        buyer,
      })
  } catch (participantError) {
    if (!isMissingSchemaError(participantError)) {
      throw participantError
    }
  }

  await logTransactionEventIfPossible(client, {
    transactionId,
    eventType: 'TransactionUpdated',
    createdBy: actorProfile.userId || null,
    createdByRole: normalizedActorRole,
    eventData: {
      source: 'update_transaction_stakeholders',
      buyerName: normalizedBuyerName || buyer?.name || null,
      buyerEmail: normalizedBuyerEmail || buyer?.email || null,
      assignedAgent: transactionPayload.assigned_agent,
      assignedAttorney: transactionPayload.attorney,
      assignedBondOriginator: transactionPayload.bond_originator,
    },
  })

  return fetchTransactionById(transactionId)
}
