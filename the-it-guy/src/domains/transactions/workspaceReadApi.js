// Extracted read path; queries, filters, mapping and cache behaviour are preserved.
import { getFinanceWorkflowTemplate } from '../../core/transactions/financeWorkflow'
import { SUBPROCESS_STEP_TEMPLATES, SUBPROCESS_DEFAULT_OWNERS } from '../../core/transactions/roleConfig'
import { selectWithoutKnownMissingColumns, registerKnownMissingColumns } from '../../lib/api/shared/schemaReadCompatibility.js'
import { isMissingColumnError, normalizeTextValue, isMissingTableError, isMissingSchemaError, isPermissionDeniedError, requireClient } from '../../lib/api/shared/readHelpers.js'
import { hydrateMatterPropertyContext } from '../../services/matterPropertyContext'
import { fetchDevelopmentProfile } from '../developments/detailReadApi.js'
import { normalizeStage, normalizeMainStage, getDefaultHandoverRecord } from '../../core/transactions/legacyReadModel.js'
import { resolveAttorneyOperationalStageKey } from '../../core/transactions/attorneyOperationalEngine'
import { normalizePurchaserType, getPurchaserTypeLabel } from '../../lib/purchaserPersonas'
import { getRolePermissions } from '../../core/transactions/permissions'
import { summarizeDocumentRequests, summarizeChecklistItems } from './readinessReadApi.js'
import { DEFAULT_DEVELOPMENT_SETTINGS } from '../developments/configurationApi.js'
import { writeTimedCache, unitWorkspaceShellCache, readTimedCache, UNIT_WORKSPACE_SHELL_CACHE_TTL_MS, transactionRouteCoreCache } from './readCache.js'

export function getDefaultTrustInvestmentForm({ developmentId = null, unitId = null, transaction = null, buyer = null } = {}) {
  const buyerName = buyer?.name || ''
  const phone = buyer?.phone || ''

  return {
    id: null,
    developmentId,
    unitId,
    transactionId: transaction?.id || null,
    buyerId: transaction?.buyer_id || buyer?.id || null,
    attorneyFirmName: transaction?.attorney || '',
    purchaserFullName: buyerName,
    purchaserIdentityOrRegistrationNumber: '',
    fullName: buyerName,
    identityOrRegistrationNumber: '',
    incomeTaxNumber: '',
    southAfricanResident: null,
    physicalAddress: '',
    postalAddress: '',
    telephoneNumber: phone,
    faxNumber: '',
    balanceTo: '',
    bankName: '',
    accountNumber: '',
    branchNumber: '',
    sourceOfFunds: '',
    declarationAccepted: false,
    signatureName: buyerName,
    signedDate: '',
    status: 'Not Started',
    submittedAt: null,
    reviewedAt: null,
    approvedAt: null,
    createdAt: null,
    updatedAt: null,
  }
}

export function getDefaultOccupationalRentRecord({
  developmentId = null,
  unitId = null,
  transaction = null,
  buyer = null,
} = {}) {
  return {
    id: null,
    transactionId: transaction?.id || null,
    developmentId: developmentId || transaction?.development_id || null,
    unitId: unitId || transaction?.unit_id || null,
    buyerId: transaction?.buyer_id || buyer?.id || null,
    buyerName: buyer?.name || '',
    enabled: false,
    status: 'not_applicable',
    occupationDate: '',
    rentStartDate: '',
    monthlyAmount: null,
    proRataAmount: null,
    nextDueDate: '',
    waived: false,
    waiverReason: '',
    notes: '',
    createdAt: null,
    updatedAt: null,
  }
}

export function normalizeWorkflowProcessType(processType) {
  const normalized = String(processType || '')
    .trim()
    .toLowerCase()
  if (normalized === 'attorney') return 'transfer'
  return normalized
}

export function getSubprocessTemplate(processType, { financeType = null, includeLevyClearanceSteps = true } = {}) {
  if (processType === 'finance') {
    return getFinanceWorkflowTemplate(financeType).map((step, index) => ({
      key: step.key,
      label: step.label,
      sortOrder: index + 1,
    }))
  }

  const normalizedType = normalizeWorkflowProcessType(processType)
  let template = SUBPROCESS_STEP_TEMPLATES[normalizedType] || []

  if (normalizedType === 'transfer' && !includeLevyClearanceSteps) {
    template = template.filter((step) => !['levy_clearance_requested', 'levy_clearance_uploaded'].includes(step.key))
  }

  return template
}

