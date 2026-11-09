// transactions owns these operations and their existing recovery behavior.
import { resolveProfileIdsByEmail } from '../developments/configurationActions.js'
import { getOrCreateTransactionOnboardingRecord, isRecoverableTransactionSetupError } from '../onboarding/workflow.js'
import { updateRecordByIdWithMissingColumnFallback } from '../../lib/api/shared/schemaCompatibility.js'
import { ensureTransactionRequiredDocuments } from '../documents/requirementActions.js'
import { logTransactionEventIfPossible } from './eventActions.js'
import { resolveActiveProfileContext } from '../access/actorContext.js'
import { normalizeStoredTransactionType } from './listReadApi.js'
import { knownMissingSchemaColumns } from '../../lib/api/shared/schemaReadCompatibility.js'
import { normalizeNullableUuid, normalizeNullableText, requireClient, isMissingTableError, isMissingColumnError, isMissingSchemaError, isPermissionDeniedError, normalizeTextValue, normalizeOptionalNumber } from '../../lib/api/shared/readHelpers.js'
import { normalizeMainStage } from '../../core/transactions/legacyReadModel.js'
import { ensureDevelopmentSettings, DEFAULT_DEVELOPMENT_SETTINGS, normalizeDevelopmentRolePlayerDefaults, normalizeDevelopmentSettingChoice } from '../developments/configurationApi.js'
import { normalizeEmailAddress } from '../developments/profileNormalization.js'
import { trackTransactionBackgroundWork } from '../../lib/transactionBackgroundWork.js'
import { buildTransactionPartiesSnapshot, transactionPartiesOnboardingSeed, transactionSellerContactSlotId } from '../../core/transactions/transactionPartyProfile.js'
import { createScopedSupabaseClient } from '../../lib/supabaseClient'
import { retryMutationWithoutReportedMissingColumns } from '../../lib/targetedMissingColumnRetry.js'
import { COMPATIBILITY_FALLBACK_IDS, trackCompatibilityFallbackState } from '../../services/observability/compatibilityFallbackTelemetry.js'
import { reuseBuyerProfileForTransaction } from '../../services/buyerProfileReuseService.js'
import { normalizeTransactionStage } from '../../core/transactions/stageConfig'
import { normalizePurchaserType } from '../../lib/purchaserPersonas'
import { isBondFinanceType, normalizeFinanceType } from '../../core/transactions/financeType'
import { buildNewTransactionSetupHealth, resolveWizardHandoffNextAction, resolveWizardInitialTransactionStage } from '../../core/transactions/newTransactionSetupHealth.js'
import { resolveTransactionSaleProfile } from '../../core/transactions/transactionSaleProfile.js'
import { assertTransactionCreationInput } from '../../core/transactions/transactionCreationInput.js'
import { TransactionCreationIncompleteError, buildTransactionCreationPersistencePatch, createTransactionCreationLifecycle, requiresTransactionBuyerPortal, getTransactionCreationIncompleteSteps, setTransactionCreationStepOutcome } from '../../core/transactions/transactionCreationLifecycle.js'
import { ENTITLEMENT_KEYS } from '../../constants/workspaceEntitlements'
import { WORKSPACE_TYPES } from '../../constants/workspaceTypes'
import { deriveAttorneyProfessionalProfile } from '../../constants/attorneyRoleCatalog.js'
import { TRANSACTION_ROLE_LABELS } from '../../core/transactions/roleConfig'
import { buildDeveloperTransactionRoleplayerSnapshot, normalizeDeveloperTransactionRoleType, resolveDeveloperTransactionRelationshipProfile } from '../../core/transactions/developerTransactionRelationshipProfile.js'
import { getRolePermissions, normalizeFinanceManagedBy, normalizeRoleType } from '../../core/transactions/permissions'
import { normalizePropertyCategory, normalizePropertyStructureType } from '../../lib/propertyTaxonomy'
import { assertWorkspaceEntitlementLimit } from '../../services/workspaceEntitlementsService'
import { inferUniversalPartnerRoutingRoleTypes, resolvePartnerRoutingSelections } from '../../services/universalPartnerRoutingService'
import { recordUniversalAssignmentEvent, UNIVERSAL_ASSIGNMENT_METHODS } from '../../services/universalAssignmentService'
import { shouldCreateAttorneyAssignmentForSelection } from '../../core/transactions/attorneyInstructionActivation'
import { isMissingFunctionError, normalizeTransactionParticipantAssignmentSource, normalizeTransactionAccessLevel, normalizeAttorneyLegalRole, isInternalStakeholderRole, normalizeTransactionParticipantRow, upsertTransactionParticipantsRowsWithFallback, createTransactionNotificationIfPossible } from './participantInfrastructure.js'
import { isFinanceTypeConstraintError, normalizeAlterationChargeTreatment, runDocumentAutomationIfPossible, normalizeReservationStatus } from '../documents/uploadAutomation.js'
import { ensureTransactionSubprocesses } from './subprocessApi.js'
import { syncTransactionSubprocessOwners, ensureTransactionParticipants } from './workspaceHydration.js'
import { fetchRawBondHybridWorkflow } from '../bond/financeRead.js'
import { resolvePurchasePrice, resolveDevelopmentOrganisationId, findOrCreateBuyer, FIRM_FIRST_ATTORNEY_ROLE_TYPES, isFirmFirstAttorneyAllocation, persistTransactionCommissionSnapshotIfPossible, persistCommissionSnapshotToTransactionRowIfPossible } from './attorneyAllocation.js'
import { createNote } from './discussionApi.js'
import { getOrCreateClientPortalLink } from '../clientPortal/accessApi.js'

function resolveDevelopmentSettingsAssignedAgent(settings = {}) {
  const teams = settings?.stakeholderTeams || settings?.stakeholder_teams || {}
  const defaults = teams?.rolePlayerDefaults || teams?.role_player_defaults || {}
  const agents = Array.isArray(teams?.agents) ? teams.agents : []
  const preferredKey = String(
    defaults.defaultAgentRelationshipId ||
      defaults.default_agent_relationship_id ||
      defaults.defaultAgentPreferredPartnerId ||
      defaults.default_agent_preferred_partner_id ||
      '',
  )
    .trim()
    .toLowerCase()
  const selectedAgent =
    agents.find((agent) => {
      const keys = [
        agent?.id,
        agent?.organisationUserId,
        agent?.organisation_user_id,
        agent?.userId,
        agent?.user_id,
        agent?.email,
        agent?.contactEmail,
      ]
        .map((value) => String(value || '').trim().toLowerCase())
        .filter(Boolean)
      return preferredKey && keys.includes(preferredKey)
    }) ||
    agents.find((agent) => {
      const status = String(agent?.status || agent?.membershipStatus || agent?.membership_status || 'active').toLowerCase()
      return !status || ['active', 'accepted', 'invited', 'pending'].includes(status)
    }) ||
    null
  const firstName = normalizeTextValue(selectedAgent?.firstName || selectedAgent?.first_name)
  const lastName = normalizeTextValue(selectedAgent?.lastName || selectedAgent?.last_name)
  const fullName = [firstName, lastName].filter(Boolean).join(' ')
  const defaultName = normalizeTextValue(defaults.defaultAgentName || defaults.default_agent_name)
  const name = normalizeTextValue(
    selectedAgent?.name ||
      selectedAgent?.contactName ||
      selectedAgent?.fullName ||
      selectedAgent?.full_name ||
      fullName ||
      defaultName ||
      selectedAgent?.email ||
      selectedAgent?.contactEmail,
  )
  const email = normalizeTextValue(selectedAgent?.email || selectedAgent?.contactEmail).toLowerCase()

  return { name, email }
}

const TRANSACTION_RLS_INSERT_GUARD_COLUMNS = new Set([
  'organisation_id',
  'assigned_agent_id',
  'assigned_user_id',
  'owner_user_id',
  'created_by',
  'assigned_agent_email',
  'creation_status',
  'creation_started_at',
  'creation_completed_at',
  'creation_incomplete_at',
  'creation_steps',
  'creation_error',
])

const MAX_TARGETED_MISSING_COLUMN_RETRIES = 8

async function executeTransactionMutationWithTargetedColumnRetry({ payload, execute }) {
  const initialResult = await execute(payload)
  const retry = await retryMutationWithoutReportedMissingColumns({
    initialResult,
    payload,
    execute,
    maxAttempts: MAX_TARGETED_MISSING_COLUMN_RETRIES,
    canRemoveColumn: (column) => !TRANSACTION_RLS_INSERT_GUARD_COLUMNS.has(column),
    onRemoveColumns: (columns) => {
      for (const column of columns) knownMissingSchemaColumns.add(String(column).toLowerCase())
    },
  })
  void trackCompatibilityFallbackState({
    fallbackId: COMPATIBILITY_FALLBACK_IDS.transactionMutationMissingColumns,
    usedFallback: retry.removedColumns.length > 0,
    failed: Boolean(retry.result?.error && retry.removedColumns.length > 0),
    sourceComponent: 'transaction_mutation',
    reasonCode: retry.removedColumns.length ? 'schema_columns_omitted' : 'canonical_schema_supported',
    userId: payload?.created_by || payload?.assigned_user_id || payload?.owner_user_id || '',
    workspaceId: payload?.organisation_id || '',
    route: typeof window !== 'undefined' ? window.location.pathname : '/transactions',
  })
  return retry.result
}

function omitKnownMissingColumnsFromPayload(payload = {}) {
  const source = payload && typeof payload === 'object' ? payload : {}
  if (!knownMissingSchemaColumns.size) {
    return { ...source }
  }

  const sanitized = {}
  for (const [key, value] of Object.entries(source)) {
    const normalizedKey = String(key || '')
      .trim()
      .toLowerCase()
    if (
      !normalizedKey ||
      (knownMissingSchemaColumns.has(normalizedKey) && !TRANSACTION_RLS_INSERT_GUARD_COLUMNS.has(normalizedKey))
    ) {
      continue
    }
    sanitized[key] = value
  }
  return sanitized
}

function deletePayloadColumnIfMissing(error, payload, columnName) {
  if (isMissingColumnError(error, columnName)) {
    delete payload[columnName]
  }
}

export function deletePayloadColumnsIfMissing(error, payload, columnNames = []) {
  for (const columnName of columnNames) {
    deletePayloadColumnIfMissing(error, payload, columnName)
  }
}

function isRecoverableTransactionCommentError(error) {
  return isPermissionDeniedError(error)
}

function normalizeTransactionPropertyType(value) {
  return normalizePropertyCategory(value, { fallback: null })
}

function normalizeReservationAmountType(value) {
  return normalizeDevelopmentSettingChoice(value, ['fixed', 'percentage'], 'fixed')
}

function normalizeReservationTreatment(value) {
  return normalizeDevelopmentSettingChoice(
    value,
    ['credited_to_purchase_price', 'separate_invoice', 'refundable_hold'],
    'credited_to_purchase_price',
  )
}

function normalizeReservationPayableTo(value) {
  return normalizeDevelopmentSettingChoice(value, ['developer', 'agency_trust', 'attorney_trust'], 'developer')
}

function normalizeOptionalBoolean(value) {
  if (value === true || value === false) {
    return value
  }

  return null
}

export function normalizeReservationPaymentDetails(input = {}) {
  const source = input && typeof input === 'object' ? input : {}
  return {
    account_holder_name: normalizeTextValue(source.account_holder_name || source.accountHolderName),
    bank_name: normalizeTextValue(source.bank_name || source.bankName),
    account_number: normalizeTextValue(source.account_number || source.accountNumber),
    branch_code: normalizeTextValue(source.branch_code || source.branchCode),
    account_type: normalizeTextValue(source.account_type || source.accountType),
    payment_reference_format: normalizeTextValue(source.payment_reference_format || source.paymentReferenceFormat),
    payment_instructions: normalizeTextValue(source.payment_instructions || source.paymentInstructions),
  }
}

async function readPersistedReservationState(client, transactionId) {
  if (!transactionId) {
    return {
      supported: false,
      required: false,
      amount: null,
      status: 'not_required',
    }
  }

  let query = await client
    .from('transactions')
    .select('id, reservation_required, reservation_amount, reservation_status')
    .eq('id', transactionId)
    .maybeSingle()

  if (
    query.error &&
    (isMissingColumnError(query.error, 'reservation_amount') || isMissingColumnError(query.error, 'reservation_status'))
  ) {
    query = await client.from('transactions').select('id, reservation_required').eq('id', transactionId).maybeSingle()
  }

  if (query.error) {
    if (isMissingColumnError(query.error, 'reservation_required') || isMissingSchemaError(query.error)) {
      return {
        supported: false,
        required: false,
        amount: null,
        status: 'not_required',
      }
    }

    console.warn('Failed to read persisted reservation state', query.error)
    return {
      supported: false,
      required: false,
      amount: null,
      status: 'not_required',
    }
  }

  const row = query.data || null
  if (!row) {
    return {
      supported: false,
      required: false,
      amount: null,
      status: 'not_required',
    }
  }

  const required = Boolean(row.reservation_required)
  return {
    supported: true,
    required,
    amount: required ? normalizeOptionalNumber(row.reservation_amount) : null,
    status: normalizeReservationStatus(row.reservation_status, { required }),
  }
}

async function persistReservationStateIfPossible(
  client,
  {
    transactionId,
    required = false,
    amount = null,
    status = 'not_required',
    paymentDetails = {},
    amountType = 'fixed',
    treatment = 'credited_to_purchase_price',
    payableTo = 'developer',
    paidDate = null,
  } = {},
) {
  const normalizedRequired = Boolean(required)
  const normalizedAmount = normalizedRequired ? normalizeOptionalNumber(amount) : null
  const normalizedStatus = normalizeReservationStatus(status, {
    required: normalizedRequired,
  })
  const normalizedPaymentDetails = normalizedRequired ? normalizeReservationPaymentDetails(paymentDetails) : {}
  const normalizedAmountType = normalizedRequired ? normalizeReservationAmountType(amountType) : null
  const normalizedTreatment = normalizedRequired ? normalizeReservationTreatment(treatment) : null
  const normalizedPayableTo = normalizedRequired ? normalizeReservationPayableTo(payableTo) : null
  const normalizedPaidDate =
    normalizedRequired && ['paid', 'verified'].includes(normalizedStatus)
      ? normalizeTextValue(paidDate) || new Date().toISOString().slice(0, 10)
      : null

  const updatePayload = {
    reservation_required: normalizedRequired,
    reservation_amount: normalizedAmount,
    reservation_amount_type: normalizedAmountType,
    reservation_treatment: normalizedTreatment,
    reservation_payable_to: normalizedPayableTo,
    reservation_status: normalizedStatus,
    reservation_payment_details: normalizedPaymentDetails,
    reservation_paid_date: normalizedPaidDate,
  }

  let updateResult = await client.from('transactions').update(updatePayload).eq('id', transactionId)

  if (
    updateResult.error &&
    (isMissingColumnError(updateResult.error, 'reservation_required') ||
      isMissingColumnError(updateResult.error, 'reservation_amount') ||
      isMissingColumnError(updateResult.error, 'reservation_amount_type') ||
      isMissingColumnError(updateResult.error, 'reservation_treatment') ||
      isMissingColumnError(updateResult.error, 'reservation_payable_to') ||
      isMissingColumnError(updateResult.error, 'reservation_status') ||
      isMissingColumnError(updateResult.error, 'reservation_payment_details') ||
      isMissingColumnError(updateResult.error, 'reservation_paid_date'))
  ) {
    const fallbackPayload = { ...updatePayload }
    if (isMissingColumnError(updateResult.error, 'reservation_required')) {
      delete fallbackPayload.reservation_required
      delete fallbackPayload.reservation_amount
      delete fallbackPayload.reservation_amount_type
      delete fallbackPayload.reservation_treatment
      delete fallbackPayload.reservation_payable_to
      delete fallbackPayload.reservation_status
      delete fallbackPayload.reservation_payment_details
      delete fallbackPayload.reservation_paid_date
    } else {
      if (isMissingColumnError(updateResult.error, 'reservation_amount')) {
        delete fallbackPayload.reservation_amount
      }
      if (isMissingColumnError(updateResult.error, 'reservation_amount_type')) {
        delete fallbackPayload.reservation_amount_type
      }
      if (isMissingColumnError(updateResult.error, 'reservation_treatment')) {
        delete fallbackPayload.reservation_treatment
      }
      if (isMissingColumnError(updateResult.error, 'reservation_payable_to')) {
        delete fallbackPayload.reservation_payable_to
      }
      if (isMissingColumnError(updateResult.error, 'reservation_status')) {
        delete fallbackPayload.reservation_status
      }
      if (isMissingColumnError(updateResult.error, 'reservation_payment_details')) {
        delete fallbackPayload.reservation_payment_details
      }
      if (isMissingColumnError(updateResult.error, 'reservation_paid_date')) {
        delete fallbackPayload.reservation_paid_date
      }
    }

    if (Object.keys(fallbackPayload).length > 0) {
      updateResult = await client.from('transactions').update(fallbackPayload).eq('id', transactionId)
    } else {
      updateResult = { error: null }
    }
  }

  if (updateResult.error && !isMissingSchemaError(updateResult.error)) {
    console.warn('Reservation state sync failed after transaction creation', updateResult.error)
  }

  const persisted = await readPersistedReservationState(client, transactionId)
  if (persisted.supported) {
    return persisted
  }

  return {
    supported: false,
    required: false,
    amount: null,
    status: 'not_required',
  }
}

