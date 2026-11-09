// transactions owns these operations and their existing recovery behavior.
import { normalizeDeveloperPartnerScopeJson } from '../partners/invitationActions.js'
import { updateRecordByIdWithMissingColumnFallback } from '../../lib/api/shared/schemaCompatibility.js'
import { logTransactionEventIfPossible } from './eventActions.js'
import { resolveActiveProfileContext } from '../access/actorContext.js'
import { fetchTransactionRowById } from './workspaceReadApi.js'
import { normalizeDeveloperPartnerType, getDeveloperPartnerTypeLabel, normalizeDeveloperPartnerDefaultRow, normalizeDeveloperPartnerScopeType } from '../partners/readApi.js'
import { selectWithoutKnownMissingColumns, registerKnownMissingColumns } from '../../lib/api/shared/schemaReadCompatibility.js'
import { normalizeNullableUuid, normalizeNullableText, requireClient, isMissingTableError, isMissingColumnError, isMissingSchemaError, isPermissionDeniedError, normalizeTextValue } from '../../lib/api/shared/readHelpers.js'
import { latestTimestamp, normalizeStage, normalizeMainStage } from '../../core/transactions/legacyReadModel.js'
import { hydrateRowsWithCommissionSnapshots, TRANSACTION_SUMMARY_SELECT_CLAUSE, TRANSACTION_SUMMARY_FALLBACK_SELECT_CLAUSE, enrichRowsWithBondIntakeContext } from './summaryReadApi.js'
import { normalizeEmailAddress } from '../developments/profileNormalization.js'
import { normalizePurchaserType } from '../../lib/purchaserPersonas'
import { normalizeRoleType } from '../../core/transactions/permissions'
import { bondPerfLog, createPerfTimer } from '../../lib/performanceTrace'
import { fetchOnboardingFormDataForTransaction } from './participantInfrastructure.js'
import { propagateTransactionRoleplayersIfPossible } from './creationApi.js'
import { upsertTransactionRoleplayerSelection } from '../access/roleplayerPersistence.js'
import { getAccessibleTransactionIdsForUser, getAccessibleTransactionsForUser } from '../access/transactionApi.js'
import { fetchTransactionById } from './detailReadApi.js'

export async function updateTransactionBondOriginatorFromBuyerRequest(
  client,
  { transaction, request = {}, actorProfile = null, actorRole = 'client' } = {},
) {
  const transactionId = normalizeTextValue(transaction?.id || transaction?.transaction_id)
  if (!transactionId || !request?.requested || !request?.companyName) return null
  const now = new Date().toISOString()
  const assignedEmail = normalizeEmailAddress(request.email || transaction?.assigned_bond_originator_email || '')
  const buyerAppointedSelection = {
    roleType: 'bond_originator',
    selectionSource: 'buyer_appointed',
    assignmentStatus: 'active',
    activationTrigger: 'buyer_onboarding_approved_originator',
    companyName: request.companyName,
    partnerName: request.companyName,
    contactPerson: request.companyName,
    email: assignedEmail || null,
    phone: request.contactDetails || null,
    snapshot: {
      source: 'buyer_onboarding',
      buyerAppointed: true,
      buyerName: request.buyerName || null,
      requestedAt: request.requestedAt || now,
      contactDetails: request.contactDetails || null,
    },
  }
  await updateRecordByIdWithMissingColumnFallback(
    client,
    'transactions',
    transactionId,
    {
      bond_originator: request.companyName,
      assigned_bond_originator_email: assignedEmail || null,
      bond_assignment_source: 'buyer_appointed',
      finance_managed_by: 'bond_originator',
      updated_at: now,
    },
    'id, bond_originator, assigned_bond_originator_email, bond_assignment_source, finance_managed_by, updated_at',
  )

  try {
    await upsertTransactionRoleplayerSelection(client, {
      transactionId,
      actorProfile: actorProfile || {
        userId: null,
        role: actorRole || 'client',
      },
      selection: buyerAppointedSelection,
    })
  } catch (roleplayerError) {
    if (!isMissingSchemaError(roleplayerError) && !isPermissionDeniedError(roleplayerError)) {
      throw roleplayerError
    }
  }

  try {
    await propagateTransactionRoleplayersIfPossible(client, {
      transactionId,
      transaction: {
        ...transaction,
        bond_originator: request.companyName,
        assigned_bond_originator_email: assignedEmail || null,
        finance_managed_by: 'bond_originator',
      },
      rolePlayers: [buyerAppointedSelection],
      actorProfile: actorProfile || {
        userId: null,
        role: actorRole || 'client',
      },
      actorRole,
      buyerId: transaction?.buyer_id || transaction?.buyerId || null,
      financeType: transaction?.finance_type || 'bond',
    })
  } catch (propagationError) {
    if (!isMissingSchemaError(propagationError) && !isPermissionDeniedError(propagationError)) {
      throw propagationError
    }
  }

  return { applied: true, transactionId }
}