export function buildDefaultSubprocessState(
  transactionId = null,
  { financeType = null, includeLevyClearanceSteps = true } = {},
) {
  const defaultTypes = ['finance', 'transfer']
  return defaultTypes.map((processType) => ({
    id: null,
    transaction_id: transactionId,
    process_type: processType,
    owner_type: SUBPROCESS_DEFAULT_OWNERS[processType] || 'internal',
    status: 'not_started',
    steps: getSubprocessTemplate(processType, {
      financeType,
      includeLevyClearanceSteps,
    }).map((step) => ({
      id: null,
      subprocess_id: null,
      step_key: step.key,
      step_label: step.label,
      status: 'not_started',
      completed_at: null,
      comment: null,
      owner_type: SUBPROCESS_DEFAULT_OWNERS[processType] || 'internal',
      sort_order: step.sortOrder,
    })),
  }))
}

export async function fetchTransactionRowById(client, transactionId) {
  let query = await client
    .from('transactions')
    .select(
      selectWithoutKnownMissingColumns(
        'id, matter_number, transaction_reference, transaction_type, property_type, property_tenure, seller_type, seller_has_existing_bond, existing_bond, cancellation_required, vat_treatment, routing_profile_version, routing_profile_json, development_id, unit_id, listing_id, buyer_id, property_address_line_1, property_address_line_2, suburb, city, province, postal_code, property_description, matter_owner, sales_price, purchase_price, cash_amount, bond_amount, deposit_amount, finance_type, purchaser_type, finance_managed_by, reservation_required, reservation_amount, reservation_amount_type, reservation_treatment, reservation_payable_to, reservation_status, reservation_paid_date, reservation_proof_document, reservation_proof_uploaded_at, reservation_payment_details, reservation_requested_at, reservation_email_sent_at, reservation_reviewed_at, reservation_reviewed_by, reservation_review_notes, alteration_charge_treatment, onboarding_status, onboarding_completed_at, external_onboarding_submitted_at, stage, current_main_stage, current_sub_stage_summary, risk_status, stage_date, sale_date, assigned_agent, assigned_agent_email, attorney, assigned_attorney_email, bond_originator, assigned_bond_originator_email, bond_workspace_id, bond_region_id, bond_workspace_unit_id, primary_bond_consultant_user_id, bank, expected_transfer_date, next_action, comment, owner_user_id, access_level, is_active, lifecycle_state, attorney_stage, operational_state, waiting_on_role, registration_date, title_deed_number, registration_confirmation_document_id, registered_by_user_id, registered_at, registration_reversed_at, registration_reversed_by_user_id, registration_reversal_reason, completed_at, completed_by_user_id, archived_at, archived_by_user_id, archive_reason, cancelled_at, cancelled_by_user_id, cancelled_reason, last_meaningful_activity_at, final_report_generated_at, updated_at, created_at',
      ),
    )
    .eq('id', transactionId)
    .maybeSingle()

  if (
    query.error &&
    (isMissingColumnError(query.error, 'transaction_reference') ||
      isMissingColumnError(query.error, 'matter_number') ||
      isMissingColumnError(query.error, 'transaction_type') ||
      isMissingColumnError(query.error, 'property_type') ||
      isMissingColumnError(query.error, 'property_tenure') ||
      isMissingColumnError(query.error, 'seller_type') ||
      isMissingColumnError(query.error, 'seller_has_existing_bond') ||
      isMissingColumnError(query.error, 'existing_bond') ||
      isMissingColumnError(query.error, 'cancellation_required') ||
      isMissingColumnError(query.error, 'vat_treatment') ||
      isMissingColumnError(query.error, 'routing_profile_version') ||
      isMissingColumnError(query.error, 'routing_profile_json') ||
      isMissingColumnError(query.error, 'property_address_line_1') ||
      isMissingColumnError(query.error, 'matter_owner') ||
      isMissingColumnError(query.error, 'development_id') ||
      isMissingColumnError(query.error, 'listing_id') ||
      isMissingColumnError(query.error, 'sales_price') ||
      isMissingColumnError(query.error, 'purchase_price') ||
      isMissingColumnError(query.error, 'cash_amount') ||
      isMissingColumnError(query.error, 'bond_amount') ||
      isMissingColumnError(query.error, 'deposit_amount') ||
      isMissingColumnError(query.error, 'purchaser_type') ||
      isMissingColumnError(query.error, 'finance_managed_by') ||
      isMissingColumnError(query.error, 'reservation_required') ||
      isMissingColumnError(query.error, 'reservation_amount') ||
      isMissingColumnError(query.error, 'reservation_amount_type') ||
      isMissingColumnError(query.error, 'reservation_treatment') ||
      isMissingColumnError(query.error, 'reservation_payable_to') ||
      isMissingColumnError(query.error, 'reservation_status') ||
      isMissingColumnError(query.error, 'reservation_paid_date') ||
      isMissingColumnError(query.error, 'reservation_proof_document') ||
      isMissingColumnError(query.error, 'reservation_proof_uploaded_at') ||
      isMissingColumnError(query.error, 'reservation_payment_details') ||
      isMissingColumnError(query.error, 'reservation_requested_at') ||
      isMissingColumnError(query.error, 'reservation_email_sent_at') ||
      isMissingColumnError(query.error, 'reservation_reviewed_at') ||
      isMissingColumnError(query.error, 'reservation_reviewed_by') ||
      isMissingColumnError(query.error, 'reservation_review_notes') ||
      isMissingColumnError(query.error, 'alteration_charge_treatment') ||
      isMissingColumnError(query.error, 'onboarding_status') ||
      isMissingColumnError(query.error, 'onboarding_completed_at') ||
      isMissingColumnError(query.error, 'external_onboarding_submitted_at') ||
      isMissingColumnError(query.error, 'current_main_stage') ||
      isMissingColumnError(query.error, 'current_sub_stage_summary') ||
      isMissingColumnError(query.error, 'risk_status') ||
      isMissingColumnError(query.error, 'assigned_agent') ||
      isMissingColumnError(query.error, 'assigned_agent_email') ||
      isMissingColumnError(query.error, 'assigned_attorney_email') ||
      isMissingColumnError(query.error, 'assigned_bond_originator_email') ||
      isMissingColumnError(query.error, 'bond_workspace_id') ||
      isMissingColumnError(query.error, 'bond_region_id') ||
      isMissingColumnError(query.error, 'bond_workspace_unit_id') ||
      isMissingColumnError(query.error, 'primary_bond_consultant_user_id') ||
      isMissingColumnError(query.error, 'bank') ||
      isMissingColumnError(query.error, 'expected_transfer_date') ||
      isMissingColumnError(query.error, 'comment') ||
      isMissingColumnError(query.error, 'owner_user_id') ||
      isMissingColumnError(query.error, 'access_level') ||
      isMissingColumnError(query.error, 'is_active') ||
      isMissingColumnError(query.error, 'lifecycle_state') ||
      isMissingColumnError(query.error, 'registered_at') ||
      isMissingColumnError(query.error, 'completed_at') ||
      isMissingColumnError(query.error, 'archived_at') ||
      isMissingColumnError(query.error, 'cancelled_at') ||
      isMissingColumnError(query.error, 'registration_date') ||
      isMissingColumnError(query.error, 'title_deed_number'))
  ) {
    registerKnownMissingColumns(query.error, [
      'matter_number',
      'transaction_reference',
      'transaction_type',
      'property_type',
      'property_tenure',
      'seller_type',
      'seller_has_existing_bond',
      'existing_bond',
      'cancellation_required',
      'vat_treatment',
      'routing_profile_version',
      'routing_profile_json',
      'property_address_line_1',
      'matter_owner',
      'development_id',
      'listing_id',
      'sales_price',
      'purchase_price',
      'cash_amount',
      'bond_amount',
      'deposit_amount',
      'purchaser_type',
      'finance_managed_by',
      'reservation_required',
      'reservation_amount',
      'reservation_amount_type',
      'reservation_treatment',
      'reservation_payable_to',
      'reservation_status',
      'reservation_paid_date',
      'reservation_proof_document',
      'reservation_proof_uploaded_at',
      'reservation_payment_details',
      'reservation_requested_at',
      'reservation_email_sent_at',
      'reservation_reviewed_at',
      'reservation_reviewed_by',
      'reservation_review_notes',
      'alteration_charge_treatment',
      'onboarding_status',
      'onboarding_completed_at',
      'external_onboarding_submitted_at',
      'current_main_stage',
      'current_sub_stage_summary',
      'risk_status',
      'assigned_agent',
      'assigned_agent_email',
      'assigned_attorney_email',
      'assigned_bond_originator_email',
      'bond_workspace_id',
      'bond_region_id',
      'bond_workspace_unit_id',
      'primary_bond_consultant_user_id',
      'bank',
      'expected_transfer_date',
      'comment',
      'owner_user_id',
      'access_level',
      'is_active',
      'lifecycle_state',
      'registered_at',
      'completed_at',
      'archived_at',
      'cancelled_at',
      'registration_date',
      'title_deed_number',
    ])
    query = await client
      .from('transactions')
      .select(
        selectWithoutKnownMissingColumns(
          'id, unit_id, buyer_id, sales_price, purchase_price, cash_amount, bond_amount, deposit_amount, finance_type, onboarding_status, onboarding_completed_at, external_onboarding_submitted_at, stage, attorney, bond_originator, next_action, updated_at, created_at',
        ),
      )
      .eq('id', transactionId)
      .maybeSingle()
  }

  if (query.error) {
    throw query.error
  }

  return query.data || null
}