export function prepareFirmFirstAttorneyRoleplayer(selection = {}) {
  if (!FIRM_FIRST_ATTORNEY_ROLE_TYPES.has(selection?.roleType)) return selection
  const preferredAttorneyUserId = normalizeNullableUuid(selection.preferredAttorneyUserId || selection.userId)
  return {
    ...selection,
    firmFirstAllocation: true,
    preferredAttorneyUserId,
    userId: null,
    assignmentStatus: 'selected',
    activationTrigger: 'appointed_firm_staff_assignment',
    snapshot: {
      ...(selection.snapshot || {}),
      firmFirstAllocation: true,
      preferredAttorneyUserId,
      userId: null,
      assignmentStatus: 'selected',
      activationTrigger: 'appointed_firm_staff_assignment',
    },
  }
}

export function prepareFirmFirstTransferRoleplayer(selection = {}) {
  if (selection?.roleType !== 'transfer_attorney') return selection
  return prepareFirmFirstAttorneyRoleplayer(selection)
}

function normalizeTransactionRolePlayerInputs(rolePlayers = [], options = {}) {
  if (!Array.isArray(rolePlayers)) {
    return []
  }

  const relationshipProfile = resolveDeveloperTransactionRelationshipProfile({
    transactionType: options.transactionType || options.transaction_type,
    roleTypes: rolePlayers.map((item) => item?.roleType || item?.role_type || ''),
    hasExternalAgent: rolePlayers.some(
      (item) => normalizeDeveloperTransactionRoleType(item?.roleType || item?.role_type) === 'agent',
    ),
  })
  const allowedRoleTypes = new Set([
    'transfer_attorney',
    'bond_originator',
    'bond_attorney',
    'cancellation_attorney',
    ...(relationshipProfile.isDeveloperSale ? ['developer_contact', 'agent'] : ['agent']),
  ])
  const allowedSources = new Set([
    'agency_preferred',
    'buyer_appointed',
    'manual',
    'connected_partner',
    'development_default',
    'preferred_partner',
    'partner_prospect',
    'invited_partner',
    'transaction_direct',
    'seller_nomination',
  ])

  return rolePlayers
    .map((item) => {
      const roleType = normalizeDeveloperTransactionRoleType(item?.roleType || item?.role_type || '')
      if (!allowedRoleTypes.has(roleType)) {
        return null
      }

      const partner = item?.partner && typeof item.partner === 'object' ? item.partner : {}
      const normalizedSource = resolveTransactionRoleplayerSelectionSource(item, partner, {
        allowedSources,
        fallback: 'transaction_direct',
      })
      const partnerName = normalizeTextValue(
        partner.companyName ||
          partner.organisationName ||
          partner.partnerName ||
          partner.name ||
          item?.companyName ||
          item?.organisationName ||
          item?.partnerName ||
          '',
      )
      const contactPerson = normalizeNullableText(
        partner.contactPerson ||
          partner.contactName ||
          item?.contactPerson ||
          item?.contactName ||
          partner.name ||
          item?.name ||
          partnerName,
      )
      const email =
        normalizeNullableText(
          partner.email ||
            partner.emailAddress ||
            partner.email_address ||
            item?.email ||
            item?.emailAddress ||
            item?.email_address,
        )?.toLowerCase() || null
      const partnerOrganisationId = normalizeNullableUuid(
        item?.partnerOrganisationId ||
          item?.organisationId ||
          item?.organisation_id ||
          partner.partnerOrganisationId ||
          partner.organisationId ||
          partner.organisation_id,
      )
      const attorneyFirmId = normalizeNullableUuid(
        item?.attorneyFirmId ||
          item?.attorney_firm_id ||
          item?.firmId ||
          partner.attorneyFirmId ||
          partner.attorney_firm_id ||
          partner.firmId,
      )
      const userId = normalizeNullableUuid(item?.userId || item?.user_id || partner.userId || partner.user_id)
      const regionId = normalizeNullableUuid(item?.regionId || item?.region_id || partner.regionId || partner.region_id)
      const workspaceUnitId = normalizeNullableUuid(
        item?.workspaceUnitId || item?.workspace_unit_id || partner.workspaceUnitId || partner.workspace_unit_id,
      )
      const branchId = normalizeNullableUuid(item?.branchId || item?.branch_id || partner.branchId || partner.branch_id)
      const teamId = normalizeNullableUuid(item?.teamId || item?.team_id || partner.teamId || partner.team_id)
      const firmFirstAllocation = FIRM_FIRST_ATTORNEY_ROLE_TYPES.has(roleType) &&
        (item?.firmFirstAllocation === true || item?.firm_first_allocation === true)
      const preferredAttorneyUserId = normalizeNullableUuid(
        item?.preferredAttorneyUserId || item?.preferred_attorney_user_id || partner.preferredAttorneyUserId,
      )

      if (
        !partnerName &&
        !contactPerson &&
        !email &&
        !partnerOrganisationId &&
        !attorneyFirmId &&
        !userId &&
        normalizedSource !== 'agency_preferred'
      ) {
        return null
      }
      const roleplayerSnapshot = buildDeveloperTransactionRoleplayerSnapshot({ roleType }, relationshipProfile)

      const selection = {
        roleType,
        selectionSource: normalizedSource,
        preferredPartnerId: normalizeNullableUuid(item?.preferredPartnerId || partner.partnerId),
        partnerRelationshipId: normalizeNullableUuid(item?.partnerRelationshipId || partner.partnerRelationshipId),
        partnerConnectionId: normalizeNullableUuid(
          item?.partnerConnectionId || item?.connectionId || partner.partnerConnectionId || partner.connectionId,
        ),
        partnerOrganisationId,
        attorneyFirmId,
        userId,
        firmFirstAllocation,
        preferredAttorneyUserId,
        regionId,
        workspaceUnitId,
        branchId,
        teamId,
        partnerName: partnerName || null,
        contactPerson,
        email,
        phone: normalizeNullableText(
          partner.phone ||
            partner.phoneNumber ||
            partner.phone_number ||
            item?.phone ||
            item?.phoneNumber ||
            item?.phone_number,
        ),
        website: normalizeNullableText(partner.website),
        physicalAddress: normalizeNullableText(partner.physicalAddress),
        province: normalizeNullableText(partner.province),
        notes: normalizeNullableText(partner.notes),
        relationshipProfile: relationshipProfile.key,
        snapshot: {
          ...roleplayerSnapshot,
          roleType,
          selectionSource: normalizedSource,
          preferredPartnerId: normalizeNullableUuid(item?.preferredPartnerId || partner.partnerId),
          partnerRelationshipId: normalizeNullableUuid(item?.partnerRelationshipId || partner.partnerRelationshipId),
          partnerConnectionId: normalizeNullableUuid(
            item?.partnerConnectionId || item?.connectionId || partner.partnerConnectionId || partner.connectionId,
          ),
          partnerOrganisationId,
          attorneyFirmId,
          userId,
          firmFirstAllocation,
          preferredAttorneyUserId,
          regionId,
          workspaceUnitId,
          branchId,
          teamId,
          partner: {
            companyName: normalizeNullableText(partner.companyName),
            contactPerson,
            email,
            phone: normalizeNullableText(partner.phone),
            website: normalizeNullableText(partner.website),
            physicalAddress: normalizeNullableText(partner.physicalAddress),
            province: normalizeNullableText(partner.province),
            notes: normalizeNullableText(partner.notes),
            attorneyFirmId,
          },
        },
      }
      return firmFirstAllocation ? prepareFirmFirstAttorneyRoleplayer(selection) : selection
    })
    .filter(Boolean)
}

export function resolveTransactionRoleplayerSelectionSource(item = {}, partner = {}, options = {}) {
  const allowedSources =
    options.allowedSources ||
    new Set([
      'agency_preferred',
      'buyer_appointed',
      'manual',
      'connected_partner',
      'development_default',
      'preferred_partner',
      'partner_prospect',
      'invited_partner',
      'transaction_direct',
      'partner_routing_rule',
      'seller_mandate',
      'seller_nomination',
      'agent_reassignment',
    ])
  const explicitSource = normalizeTextValue(
    item.source ||
      item.selectionSource ||
      item.selection_source ||
      partner.source ||
      partner.selectionSource ||
      partner.selection_source ||
      '',
  ).toLowerCase()
  if (allowedSources.has(explicitSource)) return explicitSource

  const relationshipId = normalizeNullableUuid(
    item.partnerRelationshipId ||
      item.partner_relationship_id ||
      item.relationshipId ||
      item.relationship_id ||
      partner.partnerRelationshipId ||
      partner.partner_relationship_id ||
      partner.relationshipId ||
      partner.relationship_id,
  )
  if (relationshipId) return 'connected_partner'

  const prospectId = normalizeNullableUuid(
    item.partnerProspectId || item.partner_prospect_id || partner.partnerProspectId || partner.partner_prospect_id,
  )
  if (prospectId) return 'partner_prospect'

  return options.fallback || 'transaction_direct'
}

export async function insertRecordWithMissingColumnFallback(client, table, payload = {}, select = 'id') {
  let currentPayload = { ...(payload || {}) }
  let result = await client.from(table).insert(currentPayload).select(select).limit(1)
  let attempts = 0

  while (result.error && attempts < 24) {
    const missingKey = Object.keys(currentPayload).find((key) => isMissingColumnError(result.error, key))
    if (!missingKey) break
    delete currentPayload[missingKey]
    result = await client.from(table).insert(currentPayload).select(select).limit(1)
    attempts += 1
  }

  if (result.error) {
    if (isMissingTableError(result.error, table) || isPermissionDeniedError(result.error)) return null
    throw result.error
  }
  return result.data || null
}

export async function persistTransactionRolePlayersIfPossible(
  client,
  { transactionId, rolePlayers = [], actorProfile = null } = {},
) {
  if (!transactionId || !rolePlayers.length) {
    return []
  }

  const nowIso = new Date().toISOString()
  const profileIdByEmail = await resolveProfileIdsByEmail(client, rolePlayers.map((item) => item.email).filter(Boolean))

  for (const item of rolePlayers) {
    const isFirmFirstAttorneyAllocationForRoleplayer = isFirmFirstAttorneyAllocation(item)
    const resolvedUserId = isFirmFirstAttorneyAllocationForRoleplayer
      ? null
      : item.userId || (item.email ? profileIdByEmail[item.email] || null : null)
    const scope = resolveRoleplayerSelectionScope(item, resolvedUserId)
    const payload = {
      transaction_id: transactionId,
      role_type: item.roleType,
      selection_source: item.selectionSource,
      preferred_partner_id: item.preferredPartnerId || null,
      partner_relationship_id: item.partnerRelationshipId || null,
      ...(item.partnerConnectionId ? { partner_connection_id: item.partnerConnectionId } : {}),
      partner_organisation_id: scope.organisationId || item.partnerOrganisationId || null,
      organisation_id: item.partnerOrganisationId || null,
      workspace_unit_id: item.workspaceUnitId || null,
      branch_id: item.branchId || null,
      user_id: resolvedUserId,
      assigned_organisation_id: scope.organisationId,
      assigned_workspace_unit_id: scope.workspaceUnitId,
      assigned_branch_id: scope.branchId,
      assigned_region_id: scope.regionId,
      assigned_team_id: scope.teamId,
      assigned_user_id: resolvedUserId,
      scope_level: scope.scopeLevel,
      scope_metadata: {
        source: 'persist_transaction_role_players',
        relationshipProfile: item.relationshipProfile || item.snapshot?.relationshipProfile || null,
        roleType: item.roleType,
      },
      partner_name: item.partnerName || null,
      contact_person: item.contactPerson || null,
      email_address: item.email || null,
      phone_number: item.phone || null,
      website: item.website || null,
      physical_address: item.physicalAddress || null,
      province: item.province || null,
      notes: item.notes || null,
      status: isFirmFirstAttorneyAllocationForRoleplayer ? 'selected' : item.assignmentStatus === 'pending_assignment' ? 'pending' : 'active',
      assignment_status: isFirmFirstAttorneyAllocationForRoleplayer ? 'selected' : item.assignmentStatus || 'active',
      activation_trigger: isFirmFirstAttorneyAllocationForRoleplayer
        ? 'appointed_firm_staff_assignment'
        : item.assignmentStatus === 'pending_assignment'
          ? 'routing_queue'
          : 'immediate',
      activated_at: isFirmFirstAttorneyAllocationForRoleplayer ? null : nowIso,
      assigned_by: actorProfile?.userId || null,
      removed_at: null,
      snapshot_json: {
        ...(item.snapshot || {}),
        canonicalTransactionId: transactionId,
        roleplayerStatus: item.assignmentStatus || 'assigned',
        firmFirstAllocation: isFirmFirstAttorneyAllocationForRoleplayer,
        preferredAttorneyUserId: isFirmFirstAttorneyAllocationForRoleplayer ? item.preferredAttorneyUserId || null : null,
        userId: resolvedUserId,
        organisationId: scope.organisationId || item.partnerOrganisationId || null,
        partnerOrganisationId: scope.organisationId || item.partnerOrganisationId || null,
        workspaceUnitId: scope.workspaceUnitId || item.workspaceUnitId || null,
        branchId: scope.branchId || item.branchId || null,
        regionId: scope.regionId || item.regionId || null,
        teamId: scope.teamId || item.teamId || null,
      },
      updated_at: nowIso,
    }

    let existing = await client
      .from('transaction_role_players')
      .select('id')
      .eq('transaction_id', transactionId)
      .eq('role_type', item.roleType)
      .is('removed_at', null)
      .limit(1)

    if (existing.error && isMissingColumnError(existing.error, 'removed_at')) {
      existing = await client
        .from('transaction_role_players')
        .select('id')
        .eq('transaction_id', transactionId)
        .eq('role_type', item.roleType)
        .limit(1)
    }

    if (existing.error) {
      if (isMissingTableError(existing.error, 'transaction_role_players') || isPermissionDeniedError(existing.error))
        return rolePlayers
      throw existing.error
    }

    if (existing.data?.[0]?.id) {
      await updateRecordByIdWithMissingColumnFallback(
        client,
        'transaction_role_players',
        existing.data[0].id,
        payload,
        'id',
      )
      await recordUniversalRolePlayerAssignmentEvent(client, {
        transactionId,
        roleType: item.roleType,
        assignedUserId: resolvedUserId,
        organisationId: scope.organisationId || item.partnerOrganisationId || null,
        regionId: scope.regionId || item.regionId || null,
        branchId: scope.branchId || item.branchId || null,
        teamId: scope.teamId || item.teamId || null,
        sourceModule: 'transaction',
        sourceEvent: 'persist_transaction_role_players',
        assignmentSource: item.assignmentSource || item.selectionSource || 'transaction_direct',
        selectionSource: item.selectionSource || '',
        actorUserId: actorProfile?.userId || null,
        previousOwnerId: null,
        fallbackUsed: item.assignmentStatus === 'pending_assignment',
        assignmentStatus: item.assignmentStatus || 'active',
        metadata: {
          ...(item.snapshot || {}),
        },
      })
      continue
    }

    const insertPayload = {
      ...payload,
      created_at: nowIso,
    }
    await insertRecordWithMissingColumnFallback(client, 'transaction_role_players', insertPayload, 'id')
    await recordUniversalRolePlayerAssignmentEvent(client, {
      transactionId,
      roleType: item.roleType,
      assignedUserId: resolvedUserId,
      organisationId: scope.organisationId || item.partnerOrganisationId || null,
      regionId: scope.regionId || item.regionId || null,
      branchId: scope.branchId || item.branchId || null,
      teamId: scope.teamId || item.teamId || null,
      sourceModule: 'transaction',
      sourceEvent: 'persist_transaction_role_players',
      assignmentSource: item.assignmentSource || item.selectionSource || 'transaction_direct',
      selectionSource: item.selectionSource || '',
      actorUserId: actorProfile?.userId || null,
      previousOwnerId: null,
      fallbackUsed: item.assignmentStatus === 'pending_assignment',
      assignmentStatus: item.assignmentStatus || 'active',
      metadata: {
        ...(item.snapshot || {}),
      },
    })
  }

  return rolePlayers
}

function roleplayerParticipantShape(selection = {}) {
  if (selection.roleType === 'transfer_attorney') {
    return { roleType: 'attorney', legalRole: 'transfer' }
  }
  if (selection.roleType === 'bond_attorney') {
    return { roleType: 'attorney', legalRole: 'bond' }
  }
  if (selection.roleType === 'cancellation_attorney') {
    return { roleType: 'attorney', legalRole: 'cancellation' }
  }
  return { roleType: selection.roleType, legalRole: 'none' }
}