export async function resolveBuyerAppointedBondOriginatorRequest({
  transactionId,
  decision,
  rejectionReason = '',
  actorRole = null,
} = {}) {
  const normalizedTransactionId = normalizeNullableUuid(transactionId)
  if (!normalizedTransactionId) throw new Error('Transaction is required.')
  const normalizedDecision = String(decision || '')
    .trim()
    .toLowerCase()
  if (!['approved', 'rejected'].includes(normalizedDecision)) {
    throw new Error('Choose whether to approve or reject the buyer bond originator request.')
  }

  const client = requireClient()
  const actorProfile = await resolveActiveProfileContext(client)
  const normalizedActorRole = normalizeRoleType(actorRole || actorProfile.role || 'agent')
  if (
    !['agent', 'agency_admin', 'developer', 'internal_admin', 'admin', 'platform_admin'].includes(normalizedActorRole)
  ) {
    throw new Error('Your role does not have permission to resolve buyer-appointed bond originator requests.')
  }

  const transaction = await fetchTransactionRowById(client, normalizedTransactionId)
  if (!transaction?.id) {
    throw new Error('Transaction not found.')
  }

  const onboardingFormRow = await fetchOnboardingFormDataForTransaction(
    client,
    normalizedTransactionId,
    transaction.purchaser_type || 'individual',
  )
  const formData = onboardingFormRow?.formData || {}
  const existingRequest = formData.buyer_bond_originator_request || formData.buyerBondOriginatorRequest || null
  if (!existingRequest?.requested) {
    throw new Error('There is no buyer-appointed bond originator request on this transaction.')
  }
  if (
    String(existingRequest.status || '')
      .trim()
      .toLowerCase() !== 'pending_approval'
  ) {
    throw new Error('This buyer-appointed bond originator request is not pending approval.')
  }

  const now = new Date().toISOString()
  const nextRequest = {
    ...existingRequest,
    status: normalizedDecision,
    resolvedAt: now,
    reviewedAt: now,
    resolvedBy: actorProfile.userId || null,
    resolvedByRole: normalizedActorRole,
    rejectionReason: normalizedDecision === 'rejected' ? normalizeNullableText(rejectionReason) : null,
  }

  if (normalizedDecision === 'approved') {
    await updateTransactionBondOriginatorFromBuyerRequest(client, {
      transaction,
      request: {
        ...existingRequest,
        status: 'approved',
        requested: true,
      },
      actorProfile,
      actorRole: normalizedActorRole,
    })
  }

  const nextFormData = {
    ...formData,
    buyer_bond_originator_request: nextRequest,
    buyerBondOriginatorRequest: nextRequest,
  }
  const formUpsert = await client.from('onboarding_form_data').upsert(
    {
      transaction_id: normalizedTransactionId,
      purchaser_type: normalizePurchaserType(
        transaction.purchaser_type || onboardingFormRow?.purchaserType || 'individual',
      ),
      form_data: nextFormData,
      updated_at: now,
    },
    { onConflict: 'transaction_id' },
  )
  if (formUpsert.error) {
    if (isMissingTableError(formUpsert.error, 'onboarding_form_data')) {
      throw new Error('Onboarding form storage is not set up yet. Run sql/schema.sql first.')
    }
    throw formUpsert.error
  }

  await logTransactionEventIfPossible(client, {
    transactionId: normalizedTransactionId,
    eventType: 'buyer_bond_originator_request_resolved',
    createdBy: actorProfile.userId || null,
    createdByRole: normalizedActorRole,
    eventData: {
      source: 'transaction_workspace',
      decision: normalizedDecision,
      companyName: existingRequest.companyName || null,
      contactDetails: existingRequest.contactDetails || null,
      email: existingRequest.email || null,
      rejectionReason: nextRequest.rejectionReason || null,
      visibility: 'client_visible',
      audience: 'buyer',
      title:
        normalizedDecision === 'approved'
          ? 'Buyer-appointed bond originator approved'
          : 'Buyer-appointed bond originator rejected',
      description:
        normalizedDecision === 'approved'
          ? `${existingRequest.companyName || 'The nominated bond originator'} has been assigned to your transaction.`
          : `${existingRequest.companyName || 'The nominated bond originator'} was not approved. Your transaction team will continue with the appointed finance process.`,
      actionLabel: normalizedDecision === 'approved' ? 'View Team' : 'View Progress',
      actionRoute: normalizedDecision === 'approved' ? 'team' : 'progress',
    },
  })

  try {
    let notificationUpdate = await client
      .from('transaction_notifications')
      .update({
        is_read: true,
        read_at: now,
        updated_at: now,
      })
      .eq('transaction_id', normalizedTransactionId)
      .eq('event_type', 'buyer_bond_originator_request')
      .eq('notification_type', 'roleplayer_change_requested')

    if (
      notificationUpdate.error &&
      (isMissingColumnError(notificationUpdate.error, 'event_type') ||
        isMissingColumnError(notificationUpdate.error, 'notification_type') ||
        isMissingColumnError(notificationUpdate.error, 'updated_at'))
    ) {
      notificationUpdate = await client
        .from('transaction_notifications')
        .update({ is_read: true, read_at: now })
        .eq('transaction_id', normalizedTransactionId)
    }
    if (
      notificationUpdate.error &&
      !isMissingTableError(notificationUpdate.error, 'transaction_notifications') &&
      !isPermissionDeniedError(notificationUpdate.error)
    ) {
      throw notificationUpdate.error
    }
  } catch (notificationError) {
    console.warn('Buyer bond originator request notification resolution skipped', notificationError)
  }

  return fetchTransactionById(normalizedTransactionId)
}