export async function resolveTransactionIdFromBondApplicationId(client, applicationId) {
  const normalizedApplicationId = normalizeTextValue(applicationId)
  if (!normalizedApplicationId) return ''

  const query = await client
    .from('transaction_bond_applications')
    .select('transaction_id')
    .eq('id', normalizedApplicationId)
    .maybeSingle()

  if (query.error) {
    if (
      isMissingTableError(query.error, 'transaction_bond_applications') ||
      isMissingSchemaError(query.error) ||
      isPermissionDeniedError(query.error)
    ) {
      return ''
    }
    console.warn('[transaction-detail] unable to resolve bond application route id', {
      applicationId: normalizedApplicationId,
      message: query.error?.message || 'Unknown bond application lookup failure.',
    })
    return ''
  }

  return normalizeTextValue(query.data?.transaction_id)
}

export async function buildTransactionWorkspaceShellFromTransaction(client, transaction, { cacheKey, timer = null, routeOnly = false } = {}) {
  const [hydratedTransaction] = routeOnly ? [transaction] : await hydrateMatterPropertyContext(client, [transaction])
  transaction = hydratedTransaction || transaction
  const [buyerQuery, developmentQuery, developmentProfile] = await Promise.all([
    !routeOnly && transaction?.buyer_id
      ? client.from('buyers').select('id, name, phone, email').eq('id', transaction.buyer_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    !routeOnly && transaction?.development_id
      ? client.from('developments').select('id, name, location').eq('id', transaction.development_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    !routeOnly && transaction?.development_id
      ? fetchDevelopmentProfile(client, transaction.development_id, { strictMedia: false })
      : Promise.resolve(null),
  ])
  timer?.mark('transaction_shell_relations_ready')
  if (buyerQuery.error && !isMissingSchemaError(buyerQuery.error)) throw buyerQuery.error
  if (developmentQuery.error && !isMissingSchemaError(developmentQuery.error)) throw developmentQuery.error

  const buyer = buyerQuery.data || (Array.isArray(transaction.buyer) ? transaction.buyer[0] : transaction.buyer) || null
  const development = transaction.property_development || transaction.propertyDevelopment || (developmentQuery.data
    ? { ...developmentQuery.data, profile: developmentProfile || null, developmentProfile: developmentProfile || null }
    : null)
  const stage = normalizeStage(transaction.stage, transaction.stage || 'Transfer in Progress')
  const mainStage = normalizeMainStage(transaction.current_main_stage, stage)
  const attorneyStage = resolveAttorneyOperationalStageKey({ transaction })
  const shell = {
    unit: transaction.property_unit || transaction.propertyUnit || null,
    development,
    transaction,
    buyer,
    documents: [], clientPortalLinks: [], clientIssues: [], alterationRequests: [], serviceReviews: [],
    trustInvestmentForm: getDefaultTrustInvestmentForm({ developmentId: transaction.development_id || null, unitId: null, transaction, buyer }),
    handover: getDefaultHandoverRecord({ developmentId: transaction.development_id || null, unitId: null, transaction, buyer }),
    occupationalRent: getDefaultOccupationalRentRecord({ developmentId: transaction.development_id || null, unitId: null, transaction, buyer }),
    transactionSubprocesses: buildDefaultSubprocessState(transaction.id, { financeType: transaction.finance_type }),
    onboarding: null, onboardingFormData: null,
    purchaserType: normalizePurchaserType(transaction.purchaser_type),
    purchaserTypeLabel: getPurchaserTypeLabel(transaction.purchaser_type),
    transactionRequiredDocuments: [], transactionParticipants: [],
    activeViewerRole: 'developer',
    activeViewerPermissions: getRolePermissions({ role: 'developer', financeManagedBy: transaction.finance_managed_by }),
    transactionDiscussion: [], transactionStatusLink: null, transactionEvents: [],
    documentRequests: [], documentRequestSummary: summarizeDocumentRequests([]),
    transactionChecklistItems: [], checklistSummary: summarizeChecklistItems([], { stageKey: attorneyStage }),
    issueOverrides: [], developmentSettings: DEFAULT_DEVELOPMENT_SETTINGS,
    requiredDocumentChecklist: [], documentSummary: { uploadedCount: 0, totalRequired: 0, missingCount: 0 },
    stage, mainStage, __isShell: true, __loadedAt: new Date().toISOString(),
  }
  if (cacheKey) writeTimedCache(unitWorkspaceShellCache, cacheKey, shell)
  return shell
}

export async function fetchTransactionCoreById(transactionId) {
  if (!transactionId) {
    return null
  }

  const normalizedTransactionId = String(transactionId).trim()
  const cached = readTimedCache(unitWorkspaceShellCache, normalizedTransactionId, UNIT_WORKSPACE_SHELL_CACHE_TTL_MS)
  if (cached) return cached
  const client = requireClient()
  const transaction = await fetchTransactionRowById(client, normalizedTransactionId)
  if (transaction?.id && transaction.is_active !== false) {
    return buildTransactionWorkspaceShellFromTransaction(client, transaction, { cacheKey: normalizedTransactionId })
  }
  const resolvedTransactionId = await resolveTransactionIdFromBondApplicationId(client, transactionId)
  if (!resolvedTransactionId || resolvedTransactionId === transactionId) {
    return null
  }

  return fetchTransactionCoreById(resolvedTransactionId)
}

export const TRANSACTION_ROUTE_CORE_SELECT =
  'id, development_id, unit_id, listing_id, buyer_id, buyer:buyers!transactions_buyer_id_fkey(id,name,phone,email), onboarding_status, onboarding_completed_at, seller_onboarding_status, seller_name, seller_email, seller_phone, registered_at, completed_at, assigned_attorney_email, purchaser_type, finance_managed_by, matter_number, transaction_type, property_type, property_tenure, property_address_line_1, property_address_line_2, suburb, city, province, property_description, purchase_price, sales_price, finance_type, seller_has_existing_bond, existing_bond, cancellation_required, routing_profile_version, routing_profile_json, lifecycle_state, current_main_stage, current_sub_stage_summary, current_detailed_stage, operational_state, stage, attorney, bond_originator, next_action, updated_at, created_at'

export async function fetchTransactionRouteCoreById(transactionId) {
  if (!transactionId) return null

  const normalizedTransactionId = String(transactionId).trim()
  const cached = readTimedCache(
    transactionRouteCoreCache,
    normalizedTransactionId,
    UNIT_WORKSPACE_SHELL_CACHE_TTL_MS,
  )
  if (cached) return cached

  const client = requireClient()
  const query = await client
    .from('transactions')
    .select(TRANSACTION_ROUTE_CORE_SELECT)
    .eq('id', normalizedTransactionId)
    .maybeSingle()
  if (query.error) throw query.error

  if (query.data?.id) {
    const shell = await buildTransactionWorkspaceShellFromTransaction(client, query.data, { routeOnly: true })
    const routeCore = { ...shell, __isRouteCore: true }
    writeTimedCache(transactionRouteCoreCache, normalizedTransactionId, routeCore)
    return routeCore
  }

  const resolvedTransactionId = await resolveTransactionIdFromBondApplicationId(client, normalizedTransactionId)
  if (!resolvedTransactionId || resolvedTransactionId === normalizedTransactionId) return null
  return fetchTransactionRouteCoreById(resolvedTransactionId)
}

export async function fetchTransactionPropertyContextById(transactionId) {
  const core = await fetchTransactionRouteCoreById(transactionId)
  if (!core?.transaction?.id) return null
  const [transaction] = await hydrateMatterPropertyContext(requireClient(), [core.transaction])
  return {
    transaction,
    unit: transaction?.property_unit || transaction?.propertyUnit || null,
    development: transaction?.property_development || transaction?.propertyDevelopment || null,
  }
}