export function resolveRoleplayerSelectionScope(selection = {}, assignedUserId = null) {
  const organisationId = normalizeNullableUuid(selection.partnerOrganisationId || selection.organisationId)
  const regionId = normalizeNullableUuid(selection.regionId)
  const teamId = normalizeNullableUuid(selection.teamId)
  const workspaceUnitId = normalizeNullableUuid(selection.workspaceUnitId || selection.branchId)
  const branchId = normalizeNullableUuid(selection.branchId || selection.workspaceUnitId)
  const userId = normalizeNullableUuid(assignedUserId || selection.userId)
  const explicitAssignmentStatus = normalizeTextValue(selection.assignmentStatus || selection.assignment_status)
  const hasUnitScope = Boolean(teamId || workspaceUnitId || branchId)
  const scopeLevel =
    userId && !regionId && !hasUnitScope
      ? 'independent'
      : userId
        ? 'user'
        : teamId
          ? 'team'
          : workspaceUnitId || branchId
            ? 'branch'
            : regionId
              ? 'region'
              : organisationId
                ? 'organisation'
                : null
  const assignmentStatus = userId
    ? 'consultant_assigned'
    : teamId
      ? 'team_queue'
      : workspaceUnitId || branchId
        ? 'branch_queue'
        : regionId
          ? 'region_queue'
          : explicitAssignmentStatus || 'organisation_queue'

  return {
    organisationId,
    regionId,
    teamId,
    workspaceUnitId,
    branchId,
    userId,
    scopeLevel,
    assignmentStatus,
  }
}

async function ensureRoleplayerTransactionParticipant(
  client,
  { transactionId, selection, actorProfile, financeManagedBy = 'bond_originator' } = {},
) {
  const { roleType, legalRole } = roleplayerParticipantShape(selection)
  if (!transactionId || !roleType) return null

  const profileIdByEmail = selection?.email ? await resolveProfileIdsByEmail(client, [selection.email]) : {}
  const isFirmFirstAttorneyAllocationForRoleplayer = isFirmFirstAttorneyAllocation(selection)
  const resolvedUserId = isFirmFirstAttorneyAllocationForRoleplayer
    ? null
    : selection?.userId || (selection?.email ? profileIdByEmail[selection.email] || null : null)
  const scope = resolveRoleplayerSelectionScope(selection, resolvedUserId)
  const participantName = selection.partnerName || selection.contactPerson || null
  const participantEmail = selection.email || null
  const nowIso = new Date().toISOString()
  const payload = {
    transaction_id: transactionId,
    role_type: roleType,
    legal_role: roleType === 'attorney' ? legalRole : 'none',
    transaction_role: selection.roleType,
    status: isFirmFirstAttorneyAllocationForRoleplayer ? 'invited' : 'active',
    user_id: resolvedUserId,
    assigned_organisation_id: scope.organisationId,
    assigned_workspace_unit_id: scope.workspaceUnitId,
    assigned_branch_id: scope.branchId,
    assigned_region_id: scope.regionId,
    assigned_team_id: scope.teamId,
    assigned_user_id: resolvedUserId,
    scope_level: scope.scopeLevel,
    scope_metadata: {
      source: 'transaction_roleplayer_participant',
      canonicalRoleType: selection.roleType,
    },
    participant_name: participantName,
    participant_email: participantEmail,
    invited_by_user_id: actorProfile?.userId || null,
    invited_at: nowIso,
    accepted_at: isFirmFirstAttorneyAllocationForRoleplayer ? null : nowIso,
    removed_at: null,
    visibility_scope: 'shared',
    is_internal: isInternalStakeholderRole(roleType),
    participant_scope: 'transaction',
    assignment_source: normalizeTransactionParticipantAssignmentSource(
      isFirmFirstAttorneyAllocationForRoleplayer ? 'agent_firm_nomination' : 'transaction_direct',
    ),
    ...buildStakeholderPermissionPayload(roleType, financeManagedBy),
  }

  const rowSelect =
    'id, transaction_id, user_id, role_type, legal_role, status, participant_name, participant_email, can_view, can_comment, can_upload_documents, can_edit_finance_workflow, can_edit_attorney_workflow, can_edit_core_transaction, created_at, updated_at'
  let upsertResult = await upsertTransactionParticipantsRowsWithFallback(client, {
    rows: [payload],
    onConflict: 'transaction_id,role_type,legal_role',
    rowSelect,
    matchOnLegalRole: true,
  })

  if (
    upsertResult.error &&
    (isMissingColumnError(upsertResult.error, 'legal_role') ||
      isMissingColumnError(upsertResult.error, 'transaction_role') ||
      isMissingColumnError(upsertResult.error, 'status') ||
      isMissingColumnError(upsertResult.error, 'invited_by_user_id') ||
      isMissingColumnError(upsertResult.error, 'invited_at') ||
      isMissingColumnError(upsertResult.error, 'accepted_at') ||
      isMissingColumnError(upsertResult.error, 'removed_at') ||
      isMissingColumnError(upsertResult.error, 'assigned_organisation_id') ||
      isMissingColumnError(upsertResult.error, 'assigned_workspace_unit_id') ||
      isMissingColumnError(upsertResult.error, 'assigned_branch_id') ||
      isMissingColumnError(upsertResult.error, 'assigned_region_id') ||
      isMissingColumnError(upsertResult.error, 'assigned_team_id') ||
      isMissingColumnError(upsertResult.error, 'assigned_user_id') ||
      isMissingColumnError(upsertResult.error, 'scope_level') ||
      isMissingColumnError(upsertResult.error, 'scope_metadata') ||
      isMissingColumnError(upsertResult.error, 'visibility_scope') ||
      isMissingColumnError(upsertResult.error, 'is_internal') ||
      isMissingColumnError(upsertResult.error, 'participant_scope') ||
      isMissingColumnError(upsertResult.error, 'assignment_source') ||
      isMissingColumnError(upsertResult.error, 'can_edit_core_transaction'))
  ) {
    const fallbackPayload = { ...payload }
    for (const key of Object.keys(fallbackPayload)) {
      if (isMissingColumnError(upsertResult.error, key)) delete fallbackPayload[key]
    }
    upsertResult = await upsertTransactionParticipantsRowsWithFallback(client, {
      rows: [fallbackPayload],
      onConflict: fallbackPayload.legal_role ? 'transaction_id,role_type,legal_role' : 'transaction_id,role_type',
      rowSelect: fallbackPayload.legal_role
        ? 'id, transaction_id, user_id, role_type, legal_role, participant_name, participant_email, can_view, can_comment, can_upload_documents, can_edit_finance_workflow, can_edit_attorney_workflow, created_at, updated_at'
        : 'id, transaction_id, user_id, role_type, participant_name, participant_email, can_view, can_comment, can_upload_documents, can_edit_finance_workflow, can_edit_attorney_workflow, created_at, updated_at',
      matchOnLegalRole: Boolean(fallbackPayload.legal_role),
    })
  }

  if (upsertResult.error) {
    if (
      isMissingTableError(upsertResult.error, 'transaction_participants') ||
      isMissingSchemaError(upsertResult.error) ||
      isPermissionDeniedError(upsertResult.error)
    )
      return null
    throw upsertResult.error
  }

  await recordUniversalRolePlayerAssignmentEvent(client, {
    transactionId,
    roleType: selection.roleType,
    assignedUserId: resolvedUserId,
    sourceModule: 'transaction',
    sourceEvent: 'ensure_roleplayer_participant_for_onboarding',
    assignmentSource: 'transaction_direct',
    selectionSource: 'transaction_direct',
    actorUserId: actorProfile?.userId || null,
    assignmentStatus: scope.assignmentStatus || 'active',
    metadata: {
      participantName,
      participantEmail,
      legalRole: roleType === 'attorney' ? normalizeAttorneyLegalRole(legalRole, 'transfer') : 'none',
      visibilityScope: 'shared',
    },
  })
  return Array.isArray(upsertResult.data) ? upsertResult.data[0] || null : upsertResult.data || null
}

function attorneyAssignmentTypeForRoleplayer(roleType = '') {
  if (roleType === 'cancellation_attorney') return 'cancellation'
  if (roleType === 'bond_attorney') return 'bond'
  return 'transfer'
}

export async function resolveAttorneyFirmIdForCreationRoleplayer(client, selection = {}, transactionId = null) {
  const attorneyFirmId = normalizeNullableUuid(
    selection.attorneyFirmId || selection.attorney_firm_id || selection.firmId,
  )
  const organisationId = normalizeNullableUuid(selection.partnerOrganisationId || selection.organisationId)

  if (transactionId) {
    const rpcResult = await client.rpc('bridge_resolve_attorney_firm_for_transaction', {
      p_transaction_id: transactionId,
      p_attorney_firm_id: attorneyFirmId,
      p_partner_organisation_id: organisationId,
      p_partner_name: normalizeTextValue(selection.partnerName) || null,
      p_partner_email: normalizeEmailAddress(selection.email) || null,
    })
    if (!rpcResult.error) {
      const resolvedFirmId = normalizeNullableUuid(rpcResult.data?.firm_id || rpcResult.data)
      if (resolvedFirmId) return resolvedFirmId
    } else if (!isMissingFunctionError(rpcResult.error, 'bridge_resolve_attorney_firm_for_transaction')) {
      const resolutionError = new Error(
        rpcResult.error.message || 'The selected attorney firm could not be linked to its attorney workspace.',
      )
      resolutionError.code = 'ATTORNEY_FIRM_RESOLUTION_FAILED'
      resolutionError.setupArea = 'attorney_assignment'
      throw resolutionError
    }
  }

  if (attorneyFirmId) {
    const byId = await client
      .from('attorney_firms')
      .select('id')
      .eq('id', attorneyFirmId)
      .eq('is_active', true)
      .limit(1)
    if (
      byId.error &&
      !isMissingTableError(byId.error, 'attorney_firms') &&
      !isPermissionDeniedError(byId.error)
    ) {
      throw byId.error
    }
    if (byId.data?.[0]?.id) return byId.data[0].id
  }

  if (organisationId) {
    let query = await client
      .from('attorney_firms')
      .select('id, organisation_id')
      .eq('organisation_id', organisationId)
      .eq('is_active', true)
      .limit(1)
    if (query.error && isMissingColumnError(query.error, 'organisation_id')) {
      query = { data: [], error: null }
    }
    if (query.error && !isMissingTableError(query.error, 'attorney_firms') && !isPermissionDeniedError(query.error)) {
      throw query.error
    }
    if (query.data?.[0]?.id) return query.data[0].id
  }

  const email = normalizeEmailAddress(selection.email)
  if (email) {
    const byEmail = await client
      .from('attorney_firms')
      .select('id, email')
      .eq('email', email)
      .eq('is_active', true)
      .limit(1)
    if (
      byEmail.error &&
      !isMissingTableError(byEmail.error, 'attorney_firms') &&
      !isMissingColumnError(byEmail.error, 'email') &&
      !isPermissionDeniedError(byEmail.error)
    ) {
      throw byEmail.error
    }
    if (byEmail.data?.[0]?.id) return byEmail.data[0].id
  }

  const name = normalizeTextValue(selection.partnerName)
  if (name) {
    const byName = await client
      .from('attorney_firms')
      .select('id, name')
      .eq('name', name)
      .eq('is_active', true)
      .limit(1)
    if (
      byName.error &&
      !isMissingTableError(byName.error, 'attorney_firms') &&
      !isMissingColumnError(byName.error, 'name') &&
      !isPermissionDeniedError(byName.error)
    ) {
      throw byName.error
    }
    if (byName.data?.[0]?.id) return byName.data[0].id
  }

  return null
}

function isAttorneyFirmMemberPrimaryEligibleForLane(member = {}, laneKey = 'transfer') {
  const profile = deriveAttorneyProfessionalProfile({
    role: member.role,
    professionalRole: member.professional_role,
    practiceQualifications: member.practice_qualifications,
  })
  if (['firm_admin', 'director_partner'].includes(profile.professionalRole)) return true
  return profile.professionalRole === 'attorney_conveyancer' &&
    profile.practiceQualifications.includes(laneKey)
}

async function resolveAttorneyFirmPrimaryUserId(client, { firmId, selection }) {
  if (selection?.userId) return selection.userId
  const profileIdByEmail = selection?.email ? await resolveProfileIdsByEmail(client, [selection.email]) : {}
  const userIdFromEmail = selection?.email ? profileIdByEmail[selection.email] || null : null
  if (userIdFromEmail) return userIdFromEmail
  if (!firmId) return null

  let memberQuery = await client
    .from('attorney_firm_members')
    .select('user_id, role, professional_role, practice_qualifications, status')
    .eq('firm_id', firmId)
    .eq('status', 'active')
    .limit(100)

  if (
    memberQuery.error &&
    (isMissingColumnError(memberQuery.error, 'professional_role') ||
      isMissingColumnError(memberQuery.error, 'practice_qualifications'))
  ) {
    memberQuery = await client
      .from('attorney_firm_members')
      .select('user_id, role, status')
      .eq('firm_id', firmId)
      .eq('status', 'active')
      .limit(100)
  }

  if (
    memberQuery.error &&
    !isMissingTableError(memberQuery.error, 'attorney_firm_members') &&
    !isPermissionDeniedError(memberQuery.error)
  ) {
    throw memberQuery.error
  }
  const laneKey = attorneyAssignmentTypeForRoleplayer(selection?.roleType)
  const activeMembers = memberQuery.data || []
  const laneQualifiedMember = activeMembers.find((member) => {
    const profile = deriveAttorneyProfessionalProfile({
      role: member.role,
      professionalRole: member.professional_role,
      practiceQualifications: member.practice_qualifications,
    })
    return profile.professionalRole === 'attorney_conveyancer' && profile.practiceQualifications.includes(laneKey)
  })
  const eligibleMember = laneQualifiedMember || activeMembers.find(
    (member) => isAttorneyFirmMemberPrimaryEligibleForLane(member, laneKey),
  )
  return eligibleMember?.user_id || null
}

export function buildCreationAttorneyAssignmentPayload({
  transactionId,
  selection,
  actorProfile,
  firmId,
  attorneyUserId = null,
  scope = {},
  nowIso = new Date().toISOString(),
} = {}) {
  const assignmentType = attorneyAssignmentTypeForRoleplayer(selection?.roleType)
  const attorneyRole = selection?.roleType
  const isFirmFirstAttorneyAllocationForRoleplayer = isFirmFirstAttorneyAllocation(selection)
  const operationalAttorneyUserId = isFirmFirstAttorneyAllocationForRoleplayer ? null : attorneyUserId

  return {
    transaction_id: transactionId,
    firm_id: firmId,
    attorney_firm_id: firmId,
    assignment_type: assignmentType,
    attorney_role: attorneyRole,
    matter_type: assignmentType,
    instruction_status: 'new_instruction',
    assigned_organisation_id: scope.organisationId,
    assigned_workspace_unit_id: scope.workspaceUnitId,
    assigned_branch_id: scope.branchId,
    assigned_region_id: scope.regionId,
    assigned_team_id: scope.teamId,
    assigned_user_id: operationalAttorneyUserId,
    scope_level: isFirmFirstAttorneyAllocationForRoleplayer ? 'organisation' : operationalAttorneyUserId ? 'user' : scope.scopeLevel,
    scope_metadata: {
      source: isFirmFirstAttorneyAllocationForRoleplayer ? 'agent_firm_nomination' : 'transaction_roleplayer_propagation',
      roleType: selection?.roleType,
      firmFirstAllocation: isFirmFirstAttorneyAllocationForRoleplayer,
    },
    primary_attorney_id: operationalAttorneyUserId,
    attorney_user_id: operationalAttorneyUserId,
    preferred_attorney_user_id: isFirmFirstAttorneyAllocationForRoleplayer ? selection?.preferredAttorneyUserId || null : null,
    preferred_contact_name: isFirmFirstAttorneyAllocationForRoleplayer ? selection?.contactPerson || null : null,
    preferred_contact_email: isFirmFirstAttorneyAllocationForRoleplayer ? selection?.email || null : null,
    preferred_contact_phone: isFirmFirstAttorneyAllocationForRoleplayer ? selection?.phone || null : null,
    appointment_source: isFirmFirstAttorneyAllocationForRoleplayer ? selection?.selectionSource || 'agent_nomination' : 'legacy_assignment',
    replaces_assignment_id: isFirmFirstAttorneyAllocationForRoleplayer ? selection?.snapshot?.previousAssignmentId || null : null,
    replacement_reason: isFirmFirstAttorneyAllocationForRoleplayer ? selection?.snapshot?.replacementReason || null : null,
    firm_acceptance_status: isFirmFirstAttorneyAllocationForRoleplayer ? 'awaiting_firm_acceptance' : 'accepted',
    firm_accepted_by: isFirmFirstAttorneyAllocationForRoleplayer ? null : actorProfile?.userId || null,
    firm_accepted_at: isFirmFirstAttorneyAllocationForRoleplayer ? null : nowIso,
    staff_assignment_status: operationalAttorneyUserId ? 'staff_assigned' : 'awaiting_staff_assignment',
    allocation_state: isFirmFirstAttorneyAllocationForRoleplayer
      ? 'awaiting_firm_acceptance'
      : operationalAttorneyUserId
        ? 'active'
        : 'awaiting_staff_assignment',
    status: isFirmFirstAttorneyAllocationForRoleplayer ? 'pending' : 'active',
    assignment_status: isFirmFirstAttorneyAllocationForRoleplayer ? 'pending' : 'active',
    is_primary: true,
    visibility_scope: isFirmFirstAttorneyAllocationForRoleplayer ? 'firm_matter' : 'assigned_matter',
    can_edit: true,
    can_manage_documents: true,
    can_manage_signing: true,
    can_add_internal_notes: true,
    can_add_shared_updates: true,
    can_update_workflow_lane: true,
    assigned_by: actorProfile?.userId || null,
    assigned_at: nowIso,
    updated_at: nowIso,
  }
}