async function fetchTransactionSummaryRowsByIds(
  client,
  transactionIds = [],
  { organisationId = '', roleType = null } = {},
) {
  const fetchStartedAt = Date.now()
  const ids = [...new Set((transactionIds || []).filter(Boolean))]
  if (!ids.length) {
    return []
  }
  const normalizedOrganisationId = String(organisationId || '').trim()
  const normalizedRoleType = normalizeRoleType(roleType)
  const workspaceScopeColumn = normalizedRoleType === 'bond_originator' ? 'bond_workspace_id' : 'organisation_id'
  const filterWorkspaceInDatabase = Boolean(normalizedOrganisationId && normalizedRoleType !== 'bond_originator')

  let transactionsBuilder = client
    .from('transactions')
    .select(selectWithoutKnownMissingColumns(TRANSACTION_SUMMARY_SELECT_CLAUSE))
    .in('id', ids)
  if (filterWorkspaceInDatabase) {
    transactionsBuilder = transactionsBuilder.eq(workspaceScopeColumn, normalizedOrganisationId)
  }
  let transactionsQuery = await transactionsBuilder

  if (transactionsQuery.error && isMissingColumnError(transactionsQuery.error)) {
    if (filterWorkspaceInDatabase && isMissingColumnError(transactionsQuery.error, workspaceScopeColumn)) {
      return []
    }
    registerKnownMissingColumns(transactionsQuery.error, [
      'matter_number',
      'transaction_reference',
      'transaction_type',
      'property_type',
      'reservation_required',
      'reservation_amount',
      'reservation_amount_type',
      'reservation_treatment',
      'reservation_payable_to',
      'alteration_charge_treatment',
      'current_main_stage',
      'current_sub_stage_summary',
      'assigned_agent',
      'assigned_agent_email',
      'assigned_attorney_email',
      'assigned_bond_originator_email',
      'comment',
      'expected_transfer_date',
      'bond_workspace_id',
      'bond_region_id',
      'bond_workspace_unit_id',
      'primary_bond_consultant_user_id',
      'assigned_bond_processor_user_id',
      'assigned_bond_manager_user_id',
      'assigned_bond_compliance_user_id',
      'bond_assignment_status',
      'bond_assignment_source',
      'finance_status',
      'compliance_status',
      'compliance_review_required',
      'application_prepared',
      'submitted_to_banks',
      'documents_complete',
      'finance_documents_complete',
      'documents_missing',
      'required_documents_missing',
      'finance_documents_missing',
      'missing_documents_count',
      'uploaded_documents_count',
      'total_required_documents',
      'bank_feedback_pending',
      'bank_feedback_status',
      'next_action_due_at',
      'finance_due_at',
      'attorney_stage',
      'risk_status',
      'operational_state',
      'processor_name',
      'assigned_bond_processor_name',
      'compliance_name',
      'organisation_id',
      'assigned_branch_id',
      'lifecycle_state',
      'registered_at',
      'completed_at',
      'archived_at',
      'cancelled_at',
      'deleted_at',
      'last_meaningful_activity_at',
      'gross_commission_percentage',
      'gross_commission_amount',
      'agent_split_percentage_snapshot',
      'agency_split_percentage_snapshot',
      'agent_commission_amount',
      'agency_commission_amount',
      'purchase_price',
      'cash_amount',
      'bond_amount',
      'deposit_amount',
      'onboarding_status',
      'bank',
      'is_active',
    ])
    let fallbackBuilder = client
      .from('transactions')
      .select(selectWithoutKnownMissingColumns(TRANSACTION_SUMMARY_FALLBACK_SELECT_CLAUSE))
      .in('id', ids)
    if (filterWorkspaceInDatabase) {
      fallbackBuilder = fallbackBuilder.eq(workspaceScopeColumn, normalizedOrganisationId)
    }
    transactionsQuery = await fallbackBuilder
    if (
      transactionsQuery.error &&
      filterWorkspaceInDatabase &&
      isMissingColumnError(transactionsQuery.error, workspaceScopeColumn)
    ) {
      return []
    }
  }

  if (transactionsQuery.error) {
    throw transactionsQuery.error
  }
  bondPerfLog('transaction-summary:fetch', fetchStartedAt, {
    transactionCount: transactionsQuery.data?.length || 0,
    organisationId: normalizedOrganisationId,
    roleType: normalizedRoleType,
  })

  const transactionRows = (transactionsQuery.data || [])
    .filter((item) => item?.is_active !== false)
    .filter(
      (item) =>
        !filterWorkspaceInDatabase || String(item?.[workspaceScopeColumn] || '').trim() === normalizedOrganisationId,
    )
  if (!transactionRows.length) {
    return []
  }

  const buyerIds = [...new Set(transactionRows.map((item) => item?.buyer_id).filter(Boolean))]
  const unitIds = [...new Set(transactionRows.map((item) => item?.unit_id).filter(Boolean))]
  const developmentIds = [...new Set(transactionRows.map((item) => item?.development_id).filter(Boolean))]

  const [buyersQuery, unitsQuery] = await Promise.all([
    buyerIds.length
      ? client.from('buyers').select('id, name, phone, email').in('id', buyerIds)
      : Promise.resolve({ data: [], error: null }),
    unitIds.length
      ? client.from('units').select('id, development_id, unit_number, phase, price, status').in('id', unitIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (buyersQuery.error && !isMissingSchemaError(buyersQuery.error)) {
    throw buyersQuery.error
  }
  if (unitsQuery.error && !isMissingSchemaError(unitsQuery.error)) {
    throw unitsQuery.error
  }

  const buyersById = (buyersQuery.data || []).reduce((accumulator, item) => {
    accumulator[item.id] = item
    return accumulator
  }, {})
  const unitsById = (unitsQuery.data || []).reduce((accumulator, item) => {
    accumulator[item.id] = item
    return accumulator
  }, {})

  const linkedDevelopmentIds = new Set(developmentIds)
  for (const unit of Object.values(unitsById)) {
    if (unit?.development_id) {
      linkedDevelopmentIds.add(unit.development_id)
    }
  }

  let developmentsById = {}
  const allDevelopmentIds = [...linkedDevelopmentIds]
  if (allDevelopmentIds.length) {
    const developmentsQuery = await client.from('developments').select('id, name, location').in('id', allDevelopmentIds)
    if (developmentsQuery.error && !isMissingSchemaError(developmentsQuery.error)) {
      throw developmentsQuery.error
    }
    developmentsById = (developmentsQuery.data || []).reduce((accumulator, item) => {
      accumulator[item.id] = item
      return accumulator
    }, {})
  }

  const rows = transactionRows
    .map((transaction) => {
      const unit = transaction?.unit_id ? unitsById[transaction.unit_id] || null : null
      const developmentId = transaction?.development_id || unit?.development_id || null
      const development = developmentId ? developmentsById[developmentId] || null : null
      const buyer = transaction?.buyer_id ? buyersById[transaction.buyer_id] || null : null
      const stage = normalizeStage(transaction?.stage, unit?.status || 'Available')
      const mainStage = normalizeMainStage(transaction?.current_main_stage, stage)

      return {
        unit,
        development,
        transaction,
        buyer,
        stage,
        mainStage,
        handover: null,
        snagSummary: {
          totalCount: 0,
          openCount: 0,
          latestUpdatedAt: null,
          status: 'clear',
        },
        onboarding: null,
        documentSummary: {
          uploadedCount: 0,
          totalRequired: 0,
          missingCount: 0,
        },
      }
    })
    .sort((a, b) => new Date(latestTimestamp(b) || 0) - new Date(latestTimestamp(a) || 0))

  const enrichmentStartedAt = Date.now()
  const commissionRows = await hydrateRowsWithCommissionSnapshots(client, rows)
  const enrichedRows = await enrichRowsWithBondIntakeContext(commissionRows)
  bondPerfLog('transaction-summary:enrichment', enrichmentStartedAt, {
    rowCount: enrichedRows.length,
    organisationId: normalizedOrganisationId,
    roleType: normalizedRoleType,
  })
  return normalizedOrganisationId && normalizedRoleType === 'bond_originator'
    ? enrichedRows.filter((row) => rowMatchesBondWorkspaceScope(row, normalizedOrganisationId))
    : enrichedRows
}

const participantSummaryRequests = new Map()

const participantSummaryResultCache = new Map()

const PARTICIPANT_SUMMARY_CACHE_TTL_MS = 90 * 1000

function pruneParticipantSummaryResultCache(now = Date.now()) {
  for (const [key, entry] of participantSummaryResultCache.entries()) {
    if (!entry || entry.expiresAt <= now) {
      participantSummaryResultCache.delete(key)
    }
  }
}

export async function fetchTransactionsByParticipantSummary({ userId, roleType = null, organisationId = '' } = {}) {
  const normalizedOrganisationId = String(organisationId || '').trim()
  const normalizedRoleType = roleType ? normalizeRoleType(roleType) : ''
  const requestKey = JSON.stringify({
    userId: String(userId || ''),
    roleType: normalizedRoleType,
    organisationId: normalizedOrganisationId,
  })
  const now = Date.now()
  pruneParticipantSummaryResultCache(now)
  const cachedResult = participantSummaryResultCache.get(requestKey)
  if (cachedResult && cachedResult.expiresAt > now) {
    bondPerfLog('participant-summary:cache-hit', now, {
      userId,
      roleType: normalizedRoleType,
      organisationId: normalizedOrganisationId,
      rowCount: cachedResult.rows.length,
    })
    return cachedResult.rows
  }
  const pendingRequest = participantSummaryRequests.get(requestKey)
  if (pendingRequest) {
    bondPerfLog('participant-summary:inflight-hit', now, {
      userId,
      roleType: normalizedRoleType,
      organisationId: normalizedOrganisationId,
    })
    return pendingRequest
  }

  const request = (async () => {
    const timer = createPerfTimer('api.fetchTransactionsByParticipantSummary', {
      userId,
      roleType,
      organisationId: normalizedOrganisationId,
    })
    if (!userId) {
      timer.end({ rowCount: 0 })
      return []
    }

    timer.mark('resolve_access_start')
    const accessStartedAt = Date.now()
    const client = requireClient()
    const transactionIds = await getAccessibleTransactionIdsForUser({
      userId,
      roleType,
      organisationId: normalizedOrganisationId,
    })
    timer.mark('resolve_access_end', {
      transactionCount: transactionIds.length,
    })
    bondPerfLog('resolve-access', accessStartedAt, {
      userId,
      roleType: normalizedRoleType,
      organisationId: normalizedOrganisationId,
      transactionCount: transactionIds.length,
    })
    timer.mark('transaction_summary_fetch_start')
    const rows = await fetchTransactionSummaryRowsByIds(client, transactionIds, {
      organisationId: normalizedOrganisationId,
      roleType,
    })
    timer.mark('transaction_summary_fetch_end', { rowCount: rows.length })
    participantSummaryResultCache.set(requestKey, {
      rows,
      expiresAt: Date.now() + PARTICIPANT_SUMMARY_CACHE_TTL_MS,
    })
    timer.end({ rowCount: rows.length })
    return rows
  })()

  participantSummaryRequests.set(requestKey, request)
  try {
    return await request
  } finally {
    if (participantSummaryRequests.get(requestKey) === request) {
      participantSummaryRequests.delete(requestKey)
    }
  }
}

function rowMatchesBondWorkspaceScope(row = {}, organisationId = '') {
  const target = normalizeTextValue(organisationId)
  if (!target) return true
  const transaction = row?.transaction || {}
  return [
    transaction.assigned_organisation_id,
    transaction.assignedOrganisationId,
    transaction.bond_workspace_id,
    transaction.bondWorkspaceId,
    transaction.workspace_id,
    transaction.workspaceId,
  ]
    .map((value) => normalizeTextValue(value))
    .includes(target)
}

export async function fetchTransactionsByParticipant({ userId, roleType = null } = {}) {
  if (!userId) {
    return []
  }

  const timer = createPerfTimer('api.fetchTransactionsByParticipant', {
    userId,
    roleType,
  })
  timer.mark('participant_query_start')
  const rows = await getAccessibleTransactionsForUser({ userId, roleType })
  timer.mark('participant_query_end', { rowCount: rows.length })
  timer.end({ rowCount: rows.length })
  return rows
}

export async function fetchSellerTransferJourneyUpdatesByToken(token, accessToken) {
  const client = requireClient()
  const { data, error } = await client.rpc('bridge_read_seller_transfer_journey_updates', {
    p_token: String(token || '').trim(),
    p_access_token: String(accessToken || '').trim(),
  })
  if (error) throw error
  return Array.isArray(data) ? data : []
}

function getPreferredPartnerTypeForDeveloperPartner(partnerType = '') {
  const normalized = normalizeDeveloperPartnerType(partnerType)
  if (normalized === 'bond_originator') return 'bond_originator'
  if (normalized === 'transfer_attorney') return 'transfer_attorney'
  return 'agency'
}

export async function setDeveloperCanonicalPartnerDefault(input = {}) {
  const developerOrganisationId = normalizeNullableUuid(
    input.developerOrganisationId || input.developer_organisation_id || input.organisationId,
  )
  if (!developerOrganisationId) throw new Error('Developer organisation is required.')

  const partnerType = normalizeDeveloperPartnerType(input.partnerType || input.partner_type)
  const partnerOrganisationId = normalizeNullableUuid(input.partnerOrganisationId || input.partner_organisation_id)
  const companyName = normalizeTextValue(input.companyName || input.company_name || input.partnerName || input.partner_name)
  if (!partnerOrganisationId && !companyName) throw new Error('Partner organisation or company name is required.')

  const client = requireClient()
  const scopeType = normalizeDeveloperPartnerScopeType(input.scopeType || input.scope_type)
  const scopeJson = normalizeDeveloperPartnerScopeJson(scopeType, input.scopeJson || input.scope_json)

  const result = await client.rpc('bridge_save_organisation_partner', {
    p_organisation_id: developerOrganisationId,
    p_partner_role_configuration_id: normalizeNullableUuid(input.partnerRoleConfigurationId || input.partner_role_configuration_id),
    p_external_partner_id: normalizeNullableUuid(input.preferredPartnerId || input.preferred_partner_id),
    p_partner_organisation_id: partnerOrganisationId,
    p_role_type: getPreferredPartnerTypeForDeveloperPartner(partnerType),
    p_company_name: companyName || 'Connected partner',
    p_contact_person: normalizeNullableText(input.contactPerson || input.contact_person) || companyName || null,
    p_email_address: normalizeEmailAddress(input.email || input.emailAddress || input.email_address) || null,
    p_phone_number: normalizeNullableText(input.phone || input.phoneNumber || input.phone_number),
    p_website: normalizeNullableText(input.website),
    p_physical_address: normalizeNullableText(input.physicalAddress || input.physical_address),
    p_province: normalizeNullableText(input.province),
    p_notes: normalizeNullableText(input.notes) || `${getDeveloperPartnerTypeLabel(partnerType)} synced from Developer Partners.`,
    p_is_active: true,
    p_is_preferred_default: true,
    p_source: 'developer_partner_relationship',
    p_scope_type: scopeType,
    p_scope_json: scopeJson,
  })

  if (result.error) throw result.error
  const payload = result.data || {}
  if (payload.success === false) {
    throw new Error(payload.code || payload.reason || 'Unable to set this partner as a default.')
  }

  const partner = payload.partner && typeof payload.partner === 'object' ? payload.partner : {}
  return normalizeDeveloperPartnerDefaultRow({
    id: partner.id || input.preferredPartnerId,
    organisation_id: developerOrganisationId,
    partner_type: getPreferredPartnerTypeForDeveloperPartner(partnerType),
    partner_organisation_id: partnerOrganisationId,
    source: 'developer_partner_relationship',
    scope_type: scopeType,
    scope_json: scopeJson,
    company_name: partner.company_name || partner.companyName || companyName,
    contact_person: partner.contact_person || partner.contactPerson || input.contactPerson || companyName,
    email_address: partner.email_address || partner.emailAddress || input.email,
    phone_number: partner.phone_number || partner.phoneNumber || input.phone,
    website: partner.website || input.website,
    physical_address: partner.physical_address || partner.physicalAddress || input.physicalAddress,
    province: partner.province || input.province,
    notes: partner.notes || input.notes,
    is_active: true,
    is_preferred_default: true,
    updated_at: new Date().toISOString(),
  })
}
