import { DOCUMENTS_BUCKET, createScopedSupabaseClient, invokeEdgeFunction, supabase } from './supabaseClient'
import {
  MAIN_PROCESS_STAGES,
  STAGES,
  getDetailedStageFromMainStage,
  getMainStageFromDetailedStage,
  getMainStageIndex,
  getStageIndex,
  getSummaryStats,
  isInTransferStage,
  normalizeStageLabel,
} from '../core/transactions/stageConfig'
import { selectReportStageSummary } from '../core/transactions/selectors'
import {
  deriveOnboardingConfiguration,
  getOnboardingStepDefinitions,
  getPersonaFormConfig,
  getPurchaserTypeLabel,
  getRequiredDocumentsForPurchaserType,
  getTransactionPurchaserTypeValue,
  normalizePurchaserType,
  validateOnboardingSubmission,
} from './purchaserPersonas'
import { DEFAULT_DOCUMENT_REQUIREMENTS } from '../core/documents/documentRequirementRules'
import {
  DOCUMENT_VAULT_GROUP_DEFINITIONS,
  buildTemplateMap,
  getGroupByKey,
  normalizeRequiredStatus,
  statusFromLegacyFlags,
} from '../core/documents/documentVaultArchitecture'
import {
  normalizePortalDocumentType,
  resolvePortalDocumentMetadata,
} from '../core/documents/portalDocumentMetadata'
import {
  CANONICAL_FINANCE_TYPES,
  financeTypeMatchesFilter,
  isBondFinanceType,
  normalizeFinanceType,
} from '../core/transactions/financeType'
import {
  OTP_DOCUMENT_TYPES,
  normalizeOtpDocumentType,
  resolveSalesWorkflowSnapshot,
} from '../core/transactions/salesWorkflow'
import { getFinanceWorkflowTemplate } from '../core/transactions/financeWorkflow'
import {
  getAttorneyMockDevelopmentDetail,
  getAttorneyMockTransactionDetail,
  getAttorneyMockTransactionDetailByUnitId,
} from '../core/transactions/attorneyMockData'
import {
  ATTORNEY_OPERATIONAL_STAGE_SEQUENCE,
  buildDefaultChecklistItemsForStage,
  normalizeChecklistItemStatus,
  normalizeDocumentRequestPriority,
  normalizeDocumentRequestStatus,
  resolveAttorneyOperationalStageKey,
} from '../core/transactions/attorneyOperationalEngine'
import {
  EXTERNAL_ACCESS_ROLES,
  SUBPROCESS_DEFAULT_OWNERS,
  SUBPROCESS_STEP_STATUSES,
  SUBPROCESS_STEP_TEMPLATES,
  SUBPROCESS_TYPES,
  TRANSACTION_ROLE_LABELS,
} from '../core/transactions/roleConfig'
import { getRolePermissions, normalizeFinanceManagedBy, normalizeRoleType } from '../core/transactions/permissions'
import { resolveWorkflowLanePermissions } from '../core/workflows/permissions'
import { DEFAULT_APP_ROLE, normalizeAppRole } from './roles'
import { createPerfTimer } from './performanceTrace'

export {
  EXTERNAL_ACCESS_ROLES,
  FINANCE_MANAGED_BY_OPTIONS,
  SUBPROCESS_OWNER_TYPES,
  SUBPROCESS_STEP_STATUSES,
  SUBPROCESS_TYPES,
  TRANSACTION_ROLE_LABELS,
  TRANSACTION_ROLE_TYPES,
} from '../core/transactions/roleConfig'

export const FINANCE_TYPES = [...CANONICAL_FINANCE_TYPES]
export const RISK_STATUSES = ['On Track', 'At Risk', 'Delayed', 'Blocked']
export const CLIENT_ISSUE_STATUSES = ['Open', 'In Progress', 'Addressed', 'Resolved', 'Completed', 'Closed']
export const ALTERATION_REQUEST_STATUSES = [
  'Pending Review',
  'Approved',
  'Declined',
  'Quote Sent',
  'Accepted',
  'In Progress',
  'Completed',
]
export const TRUST_INVESTMENT_FORM_STATUSES = ['Not Started', 'In Progress', 'Submitted', 'Reviewed', 'Approved']
export const ONBOARDING_STATUSES = ['Not Started', 'In Progress', 'Submitted', 'Reviewed', 'Approved']
export const ONBOARDING_LIFECYCLE_STATUSES = [
  'transaction_created',
  'awaiting_client_onboarding',
  'client_onboarding_complete',
  'otp_uploaded',
  'awaiting_signed_otp',
  'signed_otp_received',
  'awaiting_supporting_documents',
  'documents_in_review',
]
export const REVIEW_ELIGIBLE_STAGES = new Set(['Registered', 'Handover Complete', 'Occupied'])
export const HANDOVER_STATUSES = ['not_started', 'in_progress', 'completed']
export const OCCUPATIONAL_RENT_STATUSES = ['not_applicable', 'pending_setup', 'active', 'overdue', 'settled', 'closed']
export const PROFILE_ROLE_VALUES = ['developer', 'agent', 'attorney', 'bond_originator', 'client', 'buyer', 'seller', 'internal_admin']
export const FIRM_TYPE_VALUES = ['attorney', 'developer', 'agency']
export const FIRM_ROLE_VALUES = ['firm_admin', 'lead_attorney', 'attorney', 'paralegal', 'admin_staff', 'developer', 'agent', 'viewer', 'buyer', 'seller']
export const TRANSACTION_ACCESS_LEVEL_VALUES = ['private', 'shared', 'restricted']
export const STAKEHOLDER_STATUS_VALUES = ['draft', 'invited', 'active', 'removed']
export const ATTORNEY_LEGAL_ROLE_VALUES = ['transfer', 'bond', 'cancellation']
export const ATTORNEY_LEGAL_ROLE_REQUIRED = ['transfer']
export const RESERVATION_STATUSES = ['not_required', 'pending', 'paid', 'verified', 'rejected']
export const FUNDING_SOURCE_STATUSES = ['planned', 'pending', 'paid', 'verified']
const DISCUSSION_TYPES = ['operational', 'blocker', 'document', 'decision', 'client', 'finance', 'legal', 'system']
const WORKFLOW_COMMENT_META_PREFIX = '__bridge_workflow_meta__'
export const TRANSACTION_EVENT_TYPES = [
  'TransactionCreated',
  'TransactionUpdated',
  'TransactionStageChanged',
  'DocumentUploaded',
  'DocumentVisibilityChanged',
  'CommentAdded',
  'ParticipantAssigned',
  'WorkflowStepUpdated',
  'StatusLinkCreated',
  'OccupationalRentUpdated',
]
export const TRANSACTION_NOTIFICATION_TYPES = [
  'participant_assigned',
  'document_uploaded',
  'readiness_updated',
  'lane_handoff',
  'registration_completed',
  'overdue_missing_docs',
]
export const DOCUMENT_REQUEST_STATUS_TYPES = ['requested', 'uploaded', 'reviewed', 'rejected', 'completed']
export const DOCUMENT_REQUEST_PRIORITY_TYPES = ['required', 'important', 'optional']
export const CHECKLIST_ITEM_STATUS_TYPES = ['pending', 'in_progress', 'completed', 'blocked', 'waived']
export const TRANSACTION_ISSUE_TYPES = [
  'missing_required_documents',
  'stage_blocked',
  'no_activity_warning',
  'no_activity_risk',
  'document_rejected',
  'waiting_on_client',
  'waiting_on_attorney',
  'waiting_on_bank',
  'guarantees_missing',
  'clearance_missing',
  'overdue_requests',
]
export const TRANSACTION_LIFECYCLE_STATES = ['active', 'registered', 'completed', 'archived', 'cancelled']
export const TRANSACTION_TYPE_VALUES = ['developer_sale', 'private_property']
export const TRANSACTION_PROPERTY_TYPE_VALUES = ['residential', 'commercial', 'farm']

const HOMEOWNER_DOCUMENT_CATALOG = [
  {
    key: 'nhbrc_documents',
    label: 'NHBRC Documents',
    description: 'NHBRC enrolment and warranty certificates for your home.',
    keywords: ['nhbrc'],
  },
  {
    key: 'roof_warranty_documents',
    label: 'Warranty Documents (Roof)',
    description: 'Roof covering and workmanship warranty information.',
    keywords: ['roof', 'warranty'],
  },
  {
    key: 'body_corporate_info',
    label: 'Body Corporate Info',
    description: 'Body corporate rules, contacts, and governance pack.',
    keywords: ['body corporate', 'bc', 'rules'],
  },
  {
    key: 'whatsapp_group',
    label: 'WhatsApp Group',
    description: 'Community group links and communication channels.',
    keywords: ['whatsapp', 'group', 'community link'],
  },
  {
    key: 'occupancy_certificates',
    label: 'Occupancy Certificates',
    description: 'Occupation and compliance certificates for handover.',
    keywords: ['occupancy', 'occupation certificate'],
  },
]

const DEFAULT_DEVELOPMENT_SETTINGS = {
  client_portal_enabled: true,
  snag_reporting_enabled: true,
  alteration_requests_enabled: false,
  service_reviews_enabled: false,
  reservation_deposit_enabled_by_default: false,
  reservation_deposit_amount: null,
  reservation_deposit_payment_details: {
    account_holder_name: '',
    bank_name: '',
    account_number: '',
    branch_code: '',
    account_type: '',
    payment_reference_format: '',
    payment_instructions: '',
  },
  reservation_deposit_notification_recipients: [],
  enabledModules: {
    agent: true,
    conveyancing: true,
    bond_originator: true,
  },
  stakeholderTeams: {
    agents: [],
    conveyancers: [],
    bondOriginators: [],
  },
}

const DEVELOPMENT_TEAM_ROLE_MAP = {
  agents: {
    roleType: 'agent',
    nameFields: ['name', 'contactName'],
    emailFields: ['email', 'contactEmail'],
    organisationFields: ['company', 'agency'],
  },
  conveyancers: {
    roleType: 'attorney',
    nameFields: ['firmName', 'name', 'contactName'],
    emailFields: ['email', 'contactEmail'],
    organisationFields: ['firmName', 'company'],
  },
  bondOriginators: {
    roleType: 'bond_originator',
    nameFields: ['name', 'contactName'],
    emailFields: ['email', 'contactEmail'],
    organisationFields: ['company', 'name'],
  },
}

const ATTORNEY_CLOSEOUT_DOCUMENT_DEFINITIONS = [
  {
    key: 'attorney_invoice',
    label: 'Attorney Invoice',
    requiredForCloseOut: true,
    visibleToDeveloper: true,
    visibleToAttorney: true,
    internalOnly: false,
    sortOrder: 1,
  },
  {
    key: 'attorney_statement',
    label: 'Attorney Statement',
    requiredForCloseOut: true,
    visibleToDeveloper: true,
    visibleToAttorney: true,
    internalOnly: false,
    sortOrder: 2,
  },
  {
    key: 'registration_confirmation',
    label: 'Registration Confirmation',
    requiredForCloseOut: true,
    visibleToDeveloper: true,
    visibleToAttorney: true,
    internalOnly: false,
    sortOrder: 3,
  },
  {
    key: 'signed_transfer_documents',
    label: 'Signed Transfer Documents',
    requiredForCloseOut: true,
    visibleToDeveloper: true,
    visibleToAttorney: true,
    internalOnly: false,
    sortOrder: 4,
  },
  {
    key: 'financial_settlement_documents',
    label: 'Financial Settlement Documents',
    requiredForCloseOut: true,
    visibleToDeveloper: true,
    visibleToAttorney: true,
    internalOnly: false,
    sortOrder: 5,
  },
  {
    key: 'final_title_deed_copy',
    label: 'Final Title Deed Copy',
    requiredForCloseOut: false,
    visibleToDeveloper: true,
    visibleToAttorney: true,
    internalOnly: false,
    sortOrder: 6,
  },
]

const ATTORNEY_CLOSEOUT_STATUS_VALUES = ['not_started', 'in_progress', 'ready_to_close', 'closed']
const ATTORNEY_RECONCILIATION_STATUS_VALUES = [
  'not_budgeted',
  'budgeted',
  'awaiting_invoice',
  'awaiting_statement',
  'awaiting_review',
  'reconciled',
]

const DEFAULT_DEVELOPMENT_ATTORNEY_CONFIG = {
  id: null,
  developmentId: null,
  attorneyFirmName: '',
  attorneyFirmId: null,
  primaryContactName: '',
  primaryContactEmail: '',
  primaryContactPhone: '',
  feeModelType: 'fixed_fee',
  defaultFeeAmount: null,
  vatIncluded: true,
  disbursementsIncluded: false,
  overrideAllowed: true,
  notes: '',
  activeFrom: '',
  activeTo: '',
  isActive: true,
  requiredDocuments: ATTORNEY_CLOSEOUT_DOCUMENT_DEFINITIONS.map((item) => ({ ...item })),
}

const BOND_CLOSEOUT_DOCUMENT_DEFINITIONS = [
  {
    key: 'commission_statement',
    label: 'Commission Statement',
    requiredForCloseOut: true,
    visibleToDeveloper: true,
    visibleToBondOriginator: true,
    internalOnly: false,
    sortOrder: 1,
  },
  {
    key: 'bond_approval_confirmation',
    label: 'Bond Approval Confirmation',
    requiredForCloseOut: true,
    visibleToDeveloper: true,
    visibleToBondOriginator: true,
    internalOnly: false,
    sortOrder: 2,
  },
  {
    key: 'commission_tax_invoice',
    label: 'Commission Tax Invoice',
    requiredForCloseOut: true,
    visibleToDeveloper: true,
    visibleToBondOriginator: true,
    internalOnly: false,
    sortOrder: 3,
  },
]

const BOND_CLOSEOUT_STATUS_VALUES = ['not_started', 'in_progress', 'ready_to_close', 'closed']
const BOND_RECONCILIATION_STATUS_VALUES = [
  'not_budgeted',
  'budgeted',
  'awaiting_statement',
  'awaiting_confirmation',
  'awaiting_review',
  'reconciled',
]

const DEFAULT_DEVELOPMENT_BOND_CONFIG = {
  id: null,
  developmentId: null,
  bondOriginatorName: '',
  bondOriginatorId: null,
  primaryContactName: '',
  primaryContactEmail: '',
  primaryContactPhone: '',
  commissionModelType: 'fixed_fee',
  defaultCommissionAmount: null,
  vatIncluded: true,
  overrideAllowed: true,
  notes: '',
  activeFrom: '',
  activeTo: '',
  isActive: true,
  requiredDocuments: BOND_CLOSEOUT_DOCUMENT_DEFINITIONS.map((item) => ({ ...item })),
}

const DEFAULT_DEVELOPMENT_PROFILE = {
  code: '',
  location: '',
  suburb: '',
  city: '',
  province: '',
  country: 'South Africa',
  address: '',
  description: '',
  status: 'Planning',
  developerCompany: '',
  launchDate: '',
  expectedCompletionDate: '',
  plans: [],
  sitePlans: [],
  imageLinks: [],
  supportingDocuments: [],
  marketingContent: {
    listingOverview: {
      listingTitle: '',
      shortTitle: '',
      locationLabel: '',
      address: '',
      suburb: '',
      city: '',
      province: '',
      listingStatus: 'draft',
      listingDescription: '',
      shortDescription: '',
      seoTitle: '',
      seoMetaDescription: '',
    },
    keySellingPoints: {
      keyHighlights: '',
      lifestyleSellingPoints: '',
      buyerAppealNotes: '',
      nearbyAmenitiesSummary: '',
      securityEstateFeatures: '',
      whyThisDevelopment: '',
    },
    mediaLibrary: {
      heroImageUrl: '',
      galleryImageUrls: '',
      developmentLogoUrl: '',
      sitePlanUrl: '',
      masterplanUrl: '',
      floorplanUrls: '',
      videoUrl: '',
      virtualTourUrl: '',
    },
    downloads: {
      brochureUrl: '',
      pricingSheetUrl: '',
      specSheetUrl: '',
      salesPackUrl: '',
      investmentPackUrl: '',
      termsPdfUrl: '',
      applicationFormUrl: '',
    },
    externalLinks: {
      developmentLandingPageUrl: '',
      googleMapsUrl: '',
      externalWebsiteUrl: '',
      salesPortalUrl: '',
      whatsappEnquiryUrl: '',
      bookingViewingUrl: '',
    },
    listingConfiguration: {
      showOnListingWebsite: false,
      featuredDevelopment: false,
      displayOrder: '',
      listingSlug: '',
      ctaLabel: '',
      ctaUrl: '',
      marketingStatus: 'draft',
      publicVisibility: false,
    },
  },
}

const DEFAULT_DEVELOPMENT_FINANCIALS = {
  id: null,
  developmentId: null,
  landCost: null,
  buildCost: null,
  professionalFees: null,
  marketingCost: null,
  infrastructureCost: null,
  otherCosts: null,
  totalProjectedCost: null,
  projectedGrossSalesValue: null,
  projectedProfit: null,
  targetMargin: null,
  notes: '',
}

const EMPTY_DASHBOARD_METRICS = {
  totalDevelopments: 0,
  totalUnits: 0,
  activeTransactions: 0,
  unitsInTransfer: 0,
  unitsRegistered: 0,
  totalRevenue: 0,
}
const SNAPSHOT_OWNER_KEY_STORAGE = 'itg:snapshot-owner-key'

function requireClient() {
  if (!supabase) {
    throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_KEY to .env.')
  }

  return supabase
}

function requireScopedClient(headers = {}) {
  const client = createScopedSupabaseClient(headers)
  if (!client) {
    throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_KEY to .env.')
  }
  return client
}

function requireClientPortalTokenClient(token) {
  return requireScopedClient({
    'x-bridge-client-portal-token': String(token || '').trim(),
  })
}

function requireOnboardingTokenClient(token) {
  return requireScopedClient({
    'x-bridge-onboarding-token': String(token || '').trim(),
  })
}

function requireStatusTokenClient(token) {
  return requireScopedClient({
    'x-bridge-status-token': String(token || '').trim(),
  })
}

function requireSnapshotTokenClient(token) {
  return requireScopedClient({
    'x-bridge-snapshot-token': String(token || '').trim(),
  })
}

function requireExternalAccessTokenClient(token) {
  return requireScopedClient({
    'x-bridge-external-access-token': String(token || '').trim(),
  })
}

function isMissingTableError(error, tableName) {
  if (!error) {
    return false
  }

  const message = String(error.message || '').toLowerCase()
  if (message.includes('permission denied')) {
    return false
  }
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    message.includes(`table`) && message.includes(String(tableName || '').toLowerCase())
  )
}

function isMissingColumnError(error, columnName) {
  if (!error) {
    return false
  }

  const message = String(error.message || '').toLowerCase()
  const details = String(error.details || '').toLowerCase()
  const hint = String(error.hint || '').toLowerCase()
  const normalizedColumnName = String(columnName || '').trim().toLowerCase()
  if (message.includes('permission denied')) {
    return false
  }
  const missingColumnByCode = error.code === '42703' || error.code === 'PGRST204'
  const hasNamedColumnMatch = normalizedColumnName
    ? message.includes(normalizedColumnName) || details.includes(normalizedColumnName) || hint.includes(normalizedColumnName)
    : true
  if (missingColumnByCode) {
    return hasNamedColumnMatch
  }
  return normalizedColumnName ? message.includes('column') && message.includes(normalizedColumnName) : message.includes('column')
}

const knownMissingSchemaColumns = new Set()

function registerKnownMissingColumns(error, columnNames = []) {
  if (!error) {
    return false
  }

  let registered = false
  const message = String(error.message || '')
  const details = String(error.details || '')
  const hint = String(error.hint || '')
  const parseSources = [message, details, hint]
  const regexes = [
    /column\s+(?:[a-zA-Z0-9_]+\.)?([a-zA-Z0-9_]+)\s+does not exist/gi,
    /could not find the ['"]([a-zA-Z0-9_]+)['"] column/gi,
  ]

  for (const source of parseSources) {
    for (const pattern of regexes) {
      pattern.lastIndex = 0
      let match = pattern.exec(source)
      while (match) {
        const normalized = String(match[1] || '').trim().toLowerCase()
        if (normalized && !knownMissingSchemaColumns.has(normalized)) {
          knownMissingSchemaColumns.add(normalized)
          registered = true
        }
        match = pattern.exec(source)
      }
    }
  }

  for (const columnName of columnNames) {
    const normalized = String(columnName || '').trim().toLowerCase()
    if (!normalized) {
      continue
    }
    if (isMissingColumnError(error, normalized)) {
      knownMissingSchemaColumns.add(normalized)
      registered = true
    }
  }

  return registered
}

function selectWithoutKnownMissingColumns(selectClause) {
  const clause = String(selectClause || '').trim()
  if (!clause || !knownMissingSchemaColumns.size) {
    return clause
  }

  const fields = clause
    .split(',')
    .map((part) => String(part || '').trim())
    .filter(Boolean)

  const filtered = fields.filter((field) => {
    const normalizedField = field
      .replace(/\s+as\s+.+$/i, '')
      .trim()
      .toLowerCase()
    return !knownMissingSchemaColumns.has(normalizedField)
  })

  return (filtered.length ? filtered : fields).join(', ')
}

function isPermissionDeniedError(error) {
  if (!error) {
    return false
  }

  const message = String(error.message || '').toLowerCase()
  return error.code === '42501' || message.includes('permission denied')
}

function isMissingSchemaError(error) {
  if (!error) {
    return false
  }

  return ['42P01', 'PGRST205', '42703', 'PGRST204'].includes(error.code)
}

function isOnConflictConstraintError(error, conflictColumn = '') {
  if (!error) {
    return false
  }

  const message = String(error.message || '').toLowerCase()
  const details = String(error.details || '').toLowerCase()
  const hint = String(error.hint || '').toLowerCase()
  const normalizedConflictColumn = String(conflictColumn || '').trim().toLowerCase()
  const missingConstraintMessage = 'there is no unique or exclusion constraint matching the on conflict specification'
  const mentionsMissingConstraint =
    message.includes(missingConstraintMessage) || details.includes(missingConstraintMessage)
  const mentionsOnConflict = message.includes('on conflict') || details.includes('on conflict') || hint.includes('on conflict')
  const mentionsConflictColumn = normalizedConflictColumn
    ? message.includes(normalizedConflictColumn) || details.includes(normalizedConflictColumn) || hint.includes(normalizedConflictColumn)
    : false

  return error.code === '42P10' || mentionsMissingConstraint || (mentionsOnConflict && mentionsConflictColumn)
}

async function upsertByDevelopmentIdWithFallback(
  client,
  {
    table,
    payload,
    selectClause = '',
    expectSingleRow = false,
  } = {},
) {
  let updateQuery = client.from(table).update(payload).eq('development_id', payload.development_id)
  if (selectClause) {
    updateQuery = updateQuery.select(selectClause).maybeSingle()
  } else {
    updateQuery = updateQuery.select('development_id').maybeSingle()
  }
  const updateResult = await updateQuery
  if (!updateResult.error && updateResult.data) {
    return {
      data: selectClause ? updateResult.data : null,
      error: null,
    }
  }

  if (updateResult.error && !isOnConflictConstraintError(updateResult.error, 'development_id')) {
    return updateResult
  }

  let insertQuery = client.from(table).insert(payload)
  if (selectClause) {
    insertQuery = insertQuery.select(selectClause)
  }
  if (expectSingleRow) {
    insertQuery = insertQuery.single()
  }
  return await insertQuery
}

async function queryClientIssues(client, { unitId = null, unitIds = [] } = {}) {
  const selectVariants = [
    'id, development_id, unit_id, transaction_id, buyer_id, category, description, location, priority, photo_path, signed_off_by, signed_off_at, status, created_at, updated_at',
    'id, development_id, unit_id, transaction_id, buyer_id, category, description, location, priority, photo_path, status, created_at, updated_at',
    'id, development_id, unit_id, buyer_id, category, description, location, priority, photo_path, status, created_at, updated_at',
    'id, development_id, unit_id, buyer_id, category, description, location, priority, status, created_at',
  ]

  let lastError = null

  for (const selectClause of selectVariants) {
    let query = client.from('client_issues').select(selectClause).order('created_at', { ascending: false })

    if (unitId) {
      query = query.eq('unit_id', unitId)
    } else if (unitIds.length) {
      query = query.in('unit_id', unitIds)
    }

    const result = await query
    if (!result.error) {
      return result
    }

    lastError = result.error

    if (
      !isMissingColumnError(result.error, 'transaction_id') &&
      !isMissingColumnError(result.error, 'signed_off_by') &&
      !isMissingColumnError(result.error, 'signed_off_at') &&
      !isMissingColumnError(result.error, 'photo_path') &&
      !isMissingColumnError(result.error, 'updated_at')
    ) {
      return result
    }
  }

  return { data: null, error: lastError }
}

function isFinanceTypeConstraintError(error) {
  if (!error) {
    return false
  }

  const message = String(error.message || '').toLowerCase()
  return (
    error.code === '23514' &&
    (message.includes('transactions_finance_type_check') || message.includes('finance_type'))
  )
}

function getFallbackOwnerKey() {
  if (typeof window === 'undefined') {
    return 'anon:server'
  }

  let ownerKey = window.localStorage.getItem(SNAPSHOT_OWNER_KEY_STORAGE)
  if (!ownerKey) {
    ownerKey = `anon:${crypto.randomUUID()}`
    window.localStorage.setItem(SNAPSHOT_OWNER_KEY_STORAGE, ownerKey)
  }

  return ownerKey
}

function normalizeTextValue(value) {
  const text = String(value || '').trim()
  return text
}

function normalizeNullableText(value) {
  const text = String(value || '').trim()
  return text || null
}

function normalizeEmailAddress(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  return normalized || ''
}

function normalizeManualSectionCompletion(value) {
  const defaults = {
    identity: false,
    employment: false,
    purchase_structure: false,
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return defaults
  }

  return {
    identity: Boolean(value.identity),
    employment: Boolean(value.employment),
    purchase_structure: Boolean(value.purchase_structure),
  }
}

function normalizeDocumentVisibilityScope(value, fallback = 'internal') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  return ['internal', 'shared', 'client'].includes(normalized) ? normalized : fallback
}

function normalizeTransactionAccessLevel(value, fallback = 'shared') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  return TRANSACTION_ACCESS_LEVEL_VALUES.includes(normalized) ? normalized : fallback
}

function normalizeStoredTransactionType(value, fallback = 'developer_sale') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()

  if (!normalized) {
    return fallback
  }

  if (normalized === 'development' || normalized === 'developer_sale') {
    return 'developer_sale'
  }

  if (normalized === 'private' || normalized === 'private_property') {
    return 'private_property'
  }

  return fallback
}

function isPrivateTransactionType(value) {
  return normalizeStoredTransactionType(value, 'private_property') === 'private_property'
}

function normalizeTransactionPropertyType(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  return TRANSACTION_PROPERTY_TYPE_VALUES.includes(normalized) ? normalized : null
}

function normalizeStakeholderStatus(value, fallback = 'draft') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  return STAKEHOLDER_STATUS_VALUES.includes(normalized) ? normalized : fallback
}

function normalizeAttorneyLegalRole(value, fallback = 'none') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  if (!normalized) {
    return fallback
  }
  if (normalized === 'none') {
    return 'none'
  }
  if (normalized === 'transfer') {
    return 'transfer'
  }
  if (normalized === 'bond') {
    return 'bond'
  }
  if (normalized === 'cancellation') {
    return 'cancellation'
  }
  return fallback
}

function normalizeFirmType(value, fallback = 'attorney') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  return FIRM_TYPE_VALUES.includes(normalized) ? normalized : fallback
}

function normalizeFirmRole(value, fallback = 'attorney') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  return FIRM_ROLE_VALUES.includes(normalized) ? normalized : fallback
}

function isInternalStakeholderRole(roleType) {
  const normalized = normalizeRoleType(roleType)
  return ['developer', 'internal_admin', 'attorney', 'agent', 'bond_originator'].includes(normalized)
}

function normalizeEventType(value) {
  return TRANSACTION_EVENT_TYPES.includes(value) ? value : 'TransactionUpdated'
}

function normalizeNotificationType(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()

  return TRANSACTION_NOTIFICATION_TYPES.includes(normalized) ? normalized : 'readiness_updated'
}

function normalizeDocumentRequestStatusValue(value) {
  return normalizeDocumentRequestStatus(value)
}

function normalizeDocumentRequestPriorityValue(value) {
  return normalizeDocumentRequestPriority(value)
}

function normalizeChecklistItemStatusValue(value) {
  return normalizeChecklistItemStatus(value)
}

function normalizeAttorneyStageValue(value, fallback = 'instruction_received') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  if (ATTORNEY_OPERATIONAL_STAGE_SEQUENCE.some((item) => item.key === normalized)) {
    return normalized
  }
  return fallback
}

function normalizeIssueTypeValue(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  return TRANSACTION_ISSUE_TYPES.includes(normalized) ? normalized : 'stage_blocked'
}

function normalizeTransactionLifecycleStateValue(value, fallback = 'active') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  return TRANSACTION_LIFECYCLE_STATES.includes(normalized) ? normalized : fallback
}

function normalizeRequestRoleScope(value, fallback = 'client') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
  if (!normalized) {
    return fallback
  }
  if (normalized === 'bond') {
    return 'bond_originator'
  }
  return normalized
}

function normalizeOptionalDate(value) {
  if (!value) {
    return null
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  return date.toISOString().slice(0, 10)
}

function normalizeFundingSourceStatus(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  return FUNDING_SOURCE_STATUSES.includes(normalized) ? normalized : 'planned'
}

function normalizeFundingSourceType(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')

  if (!normalized) {
    return 'other'
  }

  return normalized
}

function normalizeFundingSources(input = []) {
  if (!Array.isArray(input)) {
    return []
  }

  return input
    .map((item) => ({
      id: item?.id || null,
      sourceType: normalizeFundingSourceType(item?.sourceType ?? item?.source_type),
      amount: normalizeOptionalNumber(item?.amount),
      expectedPaymentDate: normalizeOptionalDate(item?.expectedPaymentDate ?? item?.expected_payment_date),
      actualPaymentDate: normalizeOptionalDate(item?.actualPaymentDate ?? item?.actual_payment_date),
      proofDocument: normalizeNullableText(item?.proofDocument ?? item?.proof_document),
      status: normalizeFundingSourceStatus(item?.status),
      notes: normalizeNullableText(item?.notes),
    }))
    .filter((item) => item.amount !== null || item.proofDocument || item.expectedPaymentDate || item.actualPaymentDate)
}

function normalizeNullableBoolean(value) {
  if (value === true || value === false) {
    return value
  }

  const normalized = String(value || '')
    .trim()
    .toLowerCase()

  if (['yes', 'y', 'true', '1'].includes(normalized)) {
    return true
  }

  if (['no', 'n', 'false', '0'].includes(normalized)) {
    return false
  }

  return null
}

function generateStatusLinkToken() {
  return `status${crypto.randomUUID().replaceAll('-', '')}`
}

function normalizeListValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeTextValue(item)).filter(Boolean)
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) {
        return parsed.map((item) => normalizeTextValue(item)).filter(Boolean)
      }
    } catch {
      // Keep compatibility with plain text values.
    }
  }

  return []
}

function normalizeMarketingBoolean(value, fallback = false) {
  if (value === true || value === false) {
    return value
  }

  const normalized = String(value || '')
    .trim()
    .toLowerCase()

  if (['true', '1', 'yes', 'y'].includes(normalized)) {
    return true
  }

  if (['false', '0', 'no', 'n'].includes(normalized)) {
    return false
  }

  return fallback
}

function normalizeMarketingContent(value) {
  let source = value

  if (typeof source === 'string') {
    try {
      source = JSON.parse(source)
    } catch {
      source = {}
    }
  }

  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    source = {}
  }

  const defaults = DEFAULT_DEVELOPMENT_PROFILE.marketingContent
  const listingOverviewSource =
    source.listingOverview && typeof source.listingOverview === 'object' && !Array.isArray(source.listingOverview)
      ? source.listingOverview
      : {}
  const keySellingPointsSource =
    source.keySellingPoints && typeof source.keySellingPoints === 'object' && !Array.isArray(source.keySellingPoints)
      ? source.keySellingPoints
      : {}
  const mediaLibrarySource =
    source.mediaLibrary && typeof source.mediaLibrary === 'object' && !Array.isArray(source.mediaLibrary)
      ? source.mediaLibrary
      : {}
  const downloadsSource =
    source.downloads && typeof source.downloads === 'object' && !Array.isArray(source.downloads)
      ? source.downloads
      : {}
  const externalLinksSource =
    source.externalLinks && typeof source.externalLinks === 'object' && !Array.isArray(source.externalLinks)
      ? source.externalLinks
      : {}
  const listingConfigurationSource =
    source.listingConfiguration && typeof source.listingConfiguration === 'object' && !Array.isArray(source.listingConfiguration)
      ? source.listingConfiguration
      : {}

  return {
    listingOverview: {
      listingTitle: normalizeTextValue(
        listingOverviewSource.listingTitle ?? source.listing_title ?? defaults.listingOverview.listingTitle,
      ),
      shortTitle: normalizeTextValue(
        listingOverviewSource.shortTitle ?? source.short_title ?? defaults.listingOverview.shortTitle,
      ),
      locationLabel: normalizeTextValue(
        listingOverviewSource.locationLabel ?? source.location_label ?? defaults.listingOverview.locationLabel,
      ),
      address: normalizeTextValue(listingOverviewSource.address ?? defaults.listingOverview.address),
      suburb: normalizeTextValue(listingOverviewSource.suburb ?? defaults.listingOverview.suburb),
      city: normalizeTextValue(listingOverviewSource.city ?? defaults.listingOverview.city),
      province: normalizeTextValue(listingOverviewSource.province ?? defaults.listingOverview.province),
      listingStatus: normalizeTextValue(
        listingOverviewSource.listingStatus ?? source.listing_status ?? defaults.listingOverview.listingStatus,
      ),
      listingDescription: normalizeTextValue(
        listingOverviewSource.listingDescription ??
          source.listing_description ??
          defaults.listingOverview.listingDescription,
      ),
      shortDescription: normalizeTextValue(
        listingOverviewSource.shortDescription ??
          source.short_description ??
          defaults.listingOverview.shortDescription,
      ),
      seoTitle: normalizeTextValue(listingOverviewSource.seoTitle ?? source.seo_title ?? defaults.listingOverview.seoTitle),
      seoMetaDescription: normalizeTextValue(
        listingOverviewSource.seoMetaDescription ??
          source.seo_meta_description ??
          defaults.listingOverview.seoMetaDescription,
      ),
    },
    keySellingPoints: {
      keyHighlights: normalizeTextValue(keySellingPointsSource.keyHighlights ?? defaults.keySellingPoints.keyHighlights),
      lifestyleSellingPoints: normalizeTextValue(
        keySellingPointsSource.lifestyleSellingPoints ?? defaults.keySellingPoints.lifestyleSellingPoints,
      ),
      buyerAppealNotes: normalizeTextValue(
        keySellingPointsSource.buyerAppealNotes ?? defaults.keySellingPoints.buyerAppealNotes,
      ),
      nearbyAmenitiesSummary: normalizeTextValue(
        keySellingPointsSource.nearbyAmenitiesSummary ?? defaults.keySellingPoints.nearbyAmenitiesSummary,
      ),
      securityEstateFeatures: normalizeTextValue(
        keySellingPointsSource.securityEstateFeatures ?? defaults.keySellingPoints.securityEstateFeatures,
      ),
      whyThisDevelopment: normalizeTextValue(
        keySellingPointsSource.whyThisDevelopment ?? defaults.keySellingPoints.whyThisDevelopment,
      ),
    },
    mediaLibrary: {
      heroImageUrl: normalizeTextValue(mediaLibrarySource.heroImageUrl ?? defaults.mediaLibrary.heroImageUrl),
      galleryImageUrls: normalizeTextValue(mediaLibrarySource.galleryImageUrls ?? defaults.mediaLibrary.galleryImageUrls),
      developmentLogoUrl: normalizeTextValue(mediaLibrarySource.developmentLogoUrl ?? defaults.mediaLibrary.developmentLogoUrl),
      sitePlanUrl: normalizeTextValue(mediaLibrarySource.sitePlanUrl ?? defaults.mediaLibrary.sitePlanUrl),
      masterplanUrl: normalizeTextValue(mediaLibrarySource.masterplanUrl ?? defaults.mediaLibrary.masterplanUrl),
      floorplanUrls: normalizeTextValue(mediaLibrarySource.floorplanUrls ?? defaults.mediaLibrary.floorplanUrls),
      videoUrl: normalizeTextValue(mediaLibrarySource.videoUrl ?? defaults.mediaLibrary.videoUrl),
      virtualTourUrl: normalizeTextValue(mediaLibrarySource.virtualTourUrl ?? defaults.mediaLibrary.virtualTourUrl),
    },
    downloads: {
      brochureUrl: normalizeTextValue(downloadsSource.brochureUrl ?? defaults.downloads.brochureUrl),
      pricingSheetUrl: normalizeTextValue(downloadsSource.pricingSheetUrl ?? defaults.downloads.pricingSheetUrl),
      specSheetUrl: normalizeTextValue(downloadsSource.specSheetUrl ?? defaults.downloads.specSheetUrl),
      salesPackUrl: normalizeTextValue(downloadsSource.salesPackUrl ?? defaults.downloads.salesPackUrl),
      investmentPackUrl: normalizeTextValue(downloadsSource.investmentPackUrl ?? defaults.downloads.investmentPackUrl),
      termsPdfUrl: normalizeTextValue(downloadsSource.termsPdfUrl ?? defaults.downloads.termsPdfUrl),
      applicationFormUrl: normalizeTextValue(downloadsSource.applicationFormUrl ?? defaults.downloads.applicationFormUrl),
    },
    externalLinks: {
      developmentLandingPageUrl: normalizeTextValue(
        externalLinksSource.developmentLandingPageUrl ?? defaults.externalLinks.developmentLandingPageUrl,
      ),
      googleMapsUrl: normalizeTextValue(externalLinksSource.googleMapsUrl ?? defaults.externalLinks.googleMapsUrl),
      externalWebsiteUrl: normalizeTextValue(externalLinksSource.externalWebsiteUrl ?? defaults.externalLinks.externalWebsiteUrl),
      salesPortalUrl: normalizeTextValue(externalLinksSource.salesPortalUrl ?? defaults.externalLinks.salesPortalUrl),
      whatsappEnquiryUrl: normalizeTextValue(externalLinksSource.whatsappEnquiryUrl ?? defaults.externalLinks.whatsappEnquiryUrl),
      bookingViewingUrl: normalizeTextValue(externalLinksSource.bookingViewingUrl ?? defaults.externalLinks.bookingViewingUrl),
    },
    listingConfiguration: {
      showOnListingWebsite: normalizeMarketingBoolean(
        listingConfigurationSource.showOnListingWebsite,
        defaults.listingConfiguration.showOnListingWebsite,
      ),
      featuredDevelopment: normalizeMarketingBoolean(
        listingConfigurationSource.featuredDevelopment,
        defaults.listingConfiguration.featuredDevelopment,
      ),
      displayOrder: normalizeTextValue(
        listingConfigurationSource.displayOrder ?? defaults.listingConfiguration.displayOrder,
      ),
      listingSlug: normalizeTextValue(listingConfigurationSource.listingSlug ?? defaults.listingConfiguration.listingSlug),
      ctaLabel: normalizeTextValue(listingConfigurationSource.ctaLabel ?? defaults.listingConfiguration.ctaLabel),
      ctaUrl: normalizeTextValue(listingConfigurationSource.ctaUrl ?? defaults.listingConfiguration.ctaUrl),
      marketingStatus: normalizeTextValue(
        listingConfigurationSource.marketingStatus ?? defaults.listingConfiguration.marketingStatus,
      ),
      publicVisibility: normalizeMarketingBoolean(
        listingConfigurationSource.publicVisibility,
        defaults.listingConfiguration.publicVisibility,
      ),
    },
  }
}

function normalizeDevelopmentProfile(rawProfile = {}) {
  return {
    code: normalizeTextValue(rawProfile.code),
    location: normalizeTextValue(rawProfile.location),
    suburb: normalizeTextValue(rawProfile.suburb),
    city: normalizeTextValue(rawProfile.city),
    province: normalizeTextValue(rawProfile.province),
    country: normalizeTextValue(rawProfile.country) || DEFAULT_DEVELOPMENT_PROFILE.country,
    address: normalizeTextValue(rawProfile.address),
    description: normalizeTextValue(rawProfile.description),
    status: normalizeTextValue(rawProfile.status) || DEFAULT_DEVELOPMENT_PROFILE.status,
    developerCompany: normalizeTextValue(rawProfile.developerCompany || rawProfile.developer_company),
    launchDate: normalizeTextValue(rawProfile.launchDate || rawProfile.launch_date),
    expectedCompletionDate: normalizeTextValue(rawProfile.expectedCompletionDate || rawProfile.expected_completion_date),
    plans: normalizeListValue(rawProfile.plans),
    sitePlans: normalizeListValue(rawProfile.sitePlans || rawProfile.site_plans),
    imageLinks: normalizeListValue(rawProfile.imageLinks || rawProfile.image_links),
    supportingDocuments: normalizeListValue(rawProfile.supportingDocuments || rawProfile.supporting_documents),
    marketingContent: normalizeMarketingContent(rawProfile.marketingContent ?? rawProfile.marketing_content),
  }
}

function normalizeDevelopmentFinancialsRow(row = {}) {
  const landCost = normalizeOptionalNumber(row.land_cost ?? row.landCost)
  const buildCost = normalizeOptionalNumber(row.build_cost ?? row.buildCost)
  const professionalFees = normalizeOptionalNumber(row.professional_fees ?? row.professionalFees)
  const marketingCost = normalizeOptionalNumber(row.marketing_cost ?? row.marketingCost)
  const infrastructureCost = normalizeOptionalNumber(row.infrastructure_cost ?? row.infrastructureCost)
  const otherCosts = normalizeOptionalNumber(row.other_costs ?? row.otherCosts)
  const computedTotalProjectedCost =
    [landCost, buildCost, professionalFees, marketingCost, infrastructureCost, otherCosts].reduce(
      (sum, value) => sum + (Number.isFinite(value) ? value : 0),
      0,
    ) || null
  const totalProjectedCost =
    normalizeOptionalNumber(row.total_projected_cost ?? row.totalProjectedCost) ?? computedTotalProjectedCost
  const projectedGrossSalesValue = normalizeOptionalNumber(
    row.projected_gross_sales_value ?? row.projectedGrossSalesValue,
  )
  const projectedProfit =
    normalizeOptionalNumber(row.projected_profit ?? row.projectedProfit) ??
    (projectedGrossSalesValue !== null && totalProjectedCost !== null
      ? projectedGrossSalesValue - totalProjectedCost
      : null)

  return {
    id: row.id || null,
    developmentId: row.development_id || row.developmentId || null,
    landCost,
    buildCost,
    professionalFees,
    marketingCost,
    infrastructureCost,
    otherCosts,
    totalProjectedCost,
    projectedGrossSalesValue,
    projectedProfit,
    targetMargin: normalizeOptionalNumber(row.target_margin ?? row.targetMargin),
    notes: normalizeTextValue(row.notes),
  }
}

function normalizeDevelopmentDocumentRow(row = {}) {
  return {
    id: row.id || null,
    developmentId: row.development_id || row.developmentId || null,
    documentType: normalizeTextValue(row.document_type ?? row.documentType) || 'other',
    title: normalizeTextValue(row.title),
    description: normalizeTextValue(row.description),
    fileUrl: normalizeTextValue(row.file_url ?? row.fileUrl),
    linkedUnitId: row.linked_unit_id || row.linkedUnitId || null,
    linkedUnitType: normalizeTextValue(row.linked_unit_type ?? row.linkedUnitType),
    uploadedAt: row.uploaded_at || row.uploadedAt || null,
    createdAt: row.created_at || row.createdAt || null,
  }
}

function normalizeDevelopmentUnitRow(row = {}) {
  const rawFloorplanId = row.floorplan_id || row.floorplanId || null
  const normalizedFloorplanId =
    typeof rawFloorplanId === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rawFloorplanId)
      ? rawFloorplanId
      : null

  return {
    id: row.id || null,
    developmentId: row.development_id || row.developmentId || null,
    unitNumber: normalizeTextValue(row.unit_number ?? row.unitNumber),
    unitLabel: normalizeTextValue(row.unit_label ?? row.unitLabel),
    phase: normalizeTextValue(row.phase),
    block: normalizeTextValue(row.block),
    unitType: normalizeTextValue(row.unit_type ?? row.unitType),
    bedrooms: normalizeOptionalNumber(row.bedrooms),
    bathrooms: normalizeOptionalNumber(row.bathrooms),
    parkingCount: normalizeOptionalNumber(row.parking_count ?? row.parkingCount),
    sizeSqm: normalizeOptionalNumber(row.size_sqm ?? row.sizeSqm),
    listPrice: normalizeOptionalNumber(row.list_price ?? row.listPrice ?? row.price),
    currentPrice: normalizeOptionalNumber(row.current_price ?? row.currentPrice ?? row.price),
    price: normalizeOptionalNumber(row.price ?? row.list_price ?? row.listPrice),
    status: normalizeTextValue(row.status) || 'Available',
    vatApplicable: normalizeNullableBoolean(row.vat_applicable ?? row.vatApplicable),
    floorplanId: normalizedFloorplanId,
    notes: normalizeTextValue(row.notes),
  }
}

const TRUST_INVESTMENT_FORM_SELECT = `
  id,
  development_id,
  unit_id,
  transaction_id,
  buyer_id,
  attorney_firm_name,
  purchaser_full_name,
  purchaser_identity_or_registration_number,
  full_name,
  identity_or_registration_number,
  income_tax_number,
  south_african_resident,
  physical_address,
  postal_address,
  telephone_number,
  fax_number,
  balance_to,
  bank_name,
  account_number,
  branch_number,
  source_of_funds,
  declaration_accepted,
  signature_name,
  signed_date,
  status,
  submitted_at,
  reviewed_at,
  approved_at,
  created_at,
  updated_at
`

const TRANSACTION_HANDOVER_SELECT = `
  id,
  transaction_id,
  development_id,
  unit_id,
  buyer_id,
  status,
  handover_date,
  electricity_meter_reading,
  water_meter_reading,
  gas_meter_reading,
  keys_handed_over,
  remote_handed_over,
  manuals_handed_over,
  inspection_completed,
  notes,
  signature_name,
  signature_signed_at,
  created_at,
  updated_at
`

const DISCUSSION_VISIBILITY_VALUES = ['shared', 'internal', 'client_safe']

function parseDiscussionMetadata(rawText) {
  const sourceText = String(rawText || '').trim()
  if (!sourceText) {
    return {
      body: '',
      discussionType: 'operational',
      visibility: 'shared',
    }
  }

  const typeTags = new Set(DISCUSSION_TYPES)
  const visibilityMap = {
    shared: 'shared',
    internal: 'internal',
    internal_only: 'internal',
    client_safe: 'client_safe',
    client_visible: 'client_safe',
  }

  let remaining = sourceText
  let parsedType = null
  let parsedVisibility = null
  let guard = 0

  while (guard < 4) {
    const match = remaining.match(/^\[([a-z_ ]+)\]\s*/i)
    if (!match) {
      break
    }

    guard += 1
    const tag = String(match[1] || '')
      .trim()
      .toLowerCase()
      .replaceAll(' ', '_')

    if (!parsedType && typeTags.has(tag)) {
      parsedType = tag
    }

    if (!parsedVisibility && visibilityMap[tag]) {
      parsedVisibility = visibilityMap[tag]
    }

    remaining = remaining.slice(match[0].length).trimStart()
  }

  return {
    body: remaining || sourceText,
    discussionType: parsedType || 'operational',
    visibility: parsedVisibility || 'shared',
  }
}

function normalizeDiscussionVisibility(value, fallback = 'shared') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  return DISCUSSION_VISIBILITY_VALUES.includes(normalized) ? normalized : fallback
}

function getDefaultTrustInvestmentForm({ developmentId = null, unitId = null, transaction = null, buyer = null } = {}) {
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

function normalizeTrustInvestmentFormRow(row, defaults) {
  return {
    ...defaults,
    id: row?.id || null,
    developmentId: row?.development_id || defaults.developmentId || null,
    unitId: row?.unit_id || defaults.unitId || null,
    transactionId: row?.transaction_id || defaults.transactionId || null,
    buyerId: row?.buyer_id || defaults.buyerId || null,
    attorneyFirmName: row?.attorney_firm_name || defaults.attorneyFirmName || '',
    purchaserFullName: row?.purchaser_full_name || defaults.purchaserFullName || '',
    purchaserIdentityOrRegistrationNumber:
      row?.purchaser_identity_or_registration_number || defaults.purchaserIdentityOrRegistrationNumber || '',
    fullName: row?.full_name || defaults.fullName || '',
    identityOrRegistrationNumber: row?.identity_or_registration_number || defaults.identityOrRegistrationNumber || '',
    incomeTaxNumber: row?.income_tax_number || defaults.incomeTaxNumber || '',
    southAfricanResident:
      row?.south_african_resident === true || row?.south_african_resident === false
        ? row.south_african_resident
        : defaults.southAfricanResident,
    physicalAddress: row?.physical_address || defaults.physicalAddress || '',
    postalAddress: row?.postal_address || defaults.postalAddress || '',
    telephoneNumber: row?.telephone_number || defaults.telephoneNumber || '',
    faxNumber: row?.fax_number || defaults.faxNumber || '',
    balanceTo: row?.balance_to || defaults.balanceTo || '',
    bankName: row?.bank_name || defaults.bankName || '',
    accountNumber: row?.account_number || defaults.accountNumber || '',
    branchNumber: row?.branch_number || defaults.branchNumber || '',
    sourceOfFunds: row?.source_of_funds || defaults.sourceOfFunds || '',
    declarationAccepted: Boolean(row?.declaration_accepted),
    signatureName: row?.signature_name || defaults.signatureName || '',
    signedDate: row?.signed_date || defaults.signedDate || '',
    status: TRUST_INVESTMENT_FORM_STATUSES.includes(row?.status) ? row.status : defaults.status || 'Not Started',
    submittedAt: row?.submitted_at || null,
    reviewedAt: row?.reviewed_at || null,
    approvedAt: row?.approved_at || null,
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null,
  }
}

function getDefaultHandoverRecord({ developmentId = null, unitId = null, transaction = null, buyer = null } = {}) {
  return {
    id: null,
    transactionId: transaction?.id || null,
    developmentId: developmentId || transaction?.development_id || null,
    unitId: unitId || transaction?.unit_id || null,
    buyerId: transaction?.buyer_id || buyer?.id || null,
    status: 'not_started',
    handoverDate: '',
    electricityMeterReading: '',
    waterMeterReading: '',
    gasMeterReading: '',
    keysHandedOver: false,
    remoteHandedOver: false,
    manualsHandedOver: false,
    inspectionCompleted: false,
    notes: '',
    signatureName: buyer?.name || '',
    signatureSignedAt: null,
    createdAt: null,
    updatedAt: null,
  }
}

function normalizeHandoverRow(row, defaults) {
  const status = String(row?.status || defaults.status || 'not_started').trim().toLowerCase()

  return {
    ...defaults,
    id: row?.id || defaults.id || null,
    transactionId: row?.transaction_id || defaults.transactionId || null,
    developmentId: row?.development_id || defaults.developmentId || null,
    unitId: row?.unit_id || defaults.unitId || null,
    buyerId: row?.buyer_id || defaults.buyerId || null,
    status: HANDOVER_STATUSES.includes(status) ? status : 'not_started',
    handoverDate: row?.handover_date || '',
    electricityMeterReading: row?.electricity_meter_reading || '',
    waterMeterReading: row?.water_meter_reading || '',
    gasMeterReading: row?.gas_meter_reading || '',
    keysHandedOver: Boolean(row?.keys_handed_over),
    remoteHandedOver: Boolean(row?.remote_handed_over),
    manualsHandedOver: Boolean(row?.manuals_handed_over),
    inspectionCompleted: Boolean(row?.inspection_completed),
    notes: row?.notes || '',
    signatureName: row?.signature_name || defaults.signatureName || '',
    signatureSignedAt: row?.signature_signed_at || null,
    createdAt: row?.created_at || defaults.createdAt || null,
    updatedAt: row?.updated_at || defaults.updatedAt || null,
  }
}

async function fetchTransactionHandover(client, { developmentId, unitId, transaction, buyer }) {
  const defaults = getDefaultHandoverRecord({
    developmentId,
    unitId,
    transaction,
    buyer,
  })

  if (!transaction?.id) {
    return defaults
  }

  const { data, error } = await client
    .from('transaction_handover')
    .select(TRANSACTION_HANDOVER_SELECT)
    .eq('transaction_id', transaction.id)
    .maybeSingle()

  if (error) {
    if (isMissingTableError(error, 'transaction_handover')) {
      return defaults
    }

    throw error
  }

  if (!data) {
    return defaults
  }

  return normalizeHandoverRow(data, defaults)
}

function getDefaultOccupationalRentRecord({ developmentId = null, unitId = null, transaction = null, buyer = null } = {}) {
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

function normalizeOccupationalRentRecord(row, defaults) {
  const enabled =
    row?.enabled === true || row?.enabled === false
      ? row.enabled
      : row?.is_enabled === true || row?.is_enabled === false
        ? row.is_enabled
        : defaults.enabled || false
  const rawStatus = String(row?.status || defaults.status || 'not_applicable').trim().toLowerCase()
  const normalizedStatus = OCCUPATIONAL_RENT_STATUSES.includes(rawStatus)
    ? rawStatus
    : enabled
      ? 'pending_setup'
      : 'not_applicable'

  return {
    ...defaults,
    id: row?.id || defaults.id || null,
    transactionId: row?.transaction_id || row?.transactionId || defaults.transactionId || null,
    developmentId: row?.development_id || row?.developmentId || defaults.developmentId || null,
    unitId: row?.unit_id || row?.unitId || defaults.unitId || null,
    buyerId: row?.buyer_id || row?.buyerId || defaults.buyerId || null,
    buyerName: row?.buyer_name || row?.buyerName || defaults.buyerName || '',
    enabled,
    status: normalizedStatus,
    occupationDate: normalizeOptionalDate(row?.occupation_date ?? row?.occupationDate) || '',
    rentStartDate: normalizeOptionalDate(row?.rent_start_date ?? row?.rentStartDate) || '',
    monthlyAmount: normalizeOptionalNumber(row?.monthly_amount ?? row?.monthlyAmount),
    proRataAmount: normalizeOptionalNumber(row?.pro_rata_amount ?? row?.proRataAmount),
    nextDueDate: normalizeOptionalDate(row?.next_due_date ?? row?.nextDueDate) || '',
    waived:
      row?.waived === true || row?.waived === false
        ? row.waived
        : row?.is_waived === true || row?.is_waived === false
          ? row.is_waived
          : Boolean(defaults.waived),
    waiverReason: row?.waiver_reason || row?.waiverReason || '',
    notes: row?.notes || '',
    createdAt: row?.created_at || row?.createdAt || defaults.createdAt || null,
    updatedAt: row?.updated_at || row?.updatedAt || defaults.updatedAt || null,
  }
}

function getOccupationalRentRecordFromEvents(events = [], defaults) {
  const event = (events || []).find(
    (item) =>
      normalizeEventType(item?.eventType || item?.event_type) === 'OccupationalRentUpdated' &&
      item?.eventData &&
      typeof item.eventData === 'object',
  )

  if (!event) {
    return defaults
  }

  return normalizeOccupationalRentRecord(
    {
      ...event.eventData,
      id: event.id || null,
      transaction_id: defaults.transactionId,
      development_id: defaults.developmentId,
      unit_id: defaults.unitId,
      buyer_id: defaults.buyerId,
      created_at: event.createdAt || null,
      updated_at: event.updatedAt || null,
    },
    defaults,
  )
}

function validateHandoverForCompletion(handover = {}) {
  const checklistMissing = []
  if (!handover.inspectionCompleted) checklistMissing.push('inspection complete')
  if (!handover.keysHandedOver) checklistMissing.push('keys handed over')
  if (!handover.remoteHandedOver) checklistMissing.push('remote handed over')
  if (!handover.manualsHandedOver) checklistMissing.push('manuals handed over')

  if (checklistMissing.length) {
    throw new Error(`Complete checklist items first: ${checklistMissing.join(', ')}.`)
  }

  if (!String(handover.electricityMeterReading || '').trim()) {
    throw new Error('Electricity meter reading is required before handover completion.')
  }

  if (!String(handover.waterMeterReading || '').trim()) {
    throw new Error('Water meter reading is required before handover completion.')
  }

  if (!String(handover.signatureName || '').trim()) {
    throw new Error('Signature name is required before handover completion.')
  }
}

function mapHomeownerDocuments(documents = []) {
  return HOMEOWNER_DOCUMENT_CATALOG.map((item) => {
    const matches = documents.filter((document) => {
      const haystack = `${document?.category || ''} ${document?.name || ''}`.toLowerCase()
      return item.keywords.some((keyword) => haystack.includes(keyword))
    })

    return {
      ...item,
      availableCount: matches.length,
      latestDocument: matches[0] || null,
      documents: matches,
    }
  })
}

async function fetchTrustInvestmentFormForTransaction(client, { developmentId, unitId, transaction, buyer }) {
  const defaults = getDefaultTrustInvestmentForm({ developmentId, unitId, transaction, buyer })

  if (!transaction?.id) {
    return defaults
  }

  const { data, error } = await client
    .from('trust_investment_forms')
    .select(TRUST_INVESTMENT_FORM_SELECT)
    .eq('transaction_id', transaction.id)
    .maybeSingle()

  if (error) {
    if (isMissingTableError(error, 'trust_investment_forms')) {
      return defaults
    }

    throw error
  }

  if (!data) {
    return defaults
  }

  return normalizeTrustInvestmentFormRow(data, defaults)
}

function validateTrustInvestmentFormForSubmission(form = {}) {
  const required = [
    ['Purchaser full name', form.purchaserFullName],
    ['Purchaser identity / registration number', form.purchaserIdentityOrRegistrationNumber],
    ['Full name', form.fullName],
    ['Identity / registration number', form.identityOrRegistrationNumber],
    ['Income tax number', form.incomeTaxNumber],
    ['South African resident', form.southAfricanResident === true || form.southAfricanResident === false ? 'yes' : ''],
    ['Physical address', form.physicalAddress],
    ['Postal address', form.postalAddress],
    ['Telephone number', form.telephoneNumber],
    ['Balance to', form.balanceTo],
    ['Bank name', form.bankName],
    ['Account number', form.accountNumber],
    ['Branch number', form.branchNumber],
    ['Source of funds', form.sourceOfFunds],
    ['Signature name', form.signatureName],
    ['Signed date', form.signedDate],
  ]

  const firstMissing = required.find(([, value]) => !String(value || '').trim())
  if (firstMissing) {
    throw new Error(`${firstMissing[0]} is required before submission.`)
  }

  if (!form.declarationAccepted) {
    throw new Error('You must accept the investment instruction declaration before submission.')
  }
}

async function fetchDevelopmentProfile(client, developmentId) {
  let profileQuery = await client
    .from('development_profiles')
    .select(
      'development_id, code, location, suburb, city, province, country, address, description, status, developer_company, launch_date, expected_completion_date, plans, site_plans, image_links, supporting_documents, marketing_content',
    )
    .eq('development_id', developmentId)
    .maybeSingle()

  if (profileQuery.error && isMissingColumnError(profileQuery.error, 'marketing_content')) {
    profileQuery = await client
      .from('development_profiles')
      .select(
        'development_id, code, location, suburb, city, province, country, address, description, status, developer_company, launch_date, expected_completion_date, plans, site_plans, image_links, supporting_documents',
      )
      .eq('development_id', developmentId)
      .maybeSingle()
  }

  if (profileQuery.error && isMissingColumnError(profileQuery.error, 'code')) {
    profileQuery = await client
      .from('development_profiles')
      .select('development_id, location, address, description, status, plans, site_plans, image_links, supporting_documents')
      .eq('development_id', developmentId)
      .maybeSingle()
  }

  const { data, error } = profileQuery

  if (error) {
    if (isMissingTableError(error, 'development_profiles') || isPermissionDeniedError(error)) {
      return { ...DEFAULT_DEVELOPMENT_PROFILE }
    }

    throw error
  }

  if (!data) {
    return { ...DEFAULT_DEVELOPMENT_PROFILE }
  }

  return normalizeDevelopmentProfile(data)
}

async function resolveSnapshotOwner(client) {
  const { data, error } = await client.auth.getSession()
  if (error) {
    throw error
  }

  const userId = data?.session?.user?.id || null
  if (userId) {
    return {
      userId,
      ownerKey: `user:${userId}`,
    }
  }

  return {
    userId: null,
    ownerKey: getFallbackOwnerKey(),
  }
}

function generateSnapshotToken() {
  return `snap${crypto.randomUUID().replaceAll('-', '')}`
}

function normalizeStage(rawStage, rawStatus) {
  const normalizedStage = normalizeStageLabel(rawStage)
  if (STAGES.includes(normalizedStage)) {
    return normalizedStage
  }

  const normalizedStatus = normalizeStageLabel(rawStatus)
  if (STAGES.includes(normalizedStatus)) {
    return normalizedStatus
  }

  return 'Available'
}

function normalizeMainStage(rawMainStage, fallbackDetailedStage = 'Available') {
  const normalized = String(rawMainStage || '').toUpperCase()
  if (MAIN_PROCESS_STAGES.includes(normalized)) {
    return normalized
  }

  return getMainStageFromDetailedStage(fallbackDetailedStage)
}

function normalizeSubprocessStepStatus(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  return SUBPROCESS_STEP_STATUSES.includes(normalized) ? normalized : 'not_started'
}

export function parseWorkflowStepComment(value) {
  const rawValue = String(value || '')
  const trimmedValue = rawValue.trim()

  if (!trimmedValue.startsWith(WORKFLOW_COMMENT_META_PREFIX)) {
    return {
      note: rawValue.trim(),
      checklist: {},
    }
  }

  const newlineIndex = trimmedValue.indexOf('\n')
  const metaSource = newlineIndex >= 0 ? trimmedValue.slice(WORKFLOW_COMMENT_META_PREFIX.length, newlineIndex).trim() : trimmedValue.slice(WORKFLOW_COMMENT_META_PREFIX.length).trim()
  const note = newlineIndex >= 0 ? trimmedValue.slice(newlineIndex + 1).trim() : ''

  try {
    const parsed = JSON.parse(metaSource || '{}')
    return {
      note,
      checklist: parsed?.checklist && typeof parsed.checklist === 'object' ? parsed.checklist : {},
    }
  } catch {
    return {
      note: rawValue.replace(WORKFLOW_COMMENT_META_PREFIX, '').trim(),
      checklist: {},
    }
  }
}

export function buildWorkflowStepComment({ note = '', checklist = {} } = {}) {
  const normalizedNote = String(note || '').trim()
  const normalizedChecklist = Object.entries(checklist || {}).reduce((accumulator, [key, checked]) => {
    accumulator[key] = Boolean(checked)
    return accumulator
  }, {})

  const hasChecklistData = Object.keys(normalizedChecklist).length > 0
  if (!hasChecklistData) {
    return normalizedNote
  }

  const meta = JSON.stringify({ checklist: normalizedChecklist })
  return `${WORKFLOW_COMMENT_META_PREFIX}${meta}${normalizedNote ? `\n${normalizedNote}` : ''}`
}

function getWorkflowStepVisibleComment(value) {
  return parseWorkflowStepComment(value).note
}

function getSubprocessTemplate(processType, { financeType = null } = {}) {
  if (processType === 'finance') {
    return getFinanceWorkflowTemplate(financeType).map((step, index) => ({
      key: step.key,
      label: step.label,
      sortOrder: index + 1,
    }))
  }

  return SUBPROCESS_STEP_TEMPLATES[processType] || []
}

function buildDefaultSubprocessState(transactionId = null, { financeType = null } = {}) {
  return SUBPROCESS_TYPES.map((processType) => ({
    id: null,
    transaction_id: transactionId,
    process_type: processType,
    owner_type: SUBPROCESS_DEFAULT_OWNERS[processType] || 'internal',
    status: 'not_started',
    steps: getSubprocessTemplate(processType, { financeType }).map((step) => ({
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

function summarizeSubprocess(process) {
  const steps = [...(process.steps || [])].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
  const totalSteps = steps.length
  const completedSteps = steps.filter((step) => step.status === 'completed').length
  const inProgressStep = steps.find((step) => step.status === 'in_progress')
  const blockedStep = steps.find((step) => step.status === 'blocked')
  const nextStep = steps.find((step) => !['completed'].includes(step.status))
  const lastCompletedStep = [...steps]
    .reverse()
    .find((step) => step.status === 'completed')

  const waitingStep = blockedStep || inProgressStep || nextStep || null
  const visibleWaitingComment = getWorkflowStepVisibleComment(waitingStep?.comment)
  const summaryText = waitingStep
    ? visibleWaitingComment || `Waiting for ${String(waitingStep.step_label || '').toLowerCase()}`
    : 'Workflow complete'

  return {
    totalSteps,
    completedSteps,
    completionPercent: totalSteps ? Math.round((completedSteps / totalSteps) * 100) : 0,
    waitingStep,
    lastCompletedStep,
    summaryText,
  }
}

async function ensureTransactionSubprocesses(client, transactionId, { createIfMissing = true } = {}) {
  if (!transactionId) {
    return buildDefaultSubprocessState()
  }

  let transactionFinanceType = 'cash'
  const financeTypeQuery = await client.from('transactions').select('finance_type').eq('id', transactionId).maybeSingle()
  if (!financeTypeQuery.error && financeTypeQuery.data) {
    transactionFinanceType = financeTypeQuery.data.finance_type || 'cash'
  } else if (financeTypeQuery.error && !isMissingColumnError(financeTypeQuery.error, 'finance_type')) {
    throw financeTypeQuery.error
  }

  let subprocessQuery = await client
    .from('transaction_subprocesses')
    .select('id, transaction_id, process_type, owner_type, status, created_at, updated_at')
    .eq('transaction_id', transactionId)
    .order('created_at', { ascending: true })

  if (subprocessQuery.error) {
    if (isMissingSchemaError(subprocessQuery.error)) {
      return buildDefaultSubprocessState(transactionId, { financeType: transactionFinanceType })
    }

    throw subprocessQuery.error
  }

  let subprocesses = subprocessQuery.data || []

  if (!subprocesses.length) {
    if (!createIfMissing) {
      return buildDefaultSubprocessState(transactionId, { financeType: transactionFinanceType })
    }

    const bootstrapRows = SUBPROCESS_TYPES.map((processType) => ({
      transaction_id: transactionId,
      process_type: processType,
      owner_type: SUBPROCESS_DEFAULT_OWNERS[processType] || 'internal',
      status: 'not_started',
    }))

    const createResult = await client
      .from('transaction_subprocesses')
      .upsert(bootstrapRows, { onConflict: 'transaction_id,process_type', ignoreDuplicates: true })
      .select('id, transaction_id, process_type, owner_type, status, created_at, updated_at')

    if (createResult.error) {
      if (isMissingSchemaError(createResult.error)) {
        return buildDefaultSubprocessState(transactionId, { financeType: transactionFinanceType })
      }
      throw createResult.error
    }

    const { data: refreshedSubprocesses, error: refreshedSubprocessesError } = await client
      .from('transaction_subprocesses')
      .select('id, transaction_id, process_type, owner_type, status, created_at, updated_at')
      .eq('transaction_id', transactionId)
      .order('created_at', { ascending: true })

    if (refreshedSubprocessesError) {
      if (isMissingSchemaError(refreshedSubprocessesError)) {
        return buildDefaultSubprocessState(transactionId, { financeType: transactionFinanceType })
      }

      throw refreshedSubprocessesError
    }

    subprocesses = refreshedSubprocesses || []
  }

  const subprocessByType = SUBPROCESS_TYPES.reduce((accumulator, processType) => {
    const existing = subprocesses.find((item) => item.process_type === processType)
    if (existing) {
      accumulator[processType] = existing
    }
    return accumulator
  }, {})

  const missingTypes = SUBPROCESS_TYPES.filter((processType) => !subprocessByType[processType])
  if (missingTypes.length) {
    if (!createIfMissing) {
      subprocesses = [
        ...subprocesses,
        ...missingTypes.map((processType) => ({
          id: `virtual-${transactionId}-${processType}`,
          transaction_id: transactionId,
          process_type: processType,
          owner_type: SUBPROCESS_DEFAULT_OWNERS[processType] || 'internal',
          status: 'not_started',
          created_at: null,
          updated_at: null,
        })),
      ]
    } else {
      const patchRows = missingTypes.map((processType) => ({
        transaction_id: transactionId,
        process_type: processType,
        owner_type: SUBPROCESS_DEFAULT_OWNERS[processType] || 'internal',
        status: 'not_started',
      }))

      const patchResult = await client
        .from('transaction_subprocesses')
        .upsert(patchRows, { onConflict: 'transaction_id,process_type', ignoreDuplicates: true })
        .select('id, transaction_id, process_type, owner_type, status, created_at, updated_at')

      if (patchResult.error) {
        if (!isMissingSchemaError(patchResult.error)) {
          throw patchResult.error
        }
      } else if (patchResult.data?.length) {
        const byId = new Map(subprocesses.map((item) => [item.id, item]))
        for (const item of patchResult.data) {
          byId.set(item.id, item)
        }
        subprocesses = Array.from(byId.values())
      }
    }
  }

  const subprocessIds = subprocesses.map((item) => item.id).filter(Boolean)
  if (!subprocessIds.length) {
    return buildDefaultSubprocessState(transactionId, { financeType: transactionFinanceType })
  }

  let stepQuery = await client
    .from('transaction_subprocess_steps')
    .select('id, subprocess_id, step_key, step_label, status, completed_at, comment, owner_type, sort_order, created_at, updated_at')
    .in('subprocess_id', subprocessIds)
    .order('sort_order', { ascending: true })

  if (stepQuery.error) {
    if (isMissingSchemaError(stepQuery.error)) {
      return buildDefaultSubprocessState(transactionId, { financeType: transactionFinanceType })
    }

    throw stepQuery.error
  }

  let stepRows = stepQuery.data || []
  const existingKeysBySubprocess = stepRows.reduce((accumulator, item) => {
    if (!accumulator[item.subprocess_id]) {
      accumulator[item.subprocess_id] = new Set()
    }
    accumulator[item.subprocess_id].add(item.step_key)
    return accumulator
  }, {})

  const missingStepRows = []
  for (const subprocess of subprocesses) {
    const template = getSubprocessTemplate(subprocess.process_type, { financeType: transactionFinanceType })
    const existingKeys = existingKeysBySubprocess[subprocess.id] || new Set()
    for (const step of template) {
      if (!existingKeys.has(step.key)) {
        missingStepRows.push({
          subprocess_id: subprocess.id,
          step_key: step.key,
          step_label: step.label,
          status: 'not_started',
          owner_type: subprocess.owner_type || SUBPROCESS_DEFAULT_OWNERS[subprocess.process_type] || 'internal',
          sort_order: step.sortOrder,
        })
      }
    }
  }

  if (missingStepRows.length) {
    if (!createIfMissing) {
      stepRows = [
        ...stepRows,
        ...missingStepRows.map((row) => ({
          id: `virtual-${row.subprocess_id}-${row.step_key}`,
          ...row,
          completed_at: null,
          comment: null,
          created_at: null,
          updated_at: null,
        })),
      ]
    } else {
      const stepInsertResult = await client
        .from('transaction_subprocess_steps')
        .upsert(missingStepRows, { onConflict: 'subprocess_id,step_key', ignoreDuplicates: true })
        .select('id, subprocess_id, step_key, step_label, status, completed_at, comment, owner_type, sort_order, created_at, updated_at')

      if (stepInsertResult.error) {
        if (!isMissingSchemaError(stepInsertResult.error)) {
          throw stepInsertResult.error
        }
      } else if (stepInsertResult.data?.length) {
        stepRows = [...stepRows, ...stepInsertResult.data]
      }
    }
  }

  const stepsBySubprocess = stepRows.reduce((accumulator, step) => {
    if (!accumulator[step.subprocess_id]) {
      accumulator[step.subprocess_id] = []
    }

    accumulator[step.subprocess_id].push({
      ...step,
      status: normalizeSubprocessStepStatus(step.status),
    })
    return accumulator
  }, {})

  const normalizedSubprocesses = subprocesses
    .sort((a, b) => SUBPROCESS_TYPES.indexOf(a.process_type) - SUBPROCESS_TYPES.indexOf(b.process_type))
    .map((subprocess) => {
      const template = getSubprocessTemplate(subprocess.process_type, { financeType: transactionFinanceType })
      const templateByKey = new Map(template.map((step) => [step.key, step]))
      const visibleKeys = new Set(template.map((step) => step.key))
      const steps = (stepsBySubprocess[subprocess.id] || [])
        .filter((step) => visibleKeys.has(step.step_key))
        .map((step) => ({
          ...step,
          step_label: templateByKey.get(step.step_key)?.label || step.step_label,
          sort_order: templateByKey.get(step.step_key)?.sortOrder ?? step.sort_order,
        }))
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      const summary = summarizeSubprocess({
        ...subprocess,
        steps,
      })

      return {
        ...subprocess,
        status: normalizeSubprocessStepStatus(subprocess.status),
        steps,
        summary,
      }
    })

  return normalizedSubprocesses
}

function deriveStageFromSubprocesses(transaction, subprocesses = []) {
  const currentStage = normalizeStageLabel(transaction?.stage || 'Available')
  const currentIndex = getStageIndex(currentStage)
  let targetStage = currentStage

  const finance = subprocesses.find((item) => item.process_type === 'finance')
  const attorney = subprocesses.find((item) => item.process_type === 'attorney')

  const financeFinalComplete = finance?.steps?.some(
    (step) =>
      ['ready_for_transfer', 'bond_instruction_sent_to_attorneys'].includes(step.step_key) &&
      step.status === 'completed',
  )

  if (financeFinalComplete && getStageIndex('Proceed to Attorneys') > currentIndex) {
    targetStage = 'Proceed to Attorneys'
  }

  const attorneyRegistrationComplete = attorney?.steps?.some(
    (step) => step.step_key === 'registration_confirmed' && step.status === 'completed',
  )
  const attorneyLodgementComplete = attorney?.steps?.some(
    (step) => step.step_key === 'lodgement_submitted' && step.status === 'completed',
  )
  const attorneyTransferStarted = attorney?.steps?.some(
    (step) =>
      ['guarantees_received', 'buyer_signed_documents', 'seller_signed_documents'].includes(step.step_key) &&
      step.status === 'completed',
  )

  if (attorneyRegistrationComplete) {
    targetStage = 'Registered'
  } else if (attorneyLodgementComplete && getStageIndex('Transfer Lodged') > getStageIndex(targetStage)) {
    targetStage = 'Transfer Lodged'
  } else if (attorneyTransferStarted && getStageIndex('Transfer in Progress') > getStageIndex(targetStage)) {
    targetStage = 'Transfer in Progress'
  }

  return targetStage
}

async function syncTransactionSubprocessOwners(client, transaction, subprocesses = []) {
  if (!transaction?.id || !subprocesses.length) {
    return subprocesses
  }

  const managedBy = normalizeFinanceManagedBy(transaction.finance_managed_by)
  const desiredFinanceOwner = managedBy === 'bond_originator' ? 'bond_originator' : 'internal'
  const desiredAttorneyOwner = 'attorney'
  const updates = []

  for (const process of subprocesses) {
    const desiredOwner = process.process_type === 'finance' ? desiredFinanceOwner : desiredAttorneyOwner
    if (process.owner_type !== desiredOwner) {
      updates.push({
        id: process.id,
        owner_type: desiredOwner,
        updated_at: new Date().toISOString(),
      })
    }
  }

  if (!updates.length) {
    return subprocesses
  }

  const { error } = await client.from('transaction_subprocesses').upsert(updates, { onConflict: 'id' })
  if (error) {
    if (isMissingSchemaError(error)) {
      return subprocesses
    }
    throw error
  }

  return ensureTransactionSubprocesses(client, transaction.id)
}

function byUnitNumber(a, b) {
  return String(a.unit.unit_number).localeCompare(String(b.unit.unit_number), undefined, {
    numeric: true,
    sensitivity: 'base',
  })
}

function byDevelopmentThenUnit(a, b) {
  const byName = String(a.development?.name || '').localeCompare(String(b.development?.name || ''), undefined, {
    sensitivity: 'base',
  })

  if (byName !== 0) {
    return byName
  }

  return byUnitNumber(a, b)
}

function latestTimestamp(row) {
  return row.transaction?.updated_at || row.transaction?.created_at || null
}

function getTransactionRowIdentity(row) {
  const transactionId = row?.transaction?.id
  if (transactionId) {
    return `transaction:${transactionId}`
  }

  const unitId = row?.unit?.id
  if (unitId) {
    return `unit:${unitId}`
  }

  return null
}

function selectPreferredTransactionRow(currentRow, candidateRow) {
  if (!currentRow) {
    return candidateRow
  }

  const transactionUnitId = candidateRow?.transaction?.unit_id || currentRow?.transaction?.unit_id || null
  if (transactionUnitId) {
    const currentMatchesUnit = String(currentRow?.unit?.id || '') === String(transactionUnitId)
    const candidateMatchesUnit = String(candidateRow?.unit?.id || '') === String(transactionUnitId)

    if (candidateMatchesUnit && !currentMatchesUnit) {
      return candidateRow
    }

    if (currentMatchesUnit && !candidateMatchesUnit) {
      return currentRow
    }
  }

  const currentUpdatedAt = new Date(latestTimestamp(currentRow) || 0).getTime()
  const candidateUpdatedAt = new Date(latestTimestamp(candidateRow) || 0).getTime()
  return candidateUpdatedAt >= currentUpdatedAt ? candidateRow : currentRow
}

function dedupeTransactionRows(rows = []) {
  const deduped = new Map()
  const fallbackRows = []

  for (const row of rows || []) {
    const identity = getTransactionRowIdentity(row)
    if (!identity) {
      fallbackRows.push(row)
      continue
    }

    const current = deduped.get(identity)
    deduped.set(identity, selectPreferredTransactionRow(current, row))
  }

  return [...deduped.values(), ...fallbackRows]
}

function buildDashboardMetrics(rows, developmentCount) {
  const totalRevenue = rows.reduce((sum, row) => {
    if (row.stage === 'Available') {
      return sum
    }

    const value = Number(row.transaction?.sales_price ?? row.unit?.price)
    return Number.isFinite(value) ? sum + value : sum
  }, 0)

  return {
    totalDevelopments: developmentCount,
    totalUnits: rows.length,
    activeTransactions: rows.filter(
      (row) => row.transaction && row.stage !== 'Available' && row.stage !== 'Registered',
    ).length,
    unitsInTransfer: rows.filter((row) => isInTransferStage(row.stage)).length,
    unitsRegistered: rows.filter((row) => row.stage === 'Registered').length,
    totalRevenue,
  }
}

function buildDevelopmentSummaries(rows) {
  const map = new Map()

  for (const row of rows) {
    const developmentId = row.unit.development_id
    const developmentName = row.development?.name || 'Unknown Development'
    const existing = map.get(developmentId) || {
      id: developmentId,
      name: developmentName,
      totalUnits: 0,
      unitsSold: 0,
      unitsInTransfer: 0,
      unitsRegistered: 0,
      lastActivity: null,
    }

    existing.totalUnits += 1

    if (row.stage !== 'Available') {
      existing.unitsSold += 1
    }

    if (isInTransferStage(row.stage)) {
      existing.unitsInTransfer += 1
    }

    if (row.stage === 'Registered') {
      existing.unitsRegistered += 1
    }

    const rowActivity = latestTimestamp(row)
    if (rowActivity && (!existing.lastActivity || new Date(rowActivity) > new Date(existing.lastActivity))) {
      existing.lastActivity = rowActivity
    }

    map.set(developmentId, existing)
  }

  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}

function buildAlerts(rows) {
  const waitingBondApproval = rows
    .filter((row) => row.stage === 'Finance Pending')
    .sort((a, b) => new Date(latestTimestamp(b) || 0) - new Date(latestTimestamp(a) || 0))
    .slice(0, 6)

  const waitingAttorneys = rows
    .filter((row) => row.stage === 'Proceed to Attorneys')
    .sort((a, b) => new Date(latestTimestamp(b) || 0) - new Date(latestTimestamp(a) || 0))
    .slice(0, 6)

  const recentUpdates = rows
    .filter((row) => row.transaction)
    .sort((a, b) => new Date(latestTimestamp(b) || 0) - new Date(latestTimestamp(a) || 0))
    .slice(0, 8)

  return {
    waitingBondApproval,
    waitingAttorneys,
    recentUpdates,
  }
}

function normalizeRequirementRows(rows) {
  if (!rows?.length) {
    return DEFAULT_DOCUMENT_REQUIREMENTS
  }

  const mergedByKey = new Map()

  for (const row of rows) {
    const current = mergedByKey.get(row.category_key)
    const normalized = {
      key: row.category_key,
      label: row.label,
      sortOrder: row.sort_order ?? 999,
      keywords: DEFAULT_DOCUMENT_REQUIREMENTS.find((item) => item.key === row.category_key)?.keywords || [
        String(row.label || row.category_key).toLowerCase(),
      ],
      scoped: Boolean(row.development_id),
    }

    if (!current || (!current.scoped && normalized.scoped)) {
      mergedByKey.set(row.category_key, normalized)
    }
  }

  const normalizedRows = [...mergedByKey.values()].sort((a, b) => a.sortOrder - b.sortOrder)

  return normalizedRows.length ? normalizedRows : DEFAULT_DOCUMENT_REQUIREMENTS
}

function toCategoryKey(label) {
  return String(label || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60)
}

function generateClientPortalToken() {
  return `clp${crypto.randomUUID().replaceAll('-', '')}`
}

function normalizeExternalRole(role) {
  if (role === 'tuckers') {
    return 'attorney'
  }

  return role
}

function normalizeExternalAccessRoleToTransactionRole(role) {
  return normalizeRoleType(normalizeExternalRole(role))
}

function formatExternalRole(role) {
  const normalized = normalizeExternalRole(role)

  if (normalized === 'client') {
    return 'Client / Buyer'
  }

  if (normalized === 'attorney') {
    return 'Attorney / Conveyancer'
  }

  if (normalized === 'bond_originator') {
    return 'Bond Originator'
  }

  return normalized
}

function normalizeDevelopmentSettingsRow(row) {
  const enabledModules = {
    ...DEFAULT_DEVELOPMENT_SETTINGS.enabledModules,
    ...(row?.enabled_modules || row?.enabledModules || {}),
  }

  const rawTeams = row?.stakeholder_teams || row?.stakeholderTeams || {}
  const stakeholderTeams = {
    agents: Array.isArray(rawTeams.agents) ? rawTeams.agents : [],
    conveyancers: Array.isArray(rawTeams.conveyancers) ? rawTeams.conveyancers : [],
    bondOriginators: Array.isArray(rawTeams.bondOriginators || rawTeams.bond_originators)
      ? rawTeams.bondOriginators || rawTeams.bond_originators
      : [],
  }

  const rawReservationDetails = row?.reservation_deposit_payment_details || row?.reservationDepositPaymentDetails || {}
  const reservationDepositPaymentDetails = {
    account_holder_name: normalizeTextValue(
      rawReservationDetails.account_holder_name || rawReservationDetails.accountHolderName,
    ),
    bank_name: normalizeTextValue(rawReservationDetails.bank_name || rawReservationDetails.bankName),
    account_number: normalizeTextValue(rawReservationDetails.account_number || rawReservationDetails.accountNumber),
    branch_code: normalizeTextValue(rawReservationDetails.branch_code || rawReservationDetails.branchCode),
    account_type: normalizeTextValue(rawReservationDetails.account_type || rawReservationDetails.accountType),
    payment_reference_format: normalizeTextValue(
      rawReservationDetails.payment_reference_format || rawReservationDetails.paymentReferenceFormat,
    ),
    payment_instructions: normalizeTextValue(
      rawReservationDetails.payment_instructions || rawReservationDetails.paymentInstructions,
    ),
  }
  const reservationDepositNotificationRecipients = Array.isArray(
    row?.reservation_deposit_notification_recipients || row?.reservationDepositNotificationRecipients,
  )
    ? (row.reservation_deposit_notification_recipients || row.reservationDepositNotificationRecipients)
        .map((value) => normalizeEmailAddress(value))
        .filter(Boolean)
    : []
  const reservationDepositAmount = normalizeOptionalNumber(
    row?.reservation_deposit_amount ?? row?.reservationDepositAmount,
  )
  const reservationDepositEnabledByDefault =
    row?.reservation_deposit_enabled_by_default === true ||
    row?.reservationDepositEnabledByDefault === true

  return {
    ...DEFAULT_DEVELOPMENT_SETTINGS,
    ...row,
    enabledModules,
    stakeholderTeams,
    reservation_deposit_enabled_by_default: reservationDepositEnabledByDefault,
    reservation_deposit_amount: reservationDepositAmount,
    reservation_deposit_payment_details: reservationDepositPaymentDetails,
    reservation_deposit_notification_recipients: reservationDepositNotificationRecipients,
    reservationDepositEnabledByDefault: reservationDepositEnabledByDefault,
    reservationDepositAmount: reservationDepositAmount,
    reservationDepositPaymentDetails: reservationDepositPaymentDetails,
    reservationDepositNotificationRecipients: reservationDepositNotificationRecipients,
  }
}

function buildDevelopmentParticipantRowsFromTeams(stakeholderTeams = {}) {
  const rows = []

  for (const [teamKey, definition] of Object.entries(DEVELOPMENT_TEAM_ROLE_MAP)) {
    const members = Array.isArray(stakeholderTeams?.[teamKey]) ? stakeholderTeams[teamKey] : []
    for (const member of members) {
      const normalized = normalizeStakeholderTeamParticipant(member, teamKey)
      if (!normalized) {
        continue
      }

      rows.push({
        role_type: definition.roleType,
        participant_name: normalizeNullableText(normalized.participantName),
        participant_email: normalizeNullableText(normalized.participantEmail) || null,
        organisation_name: normalizeNullableText(normalized.organisationName),
        is_primary: false,
        can_view: true,
        can_create_transactions: definition.roleType === 'agent',
        assignment_source: 'development_default',
        is_active: true,
      })
    }
  }

  return rows
}

async function syncDevelopmentParticipantsFromSettings(client, { developmentId, stakeholderTeams = {} } = {}) {
  if (!developmentId) {
    return
  }

  const desiredRows = buildDevelopmentParticipantRowsFromTeams(stakeholderTeams)
  const comparableEmails = desiredRows.map((row) => row.participant_email).filter(Boolean)
  const profileIdByEmail = await resolveProfileIdsByEmail(client, comparableEmails)
  const rowsWithUsers = desiredRows.map((row) => ({
    development_id: developmentId,
    user_id: row.participant_email ? profileIdByEmail[row.participant_email] || null : null,
    ...row,
  }))
  const managedRoles = [...new Set(Object.values(DEVELOPMENT_TEAM_ROLE_MAP).map((definition) => definition.roleType))]

  const clearManagedAssignments = async () => {
    if (!managedRoles.length) {
      return
    }

    let deleteQuery = client
      .from('development_participants')
      .delete()
      .eq('development_id', developmentId)
      .in('role_type', managedRoles)
      .eq('assignment_source', 'development_default')

    let deleteResult = await deleteQuery
    if (deleteResult.error && isMissingColumnError(deleteResult.error, 'assignment_source')) {
      deleteResult = await client
        .from('development_participants')
        .delete()
        .eq('development_id', developmentId)
        .in('role_type', managedRoles)
    }

    if (deleteResult.error) {
      if (isMissingTableError(deleteResult.error, 'development_participants') || isMissingSchemaError(deleteResult.error)) {
        return
      }
      throw deleteResult.error
    }
  }

  await clearManagedAssignments()
  if (!rowsWithUsers.length) {
    return
  }

  const insertVariants = [
    rowsWithUsers,
    rowsWithUsers.map((row) => {
      const clone = { ...row }
      delete clone.user_id
      delete clone.organisation_name
      delete clone.is_primary
      delete clone.can_create_transactions
      delete clone.assignment_source
      delete clone.is_active
      return clone
    }),
    rowsWithUsers.map((row) => ({
      development_id: row.development_id,
      role_type: row.role_type,
      participant_name: row.participant_name,
      participant_email: row.participant_email,
    })),
  ]

  let lastInsertError = null
  for (const payload of insertVariants) {
    const insertResult = await client.from('development_participants').insert(payload)
    if (!insertResult.error) {
      return
    }

    if (isMissingTableError(insertResult.error, 'development_participants') || isMissingSchemaError(insertResult.error)) {
      return
    }

    lastInsertError = insertResult.error
  }

  if (lastInsertError) {
    throw lastInsertError
  }
}

async function syncPrimaryAttorneyDevelopmentParticipant(
  client,
  {
    developmentId,
    attorneyFirmName = '',
    primaryContactName = '',
    primaryContactEmail = '',
  } = {},
) {
  if (!developmentId) {
    return
  }

  const normalizedEmail = normalizeEmailAddress(primaryContactEmail)
  const participantName = normalizeNullableText(primaryContactName || attorneyFirmName)
  const organisationName = normalizeNullableText(attorneyFirmName)

  let listQuery = await client
    .from('development_participants')
    .select('id, participant_email, participant_name, assignment_source, is_primary')
    .eq('development_id', developmentId)
    .eq('role_type', 'attorney')

  if (
    listQuery.error &&
    (isMissingColumnError(listQuery.error, 'assignment_source') || isMissingColumnError(listQuery.error, 'is_primary'))
  ) {
    listQuery = await client
      .from('development_participants')
      .select('id, participant_email, participant_name')
      .eq('development_id', developmentId)
      .eq('role_type', 'attorney')
  }

  if (listQuery.error) {
    if (isMissingTableError(listQuery.error, 'development_participants') || isMissingSchemaError(listQuery.error)) {
      return
    }
    throw listQuery.error
  }

  const existingRows = listQuery.data || []

  if (!normalizedEmail && !participantName) {
    if (!existingRows.length) {
      return
    }

    const resetResult = await client
      .from('development_participants')
      .update({ is_primary: false })
      .eq('development_id', developmentId)
      .eq('role_type', 'attorney')
    if (
      resetResult.error &&
      !isMissingSchemaError(resetResult.error) &&
      !isMissingColumnError(resetResult.error, 'is_primary')
    ) {
      throw resetResult.error
    }
    return
  }

  const profileIdByEmail = await resolveProfileIdsByEmail(client, normalizedEmail ? [normalizedEmail] : [])
  const userId = normalizedEmail ? profileIdByEmail[normalizedEmail] || null : null
  const matched = existingRows.find((row) => normalizeEmailAddress(row.participant_email) === normalizedEmail) ||
    existingRows.find((row) => String(row.participant_name || '').trim() === String(participantName || '').trim()) ||
    null

  const payload = {
    development_id: developmentId,
    user_id: userId,
    role_type: 'attorney',
    participant_name: participantName,
    participant_email: normalizedEmail || null,
    organisation_name: organisationName,
    is_primary: true,
    can_view: true,
    can_create_transactions: false,
    assignment_source: 'development_default',
    is_active: true,
  }

  if (matched?.id) {
    let updateResult = await client
      .from('development_participants')
      .update(payload)
      .eq('id', matched.id)

    if (
      updateResult.error &&
      (isMissingColumnError(updateResult.error, 'user_id') ||
        isMissingColumnError(updateResult.error, 'organisation_name') ||
        isMissingColumnError(updateResult.error, 'assignment_source') ||
        isMissingColumnError(updateResult.error, 'can_create_transactions') ||
        isMissingColumnError(updateResult.error, 'is_active'))
    ) {
      const fallbackPayload = {
        role_type: 'attorney',
        participant_name: participantName,
        participant_email: normalizedEmail || null,
      }
      updateResult = await client
        .from('development_participants')
        .update(fallbackPayload)
        .eq('id', matched.id)
    }

    if (updateResult.error && !isMissingSchemaError(updateResult.error)) {
      throw updateResult.error
    }
  } else {
    let insertResult = await client.from('development_participants').insert(payload)

    if (
      insertResult.error &&
      (isMissingColumnError(insertResult.error, 'user_id') ||
        isMissingColumnError(insertResult.error, 'organisation_name') ||
        isMissingColumnError(insertResult.error, 'assignment_source') ||
        isMissingColumnError(insertResult.error, 'can_create_transactions') ||
        isMissingColumnError(insertResult.error, 'is_active'))
    ) {
      insertResult = await client.from('development_participants').insert({
        development_id: developmentId,
        role_type: 'attorney',
        participant_name: participantName,
        participant_email: normalizedEmail || null,
      })
    }

    if (insertResult.error && !isMissingSchemaError(insertResult.error)) {
      throw insertResult.error
    }
  }

  if (existingRows.length && (matched?.id || normalizedEmail)) {
    let clearPrimaryQuery = client
      .from('development_participants')
      .update({ is_primary: false })
      .eq('development_id', developmentId)
      .eq('role_type', 'attorney')

    if (matched?.id) {
      clearPrimaryQuery = clearPrimaryQuery.neq('id', matched.id)
    } else if (normalizedEmail) {
      clearPrimaryQuery = clearPrimaryQuery.neq('participant_email', normalizedEmail)
    }

    const clearPrimaryResult = await clearPrimaryQuery
    if (
      clearPrimaryResult.error &&
      !isMissingSchemaError(clearPrimaryResult.error) &&
      !isMissingColumnError(clearPrimaryResult.error, 'is_primary')
    ) {
      throw clearPrimaryResult.error
    }
  }
}

async function fetchDevelopmentFeatureFlags(client, developmentId) {
  if (!developmentId) {
    return null
  }

  const { data, error } = await client
    .from('developments')
    .select('id, snag_tracking_enabled, alterations_enabled')
    .eq('id', developmentId)
    .maybeSingle()

  if (error) {
    if (
      isMissingSchemaError(error) ||
      isMissingColumnError(error, 'snag_tracking_enabled') ||
      isMissingColumnError(error, 'alterations_enabled') ||
      isPermissionDeniedError(error)
    ) {
      return null
    }

    throw error
  }

  return data || null
}

async function ensureDevelopmentSettings(client, developmentId, { createIfMissing = true } = {}) {
  if (!developmentId) {
    return DEFAULT_DEVELOPMENT_SETTINGS
  }

  const developmentFeatureFlags = await fetchDevelopmentFeatureFlags(client, developmentId)
  const fallbackSnagSetting =
    developmentFeatureFlags?.snag_tracking_enabled === null || developmentFeatureFlags?.snag_tracking_enabled === undefined
      ? DEFAULT_DEVELOPMENT_SETTINGS.snag_reporting_enabled
      : Boolean(developmentFeatureFlags.snag_tracking_enabled)
  const fallbackAlterationSetting =
    developmentFeatureFlags?.alterations_enabled === null || developmentFeatureFlags?.alterations_enabled === undefined
      ? DEFAULT_DEVELOPMENT_SETTINGS.alteration_requests_enabled
      : Boolean(developmentFeatureFlags.alterations_enabled)

  const { data, error } = await client
    .from('development_settings')
    .select(
      'development_id, client_portal_enabled, snag_reporting_enabled, alteration_requests_enabled, service_reviews_enabled, reservation_deposit_enabled_by_default, reservation_deposit_amount, reservation_deposit_payment_details, reservation_deposit_notification_recipients, enabled_modules, stakeholder_teams',
    )
    .eq('development_id', developmentId)
    .maybeSingle()

  if (error) {
    if (
      isMissingSchemaError(error) ||
      isMissingColumnError(error, 'enabled_modules') ||
      isMissingColumnError(error, 'reservation_deposit_enabled_by_default') ||
      isMissingColumnError(error, 'reservation_deposit_amount') ||
      isMissingColumnError(error, 'reservation_deposit_payment_details') ||
      isMissingColumnError(error, 'reservation_deposit_notification_recipients') ||
      isPermissionDeniedError(error)
    ) {
      return {
        ...DEFAULT_DEVELOPMENT_SETTINGS,
        snag_reporting_enabled: fallbackSnagSetting,
        alteration_requests_enabled: fallbackAlterationSetting,
      }
    }

    throw error
  }

  if (data) {
    const normalized = normalizeDevelopmentSettingsRow(data)
    const merged = {
      ...normalized,
      snag_reporting_enabled: fallbackSnagSetting,
      alteration_requests_enabled: fallbackAlterationSetting,
    }

    if (
      normalized.snag_reporting_enabled !== merged.snag_reporting_enabled ||
      normalized.alteration_requests_enabled !== merged.alteration_requests_enabled
    ) {
      try {
        await client
          .from('development_settings')
          .update({
            snag_reporting_enabled: merged.snag_reporting_enabled,
            alteration_requests_enabled: merged.alteration_requests_enabled,
          })
          .eq('development_id', developmentId)
      } catch (syncError) {
        if (!(isMissingSchemaError(syncError) || isPermissionDeniedError(syncError))) {
          throw syncError
        }
      }
    }

    return merged
  }

  if (!createIfMissing) {
    return {
      ...DEFAULT_DEVELOPMENT_SETTINGS,
      snag_reporting_enabled: fallbackSnagSetting,
      alteration_requests_enabled: fallbackAlterationSetting,
    }
  }

  const { data: inserted, error: insertError } = await client
    .from('development_settings')
    .insert({
      development_id: developmentId,
      client_portal_enabled: DEFAULT_DEVELOPMENT_SETTINGS.client_portal_enabled,
      snag_reporting_enabled: fallbackSnagSetting,
      alteration_requests_enabled: fallbackAlterationSetting,
      service_reviews_enabled: DEFAULT_DEVELOPMENT_SETTINGS.service_reviews_enabled,
      reservation_deposit_enabled_by_default: DEFAULT_DEVELOPMENT_SETTINGS.reservation_deposit_enabled_by_default,
      reservation_deposit_amount: DEFAULT_DEVELOPMENT_SETTINGS.reservation_deposit_amount,
      reservation_deposit_payment_details: DEFAULT_DEVELOPMENT_SETTINGS.reservation_deposit_payment_details,
      reservation_deposit_notification_recipients: DEFAULT_DEVELOPMENT_SETTINGS.reservation_deposit_notification_recipients,
      enabled_modules: DEFAULT_DEVELOPMENT_SETTINGS.enabledModules,
      stakeholder_teams: DEFAULT_DEVELOPMENT_SETTINGS.stakeholderTeams,
    })
    .select(
      'development_id, client_portal_enabled, snag_reporting_enabled, alteration_requests_enabled, service_reviews_enabled, reservation_deposit_enabled_by_default, reservation_deposit_amount, reservation_deposit_payment_details, reservation_deposit_notification_recipients, enabled_modules, stakeholder_teams',
    )
    .single()

  if (insertError) {
    if (
      isMissingSchemaError(insertError) ||
      isMissingColumnError(insertError, 'enabled_modules') ||
      isMissingColumnError(insertError, 'reservation_deposit_enabled_by_default') ||
      isMissingColumnError(insertError, 'reservation_deposit_amount') ||
      isMissingColumnError(insertError, 'reservation_deposit_payment_details') ||
      isMissingColumnError(insertError, 'reservation_deposit_notification_recipients') ||
      isPermissionDeniedError(insertError)
    ) {
      return {
        ...DEFAULT_DEVELOPMENT_SETTINGS,
        snag_reporting_enabled: fallbackSnagSetting,
        alteration_requests_enabled: fallbackAlterationSetting,
      }
    }

    throw insertError
  }

  return normalizeDevelopmentSettingsRow(inserted)
}

async function fetchDocumentRequirements(client, developmentId = null) {
  try {
    let query = client
      .from('document_requirements')
      .select('id, development_id, category_key, label, sort_order')
      .order('sort_order', { ascending: true })

    if (developmentId) {
      query = query.or(`development_id.is.null,development_id.eq.${developmentId}`)
    } else {
      query = query.is('development_id', null)
    }

    const { data, error } = await query

    if (error) {
      if (isMissingSchemaError(error) || isPermissionDeniedError(error)) {
        return DEFAULT_DOCUMENT_REQUIREMENTS
      }

      throw error
    }

    return normalizeRequirementRows(data)
  } catch (error) {
    if (isMissingSchemaError(error) || isPermissionDeniedError(error)) {
      return DEFAULT_DOCUMENT_REQUIREMENTS
    }

    throw error
  }
}

export async function fetchDevelopmentDocumentRequirements(developmentId) {
  const client = requireClient()

  if (!developmentId) {
    return []
  }

  const { data, error } = await client
    .from('document_requirements')
    .select('id, development_id, category_key, label, sort_order')
    .eq('development_id', developmentId)
    .order('sort_order', { ascending: true })

  if (error) {
    if (error.code === '42P01') {
      return []
    }

    throw error
  }

  return data
}

export async function fetchDevelopmentSettings(developmentId) {
  const client = requireClient()
  return ensureDevelopmentSettings(client, developmentId)
}

export async function fetchDevelopmentParticipants(developmentId, { roleType = null } = {}) {
  const client = requireClient()
  if (!developmentId) {
    return []
  }

  const participants = await resolveDevelopmentParticipantsByIdentity(client, {
    developmentIds: [developmentId],
    roleType,
  })

  return participants.filter((row) => row.developmentId === developmentId)
}

export async function updateDevelopmentSettings(developmentId, settings) {
  const client = requireClient()

  if (!developmentId) {
    throw new Error('Development is required.')
  }

  const payload = {
    development_id: developmentId,
    client_portal_enabled: Boolean(settings.client_portal_enabled),
    snag_reporting_enabled: Boolean(settings.snag_reporting_enabled),
    alteration_requests_enabled: Boolean(settings.alteration_requests_enabled),
    service_reviews_enabled: Boolean(settings.service_reviews_enabled),
    reservation_deposit_enabled_by_default: Boolean(
      settings.reservation_deposit_enabled_by_default ?? settings.reservationDepositEnabledByDefault,
    ),
    reservation_deposit_amount: normalizeOptionalNumber(
      settings.reservation_deposit_amount ?? settings.reservationDepositAmount,
    ),
    reservation_deposit_payment_details: normalizeDevelopmentSettingsRow({
      reservation_deposit_payment_details:
        settings.reservation_deposit_payment_details || settings.reservationDepositPaymentDetails,
    }).reservation_deposit_payment_details,
    reservation_deposit_notification_recipients: normalizeDevelopmentSettingsRow({
      reservation_deposit_notification_recipients:
        settings.reservation_deposit_notification_recipients || settings.reservationDepositNotificationRecipients,
    }).reservation_deposit_notification_recipients,
    enabled_modules: {
      ...DEFAULT_DEVELOPMENT_SETTINGS.enabledModules,
      ...(settings.enabledModules || settings.enabled_modules || {}),
    },
    stakeholder_teams: {
      agents: Array.isArray(settings.stakeholderTeams?.agents || settings.stakeholder_teams?.agents)
        ? settings.stakeholderTeams?.agents || settings.stakeholder_teams?.agents
        : [],
      conveyancers: Array.isArray(settings.stakeholderTeams?.conveyancers || settings.stakeholder_teams?.conveyancers)
        ? settings.stakeholderTeams?.conveyancers || settings.stakeholder_teams?.conveyancers
        : [],
      bondOriginators: Array.isArray(settings.stakeholderTeams?.bondOriginators || settings.stakeholder_teams?.bondOriginators || settings.stakeholder_teams?.bond_originators)
        ? settings.stakeholderTeams?.bondOriginators ||
          settings.stakeholder_teams?.bondOriginators ||
          settings.stakeholder_teams?.bond_originators
        : [],
    },
  }

  const selectClause =
    'development_id, client_portal_enabled, snag_reporting_enabled, alteration_requests_enabled, service_reviews_enabled, reservation_deposit_enabled_by_default, reservation_deposit_amount, reservation_deposit_payment_details, reservation_deposit_notification_recipients, enabled_modules, stakeholder_teams'

  const settingsResult = await upsertByDevelopmentIdWithFallback(client, {
    table: 'development_settings',
    payload,
    selectClause,
    expectSingleRow: true,
  })

  const { data, error } = settingsResult

  if (error) {
    if (
      error.code === '42P01' ||
      isMissingColumnError(error, 'enabled_modules') ||
      isMissingColumnError(error, 'reservation_deposit_enabled_by_default') ||
      isMissingColumnError(error, 'reservation_deposit_amount') ||
      isMissingColumnError(error, 'reservation_deposit_payment_details') ||
      isMissingColumnError(error, 'reservation_deposit_notification_recipients')
    ) {
      throw new Error('development_settings table not found. Run sql/schema.sql first.')
    }

    throw error
  }

  const normalized = normalizeDevelopmentSettingsRow(data)
  await syncDevelopmentParticipantsFromSettings(client, {
    developmentId,
    stakeholderTeams: normalized.stakeholderTeams,
  })

  return normalized
}

function normalizeAttorneyCloseoutStatus(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  return ATTORNEY_CLOSEOUT_STATUS_VALUES.includes(normalized) ? normalized : 'not_started'
}

function normalizeAttorneyReconciliationStatus(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  return ATTORNEY_RECONCILIATION_STATUS_VALUES.includes(normalized) ? normalized : 'not_budgeted'
}

function normalizeDevelopmentAttorneyDocumentRow(row = {}) {
  const fallback =
    ATTORNEY_CLOSEOUT_DOCUMENT_DEFINITIONS.find((item) => item.key === row.document_type_key || item.key === row.key) ||
    {}

  return {
    id: row.id || null,
    key: row.document_type_key || row.key || fallback.key || '',
    label: row.label || fallback.label || 'Close-Out Document',
    requiredForCloseOut: row.required_for_close_out ?? fallback.requiredForCloseOut ?? true,
    visibleToDeveloper: row.visible_to_developer ?? fallback.visibleToDeveloper ?? true,
    visibleToAttorney: row.visible_to_attorney ?? fallback.visibleToAttorney ?? true,
    internalOnly: row.internal_only ?? fallback.internalOnly ?? false,
    sortOrder: Number(row.sort_order ?? fallback.sortOrder ?? 0),
    isActive: row.is_active ?? true,
  }
}

function buildDefaultDevelopmentAttorneyDocuments() {
  return ATTORNEY_CLOSEOUT_DOCUMENT_DEFINITIONS.map((item) => normalizeDevelopmentAttorneyDocumentRow(item))
}

function normalizeDevelopmentAttorneyConfigRow(row = null, documents = []) {
  const normalizedDocuments = documents.length
    ? documents.map((item) => normalizeDevelopmentAttorneyDocumentRow(item)).sort((a, b) => a.sortOrder - b.sortOrder)
    : buildDefaultDevelopmentAttorneyDocuments()

  return {
    ...DEFAULT_DEVELOPMENT_ATTORNEY_CONFIG,
    id: row?.id || null,
    developmentId: row?.development_id || row?.developmentId || null,
    attorneyFirmName: normalizeTextValue(row?.attorney_firm_name || row?.attorneyFirmName),
    attorneyFirmId: row?.attorney_firm_id || row?.attorneyFirmId || null,
    primaryContactName: normalizeTextValue(row?.primary_contact_name || row?.primaryContactName),
    primaryContactEmail: normalizeTextValue(row?.primary_contact_email || row?.primaryContactEmail),
    primaryContactPhone: normalizeTextValue(row?.primary_contact_phone || row?.primaryContactPhone),
    feeModelType: normalizeTextValue(row?.fee_model_type || row?.feeModelType) || 'fixed_fee',
    defaultFeeAmount: normalizeOptionalNumber(row?.default_fee_amount ?? row?.defaultFeeAmount),
    vatIncluded: row?.vat_included ?? row?.vatIncluded ?? true,
    disbursementsIncluded: row?.disbursements_included ?? row?.disbursementsIncluded ?? false,
    overrideAllowed: row?.override_allowed ?? row?.overrideAllowed ?? true,
    notes: normalizeTextValue(row?.notes),
    activeFrom: normalizeOptionalDate(row?.active_from ?? row?.activeFrom) || '',
    activeTo: normalizeOptionalDate(row?.active_to ?? row?.activeTo) || '',
    isActive: row?.is_active ?? row?.isActive ?? true,
    requiredDocuments: normalizedDocuments,
  }
}

function isRegisteredTransactionForCloseout(transaction) {
  if (!transaction) {
    return false
  }

  const normalizedMainStage = String(
    transaction.current_main_stage || getMainStageFromDetailedStage(transaction.stage || ''),
  ).toUpperCase()

  return normalizedMainStage === 'REG' || normalizeStageLabel(transaction.stage || '') === 'Registered'
}

async function syncDevelopmentAttorneyRequiredDocs(client, configId, selectedDocuments = []) {
  if (!configId) {
    return buildDefaultDevelopmentAttorneyDocuments()
  }

  const selectedKeys = new Set(
    (selectedDocuments.length ? selectedDocuments : buildDefaultDevelopmentAttorneyDocuments())
      .filter((item) => item.isActive !== false)
      .map((item) => item.key),
  )

  const payload = ATTORNEY_CLOSEOUT_DOCUMENT_DEFINITIONS.map((definition) => ({
    development_attorney_config_id: configId,
    document_type_key: definition.key,
    label: definition.label,
    required_for_close_out: selectedKeys.has(definition.key),
    visible_to_developer: definition.visibleToDeveloper,
    visible_to_attorney: definition.visibleToAttorney,
    internal_only: definition.internalOnly,
    sort_order: definition.sortOrder,
    is_active: true,
  }))

  const { error } = await client
    .from('development_attorney_required_closeout_docs')
    .upsert(payload, { onConflict: 'development_attorney_config_id,document_type_key' })

  if (error) {
    if (isMissingSchemaError(error)) {
      return buildDefaultDevelopmentAttorneyDocuments()
    }

    throw error
  }

  const { data, error: docsError } = await client
    .from('development_attorney_required_closeout_docs')
    .select(
      'id, development_attorney_config_id, document_type_key, label, required_for_close_out, visible_to_developer, visible_to_attorney, internal_only, sort_order, is_active',
    )
    .eq('development_attorney_config_id', configId)
    .order('sort_order', { ascending: true })

  if (docsError) {
    if (isMissingSchemaError(docsError)) {
      return buildDefaultDevelopmentAttorneyDocuments()
    }

    throw docsError
  }

  return (data || []).map((item) => normalizeDevelopmentAttorneyDocumentRow(item))
}

export async function fetchDevelopmentAttorneyConfig(developmentId) {
  const client = requireClient()

  if (!developmentId) {
    return normalizeDevelopmentAttorneyConfigRow(null, [])
  }

  const { data, error } = await client
    .from('development_attorney_configs')
    .select(
      'id, development_id, attorney_firm_name, attorney_firm_id, primary_contact_name, primary_contact_email, primary_contact_phone, fee_model_type, default_fee_amount, vat_included, disbursements_included, override_allowed, notes, active_from, active_to, is_active',
    )
    .eq('development_id', developmentId)
    .maybeSingle()

  if (error) {
    if (isMissingSchemaError(error) || isPermissionDeniedError(error)) {
      return normalizeDevelopmentAttorneyConfigRow({ development_id: developmentId }, [])
    }

    throw error
  }

  if (!data) {
    return normalizeDevelopmentAttorneyConfigRow({ development_id: developmentId }, [])
  }

  const { data: docs, error: docsError } = await client
    .from('development_attorney_required_closeout_docs')
    .select(
      'id, development_attorney_config_id, document_type_key, label, required_for_close_out, visible_to_developer, visible_to_attorney, internal_only, sort_order, is_active',
    )
    .eq('development_attorney_config_id', data.id)
    .order('sort_order', { ascending: true })

  if (docsError) {
    if (isMissingSchemaError(docsError) || isPermissionDeniedError(docsError)) {
      return normalizeDevelopmentAttorneyConfigRow(data, [])
    }

    throw docsError
  }

  return normalizeDevelopmentAttorneyConfigRow(data, docs || [])
}

export async function saveDevelopmentAttorneyConfig(developmentId, input = {}) {
  const client = requireClient()

  if (!developmentId) {
    throw new Error('Development is required.')
  }

  const payload = {
    development_id: developmentId,
    attorney_firm_name: normalizeNullableText(input.attorneyFirmName),
    attorney_firm_id: input.attorneyFirmId || null,
    primary_contact_name: normalizeNullableText(input.primaryContactName),
    primary_contact_email: normalizeNullableText(input.primaryContactEmail)?.toLowerCase() || null,
    primary_contact_phone: normalizeNullableText(input.primaryContactPhone),
    fee_model_type: 'fixed_fee',
    default_fee_amount: normalizeOptionalNumber(input.defaultFeeAmount),
    vat_included: Boolean(input.vatIncluded),
    disbursements_included: Boolean(input.disbursementsIncluded),
    override_allowed: Boolean(input.overrideAllowed),
    notes: normalizeNullableText(input.notes),
    active_from: normalizeOptionalDate(input.activeFrom),
    active_to: normalizeOptionalDate(input.activeTo),
    is_active: input.isActive !== false,
  }

  const { data, error } = await upsertByDevelopmentIdWithFallback(client, {
    table: 'development_attorney_configs',
    payload,
    selectClause:
      'id, development_id, attorney_firm_name, attorney_firm_id, primary_contact_name, primary_contact_email, primary_contact_phone, fee_model_type, default_fee_amount, vat_included, disbursements_included, override_allowed, notes, active_from, active_to, is_active',
    expectSingleRow: true,
  })

  if (error) {
    if (isMissingSchemaError(error)) {
      throw new Error('Attorney commercial setup tables are not set up yet. Run sql/schema.sql first.')
    }

    throw error
  }

  const requiredDocuments = await syncDevelopmentAttorneyRequiredDocs(
    client,
    data.id,
    Array.isArray(input.requiredDocuments) ? input.requiredDocuments : [],
  )

  await syncPrimaryAttorneyDevelopmentParticipant(client, {
    developmentId,
    attorneyFirmName: payload.attorney_firm_name || '',
    primaryContactName: payload.primary_contact_name || '',
    primaryContactEmail: payload.primary_contact_email || '',
  })

  return normalizeDevelopmentAttorneyConfigRow(data, requiredDocuments)
}

function deriveAttorneyCloseoutVariance(budgetedAmount, actualBilledAmount) {
  const budgeted = normalizeOptionalNumber(budgetedAmount)
  const actual = normalizeOptionalNumber(actualBilledAmount)
  const varianceAmount = budgeted !== null && actual !== null ? actual - budgeted : null
  const variancePercent =
    varianceAmount !== null && budgeted && budgeted !== 0 ? Number(((varianceAmount / budgeted) * 100).toFixed(2)) : null

  return {
    budgetedAmount: budgeted,
    actualBilledAmount: actual,
    varianceAmount,
    variancePercent,
  }
}

function deriveAttorneyCloseoutStatuses({ transaction, closeout, documents = [] }) {
  const isRegistered = isRegisteredTransactionForCloseout(transaction)
  const requiredDocs = documents.filter((item) => item.isRequired)
  const uploadedRequiredCount = requiredDocs.filter((item) => item.status === 'uploaded' || item.status === 'accepted').length
  const allRequiredDocsUploaded = requiredDocs.every(
    (item) => item.status === 'uploaded' || item.status === 'accepted',
  )
  const hasActual = normalizeOptionalNumber(closeout?.actual_billed_amount ?? closeout?.actualBilledAmount) !== null
  const hasBudget = normalizeOptionalNumber(closeout?.budgeted_amount ?? closeout?.budgetedAmount) !== null
  const hasInvoice = documents.some(
    (item) =>
      item.key === 'attorney_invoice' && (item.status === 'uploaded' || item.status === 'accepted'),
  )
  const hasStatement = documents.some(
    (item) =>
      item.key === 'attorney_statement' && (item.status === 'uploaded' || item.status === 'accepted'),
  )
  const readyToClose = Boolean(isRegistered && hasActual && allRequiredDocsUploaded)

  let reconciliationStatus = 'not_budgeted'
  if (hasBudget) {
    reconciliationStatus = 'budgeted'
  }
  if (hasBudget && !hasInvoice) {
    reconciliationStatus = 'awaiting_invoice'
  } else if (hasInvoice && !hasStatement) {
    reconciliationStatus = 'awaiting_statement'
  } else if (readyToClose) {
    reconciliationStatus = normalizeAttorneyCloseoutStatus(closeout?.close_out_status) === 'closed' ? 'reconciled' : 'awaiting_review'
  }

  let closeOutStatus = normalizeAttorneyCloseoutStatus(closeout?.close_out_status)
  if (closeOutStatus === 'not_started' && (uploadedRequiredCount > 0 || hasActual || hasBudget)) {
    closeOutStatus = readyToClose ? 'ready_to_close' : 'in_progress'
  }
  if (closeOutStatus === 'in_progress' && readyToClose) {
    closeOutStatus = 'ready_to_close'
  }

  return {
    isRegistered,
    readyToClose,
    hasActual,
    hasBudget,
    hasInvoice,
    hasStatement,
    allRequiredDocsUploaded,
    uploadedRequiredCount,
    requiredCount: requiredDocs.length,
    closeOutStatus,
    reconciliationStatus,
  }
}

function normalizeAttorneyCloseoutDocumentRow(row = {}) {
  const fallback =
    ATTORNEY_CLOSEOUT_DOCUMENT_DEFINITIONS.find((item) => item.key === row.document_type_key || item.key === row.key) ||
    {}

  return {
    id: row.id || null,
    key: row.document_type_key || row.key || fallback.key || '',
    label: row.label || fallback.label || 'Document',
    isRequired: row.is_required ?? row.required_for_close_out ?? fallback.requiredForCloseOut ?? true,
    status: normalizeRequiredStatus(row.status || 'missing'),
    filePath: row.file_path || null,
    filename: row.filename || null,
    uploadedBy: row.uploaded_by || null,
    uploadedAt: row.uploaded_at || null,
    url: row.url || null,
  }
}

async function syncTransactionAttorneyCloseoutDocuments(client, closeoutId, configDocuments = []) {
  const definitions = (configDocuments.length ? configDocuments : buildDefaultDevelopmentAttorneyDocuments()).map((item) =>
    normalizeDevelopmentAttorneyDocumentRow(item),
  )

  const payload = definitions.map((item) => ({
    transaction_attorney_closeout_id: closeoutId,
    document_type_key: item.key,
    label: item.label,
    is_required: Boolean(item.requiredForCloseOut),
    status: 'missing',
  }))

  const { error } = await client
    .from('transaction_attorney_closeout_documents')
    .upsert(payload, { onConflict: 'transaction_attorney_closeout_id,document_type_key' })

  if (error) {
    if (isMissingSchemaError(error)) {
      return definitions.map((item) =>
        normalizeAttorneyCloseoutDocumentRow({
          document_type_key: item.key,
          label: item.label,
          is_required: item.requiredForCloseOut,
          status: 'missing',
        }),
      )
    }

    throw error
  }

  const { data, error: docsError } = await client
    .from('transaction_attorney_closeout_documents')
    .select(
      'id, transaction_attorney_closeout_id, document_type_key, label, file_path, filename, uploaded_by, uploaded_at, is_required, status',
    )
    .eq('transaction_attorney_closeout_id', closeoutId)

  if (docsError) {
    if (isMissingSchemaError(docsError)) {
      return definitions.map((item) =>
        normalizeAttorneyCloseoutDocumentRow({
          document_type_key: item.key,
          label: item.label,
          is_required: item.requiredForCloseOut,
          status: 'missing',
        }),
      )
    }

    throw docsError
  }

  return Promise.all(
    (data || []).map(async (item) =>
      normalizeAttorneyCloseoutDocumentRow({
        ...item,
        url: item.file_path ? await getSignedUrl(item.file_path) : null,
      }),
    ),
  )
}

async function ensureTransactionAttorneyCloseout(client, transaction) {
  if (!transaction?.id || !isRegisteredTransactionForCloseout(transaction)) {
    return null
  }

  const { data: existing, error: existingError } = await client
    .from('transaction_attorney_closeouts')
    .select(
      'id, transaction_id, development_id, attorney_firm_id, attorney_firm_name, budgeted_amount, budget_source, budget_notes, actual_billed_amount, variance_amount, variance_percent, vat_included, invoice_reference, invoice_date, statement_date, close_out_status, reconciliation_status, ready_for_review_at, ready_for_review_by, closed_at, closed_by, notes, created_at, updated_at',
    )
    .eq('transaction_id', transaction.id)
    .maybeSingle()

  if (existingError) {
    if (isMissingSchemaError(existingError)) {
      return null
    }

    throw existingError
  }

  const config = transaction.development_id ? await fetchDevelopmentAttorneyConfig(transaction.development_id) : null
  const budgetedAmount = normalizeOptionalNumber(config?.defaultFeeAmount)

  if (existing) {
    const documents = await syncTransactionAttorneyCloseoutDocuments(client, existing.id, config?.requiredDocuments || [])
    return { closeout: existing, config, documents }
  }

  const seedPayload = {
    transaction_id: transaction.id,
    development_id: transaction.development_id || null,
    attorney_firm_id: config?.attorneyFirmId || null,
    attorney_firm_name: config?.attorneyFirmName || transaction.attorney || null,
    budgeted_amount: budgetedAmount,
    budget_source: budgetedAmount !== null ? 'development_default' : 'development_default',
    vat_included: config?.vatIncluded ?? true,
    close_out_status: 'not_started',
    reconciliation_status: budgetedAmount !== null ? 'budgeted' : 'not_budgeted',
  }

  const { data: inserted, error: insertError } = await client
    .from('transaction_attorney_closeouts')
    .insert(seedPayload)
    .select(
      'id, transaction_id, development_id, attorney_firm_id, attorney_firm_name, budgeted_amount, budget_source, budget_notes, actual_billed_amount, variance_amount, variance_percent, vat_included, invoice_reference, invoice_date, statement_date, close_out_status, reconciliation_status, ready_for_review_at, ready_for_review_by, closed_at, closed_by, notes, created_at, updated_at',
    )
    .single()

  if (insertError) {
    if (isMissingSchemaError(insertError)) {
      return null
    }

    throw insertError
  }

  const documents = await syncTransactionAttorneyCloseoutDocuments(client, inserted.id, config?.requiredDocuments || [])

  return {
    closeout: inserted,
    config,
    documents,
  }
}

function buildAttorneyCloseoutViewModel({ transaction, closeout, documents = [], config = null }) {
  const money = deriveAttorneyCloseoutVariance(closeout?.budgeted_amount, closeout?.actual_billed_amount)
  const statuses = deriveAttorneyCloseoutStatuses({ transaction, closeout, documents })

  return {
    id: closeout?.id || null,
    transactionId: transaction?.id || null,
    developmentId: transaction?.development_id || null,
    attorneyFirmName: closeout?.attorney_firm_name || config?.attorneyFirmName || transaction?.attorney || 'Unassigned',
    budgetedAmount: money.budgetedAmount,
    budgetSource: closeout?.budget_source || 'development_default',
    budgetNotes: closeout?.budget_notes || '',
    actualBilledAmount: money.actualBilledAmount,
    varianceAmount: money.varianceAmount,
    variancePercent: money.variancePercent,
    vatIncluded: closeout?.vat_included ?? config?.vatIncluded ?? true,
    invoiceReference: closeout?.invoice_reference || '',
    invoiceDate: closeout?.invoice_date || '',
    statementDate: closeout?.statement_date || '',
    closeOutStatus: statuses.closeOutStatus,
    reconciliationStatus: statuses.reconciliationStatus,
    readyForReviewAt: closeout?.ready_for_review_at || null,
    closedAt: closeout?.closed_at || null,
    closedBy: closeout?.closed_by || null,
    notes: closeout?.notes || '',
    documents,
    readiness: {
      ...statuses,
    },
    config,
  }
}

export async function fetchTransactionAttorneyCloseout(transactionId) {
  const client = requireClient()

  if (!transactionId) {
    return null
  }

  const { data: transaction, error: transactionError } = await client
    .from('transactions')
    .select('id, development_id, unit_id, buyer_id, stage, current_main_stage, attorney, assigned_attorney_email')
    .eq('id', transactionId)
    .maybeSingle()

  if (transactionError) {
    throw transactionError
  }

  if (!transaction) {
    return null
  }

  const ensured = await ensureTransactionAttorneyCloseout(client, transaction)
  if (!ensured) {
    return null
  }

  return buildAttorneyCloseoutViewModel({
    transaction,
    closeout: ensured.closeout,
    documents: ensured.documents,
    config: ensured.config,
  })
}

export async function saveTransactionAttorneyCloseout(transactionId, input = {}) {
  const client = requireClient()
  const actorProfile = await resolveActiveProfileContext(client)

  if (!transactionId) {
    throw new Error('Transaction is required.')
  }

  const { data: transaction, error: transactionError } = await client
    .from('transactions')
    .select('id, development_id, stage, current_main_stage, attorney')
    .eq('id', transactionId)
    .maybeSingle()

  if (transactionError) {
    throw transactionError
  }

  if (!transaction) {
    throw new Error('Transaction not found.')
  }

  if (!isRegisteredTransactionForCloseout(transaction)) {
    throw new Error('Attorney close-out only becomes available once the transaction is registered.')
  }

  const ensured = await ensureTransactionAttorneyCloseout(client, transaction)
  if (!ensured?.closeout?.id) {
    throw new Error('Attorney close-out tables are not set up yet. Run sql/schema.sql first.')
  }

  const documents = await syncTransactionAttorneyCloseoutDocuments(client, ensured.closeout.id, ensured.config?.requiredDocuments || [])
  const budgetedAmount = normalizeOptionalNumber(input.budgetedAmount ?? ensured.closeout.budgeted_amount)
  const actualBilledAmount = normalizeOptionalNumber(input.actualBilledAmount ?? ensured.closeout.actual_billed_amount)
  const variance = deriveAttorneyCloseoutVariance(budgetedAmount, actualBilledAmount)
  const currentCloseout = {
    ...ensured.closeout,
    budgeted_amount: budgetedAmount,
    actual_billed_amount: actualBilledAmount,
    close_out_status: input.closeOutStatus ?? ensured.closeout.close_out_status,
  }
  const statusMeta = deriveAttorneyCloseoutStatuses({
    transaction,
    closeout: currentCloseout,
    documents,
  })

  let closeOutStatus = normalizeAttorneyCloseoutStatus(input.closeOutStatus ?? statusMeta.closeOutStatus)
  if (input.markReadyForReview) {
    if (!statusMeta.readyToClose) {
      throw new Error('All required close-out items must be complete before marking the transaction ready for review.')
    }
    closeOutStatus = 'ready_to_close'
  }

  if (input.markClosed) {
    if (!statusMeta.readyToClose) {
      throw new Error('You cannot close this transaction until the actual amount and required close-out documents are complete.')
    }
    closeOutStatus = 'closed'
  }

  const reconciliationStatus =
    closeOutStatus === 'closed'
      ? 'reconciled'
      : normalizeAttorneyReconciliationStatus(input.reconciliationStatus ?? statusMeta.reconciliationStatus)

  const payload = {
    budgeted_amount: budgetedAmount,
    budget_source: input.budgetSource || ensured.closeout.budget_source || 'development_default',
    budget_notes: normalizeNullableText(input.budgetNotes ?? ensured.closeout.budget_notes),
    actual_billed_amount: actualBilledAmount,
    variance_amount: variance.varianceAmount,
    variance_percent: variance.variancePercent,
    vat_included: input.vatIncluded ?? ensured.closeout.vat_included ?? true,
    invoice_reference: normalizeNullableText(input.invoiceReference ?? ensured.closeout.invoice_reference),
    invoice_date: normalizeOptionalDate(input.invoiceDate ?? ensured.closeout.invoice_date),
    statement_date: normalizeOptionalDate(input.statementDate ?? ensured.closeout.statement_date),
    close_out_status: closeOutStatus,
    reconciliation_status: reconciliationStatus,
    ready_for_review_at: input.markReadyForReview ? new Date().toISOString() : ensured.closeout.ready_for_review_at,
    ready_for_review_by: input.markReadyForReview ? actorProfile.userId || null : ensured.closeout.ready_for_review_by,
    closed_at: input.markClosed ? new Date().toISOString() : closeOutStatus === 'closed' ? ensured.closeout.closed_at : null,
    closed_by: input.markClosed ? actorProfile.userId || null : closeOutStatus === 'closed' ? ensured.closeout.closed_by : null,
    notes: normalizeNullableText(input.notes ?? ensured.closeout.notes),
    attorney_firm_name: normalizeNullableText(input.attorneyFirmName ?? ensured.closeout.attorney_firm_name ?? transaction.attorney),
  }

  const { error } = await client
    .from('transaction_attorney_closeouts')
    .update(payload)
    .eq('id', ensured.closeout.id)

  if (error) {
    if (isMissingSchemaError(error)) {
      throw new Error('Attorney close-out tables are not set up yet. Run sql/schema.sql first.')
    }

    throw error
  }

  await logTransactionEventIfPossible(client, {
    transactionId,
    createdBy: actorProfile.userId || null,
    createdByRole: actorProfile.role || 'developer',
    eventType: 'TransactionUpdated',
    eventData: {
      source: 'attorney_closeout',
      closeOutStatus,
      reconciliationStatus,
      actualBilledAmount,
      budgetedAmount,
    },
  })

  return fetchTransactionAttorneyCloseout(transactionId)
}

export async function uploadTransactionAttorneyCloseoutDocument({
  transactionId,
  closeoutId = null,
  file,
  documentTypeKey,
  label,
}) {
  const client = requireClient()
  const actorProfile = await resolveActiveProfileContext(client)

  if (!transactionId || !file || !documentTypeKey) {
    throw new Error('Transaction, file, and document type are required.')
  }

  const closeout = closeoutId
    ? { id: closeoutId }
    : await fetchTransactionAttorneyCloseout(transactionId)

  const targetCloseoutId = closeout?.id || closeout?.closeoutId || null
  if (!targetCloseoutId) {
    throw new Error('Attorney close-out is not available for this transaction yet.')
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '-')
  const filePath = `transaction-${transactionId}/closeout-${targetCloseoutId}/${Date.now()}-${safeName}`

  const { error: uploadError } = await client.storage.from(DOCUMENTS_BUCKET).upload(filePath, file)

  if (uploadError) {
    throw uploadError
  }

  const definition =
    ATTORNEY_CLOSEOUT_DOCUMENT_DEFINITIONS.find((item) => item.key === documentTypeKey) || null

  const payload = {
    transaction_attorney_closeout_id: targetCloseoutId,
    document_type_key: documentTypeKey,
    label: label || definition?.label || 'Close-Out Document',
    file_path: filePath,
    filename: file.name,
    uploaded_by: actorProfile.userId || null,
    uploaded_at: new Date().toISOString(),
    is_required: definition?.requiredForCloseOut ?? true,
    status: 'uploaded',
  }

  const { error } = await client
    .from('transaction_attorney_closeout_documents')
    .upsert(payload, { onConflict: 'transaction_attorney_closeout_id,document_type_key' })

  if (error) {
    if (isMissingSchemaError(error)) {
      throw new Error('Attorney close-out document tables are not set up yet. Run sql/schema.sql first.')
    }

    throw error
  }

  await logTransactionEventIfPossible(client, {
    transactionId,
    createdBy: actorProfile.userId || null,
    createdByRole: actorProfile.role || 'developer',
    eventType: 'DocumentUploaded',
    eventData: {
      source: 'attorney_closeout',
      documentTypeKey,
      documentName: file.name,
    },
  })

  return fetchTransactionAttorneyCloseout(transactionId)
}

export async function fetchDevelopmentAttorneyReconciliationReport(developmentId) {
  const client = requireClient()

  if (!developmentId) {
    return {
      config: normalizeDevelopmentAttorneyConfigRow(null, []),
      summary: {
        registeredCount: 0,
        totalBudgeted: 0,
        totalActual: 0,
        totalVariance: 0,
        outstandingInvoices: 0,
        outstandingStatements: 0,
        closeOutPending: 0,
      },
      rows: [],
    }
  }

  const config = await fetchDevelopmentAttorneyConfig(developmentId)

  const { data: transactions, error } = await client
    .from('transactions')
    .select('id, unit_id, buyer_id, development_id, stage, current_main_stage, attorney, sales_price, purchase_price, created_at, updated_at')
    .eq('development_id', developmentId)
    .order('updated_at', { ascending: false })

  if (error) {
    throw error
  }

  const registeredTransactions = (transactions || []).filter((item) => isRegisteredTransactionForCloseout(item))
  const transactionIds = registeredTransactions.map((item) => item.id)
  const unitIds = [...new Set(registeredTransactions.map((item) => item.unit_id).filter(Boolean))]
  const buyerIds = [...new Set(registeredTransactions.map((item) => item.buyer_id).filter(Boolean))]

  const [{ data: unitsData }, { data: buyersData }] = await Promise.all([
    unitIds.length
      ? client.from('units').select('id, unit_number').in('id', unitIds)
      : Promise.resolve({ data: [] }),
    buyerIds.length
      ? client.from('buyers').select('id, name').in('id', buyerIds)
      : Promise.resolve({ data: [] }),
  ])

  const unitById = Object.fromEntries((unitsData || []).map((item) => [item.id, item]))
  const buyerById = Object.fromEntries((buyersData || []).map((item) => [item.id, item]))

  let closeoutsByTransactionId = {}
  let docsByCloseoutId = {}
  if (transactionIds.length) {
    const { data: closeouts, error: closeoutsError } = await client
      .from('transaction_attorney_closeouts')
      .select(
        'id, transaction_id, attorney_firm_name, budgeted_amount, actual_billed_amount, variance_amount, variance_percent, close_out_status, reconciliation_status, invoice_reference, invoice_date, statement_date, closed_at',
      )
      .in('transaction_id', transactionIds)

    if (closeoutsError && !isMissingSchemaError(closeoutsError)) {
      throw closeoutsError
    }

    const closeoutRows = closeouts || []
    closeoutsByTransactionId = Object.fromEntries(closeoutRows.map((item) => [item.transaction_id, item]))

    const closeoutIds = closeoutRows.map((item) => item.id)
    if (closeoutIds.length) {
      const { data: docs, error: docsError } = await client
        .from('transaction_attorney_closeout_documents')
        .select('transaction_attorney_closeout_id, document_type_key, status, file_path, filename')
        .in('transaction_attorney_closeout_id', closeoutIds)

      if (docsError && !isMissingSchemaError(docsError)) {
        throw docsError
      }

      const docsWithUrls = await Promise.all(
        (docs || []).map(async (item) => ({
          ...item,
          url: item.file_path ? await getSignedUrl(item.file_path) : null,
        })),
      )

      docsByCloseoutId = docsWithUrls.reduce((accumulator, item) => {
        if (!accumulator[item.transaction_attorney_closeout_id]) {
          accumulator[item.transaction_attorney_closeout_id] = []
        }
        accumulator[item.transaction_attorney_closeout_id].push(item)
        return accumulator
      }, {})
    }
  }

  const rows = registeredTransactions.map((transaction) => {
    const closeout = closeoutsByTransactionId[transaction.id] || null
    const docRows = closeout?.id ? (docsByCloseoutId[closeout.id] || []).map(normalizeAttorneyCloseoutDocumentRow) : []
    const invoiceDocument = docRows.find((item) => item.key === 'attorney_invoice')
    const statementDocument = docRows.find((item) => item.key === 'attorney_statement')
    const money = deriveAttorneyCloseoutVariance(closeout?.budgeted_amount, closeout?.actual_billed_amount)
    const statuses = deriveAttorneyCloseoutStatuses({ transaction, closeout, documents: docRows })

    return {
      transactionId: transaction.id,
      developmentId,
      unitId: transaction.unit_id || null,
      unitNumber: unitById[transaction.unit_id]?.unit_number || '—',
      buyerName: buyerById[transaction.buyer_id]?.name || 'Unassigned',
      attorney: closeout?.attorney_firm_name || config.attorneyFirmName || transaction.attorney || 'Unassigned',
      registrationDate: transaction.updated_at || transaction.created_at,
      budgetedAmount: money.budgetedAmount,
      actualBilledAmount: money.actualBilledAmount,
      varianceAmount: money.varianceAmount,
      variancePercent: money.variancePercent,
      invoiceUploaded: statuses.hasInvoice,
      invoiceUrl: invoiceDocument?.url || null,
      invoiceFilename: invoiceDocument?.filename || null,
      statementUploaded: statuses.hasStatement,
      statementUrl: statementDocument?.url || null,
      statementFilename: statementDocument?.filename || null,
      closeOutStatus: closeout ? statuses.closeOutStatus : 'not_started',
      reconciliationStatus: closeout ? statuses.reconciliationStatus : money.budgetedAmount !== null ? 'budgeted' : 'not_budgeted',
      isClosed: normalizeAttorneyCloseoutStatus(closeout?.close_out_status) === 'closed',
      closedAt: closeout?.closed_at || null,
    }
  })

  const summary = rows.reduce(
    (accumulator, item) => {
      accumulator.registeredCount += 1
      accumulator.totalBudgeted += Number(item.budgetedAmount || 0)
      accumulator.totalActual += Number(item.actualBilledAmount || 0)
      accumulator.totalVariance += Number(item.varianceAmount || 0)
      if (!item.invoiceUploaded) accumulator.outstandingInvoices += 1
      if (!item.statementUploaded) accumulator.outstandingStatements += 1
      if (item.closeOutStatus !== 'closed') accumulator.closeOutPending += 1
      return accumulator
    },
    {
      registeredCount: 0,
      totalBudgeted: 0,
      totalActual: 0,
      totalVariance: 0,
      outstandingInvoices: 0,
      outstandingStatements: 0,
      closeOutPending: 0,
    },
  )

  return {
    config,
    summary,
    rows,
  }
}

export async function fetchAttorneyBillablesDashboard() {
  const client = requireClient()
  const activeProfile = await resolveActiveProfileContext(client)

  let closeouts = []
  const { data, error } = await client
    .from('transaction_attorney_closeouts')
    .select(
      'id, transaction_id, development_id, attorney_firm_id, attorney_firm_name, budgeted_amount, actual_billed_amount, variance_amount, variance_percent, close_out_status, reconciliation_status, created_at, updated_at',
    )
    .order('updated_at', { ascending: false })

  if (error) {
    if (isMissingSchemaError(error)) {
      return {
        summary: {
          registeredTransactions: 0,
          totalBudgeted: 0,
          totalActual: 0,
          totalReconciled: 0,
          outstandingInvoices: 0,
          outstandingCloseouts: 0,
        },
        rows: [],
      }
    }

    throw error
  }

  closeouts = data || []
  if (normalizeRoleType(activeProfile.role) === 'attorney') {
    const comparableNames = new Set(
      [activeProfile.companyName, activeProfile.fullName, activeProfile.email]
        .map((item) => String(item || '').trim().toLowerCase())
        .filter(Boolean),
    )
    closeouts = closeouts.filter((item) => {
      const attorneyName = String(item.attorney_firm_name || '').trim().toLowerCase()
      return item.attorney_firm_id === activeProfile.userId || comparableNames.has(attorneyName)
    })
  }

  const transactionIds = closeouts.map((item) => item.transaction_id).filter(Boolean)
  const developmentIds = [...new Set(closeouts.map((item) => item.development_id).filter(Boolean))]
  const [{ data: transactions }, { data: developments }] = await Promise.all([
    transactionIds.length
      ? client.from('transactions').select('id, unit_id, buyer_id, assigned_attorney_email').in('id', transactionIds)
      : Promise.resolve({ data: [] }),
    developmentIds.length
      ? client.from('developments').select('id, name').in('id', developmentIds)
      : Promise.resolve({ data: [] }),
  ])

  const transactionById = Object.fromEntries((transactions || []).map((item) => [item.id, item]))
  const developmentById = Object.fromEntries((developments || []).map((item) => [item.id, item]))
  const unitIds = [...new Set((transactions || []).map((item) => item.unit_id).filter(Boolean))]
  const buyerIds = [...new Set((transactions || []).map((item) => item.buyer_id).filter(Boolean))]
  const [{ data: unitsData }, { data: buyersData }] = await Promise.all([
    unitIds.length ? client.from('units').select('id, unit_number, list_price, price').in('id', unitIds) : Promise.resolve({ data: [] }),
    buyerIds.length ? client.from('buyers').select('id, name').in('id', buyerIds) : Promise.resolve({ data: [] }),
  ])
  const unitById = Object.fromEntries((unitsData || []).map((item) => [item.id, item]))
  const buyerById = Object.fromEntries((buyersData || []).map((item) => [item.id, item]))

  const rows = closeouts.map((item) => {
    const transaction = transactionById[item.transaction_id] || {}
    return {
      id: item.id,
      transactionId: item.transaction_id,
      developmentName: developmentById[item.development_id]?.name || 'Unknown Development',
      unitNumber: unitById[transaction.unit_id]?.unit_number || '—',
      buyerName: buyerById[transaction.buyer_id]?.name || 'Unassigned',
      registrationDate: item.updated_at || item.created_at,
      budgetedAmount: normalizeOptionalNumber(item.budgeted_amount),
      actualBilledAmount: normalizeOptionalNumber(item.actual_billed_amount),
      varianceAmount: normalizeOptionalNumber(item.variance_amount),
      variancePercent: normalizeOptionalNumber(item.variance_percent),
      closeOutStatus: normalizeAttorneyCloseoutStatus(item.close_out_status),
      reconciliationStatus: normalizeAttorneyReconciliationStatus(item.reconciliation_status),
    }
  })

  const summary = rows.reduce(
    (accumulator, item) => {
      accumulator.registeredTransactions += 1
      accumulator.totalBudgeted += Number(item.budgetedAmount || 0)
      accumulator.totalActual += Number(item.actualBilledAmount || 0)
      if (item.reconciliationStatus === 'reconciled') {
        accumulator.totalReconciled += 1
      }
      if (item.reconciliationStatus === 'awaiting_invoice') {
        accumulator.outstandingInvoices += 1
      }
      if (item.closeOutStatus !== 'closed') {
        accumulator.outstandingCloseouts += 1
      }
      return accumulator
    },
    {
      registeredTransactions: 0,
      totalBudgeted: 0,
      totalActual: 0,
      totalReconciled: 0,
      outstandingInvoices: 0,
      outstandingCloseouts: 0,
    },
  )

  return { summary, rows }
}

function normalizeBondCloseoutStatus(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  return BOND_CLOSEOUT_STATUS_VALUES.includes(normalized) ? normalized : 'not_started'
}

function normalizeBondReconciliationStatus(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  return BOND_RECONCILIATION_STATUS_VALUES.includes(normalized) ? normalized : 'not_budgeted'
}

function normalizeDevelopmentBondDocumentRow(row = {}) {
  const fallback = BOND_CLOSEOUT_DOCUMENT_DEFINITIONS.find((item) => item.key === row.document_type_key || item.key === row.key) || {}

  return {
    id: row.id || null,
    key: row.document_type_key || row.key || fallback.key || '',
    label: row.label || fallback.label || 'Commission Document',
    requiredForCloseOut: row.required_for_close_out ?? fallback.requiredForCloseOut ?? true,
    visibleToDeveloper: row.visible_to_developer ?? fallback.visibleToDeveloper ?? true,
    visibleToBondOriginator: row.visible_to_bond_originator ?? fallback.visibleToBondOriginator ?? true,
    internalOnly: row.internal_only ?? fallback.internalOnly ?? false,
    sortOrder: Number(row.sort_order ?? fallback.sortOrder ?? 0),
    isActive: row.is_active ?? true,
  }
}

function buildDefaultDevelopmentBondDocuments() {
  return BOND_CLOSEOUT_DOCUMENT_DEFINITIONS.map((item) => normalizeDevelopmentBondDocumentRow(item))
}

function normalizeDevelopmentBondConfigRow(row = null, documents = []) {
  const normalizedDocuments = documents.length
    ? documents.map((item) => normalizeDevelopmentBondDocumentRow(item)).sort((a, b) => a.sortOrder - b.sortOrder)
    : buildDefaultDevelopmentBondDocuments()

  return {
    ...DEFAULT_DEVELOPMENT_BOND_CONFIG,
    id: row?.id || null,
    developmentId: row?.development_id || row?.developmentId || null,
    bondOriginatorName: normalizeTextValue(row?.bond_originator_name || row?.bondOriginatorName),
    bondOriginatorId: row?.bond_originator_id || row?.bondOriginatorId || null,
    primaryContactName: normalizeTextValue(row?.primary_contact_name || row?.primaryContactName),
    primaryContactEmail: normalizeTextValue(row?.primary_contact_email || row?.primaryContactEmail),
    primaryContactPhone: normalizeTextValue(row?.primary_contact_phone || row?.primaryContactPhone),
    commissionModelType: normalizeTextValue(row?.commission_model_type || row?.commissionModelType) || 'fixed_fee',
    defaultCommissionAmount: normalizeOptionalNumber(row?.default_commission_amount ?? row?.defaultCommissionAmount),
    vatIncluded: row?.vat_included ?? row?.vatIncluded ?? true,
    overrideAllowed: row?.override_allowed ?? row?.overrideAllowed ?? true,
    notes: normalizeTextValue(row?.notes),
    activeFrom: normalizeOptionalDate(row?.active_from ?? row?.activeFrom) || '',
    activeTo: normalizeOptionalDate(row?.active_to ?? row?.activeTo) || '',
    isActive: row?.is_active ?? row?.isActive ?? true,
    requiredDocuments: normalizedDocuments,
  }
}

async function syncDevelopmentBondRequiredDocs(client, configId, selectedDocuments = []) {
  if (!configId) {
    return buildDefaultDevelopmentBondDocuments()
  }

  const selectedKeys = new Set(
    (selectedDocuments.length ? selectedDocuments : buildDefaultDevelopmentBondDocuments())
      .filter((item) => item.isActive !== false)
      .map((item) => item.key),
  )

  const payload = BOND_CLOSEOUT_DOCUMENT_DEFINITIONS.map((definition) => ({
    development_bond_config_id: configId,
    document_type_key: definition.key,
    label: definition.label,
    required_for_close_out: selectedKeys.has(definition.key),
    visible_to_developer: definition.visibleToDeveloper,
    visible_to_bond_originator: definition.visibleToBondOriginator,
    internal_only: definition.internalOnly,
    sort_order: definition.sortOrder,
    is_active: true,
  }))

  const { error } = await client
    .from('development_bond_required_closeout_docs')
    .upsert(payload, { onConflict: 'development_bond_config_id,document_type_key' })

  if (error) {
    if (isMissingSchemaError(error)) {
      return buildDefaultDevelopmentBondDocuments()
    }
    throw error
  }

  const { data, error: docsError } = await client
    .from('development_bond_required_closeout_docs')
    .select(
      'id, development_bond_config_id, document_type_key, label, required_for_close_out, visible_to_developer, visible_to_bond_originator, internal_only, sort_order, is_active',
    )
    .eq('development_bond_config_id', configId)
    .order('sort_order', { ascending: true })

  if (docsError) {
    if (isMissingSchemaError(docsError)) {
      return buildDefaultDevelopmentBondDocuments()
    }
    throw docsError
  }

  return (data || []).map((item) => normalizeDevelopmentBondDocumentRow(item))
}

export async function fetchDevelopmentBondConfig(developmentId) {
  const client = requireClient()

  if (!developmentId) {
    return normalizeDevelopmentBondConfigRow(null, [])
  }

  const { data, error } = await client
    .from('development_bond_configs')
    .select(
      'id, development_id, bond_originator_name, bond_originator_id, primary_contact_name, primary_contact_email, primary_contact_phone, commission_model_type, default_commission_amount, vat_included, override_allowed, notes, active_from, active_to, is_active',
    )
    .eq('development_id', developmentId)
    .maybeSingle()

  if (error) {
    if (isMissingSchemaError(error) || isPermissionDeniedError(error)) {
      return normalizeDevelopmentBondConfigRow({ development_id: developmentId }, [])
    }
    throw error
  }

  if (!data) {
    return normalizeDevelopmentBondConfigRow({ development_id: developmentId }, [])
  }

  const { data: docs, error: docsError } = await client
    .from('development_bond_required_closeout_docs')
    .select(
      'id, development_bond_config_id, document_type_key, label, required_for_close_out, visible_to_developer, visible_to_bond_originator, internal_only, sort_order, is_active',
    )
    .eq('development_bond_config_id', data.id)
    .order('sort_order', { ascending: true })

  if (docsError) {
    if (isMissingSchemaError(docsError) || isPermissionDeniedError(docsError)) {
      return normalizeDevelopmentBondConfigRow(data, [])
    }
    throw docsError
  }

  return normalizeDevelopmentBondConfigRow(data, docs || [])
}

export async function saveDevelopmentBondConfig(developmentId, input = {}) {
  const client = requireClient()

  if (!developmentId) {
    throw new Error('Development is required.')
  }

  const payload = {
    development_id: developmentId,
    bond_originator_name: normalizeNullableText(input.bondOriginatorName),
    bond_originator_id: input.bondOriginatorId || null,
    primary_contact_name: normalizeNullableText(input.primaryContactName),
    primary_contact_email: normalizeNullableText(input.primaryContactEmail)?.toLowerCase() || null,
    primary_contact_phone: normalizeNullableText(input.primaryContactPhone),
    commission_model_type: normalizeTextValue(input.commissionModelType) || 'fixed_fee',
    default_commission_amount: normalizeOptionalNumber(input.defaultCommissionAmount),
    vat_included: Boolean(input.vatIncluded),
    override_allowed: Boolean(input.overrideAllowed),
    notes: normalizeNullableText(input.notes),
    active_from: normalizeOptionalDate(input.activeFrom),
    active_to: normalizeOptionalDate(input.activeTo),
    is_active: input.isActive !== false,
  }

  const { data, error } = await upsertByDevelopmentIdWithFallback(client, {
    table: 'development_bond_configs',
    payload,
    selectClause:
      'id, development_id, bond_originator_name, bond_originator_id, primary_contact_name, primary_contact_email, primary_contact_phone, commission_model_type, default_commission_amount, vat_included, override_allowed, notes, active_from, active_to, is_active',
    expectSingleRow: true,
  })

  if (error) {
    if (isMissingSchemaError(error)) {
      throw new Error('Bond commercial setup tables are not set up yet. Run sql/schema.sql first.')
    }
    throw error
  }

  const requiredDocuments = await syncDevelopmentBondRequiredDocs(
    client,
    data.id,
    Array.isArray(input.requiredDocuments) ? input.requiredDocuments : [],
  )

  return normalizeDevelopmentBondConfigRow(data, requiredDocuments)
}

function isBondCommissionEligible(transaction) {
  if (!transaction) {
    return false
  }

  const financeType = normalizeFinanceType(transaction.finance_type || 'cash', { allowUnknown: true })
  if (!isBondFinanceType(financeType)) {
    return false
  }

  const mainStage = String(transaction.current_main_stage || getMainStageFromDetailedStage(transaction.stage || '')).toUpperCase()
  const detailedStage = normalizeStageLabel(transaction.stage || '')

  return detailedStage === 'Bond Approved / Proof of Funds' || ['ATTY', 'XFER', 'REG'].includes(mainStage)
}

function getOnboardingFinanceFieldValue(formData, keys = []) {
  if (!formData || typeof formData !== 'object' || Array.isArray(formData)) {
    return null
  }

  for (const key of keys) {
    const value = formData[key]
    if (value !== null && value !== undefined && value !== '') {
      return value
    }
  }

  return null
}

function deriveBondFinanceSnapshot(transaction = {}, onboardingFormData = null) {
  const financeType = normalizeFinanceType(
    transaction?.finance_type ||
      getOnboardingFinanceFieldValue(onboardingFormData, ['purchase_finance_type', 'finance_type']) ||
      'cash',
    { allowUnknown: true },
  )

  const purchasePrice = normalizeOptionalNumber(
    transaction?.purchase_price ??
      transaction?.sales_price ??
      transaction?.purchasePrice ??
      transaction?.salesPrice ??
      getOnboardingFinanceFieldValue(onboardingFormData, ['purchase_price', 'sale_price', 'sales_price']),
  )

  const cashAmount = normalizeOptionalNumber(
    transaction?.cash_amount ??
      transaction?.cashAmount ??
      getOnboardingFinanceFieldValue(onboardingFormData, ['cash_amount']),
  )

  const bondAmount = normalizeOptionalNumber(
    transaction?.bond_amount ??
      transaction?.bondAmount ??
      getOnboardingFinanceFieldValue(onboardingFormData, ['bond_amount']),
  )

  return {
    financeType,
    purchasePrice,
    cashAmount,
    bondAmount,
  }
}

function deriveBondCommissionBase(transaction = {}, unit = {}, financeSnapshot = null) {
  const resolvedFinanceSnapshot =
    financeSnapshot && typeof financeSnapshot === 'object'
      ? financeSnapshot
      : deriveBondFinanceSnapshot(transaction)

  const financeType = normalizeFinanceType(
    transaction?.finance_type || resolvedFinanceSnapshot.financeType || 'cash',
    { allowUnknown: true },
  )
  const purchasePrice = normalizeOptionalNumber(
    resolvedFinanceSnapshot.purchasePrice ??
      transaction?.purchase_price ??
      transaction?.sales_price ??
      transaction?.purchasePrice ??
      transaction?.salesPrice ??
      unit?.list_price ??
      unit?.listPrice ??
      unit?.price,
  )
  const cashAmount = normalizeOptionalNumber(resolvedFinanceSnapshot.cashAmount ?? transaction?.cash_amount ?? transaction?.cashAmount)
  const bondAmount = normalizeOptionalNumber(resolvedFinanceSnapshot.bondAmount ?? transaction?.bond_amount ?? transaction?.bondAmount)

  if (!isBondFinanceType(financeType)) {
    return {
      financeType,
      amount: null,
      source: 'not_bond',
      purchasePrice,
      cashAmount,
      bondAmount,
    }
  }

  if (bondAmount !== null && bondAmount > 0) {
    return {
      financeType,
      amount: bondAmount,
      source: 'bond_amount',
      purchasePrice,
      cashAmount,
      bondAmount,
    }
  }

  if (financeType === 'combination' && purchasePrice !== null && cashAmount !== null) {
    const derivedBondPortion = Number((purchasePrice - cashAmount).toFixed(2))
    if (derivedBondPortion > 0) {
      return {
        financeType,
        amount: derivedBondPortion,
        source: 'purchase_minus_cash',
        purchasePrice,
        cashAmount,
        bondAmount,
      }
    }
  }

  if (purchasePrice !== null && purchasePrice > 0) {
    return {
      financeType,
      amount: purchasePrice,
      source: financeType === 'combination' ? 'purchase_price_fallback' : 'purchase_price',
      purchasePrice,
      cashAmount,
      bondAmount,
    }
  }

  return {
    financeType,
    amount: null,
    source: 'missing',
    purchasePrice,
    cashAmount,
    bondAmount,
  }
}

function deriveBondCloseoutVariance(budgetedAmount, actualPaidAmount) {
  const budgeted = normalizeOptionalNumber(budgetedAmount)
  const actual = normalizeOptionalNumber(actualPaidAmount)
  const varianceAmount = budgeted !== null && actual !== null ? actual - budgeted : null
  const variancePercent =
    varianceAmount !== null && budgeted && budgeted !== 0 ? Number(((varianceAmount / budgeted) * 100).toFixed(2)) : null

  return {
    budgetedAmount: budgeted,
    actualPaidAmount: actual,
    varianceAmount,
    variancePercent,
  }
}

function deriveBondCommissionBudget(config, transaction = {}, unit = {}, financeSnapshot = null) {
  const defaultAmount = normalizeOptionalNumber(config?.defaultCommissionAmount)
  const commissionModelType = normalizeTextValue(config?.commissionModelType) || 'fixed_fee'
  const commissionBase = deriveBondCommissionBase(transaction, unit, financeSnapshot)

  if (defaultAmount === null || commissionBase.amount === null) {
    return null
  }

  if (commissionModelType === 'percentage') {
    return Number(((commissionBase.amount * defaultAmount) / 100).toFixed(2))
  }

  return defaultAmount
}

function normalizeBondCloseoutDocumentRow(row = {}) {
  const fallback = BOND_CLOSEOUT_DOCUMENT_DEFINITIONS.find((item) => item.key === row.document_type_key || item.key === row.key) || {}

  return {
    id: row.id || null,
    key: row.document_type_key || row.key || fallback.key || '',
    label: row.label || fallback.label || 'Document',
    isRequired: row.is_required ?? row.required_for_close_out ?? fallback.requiredForCloseOut ?? true,
    status: normalizeRequiredStatus(row.status || 'missing'),
    filePath: row.file_path || null,
    filename: row.filename || null,
    uploadedBy: row.uploaded_by || null,
    uploadedAt: row.uploaded_at || null,
    url: row.url || null,
  }
}

function deriveBondCloseoutStatuses({ transaction, closeout, documents = [] }) {
  const eligible = isBondCommissionEligible(transaction)
  const requiredDocs = documents.filter((item) => item.isRequired)
  const uploadedRequiredCount = requiredDocs.filter((item) => item.status === 'uploaded' || item.status === 'accepted').length
  const allRequiredDocsUploaded = requiredDocs.every((item) => item.status === 'uploaded' || item.status === 'accepted')
  const hasActual = normalizeOptionalNumber(closeout?.actual_paid_amount ?? closeout?.actualPaidAmount) !== null
  const hasBudget = normalizeOptionalNumber(closeout?.budgeted_amount ?? closeout?.budgetedAmount) !== null
  const hasStatement = documents.some((item) => item.key === 'commission_statement' && (item.status === 'uploaded' || item.status === 'accepted'))
  const hasConfirmation = documents.some(
    (item) => item.key === 'bond_approval_confirmation' && (item.status === 'uploaded' || item.status === 'accepted'),
  )
  const readyToClose = Boolean(eligible && hasActual && allRequiredDocsUploaded)

  let reconciliationStatus = 'not_budgeted'
  if (hasBudget) reconciliationStatus = 'budgeted'
  if (hasBudget && !hasStatement) {
    reconciliationStatus = 'awaiting_statement'
  } else if (hasStatement && !hasConfirmation) {
    reconciliationStatus = 'awaiting_confirmation'
  } else if (readyToClose) {
    reconciliationStatus = normalizeBondCloseoutStatus(closeout?.close_out_status) === 'closed' ? 'reconciled' : 'awaiting_review'
  }

  let closeOutStatus = normalizeBondCloseoutStatus(closeout?.close_out_status)
  if (closeOutStatus === 'not_started' && (uploadedRequiredCount > 0 || hasActual || hasBudget)) {
    closeOutStatus = readyToClose ? 'ready_to_close' : 'in_progress'
  }
  if (closeOutStatus === 'in_progress' && readyToClose) {
    closeOutStatus = 'ready_to_close'
  }

  return {
    eligible,
    readyToClose,
    hasActual,
    hasBudget,
    hasStatement,
    hasConfirmation,
    allRequiredDocsUploaded,
    uploadedRequiredCount,
    requiredCount: requiredDocs.length,
    closeOutStatus,
    reconciliationStatus,
  }
}

async function syncTransactionBondCloseoutDocuments(client, closeoutId, configDocuments = []) {
  const definitions = (configDocuments.length ? configDocuments : buildDefaultDevelopmentBondDocuments()).map((item) =>
    normalizeDevelopmentBondDocumentRow(item),
  )

  const payload = definitions.map((item) => ({
    transaction_bond_closeout_id: closeoutId,
    document_type_key: item.key,
    label: item.label,
    is_required: Boolean(item.requiredForCloseOut),
    status: 'missing',
  }))

  const { error } = await client
    .from('transaction_bond_closeout_documents')
    .upsert(payload, { onConflict: 'transaction_bond_closeout_id,document_type_key' })

  if (error) {
    if (isMissingSchemaError(error)) {
      return definitions.map((item) =>
        normalizeBondCloseoutDocumentRow({
          document_type_key: item.key,
          label: item.label,
          is_required: item.requiredForCloseOut,
          status: 'missing',
        }),
      )
    }
    throw error
  }

  const { data, error: docsError } = await client
    .from('transaction_bond_closeout_documents')
    .select(
      'id, transaction_bond_closeout_id, document_type_key, label, file_path, filename, uploaded_by, uploaded_at, is_required, status',
    )
    .eq('transaction_bond_closeout_id', closeoutId)

  if (docsError) {
    if (isMissingSchemaError(docsError)) {
      return definitions.map((item) =>
        normalizeBondCloseoutDocumentRow({
          document_type_key: item.key,
          label: item.label,
          is_required: item.requiredForCloseOut,
          status: 'missing',
        }),
      )
    }
    throw docsError
  }

  return Promise.all(
    (data || []).map(async (item) =>
      normalizeBondCloseoutDocumentRow({
        ...item,
        url: item.file_path ? await getSignedUrl(item.file_path) : null,
      }),
    ),
  )
}

async function ensureTransactionBondCloseout(client, transaction) {
  if (!transaction?.id || !isBondCommissionEligible(transaction)) {
    return null
  }

  const { data: existing, error: existingError } = await client
    .from('transaction_bond_closeouts')
    .select(
      'id, transaction_id, development_id, bond_originator_id, bond_originator_name, budgeted_amount, budget_source, budget_notes, actual_paid_amount, variance_amount, variance_percent, vat_included, payout_reference, payout_date, statement_date, close_out_status, reconciliation_status, ready_for_review_at, ready_for_review_by, closed_at, closed_by, notes, created_at, updated_at',
    )
    .eq('transaction_id', transaction.id)
    .maybeSingle()

  if (existingError) {
    if (isMissingSchemaError(existingError)) {
      return null
    }
    throw existingError
  }

  const config = transaction.development_id ? await fetchDevelopmentBondConfig(transaction.development_id) : null
  const budgetedAmount = deriveBondCommissionBudget(config, transaction, {}, deriveBondFinanceSnapshot(transaction))

  if (existing) {
    const documents = await syncTransactionBondCloseoutDocuments(client, existing.id, config?.requiredDocuments || [])
    return { closeout: existing, config, documents }
  }

  const seedPayload = {
    transaction_id: transaction.id,
    development_id: transaction.development_id || null,
    bond_originator_id: config?.bondOriginatorId || null,
    bond_originator_name: config?.bondOriginatorName || transaction.bond_originator || null,
    budgeted_amount: budgetedAmount,
    budget_source: 'development_default',
    vat_included: config?.vatIncluded ?? true,
    close_out_status: 'not_started',
    reconciliation_status: budgetedAmount !== null ? 'budgeted' : 'not_budgeted',
  }

  const { data: inserted, error: insertError } = await client
    .from('transaction_bond_closeouts')
    .insert(seedPayload)
    .select(
      'id, transaction_id, development_id, bond_originator_id, bond_originator_name, budgeted_amount, budget_source, budget_notes, actual_paid_amount, variance_amount, variance_percent, vat_included, payout_reference, payout_date, statement_date, close_out_status, reconciliation_status, ready_for_review_at, ready_for_review_by, closed_at, closed_by, notes, created_at, updated_at',
    )
    .single()

  if (insertError) {
    if (isMissingSchemaError(insertError)) {
      return null
    }
    throw insertError
  }

  const documents = await syncTransactionBondCloseoutDocuments(client, inserted.id, config?.requiredDocuments || [])
  return { closeout: inserted, config, documents }
}

async function fetchTransactionForBondCloseout(client, transactionId) {
  let transactionQuery = await client
    .from('transactions')
    .select(
      'id, development_id, unit_id, buyer_id, finance_type, stage, current_main_stage, bond_originator, sales_price, purchase_price, cash_amount, bond_amount',
    )
    .eq('id', transactionId)
    .maybeSingle()

  if (
    transactionQuery.error &&
    (isMissingColumnError(transactionQuery.error, 'sales_price') ||
      isMissingColumnError(transactionQuery.error, 'purchase_price') ||
      isMissingColumnError(transactionQuery.error, 'cash_amount') ||
      isMissingColumnError(transactionQuery.error, 'bond_amount'))
  ) {
    transactionQuery = await client
      .from('transactions')
      .select('id, development_id, unit_id, buyer_id, finance_type, stage, current_main_stage, bond_originator')
      .eq('id', transactionId)
      .maybeSingle()
  }

  if (transactionQuery.error) {
    throw transactionQuery.error
  }

  return transactionQuery.data || null
}

function buildBondCloseoutViewModel({ transaction, closeout, documents = [], config = null }) {
  const money = deriveBondCloseoutVariance(closeout?.budgeted_amount, closeout?.actual_paid_amount)
  const statuses = deriveBondCloseoutStatuses({ transaction, closeout, documents })

  return {
    id: closeout?.id || null,
    transactionId: transaction?.id || null,
    developmentId: transaction?.development_id || null,
    bondOriginatorName: closeout?.bond_originator_name || config?.bondOriginatorName || transaction?.bond_originator || 'Unassigned',
    budgetedAmount: money.budgetedAmount,
    budgetSource: closeout?.budget_source || 'development_default',
    budgetNotes: closeout?.budget_notes || '',
    actualPaidAmount: money.actualPaidAmount,
    varianceAmount: money.varianceAmount,
    variancePercent: money.variancePercent,
    vatIncluded: closeout?.vat_included ?? config?.vatIncluded ?? true,
    payoutReference: closeout?.payout_reference || '',
    payoutDate: closeout?.payout_date || '',
    statementDate: closeout?.statement_date || '',
    closeOutStatus: statuses.closeOutStatus,
    reconciliationStatus: statuses.reconciliationStatus,
    readyForReviewAt: closeout?.ready_for_review_at || null,
    closedAt: closeout?.closed_at || null,
    notes: closeout?.notes || '',
    documents,
    readiness: { ...statuses },
    config,
  }
}

export async function fetchTransactionBondCloseout(transactionId) {
  const client = requireClient()
  if (!transactionId) return null

  const transaction = await fetchTransactionForBondCloseout(client, transactionId)
  if (!transaction) return null

  const ensured = await ensureTransactionBondCloseout(client, transaction)
  if (!ensured) return null

  return buildBondCloseoutViewModel({
    transaction,
    closeout: ensured.closeout,
    documents: ensured.documents,
    config: ensured.config,
  })
}

export async function saveTransactionBondCloseout(transactionId, input = {}) {
  const client = requireClient()
  const actorProfile = await resolveActiveProfileContext(client)

  if (!transactionId) {
    throw new Error('Transaction is required.')
  }

  const transaction = await fetchTransactionForBondCloseout(client, transactionId)
  if (!transaction) throw new Error('Transaction not found.')
  if (!isBondCommissionEligible(transaction)) {
    throw new Error('Bond commission close-out only becomes available once the bond transaction is approved or handed into later stages.')
  }

  const ensured = await ensureTransactionBondCloseout(client, transaction)
  if (!ensured?.closeout?.id) {
    throw new Error('Bond commercial tables are not set up yet. Run sql/schema.sql first.')
  }

  const documents = await syncTransactionBondCloseoutDocuments(client, ensured.closeout.id, ensured.config?.requiredDocuments || [])
  const budgetedAmount = normalizeOptionalNumber(input.budgetedAmount ?? ensured.closeout.budgeted_amount)
  const actualPaidAmount = normalizeOptionalNumber(input.actualPaidAmount ?? ensured.closeout.actual_paid_amount)
  const variance = deriveBondCloseoutVariance(budgetedAmount, actualPaidAmount)
  const currentCloseout = {
    ...ensured.closeout,
    budgeted_amount: budgetedAmount,
    actual_paid_amount: actualPaidAmount,
    close_out_status: input.closeOutStatus ?? ensured.closeout.close_out_status,
  }
  const statusMeta = deriveBondCloseoutStatuses({
    transaction,
    closeout: currentCloseout,
    documents,
  })

  let closeOutStatus = normalizeBondCloseoutStatus(input.closeOutStatus ?? statusMeta.closeOutStatus)
  if (input.markReadyForReview) {
    if (!statusMeta.readyToClose) {
      throw new Error('All required commission close-out items must be complete before marking the transaction ready for review.')
    }
    closeOutStatus = 'ready_to_close'
  }
  if (input.markClosed) {
    if (!statusMeta.readyToClose) {
      throw new Error('You cannot close this bond commission until the actual paid amount and required close-out documents are complete.')
    }
    closeOutStatus = 'closed'
  }

  const reconciliationStatus =
    closeOutStatus === 'closed'
      ? 'reconciled'
      : normalizeBondReconciliationStatus(input.reconciliationStatus ?? statusMeta.reconciliationStatus)

  const payload = {
    budgeted_amount: budgetedAmount,
    budget_source: input.budgetSource || ensured.closeout.budget_source || 'development_default',
    budget_notes: normalizeNullableText(input.budgetNotes ?? ensured.closeout.budget_notes),
    actual_paid_amount: actualPaidAmount,
    variance_amount: variance.varianceAmount,
    variance_percent: variance.variancePercent,
    vat_included: input.vatIncluded ?? ensured.closeout.vat_included ?? true,
    payout_reference: normalizeNullableText(input.payoutReference ?? ensured.closeout.payout_reference),
    payout_date: normalizeOptionalDate(input.payoutDate ?? ensured.closeout.payout_date),
    statement_date: normalizeOptionalDate(input.statementDate ?? ensured.closeout.statement_date),
    close_out_status: closeOutStatus,
    reconciliation_status: reconciliationStatus,
    ready_for_review_at: input.markReadyForReview ? new Date().toISOString() : ensured.closeout.ready_for_review_at,
    ready_for_review_by: input.markReadyForReview ? actorProfile.userId || null : ensured.closeout.ready_for_review_by,
    closed_at: input.markClosed ? new Date().toISOString() : closeOutStatus === 'closed' ? ensured.closeout.closed_at : null,
    closed_by: input.markClosed ? actorProfile.userId || null : closeOutStatus === 'closed' ? ensured.closeout.closed_by : null,
    notes: normalizeNullableText(input.notes ?? ensured.closeout.notes),
    bond_originator_name: normalizeNullableText(input.bondOriginatorName ?? ensured.closeout.bond_originator_name ?? transaction.bond_originator),
  }

  const { error } = await client.from('transaction_bond_closeouts').update(payload).eq('id', ensured.closeout.id)
  if (error) {
    if (isMissingSchemaError(error)) {
      throw new Error('Bond commercial tables are not set up yet. Run sql/schema.sql first.')
    }
    throw error
  }

  await logTransactionEventIfPossible(client, {
    transactionId,
    createdBy: actorProfile.userId || null,
    createdByRole: actorProfile.role || 'developer',
    eventType: 'TransactionUpdated',
    eventData: {
      source: 'bond_closeout',
      closeOutStatus,
      reconciliationStatus,
      actualPaidAmount,
      budgetedAmount,
    },
  })

  return fetchTransactionBondCloseout(transactionId)
}

export async function uploadTransactionBondCloseoutDocument({
  transactionId,
  closeoutId = null,
  file,
  documentTypeKey,
  label,
}) {
  const client = requireClient()
  const actorProfile = await resolveActiveProfileContext(client)

  if (!transactionId || !file || !documentTypeKey) {
    throw new Error('Transaction, file, and document type are required.')
  }

  const closeout = closeoutId ? { id: closeoutId } : await fetchTransactionBondCloseout(transactionId)
  const targetCloseoutId = closeout?.id || closeout?.closeoutId || null
  if (!targetCloseoutId) {
    throw new Error('Bond commission close-out is not available for this transaction yet.')
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '-')
  const filePath = `transaction-${transactionId}/bond-closeout-${targetCloseoutId}/${Date.now()}-${safeName}`

  const { error: uploadError } = await client.storage.from(DOCUMENTS_BUCKET).upload(filePath, file)
  if (uploadError) throw uploadError

  const definition = BOND_CLOSEOUT_DOCUMENT_DEFINITIONS.find((item) => item.key === documentTypeKey) || null
  const payload = {
    transaction_bond_closeout_id: targetCloseoutId,
    document_type_key: documentTypeKey,
    label: label || definition?.label || 'Bond Close-Out Document',
    file_path: filePath,
    filename: file.name,
    uploaded_by: actorProfile.userId || null,
    uploaded_at: new Date().toISOString(),
    is_required: definition?.requiredForCloseOut ?? true,
    status: 'uploaded',
  }

  const { error } = await client
    .from('transaction_bond_closeout_documents')
    .upsert(payload, { onConflict: 'transaction_bond_closeout_id,document_type_key' })

  if (error) {
    if (isMissingSchemaError(error)) {
      throw new Error('Bond close-out document tables are not set up yet. Run sql/schema.sql first.')
    }
    throw error
  }

  await logTransactionEventIfPossible(client, {
    transactionId,
    createdBy: actorProfile.userId || null,
    createdByRole: actorProfile.role || 'developer',
    eventType: 'DocumentUploaded',
    eventData: {
      source: 'bond_closeout',
      documentTypeKey,
      documentName: file.name,
    },
  })

  return fetchTransactionBondCloseout(transactionId)
}

export async function fetchDevelopmentBondReconciliationReport(developmentId) {
  const client = requireClient()
  if (!developmentId) {
    return {
      config: normalizeDevelopmentBondConfigRow(null, []),
      summary: {
        eligibleCount: 0,
        totalBudgeted: 0,
        totalActual: 0,
        totalVariance: 0,
        outstandingStatements: 0,
        outstandingConfirmations: 0,
        closeOutPending: 0,
      },
      rows: [],
    }
  }

  const config = await fetchDevelopmentBondConfig(developmentId)
  let transactionsQuery = await client
    .from('transactions')
    .select(
      'id, unit_id, buyer_id, development_id, finance_type, stage, current_main_stage, bond_originator, sales_price, purchase_price, cash_amount, bond_amount, created_at, updated_at',
    )
    .eq('development_id', developmentId)
    .order('updated_at', { ascending: false })

  if (
    transactionsQuery.error &&
    (isMissingColumnError(transactionsQuery.error, 'cash_amount') ||
      isMissingColumnError(transactionsQuery.error, 'bond_amount') ||
      isMissingColumnError(transactionsQuery.error, 'purchase_price'))
  ) {
    transactionsQuery = await client
      .from('transactions')
      .select('id, unit_id, buyer_id, development_id, finance_type, stage, current_main_stage, bond_originator, sales_price, purchase_price, created_at, updated_at')
      .eq('development_id', developmentId)
      .order('updated_at', { ascending: false })
  }

  if (transactionsQuery.error) throw transactionsQuery.error
  const transactions = transactionsQuery.data || []

  const eligibleTransactions = transactions.filter((item) => isBondCommissionEligible(item))
  const transactionIds = eligibleTransactions.map((item) => item.id)
  const unitIds = [...new Set(eligibleTransactions.map((item) => item.unit_id).filter(Boolean))]
  const buyerIds = [...new Set(eligibleTransactions.map((item) => item.buyer_id).filter(Boolean))]

  const [{ data: unitsData }, { data: buyersData }] = await Promise.all([
    unitIds.length ? client.from('units').select('id, unit_number').in('id', unitIds) : Promise.resolve({ data: [] }),
    buyerIds.length ? client.from('buyers').select('id, name').in('id', buyerIds) : Promise.resolve({ data: [] }),
  ])
  const unitById = Object.fromEntries((unitsData || []).map((item) => [item.id, item]))
  const buyerById = Object.fromEntries((buyersData || []).map((item) => [item.id, item]))
  let onboardingFormDataByTransactionId = {}

  if (transactionIds.length) {
    const { data: onboardingData, error: onboardingError } = await client
      .from('onboarding_form_data')
      .select('transaction_id, form_data')
      .in('transaction_id', transactionIds)

    if (onboardingError && !isMissingTableError(onboardingError, 'onboarding_form_data')) {
      throw onboardingError
    }

    onboardingFormDataByTransactionId = Object.fromEntries(
      (onboardingData || []).map((item) => [item.transaction_id, item.form_data || null]),
    )
  }

  let closeoutsByTransactionId = {}
  let docsByCloseoutId = {}
  if (transactionIds.length) {
    const { data: closeouts, error: closeoutsError } = await client
      .from('transaction_bond_closeouts')
      .select(
        'id, transaction_id, bond_originator_name, budgeted_amount, actual_paid_amount, variance_amount, variance_percent, close_out_status, reconciliation_status, payout_reference, payout_date, statement_date, closed_at',
      )
      .in('transaction_id', transactionIds)
    if (closeoutsError && !isMissingSchemaError(closeoutsError)) throw closeoutsError

    const closeoutRows = closeouts || []
    closeoutsByTransactionId = Object.fromEntries(closeoutRows.map((item) => [item.transaction_id, item]))
    const closeoutIds = closeoutRows.map((item) => item.id)
    if (closeoutIds.length) {
      const { data: docs, error: docsError } = await client
        .from('transaction_bond_closeout_documents')
        .select('transaction_bond_closeout_id, document_type_key, status, file_path, filename')
        .in('transaction_bond_closeout_id', closeoutIds)
      if (docsError && !isMissingSchemaError(docsError)) throw docsError
      const docsWithUrls = await Promise.all(
        (docs || []).map(async (item) => ({
          ...item,
          url: item.file_path ? await getSignedUrl(item.file_path) : null,
        })),
      )
      docsByCloseoutId = docsWithUrls.reduce((accumulator, item) => {
        if (!accumulator[item.transaction_bond_closeout_id]) accumulator[item.transaction_bond_closeout_id] = []
        accumulator[item.transaction_bond_closeout_id].push(item)
        return accumulator
      }, {})
    }
  }

  const rows = eligibleTransactions.map((transaction) => {
    const closeout = closeoutsByTransactionId[transaction.id] || null
    const docRows = closeout?.id ? (docsByCloseoutId[closeout.id] || []).map(normalizeBondCloseoutDocumentRow) : []
    const unit = unitById[transaction.unit_id] || {}
    const statementDocument = docRows.find((item) => item.key === 'commission_statement')
    const confirmationDocument = docRows.find((item) => item.key === 'bond_approval_confirmation')
    const financeSnapshot = deriveBondFinanceSnapshot(transaction, onboardingFormDataByTransactionId[transaction.id] || null)
    const commissionBase = deriveBondCommissionBase(transaction, unit, financeSnapshot)
    const budgetedAmount = closeout?.budgeted_amount ?? deriveBondCommissionBudget(config, transaction, unit, financeSnapshot)
    const money = deriveBondCloseoutVariance(budgetedAmount, closeout?.actual_paid_amount)
    const statuses = deriveBondCloseoutStatuses({ transaction, closeout, documents: docRows })

    return {
      transactionId: transaction.id,
      developmentId,
      unitId: transaction.unit_id || null,
      unitNumber: unitById[transaction.unit_id]?.unit_number || '—',
      buyerName: buyerById[transaction.buyer_id]?.name || 'Unassigned',
      bondOriginator: closeout?.bond_originator_name || config.bondOriginatorName || transaction.bond_originator || 'Unassigned',
      approvalDate: transaction.updated_at || transaction.created_at,
      financeType: financeSnapshot.financeType,
      purchasePrice: financeSnapshot.purchasePrice,
      cashAmount: financeSnapshot.cashAmount,
      bondAmount: financeSnapshot.bondAmount,
      commissionBaseAmount: commissionBase.amount,
      commissionBaseSource: commissionBase.source,
      budgetedAmount: money.budgetedAmount,
      actualPaidAmount: money.actualPaidAmount,
      varianceAmount: money.varianceAmount,
      variancePercent: money.variancePercent,
      statementUploaded: statuses.hasStatement,
      statementUrl: statementDocument?.url || null,
      statementFilename: statementDocument?.filename || null,
      confirmationUploaded: statuses.hasConfirmation,
      confirmationUrl: confirmationDocument?.url || null,
      confirmationFilename: confirmationDocument?.filename || null,
      closeOutStatus: closeout ? statuses.closeOutStatus : 'not_started',
      reconciliationStatus: closeout ? statuses.reconciliationStatus : money.budgetedAmount !== null ? 'budgeted' : 'not_budgeted',
      isClosed: normalizeBondCloseoutStatus(closeout?.close_out_status) === 'closed',
      closedAt: closeout?.closed_at || null,
    }
  })

  const summary = rows.reduce(
    (accumulator, item) => {
      accumulator.eligibleCount += 1
      accumulator.totalBudgeted += Number(item.budgetedAmount || 0)
      accumulator.totalActual += Number(item.actualPaidAmount || 0)
      accumulator.totalVariance += Number(item.varianceAmount || 0)
      if (!item.statementUploaded) accumulator.outstandingStatements += 1
      if (!item.confirmationUploaded) accumulator.outstandingConfirmations += 1
      if (item.closeOutStatus !== 'closed') accumulator.closeOutPending += 1
      return accumulator
    },
    {
      eligibleCount: 0,
      totalBudgeted: 0,
      totalActual: 0,
      totalVariance: 0,
      outstandingStatements: 0,
      outstandingConfirmations: 0,
      closeOutPending: 0,
    },
  )

  return { config, summary, rows }
}

export async function fetchBondCommissionDashboard() {
  const client = requireClient()
  const activeProfile = await resolveActiveProfileContext(client)

  const { data, error } = await client
    .from('transaction_bond_closeouts')
    .select(
      'id, transaction_id, development_id, bond_originator_id, bond_originator_name, budgeted_amount, actual_paid_amount, variance_amount, variance_percent, close_out_status, reconciliation_status, created_at, updated_at',
    )
    .order('updated_at', { ascending: false })

  if (error) {
    if (isMissingSchemaError(error)) {
      return {
        summary: {
          eligibleTransactions: 0,
          totalBudgeted: 0,
          totalActual: 0,
          totalReconciled: 0,
          outstandingStatements: 0,
          outstandingCloseouts: 0,
        },
        rows: [],
      }
    }
    throw error
  }

  let closeouts = data || []
  if (normalizeRoleType(activeProfile.role) === 'bond_originator') {
    const comparableNames = new Set(
      [activeProfile.companyName, activeProfile.fullName, activeProfile.email]
        .map((item) => String(item || '').trim().toLowerCase())
        .filter(Boolean),
    )
    closeouts = closeouts.filter((item) => {
      const originatorName = String(item.bond_originator_name || '').trim().toLowerCase()
      return item.bond_originator_id === activeProfile.userId || comparableNames.has(originatorName)
    })
  }

  const transactionIds = closeouts.map((item) => item.transaction_id).filter(Boolean)
  const developmentIds = [...new Set(closeouts.map((item) => item.development_id).filter(Boolean))]
  const [{ data: transactions }, { data: developments }] = await Promise.all([
    transactionIds.length ? client.from('transactions').select('id, unit_id, buyer_id').in('id', transactionIds) : Promise.resolve({ data: [] }),
    developmentIds.length ? client.from('developments').select('id, name').in('id', developmentIds) : Promise.resolve({ data: [] }),
  ])
  const transactionById = Object.fromEntries((transactions || []).map((item) => [item.id, item]))
  const developmentById = Object.fromEntries((developments || []).map((item) => [item.id, item]))
  const unitIds = [...new Set((transactions || []).map((item) => item.unit_id).filter(Boolean))]
  const buyerIds = [...new Set((transactions || []).map((item) => item.buyer_id).filter(Boolean))]
  const [{ data: unitsData }, { data: buyersData }] = await Promise.all([
    unitIds.length ? client.from('units').select('id, unit_number').in('id', unitIds) : Promise.resolve({ data: [] }),
    buyerIds.length ? client.from('buyers').select('id, name').in('id', buyerIds) : Promise.resolve({ data: [] }),
  ])
  const unitById = Object.fromEntries((unitsData || []).map((item) => [item.id, item]))
  const buyerById = Object.fromEntries((buyersData || []).map((item) => [item.id, item]))

  const rows = closeouts.map((item) => {
    const transaction = transactionById[item.transaction_id] || {}
    return {
      id: item.id,
      transactionId: item.transaction_id,
      developmentName: developmentById[item.development_id]?.name || 'Unknown Development',
      unitNumber: unitById[transaction.unit_id]?.unit_number || '—',
      buyerName: buyerById[transaction.buyer_id]?.name || 'Unassigned',
      budgetedAmount: normalizeOptionalNumber(item.budgeted_amount),
      actualPaidAmount: normalizeOptionalNumber(item.actual_paid_amount),
      varianceAmount: normalizeOptionalNumber(item.variance_amount),
      variancePercent: normalizeOptionalNumber(item.variance_percent),
      closeOutStatus: normalizeBondCloseoutStatus(item.close_out_status),
      reconciliationStatus: normalizeBondReconciliationStatus(item.reconciliation_status),
    }
  })

  const summary = rows.reduce(
    (accumulator, item) => {
      accumulator.eligibleTransactions += 1
      accumulator.totalBudgeted += Number(item.budgetedAmount || 0)
      accumulator.totalActual += Number(item.actualPaidAmount || 0)
      if (item.reconciliationStatus === 'reconciled') accumulator.totalReconciled += 1
      if (item.reconciliationStatus === 'awaiting_statement') accumulator.outstandingStatements += 1
      if (item.closeOutStatus !== 'closed') accumulator.outstandingCloseouts += 1
      return accumulator
    },
    {
      eligibleTransactions: 0,
      totalBudgeted: 0,
      totalActual: 0,
      totalReconciled: 0,
      outstandingStatements: 0,
      outstandingCloseouts: 0,
    },
  )

  return { summary, rows }
}

export async function createDevelopmentDocumentRequirement({ developmentId, label }) {
  const client = requireClient()

  const normalizedLabel = label?.trim()
  if (!developmentId) {
    throw new Error('Development is required.')
  }

  if (!normalizedLabel) {
    throw new Error('Document label is required.')
  }

  const baseKey = toCategoryKey(normalizedLabel) || 'custom_document'

  const { data: existingRows, error: existingRowsError } = await client
    .from('document_requirements')
    .select('category_key, sort_order')
    .eq('development_id', developmentId)
    .order('sort_order', { ascending: false })

  if (existingRowsError) {
    throw existingRowsError
  }

  const existingKeys = new Set(existingRows.map((row) => row.category_key))
  let categoryKey = baseKey
  let suffix = 2
  while (existingKeys.has(categoryKey)) {
    categoryKey = `${baseKey}_${suffix}`
    suffix += 1
  }

  const nextSortOrder = (existingRows[0]?.sort_order ?? 0) + 1

  const { data, error } = await client
    .from('document_requirements')
    .insert({
      development_id: developmentId,
      category_key: categoryKey,
      label: normalizedLabel,
      sort_order: nextSortOrder,
    })
    .select('id, development_id, category_key, label, sort_order')
    .single()

  if (error) {
    throw error
  }

  return data
}

export async function deleteDevelopmentDocumentRequirement(requirementId) {
  const client = requireClient()

  const { error } = await client.from('document_requirements').delete().eq('id', requirementId)

  if (error) {
    throw error
  }
}

function classifyDocumentToRequirement(document, requirements) {
  const haystack = `${document.category || ''} ${document.name || ''}`.toLowerCase()

  const directMatch = requirements.find(
    (requirement) => haystack.includes(requirement.key.replaceAll('_', ' ')) || haystack.includes(requirement.label.toLowerCase()),
  )

  if (directMatch) {
    return directMatch.key
  }

  const keywordMatch = requirements.find((requirement) =>
    requirement.keywords.some((keyword) => haystack.includes(keyword.toLowerCase())),
  )

  return keywordMatch?.key || null
}

function parseTimestamp(value) {
  const parsed = new Date(value || 0).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

function getDocumentSearchText(document) {
  return `${document?.name || ''} ${document?.category || ''}`.toLowerCase()
}

function isSignedVariantDocument(document) {
  const text = getDocumentSearchText(document)
  return /\bsigned\b|\bexecuted\b|\bfinal\b|\bcompleted\b|\bcountersigned\b/.test(text)
}

function isTemplateVariantDocument(document) {
  const text = getDocumentSearchText(document)
  return /\btemplate\b|\bblank\b|\bunsigned\b|\bdraft\b|\bsample\b|\bspecimen\b/.test(text)
}

function documentPriorityScore(document) {
  const role = String(document?.uploaded_by_role || '').toLowerCase()
  let score = 20

  if (role === 'client') {
    score = 60
  } else if (role === 'attorney' || role === 'tuckers' || role === 'bond_originator') {
    score = 50
  } else if (role === 'developer' || role === 'agent' || role === 'internal_admin') {
    score = 35
  }

  if (document?.external_access_id) {
    score += 6
  }

  if (isSignedVariantDocument(document)) {
    score += 45
  }

  if (isTemplateVariantDocument(document)) {
    score -= 35
  }

  return score
}

function isPreferredRequirementDocument(candidate, current) {
  if (!current) {
    return true
  }

  const candidateScore = documentPriorityScore(candidate)
  const currentScore = documentPriorityScore(current)

  if (candidateScore !== currentScore) {
    return candidateScore > currentScore
  }

  return parseTimestamp(candidate?.created_at) > parseTimestamp(current?.created_at)
}

function buildDocumentChecklist(requirements, documents) {
  const matchedRequirementKeys = new Set()
  const matchedDocumentsByRequirement = new Map()

  for (const document of documents) {
    const key = classifyDocumentToRequirement(document, requirements)
    if (key) {
      matchedRequirementKeys.add(key)
      const current = matchedDocumentsByRequirement.get(key)
      if (isPreferredRequirementDocument(document, current)) {
        matchedDocumentsByRequirement.set(key, document)
      }
    }
  }

  const checklist = requirements.map((requirement) => ({
    key: requirement.key,
    label: requirement.label,
    complete: matchedRequirementKeys.has(requirement.key),
    matchedDocument: matchedDocumentsByRequirement.get(requirement.key) || null,
  }))

  const uploadedCount = checklist.filter((item) => item.complete).length

  return {
    checklist,
    summary: {
      uploadedCount,
      totalRequired: checklist.length,
    },
  }
}

function generateOnboardingToken() {
  return `onb${crypto.randomUUID().replaceAll('-', '')}`
}

function normalizeOnboardingRow(row, fallbackPurchaserType = 'individual') {
  if (!row) {
    return null
  }

  const normalizedType = normalizePurchaserType(row.purchaser_type || fallbackPurchaserType)
  return {
    id: row.id,
    transactionId: row.transaction_id,
    token: row.token,
    status: ONBOARDING_STATUSES.includes(row.status) ? row.status : 'Not Started',
    purchaserType: normalizedType,
    purchaserTypeLabel: getPurchaserTypeLabel(normalizedType),
    submittedAt: row.submitted_at || null,
    isActive: row.is_active !== false,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  }
}

function normalizeOnboardingFormDataRow(row) {
  if (!row) {
    return null
  }

  let formData = {}
  if (row.form_data && typeof row.form_data === 'object') {
    formData = row.form_data
  }

  return {
    id: row.id,
    transactionId: row.transaction_id,
    purchaserType: normalizePurchaserType(row.purchaser_type),
    formData,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  }
}

function normalizeRequiredDocumentRows(rows = [], metadataByKey = {}) {
  return rows
    .map((row) => {
      const metadata = metadataByKey[row.document_key] || {}
      const resolvedGroupKey = String(row.group_key || metadata.groupKey || 'buyer_fica')
      const groupMeta = getGroupByKey(resolvedGroupKey)
      const isRequired = row.is_required !== false
      const isUploaded = Boolean(row.is_uploaded)
      const description = row.description || metadata.description || ''
      const portalMetadata = resolvePortalDocumentMetadata({
        portal_workspace_category: row.portal_workspace_category || metadata.portalWorkspaceCategory,
        group_key: groupMeta.key,
        document_type: row.document_type || metadata.documentType || row.document_key,
        document_key: row.document_key,
        label: row.document_label,
        description,
      })

      return {
        id: row.id,
        transactionId: row.transaction_id,
        key: row.document_key,
        label: row.document_label,
        groupKey: groupMeta.key,
        groupLabel: row.group_label || metadata.groupLabel || groupMeta.label,
        group: row.group_label || metadata.groupLabel || groupMeta.label,
        description,
        requirementLevel: metadata.requirementLevel || 'required',
        isRequired,
        isUploaded,
        status: normalizeRequiredStatus(row.status, statusFromLegacyFlags({ isRequired, isUploaded })),
        isEnabled: row.enabled !== false,
        expectedFromRole: row.required_from_role || metadata.expectedFromRole || 'client',
        visibilityScope: row.visibility_scope || metadata.defaultVisibility || 'client',
        allowMultiple: row.allow_multiple === true || metadata.allowMultiple === true,
        uploadedDocumentId: row.uploaded_document_id || null,
        uploadedAt: row.uploaded_at || null,
        verifiedAt: row.verified_at || null,
        rejectedAt: row.rejected_at || null,
        notes: row.notes || '',
        sortOrder: row.sort_order ?? 999,
        portalDocumentType: portalMetadata.portalDocumentType,
        portalWorkspaceCategory: portalMetadata.portalWorkspaceCategory,
        portalMappingSource: portalMetadata.portalMappingSource,
        portalMappingConfidence: portalMetadata.portalMappingConfidence,
        portalMappingAmbiguous: portalMetadata.portalMappingAmbiguous,
      }
    })
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

async function fetchOnboardingFormDataForTransaction(client, transactionId, purchaserType = 'individual') {
  if (!transactionId) {
    return null
  }

  const normalizedType = normalizePurchaserType(purchaserType)

  const { data, error } = await client
    .from('onboarding_form_data')
    .select('id, transaction_id, purchaser_type, form_data, created_at, updated_at')
    .eq('transaction_id', transactionId)
    .maybeSingle()

  if (error) {
    if (isMissingTableError(error, 'onboarding_form_data')) {
      return {
        id: null,
        transactionId,
        purchaserType: normalizedType,
        formData: {},
        createdAt: null,
        updatedAt: null,
      }
    }

    throw error
  }

  if (!data) {
    return {
      id: null,
      transactionId,
      purchaserType: normalizedType,
      formData: {},
      createdAt: null,
      updatedAt: null,
    }
  }

  return normalizeOnboardingFormDataRow(data)
}

async function getOrCreateTransactionOnboardingRecord(
  client,
  { transactionId, purchaserType = 'individual' },
  { createIfMissing = true } = {},
) {
  if (!transactionId) {
    return null
  }

  const normalizedType = normalizePurchaserType(purchaserType)
  const rowSelect =
    'id, transaction_id, token, status, purchaser_type, submitted_at, is_active, created_at, updated_at'

  const pickMostRecentOnboardingRow = (rows = []) =>
    rows.reduce((latest, row) => {
      if (!row) {
        return latest
      }

      if (!latest) {
        return row
      }

      const rowTimestamp = Date.parse(row.updated_at || row.created_at || '')
      const latestTimestamp = Date.parse(latest.updated_at || latest.created_at || '')
      const normalizedRowTimestamp = Number.isFinite(rowTimestamp) ? rowTimestamp : 0
      const normalizedLatestTimestamp = Number.isFinite(latestTimestamp) ? latestTimestamp : 0

      if (normalizedRowTimestamp === normalizedLatestTimestamp) {
        return String(row.id || '') > String(latest.id || '') ? row : latest
      }

      return normalizedRowTimestamp > normalizedLatestTimestamp ? row : latest
    }, null)

  const existingQuery = await client
    .from('transaction_onboarding')
    .select(rowSelect)
    .eq('transaction_id', transactionId)
    .eq('is_active', true)
  const existingError = existingQuery.error

  if (existingError) {
    if (
      isMissingTableError(existingError, 'transaction_onboarding') ||
      isMissingColumnError(existingError, 'is_active') ||
      isMissingColumnError(existingError, 'purchaser_type') ||
      isMissingColumnError(existingError, 'status')
    ) {
      return null
    }

    throw existingError
  }

  const existingRows = Array.isArray(existingQuery.data) ? existingQuery.data : []
  const existing = pickMostRecentOnboardingRow(existingRows)

  if (existing) {
    const existingType = normalizePurchaserType(existing.purchaser_type)
    if (existingType !== normalizedType && createIfMissing) {
      const { data: updated, error: updateError } = await client
        .from('transaction_onboarding')
        .update({
          purchaser_type: normalizedType,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select(rowSelect)
        .single()

      if (updateError) {
        throw updateError
      }

      return normalizeOnboardingRow(updated, normalizedType)
    }

    return normalizeOnboardingRow(existing, existingType || normalizedType)
  }

  if (!createIfMissing) {
    return normalizeOnboardingRow(
      {
        id: null,
        transaction_id: transactionId,
        token: null,
        status: 'Not Started',
        purchaser_type: normalizedType,
        submitted_at: null,
        is_active: true,
        created_at: null,
        updated_at: null,
      },
      normalizedType,
    )
  }

  const insertPayload = {
    transaction_id: transactionId,
    token: generateOnboardingToken(),
    status: 'Not Started',
    purchaser_type: normalizedType,
    is_active: true,
  }

  let insertResult = await client.from('transaction_onboarding').insert(insertPayload).select(rowSelect).single()

  if (insertResult.error && insertResult.error.code === '23505') {
    const conflictLookup = await client
      .from('transaction_onboarding')
      .select(rowSelect)
      .eq('transaction_id', transactionId)
      .eq('is_active', true)
    const conflictRow = pickMostRecentOnboardingRow(Array.isArray(conflictLookup.data) ? conflictLookup.data : [])
    if (conflictLookup.error) {
      insertResult = conflictLookup
    } else if (conflictRow) {
      insertResult = { data: conflictRow, error: null }
    } else {
      insertResult = {
        data: null,
        error: {
          message: 'Onboarding row already exists but could not be reloaded.',
        },
      }
    }
  }

  if (insertResult.error) {
    if (
      isMissingTableError(insertResult.error, 'transaction_onboarding') ||
      isMissingColumnError(insertResult.error, 'is_active') ||
      isMissingColumnError(insertResult.error, 'purchaser_type') ||
      isMissingColumnError(insertResult.error, 'status')
    ) {
      return null
    }

    throw insertResult.error
  }

  return normalizeOnboardingRow(insertResult.data, normalizedType)
}

async function ensureTransactionRequiredDocuments(
  client,
  {
    transactionId,
    purchaserType = 'individual',
    financeType = 'cash',
    reservationRequired = false,
    cashAmount = null,
    bondAmount = null,
    formData = {},
  },
  { sync = true } = {},
) {
  if (!transactionId) {
    return []
  }

  const normalizedType = normalizePurchaserType(purchaserType)
  const normalizedFinanceType = normalizeFinanceType(financeType || 'cash')
  const derivedConfiguration = deriveOnboardingConfiguration(
    {
      ...(formData || {}),
      purchaser_type: formData?.purchaser_type || normalizedType,
      purchase_finance_type: formData?.purchase_finance_type || normalizedFinanceType,
      reservation_required: formData?.reservation_required ?? reservationRequired,
      cash_amount: formData?.cash_amount ?? cashAmount,
      bond_amount: formData?.bond_amount ?? bondAmount,
    },
    {
      purchaserType: normalizedType,
      financeType: normalizedFinanceType,
    },
  )
  const ruleDrivenTemplates = await resolveRuleDrivenDocumentTemplates(client, {
    purchaserType: normalizedType,
    financeType: normalizedFinanceType,
    reservationRequired,
  })
  const templates = ruleDrivenTemplates.length
    ? ruleDrivenTemplates
    : derivedConfiguration.requiredDocuments.length
      ? derivedConfiguration.requiredDocuments
      : getRequiredDocumentsForPurchaserType(normalizedType, {
          financeType: normalizedFinanceType,
          reservationRequired,
          cashAmount,
          bondAmount,
          formData,
        })
  const metadataByKey = templates.reduce((accumulator, template) => {
    accumulator[template.key] = {
      label: template.label,
      group: template.group,
      groupKey: template.groupKey,
      groupLabel: template.groupLabel || template.group,
      description: template.description,
      requirementLevel: template.requirementLevel || 'required',
      expectedFromRole: template.expectedFromRole,
      defaultVisibility: template.defaultVisibility,
      allowMultiple: template.allowMultiple,
      sortOrder: template.sortOrder,
      keywords: template.keywords,
    }
    return accumulator
  }, {})
  const templateMap = buildTemplateMap(templates)
  const fullRowSelect =
    'id, transaction_id, document_key, document_label, is_required, is_uploaded, status, enabled, group_key, group_label, description, required_from_role, visibility_scope, allow_multiple, uploaded_document_id, uploaded_at, verified_at, rejected_at, notes, sort_order'
  const legacyRowSelect =
    'id, transaction_id, document_key, document_label, is_required, is_uploaded, uploaded_document_id, sort_order'

  let existingRowsQuery = await client
    .from('transaction_required_documents')
    .select(fullRowSelect)
    .eq('transaction_id', transactionId)

  if (existingRowsQuery.error) {
    if (
      isMissingColumnError(existingRowsQuery.error, 'status') ||
      isMissingColumnError(existingRowsQuery.error, 'group_key') ||
      isMissingColumnError(existingRowsQuery.error, 'group_label') ||
      isMissingColumnError(existingRowsQuery.error, 'required_from_role') ||
      isMissingColumnError(existingRowsQuery.error, 'visibility_scope') ||
      isMissingColumnError(existingRowsQuery.error, 'allow_multiple') ||
      isMissingColumnError(existingRowsQuery.error, 'enabled')
    ) {
      existingRowsQuery = await client
        .from('transaction_required_documents')
        .select(legacyRowSelect)
        .eq('transaction_id', transactionId)
    }
  }

  if (existingRowsQuery.error) {
    if (
      isMissingTableError(existingRowsQuery.error, 'transaction_required_documents') ||
      isMissingColumnError(existingRowsQuery.error, 'document_key') ||
      isMissingColumnError(existingRowsQuery.error, 'document_label')
    ) {
      return []
    }

    throw existingRowsQuery.error
  }

  const existingRows = existingRowsQuery.data || []
  const existingByKey = new Map(existingRows.map((row) => [row.document_key, row]))

  const upsertRows = templates.map((template, index) => {
    const existing = existingByKey.get(template.key)
    const mappedTemplate = templateMap[template.key] || template
    const status = normalizeRequiredStatus(existing?.status, statusFromLegacyFlags({
      isRequired: true,
      isUploaded: Boolean(existing?.is_uploaded),
    }))
    return {
      transaction_id: transactionId,
      document_key: template.key,
      document_label: template.label,
      is_required: true,
      is_uploaded: Boolean(existing?.is_uploaded),
      status,
      enabled: true,
      group_key: mappedTemplate.groupKey || metadataByKey[template.key]?.groupKey || 'buyer_fica',
      group_label: mappedTemplate.groupLabel || metadataByKey[template.key]?.groupLabel || 'Buyer & FICA',
      description: mappedTemplate.description || metadataByKey[template.key]?.description || '',
      required_from_role: mappedTemplate.expectedFromRole || metadataByKey[template.key]?.expectedFromRole || 'client',
      visibility_scope: mappedTemplate.defaultVisibility || metadataByKey[template.key]?.defaultVisibility || 'client',
      allow_multiple: Boolean(mappedTemplate.allowMultiple || metadataByKey[template.key]?.allowMultiple),
      uploaded_document_id: existing?.uploaded_document_id || null,
      uploaded_at: existing?.uploaded_at || null,
      verified_at: existing?.verified_at || null,
      rejected_at: existing?.rejected_at || null,
      notes: existing?.notes || null,
      sort_order: index + 1,
    }
  })

  if (!sync) {
    return normalizeRequiredDocumentRows(upsertRows, metadataByKey)
  }

  let { error: upsertError } = await client
    .from('transaction_required_documents')
    .upsert(upsertRows, { onConflict: 'transaction_id,document_key' })

  if (
    upsertError &&
    (isMissingColumnError(upsertError, 'status') ||
      isMissingColumnError(upsertError, 'group_key') ||
      isMissingColumnError(upsertError, 'group_label') ||
      isMissingColumnError(upsertError, 'required_from_role') ||
      isMissingColumnError(upsertError, 'visibility_scope') ||
      isMissingColumnError(upsertError, 'allow_multiple') ||
      isMissingColumnError(upsertError, 'enabled'))
  ) {
    const legacyRows = upsertRows.map((row) => ({
      transaction_id: row.transaction_id,
      document_key: row.document_key,
      document_label: row.document_label,
      is_required: row.is_required,
      is_uploaded: row.is_uploaded,
      uploaded_document_id: row.uploaded_document_id,
      sort_order: row.sort_order,
    }))

    const legacyUpsert = await client
      .from('transaction_required_documents')
      .upsert(legacyRows, { onConflict: 'transaction_id,document_key' })

    upsertError = legacyUpsert.error
  }

  if (upsertError) {
    if (
      isMissingTableError(upsertError, 'transaction_required_documents') ||
      isMissingColumnError(upsertError, 'document_key') ||
      isMissingColumnError(upsertError, 'document_label')
    ) {
      return []
    }

    throw upsertError
  }

  const expectedKeys = new Set(templates.map((template) => template.key))
  const staleIds = existingRows.filter((row) => !expectedKeys.has(row.document_key)).map((row) => row.id)

  if (staleIds.length) {
    const { error: deleteError } = await client.from('transaction_required_documents').delete().in('id', staleIds)

    if (deleteError && !isMissingTableError(deleteError, 'transaction_required_documents')) {
      throw deleteError
    }
  }

  let refreshedQuery = await client
    .from('transaction_required_documents')
    .select(fullRowSelect)
    .eq('transaction_id', transactionId)
    .order('sort_order', { ascending: true })

  if (refreshedQuery.error) {
    if (
      isMissingColumnError(refreshedQuery.error, 'status') ||
      isMissingColumnError(refreshedQuery.error, 'group_key') ||
      isMissingColumnError(refreshedQuery.error, 'group_label') ||
      isMissingColumnError(refreshedQuery.error, 'required_from_role') ||
      isMissingColumnError(refreshedQuery.error, 'visibility_scope') ||
      isMissingColumnError(refreshedQuery.error, 'allow_multiple') ||
      isMissingColumnError(refreshedQuery.error, 'enabled')
    ) {
      refreshedQuery = await client
        .from('transaction_required_documents')
        .select(legacyRowSelect)
        .eq('transaction_id', transactionId)
        .order('sort_order', { ascending: true })
    }
  }

  if (refreshedQuery.error) {
    if (
      isMissingTableError(refreshedQuery.error, 'transaction_required_documents') ||
      isMissingColumnError(refreshedQuery.error, 'document_key') ||
      isMissingColumnError(refreshedQuery.error, 'document_label')
    ) {
      return []
    }

    throw refreshedQuery.error
  }

  return normalizeRequiredDocumentRows(refreshedQuery.data || [], metadataByKey)
}

async function resolveRuleDrivenDocumentTemplates(
  client,
  { purchaserType = 'individual', financeType = 'cash', reservationRequired = false } = {},
) {
  const normalizedType = normalizePurchaserType(purchaserType)
  const normalizedFinanceType = normalizeFinanceType(financeType || 'cash')
  const normalizedReservationRequired = Boolean(reservationRequired)

  const rulesQuery = await client
    .from('document_requirement_rules')
    .select('id, purchaser_type, marital_structure, finance_type, reservation_required, template_key, required, enabled')
    .eq('purchaser_type', normalizedType)
    .eq('enabled', true)
    .eq('required', true)

  if (rulesQuery.error) {
    if (
      isMissingTableError(rulesQuery.error, 'document_requirement_rules') ||
      isMissingColumnError(rulesQuery.error, 'template_key')
    ) {
      return []
    }
    throw rulesQuery.error
  }

  const applicableRules = (rulesQuery.data || []).filter((rule) => {
    const financeMatches = !rule.finance_type || normalizeFinanceType(rule.finance_type, { allowUnknown: true }) === normalizedFinanceType
    const reservationMatches =
      rule.reservation_required === null || rule.reservation_required === undefined
        ? true
        : Boolean(rule.reservation_required) === normalizedReservationRequired

    return financeMatches && reservationMatches
  })

  if (!applicableRules.length) {
    return []
  }

  const templateKeys = [...new Set(applicableRules.map((rule) => String(rule.template_key || '').trim()).filter(Boolean))]
  if (!templateKeys.length) {
    return []
  }

  const templatesQuery = await client
    .from('document_templates')
    .select(
      'key, label, description, group_key, expected_from_role, default_visibility, allow_multiple, sort_order, is_active',
    )
    .in('key', templateKeys)
    .eq('is_active', true)

  if (templatesQuery.error) {
    if (
      isMissingTableError(templatesQuery.error, 'document_templates') ||
      isMissingColumnError(templatesQuery.error, 'group_key')
    ) {
      return []
    }
    throw templatesQuery.error
  }

  const templateByKey = (templatesQuery.data || []).reduce((accumulator, row) => {
    const key = String(row.key || '').trim()
    if (!key) {
      return accumulator
    }

    const group = getGroupByKey(row.group_key || 'buyer_fica')
    accumulator[key] = {
      key,
      label: row.label || key,
      group: group.label,
      groupKey: group.key,
      groupLabel: group.label,
      description: row.description || '',
      expectedFromRole: row.expected_from_role || 'client',
      defaultVisibility: row.default_visibility || 'client',
      allowMultiple: Boolean(row.allow_multiple),
      keywords: [String(row.label || key).toLowerCase(), key.replaceAll('_', ' ')],
      sortOrder: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : 0,
    }
    return accumulator
  }, {})

  return templateKeys
    .map((key) => templateByKey[key])
    .filter(Boolean)
    .sort((left, right) => (left.sortOrder || 0) - (right.sortOrder || 0))
}

async function fetchTransactionRequiredDocumentsByTransactionIds(client, transactionIds = []) {
  if (!transactionIds.length) {
    return {}
  }

  let query = await client
    .from('transaction_required_documents')
    .select(
      'id, transaction_id, document_key, document_label, is_required, is_uploaded, status, enabled, group_key, group_label, description, required_from_role, visibility_scope, allow_multiple, uploaded_document_id, uploaded_at, verified_at, rejected_at, notes, sort_order',
    )
    .in('transaction_id', transactionIds)
    .order('sort_order', { ascending: true })

  if (
    query.error &&
    (isMissingColumnError(query.error, 'status') ||
      isMissingColumnError(query.error, 'group_key') ||
      isMissingColumnError(query.error, 'group_label') ||
      isMissingColumnError(query.error, 'required_from_role') ||
      isMissingColumnError(query.error, 'visibility_scope') ||
      isMissingColumnError(query.error, 'allow_multiple') ||
      isMissingColumnError(query.error, 'enabled'))
  ) {
    query = await client
      .from('transaction_required_documents')
      .select('id, transaction_id, document_key, document_label, is_required, is_uploaded, uploaded_document_id, sort_order')
      .in('transaction_id', transactionIds)
      .order('sort_order', { ascending: true })
  }

  if (query.error) {
    if (
      isMissingTableError(query.error, 'transaction_required_documents') ||
      isMissingColumnError(query.error, 'document_key') ||
      isMissingColumnError(query.error, 'document_label')
    ) {
      return {}
    }

    throw query.error
  }

  const grouped = {}
  for (const row of query.data || []) {
    if (!grouped[row.transaction_id]) {
      grouped[row.transaction_id] = []
    }
    grouped[row.transaction_id].push(row)
  }

  return Object.entries(grouped).reduce((accumulator, [transactionId, rows]) => {
    accumulator[transactionId] = normalizeRequiredDocumentRows(rows)
    return accumulator
  }, {})
}

function buildRequiredChecklistFromRows(requiredRows, documents) {
  if (!requiredRows.length) {
    return {
      checklist: [],
      summary: { uploadedCount: 0, totalRequired: 0 },
    }
  }

  const requirements = requiredRows.map((row) => ({
    key: row.key,
    label: row.label,
    sortOrder: row.sortOrder,
    keywords: [String(row.label || '').toLowerCase(), String(row.key || '').replaceAll('_', ' ')],
  }))

  const checklistResult = buildDocumentChecklist(requirements, documents)
  const checklistByKey = new Map(checklistResult.checklist.map((item) => [item.key, item]))

  const checklist = requiredRows.map((row) => {
    const mapped = checklistByKey.get(row.key)
    const uploaded = Boolean(row.isUploaded || mapped?.complete)
    const resolvedStatus = normalizeRequiredStatus(row.status, statusFromLegacyFlags({
      isRequired: row.isRequired,
      isUploaded: uploaded,
    }))
    const complete = ['uploaded', 'under_review', 'accepted'].includes(resolvedStatus)

    return {
      key: row.key,
      label: row.label,
      group: row.group || row.groupLabel || 'General',
      groupKey: row.groupKey || 'buyer_fica',
      groupLabel: row.groupLabel || row.group || 'Buyer & FICA',
      description: row.description || '',
      requirementLevel: row.requirementLevel || 'required',
      expectedFromRole: row.expectedFromRole || 'client',
      visibilityScope: row.visibilityScope || 'client',
      status: resolvedStatus,
      isRequired: row.isRequired !== false,
      isEnabled: row.isEnabled !== false,
      complete,
      matchedDocument: mapped?.matchedDocument || null,
      portalDocumentType: row.portalDocumentType || row.key || 'other',
      portalWorkspaceCategory: row.portalWorkspaceCategory || 'additional',
      portalMappingSource: row.portalMappingSource || 'fallback',
      portalMappingConfidence: row.portalMappingConfidence || 'fallback',
      portalMappingAmbiguous: Boolean(row.portalMappingAmbiguous),
    }
  })

  const uploadedCount = checklist.filter((item) => item.complete).length
  return {
    checklist,
    summary: {
      uploadedCount,
      totalRequired: checklist.length,
    },
  }
}

function normalizeTransactionParticipantRow(row) {
  const roleType = normalizeRoleType(row?.role_type)
  const fallbackPermissions = getRolePermissions({ role: roleType, financeManagedBy: 'bond_originator' })
  const legalRole = normalizeAttorneyLegalRole(row?.legal_role, roleType === 'attorney' ? 'transfer' : 'none')
  const stakeholderStatus = normalizeStakeholderStatus(row?.status, row?.removed_at ? 'removed' : 'active')
  const participantScope = String(row?.participant_scope || '')
    .trim()
    .toLowerCase()
  const assignmentSource = String(row?.assignment_source || '')
    .trim()
    .toLowerCase()
  const roleLabelBase = TRANSACTION_ROLE_LABELS[roleType] || roleType
  const legalRoleLabel =
    roleType !== 'attorney'
      ? null
      : legalRole === 'transfer'
        ? 'Transfer Attorney'
        : legalRole === 'bond'
          ? 'Bond Attorney'
          : legalRole === 'cancellation'
            ? 'Cancellation Attorney'
            : 'Attorney'
  return {
    id: row?.id || null,
    transactionId: row?.transaction_id || null,
    userId: row?.user_id || null,
    roleType,
    roleLabel: legalRoleLabel || roleLabelBase,
    legalRole: roleType === 'attorney' ? legalRole : null,
    stakeholderStatus,
    accessLevel: normalizeTransactionAccessLevel(row?.access_level, 'shared'),
    visibilityScope: normalizeDocumentVisibilityScope(row?.visibility_scope, isInternalStakeholderRole(roleType) ? 'internal' : 'shared'),
    invitedAt: row?.invited_at || null,
    acceptedAt: row?.accepted_at || null,
    removedAt: row?.removed_at || null,
    invitationToken: row?.invitation_token || null,
    invitationExpiresAt: row?.invitation_expires_at || null,
    invitedByUserId: row?.invited_by_user_id || null,
    firmId: row?.firm_id || null,
    firmRole: normalizeFirmRole(row?.firm_role, roleType === 'attorney' ? 'attorney' : roleType),
    participantName: row?.participant_name || '',
    participantEmail: row?.participant_email || '',
    canView: row?.can_view !== false,
    canComment: row?.can_comment !== false,
    canUploadDocuments: row?.can_upload_documents !== false,
    canEditFinanceWorkflow:
      typeof row?.can_edit_finance_workflow === 'boolean'
        ? row.can_edit_finance_workflow
        : Boolean(fallbackPermissions.canEditFinanceWorkflow),
    canEditAttorneyWorkflow:
      typeof row?.can_edit_attorney_workflow === 'boolean'
        ? row.can_edit_attorney_workflow
        : Boolean(fallbackPermissions.canEditAttorneyWorkflow),
    canEditCoreTransaction:
      typeof row?.can_edit_core_transaction === 'boolean'
        ? row.can_edit_core_transaction
        : Boolean(fallbackPermissions.canEditCoreTransaction),
    participantScope: ['development', 'reference', 'transaction'].includes(participantScope)
      ? participantScope
      : 'transaction',
    assignmentSource: assignmentSource || 'transaction_direct',
    accessInherited: participantScope === 'development' || assignmentSource === 'development_default',
    isInternal: row?.is_internal ?? isInternalStakeholderRole(roleType),
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null,
  }
}

function normalizeDevelopmentParticipantRoleType(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()

  if (
    [
      'attorney',
      'conveyancer',
      'transfer_conveyancer',
      'buyer_attorney',
      'seller_attorney',
      'tuckers',
    ].includes(normalized)
  ) {
    return 'attorney'
  }

  if (['developer', 'internal_admin', 'agent', 'bond_originator', 'client'].includes(normalized)) {
    return normalized
  }

  return normalized
}

function normalizeDevelopmentParticipantRow(row = {}) {
  const roleType = normalizeDevelopmentParticipantRoleType(row.role_type)
  return {
    id: row.id || null,
    developmentId: row.development_id || null,
    userId: row.user_id || null,
    roleType,
    participantName: String(row.participant_name || '').trim(),
    participantEmail: normalizeEmailAddress(row.participant_email),
    organisationName: String(row.organisation_name || '').trim(),
    isPrimary: Boolean(row.is_primary),
    assignmentSource: String(row.assignment_source || 'development_default')
      .trim()
      .toLowerCase(),
    isActive: row.is_active !== false,
  }
}

function resolveTeamValue(item, keys = []) {
  for (const key of keys) {
    const value = String(item?.[key] || '').trim()
    if (value) {
      return value
    }
  }

  return ''
}

function normalizeStakeholderTeamParticipant(member, teamKey) {
  const definition = DEVELOPMENT_TEAM_ROLE_MAP[teamKey]
  if (!definition || !member || typeof member !== 'object') {
    return null
  }

  const participantName = resolveTeamValue(member, definition.nameFields)
  const participantEmail = normalizeEmailAddress(resolveTeamValue(member, definition.emailFields))
  const organisationName = resolveTeamValue(member, definition.organisationFields)

  if (!participantName && !participantEmail) {
    return null
  }

  return {
    developmentId: null,
    userId: null,
    roleType: definition.roleType,
    participantName,
    participantEmail,
    organisationName,
    isPrimary: false,
    assignmentSource: 'development_default',
    isActive: true,
  }
}

async function fetchFirmIdsForUser(client, userId = null) {
  if (!userId) {
    return []
  }

  const firmIds = new Set()

  const profileQuery = await client
    .from('profiles')
    .select('id, firm_id')
    .eq('id', userId)
    .maybeSingle()

  if (!profileQuery.error && profileQuery.data?.firm_id) {
    firmIds.add(profileQuery.data.firm_id)
  } else if (profileQuery.error && !isMissingSchemaError(profileQuery.error)) {
    throw profileQuery.error
  }

  let membershipsQuery = await client
    .from('firm_memberships')
    .select('firm_id, status, accepted_at')
    .eq('user_id', userId)

  if (
    membershipsQuery.error &&
    (isMissingColumnError(membershipsQuery.error, 'status') ||
      isMissingColumnError(membershipsQuery.error, 'accepted_at'))
  ) {
    membershipsQuery = await client
      .from('firm_memberships')
      .select('firm_id')
      .eq('user_id', userId)
  }

  if (membershipsQuery.error) {
    if (isMissingTableError(membershipsQuery.error, 'firm_memberships') || isMissingSchemaError(membershipsQuery.error)) {
      return [...firmIds]
    }
    throw membershipsQuery.error
  }

  for (const row of membershipsQuery.data || []) {
    if (!row?.firm_id) continue
    if (row?.status && normalizeStakeholderStatus(row.status, 'active') !== 'active') continue
    firmIds.add(row.firm_id)
  }

  return [...firmIds]
}

async function fetchDevelopmentParticipantsByIdentity(
  client,
  {
    userId = null,
    participantEmail = '',
    roleType = null,
    developmentIds = [],
  } = {},
) {
  const normalizedRole = roleType ? normalizeRoleType(roleType) : null
  const normalizedEmail = normalizeEmailAddress(participantEmail)
  const rows = []

  const appendRows = async (
    queryBuilder,
    {
      userIdFilter = null,
      participantEmailFilter = '',
    } = {},
  ) => {
    let query = queryBuilder
      .select(
        'id, development_id, user_id, role_type, participant_name, participant_email, organisation_name, is_primary, assignment_source, is_active',
      )

    if (userIdFilter) {
      query = query.eq('user_id', userIdFilter)
    }
    if (participantEmailFilter) {
      query = query.eq('participant_email', participantEmailFilter)
    }
    if (developmentIds.length) {
      query = query.in('development_id', developmentIds)
    }

    let result = await query
    if (
      result.error &&
      (isMissingColumnError(result.error, 'user_id') ||
        isMissingColumnError(result.error, 'organisation_name') ||
        isMissingColumnError(result.error, 'is_primary') ||
        isMissingColumnError(result.error, 'assignment_source') ||
        isMissingColumnError(result.error, 'is_active'))
    ) {
      let fallbackQuery = queryBuilder.select('id, development_id, role_type, participant_name, participant_email')
      if (userIdFilter) {
        fallbackQuery = fallbackQuery.eq('user_id', userIdFilter)
      }
      if (participantEmailFilter) {
        fallbackQuery = fallbackQuery.eq('participant_email', participantEmailFilter)
      }
      if (developmentIds.length) {
        fallbackQuery = fallbackQuery.in('development_id', developmentIds)
      }
      result = await fallbackQuery
    }

    if (result.error) {
      if (isMissingTableError(result.error, 'development_participants') || isMissingSchemaError(result.error)) {
        return
      }
      throw result.error
    }

    rows.push(...(result.data || []).map((item) => normalizeDevelopmentParticipantRow(item)))
  }

  if (userId) {
    try {
      await appendRows(client.from('development_participants'), { userIdFilter: userId })
    } catch (error) {
      if (!isMissingColumnError(error, 'user_id')) {
        throw error
      }
    }
  }

  if (normalizedEmail) {
    await appendRows(client.from('development_participants'), { participantEmailFilter: normalizedEmail })
  } else if (!userId) {
    await appendRows(client.from('development_participants'))
  }

  if (userId && (!normalizedRole || normalizedRole === 'attorney')) {
    const firmIds = await fetchFirmIdsForUser(client, userId)
    if (firmIds.length) {
      let byFirmQuery = client
        .from('development_participants')
        .select(
          'id, development_id, user_id, role_type, participant_name, participant_email, organisation_name, is_primary, assignment_source, is_active',
        )
        .in('firm_id', firmIds)

      if (developmentIds.length) {
        byFirmQuery = byFirmQuery.in('development_id', developmentIds)
      }
      if (normalizedRole) {
        byFirmQuery = byFirmQuery.eq('role_type', normalizedRole)
      }

      const byFirmResult = await byFirmQuery
      if (byFirmResult.error) {
        const missingFirmColumns =
          isMissingColumnError(byFirmResult.error, 'firm_id') ||
          isMissingColumnError(byFirmResult.error, 'user_id') ||
          isMissingColumnError(byFirmResult.error, 'organisation_name') ||
          isMissingColumnError(byFirmResult.error, 'is_primary') ||
          isMissingColumnError(byFirmResult.error, 'assignment_source') ||
          isMissingColumnError(byFirmResult.error, 'is_active')
        if (!missingFirmColumns && !isMissingTableError(byFirmResult.error, 'development_participants') && !isMissingSchemaError(byFirmResult.error)) {
          throw byFirmResult.error
        }
      } else {
        rows.push(...(byFirmResult.data || []).map((item) => normalizeDevelopmentParticipantRow(item)))
      }

      let configQuery = client
        .from('development_attorney_configs')
        .select('development_id, attorney_firm_id, attorney_firm_name, primary_contact_name, primary_contact_email, is_active')
        .in('attorney_firm_id', firmIds)

      if (developmentIds.length) {
        configQuery = configQuery.in('development_id', developmentIds)
      }

      const configResult = await configQuery
      if (!configResult.error) {
        for (const row of configResult.data || []) {
          if (!row?.development_id || row?.is_active === false) continue
          rows.push(
            normalizeDevelopmentParticipantRow({
              id: null,
              development_id: row.development_id,
              user_id: null,
              role_type: 'attorney',
              participant_name: row.primary_contact_name || row.attorney_firm_name || '',
              participant_email: normalizeEmailAddress(row.primary_contact_email) || '',
              organisation_name: row.attorney_firm_name || '',
              is_primary: true,
              assignment_source: 'development_default',
              is_active: true,
            }),
          )
        }
      } else if (!isMissingTableError(configResult.error, 'development_attorney_configs') && !isMissingSchemaError(configResult.error)) {
        throw configResult.error
      }
    }
  }

  const dedupedByKey = new Map()
  for (const row of rows) {
    if (!row.developmentId || !row.isActive) {
      continue
    }

    const comparableRole = normalizeDevelopmentParticipantRoleType(row.roleType)
    if (normalizedRole && comparableRole !== normalizedRole) {
      continue
    }

    const key = [
      row.developmentId,
      comparableRole || 'unknown',
      row.userId || '',
      row.participantEmail || '',
      row.participantName || '',
    ].join(':')

    if (!dedupedByKey.has(key)) {
      dedupedByKey.set(key, { ...row, roleType: comparableRole || row.roleType })
    }
  }

  return [...dedupedByKey.values()]
}

async function fetchFallbackDevelopmentParticipantsBySettings(
  client,
  {
    participantEmail = '',
    roleType = null,
    developmentIds = [],
  } = {},
) {
  const normalizedEmail = normalizeEmailAddress(participantEmail)
  const normalizedRole = roleType ? normalizeRoleType(roleType) : null
  const mappedTeamKeys = Object.keys(DEVELOPMENT_TEAM_ROLE_MAP).filter((teamKey) => {
    if (!normalizedRole) {
      return true
    }
    return DEVELOPMENT_TEAM_ROLE_MAP[teamKey].roleType === normalizedRole
  })

  if (!mappedTeamKeys.length) {
    return []
  }

  let settingsQuery = client
    .from('development_settings')
    .select('development_id, stakeholder_teams')

  if (developmentIds.length) {
    settingsQuery = settingsQuery.in('development_id', developmentIds)
  }

  const settingsResult = await settingsQuery
  if (settingsResult.error) {
    if (
      isMissingTableError(settingsResult.error, 'development_settings') ||
      isMissingColumnError(settingsResult.error, 'stakeholder_teams') ||
      isMissingSchemaError(settingsResult.error)
    ) {
      return []
    }
    throw settingsResult.error
  }

  const fallbackRows = []
  for (const row of settingsResult.data || []) {
    const teams = row?.stakeholder_teams && typeof row.stakeholder_teams === 'object' ? row.stakeholder_teams : {}
    for (const teamKey of mappedTeamKeys) {
      const teamList = Array.isArray(teams?.[teamKey]) ? teams[teamKey] : []
      for (const member of teamList) {
        const normalizedMember = normalizeStakeholderTeamParticipant(member, teamKey)
        if (!normalizedMember) {
          continue
        }

        if (normalizedEmail && normalizedMember.participantEmail !== normalizedEmail) {
          continue
        }

        fallbackRows.push({
          ...normalizedMember,
          developmentId: row.development_id || null,
          assignmentSource: 'development_default',
        })
      }
    }
  }

  if (normalizedRole === 'attorney' || !normalizedRole) {
    let attorneyConfigQuery = client
      .from('development_attorney_configs')
      .select('development_id, attorney_firm_name, primary_contact_name, primary_contact_email, is_active')

    if (developmentIds.length) {
      attorneyConfigQuery = attorneyConfigQuery.in('development_id', developmentIds)
    }

    const attorneyResult = await attorneyConfigQuery
    if (
      !attorneyResult.error ||
      !(
        isMissingTableError(attorneyResult.error, 'development_attorney_configs') ||
        isMissingSchemaError(attorneyResult.error)
      )
    ) {
      if (attorneyResult.error) {
        throw attorneyResult.error
      }

      for (const row of attorneyResult.data || []) {
        const email = normalizeEmailAddress(row?.primary_contact_email)
        if (!email || row?.is_active === false) {
          continue
        }

        if (normalizedEmail && email !== normalizedEmail) {
          continue
        }

        fallbackRows.push({
          id: null,
          developmentId: row.development_id || null,
          userId: null,
          roleType: 'attorney',
          participantName: String(row?.primary_contact_name || row?.attorney_firm_name || '').trim(),
          participantEmail: email,
          organisationName: String(row?.attorney_firm_name || '').trim(),
          isPrimary: true,
          assignmentSource: 'development_default',
          isActive: true,
        })
      }
    }
  }

  const deduped = new Map()
  for (const row of fallbackRows) {
    if (!row.developmentId) {
      continue
    }

    const comparableRole = normalizeDevelopmentParticipantRoleType(row.roleType)
    const key = `${row.developmentId}:${comparableRole}:${row.participantEmail}`
    if (!deduped.has(key)) {
      deduped.set(key, { ...row, roleType: comparableRole })
    }
  }

  return [...deduped.values()]
}

async function resolveDevelopmentParticipantsByIdentity(
  client,
  {
    userId = null,
    participantEmail = '',
    roleType = null,
    developmentIds = [],
  } = {},
) {
  const tableRows = await fetchDevelopmentParticipantsByIdentity(client, {
    userId,
    participantEmail,
    roleType,
    developmentIds,
  })

  const keyByRow = (row) =>
    [
      row.developmentId || '',
      row.roleType || '',
      row.userId || '',
      row.participantEmail || '',
      row.participantName || '',
      row.assignmentSource || '',
    ].join(':')

  const deduped = new Map(tableRows.map((row) => [keyByRow(row), row]))
  const fallbackRows = await fetchFallbackDevelopmentParticipantsBySettings(client, {
    participantEmail,
    roleType,
    developmentIds,
  })

  for (const row of fallbackRows) {
    const key = keyByRow(row)
    if (!deduped.has(key)) {
      deduped.set(key, row)
    }
  }

  return [...deduped.values()]
}

async function resolveProfileIdsByEmail(client, emails = []) {
  const normalizedEmails = [...new Set((emails || []).map((item) => String(item || '').trim().toLowerCase()).filter(Boolean))]
  if (!normalizedEmails.length) {
    return {}
  }

  const { data, error } = await client.from('profiles').select('id, email').in('email', normalizedEmails)
  if (error) {
    if (isMissingSchemaError(error)) {
      return {}
    }

    throw error
  }

  return (data || []).reduce((accumulator, row) => {
    const email = String(row?.email || '').trim().toLowerCase()
    if (email && row?.id) {
      accumulator[email] = row.id
    }
    return accumulator
  }, {})
}

function pickInheritedParticipant(inheritedParticipants, roleType) {
  const candidates = (inheritedParticipants || []).filter((item) => item.roleType === roleType)
  if (!candidates.length) {
    return null
  }

  return candidates.find((item) => item.isPrimary) || candidates[0]
}

function buildDefaultParticipantRows(transaction, buyer, inheritedParticipants = []) {
  const managedBy = normalizeFinanceManagedBy(transaction?.finance_managed_by)
  const includeSeller = isPrivateTransactionType(transaction?.transaction_type)
  const inheritedAgent = pickInheritedParticipant(inheritedParticipants, 'agent')
  const inheritedAttorney = pickInheritedParticipant(inheritedParticipants, 'attorney')
  const inheritedBondOriginator = pickInheritedParticipant(inheritedParticipants, 'bond_originator')

  const defaults = [
    {
      roleType: 'developer',
      participantName: 'Samlin Internal Team',
      participantEmail: '',
      participantScope: 'reference',
      assignmentSource: 'system_inherited',
    },
    {
      roleType: 'agent',
      participantName: transaction?.assigned_agent || inheritedAgent?.participantName || 'Estate Agent',
      participantEmail: transaction?.assigned_agent_email || inheritedAgent?.participantEmail || '',
      participantScope: transaction?.assigned_agent || transaction?.assigned_agent_email ? 'transaction' : inheritedAgent ? 'development' : 'reference',
      assignmentSource: transaction?.assigned_agent || transaction?.assigned_agent_email ? 'transaction_direct' : inheritedAgent ? 'development_default' : 'reference_only',
      userId: transaction?.assigned_agent_email ? null : inheritedAgent?.userId || null,
    },
    {
      roleType: 'attorney',
      legalRole: 'transfer',
      participantName: transaction?.attorney || inheritedAttorney?.participantName || 'Attorney / Conveyancer',
      participantEmail: transaction?.assigned_attorney_email || inheritedAttorney?.participantEmail || '',
      participantScope: transaction?.attorney || transaction?.assigned_attorney_email ? 'transaction' : inheritedAttorney ? 'development' : 'reference',
      assignmentSource: transaction?.attorney || transaction?.assigned_attorney_email ? 'transaction_direct' : inheritedAttorney ? 'development_default' : 'reference_only',
      userId: transaction?.assigned_attorney_email ? null : inheritedAttorney?.userId || null,
    },
    {
      roleType: 'bond_originator',
      participantName: transaction?.bond_originator || inheritedBondOriginator?.participantName || 'Bond Originator',
      participantEmail: transaction?.assigned_bond_originator_email || inheritedBondOriginator?.participantEmail || '',
      participantScope: transaction?.bond_originator || transaction?.assigned_bond_originator_email ? 'transaction' : inheritedBondOriginator ? 'development' : 'reference',
      assignmentSource:
        transaction?.bond_originator || transaction?.assigned_bond_originator_email
          ? 'transaction_direct'
          : inheritedBondOriginator
            ? 'development_default'
            : 'reference_only',
      userId: transaction?.assigned_bond_originator_email ? null : inheritedBondOriginator?.userId || null,
    },
    {
      roleType: 'client',
      participantName: buyer?.name || 'Client / Buyer',
      participantEmail: buyer?.email || '',
      participantScope: 'transaction',
      assignmentSource: 'transaction_direct',
    },
  ]

  if (includeSeller) {
    defaults.push({
      roleType: 'seller',
      participantName: transaction?.seller_name || 'Seller',
      participantEmail: transaction?.seller_email || '',
      participantScope: 'transaction',
      assignmentSource: 'transaction_direct',
    })
  }

  return defaults.map((item) => {
    const permissions = getRolePermissions({ role: item.roleType, financeManagedBy: managedBy })
    const legalRole = item.roleType === 'attorney' ? normalizeAttorneyLegalRole(item.legalRole, 'transfer') : 'none'
    const isInternal = typeof item.isInternal === 'boolean' ? item.isInternal : isInternalStakeholderRole(item.roleType)
    return {
      role_type: item.roleType,
      legal_role: legalRole,
      status: normalizeStakeholderStatus(item.status, 'active'),
      invited_at: item.invitedAt || new Date().toISOString(),
      accepted_at: item.acceptedAt || new Date().toISOString(),
      removed_at: null,
      visibility_scope: item.visibilityScope || (isInternal ? 'internal' : 'shared'),
      is_internal: isInternal,
      participant_name: normalizeNullableText(item.participantName),
      participant_email: normalizeNullableText(item.participantEmail)?.toLowerCase() || null,
      participant_scope: item.participantScope || 'transaction',
      assignment_source: item.assignmentSource || 'transaction_direct',
      user_id: item.userId || null,
      firm_id: item.firmId || null,
      invited_by_user_id: item.invitedByUserId || null,
      invitation_token: null,
      invitation_expires_at: null,
      can_view: permissions.canView,
      can_comment: permissions.canComment,
      can_upload_documents: permissions.canUploadDocuments,
      can_edit_finance_workflow: permissions.canEditFinanceWorkflow,
      can_edit_attorney_workflow: permissions.canEditAttorneyWorkflow,
      can_edit_core_transaction: permissions.canEditCoreTransaction,
    }
  })
}

async function resolveViewerRole(client, participants = []) {
  let viewerEmail = ''
  try {
    const { data } = await client.auth.getSession()
    viewerEmail = String(data?.session?.user?.email || '')
      .trim()
      .toLowerCase()
  } catch {
    viewerEmail = ''
  }

  if (!viewerEmail) {
    return 'developer'
  }

  const matched = participants.find(
    (item) =>
      normalizeStakeholderStatus(item.stakeholderStatus, 'active') === 'active' &&
      String(item.participantEmail || '').trim().toLowerCase() === viewerEmail,
  )
  return matched?.roleType || 'developer'
}

async function upsertTransactionParticipantsRowsWithFallback(
  client,
  {
    rows = [],
    onConflict = 'transaction_id,role_type,legal_role',
    rowSelect = 'id',
    matchOnLegalRole = true,
  } = {},
) {
  const normalizedRows = (rows || []).map((sourceRow) => {
    const row = { ...(sourceRow || {}) }
    if (Object.prototype.hasOwnProperty.call(row, 'role_type')) {
      const normalizedRoleType = normalizeRoleType(row.role_type)
      row.role_type = normalizedRoleType
      if (Object.prototype.hasOwnProperty.call(row, 'legal_role')) {
        row.legal_role =
          normalizedRoleType === 'attorney'
            ? normalizeAttorneyLegalRole(row.legal_role, 'transfer')
            : 'none'
      }
    }
    return row
  })

  let result = await client
    .from('transaction_participants')
    .upsert(normalizedRows, { onConflict })
    .select(rowSelect)

  if (!result.error || !isOnConflictConstraintError(result.error)) {
    return result
  }

  const rowIds = []
  for (const row of normalizedRows) {
    let lookupQuery = client
      .from('transaction_participants')
      .select('id')
      .eq('transaction_id', row.transaction_id)
      .eq('role_type', row.role_type)

    if (matchOnLegalRole && Object.prototype.hasOwnProperty.call(row, 'legal_role')) {
      lookupQuery = lookupQuery.eq('legal_role', row.legal_role)
    }

    let existingResult = await lookupQuery.maybeSingle()
    if (existingResult.error && matchOnLegalRole && isMissingColumnError(existingResult.error, 'legal_role')) {
      existingResult = await client
        .from('transaction_participants')
        .select('id')
        .eq('transaction_id', row.transaction_id)
        .eq('role_type', row.role_type)
        .maybeSingle()
    }

    if (existingResult.error) {
      return existingResult
    }

    if (existingResult.data?.id) {
      const updateResult = await client
        .from('transaction_participants')
        .update(row)
        .eq('id', existingResult.data.id)
        .select('id')
        .maybeSingle()

      if (updateResult.error) {
        return updateResult
      }
      rowIds.push(updateResult.data?.id || existingResult.data.id)
      continue
    }

    const insertResult = await client
      .from('transaction_participants')
      .insert(row)
      .select('id')
      .single()

    if (insertResult.error) {
      return insertResult
    }

    if (insertResult.data?.id) {
      rowIds.push(insertResult.data.id)
    }
  }

  if (!rowIds.length) {
    return { data: [], error: null }
  }

  result = await client
    .from('transaction_participants')
    .select(rowSelect)
    .in('id', rowIds)

  return result
}

async function ensureTransactionParticipants(client, { transaction, buyer }) {
  if (!transaction?.id) {
    return {
      participants: [],
      viewerRole: 'developer',
      viewerPermissions: getRolePermissions({ role: 'developer', financeManagedBy: 'bond_originator' }),
    }
  }

  const inheritedParticipants =
    transaction?.development_id
      ? await resolveDevelopmentParticipantsByIdentity(client, {
          developmentIds: [transaction.development_id],
        })
      : []

  const defaults = buildDefaultParticipantRows(transaction, buyer, inheritedParticipants)
  const rowSelect = `
    id,
    transaction_id,
    user_id,
    role_type,
    legal_role,
    status,
    firm_id,
    invited_by_user_id,
    invitation_token,
    invitation_expires_at,
    invited_at,
    accepted_at,
    removed_at,
    visibility_scope,
    is_internal,
    participant_name,
    participant_email,
    participant_scope,
    assignment_source,
    can_view,
    can_comment,
    can_upload_documents,
    can_edit_finance_workflow,
    can_edit_attorney_workflow,
    can_edit_core_transaction,
    created_at,
    updated_at
  `

  const profileIdByEmail = await resolveProfileIdsByEmail(
    client,
    defaults.map((row) => row.participant_email),
  )
  const upsertRows = defaults.map((row) => ({
    transaction_id: transaction.id,
    user_id: row.user_id || (row.participant_email ? profileIdByEmail[row.participant_email] || null : null),
    ...row,
  }))

  let onConflictKey = 'transaction_id,role_type,legal_role'
  let upsertResult = await upsertTransactionParticipantsRowsWithFallback(client, {
    rows: upsertRows,
    onConflict: onConflictKey,
    rowSelect,
    matchOnLegalRole: true,
  })

  if (
    upsertResult.error &&
    (isMissingColumnError(upsertResult.error, 'can_edit_core_transaction') ||
      isMissingColumnError(upsertResult.error, 'user_id') ||
      isMissingColumnError(upsertResult.error, 'legal_role') ||
      isMissingColumnError(upsertResult.error, 'status') ||
      isMissingColumnError(upsertResult.error, 'firm_id') ||
      isMissingColumnError(upsertResult.error, 'invited_by_user_id') ||
      isMissingColumnError(upsertResult.error, 'invitation_token') ||
      isMissingColumnError(upsertResult.error, 'invitation_expires_at') ||
      isMissingColumnError(upsertResult.error, 'invited_at') ||
      isMissingColumnError(upsertResult.error, 'accepted_at') ||
      isMissingColumnError(upsertResult.error, 'removed_at') ||
      isMissingColumnError(upsertResult.error, 'visibility_scope') ||
      isMissingColumnError(upsertResult.error, 'is_internal') ||
      isMissingColumnError(upsertResult.error, 'participant_scope') ||
      isMissingColumnError(upsertResult.error, 'assignment_source'))
  ) {
    const missingCanEditCoreTransactionColumn = isMissingColumnError(upsertResult.error, 'can_edit_core_transaction')
    const missingUserIdColumn = isMissingColumnError(upsertResult.error, 'user_id')
    const missingLegalRoleColumn = isMissingColumnError(upsertResult.error, 'legal_role')
    const missingStatusColumn = isMissingColumnError(upsertResult.error, 'status')
    const missingFirmIdColumn = isMissingColumnError(upsertResult.error, 'firm_id')
    const missingInvitedByUserIdColumn = isMissingColumnError(upsertResult.error, 'invited_by_user_id')
    const missingInvitationTokenColumn = isMissingColumnError(upsertResult.error, 'invitation_token')
    const missingInvitationExpiresAtColumn = isMissingColumnError(upsertResult.error, 'invitation_expires_at')
    const missingInvitedAtColumn = isMissingColumnError(upsertResult.error, 'invited_at')
    const missingAcceptedAtColumn = isMissingColumnError(upsertResult.error, 'accepted_at')
    const missingRemovedAtColumn = isMissingColumnError(upsertResult.error, 'removed_at')
    const missingVisibilityColumn = isMissingColumnError(upsertResult.error, 'visibility_scope')
    const missingIsInternalColumn = isMissingColumnError(upsertResult.error, 'is_internal')
    const missingParticipantScopeColumn = isMissingColumnError(upsertResult.error, 'participant_scope')
    const missingAssignmentSourceColumn = isMissingColumnError(upsertResult.error, 'assignment_source')
    const legacyRowSelect = missingLegalRoleColumn
      ? `
      id,
      transaction_id,
      role_type,
      participant_name,
      participant_email,
      can_view,
      can_comment,
      can_upload_documents,
      can_edit_finance_workflow,
      can_edit_attorney_workflow,
      created_at,
      updated_at
    `
      : `
      id,
      transaction_id,
      role_type,
      legal_role,
      participant_name,
      participant_email,
      can_view,
      can_comment,
      can_upload_documents,
      can_edit_finance_workflow,
      can_edit_attorney_workflow,
      created_at,
      updated_at
    `
    const legacyRows = upsertRows.map((row) => {
      const clone = { ...row }
      if (missingUserIdColumn) {
        delete clone.user_id
      }
      if (missingCanEditCoreTransactionColumn) {
        delete clone.can_edit_core_transaction
      }
      if (missingLegalRoleColumn) {
        delete clone.legal_role
      }
      if (missingStatusColumn) {
        delete clone.status
      }
      if (missingVisibilityColumn) {
        delete clone.visibility_scope
      }
      if (missingFirmIdColumn) {
        delete clone.firm_id
      }
      if (missingInvitedByUserIdColumn) {
        delete clone.invited_by_user_id
      }
      if (missingInvitationTokenColumn) {
        delete clone.invitation_token
      }
      if (missingInvitationExpiresAtColumn) {
        delete clone.invitation_expires_at
      }
      if (missingInvitedAtColumn) {
        delete clone.invited_at
      }
      if (missingAcceptedAtColumn) {
        delete clone.accepted_at
      }
      if (missingRemovedAtColumn) {
        delete clone.removed_at
      }
      if (missingIsInternalColumn) {
        delete clone.is_internal
      }
      if (missingParticipantScopeColumn) {
        delete clone.participant_scope
      }
      if (missingAssignmentSourceColumn) {
        delete clone.assignment_source
      }
      return clone
    })

    onConflictKey = missingLegalRoleColumn ? 'transaction_id,role_type' : 'transaction_id,role_type,legal_role'
    upsertResult = await upsertTransactionParticipantsRowsWithFallback(client, {
      rows: legacyRows,
      onConflict: onConflictKey,
      rowSelect: legacyRowSelect,
      matchOnLegalRole: !missingLegalRoleColumn,
    })
  }

  if (upsertResult.error) {
    if (isMissingTableError(upsertResult.error, 'transaction_participants')) {
      const fallbackParticipants = defaults.map((row) =>
        normalizeTransactionParticipantRow({
          transaction_id: transaction.id,
          ...row,
        }),
      )
      const viewerRole = await resolveViewerRole(client, fallbackParticipants)
      const activeViewer = fallbackParticipants.find((item) => item.roleType === viewerRole) || fallbackParticipants[0]
      return {
        participants: fallbackParticipants,
        viewerRole,
        viewerPermissions: activeViewer
          ? {
              canView: activeViewer.canView,
              canComment: activeViewer.canComment,
              canUploadDocuments: activeViewer.canUploadDocuments,
              canEditFinanceWorkflow: activeViewer.canEditFinanceWorkflow,
              canEditAttorneyWorkflow: activeViewer.canEditAttorneyWorkflow,
              canEditCoreTransaction: activeViewer.canEditCoreTransaction,
            }
          : getRolePermissions({ role: 'developer', financeManagedBy: transaction.finance_managed_by }),
      }
    }

    throw upsertResult.error
  }

  const participants = (upsertResult.data || []).map((row) => normalizeTransactionParticipantRow(row))
  const viewerRole = await resolveViewerRole(client, participants)
  const activeViewer = participants.find((item) => item.roleType === viewerRole) || participants[0]

  return {
    participants,
    viewerRole,
    viewerPermissions: activeViewer
      ? {
          canView: activeViewer.canView,
          canComment: activeViewer.canComment,
          canUploadDocuments: activeViewer.canUploadDocuments,
          canEditFinanceWorkflow: activeViewer.canEditFinanceWorkflow,
          canEditAttorneyWorkflow: activeViewer.canEditAttorneyWorkflow,
          canEditCoreTransaction: activeViewer.canEditCoreTransaction,
        }
      : getRolePermissions({ role: 'developer', financeManagedBy: transaction.finance_managed_by }),
  }
}

function normalizeTransactionCommentRow(row, options = {}) {
  const role = normalizeRoleType(row?.author_role || 'developer')
  const metadata = parseDiscussionMetadata(row?.comment_text || '')
  const visibility = normalizeDiscussionVisibility(options.visibility, metadata.visibility)
  const discussionType = DISCUSSION_TYPES.includes(options.discussionType)
    ? options.discussionType
    : metadata.discussionType
  const commentBody = String((options.commentBody ?? metadata.body ?? row?.comment_text) || '').trim()

  return {
    id: row?.id || null,
    transactionId: row?.transaction_id || null,
    authorName: row?.author_name || 'Samlin Team',
    authorRole: role,
    authorRoleLabel: TRANSACTION_ROLE_LABELS[role] || role,
    commentText: row?.comment_text || commentBody,
    commentBody: commentBody || row?.comment_text || '',
    discussionType,
    visibility,
    createdAt: row?.created_at || null,
  }
}

function normalizeLegacyNoteAsDiscussionRow(note, transactionId, visibility = 'internal') {
  return normalizeTransactionCommentRow(
    {
      id: note?.id || null,
      transaction_id: note?.transaction_id || transactionId || null,
      author_name: 'Samlin Team',
      author_role: 'developer',
      comment_text: note?.body || '',
      created_at: note?.created_at || null,
    },
    {
      visibility,
      discussionType: 'operational',
    },
  )
}

function filterDiscussionRowsByViewer(discussion, viewer = 'internal') {
  if (viewer === 'internal') {
    return discussion
  }

  return discussion.filter((item) => normalizeDiscussionVisibility(item.visibility) !== 'internal')
}

function normalizeTransactionEventRow(row) {
  return {
    id: row?.id || null,
    transactionId: row?.transaction_id || null,
    eventType: normalizeEventType(row?.event_type),
    eventData: row?.event_data && typeof row.event_data === 'object' ? row.event_data : {},
    createdBy: row?.created_by || null,
    createdByRole: row?.created_by_role || null,
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null,
  }
}

function normalizeNotificationRow(row) {
  return {
    id: row?.id || null,
    transactionId: row?.transaction_id || null,
    userId: row?.user_id || null,
    roleType: normalizeRoleType(row?.role_type || null),
    type: normalizeNotificationType(row?.notification_type),
    title: row?.title || '',
    message: row?.message || '',
    isRead: Boolean(row?.is_read),
    readAt: row?.read_at || null,
    dedupeKey: row?.dedupe_key || null,
    eventType: normalizeEventType(row?.event_type),
    eventData: row?.event_data && typeof row.event_data === 'object' ? row.event_data : {},
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null,
  }
}

function normalizeDocumentRequestRow(row) {
  return {
    id: row?.id || null,
    transactionId: row?.transaction_id || null,
    category: row?.category || 'General',
    documentType: row?.document_type || null,
    title: row?.title || row?.document_type || 'Document Request',
    description: row?.description || null,
    priority: normalizeDocumentRequestPriorityValue(row?.priority),
    dueDate: row?.due_date || null,
    assignedToRole: normalizeRoleType(row?.assigned_to_role || null) || normalizeRequestRoleScope(row?.assigned_to_role || null),
    assignedToUserId: row?.assigned_to_user_id || null,
    requestGroupId: row?.request_group_id || null,
    status: normalizeDocumentRequestStatusValue(row?.status),
    requiresReview: row?.requires_review !== false,
    requestedDocumentId: row?.requested_document_id || null,
    createdBy: row?.created_by || null,
    createdByRole: normalizeRoleType(row?.created_by_role || null) || normalizeRequestRoleScope(row?.created_by_role || null, 'attorney'),
    completedAt: row?.completed_at || null,
    rejectedReason: row?.rejected_reason || null,
    resendCount: Number(row?.resend_count || 0) || 0,
    lastResentAt: row?.last_resent_at || null,
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null,
  }
}

function normalizeChecklistItemRow(row) {
  return {
    id: row?.id || null,
    transactionId: row?.transaction_id || null,
    stage: normalizeAttorneyStageValue(row?.stage),
    label: row?.label || 'Checklist item',
    description: row?.description || null,
    status: normalizeChecklistItemStatusValue(row?.status),
    priority: normalizeDocumentRequestPriorityValue(row?.priority),
    ownerRole: normalizeRoleType(row?.owner_role || null) || normalizeRequestRoleScope(row?.owner_role || null, 'attorney'),
    ownerUserId: row?.owner_user_id || null,
    linkedDocumentRequestId: row?.linked_document_request_id || null,
    linkedDocumentId: row?.linked_document_id || null,
    autoRuleKey: row?.auto_rule_key || null,
    isAutoManaged: row?.is_auto_managed === true,
    completedBy: row?.completed_by || null,
    completedAt: row?.completed_at || null,
    overriddenBy: row?.overridden_by || null,
    overrideReason: row?.override_reason || null,
    sortOrder: Number(row?.sort_order || 0) || 0,
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null,
  }
}

function normalizeIssueOverrideRow(row) {
  return {
    id: row?.id || null,
    transactionId: row?.transaction_id || null,
    issueType: normalizeIssueTypeValue(row?.issue_type),
    overriddenBy: row?.overridden_by || null,
    overrideReason: row?.override_reason || null,
    resolveBy: row?.resolve_by || null,
    isActive: row?.is_active !== false,
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null,
  }
}

async function resolveActiveProfileContext(client) {
  try {
    const { data, error } = await client.auth.getSession()
    if (error) {
      return { userId: null, role: null, firmId: null, firmRole: null }
    }

    const user = data?.session?.user
    if (!user?.id) {
      return { userId: null, role: null, firmId: null, firmRole: null }
    }

    const profileQuery = await client
      .from('profiles')
      .select('id, role, firm_id, firm_role')
      .eq('id', user.id)
      .maybeSingle()
    if (profileQuery.error) {
      if (isMissingSchemaError(profileQuery.error)) {
        return { userId: user.id, role: null, firmId: null, firmRole: null }
      }
      return { userId: user.id, role: null, firmId: null, firmRole: null }
    }

    return {
      userId: user.id,
      role: normalizeRoleType(profileQuery.data?.role || 'developer'),
      firmId: profileQuery.data?.firm_id || null,
      firmRole: normalizeFirmRole(profileQuery.data?.firm_role || 'attorney'),
    }
  } catch {
    return { userId: null, role: null, firmId: null, firmRole: null }
  }
}

async function logTransactionEventIfPossible(client, payload = {}) {
  if (!payload?.transactionId) {
    return null
  }

  const activeProfile = await resolveActiveProfileContext(client)
  const insertPayload = {
    transaction_id: payload.transactionId,
    event_type: normalizeEventType(payload.eventType),
    event_data: payload.eventData && typeof payload.eventData === 'object' ? payload.eventData : {},
    created_by: payload.createdBy || activeProfile.userId || null,
    created_by_role: payload.createdByRole || activeProfile.role || null,
  }

  let insertResult = await client
    .from('transaction_events')
    .insert(insertPayload)
    .select('id, transaction_id, event_type, event_data, created_by, created_by_role, created_at, updated_at')
    .single()

  if (
    insertResult.error &&
    (isMissingColumnError(insertResult.error, 'created_by') ||
      isMissingColumnError(insertResult.error, 'created_by_role') ||
      isMissingColumnError(insertResult.error, 'event_data'))
  ) {
    const fallbackPayload = { ...insertPayload }
    delete fallbackPayload.created_by
    delete fallbackPayload.created_by_role
    delete fallbackPayload.event_data

    insertResult = await client
      .from('transaction_events')
      .insert(fallbackPayload)
      .select('id, transaction_id, event_type, created_at')
      .single()
  }

  if (insertResult.error) {
    if (isMissingTableError(insertResult.error, 'transaction_events') || isMissingSchemaError(insertResult.error)) {
      return null
    }

    throw insertResult.error
  }

  return normalizeTransactionEventRow(insertResult.data)
}

export async function createTransactionEvent({
  transactionId,
  eventType,
  eventData = {},
  createdBy = null,
  createdByRole = null,
}) {
  const client = requireClient()
  return logTransactionEventIfPossible(client, {
    transactionId,
    eventType,
    eventData,
    createdBy,
    createdByRole,
  })
}

export async function fetchTransactionEvents(transactionId, options = {}) {
  const { limit = 200, client: scopedClient = null } = options
  const client = scopedClient || requireClient()
  if (!transactionId) {
    return []
  }

  const query = await client
    .from('transaction_events')
    .select('id, transaction_id, event_type, event_data, created_by, created_by_role, created_at, updated_at')
    .eq('transaction_id', transactionId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (query.error) {
    if (isMissingTableError(query.error, 'transaction_events') || isMissingSchemaError(query.error)) {
      return []
    }

    throw query.error
  }

  return (query.data || []).map((row) => normalizeTransactionEventRow(row))
}

async function createTransactionNotificationIfPossible(client, payload = {}) {
  const userId = payload.userId || null
  if (!userId) {
    return null
  }

  const notificationPayload = {
    transaction_id: payload.transactionId || null,
    user_id: userId,
    role_type: normalizeRoleType(payload.roleType || null),
    notification_type: normalizeNotificationType(payload.notificationType),
    title: normalizeTextValue(payload.title || 'Bridge Update'),
    message: normalizeTextValue(payload.message || ''),
    is_read: false,
    read_at: null,
    dedupe_key: normalizeNullableText(payload.dedupeKey),
    event_type: normalizeEventType(payload.eventType || 'TransactionUpdated'),
    event_data: payload.eventData && typeof payload.eventData === 'object' ? payload.eventData : {},
  }

  if (notificationPayload.dedupe_key) {
    const existingQuery = await client
      .from('transaction_notifications')
      .select(
        'id, transaction_id, user_id, role_type, notification_type, title, message, is_read, read_at, dedupe_key, event_type, event_data, created_at, updated_at',
      )
      .eq('user_id', notificationPayload.user_id)
      .eq('dedupe_key', notificationPayload.dedupe_key)
      .eq('is_read', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingQuery.error) {
      if (
        isMissingTableError(existingQuery.error, 'transaction_notifications') ||
        isMissingColumnError(existingQuery.error, 'dedupe_key')
      ) {
        return null
      }
      throw existingQuery.error
    }

    if (existingQuery.data) {
      return normalizeNotificationRow(existingQuery.data)
    }
  }

  const insertResult = await client
    .from('transaction_notifications')
    .insert(notificationPayload)
    .select(
      'id, transaction_id, user_id, role_type, notification_type, title, message, is_read, read_at, dedupe_key, event_type, event_data, created_at, updated_at',
    )
    .single()

  if (insertResult.error) {
    if (
      isMissingTableError(insertResult.error, 'transaction_notifications') ||
      isMissingColumnError(insertResult.error, 'notification_type') ||
      isMissingColumnError(insertResult.error, 'event_data')
    ) {
      return null
    }
    throw insertResult.error
  }

  return normalizeNotificationRow(insertResult.data)
}

async function fetchNotificationTargetsByRole(client, { transactionId, roleTypes = [] } = {}) {
  if (!transactionId || !Array.isArray(roleTypes) || !roleTypes.length) {
    return []
  }

  const participantsQuery = await client
    .from('transaction_participants')
    .select('transaction_id, user_id, role_type, participant_email, participant_name, status, removed_at')
    .eq('transaction_id', transactionId)

  if (participantsQuery.error) {
    if (isMissingTableError(participantsQuery.error, 'transaction_participants')) {
      return []
    }
    throw participantsQuery.error
  }

  const normalizedRoleTypes = roleTypes.map((item) => normalizeRoleType(item))
  const filteredParticipants = (participantsQuery.data || []).filter((row) =>
    normalizedRoleTypes.includes(normalizeRoleType(row.role_type)) &&
    !row.removed_at &&
    normalizeStakeholderStatus(row.status, 'active') === 'active',
  )

  const missingEmails = filteredParticipants
    .filter((row) => !row.user_id && row.participant_email)
    .map((row) => row.participant_email)
  const profileIdByEmail = await resolveProfileIdsByEmail(client, missingEmails)

  return filteredParticipants
    .map((row) => ({
      transactionId: row.transaction_id || transactionId,
      userId: row.user_id || profileIdByEmail[String(row.participant_email || '').trim().toLowerCase()] || null,
      roleType: normalizeRoleType(row.role_type),
      participantName: row.participant_name || '',
      participantEmail: row.participant_email || '',
    }))
    .filter((row) => row.userId)
}

async function notifyRolesForTransaction(
  client,
  {
    transactionId,
    roleTypes = [],
    title,
    message,
    notificationType = 'readiness_updated',
    eventType = 'TransactionUpdated',
    eventData = {},
    dedupePrefix = 'notify',
    excludeUserId = null,
  } = {},
) {
  const targets = await fetchNotificationTargetsByRole(client, { transactionId, roleTypes })
  if (!targets.length) {
    return []
  }

  const notifications = []
  for (const target of targets) {
    if (excludeUserId && target.userId === excludeUserId) {
      continue
    }

    const created = await createTransactionNotificationIfPossible(client, {
      transactionId: target.transactionId,
      userId: target.userId,
      roleType: target.roleType,
      notificationType,
      title,
      message,
      eventType,
      eventData: { ...(eventData || {}), recipientRole: target.roleType },
      dedupeKey: `${dedupePrefix}:${target.transactionId}:${target.roleType}:${target.userId}`,
    })

    if (created) {
      notifications.push(created)
    }
  }

  return notifications
}

async function computeTransactionReadinessSnapshot(client, transactionId) {
  if (!transactionId) {
    return null
  }

  let transactionQuery = await client
    .from('transactions')
    .select('id, finance_type, purchaser_type, cash_amount, bond_amount, reservation_required, stage, current_main_stage')
    .eq('id', transactionId)
    .maybeSingle()

  if (
    transactionQuery.error &&
    (isMissingColumnError(transactionQuery.error, 'purchaser_type') ||
      isMissingColumnError(transactionQuery.error, 'cash_amount') ||
      isMissingColumnError(transactionQuery.error, 'bond_amount') ||
      isMissingColumnError(transactionQuery.error, 'reservation_required') ||
      isMissingColumnError(transactionQuery.error, 'current_main_stage'))
  ) {
    transactionQuery = await client
      .from('transactions')
      .select('id, finance_type, stage')
      .eq('id', transactionId)
      .maybeSingle()
  }

  if (transactionQuery.error) {
    if (isMissingSchemaError(transactionQuery.error)) {
      return null
    }
    throw transactionQuery.error
  }

  const transaction = transactionQuery.data
  if (!transaction) {
    return null
  }

  const purchaserType = normalizePurchaserType(transaction.purchaser_type)
  const requiredDocuments = await ensureTransactionRequiredDocuments(client, {
    transactionId,
    purchaserType,
    financeType: normalizeFinanceType(transaction.finance_type || 'cash'),
    reservationRequired: Boolean(transaction.reservation_required),
    cashAmount: transaction.cash_amount,
    bondAmount: transaction.bond_amount,
  })
  const uploadedDocuments = await loadSharedDocuments(client, {
    transactionIds: [transactionId],
    viewer: 'internal',
  })

  const checklistResult = buildRequiredChecklistFromRows(requiredDocuments, uploadedDocuments)
  const uploadedRequiredDocs = Number(checklistResult.summary?.uploadedCount || 0)
  const totalRequiredDocs = Number(checklistResult.summary?.totalRequired || 0)
  const missingRequiredDocs = Math.max(totalRequiredDocs - uploadedRequiredDocs, 0)
  const docsComplete = totalRequiredDocs === 0 ? true : missingRequiredDocs === 0

  const onboarding = await getOrCreateTransactionOnboardingRecord(client, {
    transactionId,
    purchaserType,
  })
  const onboardingStatus = onboarding?.status || 'Not Started'
  const onboardingComplete = ['Submitted', 'Reviewed', 'Approved'].includes(onboardingStatus)

  const financeType = normalizeFinanceType(transaction.finance_type, { allowUnknown: true })
  const stage = normalizeStage(transaction.stage, 'Available')
  const mainStage = normalizeMainStage(transaction.current_main_stage, stage)
  const financeLaneReady = isBondFinanceType(financeType) ? docsComplete && onboardingComplete : docsComplete
  const attorneyLaneReady =
    docsComplete &&
    (financeType === 'cash' || ['ATTY', 'XFER', 'REG'].includes(mainStage) || stage === 'Bond Approved / Proof of Funds')
  const stageReady = docsComplete && onboardingComplete

  return {
    transactionId,
    financeType,
    stage,
    mainStage,
    onboardingStatus,
    onboardingComplete,
    docsComplete,
    uploadedRequiredDocs,
    totalRequiredDocs,
    missingRequiredDocs,
    financeLaneReady,
    attorneyLaneReady,
    stageReady,
  }
}

async function upsertTransactionReadinessIfPossible(client, readiness) {
  if (!readiness?.transactionId) {
    return null
  }

  const payload = {
    transaction_id: readiness.transactionId,
    onboarding_status: readiness.onboardingStatus || 'Not Started',
    onboarding_complete: Boolean(readiness.onboardingComplete),
    docs_complete: Boolean(readiness.docsComplete),
    missing_required_docs: Number(readiness.missingRequiredDocs || 0),
    uploaded_required_docs: Number(readiness.uploadedRequiredDocs || 0),
    total_required_docs: Number(readiness.totalRequiredDocs || 0),
    finance_lane_ready: Boolean(readiness.financeLaneReady),
    attorney_lane_ready: Boolean(readiness.attorneyLaneReady),
    stage_ready: Boolean(readiness.stageReady),
    updated_at: new Date().toISOString(),
  }

  const result = await client
    .from('transaction_readiness_states')
    .upsert(payload, { onConflict: 'transaction_id' })
    .select(
      'id, transaction_id, onboarding_status, onboarding_complete, docs_complete, missing_required_docs, uploaded_required_docs, total_required_docs, finance_lane_ready, attorney_lane_ready, stage_ready, updated_at',
    )
    .maybeSingle()

  if (result.error) {
    if (
      isMissingTableError(result.error, 'transaction_readiness_states') ||
      isMissingColumnError(result.error, 'onboarding_complete')
    ) {
      return null
    }
    throw result.error
  }

  return result.data || null
}

function normalizeDocumentKeyCandidate(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '_')
    .replaceAll(/^_+|_+$/g, '')
}

async function matchAndMarkRequiredDocumentFromUpload(
  client,
  {
    transactionId,
    documentId,
    documentName,
    category,
    requiredDocumentKey = null,
  } = {},
) {
  if (!transactionId || !documentId) {
    return null
  }

  const requiredRowsQuery = await client
    .from('transaction_required_documents')
    .select('id, transaction_id, document_key, document_label, is_uploaded')
    .eq('transaction_id', transactionId)

  if (requiredRowsQuery.error) {
    if (isMissingTableError(requiredRowsQuery.error, 'transaction_required_documents')) {
      return null
    }
    throw requiredRowsQuery.error
  }

  const requiredRows = requiredRowsQuery.data || []
  if (!requiredRows.length) {
    return null
  }

  const explicitKey = normalizeDocumentKeyCandidate(requiredDocumentKey)
  const categoryKey = normalizeDocumentKeyCandidate(category)
  const nameKey = normalizeDocumentKeyCandidate(documentName)

  let matched = requiredRows.find((row) => normalizeDocumentKeyCandidate(row.document_key) === explicitKey)

  if (!matched && categoryKey) {
    matched = requiredRows.find((row) => normalizeDocumentKeyCandidate(row.document_key) === categoryKey)
    if (!matched) {
      matched = requiredRows.find((row) => normalizeDocumentKeyCandidate(row.document_label) === categoryKey)
    }
  }

  if (!matched && nameKey) {
    matched = requiredRows.find((row) => nameKey.includes(normalizeDocumentKeyCandidate(row.document_key)))
    if (!matched) {
      matched = requiredRows.find((row) => nameKey.includes(normalizeDocumentKeyCandidate(row.document_label)))
    }
  }

  if (!matched) {
    return null
  }

  const updateResult = await client
    .from('transaction_required_documents')
    .update({
      is_uploaded: true,
      uploaded_document_id: documentId,
      status: 'uploaded',
      uploaded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', matched.id)
    .select('id, transaction_id, document_key, document_label, is_uploaded, uploaded_document_id, sort_order')
    .single()

  if (updateResult.error) {
    if (
      isMissingColumnError(updateResult.error, 'status') ||
      isMissingColumnError(updateResult.error, 'uploaded_at')
    ) {
      const legacyUpdateResult = await client
        .from('transaction_required_documents')
        .update({
          is_uploaded: true,
          uploaded_document_id: documentId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', matched.id)
        .select('id, transaction_id, document_key, document_label, is_uploaded, uploaded_document_id, sort_order')
        .single()

      if (legacyUpdateResult.error) {
        if (isMissingTableError(legacyUpdateResult.error, 'transaction_required_documents')) {
          return null
        }
        throw legacyUpdateResult.error
      }

      return legacyUpdateResult.data
    }

    if (isMissingTableError(updateResult.error, 'transaction_required_documents')) {
      return null
    }
    throw updateResult.error
  }

  return updateResult.data
}

async function runDocumentAutomationIfPossible(
  client,
  {
    transactionId,
    documentId,
    documentName,
    category,
    actorRole = null,
    actorUserId = null,
    source = 'internal',
    requiredDocumentKey = null,
  } = {},
) {
  if (!transactionId) {
    return null
  }

  let matchedRequiredDocument = null
  if (documentId) {
    matchedRequiredDocument = await matchAndMarkRequiredDocumentFromUpload(client, {
      transactionId,
      documentId,
      documentName,
      category,
      requiredDocumentKey,
    })

    const normalizedDocumentKey = matchedRequiredDocument?.document_key || requiredDocumentKey || null
    const reservationSync = await updateReservationFromRequiredDocumentStatusIfNeeded(client, {
      transactionId,
      documentKey: normalizedDocumentKey,
      requiredDocumentStatus: 'uploaded',
      documentId,
      actorUserId: actorUserId || null,
    })

    if (reservationSync && normalizeRoleType(actorRole) === 'client') {
      await notifyRolesForTransaction(client, {
        transactionId,
        roleTypes: ['developer', 'agent', 'attorney'],
        title: 'Reservation POP uploaded',
        message: `${documentName || 'Reservation proof of payment'} was uploaded by the client and is ready for review.`,
        notificationType: 'document_uploaded',
        eventType: 'DocumentUploaded',
        eventData: {
          source,
          reservationStatus: 'paid',
          documentId,
          documentKey: normalizedDocumentKey,
        },
        dedupePrefix: `reservation-pop-uploaded:${documentId || normalizedDocumentKey || 'unknown'}`,
        excludeUserId: actorUserId || null,
      })
    }
  }

  const readiness = await computeTransactionReadinessSnapshot(client, transactionId)
  if (!readiness) {
    return null
  }

  await upsertTransactionReadinessIfPossible(client, readiness)

  await logTransactionEventIfPossible(client, {
    transactionId,
    eventType: 'TransactionUpdated',
    createdBy: actorUserId || null,
    createdByRole: normalizeRoleType(actorRole),
    eventData: {
      automation: 'ReadinessRecalculated',
      source,
      docsComplete: readiness.docsComplete,
      missingRequiredDocs: readiness.missingRequiredDocs,
      onboardingComplete: readiness.onboardingComplete,
      stageReady: readiness.stageReady,
      financeLaneReady: readiness.financeLaneReady,
      attorneyLaneReady: readiness.attorneyLaneReady,
    },
  })

  if (normalizeRoleType(actorRole) === 'client' && documentId) {
    await notifyRolesForTransaction(client, {
      transactionId,
      roleTypes: ['agent'],
      title: 'Client uploaded a document',
      message: `${documentName || 'A required document'} was uploaded and is ready for review.`,
      notificationType: 'document_uploaded',
      eventType: 'DocumentUploaded',
      eventData: { documentId, source },
      dedupePrefix: `client-doc-upload:${documentId}`,
      excludeUserId: actorUserId || null,
    })
  }

  if (readiness.docsComplete && readiness.onboardingComplete) {
    if (isBondFinanceType(readiness.financeType)) {
      await notifyRolesForTransaction(client, {
        transactionId,
        roleTypes: ['bond_originator'],
        title: 'Finance lane ready',
        message: 'Required onboarding documents are complete. Finance processing can proceed.',
        notificationType: 'lane_handoff',
        eventType: 'TransactionUpdated',
        eventData: { trigger: 'docs_complete_finance' },
        dedupePrefix: 'handoff-finance-ready',
      })
    } else {
      await notifyRolesForTransaction(client, {
        transactionId,
        roleTypes: ['attorney'],
        title: 'Attorney lane ready',
        message: 'Required onboarding documents are complete. Transfer preparation can proceed.',
        notificationType: 'lane_handoff',
        eventType: 'TransactionUpdated',
        eventData: { trigger: 'docs_complete_attorney' },
        dedupePrefix: 'handoff-attorney-ready',
      })
    }
  }

  return readiness
}

async function runOverdueMissingDocsReminderAutomation(client, { userId, role } = {}) {
  if (!userId || !role || !['developer', 'agent', 'attorney', 'bond_originator'].includes(role)) {
    return
  }

  let rows = []
  if (role === 'developer') {
    rows = await fetchTransactionsData({ developmentId: null })
  } else {
    rows = await fetchTransactionsByParticipant({ userId, roleType: role })
  }

  const now = Date.now()
  const staleRows = rows
    .filter((row) => row?.transaction)
    .map((row) => {
      const updatedAt = new Date(row?.transaction?.updated_at || row?.transaction?.created_at || 0).getTime()
      const daysSinceUpdate = Number.isFinite(updatedAt) ? Math.floor((now - updatedAt) / (1000 * 60 * 60 * 24)) : 0
      const missingCount = Number(row?.documentSummary?.missingCount || 0)
      return {
        row,
        daysSinceUpdate,
        missingCount,
      }
    })
    .filter((item) => item.missingCount > 0 && item.daysSinceUpdate >= 3)
    .sort((left, right) => right.daysSinceUpdate - left.daysSinceUpdate)
    .slice(0, 5)

  for (const item of staleRows) {
    const transactionId = item.row?.transaction?.id
    if (!transactionId) {
      continue
    }

    const dedupeDay = new Date().toISOString().slice(0, 10)
    await createTransactionNotificationIfPossible(client, {
      transactionId,
      userId,
      roleType: role,
      notificationType: 'overdue_missing_docs',
      title: 'Missing documents reminder',
      message: `${item.missingCount} required document${item.missingCount === 1 ? '' : 's'} still outstanding for Unit ${item.row?.unit?.unit_number || '-'}.`,
      eventType: 'TransactionUpdated',
      eventData: {
        daysSinceUpdate: item.daysSinceUpdate,
        missingDocuments: item.missingCount,
        trigger: 'overdue_missing_docs',
      },
      dedupeKey: `overdue-missing-docs:${transactionId}:${userId}:${dedupeDay}`,
    })
  }
}

async function updateDocumentRequestFromUploadIfPossible(
  client,
  {
    transactionId,
    documentId,
    category,
    documentName,
    documentRequestId = null,
    actorRole = null,
    actorUserId = null,
  } = {},
) {
  if (!transactionId || !documentId) {
    return null
  }

  const normalizedCategory = String(category || '').trim().toLowerCase()
  const normalizedName = String(documentName || '').trim().toLowerCase()

  let requestQuery = client
    .from('document_requests')
    .select(
      'id, transaction_id, category, document_type, title, priority, status, requires_review, requested_document_id, assigned_to_role, created_at',
    )
    .eq('transaction_id', transactionId)

  if (documentRequestId) {
    requestQuery = requestQuery.eq('id', documentRequestId)
  } else {
    requestQuery = requestQuery.in('status', ['requested', 'rejected', 'reviewed'])
  }

  let requestsResult = await requestQuery.order('created_at', { ascending: false })

  if (
    requestsResult.error &&
    (isMissingColumnError(requestsResult.error, 'requires_review') ||
      isMissingColumnError(requestsResult.error, 'requested_document_id'))
  ) {
    requestsResult = await client
      .from('document_requests')
      .select('id, transaction_id, category, document_type, title, priority, status, assigned_to_role, created_at')
      .eq('transaction_id', transactionId)
      .order('created_at', { ascending: false })
  }

  if (requestsResult.error) {
    if (isMissingTableError(requestsResult.error, 'document_requests') || isMissingSchemaError(requestsResult.error)) {
      return null
    }
    throw requestsResult.error
  }

  const requests = (requestsResult.data || []).map((item) => normalizeDocumentRequestRow(item))
  if (!requests.length) {
    return null
  }

  const ranked = requests
    .filter((item) => ['requested', 'rejected', 'reviewed'].includes(item.status))
    .filter((item) => {
      if (documentRequestId) {
        return item.id === documentRequestId
      }
      if (!normalizedCategory && !normalizedName) return true
      const requestCategory = String(item.category || '').trim().toLowerCase()
      const requestType = String(item.documentType || '').trim().toLowerCase()
      const requestTitle = String(item.title || '').trim().toLowerCase()
      return (
        (normalizedCategory && (requestCategory === normalizedCategory || requestType === normalizedCategory || requestTitle.includes(normalizedCategory))) ||
        (normalizedName && (requestType && normalizedName.includes(requestType) || requestTitle && normalizedName.includes(requestTitle)))
      )
    })
    .sort((left, right) => {
      const rank = { required: 3, important: 2, optional: 1 }
      const priorityDelta =
        (rank[normalizeDocumentRequestPriorityValue(right.priority)] || 0) -
        (rank[normalizeDocumentRequestPriorityValue(left.priority)] || 0)
      if (priorityDelta !== 0) return priorityDelta
      return new Date(left.createdAt || 0).getTime() - new Date(right.createdAt || 0).getTime()
    })

  const target = ranked[0]
  if (!target?.id) {
    return null
  }

  const nextStatus = target.requiresReview ? 'uploaded' : 'completed'
  const now = new Date().toISOString()
  const payload = {
    status: nextStatus,
    requested_document_id: documentId,
    completed_at: nextStatus === 'completed' ? now : null,
    rejected_reason: null,
    updated_at: now,
  }

  let update = await client
    .from('document_requests')
    .update(payload)
    .eq('id', target.id)
    .select(
      'id, transaction_id, category, document_type, title, description, priority, due_date, assigned_to_role, assigned_to_user_id, request_group_id, status, requires_review, requested_document_id, created_by, created_by_role, completed_at, rejected_reason, resend_count, last_resent_at, created_at, updated_at',
    )
    .single()

  if (
    update.error &&
    (isMissingColumnError(update.error, 'requested_document_id') ||
      isMissingColumnError(update.error, 'completed_at') ||
      isMissingColumnError(update.error, 'rejected_reason') ||
      isMissingColumnError(update.error, 'updated_at'))
  ) {
    update = await client
      .from('document_requests')
      .update({ status: nextStatus })
      .eq('id', target.id)
      .select('id, transaction_id, category, document_type, title, priority, due_date, assigned_to_role, status, created_at')
      .single()
  }

  if (update.error) {
    if (isMissingTableError(update.error, 'document_requests') || isMissingSchemaError(update.error)) {
      return null
    }
    throw update.error
  }

  const normalizedUpdated = normalizeDocumentRequestRow(update.data)
  await logTransactionEventIfPossible(client, {
    transactionId,
    eventType: 'TransactionUpdated',
    createdBy: actorUserId || null,
    createdByRole: actorRole || null,
    eventData: {
      source: 'document_request_upload_linked',
      requestId: normalizedUpdated.id,
      documentId,
      status: normalizedUpdated.status,
    },
  })

  if (normalizedUpdated.status === 'uploaded' && normalizeRequestRoleScope(normalizedUpdated.assignedToRole) === 'attorney') {
    const targets = await fetchNotificationTargetsByRole(client, {
      transactionId,
      roleTypes: ['attorney'],
    })
    for (const targetUser of targets) {
      await createTransactionNotificationIfPossible(client, {
        transactionId,
        userId: targetUser.userId,
        roleType: targetUser.roleType || 'attorney',
        notificationType: 'document_uploaded',
        title: 'Document uploaded for review',
        message: `${normalizedUpdated.title || 'A document'} was uploaded and is waiting for review.`,
        eventType: 'DocumentUploaded',
        eventData: {
          requestId: normalizedUpdated.id,
          documentId,
          source: 'document_request_upload_linked',
        },
        dedupeKey: `doc-request-upload:${normalizedUpdated.id}:${documentId}:${targetUser.userId}`,
      })
    }
  }

  return normalizedUpdated
}

function summarizeDocumentRequests(rows = []) {
  const summary = {
    total: rows.length,
    openCount: 0,
    completedCount: 0,
    uploadedCount: 0,
    reviewedCount: 0,
    rejectedCount: 0,
    overdueCount: 0,
    requiredOpenCount: 0,
    waitingOnByRole: {},
  }

  const now = Date.now()
  for (const row of rows) {
    const status = normalizeDocumentRequestStatusValue(row?.status)
    const priority = normalizeDocumentRequestPriorityValue(row?.priority)
    const dueDate = row?.dueDate ? new Date(row.dueDate) : null
    const isOpen = ['requested', 'uploaded', 'reviewed', 'rejected'].includes(status)

    if (isOpen) {
      summary.openCount += 1
      const assignedRole = normalizeRequestRoleScope(row?.assignedToRole || row?.assigned_to_role || 'client')
      summary.waitingOnByRole[assignedRole] = (summary.waitingOnByRole[assignedRole] || 0) + 1
      if (priority === 'required') {
        summary.requiredOpenCount += 1
      }
      if (dueDate && !Number.isNaN(dueDate.getTime()) && dueDate.getTime() < now) {
        summary.overdueCount += 1
      }
    }

    if (status === 'completed') summary.completedCount += 1
    if (status === 'uploaded') summary.uploadedCount += 1
    if (status === 'reviewed') summary.reviewedCount += 1
    if (status === 'rejected') summary.rejectedCount += 1
  }

  return summary
}

function summarizeChecklistItems(rows = [], { stageKey = null } = {}) {
  const scoped = stageKey ? rows.filter((item) => item.stage === stageKey) : rows
  const summary = {
    total: scoped.length,
    pendingCount: 0,
    completedCount: 0,
    blockedCount: 0,
    waivedCount: 0,
    requiredPendingCount: 0,
    importantPendingCount: 0,
    optionalPendingCount: 0,
  }

  for (const row of scoped) {
    const status = normalizeChecklistItemStatusValue(row?.status)
    const priority = normalizeDocumentRequestPriorityValue(row?.priority)
    const isPending = ['pending', 'in_progress', 'blocked'].includes(status)

    if (isPending) {
      summary.pendingCount += 1
      if (priority === 'required') summary.requiredPendingCount += 1
      if (priority === 'important') summary.importantPendingCount += 1
      if (priority === 'optional') summary.optionalPendingCount += 1
    }

    if (status === 'completed') summary.completedCount += 1
    if (status === 'blocked') summary.blockedCount += 1
    if (status === 'waived') summary.waivedCount += 1
  }

  return summary
}

async function loadTransactionDocumentRequestsByIds(client, transactionIds = []) {
  const ids = [...new Set((transactionIds || []).filter(Boolean))]
  if (!ids.length) return {}

  let query = await client
    .from('document_requests')
    .select(
      'id, transaction_id, category, document_type, title, description, priority, due_date, assigned_to_role, assigned_to_user_id, request_group_id, status, requires_review, requested_document_id, created_by, created_by_role, completed_at, rejected_reason, resend_count, last_resent_at, created_at, updated_at',
    )
    .in('transaction_id', ids)
    .order('created_at', { ascending: false })

  if (
    query.error &&
    (isMissingColumnError(query.error, 'request_group_id') ||
      isMissingColumnError(query.error, 'assigned_to_user_id') ||
      isMissingColumnError(query.error, 'requested_document_id') ||
      isMissingColumnError(query.error, 'requires_review') ||
      isMissingColumnError(query.error, 'rejected_reason') ||
      isMissingColumnError(query.error, 'resend_count') ||
      isMissingColumnError(query.error, 'last_resent_at'))
  ) {
    query = await client
      .from('document_requests')
      .select(
        'id, transaction_id, category, document_type, title, description, priority, due_date, assigned_to_role, status, created_by, created_by_role, completed_at, created_at',
      )
      .in('transaction_id', ids)
      .order('created_at', { ascending: false })
  }

  if (query.error) {
    if (isMissingTableError(query.error, 'document_requests') || isMissingSchemaError(query.error)) {
      return {}
    }
    throw query.error
  }

  const map = {}
  for (const row of query.data || []) {
    const normalized = normalizeDocumentRequestRow(row)
    if (!map[normalized.transactionId]) {
      map[normalized.transactionId] = []
    }
    map[normalized.transactionId].push(normalized)
  }
  return map
}

async function loadTransactionChecklistItemsByIds(client, transactionIds = []) {
  const ids = [...new Set((transactionIds || []).filter(Boolean))]
  if (!ids.length) return {}

  let query = await client
    .from('transaction_checklist_items')
    .select(
      'id, transaction_id, stage, label, description, status, priority, owner_role, owner_user_id, linked_document_request_id, linked_document_id, auto_rule_key, is_auto_managed, completed_by, completed_at, overridden_by, override_reason, sort_order, created_at, updated_at',
    )
    .in('transaction_id', ids)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (
    query.error &&
    (isMissingColumnError(query.error, 'owner_user_id') ||
      isMissingColumnError(query.error, 'linked_document_request_id') ||
      isMissingColumnError(query.error, 'linked_document_id') ||
      isMissingColumnError(query.error, 'auto_rule_key') ||
      isMissingColumnError(query.error, 'is_auto_managed') ||
      isMissingColumnError(query.error, 'completed_by') ||
      isMissingColumnError(query.error, 'overridden_by') ||
      isMissingColumnError(query.error, 'override_reason'))
  ) {
    query = await client
      .from('transaction_checklist_items')
      .select('id, transaction_id, stage, label, description, status, priority, owner_role, completed_at, sort_order, created_at')
      .in('transaction_id', ids)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
  }

  if (query.error) {
    if (isMissingTableError(query.error, 'transaction_checklist_items') || isMissingSchemaError(query.error)) {
      return {}
    }
    throw query.error
  }

  const map = {}
  for (const row of query.data || []) {
    const normalized = normalizeChecklistItemRow(row)
    if (!map[normalized.transactionId]) {
      map[normalized.transactionId] = []
    }
    map[normalized.transactionId].push(normalized)
  }
  return map
}

async function loadTransactionIssueOverridesByIds(client, transactionIds = []) {
  const ids = [...new Set((transactionIds || []).filter(Boolean))]
  if (!ids.length) return {}

  let query = await client
    .from('transaction_issue_overrides')
    .select('id, transaction_id, issue_type, overridden_by, override_reason, resolve_by, is_active, created_at, updated_at')
    .in('transaction_id', ids)
    .order('created_at', { ascending: false })

  if (
    query.error &&
    (isMissingColumnError(query.error, 'is_active') ||
      isMissingColumnError(query.error, 'override_reason') ||
      isMissingColumnError(query.error, 'resolve_by'))
  ) {
    query = await client
      .from('transaction_issue_overrides')
      .select('id, transaction_id, issue_type, overridden_by, created_at')
      .in('transaction_id', ids)
      .order('created_at', { ascending: false })
  }

  if (query.error) {
    if (isMissingTableError(query.error, 'transaction_issue_overrides') || isMissingSchemaError(query.error)) {
      return {}
    }
    throw query.error
  }

  const map = {}
  for (const row of query.data || []) {
    const normalized = normalizeIssueOverrideRow(row)
    if (!map[normalized.transactionId]) {
      map[normalized.transactionId] = []
    }
    map[normalized.transactionId].push(normalized)
  }
  return map
}

export async function fetchTransactionDocumentRequests(transactionId) {
  const client = requireClient()
  if (!transactionId) return []
  const result = await loadTransactionDocumentRequestsByIds(client, [transactionId])
  return result[transactionId] || []
}

export async function createTransactionDocumentRequests({
  transactionId,
  requests = [],
  requestGroupLabel = null,
  requestGroupDescription = null,
  createdByRole = null,
} = {}) {
  const client = requireClient()
  if (!transactionId) {
    throw new Error('Transaction is required.')
  }
  if (!Array.isArray(requests) || !requests.length) {
    throw new Error('At least one document request is required.')
  }

  const actor = await resolveActiveProfileContext(client)
  const normalizedActorRole = normalizeRoleType(createdByRole || actor.role || 'attorney')
  const createdAt = new Date().toISOString()
  let groupId = null

  if (requests.length > 1 || requestGroupLabel) {
    const groupPayload = {
      transaction_id: transactionId,
      title: normalizeTextValue(requestGroupLabel || 'Document Request Pack'),
      description: normalizeNullableText(requestGroupDescription),
      created_by: actor.userId || null,
      created_by_role: normalizedActorRole,
      created_at: createdAt,
      updated_at: createdAt,
    }

    let groupInsert = await client
      .from('document_request_groups')
      .insert(groupPayload)
      .select('id')
      .single()

    if (
      groupInsert.error &&
      (isMissingColumnError(groupInsert.error, 'created_by') ||
        isMissingColumnError(groupInsert.error, 'created_by_role') ||
        isMissingColumnError(groupInsert.error, 'description') ||
        isMissingColumnError(groupInsert.error, 'updated_at'))
    ) {
      groupInsert = await client
        .from('document_request_groups')
        .insert({
          transaction_id: transactionId,
          title: groupPayload.title,
          created_at: createdAt,
        })
        .select('id')
        .single()
    }

    if (groupInsert.error) {
      if (!isMissingTableError(groupInsert.error, 'document_request_groups')) {
        throw groupInsert.error
      }
    } else {
      groupId = groupInsert.data?.id || null
    }
  }

  const insertRows = requests.map((request, index) => ({
    transaction_id: transactionId,
    category: normalizeTextValue(request.category || 'General'),
    document_type: normalizeTextValue(request.documentType || request.document_type || request.title || `Document ${index + 1}`),
    title: normalizeTextValue(request.title || request.documentType || request.document_type || `Document ${index + 1}`),
    description: normalizeNullableText(request.description),
    priority: normalizeDocumentRequestPriorityValue(request.priority),
    due_date: normalizeOptionalDate(request.dueDate || request.due_date),
    assigned_to_role: normalizeRequestRoleScope(request.assignedToRole || request.assigned_to_role, 'client'),
    assigned_to_user_id: request.assignedToUserId || request.assigned_to_user_id || null,
    request_group_id: groupId,
    status: normalizeDocumentRequestStatusValue(request.status || 'requested'),
    requires_review: request.requiresReview !== false && request.requires_review !== false,
    created_by: actor.userId || null,
    created_by_role: normalizedActorRole,
    resend_count: 0,
    created_at: createdAt,
    updated_at: createdAt,
  }))

  let insert = await client
    .from('document_requests')
    .insert(insertRows)
    .select(
      'id, transaction_id, category, document_type, title, description, priority, due_date, assigned_to_role, assigned_to_user_id, request_group_id, status, requires_review, requested_document_id, created_by, created_by_role, completed_at, rejected_reason, resend_count, last_resent_at, created_at, updated_at',
    )

  if (
    insert.error &&
    (isMissingColumnError(insert.error, 'assigned_to_user_id') ||
      isMissingColumnError(insert.error, 'request_group_id') ||
      isMissingColumnError(insert.error, 'requires_review') ||
      isMissingColumnError(insert.error, 'requested_document_id') ||
      isMissingColumnError(insert.error, 'created_by') ||
      isMissingColumnError(insert.error, 'created_by_role') ||
      isMissingColumnError(insert.error, 'resend_count') ||
      isMissingColumnError(insert.error, 'last_resent_at') ||
      isMissingColumnError(insert.error, 'updated_at'))
  ) {
    insert = await client
      .from('document_requests')
      .insert(
        insertRows.map((row) => ({
          transaction_id: row.transaction_id,
          category: row.category,
          document_type: row.document_type,
          title: row.title,
          description: row.description,
          priority: row.priority,
          due_date: row.due_date,
          assigned_to_role: row.assigned_to_role,
          status: row.status,
          created_at: row.created_at,
        })),
      )
      .select('id, transaction_id, category, document_type, title, description, priority, due_date, assigned_to_role, status, created_at')
  }

  if (insert.error) {
    if (isMissingTableError(insert.error, 'document_requests')) {
      throw new Error('Document request tables are not set up yet. Run sql/schema.sql and refresh.')
    }
    throw insert.error
  }

  await logTransactionEventIfPossible(client, {
    transactionId,
    eventType: 'TransactionUpdated',
    createdBy: actor.userId || null,
    createdByRole: normalizedActorRole,
    eventData: {
      source: 'document_request_created',
      count: insertRows.length,
      requestGroupId: groupId,
    },
  })

  return (insert.data || []).map((row) => normalizeDocumentRequestRow(row))
}

export async function updateTransactionDocumentRequestStatus({
  requestId,
  status,
  rejectedReason = null,
  completedAt = null,
} = {}) {
  const client = requireClient()
  if (!requestId) throw new Error('Request id is required.')

  const normalizedStatus = normalizeDocumentRequestStatusValue(status)
  const now = new Date().toISOString()
  const payload = {
    status: normalizedStatus,
    rejected_reason: normalizedStatus === 'rejected' ? normalizeNullableText(rejectedReason) : null,
    completed_at: normalizedStatus === 'completed' ? completedAt || now : null,
    updated_at: now,
  }

  let update = await client
    .from('document_requests')
    .update(payload)
    .eq('id', requestId)
    .select(
      'id, transaction_id, category, document_type, title, description, priority, due_date, assigned_to_role, assigned_to_user_id, request_group_id, status, requires_review, requested_document_id, created_by, created_by_role, completed_at, rejected_reason, resend_count, last_resent_at, created_at, updated_at',
    )
    .single()

  if (
    update.error &&
    (isMissingColumnError(update.error, 'rejected_reason') ||
      isMissingColumnError(update.error, 'completed_at') ||
      isMissingColumnError(update.error, 'updated_at'))
  ) {
    update = await client
      .from('document_requests')
      .update({
        status: normalizedStatus,
      })
      .eq('id', requestId)
      .select('id, transaction_id, category, document_type, title, description, priority, due_date, assigned_to_role, status, created_at')
      .single()
  }

  if (update.error) {
    if (isMissingTableError(update.error, 'document_requests')) {
      throw new Error('Document request tables are not set up yet. Run sql/schema.sql and refresh.')
    }
    throw update.error
  }

  await logTransactionEventIfPossible(client, {
    transactionId: update.data?.transaction_id || null,
    eventType: 'TransactionUpdated',
    eventData: {
      source: 'document_request_status_updated',
      requestId,
      status: normalizedStatus,
    },
  })

  return normalizeDocumentRequestRow(update.data)
}

export async function resendTransactionDocumentRequest(requestId) {
  const client = requireClient()
  if (!requestId) throw new Error('Request id is required.')

  const now = new Date().toISOString()
  const existing = await client
    .from('document_requests')
    .select('id, resend_count')
    .eq('id', requestId)
    .maybeSingle()
  if (existing.error && !isMissingTableError(existing.error, 'document_requests')) {
    throw existing.error
  }
  const nextResendCount = Number(existing.data?.resend_count || 0) + 1

  let update = await client
    .from('document_requests')
    .update({
      status: 'requested',
      last_resent_at: now,
      resend_count: nextResendCount,
      updated_at: now,
    })
    .eq('id', requestId)
    .select(
      'id, transaction_id, category, document_type, title, description, priority, due_date, assigned_to_role, assigned_to_user_id, request_group_id, status, requires_review, requested_document_id, created_by, created_by_role, completed_at, rejected_reason, resend_count, last_resent_at, created_at, updated_at',
    )
    .single()

  if (
    update.error &&
    (isMissingColumnError(update.error, 'last_resent_at') ||
      isMissingColumnError(update.error, 'resend_count') ||
      isMissingColumnError(update.error, 'updated_at'))
  ) {
    update = await client
      .from('document_requests')
      .update({ status: 'requested' })
      .eq('id', requestId)
      .select('id, transaction_id, category, document_type, title, description, priority, due_date, assigned_to_role, status, created_at')
      .single()
  }

  if (update.error) {
    if (isMissingTableError(update.error, 'document_requests')) {
      throw new Error('Document request tables are not set up yet. Run sql/schema.sql and refresh.')
    }
    throw update.error
  }

  await logTransactionEventIfPossible(client, {
    transactionId: update.data?.transaction_id || null,
    eventType: 'TransactionUpdated',
    eventData: {
      source: 'document_request_resent',
      requestId,
    },
  })

  return normalizeDocumentRequestRow(update.data)
}

export async function fetchTransactionChecklistItems(transactionId) {
  const client = requireClient()
  if (!transactionId) return []
  const result = await loadTransactionChecklistItemsByIds(client, [transactionId])
  return result[transactionId] || []
}

export async function ensureTransactionChecklistItems({
  transactionId,
  stageKey = null,
} = {}) {
  const client = requireClient()
  if (!transactionId) {
    throw new Error('Transaction is required.')
  }

  const transaction = await fetchTransactionRowById(client, transactionId)
  if (!transaction) {
    return []
  }

  const activeStage = normalizeAttorneyStageValue(
    stageKey || resolveAttorneyOperationalStageKey({ transaction }),
    'instruction_received',
  )
  const existingByTransaction = await loadTransactionChecklistItemsByIds(client, [transactionId])
  const existingItems = existingByTransaction[transactionId] || []
  const existingForStage = existingItems.filter((item) => item.stage === activeStage)

  if (existingForStage.length) {
    return existingItems
  }

  const defaults = buildDefaultChecklistItemsForStage({
    transactionId,
    stageKey: activeStage,
  })

  if (!defaults.length) {
    return existingItems
  }

  const now = new Date().toISOString()
  const insertRows = defaults.map((item) => ({
    transaction_id: transactionId,
    stage: normalizeAttorneyStageValue(item.stage),
    label: normalizeTextValue(item.label),
    description: normalizeNullableText(item.description),
    status: normalizeChecklistItemStatusValue(item.status),
    priority: normalizeDocumentRequestPriorityValue(item.priority),
    owner_role: normalizeRequestRoleScope(item.ownerRole, 'attorney'),
    owner_user_id: item.ownerUserId || null,
    linked_document_request_id: item.linkedDocumentRequestId || null,
    linked_document_id: item.linkedDocumentId || null,
    auto_rule_key: normalizeNullableText(item.autoRuleKey),
    is_auto_managed: Boolean(item.isAutoManaged),
    sort_order: Number(item.sortOrder || 0) || 0,
    created_at: now,
    updated_at: now,
  }))

  let insert = await client
    .from('transaction_checklist_items')
    .insert(insertRows)
    .select(
      'id, transaction_id, stage, label, description, status, priority, owner_role, owner_user_id, linked_document_request_id, linked_document_id, auto_rule_key, is_auto_managed, completed_by, completed_at, overridden_by, override_reason, sort_order, created_at, updated_at',
    )

  if (
    insert.error &&
    (isMissingColumnError(insert.error, 'owner_user_id') ||
      isMissingColumnError(insert.error, 'linked_document_request_id') ||
      isMissingColumnError(insert.error, 'linked_document_id') ||
      isMissingColumnError(insert.error, 'auto_rule_key') ||
      isMissingColumnError(insert.error, 'is_auto_managed') ||
      isMissingColumnError(insert.error, 'updated_at'))
  ) {
    insert = await client
      .from('transaction_checklist_items')
      .insert(
        insertRows.map((item) => ({
          transaction_id: item.transaction_id,
          stage: item.stage,
          label: item.label,
          description: item.description,
          status: item.status,
          priority: item.priority,
          owner_role: item.owner_role,
          sort_order: item.sort_order,
          created_at: item.created_at,
        })),
      )
      .select('id, transaction_id, stage, label, description, status, priority, owner_role, completed_at, sort_order, created_at')
  }

  if (insert.error) {
    if (isMissingTableError(insert.error, 'transaction_checklist_items')) {
      return existingItems
    }
    throw insert.error
  }

  const normalizedInserted = (insert.data || []).map((item) => normalizeChecklistItemRow(item))
  await logTransactionEventIfPossible(client, {
    transactionId,
    eventType: 'WorkflowStepUpdated',
    eventData: {
      source: 'checklist_seeded',
      stage: activeStage,
      count: normalizedInserted.length,
    },
  })

  return [...existingItems, ...normalizedInserted]
}

export async function updateTransactionChecklistItem({
  checklistItemId,
  status,
  overrideReason = null,
} = {}) {
  const client = requireClient()
  if (!checklistItemId) throw new Error('Checklist item id is required.')
  const actor = await resolveActiveProfileContext(client)
  const normalizedStatus = normalizeChecklistItemStatusValue(status)
  const now = new Date().toISOString()

  const payload = {
    status: normalizedStatus,
    completed_at: normalizedStatus === 'completed' ? now : null,
    completed_by: normalizedStatus === 'completed' ? actor.userId || null : null,
    overridden_by: ['waived', 'blocked'].includes(normalizedStatus) ? actor.userId || null : null,
    override_reason: ['waived', 'blocked'].includes(normalizedStatus) ? normalizeNullableText(overrideReason) : null,
    updated_at: now,
  }

  let update = await client
    .from('transaction_checklist_items')
    .update(payload)
    .eq('id', checklistItemId)
    .select(
      'id, transaction_id, stage, label, description, status, priority, owner_role, owner_user_id, linked_document_request_id, linked_document_id, auto_rule_key, is_auto_managed, completed_by, completed_at, overridden_by, override_reason, sort_order, created_at, updated_at',
    )
    .single()

  if (
    update.error &&
    (isMissingColumnError(update.error, 'completed_by') ||
      isMissingColumnError(update.error, 'overridden_by') ||
      isMissingColumnError(update.error, 'override_reason') ||
      isMissingColumnError(update.error, 'updated_at'))
  ) {
    update = await client
      .from('transaction_checklist_items')
      .update({ status: normalizedStatus })
      .eq('id', checklistItemId)
      .select('id, transaction_id, stage, label, description, status, priority, owner_role, completed_at, sort_order, created_at')
      .single()
  }

  if (update.error) {
    if (isMissingTableError(update.error, 'transaction_checklist_items')) {
      throw new Error('Checklist tables are not set up yet. Run sql/schema.sql and refresh.')
    }
    throw update.error
  }

  await logTransactionEventIfPossible(client, {
    transactionId: update.data?.transaction_id || null,
    eventType: 'WorkflowStepUpdated',
    createdBy: actor.userId || null,
    createdByRole: actor.role || null,
    eventData: {
      source: 'checklist_item_updated',
      checklistItemId,
      status: normalizedStatus,
    },
  })

  return normalizeChecklistItemRow(update.data)
}

export async function fetchTransactionIssueOverrides(transactionId) {
  const client = requireClient()
  if (!transactionId) return []
  const result = await loadTransactionIssueOverridesByIds(client, [transactionId])
  return result[transactionId] || []
}

export async function upsertTransactionIssueOverride({
  transactionId,
  issueType,
  overrideReason = null,
  resolveBy = null,
  isActive = true,
} = {}) {
  const client = requireClient()
  if (!transactionId) {
    throw new Error('Transaction is required.')
  }
  if (!issueType) {
    throw new Error('Issue type is required.')
  }

  const actor = await resolveActiveProfileContext(client)
  const normalizedIssueType = normalizeIssueTypeValue(issueType)
  const now = new Date().toISOString()
  const payload = {
    transaction_id: transactionId,
    issue_type: normalizedIssueType,
    overridden_by: actor.userId || null,
    override_reason: normalizeNullableText(overrideReason),
    resolve_by: normalizeOptionalDate(resolveBy),
    is_active: Boolean(isActive),
    updated_at: now,
  }

  let upsert = await client
    .from('transaction_issue_overrides')
    .upsert(payload, { onConflict: 'transaction_id,issue_type' })
    .select('id, transaction_id, issue_type, overridden_by, override_reason, resolve_by, is_active, created_at, updated_at')
    .single()

  if (
    upsert.error &&
    (isMissingColumnError(upsert.error, 'override_reason') ||
      isMissingColumnError(upsert.error, 'resolve_by') ||
      isMissingColumnError(upsert.error, 'is_active') ||
      isMissingColumnError(upsert.error, 'updated_at'))
  ) {
    upsert = await client
      .from('transaction_issue_overrides')
      .upsert(
        {
          transaction_id: transactionId,
          issue_type: normalizedIssueType,
          overridden_by: actor.userId || null,
        },
        { onConflict: 'transaction_id,issue_type' },
      )
      .select('id, transaction_id, issue_type, overridden_by, created_at')
      .single()
  }

  if (upsert.error) {
    if (isMissingTableError(upsert.error, 'transaction_issue_overrides')) {
      throw new Error('Issue override tables are not set up yet. Run sql/schema.sql and refresh.')
    }
    throw upsert.error
  }

  await logTransactionEventIfPossible(client, {
    transactionId,
    eventType: 'TransactionUpdated',
    createdBy: actor.userId || null,
    createdByRole: actor.role || null,
    eventData: {
      source: 'issue_override_updated',
      issueType: normalizedIssueType,
      isActive: Boolean(isActive),
      resolveBy: payload.resolve_by,
    },
  })

  return normalizeIssueOverrideRow(upsert.data)
}

const TRANSACTION_CHECKLIST_PENDING_STATUSES = new Set(['pending', 'in_progress', 'blocked'])
const REGISTRATION_STAGE_KEYS = new Set(['registration_preparation', 'registered'])
const CLOSEOUT_REQUIRED_DOCUMENT_KEYS = new Set([
  'registration_confirmation',
  'signed_transfer_documents',
  'financial_settlement_documents',
])

function hasLifecycleWritePermission(role) {
  const normalized = normalizeRoleType(role || null)
  return ['attorney', 'developer', 'internal_admin'].includes(normalized)
}

function hasLifecycleAdminPermission(role) {
  const normalized = normalizeRoleType(role || null)
  return ['developer', 'internal_admin'].includes(normalized)
}

function isRegistrationConfirmationDocument(document = {}) {
  const signal = `${document?.document_type || ''} ${document?.category || ''} ${document?.name || ''}`.toLowerCase()
  return /registration/.test(signal)
}

async function loadTransactionLifecycleContext(client, transactionId, { ensureRegisteredChecklist = false } = {}) {
  const transaction = await fetchTransactionRowById(client, transactionId)
  if (!transaction) {
    throw new Error('Transaction not found.')
  }

  const lifecycleState = normalizeTransactionLifecycleStateValue(
    transaction?.lifecycle_state,
    transaction?.current_main_stage === 'REG' ? 'registered' : 'active',
  )

  if (ensureRegisteredChecklist) {
    try {
      await ensureTransactionChecklistItems({ transactionId, stageKey: 'registered' })
    } catch (error) {
      if (!isMissingSchemaError(error)) {
        throw error
      }
    }
  }

  const [documents, requestsByTransactionId, checklistByTransactionId, closeout] = await Promise.all([
    loadSharedDocuments(client, { transactionIds: [transactionId], viewer: 'internal' }),
    loadTransactionDocumentRequestsByIds(client, [transactionId]),
    loadTransactionChecklistItemsByIds(client, [transactionId]),
    fetchTransactionAttorneyCloseout(transactionId).catch((error) => {
      if (isMissingSchemaError(error)) return null
      throw error
    }),
  ])

  const documentRequests = requestsByTransactionId[transactionId] || []
  const checklistItems = checklistByTransactionId[transactionId] || []
  const operationalRow = {
    transaction,
    documentRequests,
    transactionChecklistItems: checklistItems,
  }
  const operationalState = deriveAttorneyOperationalStateForRow(operationalRow)

  return {
    transaction,
    lifecycleState,
    documents,
    closeout,
    documentRequests,
    checklistItems,
    operationalState,
  }
}

function buildRegistrationBlockers({
  context,
  registrationDate = null,
  titleDeedNumber = '',
  registrationConfirmationDocumentId = null,
} = {}) {
  const blockers = []
  const transaction = context?.transaction || null
  const stageKey = context?.operationalState?.stageKey || resolveAttorneyOperationalStageKey({ transaction })
  const lifecycleState = context?.lifecycleState || 'active'
  const registrationDateValue = registrationDate || transaction?.registration_date || null
  const titleDeedNumberValue = String(titleDeedNumber || transaction?.title_deed_number || '').trim()
  const allChecklistItems = context?.checklistItems || []
  const requiredPendingChecklist = allChecklistItems.filter(
    (item) =>
      normalizeDocumentRequestPriorityValue(item.priority) === 'required' &&
      TRANSACTION_CHECKLIST_PENDING_STATUSES.has(normalizeChecklistItemStatusValue(item.status)),
  )
  const requestedDocumentId =
    registrationConfirmationDocumentId ||
    transaction?.registration_confirmation_document_id ||
    context?.documents?.find((document) => isRegistrationConfirmationDocument(document))?.id ||
    null

  if (['archived', 'cancelled'].includes(lifecycleState)) {
    blockers.push({
      key: 'lifecycle_state',
      label: 'Lifecycle state does not allow registration',
      description: `This transaction is currently ${lifecycleState}. Unarchive or reopen it first.`,
    })
  }

  if (!REGISTRATION_STAGE_KEYS.has(stageKey)) {
    blockers.push({
      key: 'stage_position',
      label: 'Incorrect stage for registration',
      description: 'Move the file to Registration Preparation before marking it as Registered.',
    })
  }

  if (requiredPendingChecklist.length > 0) {
    blockers.push({
      key: 'required_checklist',
      label: 'Required checklist items are still pending',
      description: `${requiredPendingChecklist.length} required checklist item(s) must be completed first.`,
    })
  }

  if (!registrationDateValue) {
    blockers.push({
      key: 'registration_date',
      label: 'Registration date is required',
      description: 'Capture the legal registration date before completing registration.',
    })
  }

  if (!titleDeedNumberValue) {
    blockers.push({
      key: 'title_deed_number',
      label: 'Title deed number is required',
      description: 'Capture the title deed number before completing registration.',
    })
  }

  if (!requestedDocumentId) {
    blockers.push({
      key: 'registration_confirmation_document',
      label: 'Registration confirmation document is required',
      description: 'Upload a registration confirmation document before marking this file as Registered.',
    })
  }

  return {
    blockers,
    requestedDocumentId,
    stageKey,
    lifecycleState,
    requiredPendingChecklistCount: requiredPendingChecklist.length,
  }
}

export async function getRegistrationBlockers({
  transactionId,
  registrationDate = null,
  titleDeedNumber = '',
  registrationConfirmationDocumentId = null,
} = {}) {
  const client = requireClient()
  if (!transactionId) {
    throw new Error('Transaction is required.')
  }

  const context = await loadTransactionLifecycleContext(client, transactionId)
  const validation = buildRegistrationBlockers({
    context,
    registrationDate,
    titleDeedNumber,
    registrationConfirmationDocumentId,
  })

  return {
    canMarkRegistered: validation.blockers.length === 0,
    blockers: validation.blockers,
    stageKey: validation.stageKey,
    lifecycleState: validation.lifecycleState,
    registrationConfirmationDocumentId: validation.requestedDocumentId,
  }
}

export async function markTransactionRegistered({
  transactionId,
  registrationDate,
  titleDeedNumber,
  registrationConfirmationDocumentId = null,
} = {}) {
  const client = requireClient()
  if (!transactionId) {
    throw new Error('Transaction is required.')
  }

  const actorProfile = await resolveActiveProfileContext(client)
  if (!hasLifecycleWritePermission(actorProfile.role)) {
    throw new Error('Your role does not have permission to register this transaction.')
  }

  const context = await loadTransactionLifecycleContext(client, transactionId)
  const validation = buildRegistrationBlockers({
    context,
    registrationDate,
    titleDeedNumber,
    registrationConfirmationDocumentId,
  })
  if (validation.blockers.length > 0) {
    throw new Error(validation.blockers.map((item) => item.label).join(' • '))
  }

  const now = new Date().toISOString()
  const normalizedRegistrationDate = normalizeOptionalDate(registrationDate || context.transaction.registration_date || now)
  const normalizedTitleDeedNumber = normalizeTextValue(titleDeedNumber || context.transaction.title_deed_number)

  const updatePayload = {
    stage: 'Registered',
    current_main_stage: 'REG',
    lifecycle_state: 'registered',
    attorney_stage: 'registered',
    registration_date: normalizedRegistrationDate,
    title_deed_number: normalizedTitleDeedNumber,
    registration_confirmation_document_id: validation.requestedDocumentId,
    registered_by_user_id: actorProfile.userId || null,
    registered_at: context.transaction.registered_at || now,
    cancelled_at: null,
    cancelled_by_user_id: null,
    cancelled_reason: null,
    archived_at: null,
    archived_by_user_id: null,
    archive_reason: null,
    is_active: true,
    last_meaningful_activity_at: now,
    updated_at: now,
  }

  const updateResult = await client.from('transactions').update(updatePayload).eq('id', transactionId)
  if (updateResult.error) {
    if (
      isMissingColumnError(updateResult.error, 'lifecycle_state') ||
      isMissingColumnError(updateResult.error, 'registration_date') ||
      isMissingColumnError(updateResult.error, 'title_deed_number')
    ) {
      throw new Error('Registration lifecycle columns are not set up yet. Run sql/schema.sql and refresh.')
    }
    throw updateResult.error
  }

  await logTransactionEventIfPossible(client, {
    transactionId,
    eventType: 'TransactionStageChanged',
    createdBy: actorProfile.userId || null,
    createdByRole: actorProfile.role || null,
    eventData: {
      source: 'registration_flow',
      action: 'marked_registered',
      stage: 'Registered',
      registrationDate: normalizedRegistrationDate,
      titleDeedNumber: normalizedTitleDeedNumber,
      registrationConfirmationDocumentId: validation.requestedDocumentId,
    },
  })

  await notifyRolesForTransaction(client, {
    transactionId,
    roleTypes: ['attorney', 'developer', 'agent'],
    title: 'Transaction Registered',
    message: 'The transaction has been marked as Registered.',
    notificationType: 'registration_completed',
    eventType: 'TransactionStageChanged',
    eventData: {
      action: 'registered',
      registrationDate: normalizedRegistrationDate,
    },
    dedupePrefix: 'registration-completed',
    excludeUserId: actorProfile.userId || null,
  })

  return fetchTransactionById(transactionId)
}

export async function undoTransactionRegistration({
  transactionId,
  reason = '',
} = {}) {
  const client = requireClient()
  if (!transactionId) {
    throw new Error('Transaction is required.')
  }

  const actorProfile = await resolveActiveProfileContext(client)
  if (!hasLifecycleAdminPermission(actorProfile.role)) {
    throw new Error('Only admin-level users can undo registration.')
  }

  const context = await loadTransactionLifecycleContext(client, transactionId)
  if (context.lifecycleState !== 'registered' && context.lifecycleState !== 'completed' && context.operationalState.stageKey !== 'registered') {
    throw new Error('This transaction is not currently registered.')
  }
  const reversalReason = normalizeTextValue(reason)
  if (!reversalReason) {
    throw new Error('A registration reversal reason is required.')
  }

  const now = new Date().toISOString()
  const updatePayload = {
    stage: 'Transfer in Progress',
    current_main_stage: 'XFER',
    lifecycle_state: 'active',
    attorney_stage: 'registration_preparation',
    registration_reversed_at: now,
    registration_reversed_by_user_id: actorProfile.userId || null,
    registration_reversal_reason: reversalReason,
    registration_date: null,
    title_deed_number: null,
    registration_confirmation_document_id: null,
    registered_by_user_id: null,
    registered_at: null,
    completed_at: null,
    completed_by_user_id: null,
    archived_at: null,
    archived_by_user_id: null,
    archive_reason: null,
    cancelled_at: null,
    cancelled_by_user_id: null,
    cancelled_reason: null,
    is_active: true,
    last_meaningful_activity_at: now,
    updated_at: now,
  }

  const updateResult = await client.from('transactions').update(updatePayload).eq('id', transactionId)
  if (updateResult.error) {
    if (
      isMissingColumnError(updateResult.error, 'lifecycle_state') ||
      isMissingColumnError(updateResult.error, 'registration_reversed_at')
    ) {
      throw new Error('Registration lifecycle columns are not set up yet. Run sql/schema.sql and refresh.')
    }
    throw updateResult.error
  }

  await logTransactionEventIfPossible(client, {
    transactionId,
    eventType: 'TransactionStageChanged',
    createdBy: actorProfile.userId || null,
    createdByRole: actorProfile.role || null,
    eventData: {
      source: 'registration_flow',
      action: 'registration_reversed',
      reason: reversalReason,
    },
  })

  return fetchTransactionById(transactionId)
}

function getMissingCloseoutDocumentKeys(closeout = null) {
  if (!closeout?.documents?.length) {
    return [...CLOSEOUT_REQUIRED_DOCUMENT_KEYS]
  }

  const uploadedKeys = new Set(
    closeout.documents
      .filter((item) => ['uploaded', 'accepted'].includes(normalizeRequiredStatus(item.status)))
      .map((item) => item.key),
  )
  return [...CLOSEOUT_REQUIRED_DOCUMENT_KEYS].filter((key) => !uploadedKeys.has(key))
}

function getPendingRegisteredChecklistItems(checklistItems = []) {
  return checklistItems.filter(
    (item) =>
      normalizeAttorneyStageValue(item.stage) === 'registered' &&
      normalizeDocumentRequestPriorityValue(item.priority) === 'required' &&
      TRANSACTION_CHECKLIST_PENDING_STATUSES.has(normalizeChecklistItemStatusValue(item.status)),
  )
}

export async function getCompletionBlockers(transactionId) {
  const client = requireClient()
  if (!transactionId) {
    throw new Error('Transaction is required.')
  }

  const context = await loadTransactionLifecycleContext(client, transactionId, {
    ensureRegisteredChecklist: true,
  })
  const blockers = []

  if (!['registered', 'completed', 'archived'].includes(context.lifecycleState)) {
    blockers.push({
      key: 'must_be_registered',
      label: 'Transaction must be registered first',
      description: 'Complete the registration flow before marking this file as Completed.',
    })
  }

  const missingCloseoutKeys = getMissingCloseoutDocumentKeys(context.closeout)
  if (missingCloseoutKeys.length > 0) {
    blockers.push({
      key: 'closeout_documents_missing',
      label: 'Required close-out documents are missing',
      description: `${missingCloseoutKeys.length} required close-out document type(s) are still missing.`,
      metadata: { missingCloseoutKeys },
    })
  }

  const pendingRegisteredChecklist = getPendingRegisteredChecklistItems(context.checklistItems)
  if (pendingRegisteredChecklist.length > 0) {
    blockers.push({
      key: 'post_registration_tasks_pending',
      label: 'Post-registration tasks are still pending',
      description: `${pendingRegisteredChecklist.length} required post-registration checklist item(s) remain incomplete.`,
    })
  }

  return {
    canMarkCompleted: blockers.length === 0,
    blockers,
    lifecycleState: context.lifecycleState,
    closeoutStatus: context.closeout?.closeOutStatus || context.closeout?.close_out_status || 'not_started',
  }
}

export async function markTransactionCompleted(transactionId) {
  const client = requireClient()
  if (!transactionId) {
    throw new Error('Transaction is required.')
  }

  const actorProfile = await resolveActiveProfileContext(client)
  if (!hasLifecycleWritePermission(actorProfile.role)) {
    throw new Error('Your role does not have permission to complete this transaction.')
  }

  const completion = await getCompletionBlockers(transactionId)
  if (!completion.canMarkCompleted) {
    throw new Error(completion.blockers.map((item) => item.label).join(' • '))
  }

  const now = new Date().toISOString()
  const updatePayload = {
    stage: 'Registered',
    current_main_stage: 'REG',
    lifecycle_state: 'completed',
    attorney_stage: 'registered',
    completed_at: now,
    completed_by_user_id: actorProfile.userId || null,
    archived_at: null,
    archived_by_user_id: null,
    archive_reason: null,
    cancelled_at: null,
    cancelled_by_user_id: null,
    cancelled_reason: null,
    is_active: true,
    last_meaningful_activity_at: now,
    updated_at: now,
  }

  const updateResult = await client.from('transactions').update(updatePayload).eq('id', transactionId)
  if (updateResult.error) {
    if (
      isMissingColumnError(updateResult.error, 'lifecycle_state') ||
      isMissingColumnError(updateResult.error, 'completed_at')
    ) {
      throw new Error('Completion lifecycle columns are not set up yet. Run sql/schema.sql and refresh.')
    }
    throw updateResult.error
  }

  await logTransactionEventIfPossible(client, {
    transactionId,
    eventType: 'TransactionUpdated',
    createdBy: actorProfile.userId || null,
    createdByRole: actorProfile.role || null,
    eventData: {
      source: 'completion_flow',
      action: 'marked_completed',
    },
  })

  return fetchTransactionById(transactionId)
}

export async function archiveTransactionLifecycle({
  transactionId,
  reason = '',
} = {}) {
  const client = requireClient()
  if (!transactionId) {
    throw new Error('Transaction is required.')
  }

  const actorProfile = await resolveActiveProfileContext(client)
  if (!hasLifecycleWritePermission(actorProfile.role)) {
    throw new Error('Your role does not have permission to archive this transaction.')
  }

  const context = await loadTransactionLifecycleContext(client, transactionId)
  if (!['registered', 'completed'].includes(context.lifecycleState)) {
    throw new Error('Only Registered or Completed transactions can be archived.')
  }

  const now = new Date().toISOString()
  const updatePayload = {
    lifecycle_state: 'archived',
    archived_at: now,
    archived_by_user_id: actorProfile.userId || null,
    archive_reason: normalizeNullableText(reason),
    updated_at: now,
  }

  const updateResult = await client.from('transactions').update(updatePayload).eq('id', transactionId)
  if (updateResult.error) {
    if (
      isMissingColumnError(updateResult.error, 'lifecycle_state') ||
      isMissingColumnError(updateResult.error, 'archived_at')
    ) {
      throw new Error('Archive lifecycle columns are not set up yet. Run sql/schema.sql and refresh.')
    }
    throw updateResult.error
  }

  await logTransactionEventIfPossible(client, {
    transactionId,
    eventType: 'TransactionUpdated',
    createdBy: actorProfile.userId || null,
    createdByRole: actorProfile.role || null,
    eventData: {
      source: 'archive_flow',
      action: 'archived',
      reason: normalizeNullableText(reason),
    },
  })

  return fetchTransactionById(transactionId)
}

export async function unarchiveTransactionLifecycle(transactionId) {
  const client = requireClient()
  if (!transactionId) {
    throw new Error('Transaction is required.')
  }

  const actorProfile = await resolveActiveProfileContext(client)
  if (!hasLifecycleWritePermission(actorProfile.role)) {
    throw new Error('Your role does not have permission to unarchive this transaction.')
  }

  const context = await loadTransactionLifecycleContext(client, transactionId)
  if (context.lifecycleState !== 'archived') {
    throw new Error('This transaction is not archived.')
  }

  const nextState = context.transaction?.completed_at
    ? 'completed'
    : context.transaction?.registered_at || context.transaction?.current_main_stage === 'REG'
      ? 'registered'
      : 'active'

  const now = new Date().toISOString()
  const updatePayload = {
    lifecycle_state: nextState,
    archived_at: null,
    archived_by_user_id: null,
    archive_reason: null,
    updated_at: now,
  }

  const updateResult = await client.from('transactions').update(updatePayload).eq('id', transactionId)
  if (updateResult.error) {
    if (
      isMissingColumnError(updateResult.error, 'lifecycle_state') ||
      isMissingColumnError(updateResult.error, 'archived_at')
    ) {
      throw new Error('Archive lifecycle columns are not set up yet. Run sql/schema.sql and refresh.')
    }
    throw updateResult.error
  }

  await logTransactionEventIfPossible(client, {
    transactionId,
    eventType: 'TransactionUpdated',
    createdBy: actorProfile.userId || null,
    createdByRole: actorProfile.role || null,
    eventData: {
      source: 'archive_flow',
      action: 'unarchived',
      nextState,
    },
  })

  return fetchTransactionById(transactionId)
}

export async function cancelTransactionLifecycle({
  transactionId,
  reason = '',
} = {}) {
  const client = requireClient()
  if (!transactionId) {
    throw new Error('Transaction is required.')
  }

  const actorProfile = await resolveActiveProfileContext(client)
  if (!hasLifecycleWritePermission(actorProfile.role)) {
    throw new Error('Your role does not have permission to cancel this transaction.')
  }

  const cancellationReason = normalizeTextValue(reason)
  if (!cancellationReason) {
    throw new Error('A cancellation reason is required.')
  }

  const now = new Date().toISOString()
  const updatePayload = {
    lifecycle_state: 'cancelled',
    cancelled_at: now,
    cancelled_by_user_id: actorProfile.userId || null,
    cancelled_reason: cancellationReason,
    archived_at: null,
    archived_by_user_id: null,
    archive_reason: null,
    updated_at: now,
  }

  const updateResult = await client.from('transactions').update(updatePayload).eq('id', transactionId)
  if (updateResult.error) {
    if (
      isMissingColumnError(updateResult.error, 'lifecycle_state') ||
      isMissingColumnError(updateResult.error, 'cancelled_at')
    ) {
      throw new Error('Cancellation lifecycle columns are not set up yet. Run sql/schema.sql and refresh.')
    }
    throw updateResult.error
  }

  await logTransactionEventIfPossible(client, {
    transactionId,
    eventType: 'TransactionUpdated',
    createdBy: actorProfile.userId || null,
    createdByRole: actorProfile.role || null,
    eventData: {
      source: 'cancellation_flow',
      action: 'cancelled',
      reason: cancellationReason,
    },
  })

  return fetchTransactionById(transactionId)
}

export async function getFinalReportData(transactionId) {
  if (!transactionId) {
    throw new Error('Transaction is required.')
  }

  const detail = await fetchTransactionById(transactionId)
  if (!detail?.transaction) {
    return null
  }

  const now = new Date().toISOString()
  const lifecycleState = normalizeTransactionLifecycleStateValue(
    detail.transaction.lifecycle_state,
    detail.transaction.current_main_stage === 'REG' ? 'registered' : 'active',
  )

  return {
    generatedAt: now,
    transactionId,
    lifecycleState,
    transaction: {
      reference: detail.transaction.transaction_reference || `TRX-${String(detail.transaction.id || '').slice(0, 8).toUpperCase()}`,
      stage: detail.transaction.stage || null,
      currentMainStage: detail.transaction.current_main_stage || null,
      nextAction: detail.transaction.next_action || null,
      riskStatus: detail.transaction.risk_status || null,
      purchasePrice: detail.transaction.purchase_price || detail.transaction.sales_price || null,
    },
    registration: {
      registrationDate: detail.transaction.registration_date || null,
      titleDeedNumber: detail.transaction.title_deed_number || null,
      registeredAt: detail.transaction.registered_at || null,
      completedAt: detail.transaction.completed_at || null,
      archivedAt: detail.transaction.archived_at || null,
      cancelledAt: detail.transaction.cancelled_at || null,
    },
    stakeholders: {
      buyer: detail.buyer || null,
      seller: {
        name: detail.transaction.seller_name || null,
        email: detail.transaction.seller_email || null,
        phone: detail.transaction.seller_phone || null,
      },
      attorney: detail.transaction.attorney || null,
      agent: detail.transaction.assigned_agent || null,
      bondOriginator: detail.transaction.bond_originator || null,
    },
    documents: (detail.documents || []).map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      documentType: item.document_type || null,
      visibility: item.visibility_scope || 'internal',
      uploadedByRole: item.uploaded_by_role || null,
      createdAt: item.created_at || null,
      url: item.url || null,
    })),
    timeline: [
      ...(detail.transactionEvents || []).map((item) => ({
        id: item.id,
        type: item.eventType || item.event_type || 'TransactionUpdated',
        payload: item.eventData || item.event_data || {},
        createdAt: item.createdAt || item.created_at || null,
      })),
      ...(detail.transactionDiscussion || []).map((item) => ({
        id: item.id,
        type: 'CommentAdded',
        payload: {
          authorName: item.authorName || item.author_name || null,
          authorRole: item.authorRole || item.author_role || null,
          body: item.commentBody || item.commentText || item.comment_text || '',
        },
        createdAt: item.createdAt || item.created_at || null,
      })),
    ]
      .sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime())
      .slice(0, 100),
  }
}

export async function fetchMyNotifications({ limit = 25, unreadOnly = false } = {}) {
  const client = requireClient()
  const activeProfile = await resolveActiveProfileContext(client)
  if (!activeProfile.userId) {
    return { notifications: [], unreadCount: 0 }
  }

  await runOverdueMissingDocsReminderAutomation(client, {
    userId: activeProfile.userId,
    role: activeProfile.role,
  })

  let query = client
    .from('transaction_notifications')
    .select(
      'id, transaction_id, user_id, role_type, notification_type, title, message, is_read, read_at, dedupe_key, event_type, event_data, created_at, updated_at',
    )
    .eq('user_id', activeProfile.userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (unreadOnly) {
    query = query.eq('is_read', false)
  }

  const listQuery = await query
  if (listQuery.error) {
    if (isMissingTableError(listQuery.error, 'transaction_notifications')) {
      return { notifications: [], unreadCount: 0 }
    }
    throw listQuery.error
  }

  const unreadQuery = await client
    .from('transaction_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', activeProfile.userId)
    .eq('is_read', false)

  const unreadCount = unreadQuery.error ? 0 : Number(unreadQuery.count || 0)
  const notifications = (listQuery.data || []).map((row) => normalizeNotificationRow(row))
  const transactionIds = [...new Set(notifications.map((item) => item.transactionId).filter(Boolean))]
  let unitIdByTransactionId = {}

  if (transactionIds.length) {
    const unitLookup = await client.from('transactions').select('id, unit_id').in('id', transactionIds)
    if (!unitLookup.error) {
      unitIdByTransactionId = (unitLookup.data || []).reduce((accumulator, row) => {
        if (row?.id) {
          accumulator[row.id] = row.unit_id || null
        }
        return accumulator
      }, {})
    }
  }

  return {
    notifications: notifications.map((notification) => ({
      ...notification,
      unitId: unitIdByTransactionId[notification.transactionId] || notification.eventData?.unitId || null,
    })),
    unreadCount,
  }
}

export async function markNotificationRead(notificationId) {
  const client = requireClient()
  if (!notificationId) {
    return null
  }

  const activeProfile = await resolveActiveProfileContext(client)
  if (!activeProfile.userId) {
    return null
  }

  const updateQuery = await client
    .from('transaction_notifications')
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', notificationId)
    .eq('user_id', activeProfile.userId)
    .select(
      'id, transaction_id, user_id, role_type, notification_type, title, message, is_read, read_at, dedupe_key, event_type, event_data, created_at, updated_at',
    )
    .maybeSingle()

  if (updateQuery.error) {
    if (isMissingTableError(updateQuery.error, 'transaction_notifications')) {
      return null
    }
    throw updateQuery.error
  }

  return updateQuery.data ? normalizeNotificationRow(updateQuery.data) : null
}

export async function markAllNotificationsRead() {
  const client = requireClient()
  const activeProfile = await resolveActiveProfileContext(client)
  if (!activeProfile.userId) {
    return 0
  }

  const updateQuery = await client
    .from('transaction_notifications')
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', activeProfile.userId)
    .eq('is_read', false)
    .select('id')

  if (updateQuery.error) {
    if (isMissingTableError(updateQuery.error, 'transaction_notifications')) {
      return 0
    }
    throw updateQuery.error
  }

  return (updateQuery.data || []).length
}

async function resolveOnboardingTokenContext(client, token) {
  const normalizedToken = String(token || '').trim()
  if (!normalizedToken) {
    throw new Error('Onboarding token is required.')
  }

  const rowSelect =
    'id, transaction_id, token, status, purchaser_type, submitted_at, is_active, created_at, updated_at'
  const { data, error } = await client
    .from('transaction_onboarding')
    .select(rowSelect)
    .eq('token', normalizedToken)
    .eq('is_active', true)
    .maybeSingle()

  if (error) {
    if (isMissingTableError(error, 'transaction_onboarding')) {
      throw new Error('Transaction onboarding is not set up yet. Run sql/schema.sql first.')
    }

    throw error
  }

  if (data) {
    return normalizeOnboardingRow(data)
  }

  throw new Error('Onboarding link is invalid or inactive.')
}

async function fetchUnitsBase(client, developmentId = null) {
  let query = client
    .from('units')
    .select(
      'id, development_id, unit_number, unit_label, phase, block, unit_type, bedrooms, bathrooms, parking_count, size_sqm, list_price, current_price, price, status, vat_applicable, floorplan_id, notes, development:developments(id, name)',
    )

  if (developmentId && developmentId !== 'all') {
    query = query.eq('development_id', developmentId)
  }

  let result = await query.order('unit_number', { ascending: true })

  if (
    result.error &&
    (isMissingColumnError(result.error, 'unit_label') || isMissingColumnError(result.error, 'list_price'))
  ) {
    result = await client
      .from('units')
      .select('id, development_id, unit_number, phase, price, status, development:developments(id, name)')
      .order('unit_number', { ascending: true })

    if (developmentId && developmentId !== 'all') {
      result = await client
        .from('units')
        .select('id, development_id, unit_number, phase, price, status, development:developments(id, name)')
        .eq('development_id', developmentId)
        .order('unit_number', { ascending: true })
    }
  }

  const { data, error } = result

  if (error) {
    throw error
  }

  return (data || []).map((row) => ({
    ...row,
    ...normalizeDevelopmentUnitRow(row),
  }))
}

async function fetchUnitsByIds(client, unitIds = [], developmentId = null) {
  const uniqueUnitIds = [...new Set((unitIds || []).filter(Boolean))]
  if (!uniqueUnitIds.length) {
    return []
  }

  let query = client
    .from('units')
    .select(
      'id, development_id, unit_number, unit_label, phase, block, unit_type, bedrooms, bathrooms, parking_count, size_sqm, list_price, current_price, price, status, vat_applicable, floorplan_id, notes, development:developments(id, name)',
    )
    .in('id', uniqueUnitIds)

  if (developmentId && developmentId !== 'all') {
    query = query.eq('development_id', developmentId)
  }

  let result = await query.order('unit_number', { ascending: true })

  if (
    result.error &&
    (isMissingColumnError(result.error, 'unit_label') || isMissingColumnError(result.error, 'list_price'))
  ) {
    let fallback = client
      .from('units')
      .select('id, development_id, unit_number, phase, price, status, development:developments(id, name)')
      .in('id', uniqueUnitIds)

    if (developmentId && developmentId !== 'all') {
      fallback = fallback.eq('development_id', developmentId)
    }

    result = await fallback.order('unit_number', { ascending: true })
  }

  const { data, error } = result
  if (error) {
    throw error
  }

  return (data || []).map((row) => ({
    ...row,
    ...normalizeDevelopmentUnitRow(row),
  }))
}

async function fetchActiveTransactionUnitIds(client, developmentId = null) {
  let query = client
    .from('transactions')
    .select('id, unit_id, stage, is_active, updated_at, created_at')
    .not('unit_id', 'is', null)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })

  if (developmentId && developmentId !== 'all') {
    query = query.eq('development_id', developmentId)
  }

  let result = await query

  if (
    result.error &&
    (isMissingColumnError(result.error, 'is_active') || isMissingColumnError(result.error, 'development_id'))
  ) {
    let fallback = client
      .from('transactions')
      .select('id, unit_id, stage, updated_at, created_at')
      .not('unit_id', 'is', null)
      .order('updated_at', { ascending: false })

    if (developmentId && developmentId !== 'all') {
      fallback = fallback.eq('development_id', developmentId)
    }

    result = await fallback
  }

  if (result.error) {
    throw result.error
  }

  const rows = (result.data || []).filter((item) => {
    if (item?.is_active === false) {
      return false
    }
    return normalizeStage(item?.stage, null) !== 'Available'
  })

  return [...new Set(rows.map((item) => item.unit_id).filter(Boolean))]
}

async function hydrateUnitRows(client, units, { includeOperationalSignals = true } = {}) {
  if (!units.length) {
    return []
  }

  const unitIds = units.map((unit) => unit.id)
  const transactions = await fetchActiveTransactionsForUnitIds(client, unitIds)

  const latestByUnit = {}
  for (const transaction of transactions) {
    if (!latestByUnit[transaction.unit_id]) {
      latestByUnit[transaction.unit_id] = transaction
    }
  }

  const buyerIds = [...new Set(transactions.map((transaction) => transaction.buyer_id).filter(Boolean))]
  let buyersById = {}

  if (buyerIds.length) {
    const buyersQuery = await client
      .from('buyers')
      .select(selectWithoutKnownMissingColumns('id, name, phone, email'))
      .in('id', buyerIds)

    const { data: buyers, error: buyersError } = buyersQuery

    if (buyersError) {
      throw buyersError
    }

    buyersById = buyers.reduce((accumulator, buyer) => {
      accumulator[buyer.id] = buyer
      return accumulator
    }, {})
  }

  const rows = units.map((unit) => {
    const transaction = latestByUnit[unit.id] || null
    const buyer = transaction?.buyer_id ? buyersById[transaction.buyer_id] || null : null
    const stage = normalizeStage(transaction?.stage, unit.status)

    return {
      unit,
      development: unit.development,
      transaction,
      buyer,
      stage,
      mainStage: normalizeMainStage(transaction?.current_main_stage, stage),
    }
  })

  if (!includeOperationalSignals) {
    return rows.sort(byDevelopmentThenUnit)
  }

  const transactionIds = rows.map((row) => row.transaction?.id).filter(Boolean)
  const transactionIdByUnitId = rows.reduce((accumulator, row) => {
    if (row.transaction?.id) {
      accumulator[row.unit.id] = row.transaction.id
    }
    return accumulator
  }, {})

  let handoverRows = []
  if (transactionIds.length) {
    const handoverQuery = await client
      .from('transaction_handover')
      .select(TRANSACTION_HANDOVER_SELECT)
      .in('transaction_id', transactionIds)
      .order('updated_at', { ascending: false })

    if (handoverQuery.error) {
      if (!isMissingTableError(handoverQuery.error, 'transaction_handover')) {
        throw handoverQuery.error
      }
    } else {
      handoverRows = handoverQuery.data || []
    }
  }

  const handoverByUnitId = {}
  for (const handoverRow of handoverRows) {
    const unitId = handoverRow.unit_id || Object.keys(transactionIdByUnitId).find((key) => transactionIdByUnitId[key] === handoverRow.transaction_id)
    if (!unitId || handoverByUnitId[unitId]) {
      continue
    }

    const row = rows.find((item) => item.unit.id === unitId)
    const defaults = getDefaultHandoverRecord({
      developmentId: row?.unit?.development_id || handoverRow.development_id || null,
      unitId,
      transaction: row?.transaction || { id: handoverRow.transaction_id, buyer_id: handoverRow.buyer_id },
      buyer: row?.buyer || null,
    })

    handoverByUnitId[unitId] = normalizeHandoverRow(handoverRow, defaults)
  }

  const issuesResult = await queryClientIssues(client, { unitIds })
  let issues = []
  if (issuesResult.error) {
    if (!isMissingTableError(issuesResult.error, 'client_issues') && !isPermissionDeniedError(issuesResult.error)) {
      throw issuesResult.error
    }
  } else {
    issues = issuesResult.data || []
  }

  const snagSummaryByUnitId = {}
  for (const issue of issues) {
    const unitId = issue.unit_id
    if (!unitId) {
      continue
    }

    if (!snagSummaryByUnitId[unitId]) {
      snagSummaryByUnitId[unitId] = {
        totalCount: 0,
        openCount: 0,
        latestUpdatedAt: null,
      }
    }

    const summary = snagSummaryByUnitId[unitId]
    const normalizedStatus = String(issue.status || '').trim().toLowerCase()
    const updatedAt = issue.updated_at || issue.created_at || null

    summary.totalCount += 1
    if (!['resolved', 'closed', 'completed'].includes(normalizedStatus)) {
      summary.openCount += 1
    }

    if (updatedAt && (!summary.latestUpdatedAt || new Date(updatedAt) > new Date(summary.latestUpdatedAt))) {
      summary.latestUpdatedAt = updatedAt
    }
  }

  return rows
    .map((row) => {
      const defaultHandover = getDefaultHandoverRecord({
        developmentId: row.unit?.development_id || null,
        unitId: row.unit?.id || null,
        transaction: row.transaction,
        buyer: row.buyer,
      })
      const handover = handoverByUnitId[row.unit.id] || defaultHandover
      const snagSummary = snagSummaryByUnitId[row.unit.id] || {
        totalCount: 0,
        openCount: 0,
        latestUpdatedAt: null,
      }

      return {
        ...row,
        handover,
        snagSummary: {
          ...snagSummary,
          status:
            snagSummary.totalCount === 0
              ? 'clear'
              : snagSummary.openCount > 0
                ? 'open'
                : 'resolved',
        },
      }
    })
    .sort(byDevelopmentThenUnit)
}

async function enrichRowsWithReadinessContext(client, rows = []) {
  if (!rows.length) {
    return []
  }

  const transactionIds = [...new Set(rows.map((row) => row?.transaction?.id).filter(Boolean))]
  if (!transactionIds.length) {
    return rows
  }

  let documents = []
  const documentsQuery = await client
    .from('documents')
    .select('id, transaction_id, name, category, created_at')
    .in('transaction_id', transactionIds)

  if (documentsQuery.error) {
    if (!isMissingTableError(documentsQuery.error, 'documents')) {
      throw documentsQuery.error
    }
  } else {
    documents = documentsQuery.data || []
  }

  const documentsByTransactionId = documents.reduce((accumulator, document) => {
    if (!accumulator[document.transaction_id]) {
      accumulator[document.transaction_id] = []
    }

    accumulator[document.transaction_id].push(document)
    return accumulator
  }, {})

  const transactionRequirementsByTransactionId = await fetchTransactionRequiredDocumentsByTransactionIds(client, transactionIds)

  const requirementsByDevelopment = {}
  const uniqueDevelopmentIds = [...new Set(rows.map((row) => row?.unit?.development_id).filter(Boolean))]
  const requirementsRows = await Promise.all(
    uniqueDevelopmentIds.map(async (developmentId) => ({
      developmentId,
      requirements: await fetchDocumentRequirements(client, developmentId),
    })),
  )
  for (const item of requirementsRows) {
    requirementsByDevelopment[item.developmentId] = item.requirements
  }

  let onboardingByTransactionId = {}
  let onboardingQuery = await client
    .from('transaction_onboarding')
    .select('id, transaction_id, token, status, purchaser_type, submitted_at, is_active, created_at, updated_at')
    .in('transaction_id', transactionIds)
    .eq('is_active', true)

  if (
    onboardingQuery.error &&
    (isMissingTableError(onboardingQuery.error, 'transaction_onboarding') ||
      isMissingColumnError(onboardingQuery.error, 'is_active') ||
      isMissingColumnError(onboardingQuery.error, 'purchaser_type') ||
      isMissingColumnError(onboardingQuery.error, 'status'))
  ) {
    onboardingQuery = { data: [], error: null }
  }

  if (onboardingQuery.error) {
    throw onboardingQuery.error
  }

  onboardingByTransactionId = (onboardingQuery.data || []).reduce((accumulator, row) => {
    accumulator[row.transaction_id] = normalizeOnboardingRow(row) || null
    return accumulator
  }, {})

  const [documentRequestsByTransactionId, checklistItemsByTransactionId, issueOverridesByTransactionId] = await Promise.all([
    loadTransactionDocumentRequestsByIds(client, transactionIds),
    loadTransactionChecklistItemsByIds(client, transactionIds),
    loadTransactionIssueOverridesByIds(client, transactionIds),
  ])

  return rows.map((row) => {
    const transactionId = row?.transaction?.id || null
    if (!transactionId) {
      return row
    }

    const documentsForTransaction = documentsByTransactionId[transactionId] || []
    const transactionRequirements = transactionRequirementsByTransactionId[transactionId] || []
    const checklistResult = transactionRequirements.length
      ? buildRequiredChecklistFromRows(transactionRequirements, documentsForTransaction)
      : buildDocumentChecklist(requirementsByDevelopment[row?.unit?.development_id] || DEFAULT_DOCUMENT_REQUIREMENTS, documentsForTransaction)

    const uploadedCount = Number(checklistResult.summary?.uploadedCount || 0)
    const totalRequired = Number(checklistResult.summary?.totalRequired || 0)
    const documentRequests = documentRequestsByTransactionId[transactionId] || []
    const operationalStage = resolveAttorneyOperationalStageKey(row)
    const transactionChecklistItems = checklistItemsByTransactionId[transactionId] || []
    const issueOverrides = issueOverridesByTransactionId[transactionId] || []

    return {
      ...row,
      requiredDocumentChecklist: checklistResult.checklist,
      documentSummary: {
        uploadedCount,
        totalRequired,
        missingCount: Math.max(totalRequired - uploadedCount, 0),
      },
      documentRequests,
      documentRequestSummary: summarizeDocumentRequests(documentRequests),
      transactionChecklistItems,
      checklistSummary: summarizeChecklistItems(transactionChecklistItems, { stageKey: operationalStage }),
      issueOverrides,
      onboarding: onboardingByTransactionId[transactionId] || null,
    }
  })
}

async function fetchActiveTransactionForUnit(client, unitId) {
  const withActiveFlag = await client
    .from('transactions')
    .select(
      'id, unit_id, buyer_id, finance_type, purchaser_type, finance_managed_by, reservation_required, reservation_amount, reservation_status, reservation_paid_date, reservation_proof_document, reservation_proof_uploaded_at, reservation_payment_details, reservation_requested_at, reservation_email_sent_at, reservation_reviewed_at, reservation_reviewed_by, reservation_review_notes, stage, current_main_stage, current_sub_stage_summary, risk_status, assigned_agent, assigned_agent_email, attorney, assigned_attorney_email, bond_originator, assigned_bond_originator_email, next_action, comment, updated_at, created_at',
    )
    .eq('unit_id', unitId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!withActiveFlag.error) {
    const activeRow = withActiveFlag.data
    if (!activeRow || normalizeStage(activeRow?.stage, null) === 'Available') {
      return null
    }
    return activeRow
  }

  if (
    !isMissingColumnError(withActiveFlag.error, 'risk_status') &&
    !isMissingColumnError(withActiveFlag.error, 'is_active') &&
    !isMissingColumnError(withActiveFlag.error, 'current_main_stage') &&
    !isMissingColumnError(withActiveFlag.error, 'current_sub_stage_summary') &&
    !isMissingColumnError(withActiveFlag.error, 'purchaser_type') &&
    !isMissingColumnError(withActiveFlag.error, 'finance_managed_by') &&
    !isMissingColumnError(withActiveFlag.error, 'assigned_agent_email') &&
    !isMissingColumnError(withActiveFlag.error, 'assigned_attorney_email') &&
    !isMissingColumnError(withActiveFlag.error, 'assigned_bond_originator_email') &&
    !isMissingColumnError(withActiveFlag.error, 'reservation_required') &&
    !isMissingColumnError(withActiveFlag.error, 'reservation_amount') &&
    !isMissingColumnError(withActiveFlag.error, 'reservation_status') &&
    !isMissingColumnError(withActiveFlag.error, 'reservation_paid_date') &&
    !isMissingColumnError(withActiveFlag.error, 'reservation_proof_document') &&
    !isMissingColumnError(withActiveFlag.error, 'reservation_proof_uploaded_at') &&
    !isMissingColumnError(withActiveFlag.error, 'reservation_payment_details') &&
    !isMissingColumnError(withActiveFlag.error, 'reservation_requested_at') &&
    !isMissingColumnError(withActiveFlag.error, 'reservation_email_sent_at') &&
    !isMissingColumnError(withActiveFlag.error, 'reservation_reviewed_at') &&
    !isMissingColumnError(withActiveFlag.error, 'reservation_reviewed_by') &&
    !isMissingColumnError(withActiveFlag.error, 'reservation_review_notes') &&
    !isMissingColumnError(withActiveFlag.error, 'comment')
  ) {
    throw withActiveFlag.error
  }

  let fallback = await client
    .from('transactions')
    .select(
      'id, unit_id, buyer_id, finance_type, purchaser_type, finance_managed_by, reservation_required, reservation_amount, reservation_status, reservation_paid_date, reservation_proof_document, stage, current_main_stage, current_sub_stage_summary, assigned_agent, assigned_agent_email, attorney, assigned_attorney_email, bond_originator, assigned_bond_originator_email, next_action, comment, updated_at, created_at',
    )
    .eq('unit_id', unitId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (
    fallback.error &&
    (isMissingColumnError(fallback.error, 'current_main_stage') ||
      isMissingColumnError(fallback.error, 'current_sub_stage_summary') ||
      isMissingColumnError(fallback.error, 'purchaser_type') ||
      isMissingColumnError(fallback.error, 'finance_managed_by') ||
      isMissingColumnError(fallback.error, 'assigned_agent_email') ||
      isMissingColumnError(fallback.error, 'assigned_attorney_email') ||
      isMissingColumnError(fallback.error, 'assigned_bond_originator_email') ||
      isMissingColumnError(fallback.error, 'reservation_required') ||
      isMissingColumnError(fallback.error, 'reservation_amount') ||
      isMissingColumnError(fallback.error, 'reservation_status') ||
      isMissingColumnError(fallback.error, 'reservation_paid_date') ||
      isMissingColumnError(fallback.error, 'reservation_proof_document') ||
      isMissingColumnError(fallback.error, 'comment'))
  ) {
    fallback = await client
      .from('transactions')
      .select('id, unit_id, buyer_id, finance_type, stage, attorney, bond_originator, next_action, updated_at, created_at')
      .eq('unit_id', unitId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
  }

  if (fallback.error) {
    throw fallback.error
  }

  if (!fallback.data || normalizeStage(fallback.data?.stage, null) === 'Available') {
    return null
  }

  return fallback.data
}

async function fetchTransactionRowById(client, transactionId) {
  let query = await client
    .from('transactions')
    .select(
      selectWithoutKnownMissingColumns(
        'id, transaction_reference, transaction_type, property_type, development_id, unit_id, buyer_id, property_address_line_1, property_address_line_2, suburb, city, province, postal_code, property_description, matter_owner, seller_name, seller_email, seller_phone, sales_price, finance_type, purchaser_type, finance_managed_by, reservation_required, reservation_amount, reservation_status, reservation_paid_date, reservation_proof_document, reservation_proof_uploaded_at, reservation_payment_details, reservation_requested_at, reservation_email_sent_at, reservation_reviewed_at, reservation_reviewed_by, reservation_review_notes, stage, current_main_stage, current_sub_stage_summary, risk_status, stage_date, sale_date, assigned_agent, assigned_agent_email, attorney, assigned_attorney_email, bond_originator, assigned_bond_originator_email, bank, expected_transfer_date, next_action, comment, owner_user_id, access_level, is_active, lifecycle_state, attorney_stage, operational_state, waiting_on_role, registration_date, title_deed_number, registration_confirmation_document_id, registered_by_user_id, registered_at, registration_reversed_at, registration_reversed_by_user_id, registration_reversal_reason, completed_at, completed_by_user_id, archived_at, archived_by_user_id, archive_reason, cancelled_at, cancelled_by_user_id, cancelled_reason, last_meaningful_activity_at, final_report_generated_at, updated_at, created_at',
      ),
    )
    .eq('id', transactionId)
    .maybeSingle()

  if (
    query.error &&
    (isMissingColumnError(query.error, 'transaction_reference') ||
      isMissingColumnError(query.error, 'transaction_type') ||
      isMissingColumnError(query.error, 'property_type') ||
      isMissingColumnError(query.error, 'property_address_line_1') ||
      isMissingColumnError(query.error, 'matter_owner') ||
      isMissingColumnError(query.error, 'seller_name') ||
      isMissingColumnError(query.error, 'seller_email') ||
      isMissingColumnError(query.error, 'seller_phone') ||
      isMissingColumnError(query.error, 'development_id') ||
      isMissingColumnError(query.error, 'sales_price') ||
      isMissingColumnError(query.error, 'purchaser_type') ||
      isMissingColumnError(query.error, 'finance_managed_by') ||
      isMissingColumnError(query.error, 'reservation_required') ||
      isMissingColumnError(query.error, 'reservation_amount') ||
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
      isMissingColumnError(query.error, 'current_main_stage') ||
      isMissingColumnError(query.error, 'current_sub_stage_summary') ||
      isMissingColumnError(query.error, 'risk_status') ||
      isMissingColumnError(query.error, 'assigned_agent') ||
      isMissingColumnError(query.error, 'assigned_agent_email') ||
      isMissingColumnError(query.error, 'assigned_attorney_email') ||
      isMissingColumnError(query.error, 'assigned_bond_originator_email') ||
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
      'transaction_reference',
      'transaction_type',
      'property_type',
      'property_address_line_1',
      'matter_owner',
      'seller_name',
      'seller_email',
      'seller_phone',
      'development_id',
      'sales_price',
      'purchaser_type',
      'finance_managed_by',
      'reservation_required',
      'reservation_amount',
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
      'current_main_stage',
      'current_sub_stage_summary',
      'risk_status',
      'assigned_agent',
      'assigned_agent_email',
      'assigned_attorney_email',
      'assigned_bond_originator_email',
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
      .select('id, unit_id, buyer_id, finance_type, stage, attorney, bond_originator, next_action, updated_at, created_at')
      .eq('id', transactionId)
      .maybeSingle()
  }

  if (query.error) {
    throw query.error
  }

  return query.data || null
}

async function getSignedUrl(filePath) {
  const client = requireClient()
  const bucket = client.storage.from(DOCUMENTS_BUCKET)

  const { data, error } = await bucket.createSignedUrl(filePath, 60 * 60)
  if (!error && data?.signedUrl) {
    return data.signedUrl
  }

  const { data: publicUrlData } = bucket.getPublicUrl(filePath)
  return publicUrlData?.publicUrl || null
}

async function enrichDocuments(documents) {
  return Promise.all(
    documents.map(async (document) => ({
      ...document,
      url: await getSignedUrl(document.file_path),
    })),
  )
}

function normalizeSharedDocumentRow(row, { hasClientVisibilityColumn = true } = {}) {
  const inferredVisibility = hasClientVisibilityColumn ? (row?.is_client_visible ? 'shared' : 'internal') : 'shared'
  const archivedAt = row?.archived_at || null
  const normalizedCategory = String(row?.category || '')
  const inferredArchivedFromCategory = /^archived\b/i.test(normalizedCategory)
  const portalMetadata = resolvePortalDocumentMetadata({
    portal_workspace_category: row?.portal_workspace_category,
    document_type: row?.document_type,
    category: row?.category,
    stage_key: row?.stage_key,
    label: row?.name,
    name: row?.name,
  })
  return {
    ...row,
    is_client_visible: hasClientVisibilityColumn ? Boolean(row?.is_client_visible) : true,
    document_type: row?.document_type || row?.category || null,
    visibility_scope: normalizeDocumentVisibilityScope(row?.visibility_scope, inferredVisibility),
    stage_key: row?.stage_key || null,
    uploaded_by_user_id: row?.uploaded_by_user_id || null,
    uploaded_by_role: row?.uploaded_by_role || null,
    uploaded_by_email: row?.uploaded_by_email || null,
    external_access_id: row?.external_access_id || null,
    archived_at: archivedAt,
    is_archived: Boolean(archivedAt || inferredArchivedFromCategory),
    portal_document_type: portalMetadata.portalDocumentType,
    portal_workspace_category: portalMetadata.portalWorkspaceCategory,
    portal_mapping_source: portalMetadata.portalMappingSource,
    portal_mapping_confidence: portalMetadata.portalMappingConfidence,
    portal_mapping_ambiguous: portalMetadata.portalMappingAmbiguous,
    portalDocumentType: portalMetadata.portalDocumentType,
    portalWorkspaceCategory: portalMetadata.portalWorkspaceCategory,
    portalMappingSource: portalMetadata.portalMappingSource,
    portalMappingConfidence: portalMetadata.portalMappingConfidence,
    portalMappingAmbiguous: portalMetadata.portalMappingAmbiguous,
  }
}

function filterSharedDocumentsByViewer(documents, viewer = 'internal') {
  const normalizedViewer = String(viewer || 'internal')
    .trim()
    .toLowerCase()

  if (normalizedViewer === 'internal') {
    return documents.filter((item) => !item?.is_archived)
  }

  return documents.filter(
    (item) =>
      !item?.is_archived &&
      (Boolean(item.is_client_visible) ||
        normalizeDocumentVisibilityScope(item.visibility_scope, 'internal') === 'shared' ||
        normalizeDocumentVisibilityScope(item.visibility_scope, 'internal') === 'client'),
  )
}

async function fetchSharedDocumentRowsByTransactionIds(client, transactionIds = []) {
  const ids = [...new Set((transactionIds || []).filter(Boolean))]
  if (!ids.length) {
    return {
      rows: [],
      hasClientVisibilityColumn: true,
    }
  }

  let hasClientVisibilityColumn = true
  let query = await client
    .from('documents')
    .select(
      'id, transaction_id, name, file_path, category, document_type, visibility_scope, stage_key, uploaded_by_user_id, is_client_visible, uploaded_by_role, uploaded_by_email, external_access_id, archived_at, created_at',
    )
    .in('transaction_id', ids)
    .order('created_at', { ascending: false })

  if (
    query.error &&
    (isMissingColumnError(query.error, 'document_type') ||
      isMissingColumnError(query.error, 'visibility_scope') ||
      isMissingColumnError(query.error, 'stage_key') ||
      isMissingColumnError(query.error, 'uploaded_by_user_id'))
  ) {
    query = await client
      .from('documents')
      .select(
        'id, transaction_id, name, file_path, category, is_client_visible, uploaded_by_role, uploaded_by_email, external_access_id, archived_at, created_at',
      )
      .in('transaction_id', ids)
      .order('created_at', { ascending: false })
  }

  if (query.error && isMissingColumnError(query.error, 'is_client_visible')) {
    hasClientVisibilityColumn = false
    query = await client
      .from('documents')
      .select('id, transaction_id, name, file_path, category, uploaded_by_role, uploaded_by_email, external_access_id, archived_at, created_at')
      .in('transaction_id', ids)
      .order('created_at', { ascending: false })
  }

  if (
    query.error &&
    (isMissingColumnError(query.error, 'uploaded_by_role') ||
      isMissingColumnError(query.error, 'uploaded_by_email') ||
      isMissingColumnError(query.error, 'external_access_id'))
  ) {
    query = await client
      .from('documents')
      .select('id, transaction_id, name, file_path, category, created_at')
      .in('transaction_id', ids)
      .order('created_at', { ascending: false })
  }

  if (query.error) {
    if (isMissingSchemaError(query.error)) {
      return {
        rows: [],
        hasClientVisibilityColumn,
      }
    }

    throw query.error
  }

  return {
    rows: (query.data || []).map((row) => normalizeSharedDocumentRow(row, { hasClientVisibilityColumn })),
    hasClientVisibilityColumn,
  }
}

async function loadSharedDocuments(client, { transactionIds = [], viewer = 'internal' } = {}) {
  const { rows } = await fetchSharedDocumentRowsByTransactionIds(client, transactionIds)
  const visibleRows = filterSharedDocumentsByViewer(rows, viewer)
  return enrichDocuments(visibleRows)
}

let developmentOptionsCache = null
let developmentOptionsCachedAt = 0
let developmentOptionsInFlight = null
const DEVELOPMENT_OPTIONS_CACHE_TTL_MS = 30 * 1000
const TRANSACTION_SUMMARY_CACHE_TTL_MS = 8 * 1000
const UNIT_WORKSPACE_SHELL_CACHE_TTL_MS = 10 * 1000
const unitSummaryCache = new Map()
const unitSummaryInFlight = new Map()
const unitWorkspaceShellCache = new Map()
const unitWorkspaceShellInFlight = new Map()

function readTimedCache(map, key, ttlMs) {
  const record = map.get(key)
  if (!record) {
    return null
  }

  if (Date.now() - record.cachedAt > ttlMs) {
    map.delete(key)
    return null
  }

  return record.value
}

function writeTimedCache(map, key, value) {
  map.set(key, {
    value,
    cachedAt: Date.now(),
  })
}

export function invalidateDevelopmentOptionsCache() {
  developmentOptionsCache = null
  developmentOptionsCachedAt = 0
  developmentOptionsInFlight = null
}

export async function fetchDevelopmentOptions() {
  const now = Date.now()
  if (developmentOptionsCache && now - developmentOptionsCachedAt < DEVELOPMENT_OPTIONS_CACHE_TTL_MS) {
    return developmentOptionsCache.map((row) => ({ ...row }))
  }

  if (developmentOptionsInFlight) {
    const rows = await developmentOptionsInFlight
    return rows.map((row) => ({ ...row }))
  }

  const client = requireClient()

  developmentOptionsInFlight = (async () => {
    const attachReservationDefaults = async (rows = []) => {
      const normalizedRows = Array.isArray(rows) ? rows : []
      const developmentIds = normalizedRows.map((row) => row.id).filter(Boolean)
      if (!developmentIds.length) {
        return normalizedRows
      }

      const settingsQuery = await client
        .from('development_settings')
        .select('development_id, reservation_deposit_enabled_by_default, reservation_deposit_amount')
        .in('development_id', developmentIds)

      if (
        settingsQuery.error &&
        !isMissingTableError(settingsQuery.error, 'development_settings') &&
        !isMissingColumnError(settingsQuery.error, 'reservation_deposit_enabled_by_default') &&
        !isMissingColumnError(settingsQuery.error, 'reservation_deposit_amount')
      ) {
        throw settingsQuery.error
      }

      const settingsByDevelopmentId = new Map(
        (settingsQuery.data || []).map((item) => [item.development_id, item]),
      )

      return normalizedRows.map((row) => {
        const setting = settingsByDevelopmentId.get(row.id)
        return {
          ...row,
          reservation_deposit_enabled_by_default: Boolean(setting?.reservation_deposit_enabled_by_default),
          reservation_deposit_amount: normalizeOptionalNumber(setting?.reservation_deposit_amount),
        }
      })
    }

    const { data, error } = await client
      .from('developments')
      .select('id, name, planned_units')
      .order('name', { ascending: true })

    if (!error) {
      const normalizedRows = data.map((row) => ({
        ...row,
        planned_units: typeof row.planned_units === 'number' ? row.planned_units : null,
      }))
      const rowsWithDefaults = await attachReservationDefaults(normalizedRows)
      developmentOptionsCache = rowsWithDefaults
      developmentOptionsCachedAt = Date.now()
      return rowsWithDefaults
    }

    if (error.code !== '42703') {
      throw error
    }

    const fallback = await client.from('developments').select('id, name').order('name', { ascending: true })

    if (fallback.error) {
      throw fallback.error
    }

    const normalizedRows = fallback.data.map((row) => ({
      ...row,
      planned_units: null,
    }))
    const rowsWithDefaults = await attachReservationDefaults(normalizedRows)
    developmentOptionsCache = rowsWithDefaults
    developmentOptionsCachedAt = Date.now()
    return rowsWithDefaults
  })()

  try {
    const rows = await developmentOptionsInFlight
    return rows.map((row) => ({ ...row }))
  } finally {
    developmentOptionsInFlight = null
  }
}

export async function fetchDashboardOverview({ developmentId = null, client: scopedClient = null } = {}) {
  const client = scopedClient || requireClient()
  const units = await fetchUnitsBase(client, developmentId)
  const rows = dedupeTransactionRows(await hydrateUnitRows(client, units))
  const developmentSummaries = buildDevelopmentSummaries(rows)

  return {
    rows,
    metrics: buildDashboardMetrics(rows, developmentSummaries.length),
    developmentSummaries,
    alerts: buildAlerts(rows),
  }
}

export async function fetchReportRows({ developmentId = null } = {}) {
  const client = requireClient()
  const overview = await fetchDashboardOverview({ developmentId })
  const transactionRows = overview.rows.filter((row) => row.transaction)

  if (!transactionRows.length) {
    return []
  }

  const transactionIds = transactionRows.map((row) => row.transaction.id)

  let transactionsDetailsQuery = await client
    .from('transactions')
    .select(
      'id, stage_date, expected_transfer_date, risk_status, sales_price, next_action, attorney, bond_originator, comment, current_main_stage, current_sub_stage_summary, updated_at',
    )
    .in('id', transactionIds)

  if (
    isMissingColumnError(transactionsDetailsQuery.error, 'risk_status') ||
    isMissingColumnError(transactionsDetailsQuery.error, 'stage_date') ||
    isMissingColumnError(transactionsDetailsQuery.error, 'expected_transfer_date') ||
    isMissingColumnError(transactionsDetailsQuery.error, 'sales_price') ||
    isMissingColumnError(transactionsDetailsQuery.error, 'comment') ||
    isMissingColumnError(transactionsDetailsQuery.error, 'current_main_stage') ||
    isMissingColumnError(transactionsDetailsQuery.error, 'current_sub_stage_summary')
  ) {
    transactionsDetailsQuery = await client
      .from('transactions')
      .select('id, next_action, attorney, bond_originator, updated_at')
      .in('id', transactionIds)
  }

  if (transactionsDetailsQuery.error && !isPermissionDeniedError(transactionsDetailsQuery.error)) {
    throw transactionsDetailsQuery.error
  }

  const transactionDetailById = (transactionsDetailsQuery.data || []).reduce((accumulator, row) => {
    accumulator[row.id] = row
    return accumulator
  }, {})

  let discussionRows = []
  const discussionQuery = await client
    .from('transaction_comments')
    .select('id, transaction_id, author_name, author_role, comment_text, created_at')
    .in('transaction_id', transactionIds)
    .order('created_at', { ascending: false })

  if (!discussionQuery.error) {
    discussionRows = (discussionQuery.data || []).map((row) => normalizeTransactionCommentRow(row))
  } else if (!isMissingTableError(discussionQuery.error, 'transaction_comments') && !isPermissionDeniedError(discussionQuery.error)) {
    throw discussionQuery.error
  }

  const latestDiscussionByTransactionId = {}
  for (const discussionRow of discussionRows) {
    if (!discussionRow.transactionId) {
      continue
    }

    if (!latestDiscussionByTransactionId[discussionRow.transactionId]) {
      latestDiscussionByTransactionId[discussionRow.transactionId] = discussionRow
    }
  }

  let noteRows = []
  let notesUseUnitReference = false
  let notesQuery = await client
    .from('notes')
    .select('transaction_id, body, created_at')
    .in('transaction_id', transactionIds)
    .order('created_at', { ascending: false })

  if (notesQuery.error && isMissingColumnError(notesQuery.error, 'transaction_id')) {
    notesUseUnitReference = true
    const unitIds = transactionRows.map((row) => row.unit.id)
    notesQuery = await client
      .from('notes')
      .select('unit_id, body, created_at')
      .in('unit_id', unitIds)
      .order('created_at', { ascending: false })
  }

  if (!notesQuery.error) {
    noteRows = notesQuery.data || []
  } else if (!isMissingSchemaError(notesQuery.error) && !isPermissionDeniedError(notesQuery.error)) {
    throw notesQuery.error
  }

  const latestNoteByTransactionId = {}
  const transactionIdByUnitId = transactionRows.reduce((accumulator, row) => {
    accumulator[row.unit.id] = row.transaction.id
    return accumulator
  }, {})

  for (const note of noteRows) {
    const key = notesUseUnitReference ? transactionIdByUnitId[note.unit_id] : note.transaction_id
    if (!key) {
      continue
    }

    if (!latestNoteByTransactionId[key]) {
      latestNoteByTransactionId[key] = note
    }
  }

  const subprocessInsightsByTransactionId = {}
  const subprocessQuery = await client
    .from('transaction_subprocesses')
    .select('id, transaction_id, process_type, status')
    .in('transaction_id', transactionIds)

  if (!subprocessQuery.error) {
    const subprocessRows = subprocessQuery.data || []
    const subprocessIds = subprocessRows.map((item) => item.id).filter(Boolean)
    let stepRows = []

    if (subprocessIds.length) {
      const stepQuery = await client
        .from('transaction_subprocess_steps')
        .select('subprocess_id, step_key, step_label, status, completed_at, comment, sort_order')
        .in('subprocess_id', subprocessIds)

      if (!stepQuery.error) {
        stepRows = stepQuery.data || []
      } else if (!isMissingSchemaError(stepQuery.error) && !isPermissionDeniedError(stepQuery.error)) {
        throw stepQuery.error
      }
    }

    const stepsBySubprocessId = stepRows.reduce((accumulator, step) => {
      if (!accumulator[step.subprocess_id]) {
        accumulator[step.subprocess_id] = []
      }

      accumulator[step.subprocess_id].push({
        ...step,
        status: normalizeSubprocessStepStatus(step.status),
      })
      return accumulator
    }, {})

    for (const subprocess of subprocessRows) {
      const steps = (stepsBySubprocessId[subprocess.id] || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      const summary = summarizeSubprocess({
        ...subprocess,
        steps,
      })

      if (!subprocessInsightsByTransactionId[subprocess.transaction_id]) {
        subprocessInsightsByTransactionId[subprocess.transaction_id] = {}
      }

      subprocessInsightsByTransactionId[subprocess.transaction_id][subprocess.process_type] = {
        ...subprocess,
        steps,
        summary,
      }
    }
  } else if (!isMissingSchemaError(subprocessQuery.error) && !isPermissionDeniedError(subprocessQuery.error)) {
    throw subprocessQuery.error
  }

  const developmentIds = [...new Set(transactionRows.map((row) => row.development?.id || row.unit?.development_id).filter(Boolean))]
  let developmentPhaseById = {}

  if (developmentIds.length) {
    const developmentProfileQuery = await client
      .from('development_profiles')
      .select('development_id, status')
      .in('development_id', developmentIds)

    if (!developmentProfileQuery.error) {
      developmentPhaseById = (developmentProfileQuery.data || []).reduce((accumulator, row) => {
        accumulator[row.development_id] = row.status || null
        return accumulator
      }, {})
    } else if (
      !isMissingTableError(developmentProfileQuery.error, 'development_profiles') &&
      !isPermissionDeniedError(developmentProfileQuery.error)
    ) {
      throw developmentProfileQuery.error
    }
  }

  return transactionRows.map((row) => {
    const detail = transactionDetailById[row.transaction.id] || {}
    const subprocessInsight = subprocessInsightsByTransactionId[row.transaction.id] || {}
    const nextTargetDate = detail.expected_transfer_date || null
    const riskStatus = detail.risk_status || row.transaction?.risk_status || 'On Track'
    const latestOperationalNote =
      latestDiscussionByTransactionId[row.transaction.id]?.commentBody ||
      latestDiscussionByTransactionId[row.transaction.id]?.commentText ||
      latestNoteByTransactionId[row.transaction.id]?.body ||
      null
    const notesSummary = detail.next_action || row.transaction?.next_action || null
    const purchasePrice = detail.sales_price || row.transaction?.sales_price || row.unit?.price || null
    const developmentId = row.development?.id || row.unit?.development_id || null
    const developmentPhase = row.unit?.phase || (developmentId ? developmentPhaseById[developmentId] || null : null)
    const stageSummary = selectReportStageSummary({
      detailedStage: row.stage,
      currentMainStage: detail.current_main_stage || row.transaction?.current_main_stage,
      transactionDetail: detail,
      subprocessByType: subprocessInsight,
      latestOperationalNote,
    })

    return {
      ...row,
      report: {
        stageDate: stageSummary.stageDate || detail.stage_date || null,
        nextTargetDate,
        riskStatus,
        latestOperationalNote,
        workflowComment: stageSummary.workflowComment,
        notesSummary,
        purchasePrice,
        developmentPhase,
        currentMainStage: stageSummary.currentMainStage,
        subprocess: subprocessInsight,
        financeSummary: stageSummary.financeSummary || null,
        attorneySummary: stageSummary.attorneySummary || null,
        milestoneIndex: stageSummary.milestoneIndex,
        lastCompletedStep: stageSummary.lastCompletedStep,
        nextStep: stageSummary.nextStep,
      },
    }
  })
}

export async function getOrCreateSnapshotLink() {
  const client = requireClient()

  const owner = await resolveSnapshotOwner(client)

  const { data: existing, error: existingError } = await client
    .from('snapshot_links')
    .select('id, user_id, owner_key, token, is_active, created_at, updated_at')
    .eq('owner_key', owner.ownerKey)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingError) {
    if (isMissingTableError(existingError, 'snapshot_links')) {
      return null
    }

    throw existingError
  }

  if (existing) {
    return existing
  }

  let attempt = 0
  while (attempt < 3) {
    const { data, error } = await client
      .from('snapshot_links')
      .insert({
        user_id: owner.userId,
        owner_key: owner.ownerKey,
        token: generateSnapshotToken(),
        is_active: true,
      })
      .select('id, user_id, owner_key, token, is_active, created_at, updated_at')
      .single()

    if (!error) {
      return data
    }

    if (isMissingTableError(error, 'snapshot_links')) {
      return null
    }

    if (!['23505', '42501'].includes(error.code)) {
      throw error
    }

    if (error.code === '42501') {
      throw new Error('Snapshot link permissions are not configured for this user.')
    }

    const { data: retryExisting, error: retryError } = await client
      .from('snapshot_links')
      .select('id, user_id, owner_key, token, is_active, created_at, updated_at')
      .eq('owner_key', owner.ownerKey)
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (retryError && retryError.code !== 'PGRST116') {
      throw retryError
    }

    if (retryExisting) {
      return retryExisting
    }

    attempt += 1
  }

  throw new Error('Unable to generate snapshot link. Please try again.')
}

function buildExecutiveDevelopmentSummaries(rows) {
  const map = new Map()

  for (const row of rows) {
    const developmentName = row.development?.name || 'Unknown Development'
    const developmentId = row.development?.id || row.unit?.development_id || `unknown:${developmentName}`
    const unitValue = Number(row.transaction?.sales_price ?? row.unit?.price)
    const normalizedValue = Number.isFinite(unitValue) ? unitValue : 0

    const existing = map.get(developmentId) || {
      id: developmentId,
      name: developmentName,
      totalUnits: 0,
      availableUnits: 0,
      soldActiveUnits: 0,
      unitsInTransfer: 0,
      unitsRegistered: 0,
      dealsInProgress: 0,
      revenueSecured: 0,
      remainingInventoryValue: 0,
      totalPortfolioValue: 0,
      sellThroughPercent: 0,
      latestActivity: null,
    }

    existing.totalUnits += 1
    existing.totalPortfolioValue += normalizedValue

    if (row.stage === 'Available') {
      existing.availableUnits += 1
      existing.remainingInventoryValue += normalizedValue
    } else {
      existing.soldActiveUnits += 1
      existing.revenueSecured += normalizedValue
    }

    if (isInTransferStage(row.stage)) {
      existing.unitsInTransfer += 1
    }

    if (row.stage === 'Registered') {
      existing.unitsRegistered += 1
    }

    if (row.stage !== 'Available' && row.stage !== 'Registered') {
      existing.dealsInProgress += 1
    }

    const activity = latestTimestamp(row)
    if (activity && (!existing.latestActivity || new Date(activity) > new Date(existing.latestActivity))) {
      existing.latestActivity = activity
    }

    existing.sellThroughPercent = existing.totalUnits ? (existing.soldActiveUnits / existing.totalUnits) * 100 : 0

    map.set(developmentId, existing)
  }

  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}

function buildExecutiveMetrics(rows) {
  const totalUnits = rows.length
  const stageCounts = STAGES.reduce((accumulator, stage) => {
    accumulator[stage] = 0
    return accumulator
  }, {})

  let totalPortfolioValue = 0
  let remainingInventoryValue = 0
  let revenueSecured = 0
  let availableUnits = 0
  let unitsInTransfer = 0
  let unitsRegistered = 0
  let dealsInProgress = 0

  for (const row of rows) {
    const stage = normalizeStageLabel(row.stage)
    if (stageCounts[stage] === undefined) {
      stageCounts[stage] = 0
    }

    stageCounts[stage] += 1

    const unitValue = Number(row.transaction?.sales_price ?? row.unit?.price)
    const normalizedValue = Number.isFinite(unitValue) ? unitValue : 0
    totalPortfolioValue += normalizedValue

    if (stage === 'Available') {
      availableUnits += 1
      remainingInventoryValue += normalizedValue
    } else {
      revenueSecured += normalizedValue
    }

    if (isInTransferStage(stage)) {
      unitsInTransfer += 1
    }

    if (stage === 'Registered') {
      unitsRegistered += 1
    }

    if (stage !== 'Available' && stage !== 'Registered') {
      dealsInProgress += 1
    }
  }

  const soldActiveUnits = totalUnits - availableUnits
  const health = {
    available: availableUnits,
    early:
      (stageCounts['Reserved'] || 0) + (stageCounts['OTP Signed'] || 0) + (stageCounts['Deposit Paid'] || 0),
    finance: (stageCounts['Finance Pending'] || 0) + (stageCounts['Bond Approved / Proof of Funds'] || 0),
    transfer:
      (stageCounts['Proceed to Attorneys'] || 0) +
      (stageCounts['Transfer in Progress'] || 0) +
      (stageCounts['Transfer Lodged'] || 0),
    registered: unitsRegistered,
  }

  return {
    totalDevelopments: new Set(rows.map((row) => row.development?.id || row.unit?.development_id).filter(Boolean))
      .size,
    totalUnits,
    soldActiveUnits,
    dealsInProgress,
    unitsInTransfer,
    unitsRegistered,
    availableUnits,
    totalPortfolioValue,
    revenueSecured,
    remainingInventoryValue,
    sellThroughPercent: totalUnits ? (soldActiveUnits / totalUnits) * 100 : 0,
    stageCounts,
    health,
  }
}

function buildExecutiveAlerts(rows) {
  const oldestFirst = (a, b) => new Date(latestTimestamp(a) || 0) - new Date(latestTimestamp(b) || 0)
  const toAlertItem = (row, issue) => ({
    unitId: row.unit.id,
    unitNumber: row.unit.unit_number,
    developmentName: row.development?.name || 'Unknown Development',
    buyerName: row.buyer?.name || 'No buyer assigned',
    stage: row.stage,
    nextAction: row.transaction?.next_action || row.stage,
    updatedAt: latestTimestamp(row),
    issue,
  })
  const group = (groupRows, issue) => ({
    count: groupRows.length,
    items: [...groupRows].sort(oldestFirst).slice(0, 4).map((row) => toAlertItem(row, issue)),
  })

  const waitingDepositRows = rows.filter((row) => normalizeStageLabel(row.stage) === 'OTP Signed')
  const waitingOtpRows = rows.filter((row) => normalizeStageLabel(row.stage) === 'Reserved')
  const waitingBondRows = rows.filter((row) => normalizeStageLabel(row.stage) === 'Finance Pending')
  const waitingAttorneyRows = rows.filter((row) => normalizeStageLabel(row.stage) === 'Proceed to Attorneys')
  const delayedRows = rows.filter((row) =>
    ['Delayed', 'Blocked'].includes(String(row.transaction?.risk_status || '').trim()),
  )

  return {
    waitingDeposit: group(waitingDepositRows, 'Deposit due'),
    waitingOtp: group(waitingOtpRows, 'OTP pending'),
    waitingBondApproval: group(waitingBondRows, 'Bond approval pending'),
    waitingAttorneys: group(waitingAttorneyRows, 'Attorney handover pending'),
    delayedTransactions: group(delayedRows, 'Marked delayed / blocked'),
    totalAttention:
      waitingDepositRows.length +
      waitingOtpRows.length +
      waitingBondRows.length +
      waitingAttorneyRows.length +
      delayedRows.length,
  }
}

function buildRecentMovement(rows) {
  return rows
    .filter((row) => row.transaction)
    .sort((a, b) => new Date(latestTimestamp(b) || 0) - new Date(latestTimestamp(a) || 0))
    .slice(0, 5)
    .map((row) => ({
      unitId: row.unit.id,
      unitNumber: row.unit.unit_number,
      developmentName: row.development?.name || 'Unknown Development',
      stage: row.stage,
      buyerName: row.buyer?.name || 'No buyer assigned',
      nextAction: row.transaction?.next_action || row.stage,
      updatedAt: latestTimestamp(row),
    }))
}

export async function fetchExecutiveSnapshotByToken(token) {
  const client = requireSnapshotTokenClient(token)
  const normalizedToken = String(token || '').trim()

  if (!normalizedToken) {
    throw new Error('Snapshot token is required.')
  }

  const { data: snapshotLink, error: snapshotLinkError } = await client
    .from('snapshot_links')
    .select('id, user_id, owner_key, token, is_active, created_at, updated_at')
    .eq('token', normalizedToken)
    .eq('is_active', true)
    .maybeSingle()

  if (snapshotLinkError) {
    if (isMissingTableError(snapshotLinkError, 'snapshot_links')) {
      throw new Error('Snapshot links are not set up yet. Run sql/schema.sql to create snapshot_links.')
    }

    throw snapshotLinkError
  }

  if (!snapshotLink) {
    throw new Error('Snapshot link is invalid or inactive.')
  }

  const overview = await fetchDashboardOverview({ client })
  const rows = overview.rows

  return {
    snapshotLink,
    generatedAt: new Date().toISOString(),
    metrics: buildExecutiveMetrics(rows),
    developments: buildExecutiveDevelopmentSummaries(rows),
    alerts: buildExecutiveAlerts(rows),
    recentMovement: buildRecentMovement(rows),
  }
}

export async function fetchDevelopmentsData() {
  const overview = await fetchDashboardOverview()
  const client = requireClient()
  const summaries = overview.developmentSummaries || []

  if (!summaries.length) {
    return {
      metrics: overview.metrics,
      developments: [],
    }
  }

  const developmentIds = summaries.map((item) => item.id).filter(Boolean)
  let profileByDevelopmentId = {}

  if (developmentIds.length) {
    const profileQuery = await client
      .from('development_profiles')
      .select('development_id, location, status, image_links, developer_company')
      .in('development_id', developmentIds)

    if (!profileQuery.error) {
      profileByDevelopmentId = (profileQuery.data || []).reduce((accumulator, row) => {
        accumulator[row.development_id] = normalizeDevelopmentProfile(row)
        return accumulator
      }, {})
    } else if (!isMissingTableError(profileQuery.error, 'development_profiles')) {
      throw profileQuery.error
    }
  }

  return {
    metrics: overview.metrics,
    rows: overview.rows || [],
    developments: summaries.map((item) => {
      const profile = profileByDevelopmentId[item.id] || null
      return {
        ...item,
        coverImageUrl: profile?.imageLinks?.[0] || null,
        location: profile?.location || null,
        phase: profile?.status || null,
        developerCompany: profile?.developerCompany || null,
      }
    }),
  }
}

export async function fetchDevelopmentDetail(developmentId) {
  const mockDetail = getAttorneyMockDevelopmentDetail(developmentId)
  if (mockDetail) {
    return mockDetail
  }

  const client = requireClient()

  let developmentQuery = await client
    .from('developments')
    .select(
      'id, name, planned_units, code, location, suburb, city, province, country, description, status, developer_company, total_units_expected, launch_date, expected_completion_date, assigned_attorney_id, handover_enabled, snag_tracking_enabled, alterations_enabled, onboarding_enabled',
    )
    .eq('id', developmentId)
    .maybeSingle()

  if (developmentQuery.error && isMissingColumnError(developmentQuery.error, 'code')) {
    developmentQuery = await client
      .from('developments')
      .select('id, name, planned_units')
      .eq('id', developmentId)
      .maybeSingle()
  }

  const { data: development, error: developmentError } = developmentQuery

  if (developmentError) {
    throw developmentError
  }

  if (!development) {
    return null
  }

  const units = await fetchUnitsBase(client, developmentId)
  const rows = await hydrateUnitRows(client, units)
  const requirements = await fetchDocumentRequirements(client, developmentId)
  const settings = await ensureDevelopmentSettings(client, developmentId, { createIfMissing: false })
  const profile = await fetchDevelopmentProfile(client, developmentId)
  const financials = await fetchDevelopmentFinancials(developmentId)
  const documents = await fetchDevelopmentDocuments(developmentId)
  const attorneyConfig = await fetchDevelopmentAttorneyConfig(developmentId)
  const bondConfig = await fetchDevelopmentBondConfig(developmentId)

  const transactionIds = rows.map((row) => row.transaction?.id).filter(Boolean)
  let docsByTransactionId = {}
  let transactionRequirementsByTransactionId = {}

  try {
    transactionRequirementsByTransactionId = await fetchTransactionRequiredDocumentsByTransactionIds(client, transactionIds)
  } catch (error) {
    if (!isPermissionDeniedError(error) && !isMissingSchemaError(error)) {
      throw error
    }
  }

  if (transactionIds.length) {
    const { data: docs, error: docsError } = await client
      .from('documents')
      .select('id, transaction_id, name, category')
      .in('transaction_id', transactionIds)

    if (docsError) {
      if (!isPermissionDeniedError(docsError) && !isMissingSchemaError(docsError)) {
        throw docsError
      }
    } else {
      docsByTransactionId = docs.reduce((accumulator, doc) => {
        if (!accumulator[doc.transaction_id]) {
          accumulator[doc.transaction_id] = []
        }

        accumulator[doc.transaction_id].push(doc)
        return accumulator
      }, {})
    }
  }

  const rowsWithDocumentSummary = rows.map((row) => {
    const transactionId = row.transaction?.id
    const documents = transactionId ? docsByTransactionId[transactionId] || [] : []
    const transactionRequirements = transactionId ? transactionRequirementsByTransactionId[transactionId] || [] : []
    const completion = transactionRequirements.length
      ? buildRequiredChecklistFromRows(transactionRequirements, documents)
      : buildDocumentChecklist(requirements, documents)

    return {
      ...row,
      documentSummary: completion.summary,
    }
  })

  return {
    development,
    profile,
    financials,
    documents,
    attorneyConfig,
    bondConfig,
    rows: rowsWithDocumentSummary.sort(byUnitNumber),
    stats: getSummaryStats(rowsWithDocumentSummary),
    settings,
  }
}

export async function fetchDevelopmentFinancials(developmentId) {
  const client = requireClient()

  if (!developmentId) {
    return { ...DEFAULT_DEVELOPMENT_FINANCIALS }
  }

  const { data, error } = await client
    .from('development_financials')
    .select(
      'id, development_id, land_cost, build_cost, professional_fees, marketing_cost, infrastructure_cost, other_costs, total_projected_cost, projected_gross_sales_value, projected_profit, target_margin, notes',
    )
    .eq('development_id', developmentId)
    .maybeSingle()

  if (error) {
    if (isMissingTableError(error, 'development_financials') || isPermissionDeniedError(error)) {
      return {
        ...DEFAULT_DEVELOPMENT_FINANCIALS,
        developmentId,
      }
    }

    throw error
  }

  return normalizeDevelopmentFinancialsRow({ ...DEFAULT_DEVELOPMENT_FINANCIALS, ...data, development_id: developmentId })
}

export async function saveDevelopmentFinancials(developmentId, input = {}) {
  const client = requireClient()

  if (!developmentId) {
    throw new Error('Development is required.')
  }

  const normalized = normalizeDevelopmentFinancialsRow({ ...input, development_id: developmentId })
  const payload = {
    development_id: developmentId,
    land_cost: normalized.landCost,
    build_cost: normalized.buildCost,
    professional_fees: normalized.professionalFees,
    marketing_cost: normalized.marketingCost,
    infrastructure_cost: normalized.infrastructureCost,
    other_costs: normalized.otherCosts,
    total_projected_cost: normalized.totalProjectedCost,
    projected_gross_sales_value: normalized.projectedGrossSalesValue,
    projected_profit: normalized.projectedProfit,
    target_margin: normalized.targetMargin,
    notes: normalizeNullableText(normalized.notes),
  }

  const { data, error } = await upsertByDevelopmentIdWithFallback(client, {
    table: 'development_financials',
    payload,
    selectClause:
      'id, development_id, land_cost, build_cost, professional_fees, marketing_cost, infrastructure_cost, other_costs, total_projected_cost, projected_gross_sales_value, projected_profit, target_margin, notes',
    expectSingleRow: true,
  })

  if (error) {
    if (isMissingTableError(error, 'development_financials')) {
      throw new Error('development_financials table not found. Run sql/schema.sql first.')
    }
    throw error
  }

  return normalizeDevelopmentFinancialsRow(data)
}

export async function fetchDevelopmentDocuments(developmentId) {
  const client = requireClient()

  if (!developmentId) {
    return []
  }

  const { data, error } = await client
    .from('development_documents')
    .select('id, development_id, document_type, title, description, file_url, linked_unit_id, linked_unit_type, uploaded_at, created_at')
    .eq('development_id', developmentId)
    .order('created_at', { ascending: false })

  if (error) {
    if (isMissingTableError(error, 'development_documents') || isPermissionDeniedError(error)) {
      return []
    }
    throw error
  }

  return (data || []).map((row) => normalizeDevelopmentDocumentRow(row))
}

export async function saveDevelopmentDocument({
  developmentId,
  documentId = null,
  documentType = 'other',
  title,
  description = '',
  fileUrl = '',
  linkedUnitId = null,
  linkedUnitType = '',
} = {}) {
  const client = requireClient()

  if (!developmentId) {
    throw new Error('Development is required.')
  }

  if (!normalizeTextValue(title)) {
    throw new Error('Document title is required.')
  }

  const payload = {
    id: documentId || undefined,
    development_id: developmentId,
    document_type: normalizeTextValue(documentType) || 'other',
    title: normalizeTextValue(title),
    description: normalizeNullableText(description),
    file_url: normalizeNullableText(fileUrl),
    linked_unit_id: linkedUnitId || null,
    linked_unit_type: normalizeNullableText(linkedUnitType),
    uploaded_at: new Date().toISOString(),
  }

  const { data, error } = await client
    .from('development_documents')
    .upsert(payload, { onConflict: 'id' })
    .select('id, development_id, document_type, title, description, file_url, linked_unit_id, linked_unit_type, uploaded_at, created_at')
    .single()

  if (error) {
    if (isMissingTableError(error, 'development_documents')) {
      throw new Error('development_documents table not found. Run sql/schema.sql first.')
    }
    throw error
  }

  return normalizeDevelopmentDocumentRow(data)
}

export async function deleteDevelopmentDocument(documentId) {
  const client = requireClient()

  const { error } = await client.from('development_documents').delete().eq('id', documentId)

  if (error) {
    if (isMissingTableError(error, 'development_documents')) {
      throw new Error('development_documents table not found. Run sql/schema.sql first.')
    }
    throw error
  }
}

export async function saveDevelopmentDetails(developmentId, input = {}) {
  const client = requireClient()

  if (!developmentId) {
    throw new Error('Development is required.')
  }

  const developmentPayload = {
    name: normalizeTextValue(input.name),
    planned_units: Math.trunc(normalizeOptionalNumber(input.totalUnitsExpected ?? input.plannedUnits) ?? 0),
    code: normalizeNullableText(input.code),
    location: normalizeNullableText(input.location),
    suburb: normalizeNullableText(input.suburb),
    city: normalizeNullableText(input.city),
    province: normalizeNullableText(input.province),
    country: normalizeNullableText(input.country) || 'South Africa',
    description: normalizeNullableText(input.description),
    status: normalizeNullableText(input.status) || 'Planning',
    developer_company: normalizeNullableText(input.developerCompany),
    total_units_expected: Math.trunc(normalizeOptionalNumber(input.totalUnitsExpected ?? input.plannedUnits) ?? 0),
    launch_date: normalizeOptionalDate(input.launchDate),
    expected_completion_date: normalizeOptionalDate(input.expectedCompletionDate),
    handover_enabled: input.handoverEnabled === undefined ? true : Boolean(input.handoverEnabled),
    snag_tracking_enabled: input.snagTrackingEnabled === undefined ? true : Boolean(input.snagTrackingEnabled),
    alterations_enabled: input.alterationsEnabled === undefined ? false : Boolean(input.alterationsEnabled),
    onboarding_enabled: input.onboardingEnabled === undefined ? true : Boolean(input.onboardingEnabled),
  }

  let updateResult = await client.from('developments').update(developmentPayload).eq('id', developmentId)

  if (updateResult.error && isMissingColumnError(updateResult.error, 'code')) {
    updateResult = await client
      .from('developments')
      .update({
        name: developmentPayload.name,
        planned_units: developmentPayload.planned_units,
      })
      .eq('id', developmentId)
  }

  if (updateResult.error) {
    throw updateResult.error
  }

  const profilePayload = {
    development_id: developmentId,
    code: normalizeNullableText(input.code),
    location: normalizeNullableText(input.location),
    suburb: normalizeNullableText(input.suburb),
    city: normalizeNullableText(input.city),
    province: normalizeNullableText(input.province),
    country: normalizeNullableText(input.country) || 'South Africa',
    address: normalizeNullableText(input.address),
    description: normalizeNullableText(input.description),
    status: normalizeNullableText(input.status) || 'Planning',
    developer_company: normalizeNullableText(input.developerCompany),
    launch_date: normalizeOptionalDate(input.launchDate),
    expected_completion_date: normalizeOptionalDate(input.expectedCompletionDate),
    plans: normalizeListValue(input.plans),
    site_plans: normalizeListValue(input.sitePlans),
    image_links: normalizeListValue(input.imageLinks),
    supporting_documents: normalizeListValue(input.supportingDocuments),
  }

  if (input.marketingContent !== undefined) {
    profilePayload.marketing_content = normalizeMarketingContent(input.marketingContent)
  }

  let profileResult = await upsertByDevelopmentIdWithFallback(client, {
    table: 'development_profiles',
    payload: profilePayload,
  })

  if (profileResult.error && isMissingColumnError(profileResult.error, 'marketing_content')) {
    const { marketing_content: _marketingContent, ...legacyPayload } = profilePayload
    profileResult = await upsertByDevelopmentIdWithFallback(client, {
      table: 'development_profiles',
      payload: legacyPayload,
    })
  }

  if (profileResult.error && !isMissingTableError(profileResult.error, 'development_profiles')) {
    throw profileResult.error
  }

  // Keep development_settings feature toggles aligned with development-level module switches
  // so transaction and portal views resolve the same module state.
  try {
    const currentSettings = await ensureDevelopmentSettings(client, developmentId)
    await updateDevelopmentSettings(developmentId, {
      ...currentSettings,
      snag_reporting_enabled: developmentPayload.snag_tracking_enabled,
      alteration_requests_enabled: developmentPayload.alterations_enabled,
    })
  } catch (settingsSyncError) {
    if (
      !(
        isMissingSchemaError(settingsSyncError) ||
        isMissingColumnError(settingsSyncError, 'enabled_modules') ||
        isPermissionDeniedError(settingsSyncError) ||
        /development_settings table not found/i.test(String(settingsSyncError?.message || ''))
      )
    ) {
      throw settingsSyncError
    }
  }

  return true
}

export async function deleteDevelopment(developmentId) {
  const client = requireClient()

  if (!developmentId) {
    throw new Error('Development is required.')
  }

  const { data: units, error: unitsLookupError } = await client.from('units').select('id').eq('development_id', developmentId)

  if (unitsLookupError && !isMissingTableError(unitsLookupError, 'units')) {
    throw unitsLookupError
  }

  const unitIds = (units || []).map((item) => item.id).filter(Boolean)
  const transactionsById = new Map()

  let linkedTransactionsByDevelopment = await client
    .from('transactions')
    .select('id, unit_id')
    .eq('development_id', developmentId)

  if (linkedTransactionsByDevelopment.error && isMissingColumnError(linkedTransactionsByDevelopment.error, 'development_id')) {
    linkedTransactionsByDevelopment = { data: [], error: null }
  }

  if (linkedTransactionsByDevelopment.error && !isMissingTableError(linkedTransactionsByDevelopment.error, 'transactions')) {
    throw linkedTransactionsByDevelopment.error
  }

  for (const row of linkedTransactionsByDevelopment.data || []) {
    if (row?.id) {
      transactionsById.set(row.id, row)
    }
  }

  if (unitIds.length) {
    let linkedTransactionsByUnit = await client
      .from('transactions')
      .select('id, unit_id')
      .in('unit_id', unitIds)

    if (linkedTransactionsByUnit.error && isMissingColumnError(linkedTransactionsByUnit.error, 'unit_id')) {
      linkedTransactionsByUnit = { data: [], error: null }
    }

    if (linkedTransactionsByUnit.error && !isMissingTableError(linkedTransactionsByUnit.error, 'transactions')) {
      throw linkedTransactionsByUnit.error
    }

    for (const row of linkedTransactionsByUnit.data || []) {
      if (row?.id) {
        transactionsById.set(row.id, row)
      }
    }
  }

  const linkedTransactions = [...transactionsById.values()]
  for (const transaction of linkedTransactions) {
    // Sequential delete keeps cleanup deterministic for linked workflow/doc records.
    // eslint-disable-next-line no-await-in-loop
    await deleteTransactionEverywhere({
      transactionId: transaction.id,
      unitId: transaction.unit_id || null,
    })
  }

  const lingeringByDevelopment = await client
    .from('transactions')
    .delete()
    .eq('development_id', developmentId)

  if (
    lingeringByDevelopment.error &&
    !isMissingTableError(lingeringByDevelopment.error, 'transactions') &&
    !isMissingColumnError(lingeringByDevelopment.error, 'development_id')
  ) {
    throw lingeringByDevelopment.error
  }

  if (unitIds.length) {
    const lingeringByUnit = await client
      .from('transactions')
      .delete()
      .in('unit_id', unitIds)

    if (
      lingeringByUnit.error &&
      !isMissingTableError(lingeringByUnit.error, 'transactions') &&
      !isMissingColumnError(lingeringByUnit.error, 'unit_id')
    ) {
      throw lingeringByUnit.error
    }
  }

  const deleteByDevelopmentId = async (table) => {
    const { error } = await client.from(table).delete().eq('development_id', developmentId)
    if (error && !isMissingTableError(error, table)) {
      throw error
    }
  }

  const { data: attorneyConfigs, error: attorneyConfigLookupError } = await client
    .from('development_attorney_configs')
    .select('id')
    .eq('development_id', developmentId)

  if (attorneyConfigLookupError && !isMissingTableError(attorneyConfigLookupError, 'development_attorney_configs')) {
    throw attorneyConfigLookupError
  }

  const attorneyConfigIds = (attorneyConfigs || []).map((item) => item.id).filter(Boolean)
  if (attorneyConfigIds.length) {
    const { error } = await client
      .from('development_attorney_required_closeout_docs')
      .delete()
      .in('development_attorney_config_id', attorneyConfigIds)
    if (error && !isMissingTableError(error, 'development_attorney_required_closeout_docs')) {
      throw error
    }
  }

  const { data: bondConfigs, error: bondConfigLookupError } = await client
    .from('development_bond_configs')
    .select('id')
    .eq('development_id', developmentId)

  if (bondConfigLookupError && !isMissingTableError(bondConfigLookupError, 'development_bond_configs')) {
    throw bondConfigLookupError
  }

  const bondConfigIds = (bondConfigs || []).map((item) => item.id).filter(Boolean)
  if (bondConfigIds.length) {
    const { error } = await client
      .from('development_bond_required_closeout_docs')
      .delete()
      .in('development_bond_config_id', bondConfigIds)
    if (error && !isMissingTableError(error, 'development_bond_required_closeout_docs')) {
      throw error
    }
  }

  await deleteByDevelopmentId('document_requirements')
  await deleteByDevelopmentId('development_documents')
  await deleteByDevelopmentId('development_financials')
  await deleteByDevelopmentId('development_profiles')
  await deleteByDevelopmentId('development_settings')
  await deleteByDevelopmentId('development_attorney_configs')
  await deleteByDevelopmentId('development_bond_configs')
  await deleteByDevelopmentId('units')

  const { error: developmentDeleteError } = await client.from('developments').delete().eq('id', developmentId)
  if (developmentDeleteError) {
    throw developmentDeleteError
  }

  return true
}

export async function saveDevelopmentUnit(input = {}) {
  const client = requireClient()

  if (!input.developmentId) {
    throw new Error('Development is required.')
  }

  if (!normalizeTextValue(input.unitNumber)) {
    throw new Error('Unit number is required.')
  }

  const normalized = normalizeDevelopmentUnitRow({
    id: input.id,
    development_id: input.developmentId,
    unit_number: input.unitNumber,
    unit_label: input.unitLabel,
    phase: input.phase,
    block: input.block,
    unit_type: input.unitType,
    bedrooms: input.bedrooms,
    bathrooms: input.bathrooms,
    parking_count: input.parkingCount,
    size_sqm: input.sizeSqm,
    list_price: input.listPrice,
    current_price: input.currentPrice,
    price: input.listPrice,
    status: input.status,
    vat_applicable: input.vatApplicable,
    floorplan_id: input.floorplanId,
    notes: input.notes,
  })

  const payload = {
    id: normalized.id || undefined,
    development_id: input.developmentId,
    unit_number: normalized.unitNumber,
    unit_label: normalizeNullableText(normalized.unitLabel),
    phase: normalizeNullableText(normalized.phase),
    block: normalizeNullableText(normalized.block),
    unit_type: normalizeNullableText(normalized.unitType),
    bedrooms: normalized.bedrooms,
    bathrooms: normalized.bathrooms,
    parking_count: normalized.parkingCount,
    size_sqm: normalized.sizeSqm,
    list_price: normalized.listPrice,
    current_price: normalized.currentPrice,
    price: normalized.listPrice ?? normalized.currentPrice ?? normalized.price ?? 0,
    status: normalized.status || 'Available',
    vat_applicable: normalized.vatApplicable,
    floorplan_id: normalized.floorplanId,
    notes: normalizeNullableText(normalized.notes),
  }

  const { data, error } = await client
    .from('units')
    .upsert(payload, { onConflict: 'id' })
    .select('id, development_id, unit_number, unit_label, phase, block, unit_type, bedrooms, bathrooms, parking_count, size_sqm, list_price, current_price, price, status, vat_applicable, floorplan_id, notes')
    .single()

  if (error) {
    if (isMissingColumnError(error, 'unit_label') || isMissingColumnError(error, 'list_price')) {
      const fallbackPayload = {
        id: normalized.id || undefined,
        development_id: input.developmentId,
        unit_number: normalized.unitNumber,
        phase: normalizeNullableText(normalized.phase),
        price: normalized.listPrice ?? normalized.currentPrice ?? normalized.price ?? 0,
        status: normalized.status || 'Available',
      }

      const fallback = await client
        .from('units')
        .upsert(fallbackPayload, { onConflict: 'id' })
        .select('id, development_id, unit_number, phase, price, status')
        .single()

      if (fallback.error) {
        throw fallback.error
      }

      return normalizeDevelopmentUnitRow(fallback.data)
    }
    throw error
  }

  return normalizeDevelopmentUnitRow(data)
}

export async function bulkUpdateUnitLifecycle(entries = [], input = {}) {
  const client = requireClient()
  const targets = Array.isArray(entries) ? entries.filter((item) => item?.unitId) : []

  if (!targets.length) {
    throw new Error('Select at least one unit to update.')
  }

  const mode = String(input.mode || '')
    .trim()
    .toLowerCase()

  if (!['available', 'in_progress', 'registered'].includes(mode)) {
    throw new Error('Choose a valid bulk status.')
  }

  let resolvedMainStage = 'AVAIL'
  let resolvedDetailedStage = 'Available'

  if (mode === 'in_progress') {
    resolvedMainStage = normalizeMainStage(input.mainStage, 'Finance Pending')
    if (!['DEP', 'OTP', 'FIN', 'ATTY', 'XFER'].includes(resolvedMainStage)) {
      throw new Error('Choose where the selected matters currently are in the transaction journey.')
    }
    resolvedDetailedStage = getDetailedStageFromMainStage(resolvedMainStage)
  } else if (mode === 'registered') {
    resolvedMainStage = 'REG'
    resolvedDetailedStage = 'Registered'
  }

  const subprocessType =
    mode === 'in_progress' && SUBPROCESS_TYPES.includes(String(input.subprocessType || '').trim().toLowerCase())
      ? String(input.subprocessType || '').trim().toLowerCase()
      : null

  if (mode === 'in_progress' && !subprocessType) {
    throw new Error('Select the subprocess currently carrying the matter.')
  }

  const progressNote = normalizeNullableText(input.progressNote)
  const listPrice = normalizeOptionalNumber(input.listPrice)
  const salesPrice = normalizeOptionalNumber(input.salesPrice)

  if (mode === 'registered' && (listPrice === null || salesPrice === null)) {
    throw new Error('List price and sales price are required when bulk-marking matters as registered.')
  }

  const subprocessLabel = subprocessType === 'finance' ? 'Finance workflow' : subprocessType === 'attorney' ? 'Attorney workflow' : null
  const now = new Date().toISOString()

  for (const entry of targets) {
    let unitPayload = {
      status: resolvedDetailedStage,
    }

    if (mode === 'registered') {
      unitPayload = {
        ...unitPayload,
        list_price: listPrice,
        current_price: salesPrice,
        price: listPrice,
      }
    }

    let unitUpdate = await client.from('units').update(unitPayload).eq('id', entry.unitId)

    if (
      unitUpdate.error &&
      (isMissingColumnError(unitUpdate.error, 'list_price') || isMissingColumnError(unitUpdate.error, 'current_price'))
    ) {
      const fallbackUnitPayload = {
        status: resolvedDetailedStage,
        ...(mode === 'registered' ? { price: listPrice } : {}),
      }
      unitUpdate = await client.from('units').update(fallbackUnitPayload).eq('id', entry.unitId)
    }

    if (unitUpdate.error) {
      throw unitUpdate.error
    }

    if (!entry.transactionId) {
      continue
    }

    if (mode !== 'available') {
      await assertReservationDepositGateForTransition(client, {
        transactionId: entry.transactionId,
        nextMainStage: resolvedMainStage,
        nextDetailedStage: resolvedDetailedStage,
      })
    }

    const transactionPayload = {
      stage: resolvedDetailedStage,
      current_main_stage: resolvedMainStage,
      is_active: mode !== 'available',
      updated_at: now,
    }

    if (mode === 'available') {
      transactionPayload.current_sub_stage_summary = null
      transactionPayload.next_action = 'Unit reset to available.'
      transactionPayload.comment = 'Unit reset to available.'
    }

    if (mode === 'in_progress') {
      const summary = progressNote ? `${subprocessLabel} • ${progressNote}` : subprocessLabel
      transactionPayload.current_sub_stage_summary = summary
      transactionPayload.next_action = progressNote || `Currently in ${subprocessLabel?.toLowerCase() || 'workflow'}.`
      transactionPayload.comment = transactionPayload.next_action
    }

    if (mode === 'registered') {
      transactionPayload.current_sub_stage_summary = 'Registered'
      transactionPayload.sales_price = salesPrice
      transactionPayload.next_action = 'Registered'
      transactionPayload.comment = 'Marked as registered in bulk update.'
    }

    let transactionUpdate = await client.from('transactions').update(transactionPayload).eq('id', entry.transactionId)

    if (
      transactionUpdate.error &&
      (isMissingColumnError(transactionUpdate.error, 'current_sub_stage_summary') ||
        isMissingColumnError(transactionUpdate.error, 'sales_price') ||
        isMissingColumnError(transactionUpdate.error, 'comment') ||
        isMissingColumnError(transactionUpdate.error, 'next_action') ||
        isMissingColumnError(transactionUpdate.error, 'current_main_stage') ||
        isMissingColumnError(transactionUpdate.error, 'is_active'))
    ) {
      const fallbackPayload = { ...transactionPayload }
      if (isMissingColumnError(transactionUpdate.error, 'current_sub_stage_summary')) {
        delete fallbackPayload.current_sub_stage_summary
      }
      if (isMissingColumnError(transactionUpdate.error, 'sales_price')) {
        delete fallbackPayload.sales_price
      }
      if (isMissingColumnError(transactionUpdate.error, 'comment')) {
        delete fallbackPayload.comment
      }
      if (isMissingColumnError(transactionUpdate.error, 'next_action')) {
        delete fallbackPayload.next_action
      }
      if (isMissingColumnError(transactionUpdate.error, 'current_main_stage')) {
        delete fallbackPayload.current_main_stage
      }
      if (isMissingColumnError(transactionUpdate.error, 'is_active')) {
        delete fallbackPayload.is_active
      }
      transactionUpdate = await client.from('transactions').update(fallbackPayload).eq('id', entry.transactionId)
    }

    if (transactionUpdate.error) {
      throw transactionUpdate.error
    }
  }

  return {
    success: true,
    count: targets.length,
    stage: resolvedDetailedStage,
  }
}

async function fetchActiveTransactionsForUnitIds(client, unitIds) {
  if (!unitIds.length) {
    return []
  }

  const baseQuery = client
    .from('transactions')
    .select(
      selectWithoutKnownMissingColumns(
        'id, unit_id, buyer_id, finance_type, purchaser_type, stage, current_main_stage, current_sub_stage_summary, risk_status, sales_price, purchase_price, cash_amount, bond_amount, deposit_amount, bank, attorney, bond_originator, next_action, comment, owner_user_id, access_level, lifecycle_state, attorney_stage, operational_state, waiting_on_role, registration_date, title_deed_number, registered_at, completed_at, archived_at, cancelled_at, last_meaningful_activity_at, final_report_generated_at, updated_at, created_at',
      ),
    )
    .in('unit_id', unitIds)
    .order('updated_at', { ascending: false })

  const withActiveFlag = await baseQuery.eq('is_active', true)
  if (!withActiveFlag.error) {
    return (withActiveFlag.data || []).filter((item) => normalizeStage(item?.stage, null) !== 'Available')
  }

  if (
    !isMissingColumnError(withActiveFlag.error, 'risk_status') &&
    !isMissingColumnError(withActiveFlag.error, 'is_active') &&
    !isMissingColumnError(withActiveFlag.error, 'sales_price') &&
    !isMissingColumnError(withActiveFlag.error, 'purchase_price') &&
    !isMissingColumnError(withActiveFlag.error, 'cash_amount') &&
    !isMissingColumnError(withActiveFlag.error, 'bond_amount') &&
    !isMissingColumnError(withActiveFlag.error, 'deposit_amount') &&
    !isMissingColumnError(withActiveFlag.error, 'bank') &&
    !isMissingColumnError(withActiveFlag.error, 'owner_user_id') &&
    !isMissingColumnError(withActiveFlag.error, 'access_level') &&
    !isMissingColumnError(withActiveFlag.error, 'current_main_stage') &&
    !isMissingColumnError(withActiveFlag.error, 'current_sub_stage_summary') &&
    !isMissingColumnError(withActiveFlag.error, 'purchaser_type') &&
    !isMissingColumnError(withActiveFlag.error, 'comment') &&
    !isMissingColumnError(withActiveFlag.error, 'lifecycle_state') &&
    !isMissingColumnError(withActiveFlag.error, 'attorney_stage') &&
    !isMissingColumnError(withActiveFlag.error, 'operational_state') &&
    !isMissingColumnError(withActiveFlag.error, 'waiting_on_role') &&
    !isMissingColumnError(withActiveFlag.error, 'registration_date') &&
    !isMissingColumnError(withActiveFlag.error, 'title_deed_number') &&
    !isMissingColumnError(withActiveFlag.error, 'registered_at') &&
    !isMissingColumnError(withActiveFlag.error, 'completed_at') &&
    !isMissingColumnError(withActiveFlag.error, 'archived_at') &&
    !isMissingColumnError(withActiveFlag.error, 'cancelled_at') &&
    !isMissingColumnError(withActiveFlag.error, 'last_meaningful_activity_at') &&
    !isMissingColumnError(withActiveFlag.error, 'final_report_generated_at')
  ) {
    throw withActiveFlag.error
  }

  registerKnownMissingColumns(withActiveFlag.error, [
    'risk_status',
    'is_active',
    'sales_price',
    'purchase_price',
    'cash_amount',
    'bond_amount',
    'deposit_amount',
    'bank',
    'owner_user_id',
    'access_level',
    'current_main_stage',
    'current_sub_stage_summary',
    'purchaser_type',
    'comment',
    'lifecycle_state',
    'attorney_stage',
    'operational_state',
    'waiting_on_role',
    'registration_date',
    'title_deed_number',
    'registered_at',
    'completed_at',
    'archived_at',
    'cancelled_at',
    'last_meaningful_activity_at',
    'final_report_generated_at',
  ])

  let fallbackQuery = await client
    .from('transactions')
    .select(
      selectWithoutKnownMissingColumns(
        'id, unit_id, buyer_id, finance_type, purchaser_type, stage, current_main_stage, current_sub_stage_summary, sales_price, purchase_price, cash_amount, bond_amount, deposit_amount, bank, attorney, bond_originator, next_action, comment, owner_user_id, access_level, lifecycle_state, attorney_stage, operational_state, waiting_on_role, registration_date, title_deed_number, registered_at, completed_at, archived_at, cancelled_at, last_meaningful_activity_at, final_report_generated_at, updated_at, created_at',
      ),
    )
    .in('unit_id', unitIds)
    .order('updated_at', { ascending: false })

  if (
    fallbackQuery.error &&
    (isMissingColumnError(fallbackQuery.error, 'sales_price') ||
      isMissingColumnError(fallbackQuery.error, 'purchase_price') ||
      isMissingColumnError(fallbackQuery.error, 'cash_amount') ||
      isMissingColumnError(fallbackQuery.error, 'bond_amount') ||
      isMissingColumnError(fallbackQuery.error, 'deposit_amount') ||
      isMissingColumnError(fallbackQuery.error, 'bank') ||
      isMissingColumnError(fallbackQuery.error, 'owner_user_id') ||
      isMissingColumnError(fallbackQuery.error, 'access_level') ||
      isMissingColumnError(fallbackQuery.error, 'current_main_stage') ||
      isMissingColumnError(fallbackQuery.error, 'current_sub_stage_summary') ||
      isMissingColumnError(fallbackQuery.error, 'purchaser_type') ||
      isMissingColumnError(fallbackQuery.error, 'comment') ||
      isMissingColumnError(fallbackQuery.error, 'lifecycle_state') ||
      isMissingColumnError(fallbackQuery.error, 'attorney_stage') ||
      isMissingColumnError(fallbackQuery.error, 'operational_state') ||
      isMissingColumnError(fallbackQuery.error, 'waiting_on_role') ||
      isMissingColumnError(fallbackQuery.error, 'registration_date') ||
      isMissingColumnError(fallbackQuery.error, 'title_deed_number') ||
      isMissingColumnError(fallbackQuery.error, 'registered_at') ||
      isMissingColumnError(fallbackQuery.error, 'completed_at') ||
      isMissingColumnError(fallbackQuery.error, 'archived_at') ||
      isMissingColumnError(fallbackQuery.error, 'cancelled_at') ||
      isMissingColumnError(fallbackQuery.error, 'last_meaningful_activity_at') ||
      isMissingColumnError(fallbackQuery.error, 'final_report_generated_at'))
  ) {
    registerKnownMissingColumns(fallbackQuery.error, [
      'sales_price',
      'purchase_price',
      'cash_amount',
      'bond_amount',
      'deposit_amount',
      'bank',
      'owner_user_id',
      'access_level',
      'current_main_stage',
      'current_sub_stage_summary',
      'purchaser_type',
      'comment',
      'lifecycle_state',
      'attorney_stage',
      'operational_state',
      'waiting_on_role',
      'registration_date',
      'title_deed_number',
      'registered_at',
      'completed_at',
      'archived_at',
      'cancelled_at',
      'last_meaningful_activity_at',
      'final_report_generated_at',
    ])
    fallbackQuery = await client
      .from('transactions')
      .select('id, unit_id, buyer_id, finance_type, stage, attorney, bond_originator, next_action, updated_at, created_at')
      .in('unit_id', unitIds)
      .order('updated_at', { ascending: false })
  }

  if (fallbackQuery.error) {
    throw fallbackQuery.error
  }

  return (fallbackQuery.data || []).filter((item) => normalizeStage(item?.stage, null) !== 'Available')
}

export async function fetchUnitsForTransactionSetup(developmentId) {
  const client = requireClient()

  if (!developmentId) {
    return []
  }

  const { data: units, error: unitsError } = await client
    .from('units')
    .select('id, unit_number, phase, price, status, development_id')
    .eq('development_id', developmentId)
    .order('unit_number', { ascending: true })

  if (unitsError) {
    throw unitsError
  }

  const unitIds = units.map((unit) => unit.id)
  const activeTransactions = await fetchActiveTransactionsForUnitIds(client, unitIds)

  const latestTransactionByUnit = {}
  for (const transaction of activeTransactions) {
    if (!latestTransactionByUnit[transaction.unit_id]) {
      latestTransactionByUnit[transaction.unit_id] = transaction
    }
  }

  const buyerIds = [...new Set(activeTransactions.map((transaction) => transaction.buyer_id).filter(Boolean))]
  let buyersById = {}

  if (buyerIds.length) {
    const { data: buyers, error: buyersError } = await client.from('buyers').select('id, name').in('id', buyerIds)

    if (buyersError) {
      throw buyersError
    }

    buyersById = buyers.reduce((accumulator, buyer) => {
      accumulator[buyer.id] = buyer
      return accumulator
    }, {})
  }

  return units.map((unit) => {
    const activeTransaction = latestTransactionByUnit[unit.id] || null
    const activeBuyer = activeTransaction?.buyer_id ? buyersById[activeTransaction.buyer_id] || null : null

    return {
      ...unit,
      activeTransaction: activeTransaction
        ? {
            id: activeTransaction.id,
            stage: activeTransaction.stage,
            financeType: activeTransaction.finance_type,
            buyerName: activeBuyer?.name || null,
            updatedAt: activeTransaction.updated_at,
          }
        : null,
    }
  })
}

function normalizeOptionalBoolean(value) {
  if (value === true || value === false) {
    return value
  }

  return null
}

function normalizeOptionalNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null
  }

  const parsed = Number(value)
  if (Number.isNaN(parsed)) {
    return null
  }

  return parsed
}

function normalizeReservationStatus(value, { required = false } = {}) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()

  if (RESERVATION_STATUSES.includes(normalized)) {
    if (!required && normalized !== 'not_required') {
      return 'not_required'
    }
    return normalized
  }

  if (!required) {
    return 'not_required'
  }

  if (normalized === 'complete' || normalized === 'completed') {
    return 'paid'
  }

  return 'pending'
}

function normalizeReservationPaymentDetails(input = {}) {
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
    query = await client
      .from('transactions')
      .select('id, reservation_required')
      .eq('id', transactionId)
      .maybeSingle()
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
    paidDate = null,
  } = {},
) {
  const normalizedRequired = Boolean(required)
  const normalizedAmount = normalizedRequired ? normalizeOptionalNumber(amount) : null
  const normalizedStatus = normalizeReservationStatus(status, { required: normalizedRequired })
  const normalizedPaymentDetails = normalizedRequired ? normalizeReservationPaymentDetails(paymentDetails) : {}
  const normalizedPaidDate =
    normalizedRequired && ['paid', 'verified'].includes(normalizedStatus)
      ? normalizeTextValue(paidDate) || new Date().toISOString().slice(0, 10)
      : null

  const updatePayload = {
    reservation_required: normalizedRequired,
    reservation_amount: normalizedAmount,
    reservation_status: normalizedStatus,
    reservation_payment_details: normalizedPaymentDetails,
    reservation_paid_date: normalizedPaidDate,
  }

  let updateResult = await client.from('transactions').update(updatePayload).eq('id', transactionId)

  if (
    updateResult.error &&
    (isMissingColumnError(updateResult.error, 'reservation_required') ||
      isMissingColumnError(updateResult.error, 'reservation_amount') ||
      isMissingColumnError(updateResult.error, 'reservation_status') ||
      isMissingColumnError(updateResult.error, 'reservation_payment_details') ||
      isMissingColumnError(updateResult.error, 'reservation_paid_date'))
  ) {
    const fallbackPayload = { ...updatePayload }
    if (isMissingColumnError(updateResult.error, 'reservation_required')) {
      delete fallbackPayload.reservation_required
      delete fallbackPayload.reservation_amount
      delete fallbackPayload.reservation_status
      delete fallbackPayload.reservation_payment_details
      delete fallbackPayload.reservation_paid_date
    } else {
      if (isMissingColumnError(updateResult.error, 'reservation_amount')) {
        delete fallbackPayload.reservation_amount
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

function buildReservationPaymentReference({
  referenceFormat = '',
  unitNumber = '',
  transactionId = '',
  buyerName = '',
} = {}) {
  const base = normalizeTextValue(referenceFormat) || 'RES-{unit}-{txn}'
  const compactTransactionId = String(transactionId || '').replaceAll('-', '').slice(0, 8).toUpperCase()
  const compactBuyerName = String(buyerName || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 30)

  return base
    .replaceAll('{unit}', unitNumber ? String(unitNumber).trim() : 'UNIT')
    .replaceAll('{txn}', compactTransactionId || 'TXN')
    .replaceAll('{buyer}', compactBuyerName || 'BUYER')
}

function isReservationProofDocumentKey(value) {
  return (
    String(value || '')
      .trim()
      .toLowerCase() === 'reservation_deposit_proof'
  )
}

async function fetchTransactionWorkflowDocumentsForSalesGate(client, transactionId) {
  let query = await client
    .from('documents')
    .select('id, transaction_id, name, category, document_type, stage_key, is_client_visible, created_at')
    .eq('transaction_id', transactionId)
    .order('created_at', { ascending: false })

  if (
    query.error &&
    (isMissingColumnError(query.error, 'document_type') ||
      isMissingColumnError(query.error, 'stage_key') ||
      isMissingColumnError(query.error, 'is_client_visible'))
  ) {
    query = await client
      .from('documents')
      .select('id, transaction_id, name, category, created_at')
      .eq('transaction_id', transactionId)
      .order('created_at', { ascending: false })
  }

  if (query.error) {
    if (isMissingSchemaError(query.error)) {
      return []
    }
    throw query.error
  }

  return query.data || []
}

async function fetchSalesRequiredDocumentsForGate(client, transactionId) {
  let query = await client
    .from('transaction_required_documents')
    .select('id, status, is_uploaded, is_required, enabled')
    .eq('transaction_id', transactionId)

  if (
    query.error &&
    (isMissingColumnError(query.error, 'status') || isMissingColumnError(query.error, 'enabled'))
  ) {
    query = await client
      .from('transaction_required_documents')
      .select('id, is_uploaded, is_required')
      .eq('transaction_id', transactionId)
  }

  if (query.error) {
    if (isMissingSchemaError(query.error)) {
      return []
    }
    throw query.error
  }

  return query.data || []
}

async function computeSalesWorkflowGateSnapshot(client, transactionId) {
  if (!transactionId) {
    return null
  }

  let transactionQuery = await client
    .from('transactions')
    .select('id, purchaser_type, onboarding_completed_at, external_onboarding_submitted_at')
    .eq('id', transactionId)
    .maybeSingle()

  if (
    transactionQuery.error &&
    (isMissingColumnError(transactionQuery.error, 'purchaser_type') ||
      isMissingColumnError(transactionQuery.error, 'onboarding_completed_at') ||
      isMissingColumnError(transactionQuery.error, 'external_onboarding_submitted_at'))
  ) {
    transactionQuery = await client
      .from('transactions')
      .select('id, purchaser_type')
      .eq('id', transactionId)
      .maybeSingle()
  }

  if (transactionQuery.error) {
    if (isMissingSchemaError(transactionQuery.error)) {
      return null
    }
    throw transactionQuery.error
  }

  const transaction = transactionQuery.data || null
  if (!transaction) {
    return null
  }

  const onboardingRecord = await getOrCreateTransactionOnboardingRecord(
    client,
    {
      transactionId,
      purchaserType: transaction.purchaser_type || 'individual',
    },
    { createIfMissing: false },
  )

  const [documents, requiredDocuments] = await Promise.all([
    fetchTransactionWorkflowDocumentsForSalesGate(client, transactionId),
    fetchSalesRequiredDocumentsForGate(client, transactionId),
  ])

  return resolveSalesWorkflowSnapshot({
    onboardingStatus: onboardingRecord?.status || 'Not Started',
    onboardingCompletedAt: transaction?.onboarding_completed_at || null,
    externalOnboardingSubmittedAt: transaction?.external_onboarding_submitted_at || null,
    documents,
    requiredDocuments,
  })
}

async function assertSalesWorkflowReadyForFinanceTransition(client, transactionId) {
  const snapshot = await computeSalesWorkflowGateSnapshot(client, transactionId)
  if (!snapshot || snapshot.readyForFinance) {
    return snapshot
  }

  const blockers = []
  if (!snapshot.onboardingComplete) {
    blockers.push('Client onboarding is not completed.')
  }
  if (!snapshot.signedOtpReceived) {
    blockers.push('Signed OTP has not been uploaded.')
  }
  if (!snapshot.supportingDocsComplete) {
    blockers.push('Supporting documentation is still incomplete.')
  }

  throw new Error(
    `Sales Workflow must be Ready for Finance before finance can start. ${blockers.join(' ')}`.trim(),
  )
}

function isFinanceReadyForTransferFromSubprocesses(subprocesses = []) {
  const financeProcess = (subprocesses || []).find((item) => item?.process_type === 'finance') || null
  const financeSteps = financeProcess?.steps || []
  return financeSteps.some(
    (step) =>
      String(step?.status || '').trim().toLowerCase() === 'completed' &&
      ['ready_for_transfer', 'bond_instruction_sent_to_attorneys'].includes(step?.step_key),
  )
}

async function assertTransferWorkflowReadyForTransition(client, transactionId) {
  const salesSnapshot = await computeSalesWorkflowGateSnapshot(client, transactionId)
  const subprocesses = await ensureTransactionSubprocesses(client, transactionId, { createIfMissing: false })
  const financeReadyForTransfer = isFinanceReadyForTransferFromSubprocesses(subprocesses)

  const blockers = []
  if (!salesSnapshot?.readyForFinance) {
    blockers.push('Sales Workflow is not complete yet.')
  }
  if (!financeReadyForTransfer) {
    blockers.push('Finance Workflow is not marked Ready for Transfer.')
  }
  if (!salesSnapshot?.signedOtpReceived) {
    blockers.push('Signed contract / OTP is not available in transaction documents.')
  }

  if (!blockers.length) {
    return {
      salesReadyForFinance: Boolean(salesSnapshot?.readyForFinance),
      financeReadyForTransfer,
      signedOtpReceived: Boolean(salesSnapshot?.signedOtpReceived),
    }
  }

  throw new Error(
    `Transfer workflow unlocks once Finance is completed and the matter is ready for attorney processing. ${blockers.join(' ')}`.trim(),
  )
}

function resolveLaneKeyFromProcessType(processType) {
  const normalizedType = String(processType || '').trim().toLowerCase()
  if (normalizedType === 'finance') {
    return 'finance'
  }
  if (normalizedType === 'attorney') {
    return 'transfer'
  }
  return ''
}

function canEditWorkflowLaneFromParticipantRow({ laneKey, actorRole, participantRow }) {
  if (!laneKey || !participantRow) {
    return false
  }

  const lanePermissions = resolveWorkflowLanePermissions(laneKey, {
    actorRole,
    canEditCoreTransaction: Boolean(participantRow.can_edit_core_transaction),
    canEditFinanceWorkflow: Boolean(participantRow.can_edit_finance_workflow),
    canEditAttorneyWorkflow: Boolean(participantRow.can_edit_attorney_workflow),
    isFinanceOwner: normalizeRoleType(actorRole) === 'bond_originator',
    isTransactionOwner: Boolean(participantRow.can_edit_core_transaction),
  })

  return lanePermissions.canEditWorkflowLane
}

async function assertGuidedSubprocessSequentialTransition(client, { subprocessId, stepId, nextStatus, laneLabel }) {
  if (!subprocessId || !stepId) {
    return
  }

  const normalizedStatus = normalizeSubprocessStepStatus(nextStatus)
  if (normalizedStatus === 'not_started') {
    return
  }

  const financeStepsQuery = await client
    .from('transaction_subprocess_steps')
    .select('id, step_key, step_label, status, sort_order')
    .eq('subprocess_id', subprocessId)
    .order('sort_order', { ascending: true })

  if (financeStepsQuery.error) {
    if (isMissingSchemaError(financeStepsQuery.error)) {
      return
    }
    throw financeStepsQuery.error
  }

  const steps = (financeStepsQuery.data || []).map((step) => ({
    ...step,
    status: normalizeSubprocessStepStatus(step.status),
  }))

  if (!steps.length) {
    return
  }

  const targetIndex = steps.findIndex((step) => String(step.id) === String(stepId))
  if (targetIndex < 0) {
    throw new Error('Finance workflow step was not found for this transaction.')
  }

  const firstIncompleteIndex = steps.findIndex((step) => step.status !== 'completed')
  if (firstIncompleteIndex === -1) {
    throw new Error('Finance Workflow is already complete.')
  }

  if (targetIndex !== firstIncompleteIndex) {
    const currentStepLabel = steps[firstIncompleteIndex]?.step_label || 'the active finance stage'
    throw new Error(`${laneLabel || 'Workflow'} is controlled. Complete "${currentStepLabel}" before updating later stages.`)
  }
}

async function assertReservationDepositGateForTransition(
  client,
  {
    transactionId,
    previousMainStage = null,
    nextMainStage = null,
    nextDetailedStage = null,
  } = {},
) {
  if (!transactionId) {
    return
  }

  let transactionQuery = await client
    .from('transactions')
    .select('id, stage, current_main_stage, reservation_required, reservation_status')
    .eq('id', transactionId)
    .maybeSingle()

  if (
    transactionQuery.error &&
    (isMissingColumnError(transactionQuery.error, 'current_main_stage') ||
      isMissingColumnError(transactionQuery.error, 'reservation_required') ||
      isMissingColumnError(transactionQuery.error, 'reservation_status'))
  ) {
    transactionQuery = await client
      .from('transactions')
      .select('id, stage')
      .eq('id', transactionId)
      .maybeSingle()
  }

  if (transactionQuery.error) {
    throw transactionQuery.error
  }

  const transaction = transactionQuery.data || null
  if (!transaction || !transaction.reservation_required) {
    return
  }

  const currentMain =
    previousMainStage || normalizeMainStage(transaction.current_main_stage, normalizeStage(transaction.stage, 'Available'))
  const targetMain = normalizeMainStage(
    nextMainStage || getMainStageFromDetailedStage(nextDetailedStage || transaction.stage || 'Available'),
    nextDetailedStage || transaction.stage || 'Available',
  )
  const depositStageIndex = getMainStageIndex('DEP')
  const currentStageIndex = getMainStageIndex(currentMain)
  const targetStageIndex = getMainStageIndex(targetMain)

  // Enforce only when trying to advance out of reservation/deposit stages.
  const isAdvancingPastDeposit = currentStageIndex <= depositStageIndex && targetStageIndex > depositStageIndex
  if (!isAdvancingPastDeposit) {
    return
  }

  const reservationStatus = normalizeReservationStatus(transaction.reservation_status, { required: true })
  if (reservationStatus === 'verified') {
    return
  }

  throw new Error('Reservation deposit must be verified before moving this transaction past the reservation stage.')
}

async function updateReservationFromRequiredDocumentStatusIfNeeded(
  client,
  {
    transactionId,
    documentKey,
    requiredDocumentStatus = 'missing',
    documentId = null,
    actorUserId = null,
    reviewNotes = '',
  } = {},
) {
  if (!transactionId || !isReservationProofDocumentKey(documentKey)) {
    return null
  }

  const nowIso = new Date().toISOString()
  const today = nowIso.slice(0, 10)
  const normalizedRequiredStatus = normalizeRequiredStatus(requiredDocumentStatus, 'missing')
  const reviewNote = normalizeNullableText(reviewNotes)
  const payload = {
    updated_at: nowIso,
  }

  if (normalizedRequiredStatus === 'accepted') {
    payload.reservation_status = 'verified'
    payload.reservation_paid_date = today
    payload.reservation_reviewed_at = nowIso
    payload.reservation_reviewed_by = actorUserId || null
    payload.reservation_review_notes = reviewNote || 'Proof of payment approved.'
  } else if (normalizedRequiredStatus === 'reupload_required') {
    payload.reservation_status = 'rejected'
    payload.reservation_reviewed_at = nowIso
    payload.reservation_reviewed_by = actorUserId || null
    payload.reservation_review_notes = reviewNote || 'Proof of payment rejected and reupload requested.'
  } else if (['uploaded', 'under_review'].includes(normalizedRequiredStatus)) {
    payload.reservation_status = 'paid'
    payload.reservation_paid_date = today
    payload.reservation_proof_uploaded_at = nowIso
    if (documentId) {
      payload.reservation_proof_document = documentId
    }
  } else {
    payload.reservation_status = 'pending'
  }

  let updateResult = await client.from('transactions').update(payload).eq('id', transactionId)

  if (
    updateResult.error &&
    (isMissingColumnError(updateResult.error, 'reservation_status') ||
      isMissingColumnError(updateResult.error, 'reservation_paid_date') ||
      isMissingColumnError(updateResult.error, 'reservation_proof_uploaded_at') ||
      isMissingColumnError(updateResult.error, 'reservation_proof_document') ||
      isMissingColumnError(updateResult.error, 'reservation_reviewed_at') ||
      isMissingColumnError(updateResult.error, 'reservation_reviewed_by') ||
      isMissingColumnError(updateResult.error, 'reservation_review_notes'))
  ) {
    const fallbackPayload = {
      updated_at: nowIso,
    }

    if (normalizedRequiredStatus === 'accepted') {
      fallbackPayload.reservation_status = 'verified'
      fallbackPayload.reservation_paid_date = today
    } else if (normalizedRequiredStatus === 'reupload_required') {
      fallbackPayload.reservation_status = 'rejected'
    } else if (['uploaded', 'under_review'].includes(normalizedRequiredStatus)) {
      fallbackPayload.reservation_status = 'paid'
      fallbackPayload.reservation_paid_date = today
      if (documentId) {
        fallbackPayload.reservation_proof_document = documentId
      }
    } else {
      fallbackPayload.reservation_status = 'pending'
    }

    updateResult = await client.from('transactions').update(fallbackPayload).eq('id', transactionId)
  }

  if (updateResult.error && !isMissingSchemaError(updateResult.error)) {
    throw updateResult.error
  }

  return {
    transactionId,
    documentKey,
    status: normalizedRequiredStatus,
    updatedAt: nowIso,
  }
}

async function requestReservationDepositEmailIfPossible(
  client,
  {
    transactionId,
    actorRole = 'developer',
    actorUserId = null,
    forceResend = false,
    source = 'reservation_deposit_request',
  } = {},
) {
  if (!transactionId) {
    throw new Error('Transaction is required.')
  }

  let transactionQuery = await client
    .from('transactions')
    .select(
      'id, development_id, unit_id, buyer_id, transaction_reference, reservation_required, reservation_amount, reservation_status, reservation_payment_details, reservation_requested_at, reservation_email_sent_at',
    )
    .eq('id', transactionId)
    .maybeSingle()

  if (
    transactionQuery.error &&
    (isMissingColumnError(transactionQuery.error, 'transaction_reference') ||
      isMissingColumnError(transactionQuery.error, 'reservation_payment_details') ||
      isMissingColumnError(transactionQuery.error, 'reservation_requested_at') ||
      isMissingColumnError(transactionQuery.error, 'reservation_email_sent_at'))
  ) {
    transactionQuery = await client
      .from('transactions')
      .select('id, development_id, unit_id, buyer_id, reservation_required, reservation_amount, reservation_status')
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

  if (!transaction.reservation_required) {
    return {
      sent: false,
      reason: 'not_required',
      transactionId,
      buyerEmail: '',
      mailto: '',
    }
  }

  const reservationStatus = normalizeReservationStatus(transaction.reservation_status, { required: true })
  if (!forceResend && reservationStatus === 'verified') {
    return {
      sent: false,
      reason: 'already_verified',
      transactionId,
      buyerEmail: '',
      mailto: '',
    }
  }

  const [buyerQuery, unitQuery, developmentQuery, settings] = await Promise.all([
    transaction.buyer_id
      ? client.from('buyers').select('id, name, email').eq('id', transaction.buyer_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    transaction.unit_id
      ? client.from('units').select('id, unit_number').eq('id', transaction.unit_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    transaction.development_id
      ? client.from('developments').select('id, name').eq('id', transaction.development_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    transaction.development_id
      ? ensureDevelopmentSettings(client, transaction.development_id, { createIfMissing: false })
      : Promise.resolve(DEFAULT_DEVELOPMENT_SETTINGS),
  ])

  if (buyerQuery.error) throw buyerQuery.error
  if (unitQuery.error && !isMissingSchemaError(unitQuery.error)) throw unitQuery.error
  if (developmentQuery.error && !isMissingSchemaError(developmentQuery.error)) throw developmentQuery.error

  const buyerName = normalizeTextValue(buyerQuery.data?.name || 'Client')
  const buyerEmail = normalizeEmailAddress(buyerQuery.data?.email)
  if (!buyerEmail) {
    return {
      sent: false,
      reason: 'missing_buyer_email',
      transactionId,
      buyerEmail: '',
      mailto: '',
    }
  }

  const fallbackDetails = normalizeReservationPaymentDetails(settings?.reservation_deposit_payment_details || {})
  const paymentDetails = normalizeReservationPaymentDetails(transaction.reservation_payment_details || fallbackDetails)
  const reservationAmount = normalizeOptionalNumber(transaction.reservation_amount ?? settings?.reservation_deposit_amount)
  const paymentReference = buildReservationPaymentReference({
    referenceFormat: paymentDetails.payment_reference_format,
    unitNumber: normalizeTextValue(unitQuery.data?.unit_number),
    transactionId: transaction.id,
    buyerName,
  })

  const nowIso = new Date().toISOString()
  const today = nowIso.slice(0, 10)
  const nextReservationStatus = reservationStatus === 'verified' ? 'verified' : 'pending'
  const updatePayload = {
    reservation_status: nextReservationStatus,
    reservation_amount: reservationAmount,
    reservation_payment_details: paymentDetails,
    reservation_requested_at: transaction.reservation_requested_at || nowIso,
    reservation_email_sent_at: nowIso,
    updated_at: nowIso,
  }

  let updateResult = await client.from('transactions').update(updatePayload).eq('id', transaction.id)

  if (
    updateResult.error &&
    (isMissingColumnError(updateResult.error, 'reservation_payment_details') ||
      isMissingColumnError(updateResult.error, 'reservation_requested_at') ||
      isMissingColumnError(updateResult.error, 'reservation_email_sent_at'))
  ) {
    const fallbackPayload = {
      reservation_status: nextReservationStatus,
      reservation_amount: reservationAmount,
      updated_at: nowIso,
    }
    updateResult = await client.from('transactions').update(fallbackPayload).eq('id', transaction.id)
  }

  if (updateResult.error) {
    throw updateResult.error
  }

  const developmentLabel = normalizeTextValue(developmentQuery.data?.name || 'your development')
  const unitLabel = normalizeTextValue(unitQuery.data?.unit_number ? `Unit ${unitQuery.data.unit_number}` : '')
  const subject = `Reservation deposit required${unitLabel ? ` - ${unitLabel}` : ''}`
  const bodyLines = [
    `Hi ${buyerName || 'there'},`,
    '',
    `A reservation deposit is required for ${developmentLabel}${unitLabel ? ` (${unitLabel})` : ''}.`,
    reservationAmount !== null ? `Amount due: ${new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(reservationAmount)}` : '',
    paymentDetails.account_holder_name ? `Account holder: ${paymentDetails.account_holder_name}` : '',
    paymentDetails.bank_name ? `Bank: ${paymentDetails.bank_name}` : '',
    paymentDetails.account_number ? `Account number: ${paymentDetails.account_number}` : '',
    paymentDetails.branch_code ? `Branch code: ${paymentDetails.branch_code}` : '',
    paymentDetails.account_type ? `Account type: ${paymentDetails.account_type}` : '',
    `Reference: ${paymentReference}`,
    paymentDetails.payment_instructions ? `Instructions: ${paymentDetails.payment_instructions}` : '',
    '',
    'Please upload your reservation deposit proof of payment in the Documents section.',
    '',
    'If you need help, reply to this email and our team will assist you.',
  ].filter(Boolean)
  const mailto = `mailto:${buyerEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyLines.join('\n'))}`

  await logTransactionEventIfPossible(client, {
    transactionId: transaction.id,
    eventType: 'TransactionUpdated',
    createdBy: actorUserId || null,
    createdByRole: normalizeRoleType(actorRole),
    eventData: {
      source,
      reservationDeposit: {
        action: forceResend ? 'resent' : 'requested',
        requestedAt: transaction.reservation_requested_at || nowIso,
        emailSentAt: nowIso,
        amount: reservationAmount,
        paymentReference,
        recipient: buyerEmail,
      },
    },
  })

  await notifyRolesForTransaction(client, {
    transactionId: transaction.id,
    roleTypes: ['developer', 'agent', 'attorney'],
    title: forceResend ? 'Reservation deposit email resent' : 'Reservation deposit requested',
    message: `${buyerName || 'Client'} was sent reservation deposit payment instructions.`,
    notificationType: 'document_uploaded',
    eventType: 'TransactionUpdated',
    eventData: {
      source,
      reservationStatus: nextReservationStatus,
      reservationAmount,
      recipient: buyerEmail,
    },
    dedupePrefix: `${source}:${forceResend ? 'resend' : 'send'}:${today}`,
    excludeUserId: actorUserId || null,
  })

  return {
    sent: true,
    reason: forceResend ? 'resent' : 'sent',
    transactionId: transaction.id,
    buyerEmail,
    mailto,
    amount: reservationAmount,
    paymentReference,
    status: nextReservationStatus,
    emailSentAt: nowIso,
  }
}

async function invokeReservationDepositEmailEdgeFunction(
  client,
  {
    transactionId,
    forceResend = false,
    source = 'reservation_deposit_request',
    actorRole = 'developer',
    actorUserId = null,
  } = {},
) {
  const { data, error } = await invokeEdgeFunction('send-email', {
    client,
    body: {
      type: 'reservation_deposit',
      transactionId,
      resend: Boolean(forceResend),
      source,
      actorRole,
      actorUserId,
    },
  })

  if (error) {
    throw error
  }

  return data || {
    ok: true,
    type: 'reservation_deposit',
    sent: false,
    reason: 'unknown',
    transactionId,
  }
}

export async function sendReservationDepositRequest({
  transactionId,
  forceResend = false,
  source = 'reservation_deposit_manual_request',
} = {}) {
  const client = requireClient()
  const actorProfile = await resolveActiveProfileContext(client)

  return invokeReservationDepositEmailEdgeFunction(client, {
    transactionId,
    forceResend: Boolean(forceResend),
    source,
    actorRole: normalizeRoleType(actorProfile.role || 'developer'),
    actorUserId: actorProfile.userId || null,
  })
}

function resolvePurchasePrice({ setup = {}, formData = {}, transaction = null } = {}) {
  const candidates = [
    setup?.salesPrice,
    formData?.purchase_price,
    transaction?.purchase_price,
    transaction?.sales_price,
  ]

  for (const candidate of candidates) {
    const normalized = normalizeOptionalNumber(candidate)
    if (normalized !== null) {
      return normalized
    }
  }

  return null
}

async function findOrCreateBuyer(client, { name, phone, email }) {
  const normalizedName = name.trim()
  const normalizedPhone = phone?.trim() || null
  const normalizedEmail = email?.trim().toLowerCase() || null

  let existing = null

  if (normalizedEmail) {
    const { data, error } = await client
      .from('buyers')
      .select('id, name, phone, email')
      .ilike('email', normalizedEmail)
      .maybeSingle()

    if (error) {
      throw error
    }

    existing = data
  }

  if (!existing && normalizedPhone) {
    const { data, error } = await client
      .from('buyers')
      .select('id, name, phone, email')
      .eq('phone', normalizedPhone)
      .maybeSingle()

    if (error) {
      throw error
    }

    existing = data
  }

  if (!existing) {
    const { data, error } = await client
      .from('buyers')
      .insert({
        name: normalizedName,
        phone: normalizedPhone,
        email: normalizedEmail,
      })
      .select('id, name, phone, email')
      .single()

    if (error) {
      throw error
    }

    return data
  }

  const shouldUpdate =
    existing.name !== normalizedName ||
    (!!normalizedPhone && existing.phone !== normalizedPhone) ||
    (!!normalizedEmail && existing.email?.toLowerCase() !== normalizedEmail)

  if (!shouldUpdate) {
    return existing
  }

  const { data, error } = await client
    .from('buyers')
    .update({
      name: normalizedName,
      phone: normalizedPhone || existing.phone || null,
      email: normalizedEmail || existing.email || null,
    })
    .eq('id', existing.id)
    .select('id, name, phone, email')
    .single()

  if (error) {
    throw error
  }

  return data
}

export async function createClientRecord({ name, phone, email }) {
  const client = requireClient()

  if (!String(name || '').trim()) {
    throw new Error('Client name is required.')
  }

  return findOrCreateBuyer(client, {
    name: String(name || '').trim(),
    phone: String(phone || '').trim(),
    email: String(email || '').trim(),
  })
}

export async function saveDeveloperTransactionWorkspace({
  unitId,
  transactionId = null,
  buyerName = '',
  buyerPhone = '',
  buyerEmail = '',
  mode = 'available',
  mainStage = 'FIN',
  subprocessType = 'finance',
  progressNote = '',
  financeType = 'cash',
  purchaserType = 'individual',
  financeManagedBy = 'bond_originator',
  listPrice = null,
  salesPrice = null,
} = {}) {
  const client = requireClient()

  if (!unitId) {
    throw new Error('Unit is required.')
  }

  const normalizedMode = String(mode || '')
    .trim()
    .toLowerCase()

  if (!['available', 'in_progress', 'registered'].includes(normalizedMode)) {
    throw new Error('Choose a valid transaction status.')
  }

  let existingTransaction = null

  if (transactionId) {
    let existingQuery = await client
      .from('transactions')
      .select(
        'id, development_id, unit_id, buyer_id, finance_type, purchaser_type, finance_managed_by, stage, current_main_stage, current_sub_stage_summary, assigned_agent, assigned_agent_email, attorney, assigned_attorney_email, bond_originator, assigned_bond_originator_email, next_action, sales_price, is_active',
      )
      .eq('id', transactionId)
      .maybeSingle()

    if (
      existingQuery.error &&
      (isMissingColumnError(existingQuery.error, 'current_main_stage') ||
        isMissingColumnError(existingQuery.error, 'current_sub_stage_summary') ||
        isMissingColumnError(existingQuery.error, 'assigned_agent') ||
        isMissingColumnError(existingQuery.error, 'assigned_agent_email') ||
        isMissingColumnError(existingQuery.error, 'assigned_attorney_email') ||
        isMissingColumnError(existingQuery.error, 'assigned_bond_originator_email') ||
        isMissingColumnError(existingQuery.error, 'finance_managed_by') ||
        isMissingColumnError(existingQuery.error, 'sales_price') ||
        isMissingColumnError(existingQuery.error, 'purchaser_type') ||
        isMissingColumnError(existingQuery.error, 'is_active'))
    ) {
      existingQuery = await client
        .from('transactions')
        .select('id, development_id, unit_id, buyer_id, finance_type, stage, attorney, bond_originator, next_action')
        .eq('id', transactionId)
        .maybeSingle()
    }

    if (existingQuery.error && !isMissingSchemaError(existingQuery.error)) {
      throw existingQuery.error
    }

    existingTransaction = existingQuery.data || null
  } else {
    let existingQuery = await client
      .from('transactions')
      .select(
        'id, development_id, unit_id, buyer_id, finance_type, purchaser_type, finance_managed_by, stage, current_main_stage, current_sub_stage_summary, assigned_agent, assigned_agent_email, attorney, assigned_attorney_email, bond_originator, assigned_bond_originator_email, next_action, sales_price, is_active, updated_at',
      )
      .eq('unit_id', unitId)
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)

    if (
      existingQuery.error &&
      (isMissingColumnError(existingQuery.error, 'current_main_stage') ||
        isMissingColumnError(existingQuery.error, 'current_sub_stage_summary') ||
        isMissingColumnError(existingQuery.error, 'assigned_agent') ||
        isMissingColumnError(existingQuery.error, 'assigned_agent_email') ||
        isMissingColumnError(existingQuery.error, 'assigned_attorney_email') ||
        isMissingColumnError(existingQuery.error, 'assigned_bond_originator_email') ||
        isMissingColumnError(existingQuery.error, 'finance_managed_by') ||
        isMissingColumnError(existingQuery.error, 'sales_price') ||
        isMissingColumnError(existingQuery.error, 'purchaser_type') ||
        isMissingColumnError(existingQuery.error, 'is_active'))
    ) {
      existingQuery = await client
        .from('transactions')
        .select('id, development_id, unit_id, buyer_id, finance_type, stage, attorney, bond_originator, next_action, updated_at')
        .eq('unit_id', unitId)
        .order('updated_at', { ascending: false })
        .limit(1)
    }

    if (existingQuery.error && !isMissingSchemaError(existingQuery.error)) {
      throw existingQuery.error
    }

    existingTransaction = (existingQuery.data || [])[0] || null
  }

  const normalizedBuyerName = String(buyerName || '').trim()
  const normalizedBuyerPhone = String(buyerPhone || '').trim()
  const normalizedBuyerEmail = String(buyerEmail || '').trim()

  let resolvedBuyerId = existingTransaction?.buyer_id || null
  if (normalizedBuyerName || normalizedBuyerPhone || normalizedBuyerEmail) {
    if (!normalizedBuyerName) {
      throw new Error('Buyer name is required when adding or updating buyer details.')
    }

    const buyer = await findOrCreateBuyer(client, {
      name: normalizedBuyerName,
      phone: normalizedBuyerPhone,
      email: normalizedBuyerEmail,
    })
    resolvedBuyerId = buyer.id
  }

  let resolvedMainStage = 'AVAIL'
  let resolvedDetailedStage = 'Available'

  if (normalizedMode === 'in_progress') {
    resolvedMainStage = normalizeMainStage(mainStage, existingTransaction?.stage || 'Finance Pending')
    if (!['DEP', 'OTP', 'FIN', 'ATTY', 'XFER'].includes(resolvedMainStage)) {
      throw new Error('Choose where the matter currently sits in the transaction journey.')
    }
    resolvedDetailedStage = getDetailedStageFromMainStage(resolvedMainStage)
  } else if (normalizedMode === 'registered') {
    resolvedMainStage = 'REG'
    resolvedDetailedStage = 'Registered'
  }

  const normalizedSubprocessType =
    normalizedMode === 'in_progress' && SUBPROCESS_TYPES.includes(String(subprocessType || '').trim().toLowerCase())
      ? String(subprocessType || '').trim().toLowerCase()
      : null

  if (normalizedMode === 'in_progress' && !normalizedSubprocessType) {
    throw new Error('Select which subprocess currently owns the matter.')
  }

  const normalizedProgressNote = normalizeNullableText(progressNote)
  const normalizedListPrice = normalizeOptionalNumber(listPrice)
  const normalizedSalesPrice = normalizeOptionalNumber(salesPrice)

  if (normalizedMode === 'registered' && (normalizedListPrice === null || normalizedSalesPrice === null)) {
    throw new Error('List price and sales price are required when marking a matter as completed / registered.')
  }

  if (existingTransaction?.id && normalizedMode !== 'available') {
    await assertReservationDepositGateForTransition(client, {
      transactionId: existingTransaction.id,
      nextMainStage: resolvedMainStage,
      nextDetailedStage: resolvedDetailedStage,
    })
  }

  const unitPayload = {
    status: resolvedDetailedStage,
  }

  if (normalizedListPrice !== null) {
    unitPayload.list_price = normalizedListPrice
    unitPayload.price = normalizedListPrice
  }

  if (normalizedSalesPrice !== null) {
    unitPayload.current_price = normalizedSalesPrice
  }

  let unitUpdate = await client.from('units').update(unitPayload).eq('id', unitId)
  if (
    unitUpdate.error &&
    (isMissingColumnError(unitUpdate.error, 'list_price') || isMissingColumnError(unitUpdate.error, 'current_price'))
  ) {
    const fallbackUnitPayload = {
      status: resolvedDetailedStage,
      ...(normalizedListPrice !== null ? { price: normalizedListPrice } : {}),
    }
    unitUpdate = await client.from('units').update(fallbackUnitPayload).eq('id', unitId)
  }

  if (unitUpdate.error) {
    throw unitUpdate.error
  }

  await deactivateExistingUnitTransactions(client, unitId)

  const shouldPersistTransaction =
    Boolean(existingTransaction?.id) ||
    Boolean(resolvedBuyerId) ||
    normalizedMode !== 'available' ||
    Boolean(normalizedProgressNote)

  if (!shouldPersistTransaction) {
    return {
      unitId,
      transactionId: null,
      buyerId: resolvedBuyerId,
      stage: resolvedDetailedStage,
    }
  }

  const unitLookup = await client.from('units').select('id, development_id').eq('id', unitId).maybeSingle()
  if (unitLookup.error) {
    throw unitLookup.error
  }

  const subprocessLabel =
    normalizedSubprocessType === 'finance'
      ? 'Finance workflow'
      : normalizedSubprocessType === 'attorney'
        ? 'Attorney workflow'
        : null
  const progressSummary =
    normalizedMode === 'in_progress'
      ? normalizedProgressNote
        ? `${subprocessLabel} • ${normalizedProgressNote}`
        : subprocessLabel
      : normalizedMode === 'registered'
        ? 'Registered'
        : null
  const nextAction =
    normalizedMode === 'registered'
      ? 'Registered'
      : normalizedMode === 'in_progress'
        ? normalizedProgressNote || `Currently in ${subprocessLabel?.toLowerCase() || 'workflow'}.`
        : normalizedBuyerName
          ? 'Buyer captured. Ready for transaction setup.'
          : 'Available'

  const transactionPayload = {
    development_id: existingTransaction?.development_id || unitLookup.data?.development_id || null,
    unit_id: unitId,
    buyer_id: resolvedBuyerId,
    finance_type: normalizeFinanceType(financeType || existingTransaction?.finance_type || 'cash'),
    purchaser_type: normalizePurchaserType(purchaserType || existingTransaction?.purchaser_type || 'individual'),
    finance_managed_by: normalizeFinanceManagedBy(financeManagedBy || existingTransaction?.finance_managed_by),
    stage: resolvedDetailedStage,
    current_main_stage: resolvedMainStage,
    current_sub_stage_summary: progressSummary,
    assigned_agent: existingTransaction?.assigned_agent || null,
    assigned_agent_email: existingTransaction?.assigned_agent_email || null,
    attorney: existingTransaction?.attorney || null,
    assigned_attorney_email: existingTransaction?.assigned_attorney_email || null,
    bond_originator: existingTransaction?.bond_originator || null,
    assigned_bond_originator_email: existingTransaction?.assigned_bond_originator_email || null,
    next_action: nextAction,
    comment: nextAction,
    ...(normalizedSalesPrice !== null ? { sales_price: normalizedSalesPrice } : {}),
    is_active: normalizedMode !== 'available',
    updated_at: new Date().toISOString(),
  }

  let transactionResult = existingTransaction?.id
    ? await client
        .from('transactions')
        .update(transactionPayload)
        .eq('id', existingTransaction.id)
        .select('id, unit_id, buyer_id, finance_type, purchaser_type, finance_managed_by, stage, current_main_stage, current_sub_stage_summary, next_action, sales_price, updated_at, created_at')
        .single()
    : await client
        .from('transactions')
        .insert(transactionPayload)
        .select('id, unit_id, buyer_id, finance_type, purchaser_type, finance_managed_by, stage, current_main_stage, current_sub_stage_summary, next_action, sales_price, updated_at, created_at')
        .single()

  if (
    transactionResult.error &&
    (isMissingColumnError(transactionResult.error, 'current_main_stage') ||
      isMissingColumnError(transactionResult.error, 'current_sub_stage_summary') ||
      isMissingColumnError(transactionResult.error, 'sales_price') ||
      isMissingColumnError(transactionResult.error, 'comment') ||
      isMissingColumnError(transactionResult.error, 'purchaser_type') ||
      isMissingColumnError(transactionResult.error, 'finance_managed_by') ||
      isMissingColumnError(transactionResult.error, 'assigned_agent') ||
      isMissingColumnError(transactionResult.error, 'assigned_agent_email') ||
      isMissingColumnError(transactionResult.error, 'assigned_attorney_email') ||
      isMissingColumnError(transactionResult.error, 'assigned_bond_originator_email') ||
      isMissingColumnError(transactionResult.error, 'is_active'))
  ) {
    const fallbackPayload = { ...transactionPayload }
    delete fallbackPayload.current_main_stage
    delete fallbackPayload.current_sub_stage_summary
    delete fallbackPayload.sales_price
    delete fallbackPayload.comment
    delete fallbackPayload.purchaser_type
    delete fallbackPayload.finance_managed_by
    delete fallbackPayload.assigned_agent
    delete fallbackPayload.assigned_agent_email
    delete fallbackPayload.assigned_attorney_email
    delete fallbackPayload.assigned_bond_originator_email
    delete fallbackPayload.is_active

    transactionResult = existingTransaction?.id
      ? await client
          .from('transactions')
          .update(fallbackPayload)
          .eq('id', existingTransaction.id)
          .select('id, unit_id, buyer_id, finance_type, stage, next_action, updated_at, created_at')
          .single()
      : await client
          .from('transactions')
          .insert(fallbackPayload)
          .select('id, unit_id, buyer_id, finance_type, stage, next_action, updated_at, created_at')
          .single()
  }

  if (transactionResult.error && isFinanceTypeConstraintError(transactionResult.error) && transactionPayload.finance_type === 'combination') {
    const legacyPayload = {
      ...transactionPayload,
      finance_type: 'hybrid',
    }

    transactionResult = existingTransaction?.id
      ? await client
          .from('transactions')
          .update(legacyPayload)
          .eq('id', existingTransaction.id)
          .select('id, unit_id, buyer_id, finance_type, stage, next_action, updated_at, created_at')
          .single()
      : await client
          .from('transactions')
          .insert(legacyPayload)
          .select('id, unit_id, buyer_id, finance_type, stage, next_action, updated_at, created_at')
          .single()
  }

  if (transactionResult.error) {
    throw transactionResult.error
  }

  try {
    await getOrCreateTransactionOnboardingRecord(client, {
      transactionId: transactionResult.data.id,
      purchaserType: transactionPayload.purchaser_type,
    })
  } catch (error) {
    if (!isMissingSchemaError(error)) {
      throw error
    }
  }

  return {
    unitId,
    transactionId: transactionResult.data.id,
    buyerId: resolvedBuyerId,
    stage: resolvedDetailedStage,
  }
}

function normalizeTransactionFinancialPaymentStatus(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  return ['not_invoiced', 'invoiced', 'paid', 'needs_attention'].includes(normalized) ? normalized : 'not_invoiced'
}

function buildFinancialRecordViewModel(row = {}) {
  return {
    id: row.id || null,
    transactionId: row.transaction_id || null,
    expectedFee: normalizeOptionalNumber(row.expected_fee),
    invoicedAmount: normalizeOptionalNumber(row.invoiced_amount),
    paymentStatus: normalizeTransactionFinancialPaymentStatus(row.payment_status),
    invoiceReference: row.invoice_reference || '',
    invoiceDate: row.invoice_date || '',
    invoiceFilePath: row.invoice_file_path || null,
    invoiceFilename: row.invoice_filename || null,
    paymentDate: row.payment_date || '',
    notes: row.notes || '',
    updatedAt: row.updated_at || row.created_at || null,
    createdAt: row.created_at || null,
  }
}

async function loadTransactionFinancialRecords(client, transactionIds = []) {
  if (!transactionIds.length) {
    return {}
  }

  const query = await client
    .from('transaction_financial_records')
    .select(
      'id, transaction_id, expected_fee, invoiced_amount, payment_status, invoice_reference, invoice_date, invoice_file_path, invoice_filename, payment_date, notes, created_at, updated_at',
    )
    .in('transaction_id', transactionIds)

  if (query.error) {
    if (isMissingTableError(query.error, 'transaction_financial_records')) {
      return {}
    }
    throw query.error
  }

  const rows = await Promise.all(
    (query.data || []).map(async (item) => ({
      ...buildFinancialRecordViewModel(item),
      invoiceUrl: item.invoice_file_path ? await getSignedUrl(item.invoice_file_path) : null,
    })),
  )

  return rows.reduce((accumulator, item) => {
    accumulator[item.transactionId] = item
    return accumulator
  }, {})
}

async function loadDevelopmentAttorneyConfigMap(client, developmentIds = []) {
  if (!developmentIds.length) {
    return {}
  }

  const query = await client
    .from('development_attorney_configs')
    .select('development_id, attorney_firm_name, default_fee_amount')
    .in('development_id', developmentIds)

  if (query.error) {
    if (isMissingSchemaError(query.error)) {
      return {}
    }
    throw query.error
  }

  return (query.data || []).reduce((accumulator, item) => {
    if (!accumulator[item.development_id]) {
      accumulator[item.development_id] = item
    }
    return accumulator
  }, {})
}

async function loadAttorneyCloseoutMap(client, transactionIds = []) {
  if (!transactionIds.length) {
    return {}
  }

  const query = await client
    .from('transaction_attorney_closeouts')
    .select(
      'id, transaction_id, attorney_firm_name, budgeted_amount, actual_billed_amount, invoice_reference, invoice_date, close_out_status, reconciliation_status, notes, updated_at, created_at',
    )
    .in('transaction_id', transactionIds)

  if (query.error) {
    if (isMissingSchemaError(query.error)) {
      return {}
    }
    throw query.error
  }

  return (query.data || []).reduce((accumulator, item) => {
    accumulator[item.transaction_id] = item
    return accumulator
  }, {})
}

function deriveFinancialRow(row, financialRecord = null, closeout = null, developmentConfig = null) {
  const transaction = row?.transaction || {}
  const expectedFee =
    financialRecord?.expectedFee ??
    normalizeOptionalNumber(developmentConfig?.default_fee_amount) ??
    normalizeOptionalNumber(closeout?.budgeted_amount)

  const invoicedAmount =
    financialRecord?.invoicedAmount ??
    normalizeOptionalNumber(closeout?.actual_billed_amount)

  const paymentStatus = financialRecord?.paymentStatus
    ? financialRecord.paymentStatus
    : invoicedAmount !== null
      ? normalizeTransactionFinancialPaymentStatus(
          normalizeAttorneyCloseoutStatus(closeout?.close_out_status) === 'closed' ? 'paid' : 'invoiced',
        )
      : 'not_invoiced'

  const paidAmount = paymentStatus === 'paid' ? Number(invoicedAmount || 0) : 0
  const outstandingAmount = Math.max(Number(expectedFee || 0) - Number(paidAmount || 0), 0)
  const needsAttention =
    paymentStatus === 'needs_attention' ||
    (String(row?.stage || '').toLowerCase() === 'registered' && paymentStatus !== 'paid') ||
    (expectedFee !== null && invoicedAmount !== null && Number(invoicedAmount) > Number(expectedFee))

  return {
    transactionId: transaction.id || null,
    unitId: row?.unit?.id || null,
    type: isPrivateTransactionType(transaction?.transaction_type) ? 'private' : 'development',
    stage: row?.stage || transaction?.stage || 'Unknown',
    clientName: row?.buyer?.name || 'Unassigned',
    developmentName: row?.development?.name || null,
    unitNumber: row?.unit?.unit_number || null,
    propertyAddress:
      [
        transaction?.property_address_line_1,
        transaction?.suburb || transaction?.city,
      ]
        .filter(Boolean)
        .join(', ') || transaction?.property_description || null,
    expectedFee,
    invoicedAmount,
    paidAmount,
    outstandingAmount,
    paymentStatus: needsAttention ? 'needs_attention' : paymentStatus,
    invoiceReference: financialRecord?.invoiceReference || closeout?.invoice_reference || '',
    invoiceDate: financialRecord?.invoiceDate || closeout?.invoice_date || '',
    invoiceUploaded: Boolean(financialRecord?.invoiceUrl || financialRecord?.invoiceFilePath),
    invoiceUrl: financialRecord?.invoiceUrl || null,
    invoiceFilename: financialRecord?.invoiceFilename || null,
    paymentDate: financialRecord?.paymentDate || '',
    notes: financialRecord?.notes || closeout?.notes || '',
    attorneyFirmName: closeout?.attorney_firm_name || developmentConfig?.attorney_firm_name || transaction?.attorney || 'Unassigned',
    lastUpdated:
      financialRecord?.updatedAt ||
      closeout?.updated_at ||
      transaction?.updated_at ||
      transaction?.created_at ||
      row?.unit?.updated_at ||
      row?.unit?.created_at ||
      null,
  }
}

export async function fetchAttorneyFinancials({ userId } = {}) {
  const client = requireClient()
  const rows = await fetchTransactionsByParticipant({ userId, roleType: 'attorney' })
  const transactionIds = rows.map((row) => row?.transaction?.id).filter(Boolean)
  const developmentIds = [...new Set(rows.map((row) => row?.development?.id).filter(Boolean))]

  const [financialRecordMap, closeoutMap, developmentConfigMap] = await Promise.all([
    loadTransactionFinancialRecords(client, transactionIds),
    loadAttorneyCloseoutMap(client, transactionIds),
    loadDevelopmentAttorneyConfigMap(client, developmentIds),
  ])

  const financialRows = rows
    .filter((row) => row?.transaction?.id)
    .map((row) =>
      deriveFinancialRow(
        row,
        financialRecordMap[row.transaction.id] || null,
        closeoutMap[row.transaction.id] || null,
        developmentConfigMap[row?.development?.id] || null,
      ),
    )
    .sort((left, right) => new Date(right.lastUpdated || 0) - new Date(left.lastUpdated || 0))

  const summary = financialRows.reduce(
    (accumulator, item) => {
      accumulator.totalExpectedFees += Number(item.expectedFee || 0)
      accumulator.totalInvoiced += Number(item.invoicedAmount || 0)
      accumulator.totalPaid += Number(item.paidAmount || 0)
      accumulator.outstanding += Number(item.outstandingAmount || 0)
      if (String(item.stage || '').toLowerCase() === 'registered') {
        const updatedAt = new Date(item.lastUpdated || 0)
        const now = new Date()
        if (updatedAt.getMonth() === now.getMonth() && updatedAt.getFullYear() === now.getFullYear()) {
          accumulator.registeredThisMonth += 1
        }
      }
      return accumulator
    },
    {
      totalExpectedFees: 0,
      totalInvoiced: 0,
      totalPaid: 0,
      outstanding: 0,
      registeredThisMonth: 0,
    },
  )

  return {
    rows: financialRows,
    summary,
  }
}

export async function fetchTransactionFinancialRecord(transactionId) {
  const client = requireClient()
  if (!transactionId) {
    return null
  }

  const financialMap = await loadTransactionFinancialRecords(client, [transactionId])
  return financialMap[transactionId] || null
}

export async function saveTransactionFinancialRecord(transactionId, input = {}) {
  const client = requireClient()
  if (!transactionId) {
    throw new Error('Transaction is required.')
  }

  const payload = {
    transaction_id: transactionId,
    expected_fee: normalizeOptionalNumber(input.expectedFee),
    invoiced_amount: normalizeOptionalNumber(input.invoicedAmount),
    payment_status: normalizeTransactionFinancialPaymentStatus(input.paymentStatus),
    invoice_reference: normalizeNullableText(input.invoiceReference),
    invoice_date: normalizeOptionalDate(input.invoiceDate),
    payment_date: normalizeOptionalDate(input.paymentDate),
    notes: normalizeNullableText(input.notes),
    updated_at: new Date().toISOString(),
  }

  const result = await client
    .from('transaction_financial_records')
    .upsert(payload, { onConflict: 'transaction_id' })
    .select(
      'id, transaction_id, expected_fee, invoiced_amount, payment_status, invoice_reference, invoice_date, invoice_file_path, invoice_filename, payment_date, notes, created_at, updated_at',
    )
    .single()

  if (result.error) {
    if (isMissingTableError(result.error, 'transaction_financial_records')) {
      throw new Error('Transaction financial records are not set up yet. Run sql/schema.sql first.')
    }
    throw result.error
  }

  return {
    ...buildFinancialRecordViewModel(result.data),
    invoiceUrl: result.data?.invoice_file_path ? await getSignedUrl(result.data.invoice_file_path) : null,
  }
}

export async function uploadTransactionFinancialInvoice({ transactionId, file }) {
  const client = requireClient()

  if (!transactionId) {
    throw new Error('Transaction is required.')
  }

  if (!file) {
    throw new Error('Select an invoice file to upload.')
  }

  const safeName = String(file.name || 'invoice')
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '-')
  const filePath = `transaction-financial-invoices/${transactionId}/${crypto.randomUUID()}-${safeName}`

  const { error: uploadError } = await client.storage.from(DOCUMENTS_BUCKET).upload(filePath, file)
  if (uploadError) {
    throw uploadError
  }

  const upsert = await client
    .from('transaction_financial_records')
    .upsert(
      {
        transaction_id: transactionId,
        invoice_file_path: filePath,
        invoice_filename: safeName,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'transaction_id' },
    )
    .select(
      'id, transaction_id, expected_fee, invoiced_amount, payment_status, invoice_reference, invoice_date, invoice_file_path, invoice_filename, payment_date, notes, created_at, updated_at',
    )
    .single()

  if (upsert.error) {
    if (isMissingTableError(upsert.error, 'transaction_financial_records')) {
      throw new Error('Transaction financial records are not set up yet. Run sql/schema.sql first.')
    }
    throw upsert.error
  }

  return {
    ...buildFinancialRecordViewModel(upsert.data),
    invoiceUrl: upsert.data?.invoice_file_path ? await getSignedUrl(upsert.data.invoice_file_path) : null,
  }
}

async function deactivateExistingUnitTransactions(client, unitId) {
  let result = await client
    .from('transactions')
    .update({
      is_active: false,
      stage: 'Available',
      current_main_stage: 'AVAIL',
      current_sub_stage_summary: null,
      next_action: 'Transaction reset to available.',
      comment: 'Transaction reset to available.',
      updated_at: new Date().toISOString(),
    })
    .eq('unit_id', unitId)
    .eq('is_active', true)

  if (!result.error) {
    return
  }

  if (
    isMissingColumnError(result.error, 'is_active') ||
    isMissingColumnError(result.error, 'current_main_stage') ||
    isMissingColumnError(result.error, 'current_sub_stage_summary') ||
    isMissingColumnError(result.error, 'comment') ||
    isMissingColumnError(result.error, 'next_action')
  ) {
    const fallbackPayload = {
      stage: 'Available',
      updated_at: new Date().toISOString(),
    }

    result = await client
      .from('transactions')
      .update(fallbackPayload)
      .eq('unit_id', unitId)
      .neq('stage', 'Available')

    if (!result.error) {
      return
    }

    if (isMissingColumnError(result.error, 'stage')) {
      return
    }
  }

  throw result.error
}

export async function deleteTransactionEverywhere({ transactionId, unitId } = {}) {
  const client = requireClient()
  const actorProfile = await resolveActiveProfileContext(client)
  const actorRole = normalizeRoleType(actorProfile.role || 'developer')

  if (!transactionId) {
    throw new Error('Transaction is required.')
  }

  const now = new Date().toISOString()
  const shouldIgnoreCleanupError = (error, tableName = '') => {
    if (!error) {
      return false
    }

    if (isMissingSchemaError(error) || isPermissionDeniedError(error)) {
      return true
    }

    if (isMissingColumnError(error, 'transaction_id') || isMissingColumnError(error, 'updated_at')) {
      return true
    }

    if (tableName && isMissingTableError(error, tableName)) {
      return true
    }

    return false
  }
  const extractBlockingTableName = (error) => {
    const detailText = [error?.details, error?.message, error?.hint]
      .filter(Boolean)
      .join(' ')
    const matchedTable =
      detailText.match(/table\s+"([^"]+)"/i)?.[1] ||
      detailText.match(/relation\s+"([^"]+)"/i)?.[1] ||
      null

    return matchedTable ? matchedTable.trim() : null
  }

  let transactionQuery = await client
    .from('transactions')
    .select('id, unit_id, buyer_id, stage, is_active')
    .eq('id', transactionId)
    .maybeSingle()

  if (transactionQuery.error && isMissingColumnError(transactionQuery.error, 'is_active')) {
    transactionQuery = await client
      .from('transactions')
      .select('id, unit_id, buyer_id, stage')
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

  const resolvedUnitId = transaction.unit_id || unitId || null
  let transactionIdsToDeactivate = [transactionId]

  if (resolvedUnitId) {
    let transactionsForUnitQuery = await client
      .from('transactions')
      .select('id, stage, is_active')
      .eq('unit_id', resolvedUnitId)

    if (transactionsForUnitQuery.error && isMissingColumnError(transactionsForUnitQuery.error, 'is_active')) {
      transactionsForUnitQuery = await client
        .from('transactions')
        .select('id, stage')
        .eq('unit_id', resolvedUnitId)
    }

    if (transactionsForUnitQuery.error) {
      throw transactionsForUnitQuery.error
    }

    transactionIdsToDeactivate = [
      ...new Set(
        [transactionId, ...(transactionsForUnitQuery.data || [])
          .filter((row) => {
            const stage = normalizeStage(row?.stage, null)
            if (row?.id === transactionId) {
              return true
            }
            if (row?.is_active === true) {
              return true
            }
            return stage && stage !== 'Available'
          })
          .map((row) => row.id)
          .filter(Boolean)],
      ),
    ]
  }

  const transactionUpdate = await client
    .from('transactions')
    .update({
      is_active: false,
      stage: 'Available',
      current_main_stage: 'AVAIL',
      current_sub_stage_summary: null,
      next_action: 'Transaction deleted and unit reset to available.',
      comment: 'Transaction deleted and unit reset to available.',
      updated_at: now,
    })
    .in('id', transactionIdsToDeactivate)

  if (
    transactionUpdate.error &&
    (isMissingColumnError(transactionUpdate.error, 'comment') || isMissingColumnError(transactionUpdate.error, 'next_action'))
  ) {
    const fallbackUpdate = await client
      .from('transactions')
      .update({
        is_active: false,
        stage: 'Available',
        updated_at: now,
      })
      .in('id', transactionIdsToDeactivate)

    if (fallbackUpdate.error && isMissingColumnError(fallbackUpdate.error, 'is_active')) {
      const legacyFallback = await client
        .from('transactions')
        .update({
          stage: 'Available',
          updated_at: now,
        })
        .in('id', transactionIdsToDeactivate)

      if (legacyFallback.error) {
        throw legacyFallback.error
      }
    } else if (fallbackUpdate.error) {
      throw fallbackUpdate.error
    }
  } else if (transactionUpdate.error && isMissingColumnError(transactionUpdate.error, 'is_active')) {
    const fallbackUpdate = await client
      .from('transactions')
      .update({
        stage: 'Available',
        updated_at: now,
      })
      .in('id', transactionIdsToDeactivate)

    if (fallbackUpdate.error) {
      throw fallbackUpdate.error
    }
  } else if (
    transactionUpdate.error &&
    (isMissingColumnError(transactionUpdate.error, 'current_main_stage') ||
      isMissingColumnError(transactionUpdate.error, 'current_sub_stage_summary'))
  ) {
    const fallbackUpdate = await client
      .from('transactions')
      .update({
        is_active: false,
        stage: 'Available',
        next_action: 'Transaction deleted and unit reset to available.',
        updated_at: now,
      })
      .in('id', transactionIdsToDeactivate)

    if (fallbackUpdate.error && isMissingColumnError(fallbackUpdate.error, 'is_active')) {
      const legacyFallback = await client
        .from('transactions')
        .update({
          stage: 'Available',
          updated_at: now,
        })
        .in('id', transactionIdsToDeactivate)

      if (legacyFallback.error) {
        throw legacyFallback.error
      }
    } else if (fallbackUpdate.error) {
      throw fallbackUpdate.error
    }
  } else if (transactionUpdate.error) {
    throw transactionUpdate.error
  }

  if (resolvedUnitId) {
    const unitUpdate = await client.from('units').update({ status: 'Available' }).eq('id', resolvedUnitId)
    if (unitUpdate.error) {
      throw unitUpdate.error
    }
  }

  const deactivateOptional = async (tableName) => {
    let result = await client
      .from(tableName)
      .update({ is_active: false, updated_at: now })
      .in('transaction_id', transactionIdsToDeactivate)

    if (result?.error && isMissingColumnError(result.error, 'updated_at')) {
      result = await client.from(tableName).update({ is_active: false }).in('transaction_id', transactionIdsToDeactivate)
    }

    if (result?.error && isMissingColumnError(result.error, 'is_active')) {
      result = await client.from(tableName).delete().in('transaction_id', transactionIdsToDeactivate)
    }

    if (result?.error && !shouldIgnoreCleanupError(result.error, tableName)) {
      throw result.error
    }
  }

  const clearOptionalTransactionReference = async (tableName) => {
    let result = await client
      .from(tableName)
      .update({ transaction_id: null, updated_at: now })
      .in('transaction_id', transactionIdsToDeactivate)

    if (result?.error && isMissingColumnError(result.error, 'updated_at')) {
      result = await client.from(tableName).update({ transaction_id: null }).in('transaction_id', transactionIdsToDeactivate)
    }

    if (result?.error && !shouldIgnoreCleanupError(result.error, tableName)) {
      throw result.error
    }
  }

  const deleteOptionalByTransaction = async (tableName) => {
    const result = await client.from(tableName).delete().in('transaction_id', transactionIdsToDeactivate)
    if (result.error && !shouldIgnoreCleanupError(result.error, tableName)) {
      throw result.error
    }
  }

  await deactivateOptional('transaction_onboarding')
  await deactivateOptional('transaction_status_links')
  await deactivateOptional('client_portal_links')

  await deleteOptionalByTransaction('transaction_onboarding')
  await deleteOptionalByTransaction('transaction_status_links')
  await deleteOptionalByTransaction('client_portal_links')
  await deleteOptionalByTransaction('onboarding_form_data')
  await deleteOptionalByTransaction('transaction_required_documents')
  await deleteOptionalByTransaction('transaction_comments')
  await deleteOptionalByTransaction('transaction_finance_details')
  await deleteOptionalByTransaction('transaction_financial_records')
  await deleteOptionalByTransaction('transaction_funding_sources')
  await deleteOptionalByTransaction('transaction_attorney_closeouts')
  await deleteOptionalByTransaction('transaction_bond_closeouts')
  await deleteOptionalByTransaction('transaction_attorney_closeout_documents')
  await deleteOptionalByTransaction('transaction_bond_closeout_documents')
  await deleteOptionalByTransaction('transaction_participants')
  await deleteOptionalByTransaction('transaction_readiness_states')
  await deleteOptionalByTransaction('transaction_handover')
  await deleteOptionalByTransaction('trust_investment_forms')
  await deleteOptionalByTransaction('documents')
  await deleteOptionalByTransaction('notes')
  await deleteOptionalByTransaction('client_issues')
  await deleteOptionalByTransaction('transaction_notifications')
  await deleteOptionalByTransaction('transaction_events')
  await deleteOptionalByTransaction('transaction_external_access')

  await clearOptionalTransactionReference('alteration_requests')
  await clearOptionalTransactionReference('service_reviews')

  const subprocessResult = await client
    .from('transaction_subprocesses')
    .select('id')
    .in('transaction_id', transactionIdsToDeactivate)

  if (subprocessResult.error && !isMissingSchemaError(subprocessResult.error)) {
    throw subprocessResult.error
  }

  const subprocessIds = (subprocessResult.data || []).map((row) => row.id).filter(Boolean)
  if (subprocessIds.length) {
    const stepDelete = await client.from('transaction_subprocess_steps').delete().in('subprocess_id', subprocessIds)
    if (stepDelete.error && !isMissingSchemaError(stepDelete.error)) {
      throw stepDelete.error
    }
  }

  const subprocessDelete = await client.from('transaction_subprocesses').delete().in('transaction_id', transactionIdsToDeactivate)
  if (subprocessDelete.error && !shouldIgnoreCleanupError(subprocessDelete.error, 'transaction_subprocesses')) {
    throw subprocessDelete.error
  }

  try {
    await logTransactionEventIfPossible(client, {
      transactionId,
      eventType: 'TransactionUpdated',
      createdBy: actorProfile.userId || null,
      createdByRole: actorRole,
      eventData: {
        automation: 'TransactionDeleted',
        unitId: resolvedUnitId,
        previousStage: transaction.stage || null,
        resetToStatus: 'Available',
        deletedTransactionIds: transactionIdsToDeactivate,
      },
    })
  } catch (error) {
    if (!isMissingSchemaError(error) && !isPermissionDeniedError(error)) {
      throw error
    }
  }

  const externalAccessUpdate = await client
    .from('transaction_external_access')
    .update({ revoked: true, updated_at: now })
    .in('transaction_id', transactionIdsToDeactivate)

  if (externalAccessUpdate.error && isMissingColumnError(externalAccessUpdate.error, 'updated_at')) {
    const revokeFallback = await client
      .from('transaction_external_access')
      .update({ revoked: true })
      .in('transaction_id', transactionIdsToDeactivate)

    if (revokeFallback.error && isMissingColumnError(revokeFallback.error, 'revoked')) {
      const deleteFallback = await client.from('transaction_external_access').delete().in('transaction_id', transactionIdsToDeactivate)
      if (deleteFallback.error && !shouldIgnoreCleanupError(deleteFallback.error, 'transaction_external_access')) {
        throw deleteFallback.error
      }
    } else if (revokeFallback.error && !shouldIgnoreCleanupError(revokeFallback.error, 'transaction_external_access')) {
      throw revokeFallback.error
    }
  } else if (externalAccessUpdate.error && isMissingColumnError(externalAccessUpdate.error, 'revoked')) {
    const deleteFallback = await client.from('transaction_external_access').delete().in('transaction_id', transactionIdsToDeactivate)
    if (deleteFallback.error && !shouldIgnoreCleanupError(deleteFallback.error, 'transaction_external_access')) {
      throw deleteFallback.error
    }
  } else if (externalAccessUpdate.error && !shouldIgnoreCleanupError(externalAccessUpdate.error, 'transaction_external_access')) {
    throw externalAccessUpdate.error
  }

  let hardDeleted = false
  let hardDeleteError = null
  const blockingTablesAttempted = new Set()

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const hardDeleteResult = await client.from('transactions').delete().in('id', transactionIdsToDeactivate)
    if (!hardDeleteResult.error || isMissingSchemaError(hardDeleteResult.error)) {
      hardDeleted = true
      hardDeleteError = null
      break
    }

    if (hardDeleteResult.error.code !== '23503') {
      throw hardDeleteResult.error
    }

    hardDeleteError = hardDeleteResult.error
    const blockingTable = extractBlockingTableName(hardDeleteResult.error)
    if (!blockingTable || blockingTablesAttempted.has(blockingTable)) {
      break
    }

    blockingTablesAttempted.add(blockingTable)

    let clearingResult = await client.from(blockingTable).delete().in('transaction_id', transactionIdsToDeactivate)
    if (clearingResult.error && isMissingColumnError(clearingResult.error, 'transaction_id')) {
      clearingResult = await client
        .from(blockingTable)
        .update({ transaction_id: null, updated_at: now })
        .in('transaction_id', transactionIdsToDeactivate)

      if (clearingResult.error && isMissingColumnError(clearingResult.error, 'updated_at')) {
        clearingResult = await client
          .from(blockingTable)
          .update({ transaction_id: null })
          .in('transaction_id', transactionIdsToDeactivate)
      }
    }

    if (clearingResult.error && !shouldIgnoreCleanupError(clearingResult.error, blockingTable)) {
      break
    }
  }

  if (!hardDeleted && hardDeleteError && hardDeleteError.code !== '23503') {
    throw hardDeleteError
  }

  return {
    transactionId,
    unitId: resolvedUnitId,
    deactivatedTransactionIds: transactionIdsToDeactivate,
    hardDeleted,
    warning:
      !hardDeleted && hardDeleteError
        ? `Hard delete skipped while dependent records were being cleaned up. Transaction was reset to Available and removed from active views.`
        : null,
    unitStatus: resolvedUnitId ? 'Available' : null,
    success: true,
  }
}

export async function rollbackTransaction(args = {}) {
  return deleteTransactionEverywhere(args)
}

export async function createTransactionFromWizard({ setup = {}, finance = {}, status = {}, options = {} }) {
  const client = requireClient()
  const actorProfile = await resolveActiveProfileContext(client)
  const actorRole = normalizeRoleType(actorProfile.role || 'agent')
  const allowIncomplete = Boolean(options?.allowIncomplete)
  const actorName =
    actorRole === 'attorney'
      ? finance?.attorney?.trim() || 'Attorney Team'
      : actorRole === 'bond_originator'
        ? finance?.bondOriginator?.trim() || 'Bond Team'
      : setup?.assignedAgent?.trim() || 'Sales Team'

  const transactionType = normalizeStoredTransactionType(setup?.transactionType, 'developer_sale')
  const propertyType = normalizeTransactionPropertyType(setup?.propertyType)

  if (transactionType === 'developer_sale' && (!setup?.developmentId || !setup?.unitId)) {
    throw new Error('Development and unit are required.')
  }

  if (transactionType === 'private_property' && !propertyType) {
    throw new Error('Property category is required for a private property transaction.')
  }

  if (transactionType === 'private_property' && !String(setup?.propertyAddressLine1 || '').trim()) {
    throw new Error('Property address is required for a private matter.')
  }

  if (transactionType === 'private_property' && !String(setup?.city || '').trim()) {
    throw new Error('City is required for a private matter.')
  }

  if (!allowIncomplete && !setup?.buyerName?.trim()) {
    throw new Error('Buyer full name is required.')
  }

  let buyer = null
  const hasBuyerSeed = Boolean(setup?.buyerName?.trim() || setup?.buyerEmail?.trim() || setup?.buyerPhone?.trim())
  if (hasBuyerSeed) {
    buyer = await findOrCreateBuyer(client, {
      name: setup.buyerName,
      phone: setup.buyerPhone,
      email: setup.buyerEmail,
    })
  }

  if (!buyer && !allowIncomplete) {
    throw new Error('Buyer full name is required.')
  }

  if (transactionType === 'developer_sale' && setup.unitId) {
    await deactivateExistingUnitTransactions(client, setup.unitId)
  }

  let developmentSettings = DEFAULT_DEVELOPMENT_SETTINGS
  if (transactionType === 'developer_sale' && setup.developmentId) {
    try {
      developmentSettings = await ensureDevelopmentSettings(client, setup.developmentId, { createIfMissing: false })
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

  const resolvedDetailedStage = status.stage || 'Reserved'
  const resolvedMainStage = normalizeMainStage(status.mainStage, resolvedDetailedStage)
  const purchaserType = normalizePurchaserType(setup.purchaserType)

  const normalizedFinanceType = normalizeFinanceType(setup.financeType || 'cash')
  const resolvedPurchasePrice = resolvePurchasePrice({ setup })
  const explicitReservationRequired =
    typeof finance?.reservationRequired === 'boolean' ? finance.reservationRequired : null
  const reservationRequired =
    explicitReservationRequired ?? Boolean(developmentSettings?.reservation_deposit_enabled_by_default)
  const reservationAmountInput = normalizeOptionalNumber(finance.reservationAmount)
  const reservationAmountDefault = normalizeOptionalNumber(
    developmentSettings?.reservation_deposit_amount ?? developmentSettings?.reservationDepositAmount,
  )
  const resolvedReservationAmount = reservationRequired ? reservationAmountInput ?? reservationAmountDefault : null
  const reservationStatus = normalizeReservationStatus(finance.reservationStatus, {
    required: reservationRequired,
  })
  const reservationPaymentDetails = normalizeReservationPaymentDetails(
    finance.reservationPaymentDetails ||
      developmentSettings?.reservation_deposit_payment_details ||
      developmentSettings?.reservationDepositPaymentDetails ||
      {},
  )

  const transactionPayload = {
    development_id: transactionType === 'developer_sale' ? setup.developmentId : null,
    unit_id: transactionType === 'developer_sale' ? setup.unitId : null,
    buyer_id: buyer?.id || null,
    transaction_type: transactionType,
    property_type: transactionType === 'private_property' ? propertyType : null,
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
    finance_type: normalizedFinanceType,
    purchaser_type: purchaserType,
    finance_managed_by: normalizeFinanceManagedBy(setup.financeManagedBy),
    purchase_price: resolvedPurchasePrice,
    cash_amount: normalizeOptionalNumber(finance.cashAmount),
    bond_amount: normalizeOptionalNumber(finance.bondAmount),
    deposit_amount: normalizeOptionalNumber(finance.depositAmount),
    reservation_required: reservationRequired,
    reservation_amount: resolvedReservationAmount,
    reservation_status: reservationStatus,
    reservation_payment_details: reservationRequired ? reservationPaymentDetails : {},
    reservation_paid_date:
      reservationRequired && ['paid', 'verified'].includes(reservationStatus) ? new Date().toISOString().slice(0, 10) : null,
    onboarding_status: 'awaiting_client_onboarding',
    onboarding_completed_at: null,
    external_onboarding_submitted_at: null,
    stage: resolvedDetailedStage,
    current_main_stage: resolvedMainStage,
    stage_date: status.stageDate || null,
    risk_status: status.riskStatus || 'On Track',
    attorney: finance.attorney || null,
    bond_originator: finance.bondOriginator || null,
    bank: finance.bank || null,
    next_action: status.nextAction || finance.nextAction || null,
    comment: status.nextAction || finance.nextAction || null,
    sales_price: resolvedPurchasePrice,
    sale_date: setup.saleDate || null,
    assigned_agent: setup.assignedAgent || null,
    assigned_agent_email: normalizeNullableText(setup.assignedAgentEmail)?.toLowerCase() || null,
    expected_transfer_date: finance.expectedTransferDate || null,
    assigned_attorney_email: normalizeNullableText(finance.attorneyEmail)?.toLowerCase() || null,
    assigned_bond_originator_email: normalizeNullableText(finance.bondOriginatorEmail)?.toLowerCase() || null,
    owner_user_id: actorProfile.userId || null,
    access_level: normalizeTransactionAccessLevel(setup.accessLevel, transactionType === 'private_property' ? 'private' : 'shared'),
    is_active: true,
    updated_at: new Date().toISOString(),
  }

  const minimalTransactionPayload = {
    development_id: transactionType === 'developer_sale' ? setup.developmentId : null,
    unit_id: transactionType === 'developer_sale' ? setup.unitId : null,
    buyer_id: buyer?.id || null,
    transaction_type: transactionType,
    property_type: transactionType === 'private_property' ? propertyType : null,
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
    finance_type: normalizedFinanceType,
    purchaser_type: purchaserType,
    finance_managed_by: normalizeFinanceManagedBy(setup.financeManagedBy),
    stage: resolvedDetailedStage,
    current_main_stage: resolvedMainStage,
    assigned_agent: setup.assignedAgent || null,
    assigned_agent_email: normalizeNullableText(setup.assignedAgentEmail)?.toLowerCase() || null,
    attorney: finance.attorney || null,
    assigned_attorney_email: normalizeNullableText(finance.attorneyEmail)?.toLowerCase() || null,
    bond_originator: finance.bondOriginator || null,
    assigned_bond_originator_email: normalizeNullableText(finance.bondOriginatorEmail)?.toLowerCase() || null,
    next_action: status.nextAction || finance.nextAction || null,
    comment: status.nextAction || finance.nextAction || null,
    owner_user_id: actorProfile.userId || null,
    access_level: normalizeTransactionAccessLevel(setup.accessLevel, transactionType === 'private_property' ? 'private' : 'shared'),
    updated_at: new Date().toISOString(),
  }
  const legacyTransactionPayload =
    transactionPayload.finance_type === 'combination'
      ? { ...transactionPayload, finance_type: 'hybrid' }
      : null
  const legacyMinimalTransactionPayload =
    minimalTransactionPayload.finance_type === 'combination'
      ? { ...minimalTransactionPayload, finance_type: 'hybrid' }
      : null

  // Seller fields are only used for private-property matters. Omitting them on
  // developer-sale inserts prevents unnecessary fallback writes on schemas that
  // don't include seller_* columns, which would otherwise drop reservation data.
  if (transactionType !== 'private_property') {
    delete transactionPayload.seller_name
    delete transactionPayload.seller_email
    delete transactionPayload.seller_phone
    delete minimalTransactionPayload.seller_name
    delete minimalTransactionPayload.seller_email
    delete minimalTransactionPayload.seller_phone
    if (legacyTransactionPayload) {
      delete legacyTransactionPayload.seller_name
      delete legacyTransactionPayload.seller_email
      delete legacyTransactionPayload.seller_phone
    }
    if (legacyMinimalTransactionPayload) {
      delete legacyMinimalTransactionPayload.seller_name
      delete legacyMinimalTransactionPayload.seller_email
      delete legacyMinimalTransactionPayload.seller_phone
    }
  }

  let transactionResult = await client
    .from('transactions')
    .insert(transactionPayload)
    .select('id, unit_id, buyer_id, finance_type, stage, attorney, bond_originator, next_action, created_at, updated_at')
    .single()

  if (transactionResult.error && isFinanceTypeConstraintError(transactionResult.error) && legacyTransactionPayload) {
    transactionResult = await client
      .from('transactions')
      .insert(legacyTransactionPayload)
      .select('id, unit_id, buyer_id, finance_type, stage, attorney, bond_originator, next_action, created_at, updated_at')
      .single()
  }

  if (
    transactionResult.error &&
    (isMissingColumnError(transactionResult.error, 'bond_amount') ||
      isMissingColumnError(transactionResult.error, 'transaction_type') ||
      isMissingColumnError(transactionResult.error, 'property_type') ||
      isMissingColumnError(transactionResult.error, 'property_address_line_1') ||
      isMissingColumnError(transactionResult.error, 'matter_owner') ||
      isMissingColumnError(transactionResult.error, 'seller_name') ||
      isMissingColumnError(transactionResult.error, 'seller_email') ||
      isMissingColumnError(transactionResult.error, 'seller_phone') ||
      isMissingColumnError(transactionResult.error, 'cash_amount') ||
      isMissingColumnError(transactionResult.error, 'deposit_amount') ||
      isMissingColumnError(transactionResult.error, 'reservation_required') ||
      isMissingColumnError(transactionResult.error, 'reservation_amount') ||
      isMissingColumnError(transactionResult.error, 'reservation_status') ||
      isMissingColumnError(transactionResult.error, 'reservation_paid_date') ||
      isMissingColumnError(transactionResult.error, 'reservation_payment_details') ||
      isMissingColumnError(transactionResult.error, 'onboarding_status') ||
      isMissingColumnError(transactionResult.error, 'onboarding_completed_at') ||
      isMissingColumnError(transactionResult.error, 'external_onboarding_submitted_at') ||
      isMissingColumnError(transactionResult.error, 'purchase_price') ||
      isMissingColumnError(transactionResult.error, 'assigned_agent_email') ||
      isMissingColumnError(transactionResult.error, 'assigned_attorney_email') ||
      isMissingColumnError(transactionResult.error, 'assigned_bond_originator_email') ||
      isMissingColumnError(transactionResult.error, 'current_main_stage') ||
      isMissingColumnError(transactionResult.error, 'comment') ||
      isMissingColumnError(transactionResult.error, 'owner_user_id') ||
      isMissingColumnError(transactionResult.error, 'access_level'))
  ) {
    const fallbackPayload = {
      ...(legacyMinimalTransactionPayload || minimalTransactionPayload),
    }
    delete fallbackPayload.current_main_stage
    delete fallbackPayload.comment
    delete fallbackPayload.purchaser_type
    delete fallbackPayload.finance_managed_by
    delete fallbackPayload.transaction_type
    delete fallbackPayload.property_type
    delete fallbackPayload.property_address_line_1
    delete fallbackPayload.property_address_line_2
    delete fallbackPayload.suburb
    delete fallbackPayload.city
    delete fallbackPayload.province
    delete fallbackPayload.postal_code
    delete fallbackPayload.property_description
    delete fallbackPayload.matter_owner
    delete fallbackPayload.seller_name
    delete fallbackPayload.seller_email
    delete fallbackPayload.seller_phone
    delete fallbackPayload.assigned_agent
    delete fallbackPayload.assigned_agent_email
    delete fallbackPayload.assigned_attorney_email
    delete fallbackPayload.assigned_bond_originator_email
    delete fallbackPayload.owner_user_id
    delete fallbackPayload.access_level

    transactionResult = await client
      .from('transactions')
      .insert(fallbackPayload)
      .select('id, unit_id, buyer_id, finance_type, stage, attorney, bond_originator, next_action, created_at, updated_at')
      .single()
  }

  if (transactionResult.error && transactionResult.error.code === '23505') {
    const { data: existingTransaction, error: existingTransactionError } = await client
      .from('transactions')
      .select('id')
      .eq('unit_id', setup.unitId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingTransactionError) {
      throw existingTransactionError
    }

    if (!existingTransaction) {
      throw transactionResult.error
    }

    const richConflictPayload = {
      ...transactionPayload,
      is_active: true,
      updated_at: new Date().toISOString(),
    }
    const legacyRichConflictPayload =
      richConflictPayload.finance_type === 'combination'
        ? { ...richConflictPayload, finance_type: 'hybrid' }
        : null

    transactionResult = await client
      .from('transactions')
      .update(richConflictPayload)
      .eq('id', existingTransaction.id)
      .select('id, unit_id, buyer_id, finance_type, stage, attorney, bond_originator, next_action, created_at, updated_at')
      .single()

    if (transactionResult.error && isFinanceTypeConstraintError(transactionResult.error) && legacyRichConflictPayload) {
      transactionResult = await client
        .from('transactions')
        .update(legacyRichConflictPayload)
        .eq('id', existingTransaction.id)
        .select('id, unit_id, buyer_id, finance_type, stage, attorney, bond_originator, next_action, created_at, updated_at')
        .single()
    }

    if (
      transactionResult.error &&
      (isMissingColumnError(transactionResult.error, 'bond_amount') ||
        isMissingColumnError(transactionResult.error, 'transaction_type') ||
        isMissingColumnError(transactionResult.error, 'property_type') ||
        isMissingColumnError(transactionResult.error, 'property_address_line_1') ||
        isMissingColumnError(transactionResult.error, 'matter_owner') ||
        isMissingColumnError(transactionResult.error, 'seller_name') ||
        isMissingColumnError(transactionResult.error, 'seller_email') ||
        isMissingColumnError(transactionResult.error, 'seller_phone') ||
        isMissingColumnError(transactionResult.error, 'cash_amount') ||
        isMissingColumnError(transactionResult.error, 'deposit_amount') ||
        isMissingColumnError(transactionResult.error, 'reservation_required') ||
        isMissingColumnError(transactionResult.error, 'reservation_amount') ||
        isMissingColumnError(transactionResult.error, 'reservation_status') ||
        isMissingColumnError(transactionResult.error, 'reservation_paid_date') ||
        isMissingColumnError(transactionResult.error, 'reservation_payment_details') ||
        isMissingColumnError(transactionResult.error, 'onboarding_status') ||
        isMissingColumnError(transactionResult.error, 'onboarding_completed_at') ||
        isMissingColumnError(transactionResult.error, 'external_onboarding_submitted_at') ||
        isMissingColumnError(transactionResult.error, 'purchase_price') ||
        isMissingColumnError(transactionResult.error, 'assigned_agent_email') ||
        isMissingColumnError(transactionResult.error, 'assigned_attorney_email') ||
        isMissingColumnError(transactionResult.error, 'assigned_bond_originator_email') ||
        isMissingColumnError(transactionResult.error, 'current_main_stage') ||
        isMissingColumnError(transactionResult.error, 'comment') ||
        isMissingColumnError(transactionResult.error, 'owner_user_id') ||
        isMissingColumnError(transactionResult.error, 'access_level'))
    ) {
      const fallbackPayload = {
        ...(legacyMinimalTransactionPayload || minimalTransactionPayload),
        is_active: true,
        updated_at: new Date().toISOString(),
      }
      delete fallbackPayload.current_main_stage
      delete fallbackPayload.comment
      delete fallbackPayload.purchaser_type
      delete fallbackPayload.finance_managed_by
      delete fallbackPayload.transaction_type
      delete fallbackPayload.property_type
      delete fallbackPayload.property_address_line_1
      delete fallbackPayload.property_address_line_2
      delete fallbackPayload.suburb
      delete fallbackPayload.city
      delete fallbackPayload.province
      delete fallbackPayload.postal_code
      delete fallbackPayload.property_description
      delete fallbackPayload.matter_owner
      delete fallbackPayload.seller_name
      delete fallbackPayload.seller_email
      delete fallbackPayload.seller_phone
      delete fallbackPayload.assigned_agent
      delete fallbackPayload.assigned_agent_email
      delete fallbackPayload.assigned_attorney_email
      delete fallbackPayload.assigned_bond_originator_email
      delete fallbackPayload.owner_user_id
      delete fallbackPayload.access_level

      transactionResult = await client
        .from('transactions')
        .update(fallbackPayload)
        .eq('id', existingTransaction.id)
        .select('id, unit_id, buyer_id, finance_type, stage, attorney, bond_originator, next_action, created_at, updated_at')
        .single()
    }

    if (
      transactionResult.error &&
      (isMissingColumnError(transactionResult.error, 'bond_amount') ||
        isMissingColumnError(transactionResult.error, 'transaction_type') ||
        isMissingColumnError(transactionResult.error, 'property_type') ||
        isMissingColumnError(transactionResult.error, 'property_address_line_1') ||
        isMissingColumnError(transactionResult.error, 'matter_owner') ||
        isMissingColumnError(transactionResult.error, 'seller_name') ||
        isMissingColumnError(transactionResult.error, 'seller_email') ||
        isMissingColumnError(transactionResult.error, 'seller_phone') ||
        isMissingColumnError(transactionResult.error, 'cash_amount') ||
        isMissingColumnError(transactionResult.error, 'deposit_amount') ||
        isMissingColumnError(transactionResult.error, 'reservation_required') ||
        isMissingColumnError(transactionResult.error, 'reservation_amount') ||
        isMissingColumnError(transactionResult.error, 'reservation_status') ||
        isMissingColumnError(transactionResult.error, 'reservation_paid_date') ||
        isMissingColumnError(transactionResult.error, 'reservation_payment_details') ||
        isMissingColumnError(transactionResult.error, 'onboarding_status') ||
        isMissingColumnError(transactionResult.error, 'onboarding_completed_at') ||
        isMissingColumnError(transactionResult.error, 'external_onboarding_submitted_at') ||
        isMissingColumnError(transactionResult.error, 'purchase_price') ||
        isMissingColumnError(transactionResult.error, 'assigned_agent_email') ||
        isMissingColumnError(transactionResult.error, 'assigned_attorney_email') ||
        isMissingColumnError(transactionResult.error, 'assigned_bond_originator_email') ||
        isMissingColumnError(transactionResult.error, 'current_main_stage') ||
        isMissingColumnError(transactionResult.error, 'comment') ||
        isMissingColumnError(transactionResult.error, 'owner_user_id') ||
        isMissingColumnError(transactionResult.error, 'access_level'))
    ) {
      const fallbackPayload = {
        ...(legacyMinimalTransactionPayload || minimalTransactionPayload),
        updated_at: new Date().toISOString(),
      }
      delete fallbackPayload.current_main_stage
      delete fallbackPayload.comment
      delete fallbackPayload.purchaser_type
      delete fallbackPayload.finance_managed_by
      delete fallbackPayload.transaction_type
      delete fallbackPayload.property_type
      delete fallbackPayload.property_address_line_1
      delete fallbackPayload.property_address_line_2
      delete fallbackPayload.suburb
      delete fallbackPayload.city
      delete fallbackPayload.province
      delete fallbackPayload.postal_code
      delete fallbackPayload.property_description
      delete fallbackPayload.matter_owner
      delete fallbackPayload.seller_name
      delete fallbackPayload.seller_email
      delete fallbackPayload.seller_phone
      delete fallbackPayload.assigned_agent
      delete fallbackPayload.assigned_agent_email
      delete fallbackPayload.assigned_attorney_email
      delete fallbackPayload.assigned_bond_originator_email
      delete fallbackPayload.owner_user_id
      delete fallbackPayload.access_level

      transactionResult = await client
        .from('transactions')
        .update(fallbackPayload)
        .eq('id', existingTransaction.id)
        .select('id, unit_id, buyer_id, finance_type, stage, attorney, bond_originator, next_action, created_at, updated_at')
        .single()
    }
  }

  if (transactionResult.error) {
    throw transactionResult.error
  }

  const transaction = transactionResult.data
  let persistedReservationRequired = Boolean(transactionPayload.reservation_required)
  let persistedReservationAmount = transactionPayload.reservation_amount ?? null

  if (persistedReservationRequired) {
    const persistedReservation = await persistReservationStateIfPossible(client, {
      transactionId: transaction.id,
      required: transactionPayload.reservation_required,
      amount: transactionPayload.reservation_amount,
      status: transactionPayload.reservation_status,
      paymentDetails: transactionPayload.reservation_payment_details,
      paidDate: transactionPayload.reservation_paid_date,
    })

    persistedReservationRequired = Boolean(persistedReservation.required)
    persistedReservationAmount = persistedReservation.amount ?? persistedReservationAmount
  }

  await logTransactionEventIfPossible(client, {
    transactionId: transaction.id,
    eventType: 'TransactionCreated',
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
        reservationStatus: transactionPayload.reservation_status,
        purchaserType,
        buyerId: buyer?.id || null,
        unitId: setup.unitId || null,
        developmentId: setup.developmentId || null,
        transactionType,
        propertyType: transactionPayload.property_type || null,
        propertyAddressLine1: transactionPayload.property_address_line_1 || null,
    },
  })

  try {
    const subprocesses = await ensureTransactionSubprocesses(client, transaction.id)
    await syncTransactionSubprocessOwners(
      client,
      { id: transaction.id, finance_managed_by: transactionPayload.finance_managed_by },
      subprocesses,
    )
  } catch (error) {
    if (!isMissingSchemaError(error)) {
      throw error
    }
  }

  let onboardingRecord = null
  let participantRows = []

  try {
    const participantsResult = await ensureTransactionParticipants(client, {
      transaction: {
        ...transactionPayload,
        id: transaction.id,
        buyer_id: buyer?.id || null,
      },
      buyer,
    })
    participantRows = participantsResult.participants || []
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

    onboardingRecord = await getOrCreateTransactionOnboardingRecord(client, {
      transactionId: transaction.id,
      purchaserType,
    })
  } catch (error) {
    if (!isMissingSchemaError(error)) {
      throw error
    }
  }

  try {
    await ensureTransactionRequiredDocuments(client, {
      transactionId: transaction.id,
      purchaserType,
      financeType: normalizedFinanceType,
      reservationRequired: reservationRequired,
      cashAmount: transactionPayload.cash_amount,
      bondAmount: transactionPayload.bond_amount,
    })
  } catch (error) {
    if (!isMissingSchemaError(error)) {
      throw error
    }
  }

  try {
    if (setup.unitId) {
      await getOrCreateClientPortalLink({
        developmentId: setup.developmentId,
        unitId: setup.unitId,
        transactionId: transaction.id,
        buyerId: buyer?.id || null,
      })
    }
  } catch (error) {
    const missingPortalSchema =
      isMissingSchemaError(error) || /client portal links are not set up yet/i.test(String(error?.message || ''))
    if (!missingPortalSchema) {
      throw error
    }
  }

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

  if (financeSave.error && !['42P01', '42703'].includes(financeSave.error.code)) {
    throw financeSave.error
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

  for (const target of assignmentTargets) {
    await createTransactionNotificationIfPossible(client, {
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
    })
  }

  await logTransactionEventIfPossible(client, {
    transactionId: transaction.id,
    eventType: 'TransactionUpdated',
    createdBy: actorProfile.userId || null,
    createdByRole: actorRole,
    eventData: {
      automation: 'TransactionInitialized',
      onboardingToken: onboardingRecord?.token || null,
      participantCount: participantRows.length,
      requiredDocsGenerated: true,
      clientLinkGenerated: true,
    },
  })

  await runDocumentAutomationIfPossible(client, {
    transactionId: transaction.id,
    documentId: null,
    documentName: null,
    category: null,
    actorRole,
    actorUserId: actorProfile.userId || null,
    source: 'transaction_created',
  })

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

  return {
    transactionId: transaction.id,
    unitId: unitData?.id || null,
    unitNumber: unitData?.unit_number || null,
    transactionType,
    propertyType: transactionPayload.property_type || null,
    propertyLabel:
      transactionType === 'private_property'
        ? [setup.propertyAddressLine1, setup.city || setup.suburb].filter(Boolean).join(', ') || setup.propertyDescription || 'Private property matter'
        : null,
    onboardingToken: onboardingRecord?.token || null,
    reservationRequired: persistedReservationRequired,
    reservationAmount: persistedReservationAmount,
  }
}

export async function fetchUnitsDataSummary({
  developmentId = null,
  stage = 'all',
  financeType = 'all',
  activeTransactionsOnly = false,
} = {}) {
  const timer = createPerfTimer('api.fetchUnitsDataSummary', {
    developmentId: developmentId || 'all',
    stage,
    financeType,
    activeTransactionsOnly,
  })
  const cacheKey = JSON.stringify({
    developmentId: developmentId || 'all',
    stage,
    financeType,
    activeTransactionsOnly,
  })
  const cached = readTimedCache(unitSummaryCache, cacheKey, TRANSACTION_SUMMARY_CACHE_TTL_MS)
  if (cached) {
    timer.mark('cache_hit')
    timer.end({ rowCount: cached.length })
    return cached
  }

  if (unitSummaryInFlight.has(cacheKey)) {
    timer.mark('inflight_hit')
    const rows = await unitSummaryInFlight.get(cacheKey)
    timer.end({ rowCount: rows.length })
    return rows
  }

  const loader = (async () => {
    const client = requireClient()
    timer.mark('units_query_start')
    const units = activeTransactionsOnly
      ? await fetchUnitsByIds(client, await fetchActiveTransactionUnitIds(client, developmentId), developmentId)
      : await fetchUnitsBase(client, developmentId)
    timer.mark('units_query_end', { unitCount: units.length })

    timer.mark('hydrate_summary_start')
    const hydratedRows = dedupeTransactionRows(await hydrateUnitRows(client, units, { includeOperationalSignals: false }))
    timer.mark('hydrate_summary_end', { hydratedCount: hydratedRows.length })

    const rows = dedupeTransactionRows(
      hydratedRows.filter((row) => {
        if (activeTransactionsOnly && !row?.transaction?.id) {
          return false
        }

        const stageMatch = stage === 'all' ? true : row.stage === stage
        const financeMatch = financeTypeMatchesFilter(row.transaction?.finance_type, financeType)

        return stageMatch && financeMatch
      }),
    )

    writeTimedCache(unitSummaryCache, cacheKey, rows)
    timer.end({ rowCount: rows.length })
    return rows
  })()

  unitSummaryInFlight.set(cacheKey, loader)
  try {
    return await loader
  } finally {
    unitSummaryInFlight.delete(cacheKey)
  }
}

export async function fetchUnitsData({
  developmentId = null,
  stage = 'all',
  financeType = 'all',
  activeTransactionsOnly = false,
} = {}) {
  return fetchUnitsDataSummary({
    developmentId,
    stage,
    financeType,
    activeTransactionsOnly,
  })
}

function inferTransactionType(transaction = {}) {
  const explicitType = normalizeStoredTransactionType(transaction?.transaction_type, '')
  if (explicitType === 'developer_sale') {
    return 'development'
  }
  if (explicitType === 'private_property') {
    return 'private'
  }

  return transaction?.development_id || transaction?.unit_id ? 'development' : 'private'
}

async function fetchStandaloneTransactionRows(client, { developmentId = null, excludeTransactionIds = [] } = {}) {
  const excluded = new Set((excludeTransactionIds || []).filter(Boolean))

  let baseQuery = client
    .from('transactions')
    .select(
      selectWithoutKnownMissingColumns(
        'id, transaction_reference, transaction_type, property_type, development_id, unit_id, buyer_id, property_address_line_1, property_address_line_2, suburb, city, province, postal_code, property_description, matter_owner, seller_name, seller_email, seller_phone, sales_price, purchase_price, finance_type, purchaser_type, finance_managed_by, stage, current_main_stage, current_sub_stage_summary, risk_status, stage_date, sale_date, assigned_agent, assigned_agent_email, attorney, assigned_attorney_email, bond_originator, assigned_bond_originator_email, bank, expected_transfer_date, next_action, comment, owner_user_id, access_level, is_active, lifecycle_state, attorney_stage, operational_state, waiting_on_role, registration_date, title_deed_number, registered_at, completed_at, archived_at, cancelled_at, last_meaningful_activity_at, final_report_generated_at, updated_at, created_at',
      ),
    )

  if (developmentId) {
    baseQuery = baseQuery.eq('development_id', developmentId)
  }

  let query = await baseQuery

  if (
    query.error &&
    (isMissingColumnError(query.error, 'transaction_type') ||
      isMissingColumnError(query.error, 'property_type') ||
      isMissingColumnError(query.error, 'property_address_line_1') ||
      isMissingColumnError(query.error, 'seller_name') ||
      isMissingColumnError(query.error, 'seller_email') ||
      isMissingColumnError(query.error, 'seller_phone') ||
      isMissingColumnError(query.error, 'lifecycle_state') ||
      isMissingColumnError(query.error, 'attorney_stage') ||
      isMissingColumnError(query.error, 'operational_state') ||
      isMissingColumnError(query.error, 'waiting_on_role') ||
      isMissingColumnError(query.error, 'registration_date') ||
      isMissingColumnError(query.error, 'title_deed_number') ||
      isMissingColumnError(query.error, 'owner_user_id') ||
      isMissingColumnError(query.error, 'access_level') ||
      isMissingColumnError(query.error, 'registered_at') ||
      isMissingColumnError(query.error, 'completed_at') ||
      isMissingColumnError(query.error, 'archived_at') ||
      isMissingColumnError(query.error, 'cancelled_at') ||
      isMissingColumnError(query.error, 'last_meaningful_activity_at') ||
      isMissingColumnError(query.error, 'final_report_generated_at'))
  ) {
    registerKnownMissingColumns(query.error, [
      'transaction_type',
      'property_type',
      'property_address_line_1',
      'seller_name',
      'seller_email',
      'seller_phone',
      'lifecycle_state',
      'attorney_stage',
      'operational_state',
      'waiting_on_role',
      'registration_date',
      'title_deed_number',
      'owner_user_id',
      'access_level',
      'registered_at',
      'completed_at',
      'archived_at',
      'cancelled_at',
      'last_meaningful_activity_at',
      'final_report_generated_at',
    ])
    let fallbackQuery = client
      .from('transactions')
      .select(
        selectWithoutKnownMissingColumns(
          'id, development_id, unit_id, buyer_id, sales_price, purchase_price, finance_type, purchaser_type, finance_managed_by, stage, current_main_stage, current_sub_stage_summary, risk_status, stage_date, sale_date, assigned_agent, assigned_agent_email, attorney, assigned_attorney_email, bond_originator, assigned_bond_originator_email, bank, expected_transfer_date, next_action, comment, is_active, lifecycle_state, attorney_stage, operational_state, waiting_on_role, registration_date, title_deed_number, registered_at, completed_at, archived_at, cancelled_at, last_meaningful_activity_at, final_report_generated_at, updated_at, created_at',
        ),
      )

    if (developmentId) {
      fallbackQuery = fallbackQuery.eq('development_id', developmentId)
    }

    query = await fallbackQuery
  }

  if (query.error && isMissingColumnError(query.error)) {
    let legacyFallbackQuery = client.from('transactions').select(
      'id, development_id, unit_id, buyer_id, finance_type, stage, attorney, bond_originator, next_action, updated_at, created_at',
    )

    if (developmentId) {
      legacyFallbackQuery = legacyFallbackQuery.eq('development_id', developmentId)
    }

    query = await legacyFallbackQuery
  }

  if (query.error) {
    throw query.error
  }

  const sourceRows = (query.data || [])
    .filter((transaction) => !excluded.has(transaction.id))
    .filter((transaction) => transaction?.is_active !== false)
    .filter((transaction) => !transaction?.unit_id)
    .filter((transaction) => (developmentId ? transaction?.development_id === developmentId : true))

  if (!sourceRows.length) {
    return []
  }

  const buyerIds = [...new Set(sourceRows.map((transaction) => transaction?.buyer_id).filter(Boolean))]
  const developmentIds = [...new Set(sourceRows.map((transaction) => transaction?.development_id).filter(Boolean))]
  let buyersById = {}
  let developmentsById = {}

  if (buyerIds.length) {
    const buyersQuery = await client
      .from('buyers')
      .select(selectWithoutKnownMissingColumns('id, name, phone, email'))
      .in('id', buyerIds)

    if (buyersQuery.error) {
      throw buyersQuery.error
    }

    buyersById = (buyersQuery.data || []).reduce((accumulator, buyer) => {
      accumulator[buyer.id] = buyer
      return accumulator
    }, {})
  }

  if (developmentIds.length) {
    const developmentsQuery = await client.from('developments').select('id, name, location').in('id', developmentIds)
    if (developmentsQuery.error && !isMissingSchemaError(developmentsQuery.error)) {
      throw developmentsQuery.error
    }

    developmentsById = (developmentsQuery.data || []).reduce((accumulator, item) => {
      accumulator[item.id] = item
      return accumulator
    }, {})
  }

  return sourceRows.map((transaction) => {
    const stage = normalizeStage(transaction?.stage, null)
    return {
      unit: null,
      development: transaction?.development_id ? developmentsById[transaction.development_id] || null : null,
      transaction: {
        ...transaction,
        transaction_type: inferTransactionType(transaction),
      },
      buyer: transaction?.buyer_id ? buyersById[transaction.buyer_id] || null : null,
      stage,
      mainStage: normalizeMainStage(transaction?.current_main_stage, stage),
    }
  })
}

export async function fetchTransactionsData({ developmentId = null } = {}) {
  const client = requireClient()
  const unitRows = await fetchUnitsData({ developmentId, stage: 'all', financeType: 'all' })
  const transactionRows = unitRows.filter((row) => row.transaction)
  const standaloneRows = await fetchStandaloneTransactionRows(client, {
    developmentId,
    excludeTransactionIds: transactionRows.map((row) => row?.transaction?.id).filter(Boolean),
  })
  const combinedRows = dedupeTransactionRows([...transactionRows, ...standaloneRows])
  const enrichedRows = dedupeTransactionRows(await enrichRowsWithReadinessContext(client, combinedRows))

  return enrichedRows.sort((a, b) => new Date(latestTimestamp(b) || 0) - new Date(latestTimestamp(a) || 0))
}

async function resolveProfileIdentityByUserId(client, userId) {
  if (!userId) {
    return { userId: null, email: '' }
  }

  const profileQuery = await client.from('profiles').select('id, email').eq('id', userId).maybeSingle()
  if (profileQuery.error) {
    if (isMissingSchemaError(profileQuery.error)) {
      return { userId, email: '' }
    }
    throw profileQuery.error
  }

  let email = normalizeEmailAddress(profileQuery.data?.email)
  if (!email) {
    try {
      const authResult = await client.auth.getUser()
      const authUser = authResult?.data?.user || null
      if (authUser?.id === userId) {
        email = normalizeEmailAddress(authUser.email)
      }
    } catch {
      // Best-effort fallback only; keep access resolution working with userId when auth lookup fails.
    }
  }

  return {
    userId,
    email,
  }
}

async function fetchDirectTransactionIdsForUser(client, { userId = null, participantEmail = '', roleType = null } = {}) {
  const normalizedRole = roleType ? normalizeRoleType(roleType) : null
  const normalizedEmail = normalizeEmailAddress(participantEmail)
  const transactionIds = new Set()

  if (userId) {
    let byUserQuery = await client
      .from('transaction_participants')
      .select('transaction_id, role_type, status, removed_at')
      .eq('user_id', userId)

    if (byUserQuery.error && isMissingColumnError(byUserQuery.error, 'user_id')) {
      byUserQuery = { data: [], error: null }
    }
    if (
      byUserQuery.error &&
      (isMissingColumnError(byUserQuery.error, 'status') || isMissingColumnError(byUserQuery.error, 'removed_at'))
    ) {
      byUserQuery = await client
        .from('transaction_participants')
        .select('transaction_id, role_type')
        .eq('user_id', userId)
    }

    if (byUserQuery.error && !isMissingSchemaError(byUserQuery.error)) {
      throw byUserQuery.error
    }

    for (const row of byUserQuery.data || []) {
      if (row?.removed_at) {
        continue
      }
      if (row?.status && normalizeStakeholderStatus(row.status, 'active') !== 'active') {
        continue
      }
      if (!normalizedRole || normalizeRoleType(row.role_type) === normalizedRole) {
        transactionIds.add(row.transaction_id)
      }
    }
  }

  if (normalizedEmail) {
    const byEmailQuery = await client
      .from('transaction_participants')
      .select('transaction_id, role_type, status, removed_at')
      .eq('participant_email', normalizedEmail)

    if (
      byEmailQuery.error &&
      (isMissingColumnError(byEmailQuery.error, 'status') || isMissingColumnError(byEmailQuery.error, 'removed_at'))
    ) {
      const fallbackByEmailQuery = await client
        .from('transaction_participants')
        .select('transaction_id, role_type')
        .eq('participant_email', normalizedEmail)
      if (fallbackByEmailQuery.error && !isMissingSchemaError(fallbackByEmailQuery.error)) {
        throw fallbackByEmailQuery.error
      }
      for (const row of fallbackByEmailQuery.data || []) {
        if (!normalizedRole || normalizeRoleType(row.role_type) === normalizedRole) {
          transactionIds.add(row.transaction_id)
        }
      }
    } else {
      if (byEmailQuery.error && !isMissingSchemaError(byEmailQuery.error)) {
        throw byEmailQuery.error
      }

      for (const row of byEmailQuery.data || []) {
        if (row?.removed_at) {
          continue
        }
        if (row?.status && normalizeStakeholderStatus(row.status, 'active') !== 'active') {
          continue
        }
        if (!normalizedRole || normalizeRoleType(row.role_type) === normalizedRole) {
          transactionIds.add(row.transaction_id)
        }
      }
    }
  }

  if (normalizedEmail) {
    const legacyAssignmentColumnByRole = {
      attorney: 'assigned_attorney_email',
      agent: 'assigned_agent_email',
      bond_originator: 'assigned_bond_originator_email',
    }
    const legacyColumn = legacyAssignmentColumnByRole[normalizedRole || '']
    if (legacyColumn) {
      let legacyQuery = await client
        .from('transactions')
        .select('id, is_active')
        .eq(legacyColumn, normalizedEmail)

      if (legacyQuery.error && isMissingColumnError(legacyQuery.error, 'is_active')) {
        legacyQuery = await client
          .from('transactions')
          .select('id')
          .eq(legacyColumn, normalizedEmail)
      }

      if (legacyQuery.error && !isMissingColumnError(legacyQuery.error, legacyColumn) && !isMissingSchemaError(legacyQuery.error)) {
        throw legacyQuery.error
      }

      for (const row of legacyQuery.data || []) {
        if (row?.is_active === false) {
          continue
        }
        if (row?.id) {
          transactionIds.add(row.id)
        }
      }
    }
  }

  return transactionIds
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
    query = await client
      .from('transactions')
      .select('id, development_id')
      .in('development_id', developmentIds)
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

export async function getAccessibleTransactionIdsForUser({ userId, roleType = null } = {}) {
  const client = requireClient()
  if (!userId) {
    return []
  }

  const normalizedRole = roleType ? normalizeRoleType(roleType) : null
  const identity = await resolveProfileIdentityByUserId(client, userId)
  const actorProfile = await resolveActiveProfileContext(client)
  if (normalizeRoleType(actorProfile.role) === 'internal_admin') {
    let allTransactionsQuery = await client.from('transactions').select('id, is_active')
    if (allTransactionsQuery.error && isMissingColumnError(allTransactionsQuery.error, 'is_active')) {
      allTransactionsQuery = await client.from('transactions').select('id')
    }
    if (allTransactionsQuery.error) {
      if (isMissingSchemaError(allTransactionsQuery.error)) {
        return []
      }
      throw allTransactionsQuery.error
    }
    return (allTransactionsQuery.data || [])
      .filter((row) => row?.id && row?.is_active !== false)
      .map((row) => row.id)
  }

  const directIds = await fetchDirectTransactionIdsForUser(client, {
    userId: identity.userId,
    participantEmail: identity.email,
    roleType,
  })
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
    rowsQuery = await client
      .from('transactions')
      .select('id, is_active')
      .in('id', candidateIds)
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
    (isMissingColumnError(transactionQuery.error, 'owner_user_id') || isMissingColumnError(transactionQuery.error, 'access_level'))
  ) {
    transactionQuery = await client
      .from('transactions')
      .select('id, development_id, is_active')
      .eq('id', transactionId)
      .maybeSingle()
  }

  if (transactionQuery.error) {
    if (isMissingSchemaError(transactionQuery.error)) {
      const accessibleIds = await getAccessibleTransactionIdsForUser({ userId, roleType })
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
  const accessibleIds = await getAccessibleTransactionIdsForUser({ userId, roleType })
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
    (isMissingColumnError(transactionQuery.error, 'owner_user_id') || isMissingColumnError(transactionQuery.error, 'access_level'))
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

function canManageTransactionStakeholders({
  actorRole = null,
  actorFirmRole = null,
  isOwner = false,
}) {
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
  const attorneyParticipants = activeParticipants.filter((item) => normalizeRoleType(item?.roleType || item?.role_type) === 'attorney')
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
    return { transfer: null, bond: null, cancellation: null, participants: [], validation: validateLegalRoles([]) }
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
      return { transfer: null, bond: null, cancellation: null, participants: [], validation: validateLegalRoles([]) }
    }
    throw query.error
  }

  const participants = (query.data || []).map((row) => normalizeTransactionParticipantRow(row))
  const activeParticipants = participants.filter((item) => normalizeStakeholderStatus(item.stakeholderStatus, 'active') !== 'removed')
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

export async function updateTransactionAccessControl({
  transactionId,
  ownerUserId = null,
  accessLevel = null,
} = {}) {
  const client = requireClient()
  if (!transactionId) {
    throw new Error('Transaction is required.')
  }

  const actorProfile = await resolveActiveProfileContext(client)
  const transaction = await fetchTransactionAccessControlRow(client, transactionId)
  if (!transaction) {
    throw new Error('Transaction not found.')
  }

  const isOwner = Boolean(transaction.owner_user_id && actorProfile.userId && transaction.owner_user_id === actorProfile.userId)
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

function buildStakeholderPermissionPayload(roleType, financeManagedBy = 'bond_originator') {
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

  const normalizedRoleType = normalizeRoleType(roleType)
  const normalizedLegalRole =
    normalizedRoleType === 'attorney'
      ? normalizeAttorneyLegalRole(legalRole, 'transfer')
      : 'none'
  const actorProfile = await resolveActiveProfileContext(client)
  const transaction = await fetchTransactionAccessControlRow(client, transactionId)
  if (!transaction) {
    throw new Error('Transaction not found.')
  }
  const isOwner = Boolean(transaction.owner_user_id && actorProfile.userId && transaction.owner_user_id === actorProfile.userId)
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
      'id, transaction_id, user_id, role_type, legal_role, status, firm_id, invited_by_user_id, invitation_token, invitation_expires_at, invited_at, accepted_at, removed_at, visibility_scope, is_internal, participant_name, participant_email, can_view, can_comment, can_upload_documents, can_edit_finance_workflow, can_edit_attorney_workflow, can_edit_core_transaction, created_at, updated_at',
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
  const expiresAt = Number(expiresDays) > 0 ? new Date(Date.now() + Number(expiresDays) * 24 * 60 * 60 * 1000).toISOString() : null

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
    status: 'invited',
  }

  let updateQuery = await client
    .from('transaction_participants')
    .update(invitationUpdatePayload)
    .eq('id', participant.id)
    .select(
      'id, transaction_id, user_id, role_type, legal_role, status, firm_id, invited_by_user_id, invitation_token, invitation_expires_at, invited_at, accepted_at, removed_at, visibility_scope, is_internal, participant_name, participant_email, can_view, can_comment, can_upload_documents, can_edit_finance_workflow, can_edit_attorney_workflow, can_edit_core_transaction, created_at, updated_at',
    )
    .maybeSingle()

  if (
    updateQuery.error &&
    (isMissingColumnError(updateQuery.error, 'legal_role') ||
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

  return {
    participant: normalizeTransactionParticipantRow(updateQuery.data || participant),
    invitationToken,
    invitationUrl: `/invite/stakeholder/${invitationToken}`,
    expiresAt,
  }
}

export async function acceptStakeholderInvite({ invitationToken } = {}) {
  const client = requireClient()
  const normalizedToken = String(invitationToken || '').trim()
  if (!normalizedToken) {
    throw new Error('Invitation token is required.')
  }

  const actorProfile = await resolveActiveProfileContext(client)
  let lookupQuery = await client
    .from('transaction_participants')
    .select(
      'id, transaction_id, user_id, role_type, legal_role, status, firm_id, invited_by_user_id, invitation_token, invitation_expires_at, invited_at, accepted_at, removed_at, visibility_scope, is_internal, participant_name, participant_email, can_view, can_comment, can_upload_documents, can_edit_finance_workflow, can_edit_attorney_workflow, can_edit_core_transaction, created_at, updated_at',
    )
    .eq('invitation_token', normalizedToken)
    .maybeSingle()

  if (
    lookupQuery.error &&
    (isMissingColumnError(lookupQuery.error, 'legal_role') ||
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
      'id, transaction_id, user_id, role_type, legal_role, status, firm_id, invited_by_user_id, invitation_token, invitation_expires_at, invited_at, accepted_at, removed_at, visibility_scope, is_internal, participant_name, participant_email, can_view, can_comment, can_upload_documents, can_edit_finance_workflow, can_edit_attorney_workflow, can_edit_core_transaction, created_at, updated_at',
    )
    .single()

  if (
    updateQuery.error &&
    (isMissingColumnError(updateQuery.error, 'legal_role') ||
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

export async function removeStakeholder({
  transactionId,
  stakeholderId,
} = {}) {
  const client = requireClient()
  if (!transactionId || !stakeholderId) {
    throw new Error('Transaction and stakeholder identifiers are required.')
  }

  const actorProfile = await resolveActiveProfileContext(client)
  const transaction = await fetchTransactionAccessControlRow(client, transactionId)
  if (!transaction) {
    throw new Error('Transaction not found.')
  }
  const isOwner = Boolean(transaction.owner_user_id && actorProfile.userId && transaction.owner_user_id === actorProfile.userId)
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
  if (existingQuery.error && (isMissingColumnError(existingQuery.error, 'legal_role') || isMissingColumnError(existingQuery.error, 'status'))) {
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
  const existingLegalRole = normalizeAttorneyLegalRole(existing.legal_role, existingRoleType === 'attorney' ? 'transfer' : 'none')
  const existingStatus = normalizeStakeholderStatus(existing.status, existing.removed_at ? 'removed' : 'active')
  if (existingRoleType === 'attorney' && existingLegalRole === 'transfer' && existingStatus !== 'removed') {
    const assignments = await getLegalRoleAssignments(transactionId)
    const activeTransferCount = (assignments.participants || []).filter((participant) => participant.legalRole === 'transfer').length
    if (activeTransferCount <= 1) {
      throw new Error('A Transfer Attorney is required. Assign another transfer attorney before removing this stakeholder.')
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

export async function assignTask({
  checklistItemId,
  ownerUserId = null,
} = {}) {
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
    if (isMissingColumnError(updateQuery.error, 'owner_user_id') || isMissingTableError(updateQuery.error, 'transaction_checklist_items')) {
      throw new Error('Checklist assignment columns are not set up yet. Run sql/schema.sql and refresh.')
    }
    throw updateQuery.error
  }

  return updateQuery.data || null
}

export async function getTransactionAccess({
  transactionId,
  userId,
  roleType = null,
} = {}) {
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

export async function createFirm({
  name,
  type = 'attorney',
} = {}) {
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

export async function addFirmMember({
  firmId,
  userId,
  role = 'attorney',
  status = 'active',
} = {}) {
  const client = requireClient()
  if (!firmId || !userId) {
    throw new Error('Firm and user are required.')
  }

  const actorProfile = await resolveActiveProfileContext(client)
  const payload = {
    firm_id: firmId,
    user_id: userId,
    role: normalizeFirmRole(role),
    status: normalizeStakeholderStatus(status, 'active') === 'removed' ? 'inactive' : status === 'invited' ? 'invited' : 'active',
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
  const transactionIds = await getAccessibleTransactionIdsForUser({ userId, roleType })
  if (!transactionIds.length) {
    return []
  }

  const allRows = await fetchTransactionsData({ developmentId: null })
  const transactionIdSet = new Set(transactionIds)
  const scopedRows = dedupeTransactionRows(allRows.filter((row) => transactionIdSet.has(row?.transaction?.id)))
  return dedupeTransactionRows(await enrichRowsWithReadinessContext(client, scopedRows))
}

async function fetchTransactionSummaryRowsByIds(client, transactionIds = []) {
  const ids = [...new Set((transactionIds || []).filter(Boolean))]
  if (!ids.length) {
    return []
  }

  let transactionsQuery = await client
    .from('transactions')
    .select(
      selectWithoutKnownMissingColumns(
        'id, transaction_reference, transaction_type, property_type, development_id, unit_id, buyer_id, property_address_line_1, property_address_line_2, suburb, city, province, property_description, seller_name, seller_email, seller_phone, sales_price, purchase_price, finance_type, purchaser_type, stage, current_main_stage, current_sub_stage_summary, assigned_agent, assigned_agent_email, attorney, assigned_attorney_email, bond_originator, assigned_bond_originator_email, bank, next_action, updated_at, created_at, is_active',
      ),
    )
    .in('id', ids)

  if (
    transactionsQuery.error &&
    (isMissingColumnError(transactionsQuery.error, 'transaction_reference') ||
      isMissingColumnError(transactionsQuery.error, 'transaction_type') ||
      isMissingColumnError(transactionsQuery.error, 'property_type') ||
      isMissingColumnError(transactionsQuery.error, 'current_main_stage') ||
      isMissingColumnError(transactionsQuery.error, 'current_sub_stage_summary') ||
      isMissingColumnError(transactionsQuery.error, 'assigned_agent') ||
      isMissingColumnError(transactionsQuery.error, 'assigned_agent_email') ||
      isMissingColumnError(transactionsQuery.error, 'assigned_attorney_email') ||
      isMissingColumnError(transactionsQuery.error, 'assigned_bond_originator_email') ||
      isMissingColumnError(transactionsQuery.error, 'seller_name') ||
      isMissingColumnError(transactionsQuery.error, 'purchase_price'))
  ) {
    registerKnownMissingColumns(transactionsQuery.error, [
      'transaction_reference',
      'transaction_type',
      'property_type',
      'current_main_stage',
      'current_sub_stage_summary',
      'assigned_agent',
      'assigned_agent_email',
      'assigned_attorney_email',
      'assigned_bond_originator_email',
      'seller_name',
      'seller_email',
      'seller_phone',
      'purchase_price',
    ])
    transactionsQuery = await client
      .from('transactions')
      .select('id, development_id, unit_id, buyer_id, finance_type, purchaser_type, stage, attorney, bond_originator, next_action, updated_at, created_at')
      .in('id', ids)
  }

  if (transactionsQuery.error) {
    throw transactionsQuery.error
  }

  const transactionRows = (transactionsQuery.data || []).filter((item) => item?.is_active !== false)
  if (!transactionRows.length) {
    return []
  }

  const buyerIds = [...new Set(transactionRows.map((item) => item?.buyer_id).filter(Boolean))]
  const unitIds = [...new Set(transactionRows.map((item) => item?.unit_id).filter(Boolean))]
  const developmentIds = [...new Set(transactionRows.map((item) => item?.development_id).filter(Boolean))]

  let buyersById = {}
  if (buyerIds.length) {
    const buyersQuery = await client.from('buyers').select('id, name, phone, email').in('id', buyerIds)
    if (buyersQuery.error && !isMissingSchemaError(buyersQuery.error)) {
      throw buyersQuery.error
    }
    buyersById = (buyersQuery.data || []).reduce((accumulator, item) => {
      accumulator[item.id] = item
      return accumulator
    }, {})
  }

  let unitsById = {}
  if (unitIds.length) {
    const unitsQuery = await client
      .from('units')
      .select('id, development_id, unit_number, phase, price, status')
      .in('id', unitIds)
    if (unitsQuery.error && !isMissingSchemaError(unitsQuery.error)) {
      throw unitsQuery.error
    }
    unitsById = (unitsQuery.data || []).reduce((accumulator, item) => {
      accumulator[item.id] = item
      return accumulator
    }, {})
  }

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

  return transactionRows
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
}

export async function fetchTransactionsByParticipantSummary({ userId, roleType = null } = {}) {
  const timer = createPerfTimer('api.fetchTransactionsByParticipantSummary', { userId, roleType })
  if (!userId) {
    timer.end({ rowCount: 0 })
    return []
  }

  timer.mark('resolve_access_start')
  const client = requireClient()
  const transactionIds = await getAccessibleTransactionIdsForUser({ userId, roleType })
  timer.mark('resolve_access_end', { transactionCount: transactionIds.length })
  const rows = await fetchTransactionSummaryRowsByIds(client, transactionIds)
  timer.end({ rowCount: rows.length })
  return rows
}

export async function fetchTransactionsByParticipant({ userId, roleType = null } = {}) {
  if (!userId) {
    return []
  }

  const timer = createPerfTimer('api.fetchTransactionsByParticipant', { userId, roleType })
  timer.mark('participant_query_start')
  const rows = await getAccessibleTransactionsForUser({ userId, roleType })
  timer.mark('participant_query_end', { rowCount: rows.length })
  timer.end({ rowCount: rows.length })
  return rows
}

export async function fetchTransactionById(transactionId) {
  if (!transactionId) {
    return null
  }

  const mockDetail = getAttorneyMockTransactionDetail(transactionId)
  if (mockDetail) {
    return mockDetail
  }

  const client = requireClient()
  const transaction = await fetchTransactionRowById(client, transactionId)
  if (!transaction || transaction?.is_active === false) {
    return null
  }

  const activeProfile = await resolveActiveProfileContext(client)
  if (normalizeRoleType(activeProfile.role) === 'attorney' && activeProfile.userId) {
    const allowed = await canUserAccessTransaction({
      userId: activeProfile.userId,
      transactionId,
      roleType: 'attorney',
    })
    if (!allowed) {
      throw new Error('You do not have access to this transaction. Refresh Transactions and try again.')
    }
  }

  if (transaction.unit_id) {
    let unitDetail = null
    try {
      unitDetail = await fetchUnitDetail(transaction.unit_id)
    } catch (unitDetailError) {
      const recoverableUnitDetailError =
        isMissingSchemaError(unitDetailError) ||
        isPermissionDeniedError(unitDetailError) ||
        isMissingColumnError(unitDetailError)
      if (!recoverableUnitDetailError) {
        throw unitDetailError
      }
    }

    if (unitDetail?.transaction?.id === transactionId) {
      const transactionEvents = await fetchTransactionEvents(transactionId)
      return {
        ...unitDetail,
        transactionEvents,
      }
    }
  }

  const [unitQuery, buyerQuery, initialParticipantsQuery, discussionRows, transactionEvents] = await Promise.all([
    transaction.unit_id
      ? client
          .from('units')
          .select('id, development_id, unit_number, phase, price, status, development:developments(id, name)')
          .eq('id', transaction.unit_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    transaction.buyer_id
      ? client.from('buyers').select('id, name, phone, email').eq('id', transaction.buyer_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    client
      .from('transaction_participants')
      .select(
        'id, transaction_id, user_id, role_type, legal_role, status, firm_id, invited_by_user_id, invitation_token, invitation_expires_at, invited_at, accepted_at, removed_at, visibility_scope, is_internal, participant_name, participant_email, can_view, can_comment, can_upload_documents, can_edit_finance_workflow, can_edit_attorney_workflow, can_edit_core_transaction, created_at, updated_at',
      )
      .eq('transaction_id', transactionId),
    fetchTransactionDiscussion(transactionId, {
      unitId: transaction.unit_id || null,
      viewer: 'internal',
      includeLegacy: true,
      limit: 250,
    }),
    fetchTransactionEvents(transactionId),
  ])

  if (unitQuery.error && !isMissingSchemaError(unitQuery.error)) {
    throw unitQuery.error
  }
  if (buyerQuery.error && !isMissingSchemaError(buyerQuery.error)) {
    throw buyerQuery.error
  }
  let participantsQuery = initialParticipantsQuery
  if (
    participantsQuery.error &&
    (isMissingColumnError(participantsQuery.error, 'legal_role') ||
      isMissingColumnError(participantsQuery.error, 'status') ||
      isMissingColumnError(participantsQuery.error, 'firm_id') ||
      isMissingColumnError(participantsQuery.error, 'visibility_scope') ||
      isMissingColumnError(participantsQuery.error, 'invited_at') ||
      isMissingColumnError(participantsQuery.error, 'accepted_at') ||
      isMissingColumnError(participantsQuery.error, 'removed_at') ||
      isMissingColumnError(participantsQuery.error, 'invited_by_user_id') ||
      isMissingColumnError(participantsQuery.error, 'invitation_token') ||
      isMissingColumnError(participantsQuery.error, 'invitation_expires_at') ||
      isMissingColumnError(participantsQuery.error, 'is_internal'))
  ) {
    participantsQuery = await client
      .from('transaction_participants')
      .select(
        'id, transaction_id, user_id, role_type, participant_name, participant_email, can_view, can_comment, can_upload_documents, can_edit_finance_workflow, can_edit_attorney_workflow, can_edit_core_transaction, created_at, updated_at',
      )
      .eq('transaction_id', transactionId)
  }
  if (participantsQuery.error && !isMissingSchemaError(participantsQuery.error)) {
    throw participantsQuery.error
  }

  const documents = await loadSharedDocuments(client, {
    transactionIds: [transactionId],
    viewer: 'internal',
  })
  const transactionSubprocesses = await ensureTransactionSubprocesses(client, transaction.id)
  try {
    await ensureTransactionChecklistItems({ transactionId })
  } catch (ensureError) {
    if (!isMissingSchemaError(ensureError)) {
      throw ensureError
    }
  }
  const [documentRequestsByTransactionId, checklistItemsByTransactionId, issueOverridesByTransactionId, transactionRequirementsByTransactionId] = await Promise.all([
    loadTransactionDocumentRequestsByIds(client, [transactionId]),
    loadTransactionChecklistItemsByIds(client, [transactionId]),
    loadTransactionIssueOverridesByIds(client, [transactionId]),
    fetchTransactionRequiredDocumentsByTransactionIds(client, [transactionId]),
  ])
  const transactionRequiredDocuments = transactionRequirementsByTransactionId[transactionId] || []
  const fallbackRequirements =
    unitQuery.data?.development_id
      ? await fetchDocumentRequirements(client, unitQuery.data.development_id)
      : DEFAULT_DOCUMENT_REQUIREMENTS
  const checklistResult = transactionRequiredDocuments.length
    ? buildRequiredChecklistFromRows(transactionRequiredDocuments, documents)
    : buildDocumentChecklist(fallbackRequirements, documents)
  const stageKey = resolveAttorneyOperationalStageKey({ transaction })

  return {
    unit: unitQuery.data || null,
    transaction: transaction || null,
    buyer: buyerQuery.data || null,
    documents,
    clientPortalLinks: [],
    clientIssues: [],
    alterationRequests: [],
    serviceReviews: [],
    trustInvestmentForm: null,
    handover: null,
    transactionSubprocesses,
    onboarding: null,
    onboardingFormData: null,
    purchaserType: normalizePurchaserType(transaction?.purchaser_type),
    purchaserTypeLabel: getPurchaserTypeLabel(transaction?.purchaser_type),
    transactionRequiredDocuments,
    transactionParticipants: (participantsQuery.data || []).map((row) => normalizeTransactionParticipantRow(row)),
    activeViewerRole: 'developer',
    activeViewerPermissions: getRolePermissions({
      role: 'developer',
      financeManagedBy: transaction?.finance_managed_by || 'bond_originator',
    }),
    transactionDiscussion: discussionRows || [],
    transactionStatusLink: null,
    developmentSettings: DEFAULT_DEVELOPMENT_SETTINGS,
    requiredDocumentChecklist: checklistResult.checklist,
    documentSummary: checklistResult.summary,
    documentRequests: documentRequestsByTransactionId[transactionId] || [],
    documentRequestSummary: summarizeDocumentRequests(documentRequestsByTransactionId[transactionId] || []),
    transactionChecklistItems: checklistItemsByTransactionId[transactionId] || [],
    checklistSummary: summarizeChecklistItems(checklistItemsByTransactionId[transactionId] || [], { stageKey }),
    issueOverrides: issueOverridesByTransactionId[transactionId] || [],
    stage: normalizeStage(transaction?.stage, unitQuery.data?.status || 'Available'),
    mainStage: normalizeMainStage(transaction?.current_main_stage, transaction?.stage || unitQuery.data?.status || 'Available'),
    transactionEvents,
  }
}

export async function fetchDocumentsData({ developmentId = null } = {}) {
  const client = requireClient()
  const transactionRows = await fetchTransactionsData({ developmentId })

  const transactionIds = transactionRows.map((row) => row.transaction.id)

  if (!transactionIds.length) {
    return []
  }

  const rowByTransactionId = transactionRows.reduce((accumulator, row) => {
    accumulator[row.transaction.id] = row
    return accumulator
  }, {})

  const docsWithUrls = await loadSharedDocuments(client, {
    transactionIds,
    viewer: 'internal',
  })

  return docsWithUrls.map((doc) => {
    const row = rowByTransactionId[doc.transaction_id]

    return {
      ...doc,
      developmentName: row?.development?.name || '-',
      unitNumber: row?.unit?.unit_number || '-',
      buyerName: row?.buyer?.name || '-',
      stage: row?.stage || '-',
    }
  })
}

export async function fetchDocumentsByUnit({ developmentId = null } = {}) {
  const client = requireClient()
  const rows = await fetchUnitsData({ developmentId, stage: 'all', financeType: 'all' })

  if (!rows.length) {
    return []
  }

  const transactionIds = [...new Set(rows.map((row) => row.transaction?.id).filter(Boolean))]
  const documents = await loadSharedDocuments(client, {
    transactionIds,
    viewer: 'internal',
  })

  const docsByTransactionId = documents.reduce((accumulator, document) => {
    if (!accumulator[document.transaction_id]) {
      accumulator[document.transaction_id] = []
    }

    accumulator[document.transaction_id].push(document)
    return accumulator
  }, {})

  const requirementsByDevelopment = {}
  const uniqueDevelopmentIds = [...new Set(rows.map((row) => row.unit.development_id).filter(Boolean))]
  const transactionRequirementsByTransactionId = await fetchTransactionRequiredDocumentsByTransactionIds(client, transactionIds)

  for (const currentDevelopmentId of uniqueDevelopmentIds) {
    requirementsByDevelopment[currentDevelopmentId] = await fetchDocumentRequirements(client, currentDevelopmentId)
  }

  return rows.sort(byDevelopmentThenUnit).map((row) => {
    const transactionId = row.transaction?.id
    const unitDocuments = transactionId ? docsByTransactionId[transactionId] || [] : []
    const transactionRequirements = transactionId ? transactionRequirementsByTransactionId[transactionId] || [] : []
    const checklistResult = transactionRequirements.length
      ? buildRequiredChecklistFromRows(transactionRequirements, unitDocuments)
      : buildDocumentChecklist(requirementsByDevelopment[row.unit.development_id] || DEFAULT_DOCUMENT_REQUIREMENTS, unitDocuments)

    return {
      unit: row.unit,
      development: row.development,
      buyer: row.buyer,
      transaction: row.transaction,
      stage: row.stage,
      documents: unitDocuments,
      requiredChecklist: checklistResult.checklist,
      checklistSummary: checklistResult.summary,
    }
  })
}

export async function fetchUnitWorkspaceShell(unitId) {
  const normalizedUnitId = String(unitId || '').trim()
  if (!normalizedUnitId) {
    return null
  }

  const timer = createPerfTimer('api.fetchUnitWorkspaceShell', { unitId: normalizedUnitId })
  const cached = readTimedCache(unitWorkspaceShellCache, normalizedUnitId, UNIT_WORKSPACE_SHELL_CACHE_TTL_MS)
  if (cached) {
    timer.mark('cache_hit')
    timer.end({ cached: true })
    return cached
  }

  if (unitWorkspaceShellInFlight.has(normalizedUnitId)) {
    timer.mark('inflight_hit')
    const inFlight = await unitWorkspaceShellInFlight.get(normalizedUnitId)
    timer.end({ cached: false, inFlight: true })
    return inFlight
  }

  const loader = (async () => {
    const client = requireClient()
    let resolvedUnitId = normalizedUnitId

    timer.mark('unit_query_start')
    let unitQuery = await client
      .from('units')
      .select('id, development_id, unit_number, phase, price, status, development:developments(id, name)')
      .eq('id', resolvedUnitId)
      .maybeSingle()
    timer.mark('unit_query_end')

    if (unitQuery.error) {
      throw unitQuery.error
    }

    let unit = unitQuery.data || null
    if (!unit) {
      const transactionByRouteId = await fetchTransactionRowById(client, resolvedUnitId)
      if (transactionByRouteId?.unit_id) {
        resolvedUnitId = transactionByRouteId.unit_id
        timer.mark('unit_query_by_transaction_start')
        unitQuery = await client
          .from('units')
          .select('id, development_id, unit_number, phase, price, status, development:developments(id, name)')
          .eq('id', resolvedUnitId)
          .maybeSingle()
        timer.mark('unit_query_by_transaction_end')

        if (unitQuery.error) {
          throw unitQuery.error
        }
        unit = unitQuery.data || null
      }
    }

    if (!unit) {
      timer.end({ found: false })
      return null
    }

    timer.mark('transaction_query_start')
    const transaction = await fetchActiveTransactionForUnit(client, resolvedUnitId)
    timer.mark('transaction_query_end', { hasTransaction: Boolean(transaction?.id) })

    let buyer = null
    if (transaction?.buyer_id) {
      timer.mark('buyer_query_start')
      const buyerQuery = await client
        .from('buyers')
        .select('id, name, phone, email')
        .eq('id', transaction.buyer_id)
        .maybeSingle()
      timer.mark('buyer_query_end')

      if (buyerQuery.error && !isMissingSchemaError(buyerQuery.error)) {
        throw buyerQuery.error
      }
      buyer = buyerQuery.data || null
    }

    let onboarding = null
    if (transaction?.id) {
      timer.mark('onboarding_query_start')
      const onboardingQuery = await client
        .from('transaction_onboarding')
        .select('id, transaction_id, token, status, purchaser_type, submitted_at, is_active, created_at, updated_at')
        .eq('transaction_id', transaction.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      timer.mark('onboarding_query_end')

      if (
        onboardingQuery.error &&
        !isMissingTableError(onboardingQuery.error, 'transaction_onboarding') &&
        !isMissingColumnError(onboardingQuery.error, 'is_active') &&
        !isMissingSchemaError(onboardingQuery.error)
      ) {
        throw onboardingQuery.error
      }

      onboarding = onboardingQuery.data ? normalizeOnboardingRow(onboardingQuery.data) : null
    }

    const stage = normalizeStage(transaction?.stage, unit.status)
    const mainStage = normalizeMainStage(transaction?.current_main_stage, stage)
    const attorneyStage = resolveAttorneyOperationalStageKey({ transaction })

    const shell = {
      unit,
      transaction,
      buyer,
      documents: [],
      clientPortalLinks: [],
      clientIssues: [],
      alterationRequests: [],
      serviceReviews: [],
      trustInvestmentForm: getDefaultTrustInvestmentForm({
        developmentId: unit.development_id,
        unitId: unit.id,
        transaction,
        buyer,
      }),
      handover: getDefaultHandoverRecord({
        developmentId: unit.development_id,
        unitId: unit.id,
        transaction,
        buyer,
      }),
      occupationalRent: getDefaultOccupationalRentRecord({
        developmentId: unit.development_id,
        unitId: unit.id,
        transaction,
        buyer,
      }),
      transactionSubprocesses: buildDefaultSubprocessState(transaction?.id || null),
      onboarding,
      onboardingFormData: null,
      purchaserType: normalizePurchaserType(transaction?.purchaser_type),
      purchaserTypeLabel: getPurchaserTypeLabel(transaction?.purchaser_type),
      transactionRequiredDocuments: [],
      transactionParticipants: [],
      activeViewerRole: 'developer',
      activeViewerPermissions: getRolePermissions({
        role: 'developer',
        financeManagedBy: transaction?.finance_managed_by,
      }),
      transactionDiscussion: [],
      transactionStatusLink: null,
      transactionEvents: [],
      documentRequests: [],
      documentRequestSummary: summarizeDocumentRequests([]),
      transactionChecklistItems: [],
      checklistSummary: summarizeChecklistItems([], { stageKey: attorneyStage }),
      issueOverrides: [],
      developmentSettings: DEFAULT_DEVELOPMENT_SETTINGS,
      requiredDocumentChecklist: [],
      documentSummary: {
        uploadedCount: 0,
        totalRequired: 0,
        missingCount: 0,
      },
      stage,
      mainStage,
      __isShell: true,
      __loadedAt: new Date().toISOString(),
    }

    writeTimedCache(unitWorkspaceShellCache, normalizedUnitId, shell)
    timer.end({ found: true, hasTransaction: Boolean(transaction?.id) })
    return shell
  })()

  unitWorkspaceShellInFlight.set(normalizedUnitId, loader)
  try {
    return await loader
  } finally {
    unitWorkspaceShellInFlight.delete(normalizedUnitId)
  }
}

export async function prefetchUnitWorkspaceShell(unitId) {
  const normalizedUnitId = String(unitId || '').trim()
  if (!normalizedUnitId) {
    return
  }

  try {
    await fetchUnitWorkspaceShell(normalizedUnitId)
  } catch {
    // Prefetch is best-effort only.
  }
}

export async function fetchUnitDetail(unitId) {
  const timer = createPerfTimer('api.fetchUnitDetail', { unitId: String(unitId || '') })
  const mockDetail = getAttorneyMockTransactionDetailByUnitId(unitId)
  if (mockDetail) {
    timer.end({ mock: true })
    return mockDetail
  }

  const client = requireClient()

  let resolvedUnitId = unitId
  let unit = null

  timer.mark('unit_query_start')
  let unitQuery = await client
    .from('units')
    .select('id, development_id, unit_number, phase, price, status, development:developments(id, name)')
    .eq('id', resolvedUnitId)
    .maybeSingle()
  timer.mark('unit_query_end')

  if (unitQuery.error) {
    throw unitQuery.error
  }

  unit = unitQuery.data || null

  // Some navigation paths can still pass a transaction id into /units/:unitId.
  // Resolve that to its parent unit id so detail pages don't false-fail.
  if (!unit && resolvedUnitId) {
    let transactionByRouteId = null
    try {
      transactionByRouteId = await fetchTransactionRowById(client, resolvedUnitId)
    } catch (routeLookupError) {
      const recoverableRouteLookupError =
        isMissingSchemaError(routeLookupError) ||
        isPermissionDeniedError(routeLookupError) ||
        isMissingColumnError(routeLookupError)
      if (!recoverableRouteLookupError) {
        throw routeLookupError
      }
    }

    if (transactionByRouteId?.unit_id) {
      resolvedUnitId = transactionByRouteId.unit_id
      timer.mark('unit_query_by_transaction_start')
      unitQuery = await client
        .from('units')
        .select('id, development_id, unit_number, phase, price, status, development:developments(id, name)')
        .eq('id', resolvedUnitId)
        .maybeSingle()
      timer.mark('unit_query_by_transaction_end')

      if (unitQuery.error) {
        throw unitQuery.error
      }

      unit = unitQuery.data || null
    }
  }

  if (!unit) {
    timer.end({ found: false })
    return null
  }

  timer.mark('transaction_query_start')
  const transaction = await fetchActiveTransactionForUnit(client, resolvedUnitId)
  timer.mark('transaction_query_end', { hasTransaction: Boolean(transaction?.id) })
  const mainStage = normalizeMainStage(transaction?.current_main_stage, transaction?.stage || unit.status)

  let buyer = null
  let documents = []
  let clientPortalLinks = []
  let clientIssues = []
  let alterationRequests = []
  let serviceReviews = []
  let trustInvestmentForm = getDefaultTrustInvestmentForm({
    developmentId: unit.development_id,
    unitId: unit.id,
    transaction,
    buyer,
  })
  let handover = getDefaultHandoverRecord({
    developmentId: unit.development_id,
    unitId: unit.id,
    transaction,
    buyer,
  })
  let occupationalRent = getDefaultOccupationalRentRecord({
    developmentId: unit.development_id,
    unitId: unit.id,
    transaction,
    buyer,
  })
  let transactionSubprocesses = buildDefaultSubprocessState(transaction?.id || null)
  let onboarding = null
  let transactionRequiredDocuments = []
  let transactionParticipants = []
  let activeViewerRole = 'developer'
  let activeViewerPermissions = getRolePermissions({
    role: 'developer',
    financeManagedBy: transaction?.finance_managed_by,
  })
  let transactionDiscussion = []
  let transactionStatusLink = null
  let transactionEvents = []
  let documentRequests = []
  let transactionChecklistItems = []
  let issueOverrides = []

  if (transaction?.buyer_id) {
    timer.mark('buyer_query_start')
    const { data: buyerData, error: buyerError } = await client
      .from('buyers')
      .select('id, name, phone, email')
      .eq('id', transaction.buyer_id)
      .maybeSingle()
    timer.mark('buyer_query_end')

    if (buyerError) {
      throw buyerError
    }

    buyer = buyerData || null
  }

  if (transaction?.id) {
    timer.mark('documents_query_start')
    documents = await loadSharedDocuments(client, {
      transactionIds: [transaction.id],
      viewer: 'internal',
    })
    timer.mark('documents_query_end')

    timer.mark('portal_links_query_start')
    const { data: portalLinksData, error: portalLinksError } = await client
      .from('client_portal_links')
      .select('id, transaction_id, buyer_id, token, is_active, created_at, updated_at')
      .eq('transaction_id', transaction.id)
      .order('created_at', { ascending: false })
    timer.mark('portal_links_query_end')

    if (portalLinksError) {
      if (!isMissingSchemaError(portalLinksError)) {
        throw portalLinksError
      }
    } else {
      clientPortalLinks = portalLinksData || []
    }

    timer.mark('workflow_query_start')
    transactionSubprocesses = await ensureTransactionSubprocesses(client, transaction.id)
    transactionSubprocesses = await syncTransactionSubprocessOwners(client, transaction, transactionSubprocesses)
    timer.mark('workflow_query_end')

    try {
      const participantsResult = await ensureTransactionParticipants(client, {
        transaction,
        buyer,
      })
      transactionParticipants = participantsResult.participants
      activeViewerRole = participantsResult.viewerRole
      activeViewerPermissions = participantsResult.viewerPermissions
    } catch (participantsError) {
      const recoverableParticipantsError =
        isMissingSchemaError(participantsError) ||
        isMissingColumnError(participantsError) ||
        isPermissionDeniedError(participantsError)
      if (!recoverableParticipantsError) {
        throw participantsError
      }
    }

    try {
      timer.mark('comments_query_start')
      transactionDiscussion = await fetchTransactionDiscussion(transaction.id, {
        unitId: unit.id,
        viewer: 'internal',
      })
      timer.mark('comments_query_end')
    } catch (discussionError) {
      if (!isMissingSchemaError(discussionError)) {
        throw discussionError
      }
    }

    try {
      timer.mark('status_link_query_start')
      transactionStatusLink = await getOrCreateTransactionStatusLink({
        transactionId: transaction.id,
        createdByRole: activeViewerRole,
      })
      timer.mark('status_link_query_end')
    } catch (statusLinkError) {
      const missingStatusSchema =
        isMissingSchemaError(statusLinkError) || /status links are not set up yet/i.test(String(statusLinkError?.message || ''))
      if (!missingStatusSchema) {
        throw statusLinkError
      }
    }

    try {
      timer.mark('events_query_start')
      transactionEvents = await fetchTransactionEvents(transaction.id, { limit: 250 })
      timer.mark('events_query_end')
    } catch (transactionEventsError) {
      if (!isMissingSchemaError(transactionEventsError)) {
        throw transactionEventsError
      }
    }

    try {
      timer.mark('operational_queries_start')
      const [documentRequestsByTransactionId, checklistItemsByTransactionId, issueOverridesByTransactionId] = await Promise.all([
        loadTransactionDocumentRequestsByIds(client, [transaction.id]),
        loadTransactionChecklistItemsByIds(client, [transaction.id]),
        loadTransactionIssueOverridesByIds(client, [transaction.id]),
      ])
      timer.mark('operational_queries_end')
      documentRequests = documentRequestsByTransactionId[transaction.id] || []
      transactionChecklistItems = checklistItemsByTransactionId[transaction.id] || []
      issueOverrides = issueOverridesByTransactionId[transaction.id] || []
    } catch (operationalError) {
      if (!isMissingSchemaError(operationalError)) {
        throw operationalError
      }
    }

    timer.mark('onboarding_record_start')
    onboarding = await getOrCreateTransactionOnboardingRecord(client, {
      transactionId: transaction.id,
      purchaserType: transaction.purchaser_type,
    })
    timer.mark('onboarding_record_end')

    timer.mark('required_documents_start')
    transactionRequiredDocuments = await ensureTransactionRequiredDocuments(client, {
      transactionId: transaction.id,
      purchaserType: transaction.purchaser_type,
      financeType: normalizeFinanceType(transaction.finance_type || 'cash'),
      reservationRequired: Boolean(transaction.reservation_required),
      cashAmount: transaction.cash_amount,
      bondAmount: transaction.bond_amount,
    })
    timer.mark('required_documents_end')

    try {
      timer.mark('checklist_ensure_start')
      await ensureTransactionChecklistItems({
        transactionId: transaction.id,
      })
      const [documentRequestsByTransactionId, checklistItemsByTransactionId, issueOverridesByTransactionId] = await Promise.all([
        loadTransactionDocumentRequestsByIds(client, [transaction.id]),
        loadTransactionChecklistItemsByIds(client, [transaction.id]),
        loadTransactionIssueOverridesByIds(client, [transaction.id]),
      ])
      timer.mark('checklist_ensure_end')
      documentRequests = documentRequestsByTransactionId[transaction.id] || documentRequests
      transactionChecklistItems = checklistItemsByTransactionId[transaction.id] || transactionChecklistItems
      issueOverrides = issueOverridesByTransactionId[transaction.id] || issueOverrides
    } catch (checklistEnsureError) {
      if (!isMissingSchemaError(checklistEnsureError)) {
        throw checklistEnsureError
      }
    }
  }

  timer.mark('settings_query_start')
  const settings = await ensureDevelopmentSettings(client, unit.development_id)
  timer.mark('settings_query_end')

  const clientIssuesQuery = await queryClientIssues(client, { unitId: unit.id })

  if (clientIssuesQuery.error) {
    if (!isMissingSchemaError(clientIssuesQuery.error)) {
      throw clientIssuesQuery.error
    }
  } else {
    clientIssues = await Promise.all(
      (clientIssuesQuery.data || []).map(async (item) => ({
        ...item,
        photo_url: item.photo_path ? await getSignedUrl(item.photo_path) : null,
      })),
    )
  }

    let alterationRequestsQuery = await client
      .from('alteration_requests')
      .select(
        'id, development_id, unit_id, transaction_id, buyer_id, title, category, description, budget_range, preferred_timing, reference_image_path, amount_inc_vat, invoice_path, proof_of_payment_path, status, created_at, updated_at',
      )
    .eq('unit_id', unit.id)
    .order('created_at', { ascending: false })

  if (alterationRequestsQuery.error && isMissingColumnError(alterationRequestsQuery.error, 'transaction_id')) {
    alterationRequestsQuery = await client
      .from('alteration_requests')
      .select(
        'id, development_id, unit_id, buyer_id, title, category, description, budget_range, preferred_timing, amount_inc_vat, invoice_path, proof_of_payment_path, status, created_at',
      )
      .eq('unit_id', unit.id)
      .order('created_at', { ascending: false })
  }

  if (alterationRequestsQuery.error) {
    if (!isMissingSchemaError(alterationRequestsQuery.error)) {
      throw alterationRequestsQuery.error
    }
  } else {
        alterationRequests = await Promise.all(
          (alterationRequestsQuery.data || []).map(async (item) => ({
            ...item,
            reference_image_url: item.reference_image_path ? await getSignedUrl(item.reference_image_path) : null,
            invoice_url: item.invoice_path ? await getSignedUrl(item.invoice_path) : null,
            proof_url: item.proof_of_payment_path ? await getSignedUrl(item.proof_of_payment_path) : null,
          })),
        )
  }

  let serviceReviewsQuery = await client
    .from('service_reviews')
    .select(
      'id, development_id, unit_id, transaction_id, buyer_id, rating, review_text, positives, improvements, allow_marketing_use, created_at, updated_at',
    )
    .eq('unit_id', unit.id)
    .order('created_at', { ascending: false })

  if (serviceReviewsQuery.error && isMissingColumnError(serviceReviewsQuery.error, 'transaction_id')) {
    serviceReviewsQuery = await client
      .from('service_reviews')
      .select('id, development_id, unit_id, buyer_id, rating, review_text, positives, improvements, created_at')
      .eq('unit_id', unit.id)
      .order('created_at', { ascending: false })
  }

  if (serviceReviewsQuery.error) {
    if (!isMissingSchemaError(serviceReviewsQuery.error)) {
      throw serviceReviewsQuery.error
    }
  } else {
    serviceReviews = serviceReviewsQuery.data || []
  }

  trustInvestmentForm = await fetchTrustInvestmentFormForTransaction(client, {
    developmentId: unit.development_id,
    unitId: unit.id,
    transaction,
    buyer,
  })
  handover = await fetchTransactionHandover(client, {
    developmentId: unit.development_id,
    unitId: unit.id,
    transaction,
    buyer,
  })
  occupationalRent = getOccupationalRentRecordFromEvents(transactionEvents, occupationalRent)

  const requirements = await fetchDocumentRequirements(client, unit.development_id)
  const checklistResult = transactionRequiredDocuments.length
    ? buildRequiredChecklistFromRows(transactionRequiredDocuments, documents)
    : buildDocumentChecklist(requirements, documents)
  const attorneyStage = resolveAttorneyOperationalStageKey({ transaction })

  timer.mark('onboarding_form_query_start')
  const onboardingFormData = transaction?.id
    ? await fetchOnboardingFormDataForTransaction(client, transaction.id, transaction?.purchaser_type)
    : null
  timer.mark('onboarding_form_query_end')

  const payload = {
    unit,
    transaction,
    buyer,
    documents,
    clientPortalLinks,
    clientIssues,
    alterationRequests,
    serviceReviews,
    trustInvestmentForm,
    handover,
    occupationalRent,
    transactionSubprocesses,
    onboarding,
    onboardingFormData,
    purchaserType: normalizePurchaserType(transaction?.purchaser_type),
    purchaserTypeLabel: getPurchaserTypeLabel(transaction?.purchaser_type),
    transactionRequiredDocuments,
    transactionParticipants,
    activeViewerRole,
    activeViewerPermissions,
    transactionDiscussion,
    transactionStatusLink,
    transactionEvents,
    documentRequests,
    documentRequestSummary: summarizeDocumentRequests(documentRequests),
    transactionChecklistItems,
    checklistSummary: summarizeChecklistItems(transactionChecklistItems, { stageKey: attorneyStage }),
    issueOverrides,
    developmentSettings: settings,
    requiredDocumentChecklist: checklistResult.checklist,
    documentSummary: checklistResult.summary,
    stage: normalizeStage(transaction?.stage, unit.status),
    mainStage,
  }
  timer.end({
    found: true,
    hasTransaction: Boolean(transaction?.id),
    documents: payload.documents?.length || 0,
    comments: payload.transactionDiscussion?.length || 0,
  })
  return payload
}

export async function saveTransaction({
  unitId,
  transactionId,
  buyerId,
  financeType,
  purchasePrice,
  cashAmount,
  bondAmount,
  depositAmount,
  purchaserType,
  financeManagedBy,
  mainStage,
  stage,
  assignedAgent,
  assignedAgentEmail,
  attorney,
  assignedAttorneyEmail,
  bondOriginator,
  assignedBondOriginatorEmail,
  nextAction,
  actorRole,
}) {
  const client = requireClient()
  const normalizedActorRole = actorRole ? normalizeRoleType(actorRole) : null
  const actorProfile = await resolveActiveProfileContext(client)
  const effectiveActorRole = normalizedActorRole || actorProfile.role || 'developer'
  const effectiveActorUserId = actorProfile.userId || null

  const toComparableText = (value) =>
    String(value || '')
      .trim()
      .toLowerCase()

  const hasAssignmentChanged = (previousName, previousEmail, nextName, nextEmail) =>
    toComparableText(previousName) !== toComparableText(nextName) ||
    toComparableText(previousEmail) !== toComparableText(nextEmail)

  let previousTransaction = null
  if (transactionId) {
    let previousQuery = await client
      .from('transactions')
      .select(
        'id, stage, current_main_stage, finance_type, finance_managed_by, assigned_agent, assigned_agent_email, attorney, assigned_attorney_email, bond_originator, assigned_bond_originator_email',
      )
      .eq('id', transactionId)
      .maybeSingle()

    if (
      previousQuery.error &&
      (isMissingColumnError(previousQuery.error, 'current_main_stage') ||
        isMissingColumnError(previousQuery.error, 'finance_managed_by') ||
        isMissingColumnError(previousQuery.error, 'assigned_agent') ||
        isMissingColumnError(previousQuery.error, 'assigned_agent_email') ||
        isMissingColumnError(previousQuery.error, 'assigned_attorney_email') ||
        isMissingColumnError(previousQuery.error, 'assigned_bond_originator_email'))
    ) {
      previousQuery = await client
        .from('transactions')
        .select('id, stage, finance_type, attorney, bond_originator')
        .eq('id', transactionId)
        .maybeSingle()
    }

    if (previousQuery.error && !isMissingSchemaError(previousQuery.error)) {
      throw previousQuery.error
    }

    previousTransaction = previousQuery.data || null
  }

  if (normalizedActorRole) {
    const actorPermissions = getRolePermissions({
      role: normalizedActorRole,
      financeManagedBy: financeManagedBy || 'bond_originator',
    })

    if (!actorPermissions.canEditCoreTransaction) {
      throw new Error('Your role does not have permission to edit core transaction details.')
    }
  }

  const resolvedDetailedStage = stage || getDetailedStageFromMainStage(mainStage, previousTransaction?.stage || null)
  const resolvedMainStage = normalizeMainStage(mainStage || previousTransaction?.current_main_stage, resolvedDetailedStage)
  const normalizedFinanceType = normalizeFinanceType(financeType || previousTransaction?.finance_type || 'cash')
  const hasPurchasePrice = purchasePrice !== undefined
  const hasCashAmount = cashAmount !== undefined
  const hasBondAmount = bondAmount !== undefined
  const hasDepositAmount = depositAmount !== undefined
  const normalizedPurchasePrice = hasPurchasePrice ? normalizeOptionalNumber(purchasePrice) : null
  const normalizedCashAmount = hasCashAmount ? normalizeOptionalNumber(cashAmount) : null
  const normalizedBondAmount = hasBondAmount ? normalizeOptionalNumber(bondAmount) : null
  const normalizedDepositAmount = hasDepositAmount ? normalizeOptionalNumber(depositAmount) : null
  const previousStage = normalizeStage(previousTransaction?.stage, resolvedDetailedStage)
  const previousMainStage = normalizeMainStage(previousTransaction?.current_main_stage, previousStage)
  const normalizedNextStage = normalizeStage(resolvedDetailedStage, resolvedDetailedStage)

  if (transactionId && (previousStage !== normalizedNextStage || previousMainStage !== resolvedMainStage)) {
    await assertReservationDepositGateForTransition(client, {
      transactionId,
      previousMainStage,
      nextMainStage: resolvedMainStage,
      nextDetailedStage: normalizedNextStage,
    })
  }

  const payload = {
    unit_id: unitId,
    buyer_id: buyerId || null,
    finance_type: normalizedFinanceType,
    purchaser_type: normalizePurchaserType(purchaserType),
    finance_managed_by: normalizeFinanceManagedBy(financeManagedBy),
    stage: resolvedDetailedStage,
    current_main_stage: resolvedMainStage,
    assigned_agent: normalizeNullableText(assignedAgent),
    assigned_agent_email: normalizeNullableText(assignedAgentEmail)?.toLowerCase() || null,
    attorney: attorney || null,
    assigned_attorney_email: normalizeNullableText(assignedAttorneyEmail)?.toLowerCase() || null,
    bond_originator: bondOriginator || null,
    assigned_bond_originator_email: normalizeNullableText(assignedBondOriginatorEmail)?.toLowerCase() || null,
    next_action: nextAction || null,
    comment: nextAction || null,
    is_active: resolvedMainStage !== 'AVAIL',
    updated_at: new Date().toISOString(),
  }

  if (hasPurchasePrice) {
    payload.sales_price = normalizedPurchasePrice
    payload.purchase_price = normalizedPurchasePrice
  }

  if (hasCashAmount) {
    payload.cash_amount = normalizedCashAmount
  }

  if (hasBondAmount) {
    payload.bond_amount = normalizedBondAmount
  }

  if (hasDepositAmount) {
    payload.deposit_amount = normalizedDepositAmount
  }

  let result

  if (transactionId) {
    result = await client
      .from('transactions')
      .update(payload)
      .eq('id', transactionId)
      .select(
        'id, unit_id, buyer_id, finance_type, purchaser_type, finance_managed_by, assigned_agent, assigned_agent_email, stage, attorney, assigned_attorney_email, bond_originator, assigned_bond_originator_email, next_action, updated_at, created_at',
      )
      .single()
  } else {
    result = await client
      .from('transactions')
      .insert(payload)
      .select(
        'id, unit_id, buyer_id, finance_type, purchaser_type, finance_managed_by, assigned_agent, assigned_agent_email, stage, attorney, assigned_attorney_email, bond_originator, assigned_bond_originator_email, next_action, updated_at, created_at',
      )
      .single()
  }

  if (result.error) {
    if (
      isMissingColumnError(result.error, 'current_main_stage') ||
      isMissingColumnError(result.error, 'purchaser_type') ||
      isMissingColumnError(result.error, 'sales_price') ||
      isMissingColumnError(result.error, 'purchase_price') ||
      isMissingColumnError(result.error, 'cash_amount') ||
      isMissingColumnError(result.error, 'bond_amount') ||
      isMissingColumnError(result.error, 'deposit_amount')
    ) {
      const fallbackPayload = { ...payload }
      delete fallbackPayload.current_main_stage
      delete fallbackPayload.comment
      delete fallbackPayload.purchaser_type
      delete fallbackPayload.sales_price
      delete fallbackPayload.purchase_price
      delete fallbackPayload.cash_amount
      delete fallbackPayload.bond_amount
      delete fallbackPayload.deposit_amount

      if (transactionId) {
        result = await client
          .from('transactions')
          .update(fallbackPayload)
          .eq('id', transactionId)
          .select(
            'id, unit_id, buyer_id, finance_type, purchaser_type, finance_managed_by, assigned_agent, assigned_agent_email, stage, attorney, assigned_attorney_email, bond_originator, assigned_bond_originator_email, next_action, updated_at, created_at',
          )
          .single()
      } else {
        result = await client
          .from('transactions')
          .insert(fallbackPayload)
          .select(
            'id, unit_id, buyer_id, finance_type, purchaser_type, finance_managed_by, assigned_agent, assigned_agent_email, stage, attorney, assigned_attorney_email, bond_originator, assigned_bond_originator_email, next_action, updated_at, created_at',
          )
          .single()
      }
    }

    if (result.error && isMissingColumnError(result.error, 'comment')) {
      const fallbackPayload = { ...payload }
      delete fallbackPayload.comment

      if (transactionId) {
        result = await client
          .from('transactions')
          .update(fallbackPayload)
          .eq('id', transactionId)
          .select(
            'id, unit_id, buyer_id, finance_type, purchaser_type, finance_managed_by, assigned_agent, assigned_agent_email, stage, attorney, assigned_attorney_email, bond_originator, assigned_bond_originator_email, next_action, updated_at, created_at',
          )
          .single()
      } else {
        result = await client
          .from('transactions')
          .insert(fallbackPayload)
          .select(
            'id, unit_id, buyer_id, finance_type, purchaser_type, finance_managed_by, assigned_agent, assigned_agent_email, stage, attorney, assigned_attorney_email, bond_originator, assigned_bond_originator_email, next_action, updated_at, created_at',
          )
          .single()
      }
    }

    if (result.error && isMissingColumnError(result.error, 'is_active')) {
      const fallbackPayload = { ...payload }
      delete fallbackPayload.is_active

      if (transactionId) {
        result = await client
          .from('transactions')
          .update(fallbackPayload)
          .eq('id', transactionId)
          .select(
            'id, unit_id, buyer_id, finance_type, purchaser_type, finance_managed_by, assigned_agent, assigned_agent_email, stage, attorney, assigned_attorney_email, bond_originator, assigned_bond_originator_email, next_action, updated_at, created_at',
          )
          .single()
      } else {
        result = await client
          .from('transactions')
          .insert(fallbackPayload)
          .select(
            'id, unit_id, buyer_id, finance_type, purchaser_type, finance_managed_by, assigned_agent, assigned_agent_email, stage, attorney, assigned_attorney_email, bond_originator, assigned_bond_originator_email, next_action, updated_at, created_at',
          )
          .single()
      }
    }

    if (
      result.error &&
      (isMissingColumnError(result.error, 'finance_managed_by') ||
        isMissingColumnError(result.error, 'assigned_agent') ||
        isMissingColumnError(result.error, 'assigned_agent_email') ||
        isMissingColumnError(result.error, 'assigned_attorney_email') ||
        isMissingColumnError(result.error, 'assigned_bond_originator_email'))
    ) {
      const fallbackPayload = { ...payload }
      delete fallbackPayload.finance_managed_by
      delete fallbackPayload.assigned_agent
      delete fallbackPayload.assigned_agent_email
      delete fallbackPayload.assigned_attorney_email
      delete fallbackPayload.assigned_bond_originator_email
      delete fallbackPayload.comment
      delete fallbackPayload.current_main_stage
      delete fallbackPayload.purchaser_type

      if (transactionId) {
        result = await client
          .from('transactions')
          .update(fallbackPayload)
          .eq('id', transactionId)
          .select('id, unit_id, buyer_id, finance_type, stage, attorney, bond_originator, next_action, updated_at, created_at')
          .single()
      } else {
        result = await client
          .from('transactions')
          .insert(fallbackPayload)
          .select('id, unit_id, buyer_id, finance_type, stage, attorney, bond_originator, next_action, updated_at, created_at')
          .single()
      }
    }

    if (result.error && isFinanceTypeConstraintError(result.error) && normalizedFinanceType === 'combination') {
      const legacyPayload = {
        ...payload,
        finance_type: 'hybrid',
      }

      if (transactionId) {
        result = await client
          .from('transactions')
          .update(legacyPayload)
          .eq('id', transactionId)
          .select(
            'id, unit_id, buyer_id, finance_type, purchaser_type, finance_managed_by, assigned_agent, assigned_agent_email, stage, attorney, assigned_attorney_email, bond_originator, assigned_bond_originator_email, next_action, updated_at, created_at',
          )
          .single()
      } else {
        result = await client
          .from('transactions')
          .insert(legacyPayload)
          .select(
            'id, unit_id, buyer_id, finance_type, purchaser_type, finance_managed_by, assigned_agent, assigned_agent_email, stage, attorney, assigned_attorney_email, bond_originator, assigned_bond_originator_email, next_action, updated_at, created_at',
          )
          .single()
      }
    }
  }

  if (result.error) {
    throw result.error
  }

  const { error: unitError } = await client.from('units').update({ status: resolvedDetailedStage }).eq('id', unitId)

  if (unitError) {
    throw unitError
  }

  try {
    const subprocesses = await ensureTransactionSubprocesses(client, result.data.id)
    await syncTransactionSubprocessOwners(client, result.data, subprocesses)
  } catch (error) {
    if (!isMissingSchemaError(error)) {
      throw error
    }
  }

  try {
    let buyer = null
    if (result.data.buyer_id) {
      const buyerResult = await client.from('buyers').select('id, name, email').eq('id', result.data.buyer_id).maybeSingle()
      if (buyerResult.error && !isMissingSchemaError(buyerResult.error)) {
        throw buyerResult.error
      }
      buyer = buyerResult.data || null
    }

    const participantResult = await ensureTransactionParticipants(client, {
      transaction: result.data,
      buyer,
    })

    const participants = participantResult?.participants || []
    const participantByRole = participants.reduce((accumulator, participant) => {
      accumulator[participant.roleType] = participant
      return accumulator
    }, {})

    const assignmentChanges = [
      {
        roleType: 'agent',
        roleLabel: 'Agent',
        previousName: previousTransaction?.assigned_agent || '',
        previousEmail: previousTransaction?.assigned_agent_email || '',
        nextName: payload.assigned_agent || '',
        nextEmail: payload.assigned_agent_email || '',
      },
      {
        roleType: 'attorney',
        roleLabel: 'Attorney',
        previousName: previousTransaction?.attorney || '',
        previousEmail: previousTransaction?.assigned_attorney_email || '',
        nextName: payload.attorney || '',
        nextEmail: payload.assigned_attorney_email || '',
      },
      {
        roleType: 'bond_originator',
        roleLabel: 'Bond Originator',
        previousName: previousTransaction?.bond_originator || '',
        previousEmail: previousTransaction?.assigned_bond_originator_email || '',
        nextName: payload.bond_originator || '',
        nextEmail: payload.assigned_bond_originator_email || '',
      },
    ]

    for (const assignment of assignmentChanges) {
      if (
        !hasAssignmentChanged(
          assignment.previousName,
          assignment.previousEmail,
          assignment.nextName,
          assignment.nextEmail,
        )
      ) {
        continue
      }

      const target = participantByRole[assignment.roleType]
      if (!target?.userId || target.userId === effectiveActorUserId) {
        continue
      }

      await createTransactionNotificationIfPossible(client, {
        transactionId: result.data.id,
        userId: target.userId,
        roleType: assignment.roleType,
        notificationType: 'participant_assigned',
        title: `${assignment.roleLabel} assignment updated`,
        message: `You were assigned on Unit ${result.data.unit_id || '-'}.`,
        eventType: 'ParticipantAssigned',
        eventData: {
          trigger: 'save_transaction',
          assignedRole: assignment.roleType,
          actorRole: effectiveActorRole,
        },
        dedupeKey: `assign-update:${result.data.id}:${assignment.roleType}:${target.userId}:${toComparableText(assignment.nextEmail || assignment.nextName)}`,
      })
    }

    await getOrCreateTransactionOnboardingRecord(client, {
      transactionId: result.data.id,
      purchaserType: result.data.purchaser_type || purchaserType,
    })
    await ensureTransactionRequiredDocuments(client, {
      transactionId: result.data.id,
      purchaserType: result.data.purchaser_type || purchaserType,
      financeType: payload.finance_type,
      reservationRequired: false,
      cashAmount: null,
      bondAmount: null,
    })
  } catch (error) {
    if (!isMissingSchemaError(error)) {
      throw error
    }
  }

  await logTransactionEventIfPossible(client, {
    transactionId: result.data.id,
    eventType: 'TransactionUpdated',
    createdBy: effectiveActorUserId,
    createdByRole: effectiveActorRole,
    eventData: {
      stage: resolvedDetailedStage,
      mainStage: resolvedMainStage,
      financeType: payload.finance_type,
      financeManagedBy: payload.finance_managed_by,
      purchaserType: payload.purchaser_type,
      nextAction: payload.next_action || null,
    },
  })

  const stageChanged = previousStage !== normalizedNextStage
  const mainStageChanged = previousMainStage !== resolvedMainStage

  if (stageChanged || mainStageChanged) {
    await logTransactionEventIfPossible(client, {
      transactionId: result.data.id,
      eventType: 'TransactionStageChanged',
      createdBy: effectiveActorUserId,
      createdByRole: effectiveActorRole,
      eventData: {
        fromStage: previousStage,
        toStage: normalizedNextStage,
        fromMainStage: previousMainStage,
        toMainStage: resolvedMainStage,
        source: 'save_transaction',
      },
    })
  }

  if (mainStageChanged && resolvedMainStage === 'FIN') {
    await notifyRolesForTransaction(client, {
      transactionId: result.data.id,
      roleTypes: ['bond_originator'],
      title: 'Finance lane active',
      message: 'This transaction has moved into finance processing.',
      notificationType: 'lane_handoff',
      eventType: 'TransactionStageChanged',
      eventData: {
        fromMainStage: previousMainStage,
        toMainStage: resolvedMainStage,
      },
      dedupePrefix: `handoff-finance-stage:${resolvedMainStage}`,
      excludeUserId: effectiveActorUserId,
    })
  }

  if (mainStageChanged && resolvedMainStage === 'ATTY') {
    await notifyRolesForTransaction(client, {
      transactionId: result.data.id,
      roleTypes: ['attorney'],
      title: 'Attorney lane active',
      message: 'This transaction is now ready for transfer preparation.',
      notificationType: 'lane_handoff',
      eventType: 'TransactionStageChanged',
      eventData: {
        fromMainStage: previousMainStage,
        toMainStage: resolvedMainStage,
      },
      dedupePrefix: `handoff-attorney-stage:${resolvedMainStage}`,
      excludeUserId: effectiveActorUserId,
    })
  }

  if ((stageChanged || mainStageChanged) && normalizedNextStage === 'Registered') {
    await notifyRolesForTransaction(client, {
      transactionId: result.data.id,
      roleTypes: ['developer', 'agent', 'attorney', 'bond_originator', 'client'],
      title: 'Transaction registered',
      message: 'Registration is complete for this transaction.',
      notificationType: 'registration_completed',
      eventType: 'TransactionStageChanged',
      eventData: {
        stage: 'Registered',
      },
      dedupePrefix: 'registration-complete',
      excludeUserId: effectiveActorUserId,
    })
  }

  await runDocumentAutomationIfPossible(client, {
    transactionId: result.data.id,
    documentId: null,
    documentName: null,
    category: null,
    actorRole: effectiveActorRole,
    actorUserId: effectiveActorUserId,
    source: 'transaction_updated',
  })

  return result.data
}

export async function updateTransactionMainStage({
  transactionId,
  unitId = null,
  mainStage,
  note = '',
  actorRole,
}) {
  const client = requireClient()

  if (!transactionId) {
    throw new Error('Transaction is required.')
  }

  const normalizedActorRole = normalizeRoleType(actorRole || 'developer')
  if (!['developer', 'internal_admin', 'agent', 'attorney'].includes(normalizedActorRole)) {
    throw new Error('Your role does not have permission to update the main transaction stage.')
  }

  const transactionQuery = await client
    .from('transactions')
    .select('id, unit_id, stage, current_main_stage')
    .eq('id', transactionId)
    .maybeSingle()

  if (transactionQuery.error) {
    if (!isMissingColumnError(transactionQuery.error, 'current_main_stage')) {
      throw transactionQuery.error
    }
    const fallbackQuery = await client.from('transactions').select('id, unit_id, stage').eq('id', transactionId).maybeSingle()
    if (fallbackQuery.error) {
      throw fallbackQuery.error
    }
    transactionQuery.data = fallbackQuery.data
  }

  const transaction = transactionQuery.data
  if (!transaction) {
    throw new Error('Transaction was not found.')
  }

  const previousStage = normalizeStage(transaction.stage, 'Available')
  const previousMainStage = normalizeMainStage(transaction.current_main_stage, previousStage)
  const resolvedMainStage = normalizeMainStage(mainStage, previousStage)
  const resolvedDetailedStage = getDetailedStageFromMainStage(resolvedMainStage, previousStage)
  const nowIso = new Date().toISOString()

  await assertReservationDepositGateForTransition(client, {
    transactionId,
    previousMainStage,
    nextMainStage: resolvedMainStage,
    nextDetailedStage: resolvedDetailedStage,
  })

  const previousMainStageIndex = getMainStageIndex(previousMainStage)
  const nextMainStageIndex = getMainStageIndex(resolvedMainStage)
  const financeStageIndex = getMainStageIndex('FIN')
  const transferStageIndex = getMainStageIndex('ATTY')
  const movingIntoOrPastFinance =
    previousMainStageIndex < financeStageIndex && nextMainStageIndex >= financeStageIndex
  const movingIntoOrPastTransfer =
    previousMainStageIndex < transferStageIndex && nextMainStageIndex >= transferStageIndex

  if (movingIntoOrPastFinance) {
    await assertSalesWorkflowReadyForFinanceTransition(client, transactionId)
  }

  if (movingIntoOrPastTransfer) {
    await assertTransferWorkflowReadyForTransition(client, transactionId)
  }

  const payload = {
    stage: resolvedDetailedStage,
    current_main_stage: resolvedMainStage,
    is_active: resolvedMainStage !== 'AVAIL',
    stage_date: nowIso,
    updated_at: nowIso,
  }

  let updateResult = await client.from('transactions').update(payload).eq('id', transactionId)

  if (
    updateResult.error &&
    (isMissingColumnError(updateResult.error, 'current_main_stage') ||
      isMissingColumnError(updateResult.error, 'stage_date') ||
      isMissingColumnError(updateResult.error, 'is_active'))
  ) {
    const fallbackPayload = { ...payload }
    if (isMissingColumnError(updateResult.error, 'current_main_stage')) {
      delete fallbackPayload.current_main_stage
    }
    if (isMissingColumnError(updateResult.error, 'stage_date')) {
      delete fallbackPayload.stage_date
    }
    if (isMissingColumnError(updateResult.error, 'is_active')) {
      delete fallbackPayload.is_active
    }
    updateResult = await client.from('transactions').update(fallbackPayload).eq('id', transactionId)
  }

  if (updateResult.error) {
    throw updateResult.error
  }

  const resolvedUnitId = unitId || transaction.unit_id || null
  if (resolvedUnitId) {
    const unitUpdate = await client.from('units').update({ status: resolvedDetailedStage }).eq('id', resolvedUnitId)
    if (unitUpdate.error) {
      throw unitUpdate.error
    }
  }

  await logTransactionEventIfPossible(client, {
    transactionId,
    eventType: 'TransactionStageChanged',
    createdByRole: normalizedActorRole,
    eventData: {
      fromStage: previousStage,
      toStage: resolvedDetailedStage,
      fromMainStage: previousMainStage,
      toMainStage: resolvedMainStage,
      source: 'manual_stage_update',
      note: normalizeNullableText(note),
    },
  })

  return {
    previousStage,
    previousMainStage,
    nextStage: resolvedDetailedStage,
    nextMainStage: resolvedMainStage,
  }
}

function getManualOnboardingLifecycleStatus(status) {
  return ['Submitted', 'Reviewed', 'Approved'].includes(status)
    ? 'client_onboarding_complete'
    : 'awaiting_client_onboarding'
}

export async function saveTransactionClientInformation({
  transactionId,
  buyerId,
  buyerName,
  buyerFirstName,
  buyerLastName,
  buyerEmail,
  buyerPhone,
  nextAction,
  identityNumber,
  taxNumber,
  companyName,
  companyRegistrationNumber,
  financeType,
  purchasePrice,
  cashAmount,
  bondAmount,
  depositAmount,
  purchaserType,
  onboardingStatus,
  onboardingMode,
  manualSectionCompletion,
  actorRole,
}) {
  if (!transactionId) {
    throw new Error('Transaction is required.')
  }

  const client = requireClient()
  const normalizedActorRole = actorRole ? normalizeRoleType(actorRole) : null
  const actorProfile = await resolveActiveProfileContext(client)
  const effectiveActorRole = normalizedActorRole || actorProfile.role || 'developer'
  const effectiveActorUserId = actorProfile.userId || null

  if (normalizedActorRole) {
    const actorPermissions = getRolePermissions({
      role: normalizedActorRole,
      financeManagedBy: 'bond_originator',
    })

    if (!actorPermissions.canEditCoreTransaction) {
      throw new Error('Your role does not have permission to edit client information.')
    }
  }

  let transactionQuery = await client
    .from('transactions')
    .select(
      'id, buyer_id, purchaser_type, finance_type, sales_price, purchase_price, cash_amount, bond_amount, deposit_amount, reservation_required, stage, current_main_stage, finance_managed_by, assigned_agent, assigned_agent_email, attorney, assigned_attorney_email, bond_originator, assigned_bond_originator_email, onboarding_completed_at, external_onboarding_submitted_at',
    )
    .eq('id', transactionId)
    .maybeSingle()

  if (
    transactionQuery.error &&
    (isMissingColumnError(transactionQuery.error, 'finance_managed_by') ||
      isMissingColumnError(transactionQuery.error, 'assigned_agent') ||
      isMissingColumnError(transactionQuery.error, 'assigned_agent_email') ||
      isMissingColumnError(transactionQuery.error, 'assigned_attorney_email') ||
      isMissingColumnError(transactionQuery.error, 'assigned_bond_originator_email') ||
      isMissingColumnError(transactionQuery.error, 'finance_type') ||
      isMissingColumnError(transactionQuery.error, 'sales_price') ||
      isMissingColumnError(transactionQuery.error, 'purchase_price') ||
      isMissingColumnError(transactionQuery.error, 'cash_amount') ||
      isMissingColumnError(transactionQuery.error, 'bond_amount') ||
      isMissingColumnError(transactionQuery.error, 'deposit_amount') ||
      isMissingColumnError(transactionQuery.error, 'reservation_required') ||
      isMissingColumnError(transactionQuery.error, 'stage') ||
      isMissingColumnError(transactionQuery.error, 'current_main_stage') ||
      isMissingColumnError(transactionQuery.error, 'onboarding_completed_at') ||
      isMissingColumnError(transactionQuery.error, 'external_onboarding_submitted_at'))
  ) {
    transactionQuery = await client
      .from('transactions')
      .select('id, buyer_id, purchaser_type, finance_type, sales_price, purchase_price, cash_amount, bond_amount, deposit_amount, stage, current_main_stage, attorney, bond_originator')
      .eq('id', transactionId)
      .maybeSingle()
  }

  if (transactionQuery.error) {
    throw transactionQuery.error
  }

  if (!transactionQuery.data) {
    throw new Error('Transaction not found.')
  }

  const transaction = transactionQuery.data
  const normalizedPurchaserType = normalizePurchaserType(purchaserType || transaction.purchaser_type || 'individual')
  const normalizedOnboardingStatus = ONBOARDING_STATUSES.includes(onboardingStatus) ? onboardingStatus : 'Not Started'
  const normalizedOnboardingMode = String(onboardingMode || '').trim().toLowerCase() === 'manual' ? 'manual' : 'client_portal'
  const normalizedManualSectionCompletion = normalizeManualSectionCompletion(manualSectionCompletion)
  const lifecycleStatus = getManualOnboardingLifecycleStatus(normalizedOnboardingStatus)
  const now = new Date().toISOString()

  let buyer = null
  let effectiveBuyerId = buyerId || transaction.buyer_id || null

  if (effectiveBuyerId) {
    const buyerQuery = await client.from('buyers').select('id, name, email, phone').eq('id', effectiveBuyerId).maybeSingle()
    if (buyerQuery.error) {
      throw buyerQuery.error
    }
    buyer = buyerQuery.data || null
  }

  const normalizedBuyerFirstName = normalizeNullableText(buyerFirstName)
  const normalizedBuyerLastName = normalizeNullableText(buyerLastName)
  const derivedBuyerNameFromParts = [normalizedBuyerFirstName, normalizedBuyerLastName].filter(Boolean).join(' ')
  const normalizedBuyerName = normalizeNullableText(buyerName || derivedBuyerNameFromParts)
  const normalizedBuyerEmail = normalizeNullableText(buyerEmail)?.toLowerCase() || null
  const normalizedBuyerPhone = normalizeNullableText(buyerPhone)
  const normalizedNextAction = normalizeNullableText(nextAction)
  const normalizedIdentityNumber = normalizeNullableText(identityNumber)
  const normalizedTaxNumber = normalizeNullableText(taxNumber)
  const normalizedCompanyName = normalizeNullableText(companyName)
  const normalizedCompanyRegistrationNumber = normalizeNullableText(companyRegistrationNumber)
  const hasFinanceType = financeType !== undefined
  const hasPurchasePrice = purchasePrice !== undefined
  const hasCashAmount = cashAmount !== undefined
  const hasBondAmount = bondAmount !== undefined
  const hasDepositAmount = depositAmount !== undefined
  const normalizedFinanceType = normalizeFinanceType(financeType || transaction.finance_type || 'cash')
  const normalizedPurchasePrice = hasPurchasePrice
    ? normalizeOptionalNumber(purchasePrice)
    : normalizeOptionalNumber(transaction.purchase_price ?? transaction.sales_price)
  const normalizedCashAmount = hasCashAmount
    ? normalizeOptionalNumber(cashAmount)
    : normalizeOptionalNumber(transaction.cash_amount)
  const normalizedBondAmount = hasBondAmount
    ? normalizeOptionalNumber(bondAmount)
    : normalizeOptionalNumber(transaction.bond_amount)
  const normalizedDepositAmount = hasDepositAmount
    ? normalizeOptionalNumber(depositAmount)
    : normalizeOptionalNumber(transaction.deposit_amount)

  if (!effectiveBuyerId && (normalizedBuyerName || normalizedBuyerEmail || normalizedBuyerPhone)) {
    const nextBuyer = await findOrCreateBuyer(client, {
      name: normalizedBuyerName || normalizedBuyerEmail || 'Client / Buyer',
      email: normalizedBuyerEmail,
      phone: normalizedBuyerPhone,
    })
    effectiveBuyerId = nextBuyer.id
    buyer = nextBuyer
  } else if (effectiveBuyerId) {
    const buyerUpdatePayload = {
      name: normalizedBuyerName || buyer?.name || 'Client / Buyer',
      email: normalizedBuyerEmail,
      phone: normalizedBuyerPhone,
    }

    const buyerUpdate = await client
      .from('buyers')
      .update(buyerUpdatePayload)
      .eq('id', effectiveBuyerId)
      .select('id, name, email, phone')
      .single()

    if (buyerUpdate.error) {
      throw buyerUpdate.error
    }

    buyer = buyerUpdate.data
  }

  const onboardingRecord = await getOrCreateTransactionOnboardingRecord(client, {
    transactionId,
    purchaserType: normalizedPurchaserType,
  })

  if (onboardingRecord?.id) {
    const submittedAt =
      normalizedOnboardingStatus === 'Not Started' || normalizedOnboardingStatus === 'In Progress'
        ? null
        : onboardingRecord.submittedAt || now

    const onboardingUpdate = await client
      .from('transaction_onboarding')
      .update({
        status: normalizedOnboardingStatus,
        purchaser_type: normalizedPurchaserType,
        submitted_at: submittedAt,
        updated_at: now,
      })
      .eq('id', onboardingRecord.id)

    if (onboardingUpdate.error) {
      throw onboardingUpdate.error
    }
  }

  const transactionPayload = {
    buyer_id: effectiveBuyerId,
    purchaser_type: normalizedPurchaserType,
    next_action: normalizedNextAction,
    comment: normalizedNextAction,
    is_active: true,
    onboarding_status: lifecycleStatus,
    onboarding_completed_at:
      lifecycleStatus === 'client_onboarding_complete' ? transaction.onboarding_completed_at || now : null,
    external_onboarding_submitted_at:
      lifecycleStatus === 'client_onboarding_complete' ? transaction.external_onboarding_submitted_at || now : null,
    updated_at: now,
  }

  const hasTransactionStage = Object.prototype.hasOwnProperty.call(transaction, 'stage') && transaction.stage !== undefined
  const currentTransactionStage = hasTransactionStage ? normalizeStage(transaction.stage, 'Available') : null
  // Self-heal historical corruption where finance edits previously reset stage to Available.
  if (currentTransactionStage === 'Available') {
    transactionPayload.stage = 'Reserved'
    transactionPayload.current_main_stage = 'DEP'
  }

  if (hasFinanceType) {
    transactionPayload.finance_type = normalizedFinanceType
  }

  if (hasPurchasePrice) {
    transactionPayload.sales_price = normalizedPurchasePrice
    transactionPayload.purchase_price = normalizedPurchasePrice
  }

  if (hasCashAmount) {
    transactionPayload.cash_amount = normalizedCashAmount
  }

  if (hasBondAmount) {
    transactionPayload.bond_amount = normalizedBondAmount
  }

  if (hasDepositAmount) {
    transactionPayload.deposit_amount = normalizedDepositAmount
  }

  let transactionUpdate = await client.from('transactions').update(transactionPayload).eq('id', transactionId)

  if (transactionUpdate.error) {
    const fallbackColumns = [
      'purchaser_type',
      'finance_type',
      'sales_price',
      'purchase_price',
      'cash_amount',
      'bond_amount',
      'deposit_amount',
      'stage',
      'current_main_stage',
      'next_action',
      'comment',
      'is_active',
      'onboarding_status',
      'onboarding_completed_at',
      'external_onboarding_submitted_at',
    ]
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
      const afterKeys = Object.keys(fallbackPayload).length
      if (afterKeys === beforeKeys) {
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

  if (transactionUpdate.error && isFinanceTypeConstraintError(transactionUpdate.error) && transactionPayload.finance_type === 'combination') {
    const legacyPayload = {
      ...transactionPayload,
      finance_type: 'hybrid',
    }
    transactionUpdate = await client.from('transactions').update(legacyPayload).eq('id', transactionId)
  }

  if (transactionUpdate.error) {
    throw transactionUpdate.error
  }

  let latestOnboardingFormData = {}

  try {
    const onboardingFormDataQuery = await client
      .from('onboarding_form_data')
      .select('id, form_data, purchaser_type')
      .eq('transaction_id', transactionId)
      .maybeSingle()

    if (onboardingFormDataQuery.error) {
      if (!isMissingTableError(onboardingFormDataQuery.error, 'onboarding_form_data')) {
        throw onboardingFormDataQuery.error
      }
    } else {
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

      applyFormDataValue('first_name', normalizedBuyerFirstName)
      applyFormDataValue('last_name', normalizedBuyerLastName)
      applyFormDataValue('full_name', normalizedBuyerName || buyer?.name || '')
      applyFormDataValue('email', normalizedBuyerEmail)
      applyFormDataValue('phone', normalizedBuyerPhone)
      applyFormDataValue('identity_number', normalizedIdentityNumber)
      applyFormDataValue('tax_number', normalizedTaxNumber)
      applyFormDataValue('company_name', normalizedCompanyName)
      applyFormDataValue('company_registration_number', normalizedCompanyRegistrationNumber)
      applyFormDataValue('purchase_finance_type', normalizedFinanceType)
      applyFormDataValue('purchase_price', normalizedPurchasePrice)
      applyFormDataValue('cash_amount', normalizedCashAmount)
      applyFormDataValue('bond_amount', normalizedBondAmount)
      applyFormDataValue('deposit_amount', normalizedDepositAmount)
      existingFormData.__bridge_onboarding_mode = normalizedOnboardingMode
      existingFormData.__bridge_manual_section_completion = normalizedManualSectionCompletion
      latestOnboardingFormData = { ...existingFormData }

      const onboardingFormDataUpsert = await client.from('onboarding_form_data').upsert(
        {
          transaction_id: transactionId,
          purchaser_type: normalizedPurchaserType,
          form_data: existingFormData,
          updated_at: now,
        },
        { onConflict: 'transaction_id' },
      )

      if (
        onboardingFormDataUpsert.error &&
        !isMissingTableError(onboardingFormDataUpsert.error, 'onboarding_form_data')
      ) {
        throw onboardingFormDataUpsert.error
      }
    }
  } catch (error) {
    if (!isMissingSchemaError(error)) {
      throw error
    }
  }

  try {
    await ensureTransactionRequiredDocuments(client, {
      transactionId,
      purchaserType: normalizedPurchaserType,
      financeType: normalizedFinanceType,
      reservationRequired: Boolean(transaction.reservation_required),
      cashAmount: normalizedCashAmount,
      bondAmount: normalizedBondAmount,
      formData: latestOnboardingFormData,
    })
  } catch (error) {
    if (!isMissingSchemaError(error)) {
      throw error
    }
  }

  try {
    await ensureTransactionParticipants(client, {
      transaction: {
        ...transaction,
        id: transactionId,
        buyer_id: effectiveBuyerId,
        purchaser_type: normalizedPurchaserType,
      },
      buyer,
    })
  } catch (error) {
    if (!isMissingSchemaError(error)) {
      throw error
    }
  }

  await logTransactionEventIfPossible(client, {
    transactionId,
    eventType: 'TransactionUpdated',
    createdBy: effectiveActorUserId,
    createdByRole: effectiveActorRole,
    eventData: {
      source: 'save_transaction_client_information',
      onboardingStatus: normalizedOnboardingStatus,
      onboardingLifecycleStatus: lifecycleStatus,
      purchaserType: normalizedPurchaserType,
      onboardingMode: normalizedOnboardingMode,
      manualSectionCompletion: normalizedManualSectionCompletion,
      buyerId: effectiveBuyerId,
      buyerEmail: normalizedBuyerEmail,
      nextAction: normalizedNextAction,
      financeType: normalizedFinanceType,
      purchasePrice: normalizedPurchasePrice,
      cashAmount: normalizedCashAmount,
      bondAmount: normalizedBondAmount,
      depositAmount: normalizedDepositAmount,
    },
  })

  return {
    buyer,
    onboardingStatus: normalizedOnboardingStatus,
    onboardingLifecycleStatus: lifecycleStatus,
    purchaserType: normalizedPurchaserType,
  }
}

export async function updateTransactionStakeholderContacts({
  transactionId,
  buyerName,
  buyerEmail,
  buyerPhone,
  sellerName,
  sellerEmail,
  sellerPhone,
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
  const actorProfile = await resolveActiveProfileContext(client)
  const normalizedActorRole = normalizeRoleType(actorRole || actorProfile.role || 'attorney')
  if (!['attorney', 'developer', 'internal_admin', 'agent'].includes(normalizedActorRole)) {
    throw new Error('Your role does not have permission to update stakeholder details.')
  }

  let transactionQuery = await client
    .from('transactions')
    .select(
      selectWithoutKnownMissingColumns(
        'id, buyer_id, purchaser_type, assigned_agent, assigned_agent_email, attorney, assigned_attorney_email, bond_originator, assigned_bond_originator_email, matter_owner, seller_name, seller_email, seller_phone, updated_at',
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
  const normalizedSellerName = normalizeNullableText(sellerName)
  const normalizedSellerEmail = normalizeNullableText(sellerEmail)?.toLowerCase() || null
  const normalizedSellerPhone = normalizeNullableText(sellerPhone)

  let buyer = null
  let effectiveBuyerId = transaction.buyer_id || null

  if (effectiveBuyerId) {
    const buyerLookup = await client.from('buyers').select('id, name, email, phone').eq('id', effectiveBuyerId).maybeSingle()
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
    seller_name: normalizedSellerName,
    seller_email: normalizedSellerEmail,
    seller_phone: normalizedSellerPhone,
    updated_at: new Date().toISOString(),
  }

  const fallbackColumns = [
    'assigned_agent',
    'assigned_agent_email',
    'assigned_attorney_email',
    'assigned_bond_originator_email',
    'matter_owner',
    'seller_name',
    'seller_email',
    'seller_phone',
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
      applyFormDataValue('seller_name', normalizedSellerName)
      applyFormDataValue('seller_email', normalizedSellerEmail)
      applyFormDataValue('seller_phone', normalizedSellerPhone)

      const onboardingFormDataUpsert = await client.from('onboarding_form_data').upsert(
        {
          transaction_id: transactionId,
          purchaser_type: normalizePurchaserType(transaction?.purchaser_type || onboardingFormDataQuery.data?.purchaser_type || 'individual'),
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
      sellerName: normalizedSellerName,
      sellerEmail: normalizedSellerEmail,
      assignedAgent: transactionPayload.assigned_agent,
      assignedAttorney: transactionPayload.attorney,
      assignedBondOriginator: transactionPayload.bond_originator,
    },
  })

  return fetchTransactionById(transactionId)
}

export async function updateTransactionSubprocessStep({
  transactionId,
  subprocessId,
  stepId,
  status,
  comment,
  completedAt,
  actorRole,
  skipPermissionCheck = false,
  allowAnyWorkflowEdit = false,
}) {
  const client = requireClient()
  let resolvedSubprocessType = null

  if (!transactionId) {
    throw new Error('Transaction id is required.')
  }

  if (!stepId) {
    throw new Error('Step id is required.')
  }

  const normalizedActorRole = actorRole ? normalizeRoleType(actorRole) : null

  if (!skipPermissionCheck && normalizedActorRole && subprocessId) {
    const hasWorkspaceOverride = allowAnyWorkflowEdit && ['developer', 'internal_admin', 'agent'].includes(normalizedActorRole)
    if (hasWorkspaceOverride) {
      // Explicit workspace override: keep subprocess editing operational without lane-level locking.
    } else {
    const subprocessLookup = await client
      .from('transaction_subprocesses')
      .select('id, process_type')
      .eq('id', subprocessId)
      .maybeSingle()

    if (subprocessLookup.error && !isMissingSchemaError(subprocessLookup.error)) {
      throw subprocessLookup.error
    }

    if (subprocessLookup.data) {
      resolvedSubprocessType = subprocessLookup.data.process_type || null
      const participantLookup = await client
        .from('transaction_participants')
        .select('role_type, can_edit_finance_workflow, can_edit_attorney_workflow, can_edit_core_transaction')
        .eq('transaction_id', transactionId)
        .eq('role_type', normalizedActorRole)
        .maybeSingle()

      if (participantLookup.error && !isMissingSchemaError(participantLookup.error)) {
        throw participantLookup.error
      }

      if (participantLookup.data) {
        const laneKey = resolveLaneKeyFromProcessType(subprocessLookup.data.process_type)
        const canEdit = canEditWorkflowLaneFromParticipantRow({
          laneKey,
          actorRole: normalizedActorRole,
          participantRow: participantLookup.data,
        })

        if (!canEdit) {
          const laneLabel = subprocessLookup.data.process_type === 'finance' ? 'Finance Workflow' : 'Transfer Workflow'
          throw new Error(`Your role does not have permission to update ${laneLabel}.`)
        }
      }
    }
    }
  }

  if (!resolvedSubprocessType && subprocessId) {
    const subprocessTypeLookup = await client
      .from('transaction_subprocesses')
      .select('process_type')
      .eq('id', subprocessId)
      .maybeSingle()

    if (subprocessTypeLookup.error && !isMissingSchemaError(subprocessTypeLookup.error)) {
      throw subprocessTypeLookup.error
    }

    resolvedSubprocessType = subprocessTypeLookup.data?.process_type || null
  }

  const normalizedStatus = normalizeSubprocessStepStatus(status)
  if (!SUBPROCESS_STEP_STATUSES.includes(normalizedStatus)) {
    throw new Error('Invalid step status.')
  }

  if (resolvedSubprocessType === 'finance' && normalizedStatus !== 'not_started') {
    await assertSalesWorkflowReadyForFinanceTransition(client, transactionId)
    await assertGuidedSubprocessSequentialTransition(client, {
      subprocessId,
      stepId,
      nextStatus: normalizedStatus,
      laneLabel: 'Finance Workflow',
    })
  }

  if (resolvedSubprocessType === 'attorney' && normalizedStatus !== 'not_started') {
    await assertTransferWorkflowReadyForTransition(client, transactionId)
    await assertGuidedSubprocessSequentialTransition(client, {
      subprocessId,
      stepId,
      nextStatus: normalizedStatus,
      laneLabel: 'Transfer Workflow',
    })
  }

  const normalizedComment = normalizeNullableText(comment)
  const normalizedCompletedAt =
    normalizedStatus === 'completed' ? completedAt || new Date().toISOString() : completedAt || null

  const stepPayload = {
    status: normalizedStatus,
    comment: normalizedComment,
    completed_at: normalizedCompletedAt,
    updated_at: new Date().toISOString(),
  }

  const updateResult = await client
    .from('transaction_subprocess_steps')
    .update(stepPayload)
    .eq('id', stepId)
    .select('id, subprocess_id, step_key, step_label, status, completed_at, comment, owner_type, sort_order, updated_at')
    .single()

  if (updateResult.error) {
    if (isMissingSchemaError(updateResult.error)) {
      throw new Error('Sub-process tables are not set up yet. Run sql/schema.sql and refresh.')
    }
    throw updateResult.error
  }

  const refreshedSubprocesses = await ensureTransactionSubprocesses(client, transactionId)

  for (const process of refreshedSubprocesses) {
    const steps = process.steps || []
    const allCompleted = steps.length > 0 && steps.every((step) => step.status === 'completed')
    const hasBlocked = steps.some((step) => step.status === 'blocked')
    const hasStarted = steps.some((step) => ['in_progress', 'completed'].includes(step.status))
    const nextStatus = allCompleted ? 'completed' : hasBlocked ? 'blocked' : hasStarted ? 'in_progress' : 'not_started'

    const updateProcessResult = await client
      .from('transaction_subprocesses')
      .update({
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', process.id)

    if (updateProcessResult.error && !isMissingSchemaError(updateProcessResult.error)) {
      throw updateProcessResult.error
    }
  }

  const financeSummary = refreshedSubprocesses.find((item) => item.process_type === 'finance')?.summary
  const attorneySummary = refreshedSubprocesses.find((item) => item.process_type === 'attorney')?.summary
  const activeSummary =
    refreshedSubprocesses.find((item) => item.id === subprocessId)?.summary ||
    financeSummary ||
    attorneySummary ||
    null
  const workflowComment =
    getWorkflowStepVisibleComment(activeSummary?.waitingStep?.comment) ||
    (activeSummary?.waitingStep ? `Waiting for ${String(activeSummary.waitingStep.step_label || '').toLowerCase()}` : null)
  const subprocessSummary = [
    financeSummary
      ? `FIN ${financeSummary.completedSteps}/${financeSummary.totalSteps}${financeSummary.waitingStep ? ` · ${financeSummary.summaryText}` : ''}`
      : null,
    attorneySummary
      ? `ATTY ${attorneySummary.completedSteps}/${attorneySummary.totalSteps}${attorneySummary.waitingStep ? ` · ${attorneySummary.summaryText}` : ''}`
      : null,
  ]
    .filter(Boolean)
    .join(' | ')

  const transactionPayload = {
    current_sub_stage_summary: subprocessSummary || null,
    comment: workflowComment || subprocessSummary || null,
    updated_at: new Date().toISOString(),
  }

  let syncResult = await client.from('transactions').update(transactionPayload).eq('id', transactionId)
  if (syncResult.error && isMissingColumnError(syncResult.error, 'comment')) {
    const fallbackPayload = { ...transactionPayload }
    delete fallbackPayload.comment
    syncResult = await client.from('transactions').update(fallbackPayload).eq('id', transactionId)
  }

  if (syncResult.error && isMissingColumnError(syncResult.error, 'current_sub_stage_summary')) {
    const fallbackPayload = { ...transactionPayload }
    delete fallbackPayload.current_sub_stage_summary
    delete fallbackPayload.comment
    syncResult = await client.from('transactions').update(fallbackPayload).eq('id', transactionId)
  }

  if (syncResult.error) {
    throw syncResult.error
  }

  await logTransactionEventIfPossible(client, {
    transactionId,
    eventType: 'WorkflowStepUpdated',
    createdByRole: normalizedActorRole || null,
    eventData: {
      subprocessId: updateResult.data?.subprocess_id || subprocessId,
      stepId: updateResult.data?.id || stepId,
      stepKey: updateResult.data?.step_key || null,
      status: normalizedStatus,
      completedAt: normalizedCompletedAt || null,
      comment: normalizedComment || null,
    },
  })

  return {
    step: updateResult.data,
    subprocesses: refreshedSubprocesses,
  }
}

export async function completeTransactionSubprocess({
  transactionId,
  subprocessId,
  processType = null,
  actorRole,
  skipPermissionCheck = false,
  allowAnyWorkflowEdit = false,
  completedAt = null,
}) {
  const client = requireClient()

  if (!transactionId) {
    throw new Error('Transaction id is required.')
  }

  if (!subprocessId) {
    throw new Error('Subprocess id is required.')
  }

  const normalizedActorRole = actorRole ? normalizeRoleType(actorRole) : null

  const subprocessLookup = await client
    .from('transaction_subprocesses')
    .select('id, transaction_id, process_type')
    .eq('id', subprocessId)
    .eq('transaction_id', transactionId)
    .maybeSingle()

  if (subprocessLookup.error) {
    if (isMissingSchemaError(subprocessLookup.error)) {
      throw new Error('Sub-process tables are not set up yet. Run sql/schema.sql and refresh.')
    }
    throw subprocessLookup.error
  }

  if (!subprocessLookup.data) {
    throw new Error('Workflow lane not found for this transaction.')
  }

  const resolvedProcessType = subprocessLookup.data.process_type || processType || null

  if (resolvedProcessType === 'finance') {
    await assertSalesWorkflowReadyForFinanceTransition(client, transactionId)
    throw new Error('Finance Workflow uses guided stage actions. Use the next-step action to continue this lane.')
  }

  if (resolvedProcessType === 'attorney') {
    await assertTransferWorkflowReadyForTransition(client, transactionId)
    throw new Error('Transfer Workflow uses guided stage actions. Use the next-step action to continue this lane.')
  }

  if (!skipPermissionCheck && normalizedActorRole && resolvedProcessType) {
    const hasWorkspaceOverride = allowAnyWorkflowEdit && ['developer', 'internal_admin', 'agent'].includes(normalizedActorRole)
    if (!hasWorkspaceOverride) {
      const participantLookup = await client
        .from('transaction_participants')
        .select('role_type, can_edit_finance_workflow, can_edit_attorney_workflow, can_edit_core_transaction')
        .eq('transaction_id', transactionId)
        .eq('role_type', normalizedActorRole)
        .maybeSingle()

      if (participantLookup.error && !isMissingSchemaError(participantLookup.error)) {
        throw participantLookup.error
      }

      if (participantLookup.data) {
        const laneKey = resolveLaneKeyFromProcessType(resolvedProcessType)
        const canEdit = canEditWorkflowLaneFromParticipantRow({
          laneKey,
          actorRole: normalizedActorRole,
          participantRow: participantLookup.data,
        })

        if (!canEdit) {
          const laneLabel = resolvedProcessType === 'finance' ? 'Finance Workflow' : 'Transfer Workflow'
          throw new Error(`Your role does not have permission to update ${laneLabel}.`)
        }
      }
    }
  }

  const workflowStepsQuery = await client
    .from('transaction_subprocess_steps')
    .select('id, status')
    .eq('subprocess_id', subprocessId)

  if (workflowStepsQuery.error) {
    if (isMissingSchemaError(workflowStepsQuery.error)) {
      throw new Error('Sub-process tables are not set up yet. Run sql/schema.sql and refresh.')
    }
    throw workflowStepsQuery.error
  }

  const stepRows = workflowStepsQuery.data || []
  const updatedSteps = stepRows.filter((step) => normalizeSubprocessStepStatus(step.status) !== 'completed').length

  const nowIso = completedAt || new Date().toISOString()
  const stepUpdateResult = await client
    .from('transaction_subprocess_steps')
    .update({
      status: 'completed',
      completed_at: nowIso,
      updated_at: nowIso,
    })
    .eq('subprocess_id', subprocessId)

  if (stepUpdateResult.error) {
    if (isMissingSchemaError(stepUpdateResult.error)) {
      throw new Error('Sub-process tables are not set up yet. Run sql/schema.sql and refresh.')
    }
    throw stepUpdateResult.error
  }

  const refreshedSubprocesses = await ensureTransactionSubprocesses(client, transactionId)

  for (const process of refreshedSubprocesses) {
    const steps = process.steps || []
    const allCompleted = steps.length > 0 && steps.every((step) => step.status === 'completed')
    const hasBlocked = steps.some((step) => step.status === 'blocked')
    const hasStarted = steps.some((step) => ['in_progress', 'completed'].includes(step.status))
    const nextStatus = allCompleted ? 'completed' : hasBlocked ? 'blocked' : hasStarted ? 'in_progress' : 'not_started'

    const updateProcessResult = await client
      .from('transaction_subprocesses')
      .update({
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', process.id)

    if (updateProcessResult.error && !isMissingSchemaError(updateProcessResult.error)) {
      throw updateProcessResult.error
    }
  }

  const financeSummary = refreshedSubprocesses.find((item) => item.process_type === 'finance')?.summary
  const attorneySummary = refreshedSubprocesses.find((item) => item.process_type === 'attorney')?.summary
  const activeSummary =
    refreshedSubprocesses.find((item) => item.id === subprocessId)?.summary ||
    financeSummary ||
    attorneySummary ||
    null
  const workflowComment =
    getWorkflowStepVisibleComment(activeSummary?.waitingStep?.comment) ||
    (activeSummary?.waitingStep ? `Waiting for ${String(activeSummary.waitingStep.step_label || '').toLowerCase()}` : null)
  const subprocessSummary = [
    financeSummary
      ? `FIN ${financeSummary.completedSteps}/${financeSummary.totalSteps}${financeSummary.waitingStep ? ` · ${financeSummary.summaryText}` : ''}`
      : null,
    attorneySummary
      ? `ATTY ${attorneySummary.completedSteps}/${attorneySummary.totalSteps}${attorneySummary.waitingStep ? ` · ${attorneySummary.summaryText}` : ''}`
      : null,
  ]
    .filter(Boolean)
    .join(' | ')

  const transactionPayload = {
    current_sub_stage_summary: subprocessSummary || null,
    comment: workflowComment || subprocessSummary || null,
    updated_at: new Date().toISOString(),
  }

  let syncResult = await client.from('transactions').update(transactionPayload).eq('id', transactionId)
  if (syncResult.error && isMissingColumnError(syncResult.error, 'comment')) {
    const fallbackPayload = { ...transactionPayload }
    delete fallbackPayload.comment
    syncResult = await client.from('transactions').update(fallbackPayload).eq('id', transactionId)
  }

  if (syncResult.error && isMissingColumnError(syncResult.error, 'current_sub_stage_summary')) {
    const fallbackPayload = { ...transactionPayload }
    delete fallbackPayload.current_sub_stage_summary
    delete fallbackPayload.comment
    syncResult = await client.from('transactions').update(fallbackPayload).eq('id', transactionId)
  }

  if (syncResult.error) {
    throw syncResult.error
  }

  await logTransactionEventIfPossible(client, {
    transactionId,
    eventType: 'WorkflowStepUpdated',
    createdByRole: normalizedActorRole || null,
    eventData: {
      subprocessId,
      processType: resolvedProcessType,
      status: 'completed',
      completedAt: nowIso,
      action: 'bulk_complete',
      updatedSteps,
    },
  })

  return {
    subprocesses: refreshedSubprocesses,
    updatedSteps,
  }
}

function buildExternalWorkflowStepComment({
  actorName,
  actorRole,
  action = 'updated',
  occurredAt,
  userComment,
}) {
  const metadata = {
    actorName: normalizeNullableText(actorName) || 'Shared Workspace',
    actorRole: normalizeRoleType(actorRole),
    action: action === 'completed' ? 'completed' : 'updated',
    occurredAt: occurredAt || new Date().toISOString(),
  }
  const normalizedUserComment = normalizeNullableText(userComment)

  return [`::bridge-meta ${JSON.stringify(metadata)}`, normalizedUserComment]
    .filter(Boolean)
    .join('\n')
}

export async function createNote(transactionId, body, unitId = null) {
  const client = requireClient()

  let insertQuery = await client
    .from('notes')
    .insert({ transaction_id: transactionId, body })
    .select('id, transaction_id, body, created_at')
    .single()

  if (insertQuery.error && isMissingColumnError(insertQuery.error, 'transaction_id') && unitId) {
    insertQuery = await client
      .from('notes')
      .insert({ unit_id: unitId, body })
      .select('id, unit_id, body, created_at')
      .single()
  }

  if (insertQuery.error) {
    throw insertQuery.error
  }

  return insertQuery.data
}

async function loadSharedDiscussion(
  client,
  { transactionId, unitId = null, viewer = 'internal', includeLegacy = true, limit = null } = {},
) {
  if (!transactionId) {
    return []
  }

  const discussionQuery = await client
    .from('transaction_comments')
    .select('id, transaction_id, author_name, author_role, comment_text, created_at')
    .eq('transaction_id', transactionId)
    .order('created_at', { ascending: false })
    .limit(limit || 250)

  let rows = []
  if (discussionQuery.error) {
    if (isMissingTableError(discussionQuery.error, 'transaction_comments')) {
      const legacyNotes = includeLegacy ? await fetchTransactionNotesForPortal(client, transactionId, unitId) : []
      return filterDiscussionRowsByViewer(
        legacyNotes.map((note) => normalizeLegacyNoteAsDiscussionRow(note, transactionId, 'shared')),
        viewer,
      )
    }

    throw discussionQuery.error
  }

  rows = (discussionQuery.data || []).map((row) => normalizeTransactionCommentRow(row))

  if (includeLegacy) {
    const legacyNotes = await fetchTransactionNotesForPortal(client, transactionId, unitId)
    const legacyRows = legacyNotes.map((note) => normalizeLegacyNoteAsDiscussionRow(note, transactionId, 'internal'))
    rows = [...rows, ...legacyRows]
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      .slice(0, limit || 250)
  }

  return filterDiscussionRowsByViewer(rows, viewer)
}

export async function fetchTransactionDiscussion(transactionId, options = {}) {
  const client = options.client || requireClient()
  return loadSharedDiscussion(client, {
    transactionId,
    unitId: options.unitId || null,
    viewer: options.viewer || 'internal',
    includeLegacy: options.includeLegacy !== false,
    limit: options.limit || null,
  })
}

export async function addTransactionDiscussionComment({
  transactionId,
  authorName,
  authorRole = 'developer',
  commentText,
  unitId = null,
  client: scopedClient = null,
}) {
  const client = scopedClient || requireClient()

  const normalizedText = String(commentText || '').trim()
  if (!normalizedText) {
    throw new Error('Comment text is required.')
  }

  const normalizedRole = normalizeRoleType(authorRole)
  const normalizedAuthorName = normalizeNullableText(authorName) || TRANSACTION_ROLE_LABELS[normalizedRole] || 'Samlin Team'

  const insertResult = await client
    .from('transaction_comments')
    .insert({
      transaction_id: transactionId,
      author_name: normalizedAuthorName,
      author_role: normalizedRole,
      comment_text: normalizedText,
    })
    .select('id, transaction_id, author_name, author_role, comment_text, created_at')
    .single()

  if (insertResult.error) {
    if (isMissingTableError(insertResult.error, 'transaction_comments')) {
      const fallback = await createNote(transactionId, `[${TRANSACTION_ROLE_LABELS[normalizedRole] || normalizedRole}] ${normalizedText}`, unitId)
      await logTransactionEventIfPossible(client, {
        transactionId,
        eventType: 'CommentAdded',
        createdByRole: normalizedRole,
        eventData: {
          source: 'legacy_notes',
          noteId: fallback?.id || null,
          text: normalizedText,
          discussionType: 'operational',
        },
      })
      return normalizeTransactionCommentRow({
        id: fallback.id,
        transaction_id: transactionId,
        author_name: normalizedAuthorName,
        author_role: normalizedRole,
        comment_text: normalizedText,
        created_at: fallback.created_at,
      })
    }

    throw insertResult.error
  }

  await logTransactionEventIfPossible(client, {
    transactionId,
    eventType: 'CommentAdded',
    createdByRole: normalizedRole,
    eventData: {
      source: 'transaction_comments',
      commentId: insertResult.data?.id || null,
      text: normalizedText,
      discussionType: 'operational',
    },
  })

  return normalizeTransactionCommentRow(insertResult.data)
}

export async function getOrCreateTransactionStatusLink({ transactionId, createdByRole = 'developer' }) {
  const client = requireClient()

  if (!transactionId) {
    throw new Error('Transaction is required.')
  }

  const { data: existing, error: existingError } = await client
    .from('transaction_status_links')
    .select('id, transaction_id, token, is_active, created_by_role, created_at, updated_at')
    .eq('transaction_id', transactionId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingError) {
    if (isMissingTableError(existingError, 'transaction_status_links')) {
      throw new Error('Transaction status links are not set up yet. Run sql/schema.sql first.')
    }

    throw existingError
  }

  if (existing) {
    return existing
  }

  const { data, error } = await client
    .from('transaction_status_links')
    .insert({
      transaction_id: transactionId,
      token: generateStatusLinkToken(),
      is_active: true,
      created_by_role: normalizeRoleType(createdByRole),
    })
    .select('id, transaction_id, token, is_active, created_by_role, created_at, updated_at')
    .single()

  if (error && error.code === '23505') {
    const conflict = await client
      .from('transaction_status_links')
      .select('id, transaction_id, token, is_active, created_by_role, created_at, updated_at')
      .eq('transaction_id', transactionId)
      .eq('is_active', true)
      .maybeSingle()

    if (conflict.error) {
      throw conflict.error
    }

    return conflict.data
  }

  if (error) {
    if (isMissingTableError(error, 'transaction_status_links')) {
      throw new Error('Transaction status links are not set up yet. Run sql/schema.sql first.')
    }

    throw error
  }

  await logTransactionEventIfPossible(client, {
    transactionId,
    eventType: 'StatusLinkCreated',
    createdByRole: normalizeRoleType(createdByRole),
    eventData: {
      statusLinkId: data?.id || null,
      token: data?.token || null,
      isActive: data?.is_active ?? true,
    },
  })

  return data
}

async function resolveTransactionStatusLinkByToken(client, token) {
  const normalizedToken = String(token || '').trim()
  if (!normalizedToken) {
    throw new Error('Status token is required.')
  }

  const { data, error } = await client
    .from('transaction_status_links')
    .select('id, transaction_id, token, is_active, created_by_role, created_at, updated_at')
    .eq('token', normalizedToken)
    .eq('is_active', true)
    .maybeSingle()

  if (error) {
    if (isMissingTableError(error, 'transaction_status_links')) {
      throw new Error('Transaction status links are not set up yet. Run sql/schema.sql first.')
    }

    throw error
  }

  if (!data) {
    throw new Error('Status link is invalid or inactive.')
  }

  return data
}

export async function fetchTransactionStatusByToken(token) {
  const client = requireStatusTokenClient(token)
  const link = await resolveTransactionStatusLinkByToken(client, token)

  let transactionQuery = await client
    .from('transactions')
    .select(
      'id, development_id, unit_id, buyer_id, finance_type, finance_managed_by, purchaser_type, stage, current_main_stage, current_sub_stage_summary, attorney, bond_originator, next_action, comment, updated_at, created_at',
    )
    .eq('id', link.transaction_id)
    .maybeSingle()

  if (
    transactionQuery.error &&
    (isMissingColumnError(transactionQuery.error, 'finance_managed_by') ||
      isMissingColumnError(transactionQuery.error, 'current_sub_stage_summary') ||
      isMissingColumnError(transactionQuery.error, 'purchaser_type') ||
      isMissingColumnError(transactionQuery.error, 'comment'))
  ) {
    transactionQuery = await client
      .from('transactions')
      .select('id, development_id, unit_id, buyer_id, finance_type, stage, current_main_stage, attorney, bond_originator, next_action, updated_at, created_at')
      .eq('id', link.transaction_id)
      .maybeSingle()
  }

  if (transactionQuery.error) {
    throw transactionQuery.error
  }

  const transaction = transactionQuery.data
  if (!transaction) {
    throw new Error('Transaction not found.')
  }

  const [unitQuery, buyerQuery] = await Promise.all([
    client
      .from('units')
      .select('id, development_id, unit_number, phase, price, status, development:developments(id, name)')
      .eq('id', transaction.unit_id)
      .maybeSingle(),
    transaction.buyer_id
      ? client.from('buyers').select('id, name, phone, email').eq('id', transaction.buyer_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])

  if (unitQuery.error) {
    throw unitQuery.error
  }

  if (buyerQuery.error) {
    throw buyerQuery.error
  }

  const discussion = await loadSharedDiscussion(client, {
    transactionId: transaction.id,
    unitId: transaction.unit_id,
    viewer: 'external',
    includeLegacy: true,
    limit: 8,
  })

  const latestDiscussion = (
    discussion[0] || null
  )

  const subprocesses = await ensureTransactionSubprocesses(client, transaction.id, { createIfMissing: false })
  const financeSummary = subprocesses.find((item) => item.process_type === 'finance')?.summary || null
  const attorneySummary = subprocesses.find((item) => item.process_type === 'attorney')?.summary || null
  const stage = normalizeStage(transaction.stage, unitQuery.data?.status)
  const mainStage = normalizeMainStage(transaction.current_main_stage, stage)

  return {
    link,
    transaction,
    unit: unitQuery.data || null,
    buyer: buyerQuery.data || null,
    subprocesses,
    stage,
    mainStage,
    financeSummary,
    attorneySummary,
    discussion,
    latestDiscussion,
    latestStatusComment: latestDiscussion?.commentBody || latestDiscussion?.commentText || transaction.comment || transaction.next_action || '',
    nextStep:
      transaction.next_action ||
      financeSummary?.waitingStep?.comment ||
      attorneySummary?.waitingStep?.comment ||
      financeSummary?.waitingStep?.step_label ||
      attorneySummary?.waitingStep?.step_label ||
      'No next action set.',
    updatedAt: transaction.updated_at || transaction.created_at || null,
  }
}

async function resolveExternalAccessByToken(client, accessToken) {
  const { data, error } = await client
    .from('transaction_external_access')
    .select('id, transaction_id, buyer_id, role, email, access_token, expires_at, revoked, created_at')
    .eq('access_token', accessToken)
    .maybeSingle()

  if (error) {
    if (isMissingTableError(error, 'transaction_external_access')) {
      throw new Error('External access is not set up yet. Run sql/schema.sql to create transaction_external_access.')
    }

    throw error
  }

  if (!data) {
    throw new Error('Access link not found.')
  }

  if (data.revoked) {
    throw new Error('This access link has been revoked.')
  }

  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) {
    throw new Error('This access link has expired.')
  }

  return {
    ...data,
    role: normalizeExternalRole(data.role),
  }
}

export async function fetchExternalAccessLinks(transactionId) {
  const client = requireClient()

  if (!transactionId) {
    return []
  }

  const { data, error } = await client
    .from('transaction_external_access')
    .select('id, transaction_id, buyer_id, role, email, access_token, expires_at, revoked, created_at')
    .eq('transaction_id', transactionId)
    .order('created_at', { ascending: false })

  if (error) {
    if (isMissingTableError(error, 'transaction_external_access')) {
      return []
    }

    throw error
  }

  return (data || []).map((item) => ({
    ...item,
    role: normalizeExternalRole(item.role),
  }))
}

export async function createExternalAccessLink({
  transactionId,
  buyerId = null,
  email,
  role = 'attorney',
  expiresDays = 14,
}) {
  const client = requireClient()

  if (!transactionId) {
    throw new Error('Transaction is required.')
  }

  const normalizedEmail = email?.trim().toLowerCase()
  if (!normalizedEmail) {
    throw new Error('Email is required.')
  }

  const normalizedRole = normalizeExternalRole(role)

  if (!EXTERNAL_ACCESS_ROLES.includes(normalizedRole)) {
    throw new Error('Invalid external role.')
  }

  const generatedToken = `tx${crypto.randomUUID().replaceAll('-', '')}`
  const expiresAt =
    Number(expiresDays) > 0 ? new Date(Date.now() + Number(expiresDays) * 24 * 60 * 60 * 1000).toISOString() : null

  let result = await client
    .from('transaction_external_access')
    .insert({
      transaction_id: transactionId,
      buyer_id: buyerId || null,
      role: normalizedRole,
      email: normalizedEmail,
      access_token: generatedToken,
      expires_at: expiresAt,
    })
    .select('id, transaction_id, buyer_id, role, email, access_token, expires_at, revoked, created_at')
    .single()

  if (
    result.error &&
    normalizedRole === 'attorney' &&
    ['23514', '22P02'].includes(result.error.code)
  ) {
    result = await client
      .from('transaction_external_access')
      .insert({
        transaction_id: transactionId,
        buyer_id: buyerId || null,
        role: 'tuckers',
        email: normalizedEmail,
        access_token: generatedToken,
        expires_at: expiresAt,
      })
      .select('id, transaction_id, buyer_id, role, email, access_token, expires_at, revoked, created_at')
      .single()
  }

  if (result.error) {
    if (isMissingTableError(result.error, 'transaction_external_access')) {
      throw new Error('External access is not set up yet. Run sql/schema.sql to create transaction_external_access.')
    }

    throw result.error
  }

  return result.data
}

export async function revokeExternalAccessLink(linkId) {
  const client = requireClient()

  const { error } = await client.from('transaction_external_access').update({ revoked: true }).eq('id', linkId)

  if (error) {
    if (isMissingTableError(error, 'transaction_external_access')) {
      throw new Error('External access is not set up yet. Run sql/schema.sql to create transaction_external_access.')
    }

    throw error
  }
}

async function fetchTransactionNotesForPortal(client, transactionId, unitId) {
  if (!transactionId && !unitId) {
    return []
  }

  let notesQuery = await client
    .from('notes')
    .select('id, transaction_id, body, created_at')
    .eq('transaction_id', transactionId)
    .order('created_at', { ascending: false })
    .limit(60)

  if (notesQuery.error && isMissingColumnError(notesQuery.error, 'transaction_id') && unitId) {
    notesQuery = await client
      .from('notes')
      .select('id, unit_id, body, created_at')
      .eq('unit_id', unitId)
      .order('created_at', { ascending: false })
      .limit(60)
  }

  if (notesQuery.error) {
    if (isMissingSchemaError(notesQuery.error)) {
      return []
    }

    throw notesQuery.error
  }

  return (notesQuery.data || []).map((note) => ({
    ...note,
    transaction_id: note.transaction_id || transactionId,
  }))
}

function ensureExternalWorkspaceRole(access) {
  if (access.role === 'client') {
    throw new Error('Clients can only use the client portal link. Please open your /client/... access URL.')
  }
}

function externalRoleCandidates(role) {
  if (role === 'attorney') {
    return ['attorney', 'tuckers']
  }

  return [role]
}

async function resolveAccessibleExternalTransactionIds(client, access) {
  const roleCandidates = externalRoleCandidates(access.role)

  const { data, error } = await client
    .from('transaction_external_access')
    .select('transaction_id, role, expires_at, revoked')
    .eq('email', access.email)
    .in('role', roleCandidates)

  if (error) {
    throw error
  }

  const now = Date.now()
  const ids = new Set()

  for (const row of data || []) {
    if (row.revoked) {
      continue
    }

    if (row.expires_at && new Date(row.expires_at).getTime() < now) {
      continue
    }

    if (row.transaction_id) {
      ids.add(row.transaction_id)
    }
  }

  return [...ids]
}

async function resolveExternalWorkspaceTransactionIds(client, access) {
  const ids = await resolveAccessibleExternalTransactionIds(client, access)

  if (access.transaction_id && !ids.includes(access.transaction_id)) {
    ids.push(access.transaction_id)
  }

  return ids
}

async function fetchExternalTransactionSummaries(client, transactionIds) {
  if (!transactionIds.length) {
    return []
  }

  let transactionsQuery = await client
    .from('transactions')
    .select(
      'id, development_id, unit_id, buyer_id, sales_price, purchase_price, finance_type, cash_amount, bond_amount, deposit_amount, reservation_required, reservation_amount, reservation_status, stage, attorney, bond_originator, next_action, updated_at, created_at',
    )
    .in('id', transactionIds)
    .order('updated_at', { ascending: false })

  if (
    transactionsQuery.error &&
    (isMissingColumnError(transactionsQuery.error, 'development_id') ||
      isMissingColumnError(transactionsQuery.error, 'purchase_price') ||
      isMissingColumnError(transactionsQuery.error, 'cash_amount') ||
      isMissingColumnError(transactionsQuery.error, 'bond_amount') ||
      isMissingColumnError(transactionsQuery.error, 'deposit_amount') ||
      isMissingColumnError(transactionsQuery.error, 'reservation_required') ||
      isMissingColumnError(transactionsQuery.error, 'reservation_amount') ||
      isMissingColumnError(transactionsQuery.error, 'reservation_status'))
  ) {
    transactionsQuery = await client
      .from('transactions')
      .select('id, unit_id, buyer_id, sales_price, finance_type, stage, attorney, bond_originator, next_action, updated_at, created_at')
      .in('id', transactionIds)
      .order('updated_at', { ascending: false })
  }

  if (transactionsQuery.error) {
    throw transactionsQuery.error
  }

  const transactions = transactionsQuery.data || []
  if (!transactions.length) {
    return []
  }

  const unitIds = [...new Set(transactions.map((item) => item.unit_id).filter(Boolean))]
  const buyerIds = [...new Set(transactions.map((item) => item.buyer_id).filter(Boolean))]

  const [unitsQuery, buyersQuery] = await Promise.all([
    unitIds.length
      ? client
          .from('units')
          .select('id, development_id, unit_number, phase, price, status, development:developments(id, name)')
          .in('id', unitIds)
      : Promise.resolve({ data: [], error: null }),
    buyerIds.length ? client.from('buyers').select('id, name').in('id', buyerIds) : Promise.resolve({ data: [], error: null }),
  ])

  if (unitsQuery.error) {
    throw unitsQuery.error
  }

  if (buyersQuery.error) {
    throw buyersQuery.error
  }

  const unitById = (unitsQuery.data || []).reduce((accumulator, row) => {
    accumulator[row.id] = row
    return accumulator
  }, {})

  const buyerById = (buyersQuery.data || []).reduce((accumulator, row) => {
    accumulator[row.id] = row
    return accumulator
  }, {})

  return transactions.map((transaction) => {
    const unit = unitById[transaction.unit_id] || null
    const buyer = transaction.buyer_id ? buyerById[transaction.buyer_id] || null : null
    const stage = normalizeStage(transaction.stage, unit?.status)

    return {
      transactionId: transaction.id,
      developmentName: unit?.development?.name || 'Unknown Development',
      unitNumber: unit?.unit_number || '-',
      buyerName: buyer?.name || 'No buyer',
      stage,
      nextAction: transaction.next_action || '',
      updatedAt: transaction.updated_at || transaction.created_at || null,
    }
  })
}

async function fetchExternalTransactionWorkspace(client, transactionId) {
  let transactionQuery = await client
    .from('transactions')
    .select(
      'id, development_id, unit_id, buyer_id, sales_price, purchase_price, finance_type, purchaser_type, cash_amount, bond_amount, deposit_amount, reservation_required, reservation_amount, reservation_status, reservation_paid_date, bank, stage, attorney, bond_originator, next_action, expected_transfer_date, updated_at, created_at',
    )
    .eq('id', transactionId)
    .maybeSingle()

  if (
    transactionQuery.error &&
    (isMissingColumnError(transactionQuery.error, 'expected_transfer_date') ||
      isMissingColumnError(transactionQuery.error, 'development_id') ||
      isMissingColumnError(transactionQuery.error, 'bank') ||
      isMissingColumnError(transactionQuery.error, 'purchaser_type') ||
      isMissingColumnError(transactionQuery.error, 'purchase_price') ||
      isMissingColumnError(transactionQuery.error, 'cash_amount') ||
      isMissingColumnError(transactionQuery.error, 'bond_amount') ||
      isMissingColumnError(transactionQuery.error, 'deposit_amount') ||
      isMissingColumnError(transactionQuery.error, 'reservation_required') ||
      isMissingColumnError(transactionQuery.error, 'reservation_amount') ||
      isMissingColumnError(transactionQuery.error, 'reservation_status') ||
      isMissingColumnError(transactionQuery.error, 'reservation_paid_date'))
  ) {
    transactionQuery = await client
      .from('transactions')
      .select('id, unit_id, buyer_id, sales_price, finance_type, purchaser_type, stage, attorney, bond_originator, next_action, updated_at, created_at')
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

  const { data: unit, error: unitError } = await client
    .from('units')
    .select('id, development_id, unit_number, phase, price, status, development:developments(id, name)')
    .eq('id', transaction.unit_id)
    .maybeSingle()

  if (unitError) {
    throw unitError
  }

  let buyer = null
  if (transaction.buyer_id) {
    const { data: buyerData, error: buyerError } = await client
      .from('buyers')
      .select('id, name, phone, email')
      .eq('id', transaction.buyer_id)
      .maybeSingle()

    if (buyerError) {
      throw buyerError
    }

    buyer = buyerData
  }

  const documents = await loadSharedDocuments(client, {
    transactionIds: [transaction.id],
    viewer: 'external',
  })
  const handover = await fetchTransactionHandover(client, {
    developmentId: transaction.development_id || unit?.development_id || null,
    unitId: transaction.unit_id,
    transaction,
    buyer,
  })
  const discussion = await loadSharedDiscussion(client, {
    transactionId: transaction.id,
    unitId: transaction.unit_id,
    viewer: 'external',
    includeLegacy: true,
    limit: 120,
  })
  const onboardingFormData = transaction?.id
    ? await fetchOnboardingFormDataForTransaction(client, transaction.id, transaction.purchaser_type)
    : null
  const onboardingValues = onboardingFormData?.formData || {}
  const resolvedPurchaserType = normalizePurchaserType(onboardingValues.purchaser_type || transaction.purchaser_type)
  const financeSnapshot = getOnboardingFinanceSnapshot({
    formData: onboardingValues,
    transaction,
  })
  const requiredDocuments = await ensureTransactionRequiredDocuments(client, {
    transactionId: transaction.id,
    purchaserType: resolvedPurchaserType,
    financeType: financeSnapshot.financeType,
    reservationRequired: financeSnapshot.reservationRequired,
    cashAmount: financeSnapshot.cashAmount,
    bondAmount: financeSnapshot.bondAmount,
    formData: onboardingValues,
  }, { sync: false })
  const requirements = await fetchDocumentRequirements(client, unit?.development_id || transaction.development_id)
  const checklistResult = requiredDocuments.length
    ? buildRequiredChecklistFromRows(requiredDocuments, documents)
    : buildDocumentChecklist(requirements, documents)

  return {
    transaction,
    unit,
    buyer,
    onboardingFormData,
    discussion,
    documents,
    handover,
    requiredDocuments,
    requiredDocumentChecklist: checklistResult.checklist,
    documentSummary: checklistResult.summary,
    stage: normalizeStage(transaction.stage, unit?.status),
  }
}

async function resolveClientPortalLinkByToken(client, token) {
  const { data, error } = await client
    .from('client_portal_links')
    .select('id, development_id, unit_id, transaction_id, buyer_id, token, is_active, created_at, updated_at')
    .eq('token', token)
    .eq('is_active', true)
    .maybeSingle()

  if (error) {
    if (isMissingTableError(error, 'client_portal_links')) {
      throw new Error('Client portal links are not set up yet. Run sql/schema.sql first.')
    }

    throw error
  }

  if (!data) {
    throw new Error('Client portal link is invalid or inactive.')
  }

  return data
}

export async function fetchClientPortalLinks(transactionId) {
  const client = requireClient()

  if (!transactionId) {
    return []
  }

  const { data, error } = await client
    .from('client_portal_links')
    .select('id, development_id, unit_id, transaction_id, buyer_id, token, is_active, created_at, updated_at')
    .eq('transaction_id', transactionId)
    .order('created_at', { ascending: false })

  if (error) {
    if (isMissingTableError(error, 'client_portal_links')) {
      return []
    }

    throw error
  }

  return data
}

export async function getOrCreateClientPortalLink({ developmentId, unitId, transactionId, buyerId = null }) {
  const client = requireClient()

  if (!developmentId || !unitId || !transactionId) {
    throw new Error('Development, unit, and transaction are required.')
  }

  const settings = await ensureDevelopmentSettings(client, developmentId)
  if (!settings.client_portal_enabled) {
    throw new Error('Client portal is disabled for this development.')
  }

  const { data: existing, error: existingError } = await client
    .from('client_portal_links')
    .select('id, development_id, unit_id, transaction_id, buyer_id, token, is_active, created_at, updated_at')
    .eq('transaction_id', transactionId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingError) {
    if (isMissingTableError(existingError, 'client_portal_links')) {
      throw new Error('Client portal links are not set up yet. Run sql/schema.sql first.')
    }

    throw existingError
  }

  if (existing) {
    return existing
  }

  const { data, error } = await client
    .from('client_portal_links')
    .insert({
      development_id: developmentId,
      unit_id: unitId,
      transaction_id: transactionId,
      buyer_id: buyerId || null,
      token: generateClientPortalToken(),
      is_active: true,
    })
    .select('id, development_id, unit_id, transaction_id, buyer_id, token, is_active, created_at, updated_at')
    .single()

  if (error && error.code === '23505') {
    const { data: conflicted, error: conflictedError } = await client
      .from('client_portal_links')
      .select('id, development_id, unit_id, transaction_id, buyer_id, token, is_active, created_at, updated_at')
      .eq('transaction_id', transactionId)
      .eq('is_active', true)
      .maybeSingle()

    if (conflictedError) {
      throw conflictedError
    }

    if (conflicted) {
      return conflicted
    }
  }

  if (error) {
    if (isMissingTableError(error, 'client_portal_links')) {
      throw new Error('Client portal links are not set up yet. Run sql/schema.sql first.')
    }

    throw error
  }

  return data
}

export async function revokeClientPortalLink(linkId) {
  const client = requireClient()
  const { error } = await client.from('client_portal_links').update({ is_active: false }).eq('id', linkId)

  if (error) {
    if (isMissingTableError(error, 'client_portal_links')) {
      throw new Error('Client portal links are not set up yet. Run sql/schema.sql first.')
    }

    throw error
  }
}

export async function getOrCreateTransactionOnboarding({ transactionId, purchaserType = 'individual' }) {
  const client = requireClient()

  if (!transactionId) {
    throw new Error('Transaction is required.')
  }

  const onboarding = await getOrCreateTransactionOnboardingRecord(client, {
    transactionId,
    purchaserType,
  })

  if (!onboarding) {
    throw new Error('Transaction onboarding is not set up yet. Run sql/schema.sql first.')
  }

  const { data: transaction, error: transactionError } = await client
    .from('transactions')
    .select('id, purchaser_type, finance_type, cash_amount, bond_amount, reservation_required')
    .eq('id', transactionId)
    .maybeSingle()

  if (
    transactionError &&
    !isMissingColumnError(transactionError, 'purchaser_type') &&
    !isMissingColumnError(transactionError, 'finance_type') &&
    !isMissingColumnError(transactionError, 'cash_amount') &&
    !isMissingColumnError(transactionError, 'bond_amount') &&
    !isMissingColumnError(transactionError, 'reservation_required')
  ) {
    throw transactionError
  }

  const resolvedType = normalizePurchaserType(transaction?.purchaser_type || purchaserType || onboarding.purchaserType)
  const resolvedFinanceType = normalizeFinanceType(transaction?.finance_type || 'cash')
  const requiredDocuments = await ensureTransactionRequiredDocuments(client, {
    transactionId,
    purchaserType: resolvedType,
    financeType: resolvedFinanceType,
    reservationRequired: Boolean(transaction?.reservation_required),
    cashAmount: transaction?.cash_amount,
    bondAmount: transaction?.bond_amount,
    formData: {},
  })

  return {
    ...onboarding,
    purchaserType: resolvedType,
    purchaserTypeLabel: getPurchaserTypeLabel(resolvedType),
    requiredDocuments,
  }
}

function toBoolean(value, fallback = false) {
  if (value === true || value === false) {
    return value
  }

  const normalized = String(value || '')
    .trim()
    .toLowerCase()

  if (['true', 'yes', '1'].includes(normalized)) {
    return true
  }

  if (['false', 'no', '0'].includes(normalized)) {
    return false
  }

  return fallback
}

function getOnboardingFinanceSnapshot({ formData = {}, transaction = null } = {}) {
  const financeType = normalizeFinanceType(formData.purchase_finance_type || transaction?.finance_type || 'cash')
  const purchasePrice = resolvePurchasePrice({ formData, transaction })
  const cashAmount = normalizeOptionalNumber(formData.cash_amount ?? transaction?.cash_amount)
  const bondAmount = normalizeOptionalNumber(formData.bond_amount ?? transaction?.bond_amount)
  const depositAmount = normalizeOptionalNumber(formData.deposit_amount ?? transaction?.deposit_amount)
  const reservationRequired = toBoolean(formData.reservation_required, Boolean(transaction?.reservation_required))
  const reservationAmount = reservationRequired
    ? normalizeOptionalNumber(formData.reservation_amount ?? transaction?.reservation_amount)
    : null
  const reservationStatus = normalizeReservationStatus(formData.reservation_status || transaction?.reservation_status, {
    required: reservationRequired,
  })

  const reservationPaidDate =
    reservationRequired && ['paid', 'verified'].includes(reservationStatus)
      ? String(formData.reservation_paid_date || transaction?.reservation_paid_date || new Date().toISOString().slice(0, 10))
      : null

  return {
    financeType,
    purchasePrice,
    cashAmount,
    bondAmount,
    depositAmount,
    reservationRequired,
    reservationAmount,
    reservationStatus,
    reservationPaidDate,
  }
}

function validateOnboardingFinanceAndReservation({ formData = {}, transaction = null } = {}) {
  const snapshot = getOnboardingFinanceSnapshot({ formData, transaction })
  const hasPurchasePrice = Number.isFinite(snapshot.purchasePrice) && snapshot.purchasePrice > 0
  const hasCashAmount = Number.isFinite(snapshot.cashAmount) && snapshot.cashAmount > 0
  const hasBondAmount = Number.isFinite(snapshot.bondAmount) && snapshot.bondAmount > 0

  if (
    snapshot.financeType === 'combination' &&
    hasPurchasePrice &&
    hasCashAmount &&
    hasBondAmount &&
    snapshot.cashAmount + snapshot.bondAmount > snapshot.purchasePrice + 1
  ) {
    throw new Error('Cash Contribution plus Bond Amount cannot exceed the Purchase Price.')
  }

}

function getOnboardingFundingSources(formData = {}) {
  const directList = Array.isArray(formData?.funding_sources) ? formData.funding_sources : []
  return normalizeFundingSources(directList)
}

function validateOnboardingFundingSources({ formData = {}, transaction = null, submit = false } = {}) {
  const snapshot = getOnboardingFinanceSnapshot({ formData, transaction })
  const fundingSources = getOnboardingFundingSources(formData)
  if (!submit) {
    return fundingSources
  }

  const needsFundingPlan = snapshot.financeType === 'cash' || snapshot.financeType === 'combination'
  if (!needsFundingPlan || !fundingSources.length) {
    return fundingSources
  }

  for (const source of fundingSources) {
    if (!source.amount || source.amount <= 0) {
      throw new Error('Each funding source entry must include an amount.')
    }

    if (!source.sourceType || source.sourceType === 'other') {
      throw new Error('Each funding source entry must include a source type.')
    }
  }

  return fundingSources
}

async function replaceTransactionFundingSources(client, { transactionId, fundingSources = [] } = {}) {
  if (!transactionId) {
    return []
  }

  const deleteQuery = await client.from('transaction_funding_sources').delete().eq('transaction_id', transactionId)
  if (deleteQuery.error) {
    if (isMissingTableError(deleteQuery.error, 'transaction_funding_sources')) {
      return []
    }
    throw deleteQuery.error
  }

  if (!fundingSources.length) {
    return []
  }

  const rows = fundingSources.map((source) => ({
    transaction_id: transactionId,
    source_type: normalizeFundingSourceType(source.sourceType ?? source.source_type),
    amount: normalizeOptionalNumber(source.amount),
    expected_payment_date: normalizeOptionalDate(source.expectedPaymentDate ?? source.expected_payment_date),
    actual_payment_date: normalizeOptionalDate(source.actualPaymentDate ?? source.actual_payment_date),
    proof_document: normalizeNullableText(source.proofDocument ?? source.proof_document),
    status: normalizeFundingSourceStatus(source.status),
    notes: normalizeNullableText(source.notes),
  }))

  const insertQuery = await client
    .from('transaction_funding_sources')
    .insert(rows)
    .select(
      'id, transaction_id, source_type, amount, expected_payment_date, actual_payment_date, proof_document, status, notes, created_at, updated_at',
    )
    .order('created_at', { ascending: true })

  if (insertQuery.error) {
    if (isMissingTableError(insertQuery.error, 'transaction_funding_sources')) {
      return []
    }
    throw insertQuery.error
  }

  return (insertQuery.data || []).map((row) => ({
    id: row.id,
    transactionId: row.transaction_id,
    sourceType: row.source_type,
    amount: row.amount,
    expectedPaymentDate: row.expected_payment_date,
    actualPaymentDate: row.actual_payment_date,
    proofDocument: row.proof_document,
    status: normalizeFundingSourceStatus(row.status),
    notes: row.notes || '',
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  }))
}

async function fetchTransactionFundingSources(client, transactionId) {
  if (!transactionId) {
    return []
  }

  const query = await client
    .from('transaction_funding_sources')
    .select(
      'id, transaction_id, source_type, amount, expected_payment_date, actual_payment_date, proof_document, status, notes, created_at, updated_at',
    )
    .eq('transaction_id', transactionId)
    .order('created_at', { ascending: true })

  if (query.error) {
    if (isMissingTableError(query.error, 'transaction_funding_sources')) {
      return []
    }
    throw query.error
  }

  return (query.data || []).map((row) => ({
    id: row.id,
    transactionId: row.transaction_id,
    sourceType: row.source_type,
    amount: row.amount,
    expectedPaymentDate: row.expected_payment_date,
    actualPaymentDate: row.actual_payment_date,
    proofDocument: row.proof_document,
    status: normalizeFundingSourceStatus(row.status),
    notes: row.notes || '',
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  }))
}

async function syncOnboardingTransactionFinanceSnapshot(
  client,
  {
    transaction,
    formData = {},
    purchaserType = 'individual',
    onboardingStatus = 'awaiting_client_onboarding',
    onboardingCompletedAt = null,
    externalOnboardingSubmittedAt = null,
  },
) {
  if (!transaction?.id) {
    return
  }

  const snapshot = getOnboardingFinanceSnapshot({ formData, transaction })
  const payload = {
    finance_type: snapshot.financeType,
    sales_price: snapshot.purchasePrice,
    purchase_price: snapshot.purchasePrice,
    cash_amount: snapshot.cashAmount,
    bond_amount: snapshot.bondAmount,
    deposit_amount: snapshot.depositAmount,
    reservation_required: snapshot.reservationRequired,
    reservation_amount: snapshot.reservationAmount,
    reservation_status: snapshot.reservationStatus,
    reservation_paid_date: snapshot.reservationPaidDate,
    purchaser_type: getTransactionPurchaserTypeValue(purchaserType || transaction?.purchaser_type),
    onboarding_status: onboardingStatus,
    onboarding_completed_at: onboardingCompletedAt,
    external_onboarding_submitted_at: externalOnboardingSubmittedAt,
  }
  const fallbackPayload = { ...payload }
  delete fallbackPayload.purchaser_type
  delete fallbackPayload.purchase_price
  delete fallbackPayload.cash_amount
  delete fallbackPayload.bond_amount
  delete fallbackPayload.deposit_amount
  delete fallbackPayload.reservation_required
  delete fallbackPayload.reservation_amount
  delete fallbackPayload.reservation_status
  delete fallbackPayload.reservation_paid_date
  delete fallbackPayload.onboarding_status
  delete fallbackPayload.onboarding_completed_at
  delete fallbackPayload.external_onboarding_submitted_at

  let result = await client.from('transactions').update(payload).eq('id', transaction.id)

  if (
    result.error &&
    (isMissingColumnError(result.error, 'purchaser_type') ||
      isMissingColumnError(result.error, 'purchase_price') ||
      isMissingColumnError(result.error, 'cash_amount') ||
      isMissingColumnError(result.error, 'bond_amount') ||
      isMissingColumnError(result.error, 'deposit_amount') ||
      isMissingColumnError(result.error, 'reservation_required') ||
      isMissingColumnError(result.error, 'reservation_amount') ||
      isMissingColumnError(result.error, 'reservation_status') ||
      isMissingColumnError(result.error, 'reservation_paid_date') ||
      isMissingColumnError(result.error, 'onboarding_status') ||
      isMissingColumnError(result.error, 'onboarding_completed_at') ||
      isMissingColumnError(result.error, 'external_onboarding_submitted_at'))
  ) {
    result = await client.from('transactions').update(fallbackPayload).eq('id', transaction.id)
  }

  if (result.error && isFinanceTypeConstraintError(result.error) && payload.finance_type === 'combination') {
    const legacyPayload = {
      ...fallbackPayload,
      finance_type: 'hybrid',
    }
    result = await client.from('transactions').update(legacyPayload).eq('id', transaction.id)
  }

  if (result.error) {
    throw result.error
  }
}

async function resolveTransactionAndContext(client, transactionId) {
  let transactionQuery = await client
    .from('transactions')
    .select(
      'id, development_id, unit_id, buyer_id, sales_price, purchase_price, finance_type, cash_amount, bond_amount, deposit_amount, reservation_required, reservation_amount, reservation_status, reservation_paid_date, reservation_proof_document, reservation_proof_uploaded_at, reservation_payment_details, reservation_requested_at, reservation_email_sent_at, reservation_reviewed_at, reservation_reviewed_by, reservation_review_notes, onboarding_status, onboarding_completed_at, external_onboarding_submitted_at, purchaser_type, stage, current_main_stage, attorney, bond_originator, next_action, comment, updated_at, created_at',
    )
    .eq('id', transactionId)
    .maybeSingle()

  if (
    transactionQuery.error &&
    (isMissingColumnError(transactionQuery.error, 'purchaser_type') ||
      isMissingColumnError(transactionQuery.error, 'sales_price') ||
      isMissingColumnError(transactionQuery.error, 'purchase_price') ||
      isMissingColumnError(transactionQuery.error, 'cash_amount') ||
      isMissingColumnError(transactionQuery.error, 'bond_amount') ||
      isMissingColumnError(transactionQuery.error, 'deposit_amount') ||
      isMissingColumnError(transactionQuery.error, 'reservation_required') ||
      isMissingColumnError(transactionQuery.error, 'reservation_amount') ||
      isMissingColumnError(transactionQuery.error, 'reservation_status') ||
      isMissingColumnError(transactionQuery.error, 'reservation_paid_date') ||
      isMissingColumnError(transactionQuery.error, 'reservation_proof_document') ||
      isMissingColumnError(transactionQuery.error, 'reservation_proof_uploaded_at') ||
      isMissingColumnError(transactionQuery.error, 'reservation_payment_details') ||
      isMissingColumnError(transactionQuery.error, 'reservation_requested_at') ||
      isMissingColumnError(transactionQuery.error, 'reservation_email_sent_at') ||
      isMissingColumnError(transactionQuery.error, 'reservation_reviewed_at') ||
      isMissingColumnError(transactionQuery.error, 'reservation_reviewed_by') ||
      isMissingColumnError(transactionQuery.error, 'reservation_review_notes') ||
      isMissingColumnError(transactionQuery.error, 'onboarding_status') ||
      isMissingColumnError(transactionQuery.error, 'onboarding_completed_at') ||
      isMissingColumnError(transactionQuery.error, 'external_onboarding_submitted_at'))
  ) {
    transactionQuery = await client
      .from('transactions')
      .select(
        'id, development_id, unit_id, buyer_id, sales_price, finance_type, purchaser_type, stage, current_main_stage, attorney, bond_originator, next_action, comment, updated_at, created_at',
      )
      .eq('id', transactionId)
      .maybeSingle()
  }

  if (transactionQuery.error && isMissingColumnError(transactionQuery.error, 'purchaser_type')) {
    transactionQuery = await client
      .from('transactions')
      .select(
        'id, development_id, unit_id, buyer_id, finance_type, stage, current_main_stage, attorney, bond_originator, next_action, comment, updated_at, created_at',
      )
      .eq('id', transactionId)
      .maybeSingle()
  }

  if (transactionQuery.error) {
    throw transactionQuery.error
  }

  if (!transactionQuery.data) {
    throw new Error('Transaction not found.')
  }

  const transaction = transactionQuery.data
  const [unitQuery, buyerQuery] = await Promise.all([
    client
      .from('units')
      .select('id, development_id, unit_number, phase, status, development:developments(id, name)')
      .eq('id', transaction.unit_id)
      .maybeSingle(),
    transaction.buyer_id
      ? client.from('buyers').select('id, name, phone, email').eq('id', transaction.buyer_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])

  if (unitQuery.error) {
    throw unitQuery.error
  }

  if (buyerQuery.error) {
    throw buyerQuery.error
  }

  return {
    transaction,
    unit: unitQuery.data || null,
    buyer: buyerQuery.data || null,
  }
}

export async function fetchClientOnboardingByToken(token) {
  const client = requireOnboardingTokenClient(token)
  const onboarding = await resolveOnboardingTokenContext(client, token)
  const { transaction, unit, buyer } = await resolveTransactionAndContext(client, onboarding.transactionId)
  const formDataRow = await fetchOnboardingFormDataForTransaction(
    client,
    transaction.id,
    transaction.purchaser_type || onboarding.purchaserType,
  )
  const existingFormData = formDataRow?.formData || {}
  const purchaserType = normalizePurchaserType(
    existingFormData.purchaser_type || transaction.purchaser_type || onboarding.purchaserType,
  )
  const financeSnapshot = getOnboardingFinanceSnapshot({ formData: existingFormData, transaction })
  const formConfig = getPersonaFormConfig(purchaserType, { financeType: financeSnapshot.financeType, formData: existingFormData })
  const fundingSources = await fetchTransactionFundingSources(client, transaction.id)

  const requiredDocuments = await ensureTransactionRequiredDocuments(client, {
    transactionId: transaction.id,
    purchaserType,
    financeType: financeSnapshot.financeType,
    reservationRequired: financeSnapshot.reservationRequired,
    cashAmount: financeSnapshot.cashAmount,
    bondAmount: financeSnapshot.bondAmount,
    formData: existingFormData,
  }, { sync: false })

  const uploadedDocuments = await loadSharedDocuments(client, {
    transactionIds: [transaction.id],
    viewer: 'client',
  })
  const checklistResult = buildRequiredChecklistFromRows(requiredDocuments, uploadedDocuments)

  const mergedFormData = {
    ...existingFormData,
    purchaser_type: purchaserType,
    purchase_finance_type: financeSnapshot.financeType,
    purchase_price:
      existingFormData.purchase_price ??
      (financeSnapshot.purchasePrice !== null && financeSnapshot.purchasePrice !== undefined
        ? String(financeSnapshot.purchasePrice)
        : ''),
    cash_amount:
      existingFormData.cash_amount ??
      (financeSnapshot.cashAmount !== null && financeSnapshot.cashAmount !== undefined ? String(financeSnapshot.cashAmount) : ''),
    bond_amount:
      existingFormData.bond_amount ??
      (financeSnapshot.bondAmount !== null && financeSnapshot.bondAmount !== undefined ? String(financeSnapshot.bondAmount) : ''),
    deposit_amount:
      existingFormData.deposit_amount ??
      (financeSnapshot.depositAmount !== null && financeSnapshot.depositAmount !== undefined
        ? String(financeSnapshot.depositAmount)
        : ''),
    reservation_required: existingFormData.reservation_required ?? financeSnapshot.reservationRequired,
    reservation_amount:
      existingFormData.reservation_amount ??
      (financeSnapshot.reservationAmount !== null && financeSnapshot.reservationAmount !== undefined
        ? String(financeSnapshot.reservationAmount)
        : ''),
    reservation_status: existingFormData.reservation_status ?? financeSnapshot.reservationStatus,
    reservation_paid_date: existingFormData.reservation_paid_date ?? financeSnapshot.reservationPaidDate ?? '',
    funding_sources: existingFormData.funding_sources || fundingSources || [],
  }
  const derivedConfiguration = deriveOnboardingConfiguration(mergedFormData, { transaction })
  const stepDefinitions = getOnboardingStepDefinitions(mergedFormData, { transaction })

  return {
    onboarding,
    transaction,
    unit,
    buyer,
    purchaserType,
    purchaserTypeLabel: getPurchaserTypeLabel(purchaserType),
    formConfig,
    stepDefinitions,
    formData: mergedFormData,
    derivedConfiguration,
    requiredDocuments: checklistResult.checklist.map((item) => {
      const row = requiredDocuments.find((requiredItem) => requiredItem.key === item.key)
      return {
        key: item.key,
        label: item.label,
        group: row?.group || 'General',
        description: row?.description || '',
        requirementLevel: row?.requirementLevel || item.requirementLevel || 'required',
        complete: item.complete,
        uploadedDocumentId: row?.uploadedDocumentId || null,
      }
    }),
    summary: checklistResult.summary,
    uploadedDocuments,
    fundingSources,
  }
}

async function notifyTransactionOwnerOnOnboardingSubmitted(
  client,
  {
    transactionId,
    buyerName = '',
    developmentName = '',
    unitLabel = '',
    transactionReference = '',
  } = {},
) {
  if (!transactionId) {
    return null
  }

  let ownerQuery = await client
    .from('transactions')
    .select('id, owner_user_id, transaction_reference')
    .eq('id', transactionId)
    .maybeSingle()

  if (
    ownerQuery.error &&
    (isMissingColumnError(ownerQuery.error, 'owner_user_id') ||
      isMissingColumnError(ownerQuery.error, 'transaction_reference'))
  ) {
    ownerQuery = await client.from('transactions').select('id').eq('id', transactionId).maybeSingle()
  }

  if (ownerQuery.error) {
    if (isMissingSchemaError(ownerQuery.error)) {
      return null
    }
    throw ownerQuery.error
  }

  const ownerUserId = normalizeNullableText(ownerQuery.data?.owner_user_id)
  if (!ownerUserId) {
    return null
  }

  const resolvedBuyerName = normalizeTextValue(buyerName) || 'Client'
  const propertyLine = [normalizeTextValue(developmentName), normalizeTextValue(unitLabel)].filter(Boolean).join(' ')
  const resolvedTransactionReference =
    normalizeTextValue(transactionReference) || normalizeTextValue(ownerQuery.data?.transaction_reference)

  const message = propertyLine
    ? `Client ${resolvedBuyerName} buying ${propertyLine} has completed the onboarding. Prepare their OTP and upload it to the transaction.`
    : `Client ${resolvedBuyerName} has completed the onboarding. Prepare their OTP and upload it to the transaction.`

  return createTransactionNotificationIfPossible(client, {
    transactionId,
    userId: ownerUserId,
    roleType: null,
    notificationType: 'readiness_updated',
    title: 'Onboarding Completed',
    message,
    eventType: 'TransactionUpdated',
    eventData: {
      trigger: 'client_onboarding_submitted',
      actionRequired: 'prepare_otp_and_upload',
      buyerName: resolvedBuyerName,
      developmentName: normalizeTextValue(developmentName) || null,
      unitLabel: normalizeTextValue(unitLabel) || null,
      transactionReference: resolvedTransactionReference || null,
    },
    dedupeKey: `onboarding-completed:${transactionId}:${ownerUserId}`,
  })
}

async function upsertClientOnboardingForm({ token, formData = {}, submit = false }) {
  const client = requireOnboardingTokenClient(token)
  const onboarding = await resolveOnboardingTokenContext(client, token)
  const { transaction, unit, buyer } = await resolveTransactionAndContext(client, onboarding.transactionId)
  const purchaserType = normalizePurchaserType(formData.purchaser_type || transaction.purchaser_type || onboarding.purchaserType)
  const normalizedFormData = {
    ...formData,
    purchaser_type: purchaserType,
  }
  let fundingSources = getOnboardingFundingSources(normalizedFormData)
  if (submit) {
    validateOnboardingSubmission(normalizedFormData, { transaction })
    validateOnboardingFinanceAndReservation({ formData: normalizedFormData, transaction })
    fundingSources = validateOnboardingFundingSources({
      formData: normalizedFormData,
      transaction,
      submit: true,
    })
  }

  const now = new Date().toISOString()
  const nextStatus = submit ? 'Submitted' : onboarding.status === 'Not Started' ? 'In Progress' : onboarding.status
  const lifecycleStatus = submit ? 'client_onboarding_complete' : 'awaiting_client_onboarding'

  const { error: formDataError } = await client.from('onboarding_form_data').upsert(
    {
      transaction_id: transaction.id,
      purchaser_type: purchaserType,
      form_data: {
        ...normalizedFormData,
        funding_sources: fundingSources,
      },
      updated_at: now,
    },
    { onConflict: 'transaction_id' },
  )

  if (formDataError) {
    if (isMissingTableError(formDataError, 'onboarding_form_data')) {
      throw new Error('Onboarding form storage is not set up yet. Run sql/schema.sql first.')
    }

    throw formDataError
  }

  await syncOnboardingTransactionFinanceSnapshot(client, {
    transaction,
    formData: normalizedFormData,
    purchaserType,
    onboardingStatus: lifecycleStatus,
    onboardingCompletedAt: submit ? now : null,
    externalOnboardingSubmittedAt: submit ? now : null,
  })

  await replaceTransactionFundingSources(client, {
    transactionId: transaction.id,
    fundingSources,
  })

  const financeSnapshot = getOnboardingFinanceSnapshot({
    formData: normalizedFormData,
    transaction,
  })

  await ensureTransactionRequiredDocuments(client, {
    transactionId: transaction.id,
    purchaserType,
    financeType: financeSnapshot.financeType,
    reservationRequired: financeSnapshot.reservationRequired,
    cashAmount: financeSnapshot.cashAmount,
    bondAmount: financeSnapshot.bondAmount,
    formData: normalizedFormData,
  })

  const { data: updatedOnboarding, error: onboardingUpdateError } = await client
    .from('transaction_onboarding')
    .update({
      status: nextStatus,
      purchaser_type: purchaserType,
      submitted_at: submit ? now : onboarding.submittedAt,
      updated_at: now,
    })
    .eq('id', onboarding.id)
    .select('id, transaction_id, token, status, purchaser_type, submitted_at, is_active, created_at, updated_at')
    .single()

  if (onboardingUpdateError) {
    if (isMissingTableError(onboardingUpdateError, 'transaction_onboarding')) {
      throw new Error('Transaction onboarding is not set up yet. Run sql/schema.sql first.')
    }

    throw onboardingUpdateError
  }

  if (submit) {
    const { error: informationSheetUpdateError } = await client
      .from('transaction_required_documents')
      .update({
        is_uploaded: true,
        updated_at: now,
      })
      .eq('transaction_id', transaction.id)
      .eq('document_key', 'information_sheet')

    if (
      informationSheetUpdateError &&
      !isMissingTableError(informationSheetUpdateError, 'transaction_required_documents')
    ) {
      throw informationSheetUpdateError
    }

    await logTransactionEventIfPossible(client, {
      transactionId: transaction.id,
      eventType: 'TransactionUpdated',
      createdByRole: 'client',
      eventData: {
        onboardingStatus: 'client_onboarding_complete',
        purchaserType,
        financeType: financeSnapshot.financeType,
        reservationRequired: financeSnapshot.reservationRequired,
      },
    })

    try {
      const developmentRecord =
        unit?.development && Array.isArray(unit.development)
          ? unit.development[0] || null
          : unit?.development || null
      const developmentName = normalizeTextValue(developmentRecord?.name || '')
      const unitNumber = normalizeTextValue(unit?.unit_number || '')
      const unitLabel = unitNumber ? `Unit ${unitNumber}` : ''

      await notifyTransactionOwnerOnOnboardingSubmitted(client, {
        transactionId: transaction.id,
        buyerName: normalizeTextValue(buyer?.name || ''),
        developmentName,
        unitLabel,
        transactionReference: normalizeTextValue(transaction?.transaction_reference || ''),
      })
    } catch (notificationError) {
      console.warn('Onboarding submitted owner notification failed', notificationError)
    }
  }

  return normalizeOnboardingRow(updatedOnboarding, purchaserType)
}

export async function saveClientOnboardingDraft({ token, formData }) {
  return upsertClientOnboardingForm({
    token,
    formData,
    submit: false,
  })
}

export async function submitClientOnboarding({ token, formData }) {
  return upsertClientOnboardingForm({
    token,
    formData,
    submit: true,
  })
}

async function upsertClientPortalOnboardingForm({ token, formData = {} }) {
  const client = requireClientPortalTokenClient(token)
  const link = await resolveClientPortalLinkByToken(client, token)
  const { transaction } = await resolveTransactionAndContext(client, link.transaction_id)
  const purchaserType = normalizePurchaserType(formData.purchaser_type || transaction.purchaser_type || 'individual')
  const normalizedFormData = {
    ...formData,
    purchaser_type: purchaserType,
  }
  const fundingSources = getOnboardingFundingSources(normalizedFormData)
  const now = new Date().toISOString()

  const { error: formDataError } = await client.from('onboarding_form_data').upsert(
    {
      transaction_id: transaction.id,
      purchaser_type: purchaserType,
      form_data: {
        ...normalizedFormData,
        funding_sources: fundingSources,
      },
      updated_at: now,
    },
    { onConflict: 'transaction_id' },
  )

  if (formDataError) {
    if (isMissingTableError(formDataError, 'onboarding_form_data')) {
      throw new Error('Onboarding form storage is not set up yet. Run sql/schema.sql first.')
    }

    throw formDataError
  }

  await syncOnboardingTransactionFinanceSnapshot(client, {
    transaction,
    formData: normalizedFormData,
    purchaserType,
    onboardingStatus: 'awaiting_client_onboarding',
    onboardingCompletedAt: null,
    externalOnboardingSubmittedAt: null,
  })

  await replaceTransactionFundingSources(client, {
    transactionId: transaction.id,
    fundingSources,
  })

  const financeSnapshot = getOnboardingFinanceSnapshot({
    formData: normalizedFormData,
    transaction,
  })

  await ensureTransactionRequiredDocuments(client, {
    transactionId: transaction.id,
    purchaserType,
    financeType: financeSnapshot.financeType,
    reservationRequired: financeSnapshot.reservationRequired,
    cashAmount: financeSnapshot.cashAmount,
    bondAmount: financeSnapshot.bondAmount,
    formData: normalizedFormData,
  })

  const onboardingRecord = await getOrCreateTransactionOnboardingRecord(
    client,
    {
      transactionId: transaction.id,
      purchaserType,
    },
    { createIfMissing: true },
  )

  if (onboardingRecord?.id) {
    const nextStatus = onboardingRecord.status === 'Not Started' ? 'In Progress' : onboardingRecord.status
    const { error: onboardingUpdateError } = await client
      .from('transaction_onboarding')
      .update({
        status: nextStatus,
        purchaser_type: purchaserType,
        updated_at: now,
      })
      .eq('id', onboardingRecord.id)

    if (onboardingUpdateError && !isMissingTableError(onboardingUpdateError, 'transaction_onboarding')) {
      throw onboardingUpdateError
    }
  }

  return fetchOnboardingFormDataForTransaction(client, transaction.id, purchaserType)
}

export async function saveClientPortalOnboardingDraft({ token, formData }) {
  return upsertClientPortalOnboardingForm({
    token,
    formData,
  })
}

export async function uploadOnboardingRequiredDocument({ token, documentKey, file }) {
  const client = requireOnboardingTokenClient(token)
  const onboarding = await resolveOnboardingTokenContext(client, token)
  const { transaction, buyer } = await resolveTransactionAndContext(client, onboarding.transactionId)
  const formDataRow = await fetchOnboardingFormDataForTransaction(
    client,
    transaction.id,
    transaction.purchaser_type || onboarding.purchaserType,
  )
  const formData = formDataRow?.formData || {}
  const purchaserType = normalizePurchaserType(formData.purchaser_type || transaction.purchaser_type || onboarding.purchaserType)
  const financeSnapshot = getOnboardingFinanceSnapshot({ formData, transaction })
  const requiredDocuments = await ensureTransactionRequiredDocuments(client, {
    transactionId: transaction.id,
    purchaserType,
    financeType: financeSnapshot.financeType,
    reservationRequired: financeSnapshot.reservationRequired,
    cashAmount: financeSnapshot.cashAmount,
    bondAmount: financeSnapshot.bondAmount,
    formData,
  })

  const requiredDocument = requiredDocuments.find((item) => item.key === documentKey)
  if (!requiredDocument) {
    throw new Error('Document type is not required for this purchaser profile.')
  }

  if (!file) {
    throw new Error('Select a file to upload.')
  }

  const safeName = String(file.name || 'document').replace(/[^a-zA-Z0-9.-]/g, '-')
  const filePath = `onboarding/${transaction.id}/${requiredDocument.key}/${Date.now()}-${safeName}`
  const { error: uploadError } = await client.storage.from(DOCUMENTS_BUCKET).upload(filePath, file)
  if (uploadError) {
    throw uploadError
  }

  const baseDocumentPayload = {
    transaction_id: transaction.id,
    name: `${requiredDocument.label} - ${safeName}`,
    file_path: filePath,
    category: requiredDocument.label,
    document_type:
      normalizePortalDocumentType(requiredDocument.portalDocumentType || requiredDocument.key || requiredDocument.label) || 'other',
    visibility_scope: 'shared',
    uploaded_by_user_id: null,
    stage_key: null,
    is_client_visible: true,
    uploaded_by_role: 'client',
    uploaded_by_email: buyer?.email || null,
  }

  let insertResult = await client
    .from('documents')
    .insert(baseDocumentPayload)
    .select('id, transaction_id, name, file_path, category, is_client_visible, created_at')
    .single()

  if (
    insertResult.error &&
    (isMissingColumnError(insertResult.error, 'document_type') ||
      isMissingColumnError(insertResult.error, 'visibility_scope') ||
      isMissingColumnError(insertResult.error, 'uploaded_by_user_id') ||
      isMissingColumnError(insertResult.error, 'stage_key') ||
      isMissingColumnError(insertResult.error, 'uploaded_by_role') ||
      isMissingColumnError(insertResult.error, 'uploaded_by_email'))
  ) {
    insertResult = await client
      .from('documents')
      .insert({
        transaction_id: transaction.id,
        name: `${requiredDocument.label} - ${safeName}`,
        file_path: filePath,
        category: requiredDocument.label,
        is_client_visible: true,
      })
      .select('id, transaction_id, name, file_path, category, is_client_visible, created_at')
      .single()
  }

  if (insertResult.error && isMissingColumnError(insertResult.error, 'is_client_visible')) {
    insertResult = await client
      .from('documents')
      .insert({
        transaction_id: transaction.id,
        name: `${requiredDocument.label} - ${safeName}`,
        file_path: filePath,
        category: requiredDocument.label,
      })
      .select('id, transaction_id, name, file_path, category, created_at')
      .single()
  }

  if (insertResult.error) {
    throw insertResult.error
  }

  const now = new Date().toISOString()
  let { error: requirementUpdateError } = await client
    .from('transaction_required_documents')
    .update({
      is_uploaded: true,
      uploaded_document_id: insertResult.data.id,
      status: 'uploaded',
      uploaded_at: now,
      updated_at: now,
    })
    .eq('transaction_id', transaction.id)
    .eq('document_key', requiredDocument.key)

  if (
    requirementUpdateError &&
    (isMissingColumnError(requirementUpdateError, 'status') ||
      isMissingColumnError(requirementUpdateError, 'uploaded_at'))
  ) {
    const legacyRequirementUpdate = await client
      .from('transaction_required_documents')
      .update({
        is_uploaded: true,
        uploaded_document_id: insertResult.data.id,
        updated_at: now,
      })
      .eq('transaction_id', transaction.id)
      .eq('document_key', requiredDocument.key)
    requirementUpdateError = legacyRequirementUpdate.error
  }

  if (requirementUpdateError && !isMissingTableError(requirementUpdateError, 'transaction_required_documents')) {
    throw requirementUpdateError
  }

  await logTransactionEventIfPossible(client, {
    transactionId: transaction.id,
    eventType: 'DocumentUploaded',
    createdByRole: 'client',
    eventData: {
      documentId: insertResult.data?.id || null,
      documentName: insertResult.data?.name || `${requiredDocument.label} - ${safeName}`,
      category: requiredDocument.label,
      requiredDocumentKey: requiredDocument.key,
      source: 'onboarding',
      visibilityScope: 'shared',
    },
  })

  await runDocumentAutomationIfPossible(client, {
    transactionId: transaction.id,
    documentId: insertResult.data.id,
    documentName: insertResult.data?.name || `${requiredDocument.label} - ${safeName}`,
    category: requiredDocument.label,
    actorRole: 'client',
    actorUserId: null,
    source: 'onboarding_upload',
    requiredDocumentKey: requiredDocument.key,
  })

  return {
    documentId: insertResult.data.id,
    documentKey: requiredDocument.key,
    filePath,
  }
}

export async function updateTransactionRequiredDocumentStatus({
  transactionId,
  documentKey,
  status = 'missing',
  actorRole = 'developer',
  reviewNotes = '',
}) {
  if (!transactionId) {
    throw new Error('Transaction is required.')
  }
  if (!documentKey) {
    throw new Error('Document key is required.')
  }

  const client = requireClient()
  const now = new Date().toISOString()
  const normalizedInputStatus = String(status || '').trim().toLowerCase()
  const normalizedStatus = normalizeRequiredStatus(
    normalizedInputStatus === 'verified' ? 'accepted' : normalizedInputStatus,
    'missing',
  )
  const isUploaded = ['uploaded', 'under_review', 'accepted'].includes(normalizedStatus)
  const normalizedActorRole = normalizeRoleType(actorRole || 'developer')
  const actorProfile = await resolveActiveProfileContext(client)
  const effectiveActorRole = normalizedActorRole || actorProfile.role || 'developer'
  const effectiveActorUserId = actorProfile.userId || null
  let uploadedDocumentId = null

  const requirementLookup = await client
    .from('transaction_required_documents')
    .select('uploaded_document_id')
    .eq('transaction_id', transactionId)
    .eq('document_key', documentKey)
    .maybeSingle()

  if (requirementLookup.error) {
    if (!isMissingTableError(requirementLookup.error, 'transaction_required_documents')) {
      if (!isMissingColumnError(requirementLookup.error, 'uploaded_document_id')) {
        throw requirementLookup.error
      }
    }
  } else {
    uploadedDocumentId = requirementLookup.data?.uploaded_document_id || null
  }

  let updateResult = await client
    .from('transaction_required_documents')
    .update({
      status: normalizedStatus,
      is_uploaded: isUploaded,
      uploaded_at: isUploaded ? now : null,
      verified_at: normalizedStatus === 'accepted' ? now : null,
      rejected_at: normalizedStatus === 'reupload_required' ? now : null,
      updated_at: now,
    })
    .eq('transaction_id', transactionId)
    .eq('document_key', documentKey)

  if (
    updateResult.error &&
    (isMissingColumnError(updateResult.error, 'status') ||
      isMissingColumnError(updateResult.error, 'uploaded_at') ||
      isMissingColumnError(updateResult.error, 'verified_at') ||
      isMissingColumnError(updateResult.error, 'rejected_at'))
  ) {
    updateResult = await client
      .from('transaction_required_documents')
      .update({
        is_uploaded: isUploaded,
        updated_at: now,
      })
      .eq('transaction_id', transactionId)
      .eq('document_key', documentKey)
  }

  if (updateResult.error) {
    if (isMissingTableError(updateResult.error, 'transaction_required_documents')) {
      throw new Error('Required documents are not set up for this transaction yet.')
    }
    throw updateResult.error
  }

  const reservationSync = await updateReservationFromRequiredDocumentStatusIfNeeded(client, {
    transactionId,
    documentKey,
    requiredDocumentStatus: normalizedStatus,
    documentId: uploadedDocumentId,
    actorUserId: effectiveActorUserId,
    reviewNotes,
  })

  await logTransactionEventIfPossible(client, {
    transactionId,
    eventType: 'TransactionUpdated',
    createdBy: effectiveActorUserId,
    createdByRole: effectiveActorRole,
    eventData: {
      source: 'required_document_status_update',
      documentKey,
      status: normalizedStatus,
    },
  })

  if (reservationSync) {
    if (normalizedStatus === 'accepted') {
      await notifyRolesForTransaction(client, {
        transactionId,
        roleTypes: ['client', 'developer', 'agent', 'attorney'],
        title: 'Reservation deposit verified',
        message: 'Proof of payment was reviewed and verified.',
        notificationType: 'document_uploaded',
        eventType: 'TransactionUpdated',
        eventData: {
          source: 'reservation_deposit_review',
          result: 'approved',
        },
        dedupePrefix: `reservation-pop-approved:${transactionId}`,
        excludeUserId: effectiveActorUserId,
      })
    } else if (normalizedStatus === 'reupload_required') {
      await notifyRolesForTransaction(client, {
        transactionId,
        roleTypes: ['client'],
        title: 'Reservation proof needs reupload',
        message: reviewNotes || 'Please upload a clearer proof of payment so the team can verify the reservation deposit.',
        notificationType: 'document_uploaded',
        eventType: 'TransactionUpdated',
        eventData: {
          source: 'reservation_deposit_review',
          result: 'reupload_required',
        },
        dedupePrefix: `reservation-pop-reupload:${transactionId}`,
        excludeUserId: effectiveActorUserId,
      })
    } else if (['uploaded', 'under_review'].includes(normalizedStatus)) {
      await notifyRolesForTransaction(client, {
        transactionId,
        roleTypes: ['developer', 'agent', 'attorney'],
        title: 'Reservation proof uploaded',
        message: 'Proof of payment was uploaded and is awaiting review.',
        notificationType: 'document_uploaded',
        eventType: 'TransactionUpdated',
        eventData: {
          source: 'reservation_deposit_review',
          result: 'uploaded',
        },
        dedupePrefix: `reservation-pop-uploaded:${transactionId}`,
        excludeUserId: effectiveActorUserId,
      })
    }
  }

  return {
    transactionId,
    documentKey,
    status: normalizedStatus,
    updatedAt: now,
  }
}

export async function updateOtpDocumentWorkflowState({
  documentId,
  workflowState = OTP_DOCUMENT_TYPES.pendingApproval,
  isClientVisible = null,
}) {
  if (!documentId) {
    throw new Error('Document is required.')
  }

  const client = requireClient()
  const activeProfile = await resolveActiveProfileContext(client)
  const normalizedType = normalizeOtpDocumentType(workflowState) || OTP_DOCUMENT_TYPES.pendingApproval
  const categoryByState = {
    [OTP_DOCUMENT_TYPES.generated]: 'Offer to Purchase (OTP) · Generated',
    [OTP_DOCUMENT_TYPES.pendingApproval]: 'Offer to Purchase (OTP) · Pending Approval',
    [OTP_DOCUMENT_TYPES.approved]: 'Offer to Purchase (OTP) · Approved',
    [OTP_DOCUMENT_TYPES.sentToClient]: 'Offer to Purchase (OTP) · Sent to Client',
    [OTP_DOCUMENT_TYPES.signedReuploaded]: 'Signed OTP',
  }
  const visibilityScope =
    typeof isClientVisible === 'boolean' ? (isClientVisible ? 'shared' : 'internal') : null

  const payload = {
    category: categoryByState[normalizedType] || 'Offer to Purchase (OTP)',
    document_type: normalizedType,
  }

  if (typeof isClientVisible === 'boolean') {
    payload.is_client_visible = isClientVisible
    payload.visibility_scope = visibilityScope
  }

  let updateQuery = await client
    .from('documents')
    .update(payload)
    .eq('id', documentId)
    .select(
      'id, transaction_id, name, category, document_type, stage_key, visibility_scope, is_client_visible, created_at',
    )
    .single()

  if (
    updateQuery.error &&
    (isMissingColumnError(updateQuery.error, 'document_type') ||
      isMissingColumnError(updateQuery.error, 'visibility_scope') ||
      isMissingColumnError(updateQuery.error, 'is_client_visible') ||
      isMissingColumnError(updateQuery.error, 'stage_key'))
  ) {
    const fallbackPayload = {}
    fallbackPayload.category = categoryByState[normalizedType] || 'Offer to Purchase (OTP)'
    if (typeof isClientVisible === 'boolean') {
      fallbackPayload.is_client_visible = isClientVisible
    }

    if (Object.keys(fallbackPayload).length) {
      updateQuery = await client
        .from('documents')
        .update(fallbackPayload)
        .eq('id', documentId)
        .select('id, transaction_id, name, category, is_client_visible, created_at')
        .single()
    }
  }

  if (updateQuery.error) {
    throw updateQuery.error
  }

  await logTransactionEventIfPossible(client, {
    transactionId: updateQuery.data?.transaction_id || null,
    eventType: 'DocumentVisibilityChanged',
    createdBy: activeProfile.userId || null,
    createdByRole: activeProfile.role || null,
    eventData: {
      source: 'otp_workflow',
      documentId: updateQuery.data?.id || documentId,
      workflowState: normalizedType,
      isClientVisible:
        typeof updateQuery.data?.is_client_visible === 'boolean'
          ? updateQuery.data.is_client_visible
          : typeof isClientVisible === 'boolean'
            ? isClientVisible
            : null,
    },
  })

  return updateQuery.data
}

export async function updateDocumentClientVisibility(documentId, isClientVisible) {
  const client = requireClient()
  const visibilityScope = isClientVisible ? 'shared' : 'internal'

  let query = await client
    .from('documents')
    .update({
      is_client_visible: Boolean(isClientVisible),
      visibility_scope: visibilityScope,
    })
    .eq('id', documentId)
    .select('id, transaction_id, is_client_visible, visibility_scope')
    .single()

  if (query.error && isMissingColumnError(query.error, 'visibility_scope')) {
    query = await client
      .from('documents')
      .update({ is_client_visible: Boolean(isClientVisible) })
      .eq('id', documentId)
      .select('id, transaction_id, is_client_visible')
      .single()
  }

  const { data, error } = query

  if (error) {
    if (error.code === '42703') {
      throw new Error('is_client_visible column is missing. Run sql/schema.sql first.')
    }

    throw error
  }

  await logTransactionEventIfPossible(client, {
    transactionId: data?.transaction_id || null,
    eventType: 'DocumentVisibilityChanged',
    eventData: {
      documentId: data?.id || documentId,
      isClientVisible: Boolean(data?.is_client_visible ?? isClientVisible),
      visibilityScope: data?.visibility_scope || visibilityScope,
    },
  })

  return data
}

export async function archiveTransactionDocument(documentId) {
  const client = requireClient()
  if (!documentId) {
    throw new Error('Document id is required.')
  }

  const lookup = await client.from('documents').select('id, transaction_id, category').eq('id', documentId).maybeSingle()
  if (lookup.error) {
    throw lookup.error
  }

  if (!lookup.data) {
    throw new Error('Document not found.')
  }

  const now = new Date().toISOString()
  let updateResult = await client
    .from('documents')
    .update({
      archived_at: now,
      visibility_scope: 'internal',
      is_client_visible: false,
      updated_at: now,
    })
    .eq('id', documentId)
    .select('id, transaction_id, archived_at, visibility_scope, is_client_visible')
    .single()

  if (
    updateResult.error &&
    (isMissingColumnError(updateResult.error, 'archived_at') ||
      isMissingColumnError(updateResult.error, 'visibility_scope') ||
      isMissingColumnError(updateResult.error, 'is_client_visible') ||
      isMissingColumnError(updateResult.error, 'updated_at'))
  ) {
    const fallbackPayload = {
      visibility_scope: 'internal',
      is_client_visible: false,
      category: `Archived • ${lookup.data.category || 'General'}`,
    }

    updateResult = await client
      .from('documents')
      .update(fallbackPayload)
      .eq('id', documentId)
      .select('id, transaction_id, visibility_scope, is_client_visible, category')
      .single()

    if (updateResult.error && isMissingColumnError(updateResult.error, 'visibility_scope')) {
      updateResult = await client
        .from('documents')
        .update({
          category: `Archived • ${lookup.data.category || 'General'}`,
        })
        .eq('id', documentId)
        .select('id, transaction_id, category')
        .single()
    }
  }

  if (updateResult.error) {
    throw updateResult.error
  }

  await logTransactionEventIfPossible(client, {
    transactionId: updateResult.data?.transaction_id || lookup.data.transaction_id || null,
    eventType: 'DocumentUpdated',
    eventData: {
      documentId,
      action: 'archived',
      archivedAt: now,
    },
  })

  return {
    id: updateResult.data?.id || documentId,
    transactionId: updateResult.data?.transaction_id || lookup.data.transaction_id || null,
    archivedAt: updateResult.data?.archived_at || now,
  }
}

export async function updateClientIssueStatus(issueId, status) {
  const client = requireClient()

  if (!CLIENT_ISSUE_STATUSES.includes(status)) {
    throw new Error('Invalid issue status.')
  }

  const { data, error } = await client
    .from('client_issues')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', issueId)
    .select('id, status, updated_at')
    .single()

  if (error) {
    throw error
  }

  return data
}

export async function signOffClientIssue(issueId, signedOffBy) {
  const client = requireClient()
  const signedOffAt = new Date().toISOString()

  let result = await client
    .from('client_issues')
    .update({ signed_off_by: signedOffBy || null, signed_off_at: signedOffAt })
    .eq('id', issueId)
    .select('id, signed_off_by, signed_off_at')
    .single()

  if (
    result.error &&
    (isMissingColumnError(result.error, 'signed_off_by') || isMissingColumnError(result.error, 'signed_off_at'))
  ) {
    result = await client
      .from('client_issues')
      .update({ updated_at: signedOffAt })
      .eq('id', issueId)
      .select('id')
      .single()
  }

  if (result.error) {
    throw result.error
  }

  return {
    id: result.data?.id || issueId,
    signed_off_by: signedOffBy || null,
    signed_off_at: signedOffAt,
  }
}

export async function fetchDeveloperSnagsData() {
  const client = requireClient()

  const { data: issuesData, error: issuesError } = await queryClientIssues(client)

  if (issuesError && issuesError.code !== '42P01') {
    throw issuesError
  }

  const issues = issuesData || []
  if (!issues.length) {
    return []
  }

  const developmentIds = [...new Set(issues.map((item) => item.development_id).filter(Boolean))]
  const unitIds = [...new Set(issues.map((item) => item.unit_id).filter(Boolean))]
  const transactionIds = [...new Set(issues.map((item) => item.transaction_id).filter(Boolean))]
  const buyerIds = [...new Set(issues.map((item) => item.buyer_id).filter(Boolean))]

  const [developmentsResult, unitsResult, transactionsResult, buyersResult] = await Promise.all([
    developmentIds.length
      ? client.from('developments').select('id, name, location').in('id', developmentIds)
      : Promise.resolve({ data: [], error: null }),
    unitIds.length
      ? client.from('units').select('id, unit_number, price, list_price').in('id', unitIds)
      : Promise.resolve({ data: [], error: null }),
    transactionIds.length
      ? client.from('transactions').select('id, unit_id, buyer_id, finance_type').in('id', transactionIds)
      : Promise.resolve({ data: [], error: null }),
    buyerIds.length ? client.from('buyers').select('id, name, email, phone').in('id', buyerIds) : Promise.resolve({ data: [], error: null }),
  ])

  if (developmentsResult.error) throw developmentsResult.error
  if (unitsResult.error) throw unitsResult.error
  if (transactionsResult.error) throw transactionsResult.error
  if (buyersResult.error) throw buyersResult.error

  const developmentMap = new Map((developmentsResult.data || []).map((item) => [String(item.id), item]))
  const unitMap = new Map((unitsResult.data || []).map((item) => [String(item.id), item]))
  const transactionMap = new Map((transactionsResult.data || []).map((item) => [String(item.id), item]))
  const buyerMap = new Map((buyersResult.data || []).map((item) => [String(item.id), item]))

  return Promise.all(
    issues.map(async (issue) => {
      const development = issue.development_id ? developmentMap.get(String(issue.development_id)) || null : null
      const unit = issue.unit_id ? unitMap.get(String(issue.unit_id)) || null : null
      const transaction = issue.transaction_id ? transactionMap.get(String(issue.transaction_id)) || null : null
      const buyer = issue.buyer_id ? buyerMap.get(String(issue.buyer_id)) || null : null

      return {
        ...issue,
        reference: `SNAG-${String(issue.id).slice(0, 8).toUpperCase()}`,
        development,
        unit,
        transaction,
        buyer,
        photo_url: issue.photo_path ? await getSignedUrl(issue.photo_path) : null,
      }
    }),
  )
}

export async function updateAlterationRequestStatus(requestId, status) {
  const client = requireClient()

  if (!ALTERATION_REQUEST_STATUSES.includes(status)) {
    throw new Error('Invalid alteration request status.')
  }

  const { data, error } = await client
    .from('alteration_requests')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', requestId)
    .select('id, status, updated_at')
    .single()

  if (error) {
    throw error
  }

  return data
}

export async function submitClientPortalComment({ token, commentText }) {
  const client = requireClientPortalTokenClient(token)
  const link = await resolveClientPortalLinkByToken(client, token)

  if (!link?.transaction_id) {
    throw new Error('Client portal link is missing a transaction.')
  }

  const { transaction, buyer } = await resolveTransactionAndContext(client, link.transaction_id)
  const normalizedText = String(commentText || '').trim()

  if (!normalizedText) {
    throw new Error('Please enter a comment before posting.')
  }

  return addTransactionDiscussionComment({
    transactionId: transaction.id,
    unitId: transaction.unit_id || link.unit_id || null,
    authorName: buyer?.name || 'Client',
    authorRole: 'client',
    commentText: normalizedText,
    client,
  })
}

export async function fetchClientPortalByToken(token) {
  const client = requireClientPortalTokenClient(token)
  const link = await resolveClientPortalLinkByToken(client, token)
  const settings = await ensureDevelopmentSettings(client, link.development_id, { createIfMissing: false })

  if (!settings.client_portal_enabled) {
    throw new Error('Client portal is currently disabled for this development.')
  }

  let transactionQuery = await client
    .from('transactions')
    .select(
      'id, development_id, unit_id, buyer_id, sales_price, purchase_price, finance_type, cash_amount, bond_amount, deposit_amount, reservation_required, reservation_amount, reservation_status, reservation_paid_date, reservation_payment_details, reservation_requested_at, reservation_email_sent_at, reservation_proof_document, onboarding_status, purchaser_type, stage, current_main_stage, current_sub_stage_summary, attorney, bond_originator, next_action, updated_at, created_at',
    )
    .eq('id', link.transaction_id)
    .maybeSingle()

  if (
    transactionQuery.error &&
    (isMissingColumnError(transactionQuery.error, 'development_id') ||
      isMissingColumnError(transactionQuery.error, 'current_main_stage') ||
      isMissingColumnError(transactionQuery.error, 'current_sub_stage_summary') ||
      isMissingColumnError(transactionQuery.error, 'purchase_price') ||
      isMissingColumnError(transactionQuery.error, 'cash_amount') ||
      isMissingColumnError(transactionQuery.error, 'bond_amount') ||
      isMissingColumnError(transactionQuery.error, 'deposit_amount') ||
      isMissingColumnError(transactionQuery.error, 'reservation_required') ||
      isMissingColumnError(transactionQuery.error, 'reservation_amount') ||
      isMissingColumnError(transactionQuery.error, 'reservation_status') ||
      isMissingColumnError(transactionQuery.error, 'reservation_paid_date') ||
      isMissingColumnError(transactionQuery.error, 'reservation_payment_details') ||
      isMissingColumnError(transactionQuery.error, 'reservation_requested_at') ||
      isMissingColumnError(transactionQuery.error, 'reservation_email_sent_at') ||
      isMissingColumnError(transactionQuery.error, 'reservation_proof_document') ||
      isMissingColumnError(transactionQuery.error, 'onboarding_status') ||
      isMissingColumnError(transactionQuery.error, 'purchaser_type'))
  ) {
    transactionQuery = await client
      .from('transactions')
      .select('id, unit_id, buyer_id, sales_price, finance_type, purchaser_type, stage, attorney, bond_originator, next_action, updated_at, created_at')
      .eq('id', link.transaction_id)
      .maybeSingle()
  }

  const { data: transaction, error: transactionError } = transactionQuery

  if (transactionError) {
    throw transactionError
  }

  if (!transaction) {
    throw new Error('Transaction not found.')
  }

  const { data: unit, error: unitError } = await client
    .from('units')
    .select('id, development_id, unit_number, phase, status, development:developments(id, name)')
    .eq('id', transaction.unit_id)
    .maybeSingle()

  if (unitError) {
    throw unitError
  }

  let buyer = null
  if (transaction.buyer_id) {
    const { data: buyerData, error: buyerError } = await client
      .from('buyers')
      .select('id, name, phone, email')
      .eq('id', transaction.buyer_id)
      .maybeSingle()

    if (buyerError) {
      throw buyerError
    }

    buyer = buyerData
  }

  const documents = await loadSharedDocuments(client, {
    transactionIds: [transaction.id],
    viewer: 'client',
  })
  let transactionDiscussion = []
  let transactionSubprocesses = []
  let transactionEvents = []
  try {
    transactionDiscussion = await fetchTransactionDiscussion(transaction.id, {
      client,
      unitId: link.unit_id,
      viewer: 'client',
    })
  } catch (discussionError) {
    if (!isMissingSchemaError(discussionError)) {
      throw discussionError
    }
  }
  try {
    transactionSubprocesses = await ensureTransactionSubprocesses(client, transaction.id, { createIfMissing: false })
  } catch (subprocessError) {
    if (!isMissingSchemaError(subprocessError)) {
      throw subprocessError
    }
  }
  try {
    transactionEvents = await fetchTransactionEvents(transaction.id, { limit: 250, client })
  } catch (transactionEventsError) {
    if (!isMissingSchemaError(transactionEventsError)) {
      throw transactionEventsError
    }
  }
  const handover = await fetchTransactionHandover(client, {
    developmentId: link.development_id,
    unitId: link.unit_id,
    transaction,
    buyer,
  })
  const occupationalRent = getOccupationalRentRecordFromEvents(
    transactionEvents,
    getDefaultOccupationalRentRecord({
      developmentId: link.development_id,
      unitId: link.unit_id,
      transaction,
      buyer,
    }),
  )
  const homeownerDocuments = mapHomeownerDocuments(documents)
  const homeownerDashboardEnabled = handover.status === 'completed'

  let issues = []
  if (settings.snag_reporting_enabled) {
    const { data: clientIssuesData, error: clientIssuesError } = await client
      .from('client_issues')
      .select('id, category, description, location, priority, photo_path, status, created_at, updated_at')
      .eq('unit_id', transaction.unit_id)
      .order('created_at', { ascending: false })

    if (clientIssuesError && clientIssuesError.code !== '42P01') {
      throw clientIssuesError
    }

    issues = await Promise.all(
      (clientIssuesData || []).map(async (item) => ({
        ...item,
        photo_url: item.photo_path ? await getSignedUrl(item.photo_path) : null,
      })),
    )
  }

  let alterations = []
  if (settings.alteration_requests_enabled) {
    const { data: alterationData, error: alterationError } = await client
      .from('alteration_requests')
      .select(
        'id, title, category, description, budget_range, preferred_timing, reference_image_path, amount_inc_vat, invoice_path, proof_of_payment_path, status, created_at, updated_at',
      )
      .eq('unit_id', transaction.unit_id)
      .order('created_at', { ascending: false })

    if (alterationError && alterationError.code !== '42P01') {
      throw alterationError
    }

    alterations = await Promise.all(
      (alterationData || []).map(async (item) => ({
        ...item,
        reference_image_url: item.reference_image_path ? await getSignedUrl(item.reference_image_path) : null,
        invoice_url: item.invoice_path ? await getSignedUrl(item.invoice_path) : null,
        proof_url: item.proof_of_payment_path ? await getSignedUrl(item.proof_of_payment_path) : null,
      })),
    )
  }

  let reviews = []
  if (settings.service_reviews_enabled) {
    const { data: reviewsData, error: reviewsError } = await client
      .from('service_reviews')
      .select('id, rating, review_text, positives, improvements, allow_marketing_use, created_at, updated_at')
      .eq('unit_id', transaction.unit_id)
      .order('created_at', { ascending: false })

    if (reviewsError && reviewsError.code !== '42P01') {
      throw reviewsError
    }

    reviews = reviewsData || []
  }

  const trustInvestmentForm = await fetchTrustInvestmentFormForTransaction(client, {
    developmentId: link.development_id,
    unitId: link.unit_id,
    transaction,
    buyer,
  })

  const onboarding = await getOrCreateTransactionOnboardingRecord(client, {
    transactionId: transaction.id,
    purchaserType: transaction.purchaser_type,
  }, { createIfMissing: false })
  const onboardingFormData = await fetchOnboardingFormDataForTransaction(
    client,
    transaction.id,
    transaction.purchaser_type,
  )
  const onboardingFormValues = onboardingFormData?.formData || {}
  const resolvedPurchaserType = normalizePurchaserType(
    onboardingFormValues.purchaser_type || transaction.purchaser_type,
  )
  const financeSnapshot = getOnboardingFinanceSnapshot({
    formData: onboardingFormValues,
    transaction,
  })
  const fundingSources = await fetchTransactionFundingSources(client, transaction.id)
  const requiredDocuments = await ensureTransactionRequiredDocuments(client, {
    transactionId: transaction.id,
    purchaserType: resolvedPurchaserType,
    financeType: financeSnapshot.financeType,
    reservationRequired: financeSnapshot.reservationRequired,
    cashAmount: financeSnapshot.cashAmount,
    bondAmount: financeSnapshot.bondAmount,
    formData: onboardingFormValues,
  }, { sync: false })
  const requiredDocumentChecklistResult = buildRequiredChecklistFromRows(requiredDocuments, documents)
  const requiredDocumentSummary = requiredDocumentChecklistResult.summary
  const onboardingDerivedConfiguration = deriveOnboardingConfiguration(
    {
      ...onboardingFormValues,
      funding_sources: onboardingFormValues.funding_sources || fundingSources,
    },
    { transaction },
  )

  const stage = normalizeStage(transaction.stage, unit?.status)
  const mainStage = normalizeMainStage(transaction.current_main_stage, stage)
  const reviewEligible = REVIEW_ELIGIBLE_STAGES.has(stage)

  return {
    link,
    settings,
    unit,
    transaction,
    buyer,
    stage,
    mainStage,
    lastUpdated: transaction.updated_at || transaction.created_at,
    documents,
    discussion: transactionDiscussion,
    issues,
    alterations,
    reviews,
    trustInvestmentForm,
    handover,
    occupationalRent,
    homeownerDocuments,
    homeownerDashboardEnabled,
    onboarding,
    onboardingFormData,
    onboardingDerivedConfiguration,
    purchaserType: resolvedPurchaserType,
    purchaserTypeLabel: getPurchaserTypeLabel(resolvedPurchaserType),
    subprocesses: transactionSubprocesses,
    requiredDocuments,
    requiredDocumentChecklist: requiredDocumentChecklistResult.checklist,
    requiredDocumentSummary,
    fundingSources,
    featureAvailability: {
      snag: settings.snag_reporting_enabled,
      alteration: settings.alteration_requests_enabled,
      review: settings.service_reviews_enabled && reviewEligible,
      reviewLockedByStage: settings.service_reviews_enabled && !reviewEligible,
      homeownerDashboard: homeownerDashboardEnabled,
    },
  }
}

async function upsertTrustInvestmentFormByToken({ token, form = {}, submit = false }) {
  const client = requireClientPortalTokenClient(token)
  const link = await resolveClientPortalLinkByToken(client, token)
  const settings = await ensureDevelopmentSettings(client, link.development_id)

  if (!settings.client_portal_enabled) {
    throw new Error('Client portal is currently disabled for this development.')
  }

  const defaults = getDefaultTrustInvestmentForm({
    developmentId: link.development_id,
    unitId: link.unit_id,
    transaction: {
      id: link.transaction_id,
      buyer_id: link.buyer_id,
    },
    buyer: null,
  })

  const { data: existing, error: existingError } = await client
    .from('trust_investment_forms')
    .select(TRUST_INVESTMENT_FORM_SELECT)
    .eq('transaction_id', link.transaction_id)
    .maybeSingle()

  if (existingError) {
    if (isMissingTableError(existingError, 'trust_investment_forms')) {
      throw new Error('Trust investment forms are not set up yet. Run sql/schema.sql first.')
    }

    throw existingError
  }

  const normalizedForm = normalizeTrustInvestmentFormRow(
    {
      ...existing,
      purchaser_full_name: form.purchaserFullName ?? existing?.purchaser_full_name,
      purchaser_identity_or_registration_number:
        form.purchaserIdentityOrRegistrationNumber ?? existing?.purchaser_identity_or_registration_number,
      full_name: form.fullName ?? existing?.full_name,
      identity_or_registration_number: form.identityOrRegistrationNumber ?? existing?.identity_or_registration_number,
      income_tax_number: form.incomeTaxNumber ?? existing?.income_tax_number,
      south_african_resident:
        form.southAfricanResident ?? (existing ? existing.south_african_resident : defaults.southAfricanResident),
      physical_address: form.physicalAddress ?? existing?.physical_address,
      postal_address: form.postalAddress ?? existing?.postal_address,
      telephone_number: form.telephoneNumber ?? existing?.telephone_number,
      fax_number: form.faxNumber ?? existing?.fax_number,
      balance_to: form.balanceTo ?? existing?.balance_to,
      bank_name: form.bankName ?? existing?.bank_name,
      account_number: form.accountNumber ?? existing?.account_number,
      branch_number: form.branchNumber ?? existing?.branch_number,
      source_of_funds: form.sourceOfFunds ?? existing?.source_of_funds,
      declaration_accepted: form.declarationAccepted ?? existing?.declaration_accepted,
      signature_name: form.signatureName ?? existing?.signature_name,
      signed_date: form.signedDate ?? existing?.signed_date,
      attorney_firm_name: form.attorneyFirmName ?? existing?.attorney_firm_name,
      status: existing?.status || defaults.status,
    },
    defaults,
  )

  if (submit) {
    validateTrustInvestmentFormForSubmission(normalizedForm)
  }

  const nowIso = new Date().toISOString()
  const nowDate = nowIso.slice(0, 10)
  const existingStatus = TRUST_INVESTMENT_FORM_STATUSES.includes(existing?.status) ? existing.status : 'Not Started'
  const nextStatus = submit
    ? 'Submitted'
    : ['Reviewed', 'Approved'].includes(existingStatus)
      ? existingStatus
      : 'In Progress'

  const payload = {
    development_id: link.development_id,
    unit_id: link.unit_id,
    transaction_id: link.transaction_id,
    buyer_id: link.buyer_id || null,
    attorney_firm_name: normalizeNullableText(normalizedForm.attorneyFirmName),
    purchaser_full_name: normalizeNullableText(normalizedForm.purchaserFullName),
    purchaser_identity_or_registration_number: normalizeNullableText(
      normalizedForm.purchaserIdentityOrRegistrationNumber,
    ),
    full_name: normalizeNullableText(normalizedForm.fullName),
    identity_or_registration_number: normalizeNullableText(normalizedForm.identityOrRegistrationNumber),
    income_tax_number: normalizeNullableText(normalizedForm.incomeTaxNumber),
    south_african_resident: normalizeNullableBoolean(normalizedForm.southAfricanResident),
    physical_address: normalizeNullableText(normalizedForm.physicalAddress),
    postal_address: normalizeNullableText(normalizedForm.postalAddress),
    telephone_number: normalizeNullableText(normalizedForm.telephoneNumber),
    fax_number: normalizeNullableText(normalizedForm.faxNumber),
    balance_to: normalizeNullableText(normalizedForm.balanceTo),
    bank_name: normalizeNullableText(normalizedForm.bankName),
    account_number: normalizeNullableText(normalizedForm.accountNumber),
    branch_number: normalizeNullableText(normalizedForm.branchNumber),
    source_of_funds: normalizeNullableText(normalizedForm.sourceOfFunds),
    declaration_accepted: Boolean(normalizedForm.declarationAccepted),
    signature_name: normalizeNullableText(normalizedForm.signatureName),
    signed_date: normalizeOptionalDate(normalizedForm.signedDate) || (submit ? nowDate : null),
    status: nextStatus,
    submitted_at: submit ? nowIso : existing?.submitted_at || null,
  }

  const { data, error } = await client
    .from('trust_investment_forms')
    .upsert(payload, { onConflict: 'transaction_id' })
    .select(TRUST_INVESTMENT_FORM_SELECT)
    .single()

  if (error) {
    if (isMissingTableError(error, 'trust_investment_forms')) {
      throw new Error('Trust investment forms are not set up yet. Run sql/schema.sql first.')
    }

    throw error
  }

  return normalizeTrustInvestmentFormRow(data, defaults)
}

export async function saveTrustInvestmentFormDraft({ token, form }) {
  return upsertTrustInvestmentFormByToken({ token, form, submit: false })
}

export async function submitTrustInvestmentForm({ token, form }) {
  return upsertTrustInvestmentFormByToken({ token, form, submit: true })
}

async function upsertTransactionHandoverByToken({ token, handover = {}, complete = false }) {
  const client = requireClientPortalTokenClient(token)
  const link = await resolveClientPortalLinkByToken(client, token)
  const settings = await ensureDevelopmentSettings(client, link.development_id)

  if (!settings.client_portal_enabled) {
    throw new Error('Client portal is currently disabled for this development.')
  }

  const { data: transaction, error: transactionError } = await client
    .from('transactions')
    .select('id, development_id, unit_id, buyer_id')
    .eq('id', link.transaction_id)
    .maybeSingle()

  if (transactionError) {
    throw transactionError
  }

  const defaults = getDefaultHandoverRecord({
    developmentId: link.development_id,
    unitId: link.unit_id,
    transaction,
    buyer: null,
  })

  const { data: existing, error: existingError } = await client
    .from('transaction_handover')
    .select(TRANSACTION_HANDOVER_SELECT)
    .eq('transaction_id', link.transaction_id)
    .maybeSingle()

  if (existingError) {
    if (isMissingTableError(existingError, 'transaction_handover')) {
      throw new Error('Handover module is not set up yet. Run sql/schema.sql first.')
    }

    throw existingError
  }

  const merged = normalizeHandoverRow(
    {
      ...existing,
      status: handover.status ?? existing?.status ?? defaults.status,
      handover_date: handover.handoverDate ?? existing?.handover_date,
      electricity_meter_reading: handover.electricityMeterReading ?? existing?.electricity_meter_reading,
      water_meter_reading: handover.waterMeterReading ?? existing?.water_meter_reading,
      gas_meter_reading: handover.gasMeterReading ?? existing?.gas_meter_reading,
      keys_handed_over: handover.keysHandedOver ?? existing?.keys_handed_over,
      remote_handed_over: handover.remoteHandedOver ?? existing?.remote_handed_over,
      manuals_handed_over: handover.manualsHandedOver ?? existing?.manuals_handed_over,
      inspection_completed: handover.inspectionCompleted ?? existing?.inspection_completed,
      notes: handover.notes ?? existing?.notes,
      signature_name: handover.signatureName ?? existing?.signature_name,
      signature_signed_at: handover.signatureSignedAt ?? existing?.signature_signed_at,
    },
    defaults,
  )

  if (complete) {
    validateHandoverForCompletion(merged)
  }

  const completedNowIso = new Date().toISOString()
  const payload = {
    transaction_id: link.transaction_id,
    development_id: link.development_id,
    unit_id: link.unit_id,
    buyer_id: link.buyer_id || null,
    status: complete ? 'completed' : merged.status === 'completed' ? 'completed' : 'in_progress',
    handover_date: normalizeOptionalDate(merged.handoverDate) || (complete ? completedNowIso.slice(0, 10) : null),
    electricity_meter_reading: normalizeNullableText(merged.electricityMeterReading),
    water_meter_reading: normalizeNullableText(merged.waterMeterReading),
    gas_meter_reading: normalizeNullableText(merged.gasMeterReading),
    keys_handed_over: Boolean(merged.keysHandedOver),
    remote_handed_over: Boolean(merged.remoteHandedOver),
    manuals_handed_over: Boolean(merged.manualsHandedOver),
    inspection_completed: Boolean(merged.inspectionCompleted),
    notes: normalizeNullableText(merged.notes),
    signature_name: normalizeNullableText(merged.signatureName),
    signature_signed_at: complete ? completedNowIso : merged.signatureSignedAt || null,
  }

  const { data, error } = await client
    .from('transaction_handover')
    .upsert(payload, { onConflict: 'transaction_id' })
    .select(TRANSACTION_HANDOVER_SELECT)
    .single()

  if (error) {
    if (isMissingTableError(error, 'transaction_handover')) {
      throw new Error('Handover module is not set up yet. Run sql/schema.sql first.')
    }

    throw error
  }

  return normalizeHandoverRow(data, defaults)
}

export async function saveClientHandoverDraft({ token, handover }) {
  return upsertTransactionHandoverByToken({
    token,
    handover,
    complete: false,
  })
}

export async function submitClientHandover({ token, handover }) {
  return upsertTransactionHandoverByToken({
    token,
    handover,
    complete: true,
  })
}

export async function upsertTransactionOccupationalRent({ transactionId, occupationalRent = {}, actorRole = null }) {
  if (!transactionId) {
    throw new Error('Transaction is required.')
  }

  const existingEvents = await fetchTransactionEvents(transactionId, { limit: 250 })
  const defaults = getDefaultOccupationalRentRecord({
    transaction: { id: transactionId },
  })
  const existing = getOccupationalRentRecordFromEvents(existingEvents, defaults)
  const merged = normalizeOccupationalRentRecord(
    {
      ...existing,
      ...occupationalRent,
      enabled:
        occupationalRent.enabled === true || occupationalRent.enabled === false
          ? occupationalRent.enabled
          : existing.enabled,
      status:
        occupationalRent.enabled === false
          ? 'not_applicable'
          : occupationalRent.status || existing.status || 'pending_setup',
    },
    defaults,
  )

  const normalizedRecord = {
    enabled: Boolean(merged.enabled),
    status: merged.enabled ? merged.status : 'not_applicable',
    occupationDate: merged.occupationDate || '',
    rentStartDate: merged.rentStartDate || '',
    monthlyAmount: merged.monthlyAmount,
    proRataAmount: merged.proRataAmount,
    nextDueDate: merged.nextDueDate || '',
    waived: Boolean(merged.waived),
    waiverReason: merged.waiverReason || '',
    notes: merged.notes || '',
  }

  await createTransactionEvent({
    transactionId,
    eventType: 'OccupationalRentUpdated',
    eventData: normalizedRecord,
    createdByRole: actorRole || null,
  })

  return normalizeOccupationalRentRecord(normalizedRecord, defaults)
}

export async function uploadClientPortalDocument({
  token,
  file,
  category = 'Client Portal',
  requiredDocumentKey = null,
}) {
  const client = requireClientPortalTokenClient(token)
  const link = await resolveClientPortalLinkByToken(client, token)
  const settings = await ensureDevelopmentSettings(client, link.development_id)

  if (!settings.client_portal_enabled) {
    throw new Error('Client portal is currently disabled for this development.')
  }

  if (!file) {
    throw new Error('A file is required.')
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '-')
  const filePath = `client-portal/${link.transaction_id}/${Date.now()}-${safeName}`
  const normalizedDocumentType =
    normalizePortalDocumentType(requiredDocumentKey || category || file.name) || 'client_portal_document'

  const { error: uploadError } = await client.storage.from(DOCUMENTS_BUCKET).upload(filePath, file)

  if (uploadError) {
    throw uploadError
  }

  let result = await client
    .from('documents')
    .insert({
      transaction_id: link.transaction_id,
      name: file.name,
      file_path: filePath,
      category: category || 'Client Portal',
      document_type: normalizedDocumentType,
      visibility_scope: 'shared',
      uploaded_by_user_id: null,
      stage_key: null,
      is_client_visible: true,
      uploaded_by_role: 'client',
      uploaded_by_email: null,
    })
    .select(
      'id, transaction_id, name, file_path, category, document_type, visibility_scope, stage_key, uploaded_by_user_id, is_client_visible, uploaded_by_role, uploaded_by_email, created_at',
    )
    .single()

  if (
    result.error &&
    (isMissingColumnError(result.error, 'document_type') ||
      isMissingColumnError(result.error, 'visibility_scope') ||
      isMissingColumnError(result.error, 'stage_key') ||
      isMissingColumnError(result.error, 'uploaded_by_user_id') ||
      isMissingColumnError(result.error, 'is_client_visible') ||
      isMissingColumnError(result.error, 'uploaded_by_role') ||
      isMissingColumnError(result.error, 'uploaded_by_email'))
  ) {
    result = await client
      .from('documents')
      .insert({
        transaction_id: link.transaction_id,
        name: file.name,
        file_path: filePath,
        category: category || 'Client Portal',
      })
      .select('id, transaction_id, name, file_path, category, created_at')
      .single()
  }

  if (result.error) {
    throw result.error
  }

  await logTransactionEventIfPossible(client, {
    transactionId: link.transaction_id,
    eventType: 'DocumentUploaded',
    createdByRole: 'client',
    eventData: {
      documentId: result.data.id,
      documentName: result.data.name,
      category: result.data.category || category || 'Client Portal',
      visibilityScope: result.data.visibility_scope || 'shared',
      source: 'client_portal',
    },
  })

  await runDocumentAutomationIfPossible(client, {
    transactionId: link.transaction_id,
    documentId: result.data.id,
    documentName: result.data.name,
    category: result.data.category || category || 'Client Portal',
    requiredDocumentKey,
    actorRole: 'client',
    actorUserId: null,
    source: 'client_portal_upload',
  })

  return {
    ...result.data,
    url: await getSignedUrl(result.data.file_path),
  }
}

export async function upsertTransactionHandover({ transactionId, handover = {} }) {
  const client = requireClient()

  if (!transactionId) {
    throw new Error('Transaction is required.')
  }

  const { data: transaction, error: transactionError } = await client
    .from('transactions')
    .select('id, development_id, unit_id, buyer_id')
    .eq('id', transactionId)
    .maybeSingle()

  if (transactionError) {
    throw transactionError
  }

  if (!transaction) {
    throw new Error('Transaction not found.')
  }

  const defaults = getDefaultHandoverRecord({
    developmentId: transaction.development_id,
    unitId: transaction.unit_id,
    transaction,
    buyer: null,
  })

  const payload = {
    transaction_id: transactionId,
    development_id: transaction.development_id || null,
    unit_id: transaction.unit_id || null,
    buyer_id: transaction.buyer_id || null,
    status: HANDOVER_STATUSES.includes(String(handover.status || '').toLowerCase())
      ? String(handover.status).toLowerCase()
      : 'in_progress',
    handover_date: normalizeOptionalDate(handover.handoverDate),
    electricity_meter_reading: normalizeNullableText(handover.electricityMeterReading),
    water_meter_reading: normalizeNullableText(handover.waterMeterReading),
    gas_meter_reading: normalizeNullableText(handover.gasMeterReading),
    keys_handed_over: Boolean(handover.keysHandedOver),
    remote_handed_over: Boolean(handover.remoteHandedOver),
    manuals_handed_over: Boolean(handover.manualsHandedOver),
    inspection_completed: Boolean(handover.inspectionCompleted),
    notes: normalizeNullableText(handover.notes),
    signature_name: normalizeNullableText(handover.signatureName),
    signature_signed_at: handover.signatureSignedAt || null,
  }

  const { data, error } = await client
    .from('transaction_handover')
    .upsert(payload, { onConflict: 'transaction_id' })
    .select(TRANSACTION_HANDOVER_SELECT)
    .single()

  if (error) {
    if (isMissingTableError(error, 'transaction_handover')) {
      throw new Error('Handover module is not set up yet. Run sql/schema.sql first.')
    }

    throw error
  }

  return normalizeHandoverRow(data, defaults)
}

export async function updateTrustInvestmentFormStatus(formId, status) {
  const client = requireClient()

  if (!formId) {
    throw new Error('Form ID is required.')
  }

  if (!TRUST_INVESTMENT_FORM_STATUSES.includes(status)) {
    throw new Error('Invalid trust form status.')
  }

  const payload = {
    status,
  }

  if (status === 'Reviewed') {
    payload.reviewed_at = new Date().toISOString()
  }

  if (status === 'Approved') {
    payload.approved_at = new Date().toISOString()
  }

  const { data, error } = await client
    .from('trust_investment_forms')
    .update(payload)
    .eq('id', formId)
    .select(TRUST_INVESTMENT_FORM_SELECT)
    .single()

  if (error) {
    if (isMissingTableError(error, 'trust_investment_forms')) {
      throw new Error('Trust investment forms are not set up yet. Run sql/schema.sql first.')
    }

    throw error
  }

  return normalizeTrustInvestmentFormRow(data, getDefaultTrustInvestmentForm())
}

export async function submitClientIssue({
  token,
  category,
  description,
  location = '',
  priority = '',
  photoFile = null,
}) {
  const client = requireClientPortalTokenClient(token)
  const link = await resolveClientPortalLinkByToken(client, token)
  const settings = await ensureDevelopmentSettings(client, link.development_id)

  if (!settings.client_portal_enabled || !settings.snag_reporting_enabled) {
    throw new Error('Issue reporting is not enabled for this development.')
  }

  if (!category?.trim() || !description?.trim()) {
    throw new Error('Category and description are required.')
  }

  const { data: created, error: createError } = await client
    .from('client_issues')
    .insert({
      development_id: link.development_id,
      unit_id: link.unit_id,
      transaction_id: link.transaction_id,
      buyer_id: link.buyer_id || null,
      category: category.trim(),
      description: description.trim(),
      location: location?.trim() || null,
      priority: priority?.trim() || null,
      status: 'Open',
    })
    .select('id, photo_path')
    .single()

  if (createError) {
    throw createError
  }

  if (photoFile) {
    const safeName = photoFile.name.replace(/[^a-zA-Z0-9.-]/g, '-')
    const filePath = `client-issues/${created.id}/${Date.now()}-${safeName}`
    const { error: uploadError } = await client.storage.from(DOCUMENTS_BUCKET).upload(filePath, photoFile)
    if (uploadError) {
      throw uploadError
    }

    const { error: updateIssueError } = await client
      .from('client_issues')
      .update({ photo_path: filePath })
      .eq('id', created.id)

    if (updateIssueError) {
      throw updateIssueError
    }
  }
}

export async function submitAlterationRequest({
  token,
  title,
  category = '',
  description,
  budgetRange = '',
  preferredTiming = '',
  referenceImageFile = null,
}) {
  const client = requireClientPortalTokenClient(token)
  const link = await resolveClientPortalLinkByToken(client, token)
  const settings = await ensureDevelopmentSettings(client, link.development_id)

  if (!settings.client_portal_enabled || !settings.alteration_requests_enabled) {
    throw new Error('Alteration requests are not enabled for this development.')
  }

  if (!title?.trim() || !description?.trim()) {
    throw new Error('Title and description are required.')
  }

  const { data: created, error: createError } = await client
    .from('alteration_requests')
    .insert({
      development_id: link.development_id,
      unit_id: link.unit_id,
      transaction_id: link.transaction_id,
      buyer_id: link.buyer_id || null,
      title: title.trim(),
      category: category?.trim() || null,
      description: description.trim(),
      budget_range: budgetRange?.trim() || null,
      preferred_timing: preferredTiming?.trim() || null,
      status: 'Pending Review',
    })
    .select('id')
    .single()

  if (createError) {
    throw createError
  }

  if (referenceImageFile) {
    const safeName = referenceImageFile.name.replace(/[^a-zA-Z0-9.-]/g, '-')
    const filePath = `alteration-requests/${created.id}/${Date.now()}-${safeName}`
    const { error: uploadError } = await client.storage.from(DOCUMENTS_BUCKET).upload(filePath, referenceImageFile)
    if (uploadError) {
      throw uploadError
    }

    const { error: updateError } = await client
      .from('alteration_requests')
      .update({ reference_image_path: filePath })
      .eq('id', created.id)

    if (updateError) {
      throw updateError
    }
  }
}

async function uploadAlterationAsset({ client, alterationId, field, label, file }) {
  if (!file) {
    return
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '-')
  const filePath = `alteration-requests/${alterationId}/${label}-${Date.now()}-${safeName}`
  const { error: uploadError } = await client.storage.from(DOCUMENTS_BUCKET).upload(filePath, file)
  if (uploadError) {
    throw uploadError
  }

  const { error: updateError } = await client.from('alteration_requests').update({ [field]: filePath }).eq('id', alterationId)
  if (updateError) {
    throw updateError
  }
}

export async function createWorkspaceAlteration({
  developmentId,
  unitId,
  transactionId,
  buyerId = null,
  title,
  description,
  category = '',
  amountIncVat = 0,
  invoiceFile = null,
  proofFile = null,
}) {
  if (!developmentId || !unitId || !transactionId) {
    throw new Error('Development, unit, and transaction context are required.')
  }

  if (!title?.trim() || !description?.trim()) {
    throw new Error('Title and description are required.')
  }

  const client = requireClient()
  const { data: created, error: createError } = await client
    .from('alteration_requests')
    .insert({
      development_id: developmentId,
      unit_id: unitId,
      transaction_id: transactionId,
      buyer_id: buyerId || null,
      title: title.trim(),
      category: category?.trim() || null,
      description: description.trim(),
      amount_inc_vat: Number(amountIncVat) || 0,
      status: 'Pending Review',
    })
    .select('id')
    .single()

  if (createError) {
    throw createError
  }

  await uploadAlterationAsset({
    client,
    alterationId: created.id,
    field: 'invoice_path',
    label: 'invoice',
    file: invoiceFile,
  })

  await uploadAlterationAsset({
    client,
    alterationId: created.id,
    field: 'proof_of_payment_path',
    label: 'proof',
    file: proofFile,
  })

  return created
}

export async function submitServiceReview({
  token,
  rating,
  reviewText = '',
  positives = '',
  improvements = '',
  allowMarketingUse = false,
}) {
  const client = requireClientPortalTokenClient(token)
  const link = await resolveClientPortalLinkByToken(client, token)
  const settings = await ensureDevelopmentSettings(client, link.development_id)

  if (!settings.client_portal_enabled || !settings.service_reviews_enabled) {
    throw new Error('Service reviews are not enabled for this development.')
  }

  const { data: transaction, error: txError } = await client
    .from('transactions')
    .select('id, stage')
    .eq('id', link.transaction_id)
    .maybeSingle()

  if (txError) {
    throw txError
  }

  const stage = normalizeStage(transaction?.stage, null)
  if (!REVIEW_ELIGIBLE_STAGES.has(stage)) {
    throw new Error('Reviews are available once your unit reaches registration/handover stages.')
  }

  const parsedRating = Number(rating)
  if (!Number.isInteger(parsedRating) || parsedRating < 1 || parsedRating > 5) {
    throw new Error('Rating must be between 1 and 5.')
  }

  const payload = {
    development_id: link.development_id,
    unit_id: link.unit_id,
    transaction_id: link.transaction_id,
    buyer_id: link.buyer_id || null,
    rating: parsedRating,
    review_text: reviewText?.trim() || null,
    positives: positives?.trim() || null,
    improvements: improvements?.trim() || null,
    allow_marketing_use: Boolean(allowMarketingUse),
  }

  let result = await client
    .from('service_reviews')
    .insert(payload)
    .select('id')
    .single()

  if (result.error && result.error.code === '23505') {
    let updateQuery = client.from('service_reviews').update(payload).eq('unit_id', link.unit_id)

    if (link.buyer_id) {
      updateQuery = updateQuery.eq('buyer_id', link.buyer_id)
    } else {
      updateQuery = updateQuery.is('buyer_id', null)
    }

    result = await updateQuery.select('id').single()
  }

  if (result.error) {
    throw result.error
  }
}

export async function fetchExternalTransactionPortal(accessToken, options = {}) {
  const client = requireExternalAccessTokenClient(accessToken)
  const targetTransactionId = options?.transactionId || null

  const access = await resolveExternalAccessByToken(client, accessToken)
  ensureExternalWorkspaceRole(access)

  const lastUsedResult = await client
    .from('transaction_external_access')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', access.id)

  if (
    lastUsedResult.error &&
    !isMissingColumnError(lastUsedResult.error, 'last_used_at') &&
    !isMissingTableError(lastUsedResult.error, 'transaction_external_access')
  ) {
    throw lastUsedResult.error
  }
  const accessibleTransactionIds = await resolveExternalWorkspaceTransactionIds(client, access)
  const selectedTransactionId = targetTransactionId || access.transaction_id

  if (!accessibleTransactionIds.includes(selectedTransactionId)) {
    throw new Error('This transaction is not available for your access link.')
  }

  const [workspace, summaries] = await Promise.all([
    fetchExternalTransactionWorkspace(client, selectedTransactionId),
    fetchExternalTransactionSummaries(client, accessibleTransactionIds),
  ])

  const accessibleTransactions = [...summaries].sort((a, b) => {
    const devCompare = String(a.developmentName || '').localeCompare(String(b.developmentName || ''), undefined, {
      sensitivity: 'base',
    })
    if (devCompare !== 0) {
      return devCompare
    }

    return String(a.unitNumber || '').localeCompare(String(b.unitNumber || ''), undefined, {
      numeric: true,
      sensitivity: 'base',
    })
  })

  return {
    access,
    ...workspace,
    selectedTransactionId,
    accessibleTransactions,
  }
}

export async function updateExternalTransactionWorkspace({
  accessToken,
  transactionId = null,
  stage,
  nextAction,
  attorney,
  bondOriginator,
  expectedTransferDate,
  comment,
}) {
  const client = requireClient()
  const access = await resolveExternalAccessByToken(client, accessToken)
  ensureExternalWorkspaceRole(access)
  const accessibleTransactionIds = await resolveExternalWorkspaceTransactionIds(client, access)
  const targetTransactionId = transactionId || access.transaction_id

  if (!accessibleTransactionIds.includes(targetTransactionId)) {
    throw new Error('This transaction is not available for your access link.')
  }

  if (stage) {
    await assertReservationDepositGateForTransition(client, {
      transactionId: targetTransactionId,
      nextMainStage: getMainStageFromDetailedStage(stage),
      nextDetailedStage: stage,
    })
  }

  const updatePayload = {
    stage: stage || null,
    current_main_stage: stage ? getMainStageFromDetailedStage(stage) : null,
    next_action: nextAction?.trim() || null,
    attorney: attorney?.trim() || null,
    bond_originator: bondOriginator?.trim() || null,
    updated_at: new Date().toISOString(),
  }

  let updateQuery = await client
    .from('transactions')
    .update({
      ...updatePayload,
      expected_transfer_date: expectedTransferDate || null,
    })
    .eq('id', targetTransactionId)
    .select('id, unit_id, stage, next_action, attorney, bond_originator, expected_transfer_date, updated_at')
    .single()

  if (updateQuery.error && isMissingColumnError(updateQuery.error, 'expected_transfer_date')) {
    const fallbackPayload = { ...updatePayload }
    delete fallbackPayload.current_main_stage

    updateQuery = await client
      .from('transactions')
      .update(fallbackPayload)
      .eq('id', targetTransactionId)
      .select('id, unit_id, stage, next_action, attorney, bond_originator, updated_at')
      .single()
  }

  if (updateQuery.error && isMissingColumnError(updateQuery.error, 'current_main_stage')) {
    const fallbackPayload = { ...updatePayload }
    delete fallbackPayload.current_main_stage

    updateQuery = await client
      .from('transactions')
      .update({
        ...fallbackPayload,
        expected_transfer_date: expectedTransferDate || null,
      })
      .eq('id', targetTransactionId)
      .select('id, unit_id, stage, next_action, attorney, bond_originator, expected_transfer_date, updated_at')
      .single()
  }

  if (updateQuery.error) {
    throw updateQuery.error
  }

  const updatedTransaction = updateQuery.data

  if (updatedTransaction?.unit_id && updatedTransaction.stage) {
    await client.from('units').update({ status: updatedTransaction.stage }).eq('id', updatedTransaction.unit_id)
  }

  const trimmedComment = comment?.trim()
  if (trimmedComment) {
      await addTransactionDiscussionComment({
        transactionId: targetTransactionId,
        authorName: access.email || formatExternalRole(access.role),
        authorRole: normalizeExternalAccessRoleToTransactionRole(access.role),
        commentText: `[shared] ${trimmedComment}`,
        unitId: updatedTransaction?.unit_id || null,
      })
  }

  return updatedTransaction
}

export async function updateExternalTransactionWorkflowStep({
  accessToken,
  transactionId = null,
  processType,
  stepKey,
  status = 'completed',
  actionType = 'updated',
  comment = '',
}) {
  const client = requireClient()
  const access = await resolveExternalAccessByToken(client, accessToken)
  ensureExternalWorkspaceRole(access)
  const accessibleTransactionIds = await resolveExternalWorkspaceTransactionIds(client, access)
  const targetTransactionId = transactionId || access.transaction_id

  if (!accessibleTransactionIds.includes(targetTransactionId)) {
    throw new Error('This transaction is not available for your access link.')
  }

  const normalizedProcessType = String(processType || '')
    .trim()
    .toLowerCase()
  const allowedProcessTypes = new Set(['finance', 'attorney'])
  if (!allowedProcessTypes.has(normalizedProcessType)) {
    throw new Error('Invalid workflow process type.')
  }

  const subprocesses = await ensureTransactionSubprocesses(client, targetTransactionId)
  const targetSubprocess = subprocesses.find((item) => item.process_type === normalizedProcessType)
  if (!targetSubprocess) {
    throw new Error('Workflow process not found for this transaction.')
  }

  const targetStep = (targetSubprocess.steps || []).find((item) => item.step_key === stepKey)
  if (!targetStep) {
    throw new Error('Workflow step not found for this transaction.')
  }

  const now = new Date().toISOString()
  const actorRole = normalizeExternalAccessRoleToTransactionRole(access.role)
  const actorName = access.email || formatExternalRole(access.role)
  const normalizedStatus = normalizeSubprocessStepStatus(status)
  const actionVerb = actionType === 'completed' ? 'completed' : 'updated'
  const normalizedComment = buildExternalWorkflowStepComment({
    actorName,
    actorRole,
    action: actionVerb,
    occurredAt: now,
    userComment: comment,
  })

  const result = await updateTransactionSubprocessStep({
    transactionId: targetTransactionId,
    subprocessId: targetSubprocess.id,
    stepId: targetStep.id,
    status: normalizedStatus,
    comment: normalizedComment,
    completedAt: normalizedStatus === 'completed' ? targetStep.completed_at || now : null,
    actorRole,
    skipPermissionCheck: true,
  })

  const transactionLookup = await client
    .from('transactions')
    .select('unit_id')
    .eq('id', targetTransactionId)
    .maybeSingle()

  if (transactionLookup.error && !isMissingSchemaError(transactionLookup.error)) {
    throw transactionLookup.error
  }

  const workflowLabel = normalizedProcessType === 'finance' ? 'finance' : 'transfer'
  const noteText =
    normalizedStatus === 'completed'
      ? `[${workflowLabel}] ${actorName} marked "${targetStep.step_label}" complete.${comment?.trim() ? ` ${comment.trim()}` : ''}`
      : `[${workflowLabel}] ${actorName} updated "${targetStep.step_label}".${comment?.trim() ? ` ${comment.trim()}` : ''}`

  await addTransactionDiscussionComment({
    transactionId: targetTransactionId,
    authorName: actorName,
    authorRole: actorRole,
    commentText: noteText,
    unitId: transactionLookup.data?.unit_id || null,
  })

  return result
}

export async function uploadExternalDocument({ accessToken, transactionId = null, file, category, requiredDocumentKey = null }) {
  const client = requireClient()
  const access = await resolveExternalAccessByToken(client, accessToken)
  ensureExternalWorkspaceRole(access)
  const accessibleTransactionIds = await resolveExternalWorkspaceTransactionIds(client, access)
  const targetTransactionId = transactionId || access.transaction_id

  if (!accessibleTransactionIds.includes(targetTransactionId)) {
    throw new Error('This transaction is not available for your access link.')
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '-')
  const filePath = `external-${access.id}/transaction-${targetTransactionId}/${Date.now()}-${safeName}`
  const normalizedDocumentType =
    normalizePortalDocumentType(requiredDocumentKey || category || file.name) || 'external_shared_document'

  const { error: uploadError } = await client.storage.from(DOCUMENTS_BUCKET).upload(filePath, file)

  if (uploadError) {
    throw uploadError
  }

  let result = await client
    .from('documents')
    .insert({
      transaction_id: targetTransactionId,
      name: file.name,
      file_path: filePath,
      category: category || 'General',
      document_type: normalizedDocumentType,
      visibility_scope: 'shared',
      uploaded_by_user_id: null,
      stage_key: null,
      is_client_visible: true,
      uploaded_by_role: access.role,
      uploaded_by_email: access.email,
      external_access_id: access.id,
    })
    .select(
      'id, transaction_id, name, file_path, category, document_type, visibility_scope, stage_key, uploaded_by_user_id, is_client_visible, uploaded_by_role, uploaded_by_email, external_access_id, created_at',
    )
    .single()

  if (
    result.error &&
    (isMissingColumnError(result.error, 'document_type') ||
      isMissingColumnError(result.error, 'visibility_scope') ||
      isMissingColumnError(result.error, 'stage_key') ||
      isMissingColumnError(result.error, 'uploaded_by_user_id') ||
      isMissingColumnError(result.error, 'is_client_visible') ||
      isMissingColumnError(result.error, 'uploaded_by_role') ||
      isMissingColumnError(result.error, 'uploaded_by_email') ||
      isMissingColumnError(result.error, 'external_access_id'))
  ) {
    result = await client
      .from('documents')
      .insert({
        transaction_id: targetTransactionId,
        name: file.name,
        file_path: filePath,
        category: category || 'General',
      })
      .select('id, transaction_id, name, file_path, category, created_at')
      .single()
  }

  if (result.error) {
    throw result.error
  }

  await logTransactionEventIfPossible(client, {
    transactionId: targetTransactionId,
    eventType: 'DocumentUploaded',
    createdByRole: normalizeExternalAccessRoleToTransactionRole(access.role),
    eventData: {
      documentId: result.data.id,
      documentName: result.data.name,
      category: result.data.category || category || 'General',
      visibilityScope: result.data.visibility_scope || 'shared',
      source: 'external_workspace',
    },
  })

  await updateDocumentRequestFromUploadIfPossible(client, {
    transactionId: targetTransactionId,
    documentId: result.data.id,
    category: result.data.category || category || 'General',
    documentName: result.data.name,
    actorRole: normalizeExternalAccessRoleToTransactionRole(access.role),
    actorUserId: null,
  })

  await runDocumentAutomationIfPossible(client, {
    transactionId: targetTransactionId,
    documentId: result.data.id,
    documentName: result.data.name,
    category: result.data.category || category || 'General',
    requiredDocumentKey,
    actorRole: normalizeExternalAccessRoleToTransactionRole(access.role),
    actorUserId: null,
    source: 'external_upload',
  })

  return {
    ...result.data,
    url: await getSignedUrl(result.data.file_path),
  }
}

export async function uploadDocument({
  transactionId,
  file,
  category,
  isClientVisible = false,
  documentType = null,
  visibilityScope = null,
  stageKey = null,
  requiredDocumentKey = null,
  documentRequestId = null,
}) {
  const client = requireClient()
  const activeProfile = await resolveActiveProfileContext(client)

  const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '-')
  const filePath = `transaction-${transactionId}/${Date.now()}-${safeName}`
  const normalizedDocumentType =
    normalizePortalDocumentType(documentType || requiredDocumentKey || category || file.name) || 'general'

  const { error: uploadError } = await client.storage.from(DOCUMENTS_BUCKET).upload(filePath, file)

  if (uploadError) {
    throw uploadError
  }

  let result = await client
    .from('documents')
    .insert({
      transaction_id: transactionId,
      name: file.name,
      file_path: filePath,
      category: category || 'General',
      document_type: normalizedDocumentType,
      visibility_scope: visibilityScope || (isClientVisible ? 'shared' : 'internal'),
      uploaded_by_user_id: activeProfile.userId || null,
      stage_key: stageKey || null,
      is_client_visible: Boolean(isClientVisible),
    })
    .select('id, transaction_id, name, file_path, category, document_type, visibility_scope, stage_key, uploaded_by_user_id, is_client_visible, created_at')
    .single()

  if (
    result.error &&
    (isMissingColumnError(result.error, 'document_type') ||
      isMissingColumnError(result.error, 'visibility_scope') ||
      isMissingColumnError(result.error, 'stage_key') ||
      isMissingColumnError(result.error, 'uploaded_by_user_id') ||
      isMissingColumnError(result.error, 'is_client_visible'))
  ) {
    result = await client
      .from('documents')
      .insert({
        transaction_id: transactionId,
        name: file.name,
        file_path: filePath,
        category: category || 'General',
      })
      .select('id, transaction_id, name, file_path, category, created_at')
      .single()
  }

  if (result.error) {
    throw result.error
  }

  await logTransactionEventIfPossible(client, {
    transactionId,
    eventType: 'DocumentUploaded',
    createdBy: activeProfile.userId || null,
    createdByRole: activeProfile.role || null,
    eventData: {
      documentId: result.data.id,
      documentName: result.data.name,
      category: result.data.category || category || 'General',
      visibilityScope: result.data.visibility_scope || (isClientVisible ? 'shared' : 'internal'),
      stageKey: result.data.stage_key || stageKey || null,
      source: 'internal',
    },
  })

  await updateDocumentRequestFromUploadIfPossible(client, {
    transactionId,
    documentId: result.data.id,
    category: result.data.category || category || 'General',
    documentName: result.data.name,
    documentRequestId,
    actorRole: activeProfile.role || 'developer',
    actorUserId: activeProfile.userId || null,
  })

  await matchAndMarkRequiredDocumentFromUpload(client, {
    transactionId,
    documentId: result.data.id,
    documentName: result.data.name,
    category: result.data.category || category || 'General',
    requiredDocumentKey,
  })

  await runDocumentAutomationIfPossible(client, {
    transactionId,
    documentId: result.data.id,
    documentName: result.data.name,
    category: result.data.category || category || 'General',
    requiredDocumentKey,
    actorRole: activeProfile.role || 'developer',
    actorUserId: activeProfile.userId || null,
    source: 'internal_upload',
  })

  return {
    ...result.data,
    url: await getSignedUrl(result.data.file_path),
  }
}

function splitFullName(fullName) {
  const safeName = String(fullName || '').trim()
  if (!safeName) {
    return { firstName: '', lastName: '' }
  }

  const parts = safeName.split(/\s+/).filter(Boolean)
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' }
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  }
}

function buildDefaultProfileFromUser(user) {
  const metadata = user?.user_metadata || {}
  const metadataFullName = String(metadata.full_name || metadata.name || '').trim()
  const split = splitFullName(metadataFullName)
  const firstName = String(metadata.first_name || split.firstName || '').trim()
  const lastName = String(metadata.last_name || split.lastName || '').trim()
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim()

  return {
    id: user?.id || null,
    email: String(user?.email || '').trim() || null,
    firstName,
    lastName,
    fullName: fullName || metadataFullName || null,
    companyName: String(metadata.company_name || metadata.company || '').trim() || '',
    phoneNumber: String(metadata.phone || metadata.phone_number || '').trim() || '',
    role: normalizeAppRole(metadata.role || metadata.role_type || metadata.persona || metadata.app_role || DEFAULT_APP_ROLE),
    onboardingCompleted: false,
    createdAt: null,
    updatedAt: null,
  }
}

function normalizeProfileRow(row, user, fallback = null) {
  const base = fallback || buildDefaultProfileFromUser(user)
  const firstName = String(row?.first_name || base.firstName || '').trim()
  const lastName = String(row?.last_name || base.lastName || '').trim()
  const combinedName = [firstName, lastName].filter(Boolean).join(' ').trim()

  return {
    id: row?.id || base.id || user?.id || null,
    email: row?.email || base.email || user?.email || null,
    firstName,
    lastName,
    fullName: combinedName || row?.full_name || base.fullName || null,
    companyName: row?.company_name || base.companyName || '',
    phoneNumber: row?.phone_number || base.phoneNumber || '',
    role: normalizeAppRole(row?.role || base.role || DEFAULT_APP_ROLE),
    onboardingCompleted:
      row?.onboarding_completed === true || row?.onboarding_completed === false
        ? row.onboarding_completed
        : Boolean(base.onboardingCompleted),
    createdAt: row?.created_at || base.createdAt || null,
    updatedAt: row?.updated_at || base.updatedAt || null,
  }
}

async function ensureProfileRecord(client, user, fallbackProfile) {
  const rowPayload = {
    id: user.id,
    email: fallbackProfile.email,
    first_name: fallbackProfile.firstName || null,
    last_name: fallbackProfile.lastName || null,
    full_name: fallbackProfile.fullName || null,
    company_name: fallbackProfile.companyName || null,
    phone_number: fallbackProfile.phoneNumber || null,
    role: normalizeAppRole(fallbackProfile.role),
    onboarding_completed: Boolean(fallbackProfile.onboardingCompleted),
  }

  const { data, error } = await client
    .from('profiles')
    .upsert(rowPayload, { onConflict: 'id' })
    .select('id, email, first_name, last_name, full_name, company_name, phone_number, role, onboarding_completed, created_at, updated_at')
    .single()

  if (error) {
    if (isMissingTableError(error, 'profiles') || isMissingColumnError(error, 'role')) {
      throw new Error('Profiles onboarding schema is not set up yet. Run sql/schema.sql first.')
    }
    if (isPermissionDeniedError(error)) {
      throw new Error('Profiles table exists, but Supabase API permissions are missing. Run the schema grants and reload the app.')
    }
    throw error
  }

  return normalizeProfileRow(data, user, fallbackProfile)
}

export async function getOrCreateUserProfile({ user } = {}) {
  const client = requireClient()
  let activeUser = user || null

  if (!activeUser) {
    const { data: authData, error: authError } = await client.auth.getUser()
    if (authError) {
      throw authError
    }
    activeUser = authData?.user || null
  }

  if (!activeUser?.id) {
    throw new Error('Authenticated user is required.')
  }

  const fallbackProfile = buildDefaultProfileFromUser(activeUser)

  const { data, error } = await client
    .from('profiles')
    .select('id, email, first_name, last_name, full_name, company_name, phone_number, role, onboarding_completed, created_at, updated_at')
    .eq('id', activeUser.id)
    .maybeSingle()

  if (error) {
    if (isMissingTableError(error, 'profiles') || isMissingColumnError(error, 'role')) {
      throw new Error('Profiles onboarding schema is not set up yet. Run sql/schema.sql first.')
    }
    if (isPermissionDeniedError(error)) {
      throw new Error('Profiles table exists, but Supabase API permissions are missing. Run the schema grants and reload the app.')
    }
    throw error
  }

  if (!data) {
    return ensureProfileRecord(client, activeUser, fallbackProfile)
  }

  const normalized = normalizeProfileRow(data, activeUser, fallbackProfile)
  const needsBackfill =
    !data.role ||
    data.onboarding_completed === null ||
    (normalized.fullName && !data.full_name)

  if (!needsBackfill) {
    return normalized
  }

  return ensureProfileRecord(client, activeUser, {
    ...normalized,
    onboardingCompleted:
      data.onboarding_completed === null && normalized.role === DEFAULT_APP_ROLE ? true : normalized.onboardingCompleted,
  })
}

export async function updateUserProfile({ userId, firstName, lastName, companyName, phoneNumber, role, onboardingCompleted }) {
  const client = requireClient()

  if (!userId) {
    throw new Error('User id is required to update profile.')
  }

  const safeFirstName = String(firstName || '').trim()
  const safeLastName = String(lastName || '').trim()
  const safeFullName = [safeFirstName, safeLastName].filter(Boolean).join(' ').trim()

  const payload = {
    id: userId,
    first_name: safeFirstName || null,
    last_name: safeLastName || null,
    full_name: safeFullName || null,
    company_name: normalizeNullableText(companyName),
    phone_number: normalizeNullableText(phoneNumber),
  }

  if (role !== undefined) {
    payload.role = normalizeAppRole(role)
  }

  if (onboardingCompleted !== undefined) {
    payload.onboarding_completed = Boolean(onboardingCompleted)
  }

  const { data, error } = await client
    .from('profiles')
    .upsert(payload, { onConflict: 'id' })
    .select('id, email, first_name, last_name, full_name, company_name, phone_number, role, onboarding_completed, created_at, updated_at')
    .single()

  if (error) {
    if (isMissingTableError(error, 'profiles') || isMissingColumnError(error, 'role')) {
      throw new Error('Profiles onboarding schema is not set up yet. Run sql/schema.sql first.')
    }
    if (isPermissionDeniedError(error)) {
      throw new Error('Profiles table exists, but Supabase API permissions are missing. Run the schema grants and reload the app.')
    }
    throw error
  }

  return normalizeProfileRow(data, { id: userId })
}

export async function createDevelopment({ name, plannedUnits, profile = {} }) {
  const client = requireClient()
  const trimmedName = name?.trim()

  if (!trimmedName) {
    throw new Error('Development name is required.')
  }

  const normalizedPlannedUnits =
    plannedUnits === null || plannedUnits === undefined || plannedUnits === '' ? 0 : Number(plannedUnits)

  if (Number.isNaN(normalizedPlannedUnits) || normalizedPlannedUnits < 0) {
    throw new Error('Planned units must be 0 or greater.')
  }

  const basePayload = {
    name: trimmedName,
    planned_units: Math.trunc(normalizedPlannedUnits),
    code: normalizeNullableText(profile.code),
    location: normalizeNullableText(profile.location),
    suburb: normalizeNullableText(profile.suburb),
    city: normalizeNullableText(profile.city),
    province: normalizeNullableText(profile.province),
    country: normalizeNullableText(profile.country) || 'South Africa',
    description: normalizeNullableText(profile.description),
    status: normalizeNullableText(profile.status) || DEFAULT_DEVELOPMENT_PROFILE.status,
    developer_company: normalizeNullableText(profile.developerCompany || profile.developer_company),
    total_units_expected: Math.trunc(normalizedPlannedUnits),
    launch_date: normalizeOptionalDate(profile.launchDate || profile.launch_date),
    expected_completion_date: normalizeOptionalDate(profile.expectedCompletionDate || profile.expected_completion_date),
    handover_enabled:
      profile.handoverEnabled === undefined ? true : Boolean(profile.handoverEnabled),
    snag_tracking_enabled:
      profile.snagTrackingEnabled === undefined ? true : Boolean(profile.snagTrackingEnabled),
    alterations_enabled:
      profile.alterationsEnabled === undefined ? false : Boolean(profile.alterationsEnabled),
    onboarding_enabled:
      profile.onboardingEnabled === undefined ? true : Boolean(profile.onboardingEnabled),
  }

  let result = await client
    .from('developments')
    .insert(basePayload)
    .select('id, name, planned_units, code, location, suburb, city, province, country, description, status, developer_company, total_units_expected, launch_date, expected_completion_date, handover_enabled, snag_tracking_enabled, alterations_enabled, onboarding_enabled')
    .single()

  if (result.error && result.error.code === '42703') {
    result = await client
      .from('developments')
      .insert({ name: trimmedName, planned_units: Math.trunc(normalizedPlannedUnits) })
      .select('id, name, planned_units')
      .single()
  }

  if (result.error) {
    throw result.error
  }

  try {
    await client.from('development_settings').upsert(
      {
        development_id: result.data.id,
        client_portal_enabled: DEFAULT_DEVELOPMENT_SETTINGS.client_portal_enabled,
        snag_reporting_enabled: DEFAULT_DEVELOPMENT_SETTINGS.snag_reporting_enabled,
        alteration_requests_enabled: DEFAULT_DEVELOPMENT_SETTINGS.alteration_requests_enabled,
        service_reviews_enabled: DEFAULT_DEVELOPMENT_SETTINGS.service_reviews_enabled,
        enabled_modules: DEFAULT_DEVELOPMENT_SETTINGS.enabledModules,
        stakeholder_teams: DEFAULT_DEVELOPMENT_SETTINGS.stakeholderTeams,
      },
      { onConflict: 'development_id' },
    )
  } catch {
    // Non-blocking for backwards compatibility where table may not exist yet.
  }

  const normalizedProfile = normalizeDevelopmentProfile(profile)

  try {
    await client.from('development_profiles').upsert(
      {
        development_id: result.data.id,
        code: normalizedProfile.code || null,
        location: normalizedProfile.location || null,
        suburb: normalizedProfile.suburb || null,
        city: normalizedProfile.city || null,
        province: normalizedProfile.province || null,
        country: normalizedProfile.country || DEFAULT_DEVELOPMENT_PROFILE.country,
        address: normalizedProfile.address || null,
        description: normalizedProfile.description || null,
        status: normalizedProfile.status || DEFAULT_DEVELOPMENT_PROFILE.status,
        developer_company: normalizedProfile.developerCompany || null,
        launch_date: normalizedProfile.launchDate || null,
        expected_completion_date: normalizedProfile.expectedCompletionDate || null,
        plans: normalizedProfile.plans,
        site_plans: normalizedProfile.sitePlans,
        image_links: normalizedProfile.imageLinks,
        supporting_documents: normalizedProfile.supportingDocuments,
        marketing_content: normalizeMarketingContent(profile.marketingContent),
      },
      { onConflict: 'development_id' },
    )
  } catch {
    // Non-blocking for environments where development_profiles is not yet available.
  }

  return {
    ...result.data,
    planned_units: typeof result.data.planned_units === 'number' ? result.data.planned_units : null,
    profile: normalizedProfile,
  }
}

export async function createUnit({
  developmentId,
  unitNumber,
  unitLabel = '',
  block = '',
  unitType = '',
  bedrooms = null,
  bathrooms = null,
  parkingCount = null,
  sizeSqm = null,
  currentPrice = null,
  status = 'Available',
  vatApplicable = null,
  floorplanId = null,
  notes = '',
  price,
}) {
  const client = requireClient()
  const normalizedUnit = unitNumber?.trim()

  if (!developmentId) {
    throw new Error('Development is required.')
  }

  if (!normalizedUnit) {
    throw new Error('Unit number is required.')
  }

  const parsedPrice = Number(price)
  if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
    throw new Error('Price must be 0 or greater.')
  }

  const { data, error } = await client
    .from('units')
    .insert({
      development_id: developmentId,
      unit_number: normalizedUnit,
      unit_label: normalizeNullableText(unitLabel),
      phase: null,
      block: normalizeNullableText(block),
      unit_type: normalizeNullableText(unitType),
      bedrooms: normalizeOptionalNumber(bedrooms),
      bathrooms: normalizeOptionalNumber(bathrooms),
      parking_count: normalizeOptionalNumber(parkingCount),
      size_sqm: normalizeOptionalNumber(sizeSqm),
      list_price: parsedPrice,
      current_price: normalizeOptionalNumber(currentPrice) ?? parsedPrice,
      price: parsedPrice,
      status,
      vat_applicable: normalizeNullableBoolean(vatApplicable),
      floorplan_id: floorplanId || null,
      notes: normalizeNullableText(notes),
    })
    .select('id, development_id, unit_number, unit_label, phase, block, unit_type, bedrooms, bathrooms, parking_count, size_sqm, list_price, current_price, price, status, vat_applicable, floorplan_id, notes')
    .single()

  if (error) {
    throw error
  }

  return data
}

export async function createDevelopmentWorkspace({
  details = {},
  financials = {},
  legal = {},
  developmentSettings = {},
  units = [],
  documents = [],
} = {}) {
  const created = await createDevelopment({
    name: details.name,
    plannedUnits: details.totalUnitsExpected ?? details.plannedUnits ?? units.length,
    profile: {
      code: details.code,
      location: details.location,
      suburb: details.suburb,
      city: details.city,
      province: details.province,
      country: details.country,
      address: details.address,
      description: details.description,
      status: details.status,
      developerCompany: details.developerCompany,
      launchDate: details.launchDate,
      expectedCompletionDate: details.expectedCompletionDate,
      handoverEnabled: details.handoverEnabled,
      snagTrackingEnabled: details.snagTrackingEnabled,
      alterationsEnabled: details.alterationsEnabled,
      onboardingEnabled: details.onboardingEnabled,
      plans: details.plans || [],
      sitePlans: details.sitePlans || [],
      imageLinks: details.imageLinks || [],
      supportingDocuments: details.supportingDocuments || [],
    },
  })

  const developmentId = created.id

  await saveDevelopmentDetails(developmentId, details)
  await saveDevelopmentFinancials(developmentId, financials)
  try {
    await updateDevelopmentSettings(developmentId, {
      ...DEFAULT_DEVELOPMENT_SETTINGS,
      ...(developmentSettings || {}),
    })
  } catch {
    // Non-blocking for environments where the latest development settings columns are not yet available.
  }

  if (
    normalizeTextValue(legal.attorneyFirmName) ||
    normalizeTextValue(legal.primaryContactName) ||
    normalizeTextValue(legal.primaryContactEmail)
  ) {
    await saveDevelopmentAttorneyConfig(developmentId, {
      attorneyFirmName: legal.attorneyFirmName,
      primaryContactName: legal.primaryContactName,
      primaryContactEmail: legal.primaryContactEmail,
      primaryContactPhone: legal.primaryContactPhone,
      defaultFeeAmount: legal.defaultFeeAmount,
      vatIncluded: legal.vatIncluded !== false,
      disbursementsIncluded: Boolean(legal.disbursementsIncluded),
      overrideAllowed: legal.overrideAllowed !== false,
    })
  }

  if (
    normalizeTextValue(legal.bondOriginatorName) ||
    normalizeTextValue(legal.bondPrimaryContactName) ||
    normalizeTextValue(legal.bondPrimaryContactEmail)
  ) {
    await saveDevelopmentBondConfig(developmentId, {
      bondOriginatorName: legal.bondOriginatorName,
      primaryContactName: legal.bondPrimaryContactName,
      primaryContactEmail: legal.bondPrimaryContactEmail,
      primaryContactPhone: legal.bondPrimaryContactPhone,
      commissionModelType: legal.bondCommissionModelType || 'fixed_fee',
      defaultCommissionAmount: legal.defaultCommissionAmount,
      vatIncluded: legal.bondVatIncluded !== false,
      overrideAllowed: legal.bondOverrideAllowed !== false,
    })
  }

  for (const unit of units) {
    if (!normalizeTextValue(unit?.unitNumber)) {
      continue
    }
    await saveDevelopmentUnit({
      ...unit,
      developmentId,
    })
  }

  for (const document of documents) {
    if (!normalizeTextValue(document?.title)) {
      continue
    }
    await saveDevelopmentDocument({
      developmentId,
      ...document,
    })
  }

  return created
}

export const EMPTY_STATE = {
  dashboardMetrics: EMPTY_DASHBOARD_METRICS,
}