async function ensureAttorneyMatterAssignment(client, { transactionId, selection, actorProfile }) {
  if (!['transfer_attorney', 'bond_attorney', 'cancellation_attorney'].includes(selection?.roleType)) return null

  const firmId = await resolveAttorneyFirmIdForCreationRoleplayer(client, selection, transactionId)
  if (!firmId) {
    const resolutionError = new Error(
      `${selection?.partnerName || 'The selected attorney firm'} is not linked to an active attorney workspace. The attorney matter assignment was not created.`,
    )
    resolutionError.code = 'ATTORNEY_FIRM_RESOLUTION_FAILED'
    resolutionError.setupArea = 'attorney_assignment'
    throw resolutionError
  }

  const assignmentType = attorneyAssignmentTypeForRoleplayer(selection.roleType)
  const attorneyRole = selection.roleType
  const isFirmFirstAttorneyAllocationForRoleplayer = isFirmFirstAttorneyAllocation(selection)
  const attorneyUserId = isFirmFirstAttorneyAllocationForRoleplayer
    ? null
    : await resolveAttorneyFirmPrimaryUserId(client, { firmId, selection })
  const scope = resolveRoleplayerSelectionScope(selection, attorneyUserId)
  const nowIso = new Date().toISOString()

  let existingQuery = await client
    .from('transaction_attorney_assignments')
    .select('id')
    .eq('transaction_id', transactionId)
    .eq('attorney_role', attorneyRole)
    .in('allocation_state', ['awaiting_firm_acceptance', 'awaiting_staff_assignment', 'staff_assigned', 'active'])
    .limit(1)

  if (
    existingQuery.error &&
    (isMissingColumnError(existingQuery.error, 'attorney_role') ||
      isMissingColumnError(existingQuery.error, 'assignment_status') ||
      isMissingColumnError(existingQuery.error, 'allocation_state'))
  ) {
    existingQuery = await client
      .from('transaction_attorney_assignments')
      .select('id')
      .eq('transaction_id', transactionId)
      .eq('assignment_type', assignmentType)
      .eq('status', 'active')
      .limit(1)
  }

  if (existingQuery.error) {
    if (
      isMissingTableError(existingQuery.error, 'transaction_attorney_assignments') ||
      isPermissionDeniedError(existingQuery.error)
    ) {
      const persistenceError = new Error(
        existingQuery.error.message || 'The attorney matter assignment store is unavailable.',
      )
      persistenceError.code = 'ATTORNEY_ASSIGNMENT_PERSISTENCE_FAILED'
      persistenceError.setupArea = 'attorney_assignment'
      throw persistenceError
    }
    throw existingQuery.error
  }

  const payload = buildCreationAttorneyAssignmentPayload({
    transactionId,
    selection,
    actorProfile,
    firmId,
    attorneyUserId,
    scope,
    nowIso,
  })

  if (existingQuery.data?.[0]?.id) {
    const updated = await updateRecordByIdWithMissingColumnFallback(
      client,
      'transaction_attorney_assignments',
      existingQuery.data[0].id,
      payload,
      'id',
    )
    const assignment = updated?.[0] || null
    if (!assignment) {
      const persistenceError = new Error('The attorney matter assignment could not be updated.')
      persistenceError.code = 'ATTORNEY_ASSIGNMENT_PERSISTENCE_FAILED'
      persistenceError.setupArea = 'attorney_assignment'
      throw persistenceError
    }
    return assignment
  }

  const inserted = await insertRecordWithMissingColumnFallback(
    client,
    'transaction_attorney_assignments',
    {
      ...payload,
      created_at: nowIso,
    },
    'id',
  )
  const assignment = inserted?.[0] || null
  if (!assignment) {
    const persistenceError = new Error('The attorney matter assignment could not be created.')
    persistenceError.code = 'ATTORNEY_ASSIGNMENT_PERSISTENCE_FAILED'
    persistenceError.setupArea = 'attorney_assignment'
    throw persistenceError
  }
  return assignment
}

export async function ensureBondApplicationWorkspaceRecord(client, { transactionId, buyerId, selection, actorProfile, preserveWorkflowState = false }) {
  if (selection?.roleType !== 'bond_originator') return null

  const workflow = await fetchRawBondHybridWorkflow(client, transactionId, {
    createIfMissing: true,
  })
  if (!workflow?.id) return null

  let existingQuery = await client
    .from('transaction_bond_applications')
    .select('id')
    .eq('transaction_id', transactionId)
    .eq('workflow_id', workflow.id)
    .eq('bank_name', 'Bond Originator Intake')
    .limit(1)

  if (existingQuery.error && isMissingColumnError(existingQuery.error, 'bank_name')) {
    existingQuery = await client
      .from('transaction_bond_applications')
      .select('id')
      .eq('transaction_id', transactionId)
      .eq('workflow_id', workflow.id)
      .limit(1)
  }

  if (existingQuery.error) {
    if (
      isMissingTableError(existingQuery.error, 'transaction_bond_applications') ||
      isMissingSchemaError(existingQuery.error) ||
      isPermissionDeniedError(existingQuery.error)
    )
      return null
    throw existingQuery.error
  }

  const profileIdByEmail =
    !selection?.userId && selection?.email ? await resolveProfileIdsByEmail(client, [selection.email]) : {}
  const resolvedUserId = selection?.userId || (selection?.email ? profileIdByEmail[selection.email] || null : null)
  const nowIso = new Date().toISOString()
  const scope = resolveRoleplayerSelectionScope(selection, resolvedUserId)
  if (scope.organisationId && !existingQuery.data?.[0]?.id) {
    await assertWorkspaceEntitlementLimit({
      workspaceId: scope.organisationId,
      workspaceType: WORKSPACE_TYPES.bondOriginator,
      workspaceKind: selection.workspaceKind || selection.workspace_kind,
      entitlementKey: ENTITLEMENT_KEYS.monthlyBondApplications,
    })
  }
  const payload = {
    transaction_id: transactionId,
    workflow_id: workflow.id,
    buyer_party_id: buyerId || null,
    application_type: 'originator_intake',
    assigned_organisation_id: scope.organisationId,
    assigned_region_id: scope.regionId,
    assigned_workspace_unit_id: scope.workspaceUnitId,
    assigned_branch_id: scope.branchId,
    assigned_team_id: scope.teamId,
    assigned_user_id: scope.userId,
    scope_level: scope.scopeLevel,
    scope_metadata: {
      source: 'transaction_roleplayer_propagation',
      roleType: selection.roleType,
    },
    assignment_status: scope.assignmentStatus,
    assignment_source: 'transaction_roleplayer_propagation',
    bank_name: 'Bond Originator Intake',
    status: 'pending',
    notes: 'New bond application workspace created from transaction roleplayer assignment.',
    created_by: actorProfile?.userId || null,
    updated_by: actorProfile?.userId || null,
    metadata: {
      source: 'transaction_roleplayer_propagation',
      canonicalStatus: 'new_application',
      buyerPartyId: buyerId || null,
      assignedOrganisationId: scope.organisationId,
      assignedRegionId: scope.regionId,
      assignedWorkspaceUnitId: scope.workspaceUnitId,
      assignedBranchId: scope.branchId,
      assignedTeamId: scope.teamId,
      assignedUserId: scope.userId,
    },
    updated_at: nowIso,
  }

  if (existingQuery.data?.[0]?.id) {
    if (preserveWorkflowState) {
      delete payload.status
      delete payload.notes
      delete payload.metadata
    }
    const updated = await updateRecordByIdWithMissingColumnFallback(
      client,
      'transaction_bond_applications',
      existingQuery.data[0].id,
      payload,
      'id, transaction_id, workflow_id, bank_name, status, updated_at',
    )
    return updated?.[0] || null
  }

  const inserted = await insertRecordWithMissingColumnFallback(
    client,
    'transaction_bond_applications',
    {
      ...payload,
      created_at: nowIso,
    },
    'id, transaction_id, workflow_id, bank_name, status, created_at, updated_at',
  )
  return inserted?.[0] || null
}

export async function propagateTransactionRoleplayersIfPossible(
  client,
  {
    transactionId,
    transaction,
    rolePlayers = [],
    actorProfile = null,
    actorRole = null,
    buyerId = null,
    financeType = 'cash',
    preserveWorkflowState = false,
  } = {},
) {
  if (!transactionId || !rolePlayers.length) return { participants: [], attorneyAssignments: [], bondApplications: [] }

  const normalizedFinanceType = normalizeFinanceType(financeType || transaction?.finance_type || 'cash', {
    allowUnknown: true,
  })
  const bondFinanceRequired = isBondFinanceType(normalizedFinanceType)
  const results = {
    participants: [],
    attorneyAssignments: [],
    bondApplications: [],
  }

  for (const selection of rolePlayers) {
    const participant = await ensureRoleplayerTransactionParticipant(client, {
      transactionId,
      selection,
      actorProfile,
      financeManagedBy: transaction?.finance_managed_by || 'bond_originator',
    })
    if (participant) results.participants.push(participant)

    if (
      ['transfer_attorney', 'bond_attorney', 'cancellation_attorney'].includes(selection.roleType) &&
      (shouldCreateAttorneyAssignmentForSelection(selection) || isFirmFirstAttorneyAllocation(selection))
    ) {
      const assignment = await ensureAttorneyMatterAssignment(client, {
        transactionId,
        selection,
        actorProfile,
      })
      if (assignment) {
        results.attorneyAssignments.push(assignment)
        await logTransactionEventIfPossible(client, {
          transactionId,
          eventType: 'attorney_assignment_created',
          createdBy: actorProfile?.userId || null,
          createdByRole: actorRole || actorProfile?.role || null,
          eventData: {
            source: 'transaction_roleplayer_propagation',
            roleType: selection.roleType,
            assignmentId: assignment.id || null,
            canonicalRecord: 'transaction_attorney_assignments',
            canonicalTransactionId: transactionId,
          },
        })
      }
    }

    if (selection.roleType === 'bond_originator' && bondFinanceRequired) {
      const application = await ensureBondApplicationWorkspaceRecord(client, {
        transactionId,
        buyerId,
        selection,
        actorProfile,
        preserveWorkflowState,
      })
      if (application) {
        results.bondApplications.push(application)
        await logTransactionEventIfPossible(client, {
          transactionId,
          eventType: 'bond_application_created',
          createdBy: actorProfile?.userId || null,
          createdByRole: actorRole || actorProfile?.role || null,
          eventData: {
            source: 'transaction_roleplayer_propagation',
            roleType: 'bond_originator',
            applicationId: application.id || null,
            canonicalRecord: 'transaction_bond_applications',
            canonicalStatus: 'new_application',
            canonicalTransactionId: transactionId,
          },
        })
      }
    }

    await logTransactionEventIfPossible(client, {
      transactionId,
      eventType:
        isFirmFirstAttorneyAllocation(selection)
          ? 'attorney_firm_nominated'
          : selection.roleType === 'bond_originator'
          ? 'bond_originator_assigned'
          : selection.roleType === 'cancellation_attorney'
            ? 'cancellation_attorney_assigned'
            : selection.roleType === 'transfer_attorney'
              ? 'transfer_attorney_assigned'
              : 'roleplayer_visibility_granted',
      createdBy: actorProfile?.userId || null,
      createdByRole: actorRole || actorProfile?.role || null,
      eventData: {
        source: 'transaction_roleplayer_propagation',
        roleType: selection.roleType,
        partnerName: selection.partnerName || null,
        partnerOrganisationId: selection.partnerOrganisationId || null,
        userId: isFirmFirstAttorneyAllocation(selection) ? null : selection.userId || null,
        preferredAttorneyUserId: selection.preferredAttorneyUserId || null,
        allocationState: isFirmFirstAttorneyAllocation(selection) ? 'awaiting_firm_acceptance' : null,
        visibilityGranted: true,
        canonicalTransactionId: transactionId,
      },
    })
    await logTransactionEventIfPossible(client, {
      transactionId,
      eventType: 'roleplayer_visibility_granted',
      createdBy: actorProfile?.userId || null,
      createdByRole: actorRole || actorProfile?.role || null,
      eventData: {
        source: 'transaction_roleplayer_propagation',
        roleType: selection.roleType,
        partnerName: selection.partnerName || null,
        partnerOrganisationId: selection.partnerOrganisationId || null,
        userId: isFirmFirstAttorneyAllocation(selection) ? null : selection.userId || null,
        preferredAttorneyUserId: selection.preferredAttorneyUserId || null,
        allocationState: isFirmFirstAttorneyAllocation(selection) ? 'awaiting_firm_acceptance' : null,
        visibilityGranted: true,
        canonicalTransactionId: transactionId,
      },
    })
  }

  return results
}

function resolveUniversalAssignmentMethodFromSource(source = '') {
  const normalized = normalizeTextValue(source).toLowerCase()
  if (normalized.includes('routing')) return UNIVERSAL_ASSIGNMENT_METHODS.partnerRouting
  if (normalized.includes('queue')) return UNIVERSAL_ASSIGNMENT_METHODS.queueAllocation
  if (normalized.includes('workflow')) return UNIVERSAL_ASSIGNMENT_METHODS.workflowGenerated
  if (normalized.includes('bulk')) return UNIVERSAL_ASSIGNMENT_METHODS.bulkAssignment
  if (normalized.includes('manager')) return UNIVERSAL_ASSIGNMENT_METHODS.managerAssignment
  if (normalized.includes('system')) return UNIVERSAL_ASSIGNMENT_METHODS.systemGenerated
  return UNIVERSAL_ASSIGNMENT_METHODS.manual
}

export async function recordUniversalRolePlayerAssignmentEvent(
  client,
  {
    transactionId,
    roleType,
    assignedUserId = null,
    organisationId = null,
    regionId = null,
    branchId = null,
    teamId = null,
    sourceModule = 'transaction',
    sourceEvent = 'roleplayer_assignment',
    assignmentSource = '',
    selectionSource = '',
    actorUserId = null,
    previousOwnerId = null,
    fallbackUsed = false,
    assignmentStatus = '',
    metadata = {},
  } = {},
) {
  try {
    await recordUniversalAssignmentEvent('assignment.created', {
      itemType: 'transaction_role_player',
      itemId: `${normalizeTextValue(transactionId)}:${normalizeTextValue(roleType)}`,
      transactionId,
      organisationId,
      regionId,
      branchId,
      teamId,
      assignedUserId,
      previousOwnerId,
      assignmentMethod: resolveUniversalAssignmentMethodFromSource(assignmentSource || selectionSource),
      sourceModule,
      sourceEvent,
      fallbackUsed,
      assignmentStatus,
      reason: assignmentSource || selectionSource || 'transaction role player assignment',
      actorUserId,
      metadata: {
        ...metadata,
        roleType,
        assignmentSource,
        selectionSource,
      },
    })
  } catch (error) {
    console.warn('[api] universal roleplayer assignment event skipped', error)
  }
}

function normalizeWizardBuyerParty(party = {}, index = 0, fallbackPurchaserType = 'individual') {
  const role = normalizeTextValue(party.role || party.partyRole || party.party_role || (index === 0 ? 'primary_purchaser' : 'co_purchaser')) || 'co_purchaser'
  const purchaserType = normalizePurchaserType(party.purchaserType || party.purchaser_type || fallbackPurchaserType)
  const firstName = normalizeNullableText(party.firstName || party.first_name)
  const lastName = normalizeNullableText(party.lastName || party.last_name)
  const fullName =
    normalizeNullableText(party.name || party.fullName || party.full_name) ||
    [firstName, lastName].filter(Boolean).join(' ') ||
    null
  const email = normalizeNullableText(party.email)?.toLowerCase() || null
  const phone = normalizeNullableText(party.phone || party.mobile)
  const identityNumber = normalizeNullableText(
    party.identityNumber ||
      party.identity_number ||
      party.registrationNumber ||
      party.registration_number ||
      party.passportNumber ||
      party.passport_number,
  )
  const isPrimary = party.primary === true || party.isPrimary === true || party.is_primary === true || role === 'primary_purchaser'
  const buyerId = normalizeNullableUuid(party.buyerId || party.buyer_id || party.buyerProfileId || party.buyer_profile_id)
  const ownershipPercentage = normalizeOptionalNumber(party.ownershipPercentage || party.ownership_percentage)

  if (![fullName, email, phone, identityNumber, buyerId].some(Boolean)) {
    return null
  }

  return {
    id: normalizeNullableText(party.id) || `buyer-party-${index + 1}`,
    maritalStatus: normalizeNullableText(party.maritalStatus || party.marital_status),
    marital_status: normalizeNullableText(party.maritalStatus || party.marital_status),
    maritalRegime: normalizeNullableText(party.maritalRegime || party.marital_regime),
    marital_regime: normalizeNullableText(party.maritalRegime || party.marital_regime),
    spouseOfId: normalizeNullableText(party.spouseOfId),
    isOwner: party.isOwner === true,
    primaryContact: party.primaryContact === true,
    role,
    party_role: role,
    purchaserType,
    purchaser_type: purchaserType,
    name: fullName,
    fullName,
    full_name: fullName,
    firstName,
    first_name: firstName,
    lastName,
    last_name: lastName,
    email,
    phone,
    identityNumber,
    identity_number: identityNumber,
    buyerId,
    buyer_id: buyerId,
    ownershipPercentage: ownershipPercentage !== null && ownershipPercentage >= 0 && ownershipPercentage <= 100 ? ownershipPercentage : null,
    ownership_percentage: ownershipPercentage !== null && ownershipPercentage >= 0 && ownershipPercentage <= 100 ? ownershipPercentage : null,
    signatory: party.signatory !== false,
    isPrimary,
    is_primary: isPrimary,
  }
}

function resolveWizardBuyerParties(setup = {}, purchaserType = 'individual') {
  const explicitParties = Array.isArray(setup.buyerParties || setup.buyer_parties)
    ? setup.buyerParties || setup.buyer_parties
    : []
  const parties = explicitParties
    .map((party, index) => normalizeWizardBuyerParty(party, index, purchaserType))
    .filter(Boolean)

  const hasPrimaryParty = parties.some((party) => party.isPrimary || party.role === 'primary_purchaser')
  if (!hasPrimaryParty) {
    const primary = normalizeWizardBuyerParty(
      {
        role: 'primary_purchaser',
        purchaserType,
        name: setup.buyerName,
        firstName: setup.buyerFirstName,
        lastName: setup.buyerLastName,
        email: setup.buyerEmail,
        phone: setup.buyerPhone,
        buyerProfileId: setup.buyerProfileId || setup.buyer_profile_id,
        signatory: true,
        primary: true,
      },
      0,
      purchaserType,
    )
    if (primary) {
      parties.unshift(primary)
    }
  }

  return parties.map((party, index) => ({
    ...party,
    sequence: index + 1,
  }))
}

async function persistWizardBuyerParticipants(client, { transactionId, buyerParties = [], primaryBuyer = null, organisationId = null, actorUserId = null }) {
  if (!transactionId || !buyerParties.length) return []

  const participants = []
  for (const [index, party] of buyerParties.entries()) {
    let buyerParty = party.buyerId ? null : party.isPrimary ? primaryBuyer : null
    if (party.buyerId) {
      const selected = await client.from('buyers').select('id, name, email, phone').eq('id', party.buyerId).maybeSingle()
      if (selected.error) throw selected.error
      buyerParty = selected.data
    }
    if (!buyerParty) {
      buyerParty = await findOrCreateBuyer(client, {
        name: party.name || party.email || party.phone || `Buyer party ${index + 1}`,
        phone: party.phone,
        email: party.email,
        organisationId,
      })
    }

    const payload = {
      transaction_id: transactionId,
      buyer_party_id: buyerParty.id,
      participant_name: buyerParty.name || party.name,
      participant_email: buyerParty.email || party.email || null,
      participant_phone: buyerParty.phone || party.phone || null,
      role_type: 'buyer',
      legal_role: 'none',
      transaction_role: 'buyer',
      status: 'active',
      buyer_party_role: party.isPrimary ? 'primary_buyer' : 'additional_buyer',
      buyer_party_position: index,
      is_primary_buyer: Boolean(party.isPrimary),
      buyer_profile_status: 'draft',
      buyer_onboarding_status: 'not_started',
      buyer_portal_invite_status: 'not_sent',
      buyer_source: party.buyerId ? 'reusable_buyer_profile' : 'transaction_wizard',
      ownership_percentage: party.ownershipPercentage,
      signing_required: party.signatory !== false,
      buyer_metadata: {
        modelVersion: 'transaction_buyers_phase3_v1',
        partyRole: party.role,
        purchaserType: party.purchaserType,
        identityNumber: party.identityNumber || null,
        reusedBuyerProfile: Boolean(party.buyerId),
      },
      updated_at: new Date().toISOString(),
    }
    const existing = await client
      .from('transaction_participants')
      .select('id')
      .eq('transaction_id', transactionId)
      .eq('transaction_role', 'buyer')
      .eq('buyer_party_id', buyerParty.id)
      .maybeSingle()
    if (existing.error) throw existing.error
    const result = existing.data?.id
      ? await client.from('transaction_participants').update(payload).eq('id', existing.data.id).select('id').single()
      : await client.from('transaction_participants').insert(payload).select('id').single()
    if (result.error) throw result.error
    const participant = { ...payload, id: result.data?.id || existing.data?.id, buyerPartyId: buyerParty.id }
    participants.push(participant)

    if (party.buyerId) {
      await reuseBuyerProfileForTransaction({ transactionId, buyerId: buyerParty.id, actorUserId, client })
    }
  }

  const primary = participants.find((participant) => participant.is_primary_buyer)
  if (primary?.id) {
    const update = await client
      .from('transactions')
      .update({ primary_buyer_participant_id: primary.id, buyer_parties_model_version: 'transaction_buyers_phase3_v1' })
      .eq('id', transactionId)
    if (update.error) throw update.error
  }
  return participants
}

function normalizeWizardHandoffChecklist(input = {}) {
  const source = input && typeof input === 'object' ? input : {}
  const signedOtpStatus = normalizeTextValue(
    source.signedOtpStatus ||
      source.signed_otp_status ||
      source.otpStatus ||
      source.otp_status ||
      'pending_upload',
  )
  const allowedOtpStatuses = new Set(['uploaded', 'pending_upload', 'not_signed'])
  const normalizedOtpStatus = allowedOtpStatuses.has(signedOtpStatus) ? signedOtpStatus : 'pending_upload'
  const notes = normalizeNullableText(source.notes || source.handoffNotes || source.handoff_notes)

  return {
    signedOtpStatus: normalizedOtpStatus,
    signed_otp_status: normalizedOtpStatus,
    signedOtpUploaded: normalizedOtpStatus === 'uploaded',
    signed_otp_uploaded: normalizedOtpStatus === 'uploaded',
    requiresSignedOtpUpload: normalizedOtpStatus === 'pending_upload',
    requires_signed_otp_upload: normalizedOtpStatus === 'pending_upload',
    requiresOtpSignature: normalizedOtpStatus === 'not_signed',
    requires_otp_signature: normalizedOtpStatus === 'not_signed',
    buyerPartiesCaptured: Boolean(source.buyerPartiesCaptured ?? source.buyer_parties_captured),
    financeCaptured: Boolean(source.financeCaptured ?? source.finance_captured),
    partnersCaptured: Boolean(source.partnersCaptured ?? source.partners_captured),
    notes,
  }
}

async function persistInitialBuyerPartiesOnboardingData(
  client,
  { transactionId, purchaserType, buyerParties = [], financeSnapshot = {}, handoffChecklist = {}, transactionParties = null } = {},
) {
  if (!transactionId) {
    return null
  }

  const hasFinanceSeed = Boolean(
    financeSnapshot &&
      [
        financeSnapshot.financeType,
        financeSnapshot.financeManagedBy,
        financeSnapshot.purchasePrice,
        financeSnapshot.cashAmount,
        financeSnapshot.bondAmount,
        financeSnapshot.depositAmount,
        financeSnapshot.reservationRequired,
        financeSnapshot.reservationAmount,
        financeSnapshot.reservationStatus,
        handoffChecklist.signedOtpStatus,
      ].some((value) => value !== null && value !== undefined && value !== ''),
  )

  if (!buyerParties.length && !hasFinanceSeed && !transactionParties) {
    return null
  }

  const now = new Date().toISOString()
  const existingQuery = await client
    .from('onboarding_form_data')
    .select('id, form_data')
    .eq('transaction_id', transactionId)
    .maybeSingle()

  if (existingQuery.error && !isMissingTableError(existingQuery.error, 'onboarding_form_data')) {
    throw existingQuery.error
  }

  if (existingQuery.error) {
    throw existingQuery.error
  }

  const existingFormData =
    existingQuery.data?.form_data && typeof existingQuery.data.form_data === 'object'
      ? { ...existingQuery.data.form_data }
      : {}
  const existingBridgeParties =
    existingFormData.__bridge_parties && typeof existingFormData.__bridge_parties === 'object'
      ? existingFormData.__bridge_parties
      : {}
  const primaryParty = buyerParties.find((party) => party.isPrimary || party.role === 'primary_purchaser') || buyerParties[0]
  const nextFormData = {
    ...existingFormData,
    ...transactionPartiesOnboardingSeed(transactionParties),
    purchaser_type: purchaserType,
    purchaser_entity_type: purchaserType,
    purchasers: buyerParties.length ? buyerParties : existingFormData.purchasers,
    buyer_parties: buyerParties.length ? buyerParties : existingFormData.buyer_parties,
    purchase_finance_type: financeSnapshot.financeType ?? existingFormData.purchase_finance_type,
    finance_type: financeSnapshot.financeType ?? existingFormData.finance_type,
    finance_managed_by: financeSnapshot.financeManagedBy ?? existingFormData.finance_managed_by,
    financeManagedBy: financeSnapshot.financeManagedBy ?? existingFormData.financeManagedBy,
    purchase_price: financeSnapshot.purchasePrice ?? existingFormData.purchase_price,
    cash_amount: financeSnapshot.cashAmount ?? existingFormData.cash_amount,
    bond_amount: financeSnapshot.bondAmount ?? existingFormData.bond_amount,
    deposit_amount: financeSnapshot.depositAmount ?? existingFormData.deposit_amount,
    reservation_required: financeSnapshot.reservationRequired ?? existingFormData.reservation_required,
    reservation_amount: financeSnapshot.reservationAmount ?? existingFormData.reservation_amount,
    reservation_status: financeSnapshot.reservationStatus ?? existingFormData.reservation_status,
    __bridge_parties: {
      ...existingBridgeParties,
      buyerParties: buyerParties.length ? buyerParties : existingBridgeParties.buyerParties || [],
      primaryBuyerParty: primaryParty || existingBridgeParties.primaryBuyerParty || null,
      source: 'new_transaction_wizard',
      capturedAt: now,
    },
    __bridge_finance: {
      ...(existingFormData.__bridge_finance && typeof existingFormData.__bridge_finance === 'object'
        ? existingFormData.__bridge_finance
        : {}),
      ...financeSnapshot,
      source: 'new_transaction_wizard',
      capturedAt: now,
    },
    __bridge_handoff: {
      ...(existingFormData.__bridge_handoff && typeof existingFormData.__bridge_handoff === 'object'
        ? existingFormData.__bridge_handoff
        : {}),
      ...handoffChecklist,
      source: 'new_transaction_wizard',
      capturedAt: now,
    },
  }

  if (primaryParty) {
    nextFormData.full_name = nextFormData.full_name || primaryParty.full_name || primaryParty.name || ''
    nextFormData.first_name = nextFormData.first_name || primaryParty.first_name || ''
    nextFormData.last_name = nextFormData.last_name || primaryParty.last_name || ''
    nextFormData.email = nextFormData.email || primaryParty.email || ''
    nextFormData.phone = nextFormData.phone || primaryParty.phone || ''
    nextFormData.identity_number = nextFormData.identity_number || primaryParty.identity_number || ''
  }

  const upsertResult = await client.from('onboarding_form_data').upsert(
    {
      transaction_id: transactionId,
      purchaser_type: purchaserType,
      form_data: nextFormData,
      updated_at: now,
    },
    { onConflict: 'transaction_id' },
  )

  if (upsertResult.error) {
    throw upsertResult.error
  }

  return nextFormData
}

export function resolveConfiguredDevelopmentRolePlayers(settings = {}, { includeBondOriginator = false } = {}) {
  const teams = settings?.stakeholderTeams || settings?.stakeholder_teams || {}
  const defaults = normalizeDevelopmentRolePlayerDefaults(
    settings?.rolePlayerDefaults || settings?.role_player_defaults || teams?.rolePlayerDefaults || teams?.role_player_defaults,
  )
  const selections = []

  if (defaults.defaultTransferAttorneySource !== 'none' && defaults.defaultTransferAttorneyName) {
    selections.push({
      roleType: 'transfer_attorney',
      selectionSource: 'development_default',
      partnerName: defaults.defaultTransferAttorneyName,
      contactPerson: defaults.defaultTransferAttorneyName,
      email: defaults.defaultTransferAttorneyEmail || null,
      partnerRelationshipId: defaults.defaultTransferAttorneyRelationshipId || null,
      preferredPartnerId: defaults.defaultTransferAttorneyPreferredPartnerId || null,
      partnerOrganisationId: defaults.defaultTransferAttorneyOrganisationId || null,
      firmFirstAllocation: true,
      snapshot: { source: 'development_configuration_default' },
    })
  }

  if (
    includeBondOriginator &&
    defaults.defaultBondOriginatorSource !== 'none' &&
    defaults.defaultBondOriginatorName
  ) {
    selections.push({
      roleType: 'bond_originator',
      selectionSource: 'development_default',
      partnerName: defaults.defaultBondOriginatorName,
      contactPerson: defaults.defaultBondOriginatorName,
      email: defaults.defaultBondOriginatorEmail || null,
      partnerRelationshipId: defaults.defaultBondOriginatorRelationshipId || null,
      preferredPartnerId: defaults.defaultBondOriginatorPreferredPartnerId || null,
      partnerOrganisationId: defaults.defaultBondOriginatorOrganisationId || null,
      snapshot: { source: 'development_configuration_default' },
    })
  }

  return selections
}

export async function createTransactionFromWizard({ setup = {}, finance = {}, status = {}, options = {} }) {
  const client = requireClient()
  const actorProfile = await resolveActiveProfileContext(client)
  const actorUserId = normalizeNullableUuid(actorProfile.userId)
  if (!actorUserId) {
    throw new Error('Please sign in again before creating a transaction.')
  }
  const creationSession = typeof client.auth?.getSession === 'function'
    ? (await client.auth.getSession())?.data?.session : null
  if (creationSession?.user?.id && creationSession.user.id !== actorUserId) {
    throw new Error('Your signed-in account changed. Retry transaction creation with the current account.')
  }
  // Follow-up work can outlive the dialog or an account switch. Keep the
  // initiating actor's existing token rather than borrowing the next session.
  const postCreateClient = creationSession?.access_token
    ? createScopedSupabaseClient({ Authorization: `Bearer ${creationSession.access_token}` }) || client
    : client
  const actorRole = normalizeRoleType(actorProfile.role || 'agent')
  const allowIncomplete = Boolean(options?.allowIncomplete)
  const skipClientPortalSetup = Boolean(options?.skipClientPortalSetup)

  const sourceContext = options?.sourceContext && typeof options.sourceContext === 'object' ? options.sourceContext : {}
  const saleProfile = resolveTransactionSaleProfile({
    setup: {
      ...setup,
      transactionType: setup?.transactionType || setup?.transaction_type || 'developer_sale',
    },
    sourceContext,
    transaction: setup,
  })
  const transactionType = saleProfile.transactionType || normalizeStoredTransactionType(setup?.transactionType, 'developer_sale')
  const propertyType = normalizeTransactionPropertyType(setup?.propertyType)
  const propertyTenure = normalizePropertyStructureType(
    setup?.propertyTenure || setup?.property_tenure || setup?.propertyTitleType || setup?.property_title_type,
    { fallback: transactionType === 'developer_sale' ? 'sectional_title' : null },
  )

  assertTransactionCreationInput({
    setup,
    transactionType,
    propertyType,
    allowIncomplete,
  })

  const linkedPrivateListingId = transactionType === 'private_property'
    ? normalizeNullableUuid(
      sourceContext.listingId ||
        sourceContext.listing_id ||
        setup.privateListingId ||
        setup.private_listing_id ||
        setup.listingId ||
        setup.listing_id,
    )
    : null
  let resolvedOrganisationId = normalizeNullableUuid(
    sourceContext.organisationId ||
      sourceContext.organisation_id ||
      sourceContext.workspaceId ||
      sourceContext.workspace_id ||
      setup.organisationId ||
      setup.organisation_id ||
      actorProfile.workspaceId ||
      actorProfile.organisationId,
  )
  if (!resolvedOrganisationId && linkedPrivateListingId) {
    const listingOrganisation = await client
      .from('private_listings')
      .select('organisation_id')
      .eq('id', linkedPrivateListingId)
      .maybeSingle()
    if (listingOrganisation.error) throw listingOrganisation.error
    resolvedOrganisationId = normalizeNullableUuid(listingOrganisation.data?.organisation_id)
  }
  if (!resolvedOrganisationId && transactionType === 'developer_sale' && setup.developmentId) {
    resolvedOrganisationId = await resolveDevelopmentOrganisationId(client, setup.developmentId)
  }

  if (transactionType === 'developer_sale' && setup.unitId) {
    const activeDeal = await client.from('transactions').select('id')
      .eq('unit_id', setup.unitId).eq('is_active', true).limit(1).maybeSingle()
    if (activeDeal.error) throw activeDeal.error
    if (activeDeal.data) {
      const error = new Error('This unit already has an active transaction. Open that transaction to make changes.')
      error.code = 'UNIT_ALREADY_HAS_ACTIVE_TRANSACTION'
      error.existingTransactionId = activeDeal.data.id
      throw error
    }
  }

  let buyer = null
  const selectedBuyerProfileId = normalizeNullableUuid(setup?.buyerProfileId || setup?.buyer_profile_id)
  if (selectedBuyerProfileId) {
    const selectedBuyer = await client
      .from('buyers')
      .select('id, name, phone, email')
      .eq('id', selectedBuyerProfileId)
      .maybeSingle()
    if (selectedBuyer.error) throw selectedBuyer.error
    if (!selectedBuyer.data) throw new Error('The selected buyer profile is no longer available.')
    buyer = selectedBuyer.data
  }
  const hasBuyerSeed = Boolean(setup?.buyerName?.trim() || setup?.buyerEmail?.trim() || setup?.buyerPhone?.trim())
  if (!buyer && hasBuyerSeed) {
    buyer = await findOrCreateBuyer(client, {
      name: setup.buyerName,
      phone: setup.buyerPhone,
      email: setup.buyerEmail,
      organisationId: resolvedOrganisationId,
    })
  }

  if (!buyer && !allowIncomplete) {
    throw new Error('Buyer full name is required.')
  }


  let developmentSettings = DEFAULT_DEVELOPMENT_SETTINGS
  if (transactionType === 'developer_sale' && setup.developmentId) {
    try {
      developmentSettings = await ensureDevelopmentSettings(client, setup.developmentId, {
        createIfMissing: false,
      })
    } catch (settingsError) {
      const recoverableSettingsError =
        isMissingSchemaError(settingsError) ||
        isMissingColumnError(settingsError) ||
        isPermissionDeniedError(settingsError)
      if (!recoverableSettingsError) {
        throw settingsError
      }
      developmentSettings = DEFAULT_DEVELOPMENT_SETTINGS
    }
  }

  const developmentAssignedAgent =
    transactionType === 'developer_sale' ? resolveDevelopmentSettingsAssignedAgent(developmentSettings) : { name: '', email: '' }
  const activeActorAgentName = ['developer', 'agent'].includes(actorRole)
    ? normalizeTextValue(actorProfile.fullName || actorProfile.email)
    : ''
  const activeActorAgentEmail = ['developer', 'agent'].includes(actorRole)
    ? normalizeTextValue(actorProfile.email).toLowerCase()
    : ''
  const resolvedAssignedAgent =
    normalizeTextValue(setup.assignedAgent) ||
    normalizeTextValue(developmentAssignedAgent.name) ||
    activeActorAgentName
  const resolvedAssignedAgentEmail =
    normalizeTextValue(setup.assignedAgentEmail).toLowerCase() ||
    normalizeTextValue(developmentAssignedAgent.email).toLowerCase() ||
    activeActorAgentEmail
  const actorName =
    actorRole === 'attorney'
      ? finance?.attorney?.trim() || 'Attorney Team'
      : actorRole === 'bond_originator'
        ? finance?.bondOriginator?.trim() || 'Bond Team'
        : resolvedAssignedAgent || 'Sales Team'

  const purchaserType = normalizePurchaserType(setup.purchaserType)
  const buyerParties = resolveWizardBuyerParties(setup, purchaserType)
  const transactionParties = setup.transactionParties ? buildTransactionPartiesSnapshot(setup.transactionParties) : null
  const handoffChecklist = normalizeWizardHandoffChecklist(options?.handoffChecklist || setup?.handoffChecklist || {})
  const requestedDetailedStage = normalizeTransactionStage(status.stage, 'Reserved')
  const requestedMainStage = normalizeMainStage(status.mainStage, requestedDetailedStage)
  const initialTransactionStage = resolveWizardInitialTransactionStage(handoffChecklist, {
    stage: requestedDetailedStage,
    mainStage: requestedMainStage,
    preserveCapturedStage: Boolean(options?.preserveCapturedStage || options?.creationOrigin === 'quick_address_capture'),
  })
  const resolvedDetailedStage = normalizeTransactionStage(initialTransactionStage.stage, requestedDetailedStage)
  const resolvedMainStage = normalizeMainStage(initialTransactionStage.mainStage, resolvedDetailedStage)
  const resolvedNextAction = resolveWizardHandoffNextAction(
    handoffChecklist,
    status.nextAction || finance.nextAction || null,
  )
  const initialPortalReadinessStatus = initialTransactionStage.onboardingStatus
  const initialPortalReadinessAt =
    initialPortalReadinessStatus === 'awaiting_client_onboarding' ? null : new Date().toISOString()

  const deferFinanceType = Boolean(options?.deferFinanceType)
  const configuredDevelopmentRolePlayers =
    transactionType === 'developer_sale'
      ? resolveConfiguredDevelopmentRolePlayers(developmentSettings, {
          // A status-created transaction can be captured before its finance
          // type. Keep its configured routing attached so the bond lane is
          // ready when finance is completed.
          includeBondOriginator: true,
        })
      : []
  const rolePlayerSelections = normalizeTransactionRolePlayerInputs(
    [...configuredDevelopmentRolePlayers, ...(options?.rolePlayers || [])],
    {
    transactionType,
    },
  )
  const shouldAutoResolveRolePlayers = options?.disableAutoPartnerRouting !== true
  const autoRoutingRoleTypes = shouldAutoResolveRolePlayers
    ? Array.isArray(options?.partnerRoleTypes) && options.partnerRoleTypes.length
      ? options.partnerRoleTypes.map((roleType) => normalizeRoleType(roleType)).filter(Boolean)
      : inferUniversalPartnerRoutingRoleTypes({
          role: actorRole,
          workspaceRole: actorProfile.role,
          appRole: actorProfile.role,
          transactionType,
          financeManagedBy: setup.financeManagedBy,
        })
    : []
  const autoResolvedSelections = shouldAutoResolveRolePlayers
    ? await resolvePartnerRoutingSelections({
        sourceOrganisationId: normalizeTextValue(
          sourceContext.organisationId ||
            sourceContext.workspaceId ||
            actorProfile.workspaceId ||
            actorProfile.organisationId ||
            '',
        ),
        sourceUserId: normalizeTextValue(sourceContext.agentUserId || sourceContext.userId || actorUserId || ''),
        sourceTeamId: normalizeTextValue(sourceContext.teamId || sourceContext.team_id || ''),
        sourceBranchId: normalizeTextValue(
          sourceContext.branchId || sourceContext.branch_id || setup.assignedBranchId || '',
        ),
        sourceRegionId: normalizeTextValue(sourceContext.regionId || sourceContext.region_id || ''),
        moduleContext: {
          role: actorRole,
          appRole: actorProfile.role,
          workspaceRole: actorProfile.role,
          transactionType,
          financeManagedBy: setup.financeManagedBy,
        },
        targetRoleTypes: autoRoutingRoleTypes,
        routingRules: Array.isArray(options?.routingRules) ? options.routingRules : undefined,
        partnerConnections: options?.partnerConnections !== undefined ? options.partnerConnections : undefined,
        partnerPeopleByRelationshipId: options?.partnerPeopleByRelationshipId || undefined,
        transactionOverride: options?.transactionOverride || null,
      })
    : []
  const mergedRolePlayerSelections = [
    ...rolePlayerSelections,
    ...autoResolvedSelections.filter(
      (selection) =>
        selection?.roleType &&
        !rolePlayerSelections.some(
          (existing) => normalizeRoleType(existing.roleType) === normalizeRoleType(selection.roleType),
        ),
    ),
  ].filter((selection) => {
    if (!finance.captureSnapshot) return true
    const capture = finance.captureSnapshot
    // An explicitly captured external nominee supersedes development defaults;
    // only organisation connection may grant that professional matter access.
    if (capture.professionalNominations?.some((nomination) => nomination.roleType === selection.roleType && nomination.connected === false)) return false
    const usesBond = ['bond', 'hybrid', 'combination'].includes(capture.type)
    if (selection.roleType === 'bond_originator') return usesBond && capture.managedBy === 'bond_originator'
    if (selection.roleType === 'bond_attorney') return usesBond
    if (selection.roleType === 'cancellation_attorney') return capture.sellerBondStatus === 'yes'
    return true
  }).map(prepareFirmFirstTransferRoleplayer)
  const primaryPartnerSelection =
    mergedRolePlayerSelections.find((item) => item.partnerOrganisationId || item.partnerRelationshipId) || null
  const hierarchyScope =
    options?.hierarchyScope && typeof options.hierarchyScope === 'object' ? options.hierarchyScope : {}
  const assignedRegionId = normalizeNullableUuid(hierarchyScope.regionId || hierarchyScope.region_id)
  const assignedBranchId = normalizeNullableUuid(hierarchyScope.branchId || hierarchyScope.branch_id)
  const normalizedFinanceType = deferFinanceType
    ? normalizeFinanceType(setup.financeType || '', { allowUnknown: true })
    : normalizeFinanceType(setup.financeType || 'cash')
  const persistedFinanceType = normalizedFinanceType === 'unknown' ? null : normalizedFinanceType
  const resolvedPurchasePrice = resolvePurchasePrice({ setup })
  const explicitReservationRequired =
    typeof finance?.reservationRequired === 'boolean' ? finance.reservationRequired : null
  const reservationRequired =
    explicitReservationRequired ?? Boolean(developmentSettings?.reservation_deposit_enabled_by_default)
  const reservationAmountInput = normalizeOptionalNumber(finance.reservationAmount)
  const reservationAmountDefault = normalizeOptionalNumber(
    developmentSettings?.reservation_deposit_amount ?? developmentSettings?.reservationDepositAmount,
  )
  const resolvedReservationAmount = reservationRequired ? (reservationAmountInput ?? reservationAmountDefault) : null
  const reservationAmountType = normalizeReservationAmountType(
    finance.reservationAmountType ||
      finance.reservation_amount_type ||
      developmentSettings?.reservation_deposit_amount_type ||
      developmentSettings?.reservationDepositAmountType,
  )
  const reservationTreatment = normalizeReservationTreatment(
    finance.reservationTreatment ||
      finance.reservation_treatment ||
      developmentSettings?.reservation_deposit_treatment ||
      developmentSettings?.reservationDepositTreatment,
  )
  const reservationPayableTo = normalizeReservationPayableTo(
    finance.reservationPayableTo ||
      finance.reservation_payable_to ||
      developmentSettings?.reservation_deposit_payable_to ||
      developmentSettings?.reservationDepositPayableTo,
  )
  const alterationChargeTreatment = normalizeAlterationChargeTreatment(
    finance.alterationChargeTreatment ||
      finance.alteration_charge_treatment ||
      developmentSettings?.default_alteration_charge_treatment ||
      developmentSettings?.defaultAlterationChargeTreatment,
  )
  const reservationStatus = normalizeReservationStatus(finance.reservationStatus, {
    required: reservationRequired,
  })
  const reservationPaymentDetails = normalizeReservationPaymentDetails(
    finance.reservationPaymentDetails ||
      developmentSettings?.reservation_deposit_payment_details ||
      developmentSettings?.reservationDepositPaymentDetails ||
      {},
  )
  const commissionSnapshotInput =
    options?.commissionSnapshot && typeof options.commissionSnapshot === 'object' ? options.commissionSnapshot : null
  const snapshotGrossCommissionPercentage = normalizeOptionalNumber(commissionSnapshotInput?.grossCommissionPercentage)
  const snapshotGrossCommissionAmount = normalizeOptionalNumber(commissionSnapshotInput?.grossCommissionAmount)
  const snapshotAgentSplit = normalizeOptionalNumber(commissionSnapshotInput?.agentSplitPercentage)
  const snapshotAgencySplit = normalizeOptionalNumber(commissionSnapshotInput?.agencySplitPercentage)
  const snapshotAgentCommissionAmount = normalizeOptionalNumber(commissionSnapshotInput?.agentCommissionAmount)
  const snapshotAgencyCommissionAmount = normalizeOptionalNumber(commissionSnapshotInput?.agencyCommissionAmount)
  const expectedAttorneyAssignments = mergedRolePlayerSelections.filter((selection) =>
    ['transfer_attorney', 'bond_attorney', 'cancellation_attorney'].includes(selection?.roleType) &&
    (shouldCreateAttorneyAssignmentForSelection(selection) || isFirmFirstAttorneyAllocation(selection)),
  ).length
  const expectedBondOriginatorAssignments = isBondFinanceType(normalizedFinanceType)
    ? mergedRolePlayerSelections.filter((selection) => selection?.roleType === 'bond_originator').length
    : 0
  let creationLifecycle = createTransactionCreationLifecycle({
    attorneyAssignmentRequired: expectedAttorneyAssignments > 0,
    bondOriginatorAssignmentRequired: expectedBondOriginatorAssignments > 0,
    sellerHandoffRequired: transactionType === 'private_property',
    portalSetupRequired: requiresTransactionBuyerPortal({ transactionType, buyerId: buyer?.id, allowIncomplete, skipClientPortalSetup }),
  })
  const initialCreationLifecyclePatch = buildTransactionCreationPersistencePatch({
    lifecycle: creationLifecycle,
    status: 'initializing',
  })

  // Copy an explicit wizard answer into the canonical cancellation flags.
  // Unknown remains in the capture snapshot; these booleans are NOT NULL.
  const capturedSellerBondStatus = finance.captureSnapshot?.sellerBondStatus
  const sellerBondCapturePatch = ['yes', 'no'].includes(capturedSellerBondStatus)
    ? {
        seller_has_existing_bond: capturedSellerBondStatus === 'yes',
        existing_bond: capturedSellerBondStatus === 'yes',
        cancellation_required: capturedSellerBondStatus === 'yes',
      }
    : {}

  const transactionPayload = {
    ...initialCreationLifecyclePatch,
    ...sellerBondCapturePatch,
    organisation_id: resolvedOrganisationId,
    listing_id: linkedPrivateListingId,
    development_id: transactionType === 'developer_sale' ? setup.developmentId : null,
    unit_id: transactionType === 'developer_sale' ? setup.unitId : null,
    buyer_id: buyer?.id || null,
    transaction_type: transactionType,
    sale_route: saleProfile.saleRoute,
    sale_channel: saleProfile.saleChannel,
    seller_party_type: saleProfile.sellerPartyType,
    lead_owner: normalizeNullableText(sourceContext.leadOwner || sourceContext.lead_owner),
    ownership_model: normalizeNullableText(sourceContext.ownershipModel || sourceContext.ownership_model),
    source_agency_org_id: normalizeNullableUuid(
      sourceContext.sourceAgencyOrgId ||
        sourceContext.source_agency_org_id ||
        sourceContext.agencyOrganisationId ||
        sourceContext.agency_organisation_id,
    ),
    property_type: propertyType,
    property_tenure: propertyTenure,
    property_address_line_1: normalizeNullableText(setup.propertyAddressLine1),
    property_address_line_2: normalizeNullableText(setup.propertyAddressLine2),
    suburb: normalizeNullableText(setup.suburb),
    city: normalizeNullableText(setup.city),
    province: normalizeNullableText(setup.province),
    postal_code: normalizeNullableText(setup.postalCode),
    property_description: normalizeNullableText(setup.propertyDescription),
    matter_owner: normalizeNullableText(finance.attorney || actorName),
    seller_name: normalizeNullableText(setup.sellerName),
    seller_email: normalizeNullableText(setup.sellerEmail)?.toLowerCase() || null,
    seller_phone: normalizeNullableText(setup.sellerPhone),
    finance_type: persistedFinanceType,
    purchaser_type: purchaserType,
    finance_managed_by: normalizeFinanceManagedBy(setup.financeManagedBy),
    purchase_price: resolvedPurchasePrice,
    cash_amount: normalizeOptionalNumber(finance.cashAmount),
    bond_amount: normalizeOptionalNumber(finance.bondAmount),
    deposit_amount: normalizeOptionalNumber(finance.depositAmount),
    reservation_required: reservationRequired,
    reservation_amount: resolvedReservationAmount,
    reservation_amount_type: reservationRequired ? reservationAmountType : null,
    reservation_treatment: reservationRequired ? reservationTreatment : null,
    reservation_payable_to: reservationRequired ? reservationPayableTo : null,
    reservation_status: reservationStatus,
    reservation_payment_details: reservationRequired ? reservationPaymentDetails : {},
    alteration_charge_treatment: transactionType === 'developer_sale' ? alterationChargeTreatment : null,
    reservation_paid_date:
      reservationRequired && ['paid', 'verified'].includes(reservationStatus)
        ? new Date().toISOString().slice(0, 10)
        : null,
    onboarding_status: initialPortalReadinessStatus,
    onboarding_completed_at: null,
    external_onboarding_submitted_at: initialPortalReadinessAt,
    stage: resolvedDetailedStage,
    current_main_stage: resolvedMainStage,
    stage_date: status.stageDate || null,
    risk_status: status.riskStatus || 'On Track',
    attorney:
      finance.attorney ||
      mergedRolePlayerSelections.find((selection) => selection.roleType === 'transfer_attorney')?.partnerName ||
      null,
    bond_originator:
      finance.bondOriginator ||
      mergedRolePlayerSelections.find((selection) => selection.roleType === 'bond_originator')?.partnerName ||
      null,
    bank: finance.bank || null,
    next_action: resolvedNextAction,
    comment: resolvedNextAction,
    sales_price: resolvedPurchasePrice,
    gross_commission_percentage: snapshotGrossCommissionPercentage,
    gross_commission_amount: snapshotGrossCommissionAmount,
    agent_split_percentage_snapshot: snapshotAgentSplit,
    agency_split_percentage_snapshot: snapshotAgencySplit,
    agent_commission_amount: snapshotAgentCommissionAmount,
    agency_commission_amount: snapshotAgencyCommissionAmount,
    sale_date: setup.saleDate || null,
    assigned_agent: resolvedAssignedAgent || null,
    assigned_agent_email: resolvedAssignedAgentEmail || null,
    expected_transfer_date: finance.expectedTransferDate || null,
    assigned_attorney_email:
      normalizeNullableText(finance.attorneyEmail)?.toLowerCase() ||
      mergedRolePlayerSelections.find((selection) => selection.roleType === 'transfer_attorney')?.email ||
      null,
    assigned_bond_originator_email:
      normalizeNullableText(finance.bondOriginatorEmail)?.toLowerCase() ||
      mergedRolePlayerSelections.find((selection) => selection.roleType === 'bond_originator')?.email ||
      null,
    originating_partner_organisation_id: primaryPartnerSelection?.partnerOrganisationId || null,
    referral_source_organisation_id: normalizeNullableText(options?.referralSourceOrganisationId) || null,
    relationship_owner_user_id: actorUserId,
    partner_relationship_id: primaryPartnerSelection?.partnerRelationshipId || null,
    assigned_region_id: assignedRegionId || null,
    assigned_branch_id: assignedBranchId || null,
    assigned_agent_id: ['developer', 'agent'].includes(actorRole) ? actorUserId : null,
    assigned_user_id: actorUserId,
    owner_user_id: actorUserId,
    created_by: actorUserId,
    access_level: normalizeTransactionAccessLevel(
      setup.accessLevel,
      transactionType === 'private_property' ? 'private' : 'shared',
    ),
    updated_at: new Date().toISOString(),
  }

  // Developer sales do not persist private-seller fields. Every other field
  // remains in the rich payload and targeted retries remove only the exact
  // column reported missing by PostgreSQL/PostgREST.
  if (transactionType !== 'private_property') {
    delete transactionPayload.seller_name
    delete transactionPayload.seller_email
    delete transactionPayload.seller_phone
  }

  const insertTransactionPayload = omitKnownMissingColumnsFromPayload(transactionPayload)
  const transactionMutationSelect =
    'id, unit_id, buyer_id, finance_type, stage, attorney, bond_originator, next_action, created_at, updated_at'

  const executeInsertMutation = async (payload) => {
    let result = await client
      .from('transactions')
      .insert(payload)
      .select(transactionMutationSelect)
      .limit(1)
      .single()

    if (
      result.error &&
      isFinanceTypeConstraintError(result.error) &&
      payload.finance_type === 'combination'
    ) {
      result = await client
        .from('transactions')
        .insert({ ...payload, finance_type: 'hybrid' })
        .select(transactionMutationSelect)
        .limit(1)
        .single()
    }
    return result
  }

  const transactionResult = await executeTransactionMutationWithTargetedColumnRetry({
    payload: insertTransactionPayload,
    execute: executeInsertMutation,
  })

  if (transactionResult.error?.code === '23505') {
    // A uniqueness conflict identifies another saved row, not permission to
    // overwrite its buyer, price or workflow with this wizard's draft.
    const conflict = new Error('A deal already exists for this property or creation request. Open the saved deal before trying again.')
    conflict.code = 'TRANSACTION_CREATION_CONFLICT'
    conflict.cause = transactionResult.error
    throw conflict
  }

  if (transactionResult.error) {
    throw transactionResult.error
  }

  const transaction = transactionResult.data
  async function persistCreationLifecyclePatch(patch) {
    const lifecycleUpdate = await client.from('transactions').update(patch).eq('id', transaction.id)
    if (lifecycleUpdate.error) {
      const persistenceError = new Error('Transaction creation status could not be persisted.')
      persistenceError.code = 'TRANSACTION_CREATION_STATUS_PERSISTENCE_FAILED'
      persistenceError.transactionId = transaction.id
      persistenceError.cause = lifecycleUpdate.error
      throw persistenceError
    }
  }

  const setupWarnings = []
  const recordSetupWarning = (area, error, fallbackMessage = 'Transaction setup step could not be completed.') => {
    const warning = {
      area,
      message: error?.message || fallbackMessage,
      code: error?.code || null,
    }
    setupWarnings.push(warning)
    console.warn(`[createTransactionFromWizard] ${area} setup skipped`, error || warning)
  }
  let persistedReservationRequired = Boolean(transactionPayload.reservation_required)
  let persistedReservationAmount = transactionPayload.reservation_amount ?? null
  let onboardingRecord = null
  let clientPortalLink = null
  let participantRows = []
  let propagationResult = { participants: [], attorneyAssignments: [], bondApplications: [] }
  let onboardingSnapshot = null
  let requiredDocumentRows = []
  let sellerHandoff = null

  const runCriticalSetup = async () => {
  if (setup.unitId) {
    const unitUpdatePayload = { status: resolvedDetailedStage }
    const normalizedSalesPrice = normalizeOptionalNumber(setup.salesPrice)
    if (normalizedSalesPrice !== null) unitUpdatePayload.price = normalizedSalesPrice

    const { error: updateUnitError } = await client.from('units').update(unitUpdatePayload).eq('id', setup.unitId)
    if (updateUnitError) throw updateUnitError
  }


  if (persistedReservationRequired) {
    const persistedReservation = await persistReservationStateIfPossible(client, {
      transactionId: transaction.id,
      required: transactionPayload.reservation_required,
      amount: transactionPayload.reservation_amount,
      status: transactionPayload.reservation_status,
      paymentDetails: transactionPayload.reservation_payment_details,
      amountType: transactionPayload.reservation_amount_type,
      treatment: transactionPayload.reservation_treatment,
      payableTo: transactionPayload.reservation_payable_to,
      paidDate: transactionPayload.reservation_paid_date,
    })

    persistedReservationRequired = Boolean(persistedReservation.required)
    persistedReservationAmount = persistedReservation.amount ?? persistedReservationAmount
  }

  await logTransactionEventIfPossible(client, {
    transactionId: transaction.id,
    eventType: 'transaction_created',
    createdBy: actorProfile.userId || null,
    createdByRole: actorRole,
    eventData: {
      stage: resolvedDetailedStage,
      mainStage: resolvedMainStage,
      financeType: transactionPayload.finance_type,
      financeManagedBy: transactionPayload.finance_managed_by,
      purchasePrice: transactionPayload.purchase_price,
      cashAmount: transactionPayload.cash_amount,
      bondAmount: transactionPayload.bond_amount,
      reservationRequired: transactionPayload.reservation_required,
      reservationAmount: transactionPayload.reservation_amount,
      reservationAmountType: transactionPayload.reservation_amount_type,
      reservationTreatment: transactionPayload.reservation_treatment,
      reservationPayableTo: transactionPayload.reservation_payable_to,
      reservationStatus: transactionPayload.reservation_status,
      alterationChargeTreatment: transactionPayload.alteration_charge_treatment,
      purchaserType,
      buyerParties,
      buyerPartyCount: buyerParties.length,
      handoffChecklist,
      buyerId: buyer?.id || null,
      unitId: setup.unitId || null,
      developmentId: setup.developmentId || null,
      listingId: linkedPrivateListingId,
      transactionType,
      routingTransactionType: saleProfile.routingTransactionType,
      saleChannel: saleProfile.saleChannel,
      sellerPartyType: saleProfile.sellerPartyType,
      propertyType: transactionPayload.property_type || null,
      propertyAddressLine1: transactionPayload.property_address_line_1 || null,
      originPath: options?.creationOrigin || null,
      originLabel: options?.sourceContext?.originLabel || null,
      createdByUserId: actorProfile.userId || null,
      branchId: options?.sourceContext?.branchId || setup?.assignedBranchId || null,
      workspaceId: options?.sourceContext?.workspaceId || options?.sourceContext?.organisationId || null,
      sourceContext: options?.sourceContext || null,
      completeness: options?.completeness || null,
      missingFollowUpItems: Array.isArray(options?.completeness?.missingItems) ? options.completeness.missingItems : [],
      canonicalStructure: Array.isArray(options?.canonicalStructure)
        ? options.canonicalStructure
        : [
            'transaction',
            'property',
            'seller_party',
            'buyer_party',
            'agent_assignment',
            'deal_terms',
            'finance_profile',
            'roleplayers',
            'documents',
            'transaction_events',
          ],
      rolePlayers: mergedRolePlayerSelections.map((item) => ({
        roleType: item.roleType,
        selectionSource: item.selectionSource,
        preferredPartnerId: item.preferredPartnerId || null,
        partnerName: item.partnerName || null,
        email: item.email || null,
        phone: item.phone || null,
      })),
    },
  })

  try {
    await persistTransactionRolePlayersIfPossible(client, {
      transactionId: transaction.id,
      rolePlayers: mergedRolePlayerSelections,
      actorProfile,
    })
  } catch (error) {
    if (!isRecoverableTransactionSetupError(error)) {
      throw error
    }
    recordSetupWarning('role_players', error, 'Role-player setup could not be completed.')
  }

  try {
    await persistTransactionCommissionSnapshotIfPossible(client, {
      transactionId: transaction.id,
      commissionSnapshot: options?.commissionSnapshot || null,
      setup,
    })
    await persistCommissionSnapshotToTransactionRowIfPossible(client, {
      transactionId: transaction.id,
      commissionSnapshot: options?.commissionSnapshot || null,
    })
  } catch (error) {
    if (!isRecoverableTransactionSetupError(error)) {
      throw error
    }
    recordSetupWarning('commission_snapshot', error, 'Commission setup could not be completed.')
  }

  try {
    const subprocesses = await ensureTransactionSubprocesses(client, transaction.id)
    await syncTransactionSubprocessOwners(
      client,
      {
        id: transaction.id,
        finance_managed_by: transactionPayload.finance_managed_by,
      },
      subprocesses,
    )
  } catch (error) {
    if (!isRecoverableTransactionSetupError(error)) {
      throw error
    }
    recordSetupWarning('workflow_subprocesses', error, 'Workflow subprocess setup could not be completed.')
  }

  try {
    const participantsResult = await ensureTransactionParticipants(client, {
      explicitCapture: Boolean(finance.captureSnapshot),
      sellerContactSlotId: transactionSellerContactSlotId(transactionParties?.seller),
      transaction: {
        ...transactionPayload,
        id: transaction.id,
        buyer_id: buyer?.id || null,
      },
      buyer,
    })
    participantRows = participantsResult.participants || []
    const buyerPartyRows = await persistWizardBuyerParticipants(client, {
      transactionId: transaction.id,
      buyerParties,
      primaryBuyer: buyer,
      organisationId: resolvedOrganisationId,
      actorUserId,
    })
    if (buyerPartyRows.length) {
      const participantIds = new Set(participantRows.map((item) => item.id).filter(Boolean))
      participantRows = [...participantRows, ...buyerPartyRows.filter((item) => item.id && !participantIds.has(item.id))]
    }
    await logTransactionEventIfPossible(client, {
      transactionId: transaction.id,
      eventType: 'ParticipantAssigned',
      createdBy: actorProfile.userId || null,
      createdByRole: actorRole,
      eventData: {
        assignedAgent: transactionPayload.assigned_agent || null,
        attorney: transactionPayload.attorney || null,
        bondOriginator: transactionPayload.bond_originator || null,
        buyerName: buyer?.name || null,
      },
    })

    propagationResult = await propagateTransactionRoleplayersIfPossible(client, {
      transactionId: transaction.id,
      transaction: {
        ...transactionPayload,
        id: transaction.id,
        finance_type: normalizedFinanceType,
      },
      rolePlayers: mergedRolePlayerSelections,
      actorProfile,
      actorRole,
      buyerId: buyer?.id || null,
      financeType: normalizedFinanceType,
    })
    if (propagationResult.attorneyAssignments.length < expectedAttorneyAssignments) {
      const error = new Error('The selected attorney assignment did not reach the attorney workspace.')
      error.code = 'ATTORNEY_ASSIGNMENT_SETUP_INCOMPLETE'
      error.setupArea = 'attorney_assignment'
      throw error
    }
    if (expectedAttorneyAssignments > 0) {
      creationLifecycle = setTransactionCreationStepOutcome(creationLifecycle, 'attorney_assignment', {
        status: 'complete',
        detail: { expected: expectedAttorneyAssignments, persisted: propagationResult.attorneyAssignments.length },
      })
    }
    if (propagationResult.bondApplications.length < expectedBondOriginatorAssignments) {
      const error = new Error('The selected bond originator assignment did not reach the bond workspace.')
      error.code = 'BOND_ORIGINATOR_ASSIGNMENT_SETUP_INCOMPLETE'
      error.setupArea = 'bond_originator_assignment'
      throw error
    }
    if (expectedBondOriginatorAssignments > 0) {
      creationLifecycle = setTransactionCreationStepOutcome(creationLifecycle, 'bond_originator_assignment', {
        status: 'complete',
        detail: { expected: expectedBondOriginatorAssignments, persisted: propagationResult.bondApplications.length },
      })
    }
    if (propagationResult.participants?.length) {
      const participantIds = new Set(participantRows.map((item) => item.id).filter(Boolean))
      participantRows = [
        ...participantRows,
        ...propagationResult.participants
          .map((item) => normalizeTransactionParticipantRow(item))
          .filter((item) => item?.id && !participantIds.has(item.id)),
      ]
    }
  } catch (error) {
    if (
      expectedAttorneyAssignments > 0 &&
      creationLifecycle.steps.attorney_assignment?.status !== 'complete'
    ) {
      creationLifecycle = setTransactionCreationStepOutcome(creationLifecycle, 'attorney_assignment', {
        status: 'failed',
        error,
      })
    }
    if (
      expectedBondOriginatorAssignments > 0 &&
      creationLifecycle.steps.bond_originator_assignment?.status !== 'complete'
    ) {
      creationLifecycle = setTransactionCreationStepOutcome(creationLifecycle, 'bond_originator_assignment', {
        status: 'failed',
        error,
      })
    }
    recordSetupWarning(
      error?.setupArea || 'participants',
      error,
      error?.setupArea === 'attorney_assignment'
        ? 'The selected attorney firm could not be added to its Matters workspace.'
        : error?.setupArea === 'bond_originator_assignment'
          ? 'The selected bond originator could not be added to its Applications workspace.'
        : 'Participant setup could not be completed.',
    )
  }

  try {
    onboardingRecord = await getOrCreateTransactionOnboardingRecord(client, {
      transactionId: transaction.id,
      purchaserType,
    })
    if (!onboardingRecord?.token) {
      const error = new Error('Buyer onboarding token was not persisted.')
      error.code = 'ONBOARDING_TOKEN_SETUP_INCOMPLETE'
      throw error
    }
  } catch (error) {
    recordSetupWarning('buyer_onboarding', error, 'Buyer onboarding token could not be created.')
  }

  try {
    onboardingSnapshot = await persistInitialBuyerPartiesOnboardingData(client, {
      transactionId: transaction.id,
      purchaserType,
      buyerParties,
      transactionParties,
      financeSnapshot: {
        financeType: normalizedFinanceType,
        captureSnapshot: finance.captureSnapshot || null,
        financeManagedBy: transactionPayload.finance_managed_by,
        purchasePrice: transactionPayload.purchase_price,
        cashAmount: transactionPayload.cash_amount,
        bondAmount: transactionPayload.bond_amount,
        depositAmount: transactionPayload.deposit_amount,
        reservationRequired: transactionPayload.reservation_required,
        reservationAmount: transactionPayload.reservation_amount,
        reservationStatus: transactionPayload.reservation_status,
      },
      handoffChecklist,
    })
    if (!onboardingRecord?.token) {
      const error = new Error('Buyer onboarding token was not persisted.')
      error.code = 'ONBOARDING_TOKEN_SETUP_INCOMPLETE'
      throw error
    }
    if (!onboardingSnapshot || typeof onboardingSnapshot !== 'object') {
      const error = new Error('Buyer onboarding snapshot was not persisted.')
      error.code = 'ONBOARDING_SNAPSHOT_SETUP_INCOMPLETE'
      throw error
    }
    creationLifecycle = setTransactionCreationStepOutcome(creationLifecycle, 'onboarding_snapshot', {
      status: 'complete',
      detail: { tokenPersisted: true, snapshotPersisted: true },
    })
  } catch (error) {
    creationLifecycle = setTransactionCreationStepOutcome(creationLifecycle, 'onboarding_snapshot', {
      status: 'failed',
      error,
    })
    recordSetupWarning('buyer_parties', error, 'Buyer party setup could not be completed.')
  }

  try {
    requiredDocumentRows = await ensureTransactionRequiredDocuments(client, {
      transactionId: transaction.id,
      formData: onboardingSnapshot || transactionPartiesOnboardingSeed(transactionParties),
      purchaserType,
      financeType: normalizedFinanceType,
      reservationRequired: reservationRequired,
      cashAmount: transactionPayload.cash_amount,
      bondAmount: transactionPayload.bond_amount,
    }, {
      canonicalSourceRequired: true,
    })
    if (!requiredDocumentRows.length) {
      const error = new Error('Canonical transaction requirements were not generated.')
      error.code = 'REQUIREMENT_GENERATION_SETUP_INCOMPLETE'
      throw error
    }
    creationLifecycle = setTransactionCreationStepOutcome(creationLifecycle, 'requirement_generation', {
      status: 'complete',
      detail: { requirementCount: requiredDocumentRows.length },
    })
  } catch (error) {
    creationLifecycle = setTransactionCreationStepOutcome(creationLifecycle, 'requirement_generation', {
      status: 'failed',
      error,
    })
    recordSetupWarning('required_documents', error, 'Required document setup could not be completed.')
  }

  try {
    if (creationLifecycle.steps.seller_handoff.required) {
      const handoffResult = await client.rpc('bridge_verify_private_transaction_seller_handoff', {
        p_transaction_id: transaction.id,
      })
      if (handoffResult.error) throw handoffResult.error
      sellerHandoff = handoffResult.data && typeof handoffResult.data === 'object'
        ? handoffResult.data
        : null
      if (
        sellerHandoff?.verified !== true ||
        !sellerHandoff?.privateListingId ||
        !sellerHandoff?.sellerOnboardingId ||
        !sellerHandoff?.sellerOnboardingToken ||
        !sellerHandoff?.sellerPortalContextId
      ) {
        const error = new Error('Private seller onboarding and portal continuity could not be verified.')
        error.code = 'SELLER_HANDOFF_SETUP_INCOMPLETE'
        throw error
      }
      creationLifecycle = setTransactionCreationStepOutcome(creationLifecycle, 'seller_handoff', {
        status: 'complete',
        detail: {
          privateListingId: sellerHandoff.privateListingId,
          sellerOnboardingId: sellerHandoff.sellerOnboardingId,
          sellerPortalContextId: sellerHandoff.sellerPortalContextId,
          promotedUploadCount: Number(sellerHandoff.promotedUploadCount || 0),
          satisfiedSellerRequirementCount: Number(sellerHandoff.satisfiedSellerRequirementCount || 0),
        },
      })
    }
  } catch (error) {
    if (creationLifecycle.steps.seller_handoff.required) {
      creationLifecycle = setTransactionCreationStepOutcome(creationLifecycle, 'seller_handoff', {
        status: 'failed',
        error,
      })
    }
    recordSetupWarning('seller_handoff', error, 'Private seller onboarding and document continuity could not be completed.')
  }

  try {
    if (creationLifecycle.steps.portal_setup.required) {
      clientPortalLink = await getOrCreateClientPortalLink({
        developmentId: transactionPayload.development_id,
        unitId: transactionPayload.unit_id,
        transactionId: transaction.id,
        buyerId: buyer?.id || null,
      })
      if (!clientPortalLink?.token) {
        const error = new Error('Buyer portal link was not persisted.')
        error.code = 'PORTAL_SETUP_INCOMPLETE'
        throw error
      }
      creationLifecycle = setTransactionCreationStepOutcome(creationLifecycle, 'portal_setup', {
        status: 'complete',
        detail: { tokenPersisted: true },
      })
    }
  } catch (error) {
    if (creationLifecycle.steps.portal_setup.required) {
      creationLifecycle = setTransactionCreationStepOutcome(creationLifecycle, 'portal_setup', {
        status: 'failed',
        error,
      })
    }
    recordSetupWarning('client_portal_link', error, 'Client portal link setup could not be completed.')
  }

  const incompleteCreationSteps = getTransactionCreationIncompleteSteps(creationLifecycle)
  if (incompleteCreationSteps.length) {
    const incompleteError = new Error('One or more critical transaction setup steps failed.')
    incompleteError.code = 'TRANSACTION_CREATION_INCOMPLETE'
    await persistCreationLifecyclePatch(buildTransactionCreationPersistencePatch({
      lifecycle: creationLifecycle,
      status: 'incomplete',
      error: incompleteError,
      warnings: setupWarnings,
    }))
    throw new TransactionCreationIncompleteError({
      transactionId: transaction.id,
      incompleteSteps: incompleteCreationSteps,
      cause: incompleteError,
    })
  }

  await persistCreationLifecyclePatch(buildTransactionCreationPersistencePatch({
    lifecycle: creationLifecycle,
    status: 'complete',
    warnings: setupWarnings,
  }))
  }

  // The transaction is now safe to open: its required onboarding, portal and
  // canonical document setup have completed. Keep telemetry, notification and
  // projection work off the interactive create path.
  const runPostCreateWork = async () => {
  const client = postCreateClient
  const financePayload = {
    transaction_id: transaction.id,
    proof_of_funds_received: normalizeOptionalBoolean(finance.proofOfFundsReceived),
    deposit_required: normalizeOptionalBoolean(finance.depositRequired),
    deposit_paid: normalizeOptionalBoolean(finance.depositPaid),
    bond_submitted: normalizeOptionalBoolean(finance.bondSubmitted),
    bond_approved: normalizeOptionalBoolean(finance.bondApproved),
    grant_signed: normalizeOptionalBoolean(finance.grantSigned),
    proceed_to_attorneys: normalizeOptionalBoolean(finance.proceedToAttorneys),
    cash_portion: normalizeOptionalNumber(finance.cashAmount ?? finance.cashPortion),
    bond_portion: normalizeOptionalNumber(finance.bondAmount ?? finance.bondPortion),
    bond_originator: finance.bondOriginator || null,
    bank: finance.bank || null,
    attorney: finance.attorney || null,
    expected_transfer_date: finance.expectedTransferDate || null,
    next_action: finance.nextAction || null,
    updated_at: new Date().toISOString(),
  }

  const financeSave = await client
    .from('transaction_finance_details')
    .upsert(financePayload, { onConflict: 'transaction_id' })
    .select('id')
    .single()

  if (financeSave.error && !isRecoverableTransactionSetupError(financeSave.error)) {
    throw financeSave.error
  }
  if (financeSave.error) {
    recordSetupWarning('finance_details', financeSave.error, 'Finance detail setup could not be completed.')
  }

  if (status.notes?.trim()) {
    const { error: noteError } = await client.from('transaction_comments').insert({
      transaction_id: transaction.id,
      author_name: actorName,
      author_role: actorRole,
      comment_text: `[operational] ${status.notes.trim()}`,
    })

    if (noteError && isMissingTableError(noteError, 'transaction_comments')) {
      const fallbackNote = await createNote(transaction.id, status.notes.trim(), setup.unitId)
      if (!fallbackNote) {
        throw noteError
      }
      await logTransactionEventIfPossible(client, {
        transactionId: transaction.id,
        eventType: 'CommentAdded',
        createdBy: actorProfile.userId || null,
        createdByRole: actorRole,
        eventData: {
          source: 'legacy_notes',
          noteId: fallbackNote.id,
          text: status.notes.trim(),
        },
      })
    } else if (noteError && isRecoverableTransactionCommentError(noteError)) {
      recordSetupWarning('transaction_comments', noteError, 'Transaction setup note could not be recorded.')
    } else if (noteError) {
      throw noteError
    } else {
      await logTransactionEventIfPossible(client, {
        transactionId: transaction.id,
        eventType: 'CommentAdded',
        createdBy: actorProfile.userId || null,
        createdByRole: actorRole,
        eventData: {
          source: 'transaction_comments',
          text: status.notes.trim(),
        },
      })
    }
  }

  const transactionHeadline = 'A new unit transaction'

  const assignmentTargets = participantRows
    .filter((item) => ['developer', 'attorney', 'bond_originator', 'agent'].includes(item.roleType))
    .filter((item) => item.userId)

  await Promise.all(
    assignmentTargets.map((target) =>
      createTransactionNotificationIfPossible(client, {
        transactionId: transaction.id,
        userId: target.userId,
        roleType: target.roleType,
        notificationType: 'participant_assigned',
        title: 'New transaction assignment',
        message: `${transactionHeadline} has been added to your ${TRANSACTION_ROLE_LABELS[target.roleType] || target.roleType} lane.`,
        eventType: 'ParticipantAssigned',
        eventData: {
          trigger: 'transaction_created',
          assignedRole: target.roleType,
        },
        dedupeKey: `assign-on-create:${transaction.id}:${target.roleType}:${target.userId}`,
      }),
    ),
  )

  await logTransactionEventIfPossible(client, {
    transactionId: transaction.id,
    eventType: 'TransactionUpdated',
    createdBy: actorProfile.userId || null,
    createdByRole: actorRole,
    eventData: {
      automation: 'TransactionInitialized',
      onboardingToken: onboardingRecord?.token || null,
      participantCount: participantRows.length,
      requiredDocsGenerated: requiredDocumentRows.length > 0,
      clientLinkGenerated: Boolean(clientPortalLink?.token),
    },
  })

  try {
    await runDocumentAutomationIfPossible(client, {
      transactionId: transaction.id,
      documentId: null,
      documentName: null,
      category: null,
      actorRole,
      actorUserId: actorProfile.userId || null,
      source: 'transaction_created',
    })
  } catch (error) {
    if (!isRecoverableTransactionSetupError(error)) {
      throw error
    }
    recordSetupWarning('document_automation', error, 'Document automation could not be completed.')
  }

  let unitData = null
  if (setup.unitId) {
    const unitUpdatePayload = {
      status: status.stage || 'Reserved',
    }

    const normalizedSalesPrice = normalizeOptionalNumber(setup.salesPrice)
    if (normalizedSalesPrice !== null) {
      unitUpdatePayload.price = normalizedSalesPrice
    }

    const { error: updateUnitError } = await client.from('units').update(unitUpdatePayload).eq('id', setup.unitId)

    if (updateUnitError) {
      throw updateUnitError
    }

    const { data: fetchedUnitData, error: unitDataError } = await client
      .from('units')
      .select('id, unit_number')
      .eq('id', setup.unitId)
      .single()

    if (unitDataError) {
      throw unitDataError
    }

    unitData = fetchedUnitData
  }

  let setupHealth = buildNewTransactionSetupHealth({
    setupWarnings,
    handoffChecklist,
    buyerParties,
    rolePlayers: mergedRolePlayerSelections,
    onboardingRecord,
    transactionPayload,
    transactionType,
    sourceContext,
    completeness: options?.completeness || null,
  })

  try {
    const auditEvent = await logTransactionEventIfPossible(client, {
      transactionId: transaction.id,
      eventType: 'transaction_setup_audit',
      createdBy: actorProfile.userId || null,
      createdByRole: actorRole,
      eventData: {
        setupHealth,
        setupWarnings,
        handoffChecklist,
        buyerPartyCount: buyerParties.length,
        rolePlayerCount: mergedRolePlayerSelections.length,
        originPath: options?.creationOrigin || null,
        sourceContext,
      },
    })
    setupHealth = {
      ...setupHealth,
      auditEventLogged: Boolean(auditEvent?.id),
    }
  } catch (error) {
    if (!isRecoverableTransactionSetupError(error)) {
      throw error
    }
    recordSetupWarning('setup_audit', error, 'Transaction setup audit could not be recorded.')
    setupHealth = {
      ...buildNewTransactionSetupHealth({
        setupWarnings,
        handoffChecklist,
        buyerParties,
        rolePlayers: mergedRolePlayerSelections,
        onboardingRecord,
        transactionPayload,
        transactionType,
        sourceContext,
        completeness: options?.completeness || null,
      }),
      auditEventLogged: false,
    }
  }

  const postCreateResult = {
    transactionId: transaction.id,
    unitId: unitData?.id || null,
    unitNumber: unitData?.unit_number || null,
    transactionType,
    propertyType: transactionPayload.property_type || null,
    propertyLabel:
      transactionType === 'private_property'
        ? [setup.propertyAddressLine1, setup.city || setup.suburb].filter(Boolean).join(', ') ||
          setup.propertyDescription ||
          'Private property matter'
        : null,
    onboardingToken: onboardingRecord?.token || null,
    clientPortalToken: clientPortalLink?.token || null,
    clientPortalPath: clientPortalLink?.token ? `/client/${clientPortalLink.token}` : '',
    buyerPortalToken: clientPortalLink?.token || null,
    buyerPortalPath: clientPortalLink?.token ? `/client/${clientPortalLink.token}` : '',
    privateListingId: sellerHandoff?.privateListingId || linkedPrivateListingId || null,
    sellerOnboardingToken: sellerHandoff?.sellerOnboardingToken || null,
    sellerPortalToken: sellerHandoff?.sellerPortalToken || null,
    sellerPortalPath: sellerHandoff?.sellerOnboardingToken
      ? `/client/${sellerHandoff.sellerOnboardingToken}/selling`
      : '',
    reservationRequired: persistedReservationRequired,
    reservationAmount: persistedReservationAmount,
    reservationAmountType: transactionPayload.reservation_amount_type,
    reservationTreatment: transactionPayload.reservation_treatment,
    reservationPayableTo: transactionPayload.reservation_payable_to,
    alterationChargeTreatment: transactionPayload.alteration_charge_treatment,
    buyerPartyCount: buyerParties.length,
    rolePlayerCount: mergedRolePlayerSelections.length,
    handoffChecklist,
    setupPending: false,
    setupHealth,
    setupWarnings,
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('itg:transaction-post-create-complete', {
      detail: postCreateResult,
    }))
    window.dispatchEvent(new Event('itg:transaction-updated'))
  }
  return postCreateResult
  }

  // Critical setup must finish before success is returned. The inactive
  // creation receipt remains available for recovery if any required step fails.
  try {
    await runCriticalSetup()
  } catch (error) {
    if (error instanceof TransactionCreationIncompleteError) throw error
    await persistCreationLifecyclePatch(buildTransactionCreationPersistencePatch({
      lifecycle: creationLifecycle,
      status: 'incomplete',
      error,
      warnings: setupWarnings,
    }))
    throw new TransactionCreationIncompleteError({
      transactionId: transaction.id,
      incompleteSteps: getTransactionCreationIncompleteSteps(creationLifecycle),
      cause: error,
    })
  }
  void trackTransactionBackgroundWork(transaction.id, runPostCreateWork()).catch((error) => {
    console.warn('[createTransactionFromWizard] post-create updates failed', error)
  })

  return {
    transactionId: transaction.id,
    unitId: setup.unitId || null,
    unitNumber: null,
    transactionType,
    propertyType: transactionPayload.property_type || null,
    propertyLabel:
      transactionType === 'private_property'
        ? [setup.propertyAddressLine1, setup.city || setup.suburb].filter(Boolean).join(', ') ||
          setup.propertyDescription ||
          'Private property matter'
        : null,
    onboardingToken: onboardingRecord?.token || null,
    clientPortalToken: clientPortalLink?.token || null,
    clientPortalPath: clientPortalLink?.token ? `/client/${clientPortalLink.token}` : '',
    buyerPortalToken: clientPortalLink?.token || null,
    buyerPortalPath: clientPortalLink?.token ? `/client/${clientPortalLink.token}` : '',
    privateListingId: sellerHandoff?.privateListingId || linkedPrivateListingId || null,
    sellerOnboardingToken: sellerHandoff?.sellerOnboardingToken || null,
    sellerPortalToken: sellerHandoff?.sellerPortalToken || null,
    sellerPortalPath: sellerHandoff?.sellerPortalPath || '',
    reservationRequired: Boolean(transactionPayload.reservation_required),
    reservationAmount: transactionPayload.reservation_amount ?? null,
    reservationAmountType: transactionPayload.reservation_amount_type,
    reservationTreatment: transactionPayload.reservation_treatment,
    reservationPayableTo: transactionPayload.reservation_payable_to,
    alterationChargeTreatment: transactionPayload.alteration_charge_treatment,
    buyerPartyCount: buyerParties.length,
    rolePlayerCount: mergedRolePlayerSelections.length,
    handoffChecklist,
    setupPending: false,
    setupHealth: buildNewTransactionSetupHealth({
      setupWarnings,
      handoffChecklist,
      buyerParties,
      rolePlayers: mergedRolePlayerSelections,
      onboardingRecord,
      transactionPayload,
      transactionType,
      sourceContext,
      completeness: options?.completeness || null,
    }),
    setupWarnings,
  }
}

export function buildStakeholderPermissionPayload(roleType, financeManagedBy = 'bond_originator') {
  const permissions = getRolePermissions({ role: roleType, financeManagedBy })
  return {
    can_view: permissions.canView,
    can_comment: permissions.canComment,
    can_upload_documents: permissions.canUploadDocuments,
    can_edit_finance_workflow: permissions.canEditFinanceWorkflow,
    can_edit_attorney_workflow: permissions.canEditAttorneyWorkflow,
    can_edit_core_transaction: permissions.canEditCoreTransaction,
  }
}
