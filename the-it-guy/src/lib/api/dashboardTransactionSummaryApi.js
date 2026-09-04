import {
  BOND_HYBRID_FINANCE_WORKFLOW_TYPE,
  buildBondHybridFinanceStageSteps,
  getBondHybridFinanceStageLabel,
  normalizeBondHybridFinanceStage,
  summarizeBondHybridFinanceWorkflow,
} from '../../core/transactions/bondHybridFinanceWorkflow'
import {
  normalizeDocumentRequestPriority,
  normalizeDocumentRequestStatus,
} from '../../core/transactions/attorneyOperationalEngine'
import { financeTypeMatchesFilter } from '../../core/transactions/financeType'
import { normalizeRoleType } from '../../core/transactions/permissions'
import { bondPerfLog, createPerfTimer } from '../performanceTrace'
import {
  fetchDevelopmentIdsForOrganisation,
  hydrateRowsWithCommissionSnapshots,
  isMissingColumnError,
  isMissingSchemaError,
  isMissingTableError,
  isPermissionDeniedError,
  latestTimestamp,
  normalizeMainStage,
  normalizeStage,
  normalizeTextValue,
  registerKnownMissingColumns,
  requireClient,
  selectWithoutKnownMissingColumns,
} from './dashboardOverviewApi.js'

const TRANSACTION_ACCESS_LEVEL_VALUES = ['private', 'shared', 'restricted']
const STAKEHOLDER_STATUS_VALUES = ['draft', 'invited', 'active', 'removed']
const FIRM_ROLE_VALUES = [
  'firm_admin',
  'lead_attorney',
  'attorney',
  'paralegal',
  'admin_staff',
  'developer',
  'agent',
  'viewer',
  'buyer',
  'seller',
]
const ADDITIONAL_DOCUMENT_REQUEST_VISIBILITY_TYPES = ['client_visible', 'internal_only', 'shared_role_players']
const ADDITIONAL_DOCUMENT_REQUEST_REQUESTED_FROM_TYPES = [
  'buyer',
  'seller',
  'buyer_and_seller',
  'agent',
  'developer',
  'attorney',
  'bond_originator',
  'other',
]

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
  developers: {
    roleType: 'developer',
    nameFields: ['name', 'contactName'],
    emailFields: ['email', 'contactEmail'],
    organisationFields: ['company', 'organisation', 'organisationName'],
  },
}

const TRANSACTION_SUMMARY_SELECT_CLAUSE =
  'id, organisation_id, assigned_branch_id, lifecycle_state, matter_number, transaction_reference, transaction_type, property_type, development_id, unit_id, buyer_id, property_address_line_1, property_address_line_2, suburb, city, province, property_description, property_image_url, listing_image_url, primary_image_url, cover_image_url, hero_image_url, image_url, thumbnail_url, sales_price, purchase_price, finance_type, purchaser_type, cash_amount, bond_amount, deposit_amount, reservation_required, reservation_amount, reservation_amount_type, reservation_treatment, reservation_payable_to, alteration_charge_treatment, onboarding_status, stage, current_main_stage, current_sub_stage_summary, assigned_agent, assigned_agent_email, attorney, assigned_attorney_email, bond_originator, assigned_bond_originator_email, bank, next_action, comment, expected_transfer_date, bond_workspace_id, bond_region_id, bond_workspace_unit_id, primary_bond_consultant_user_id, assigned_bond_processor_user_id, assigned_bond_manager_user_id, assigned_bond_compliance_user_id, bond_assignment_status, bond_assignment_source, finance_status, compliance_status, compliance_review_required, application_prepared, submitted_to_banks, documents_complete, finance_documents_complete, documents_missing, required_documents_missing, finance_documents_missing, missing_documents_count, uploaded_documents_count, total_required_documents, bank_feedback_pending, bank_feedback_status, next_action_due_at, finance_due_at, attorney_stage, risk_status, operational_state, processor_name, assigned_bond_processor_name, compliance_name, gross_commission_percentage, gross_commission_amount, agent_split_percentage_snapshot, agency_split_percentage_snapshot, agent_commission_amount, agency_commission_amount, registered_at, completed_at, archived_at, cancelled_at, deleted_at, last_meaningful_activity_at, updated_at, created_at, is_active'
const TRANSACTION_SUMMARY_FALLBACK_SELECT_CLAUSE =
  'id, organisation_id, bond_workspace_id, development_id, unit_id, buyer_id, finance_type, purchaser_type, purchase_price, sales_price, cash_amount, bond_amount, deposit_amount, reservation_required, reservation_amount, reservation_amount_type, reservation_treatment, reservation_payable_to, alteration_charge_treatment, onboarding_status, stage, attorney, bond_originator, next_action, updated_at, created_at'

const DASHBOARD_CORE_TRANSACTION_SELECT_CLAUSE =
  'id, organisation_id, assigned_branch_id, lifecycle_state, matter_number, transaction_reference, transaction_type, property_type, development_id, unit_id, buyer_id, property_address_line_1, property_address_line_2, suburb, city, province, property_description, property_image_url, listing_image_url, primary_image_url, cover_image_url, hero_image_url, image_url, thumbnail_url, sales_price, purchase_price, finance_type, purchaser_type, stage, current_main_stage, current_sub_stage_summary, assigned_agent, assigned_agent_email, attorney, assigned_attorney_email, bond_originator, assigned_bond_originator_email, bank, next_action, comment, expected_transfer_date, finance_status, attorney_stage, risk_status, operational_state, missing_documents_count, uploaded_documents_count, total_required_documents, gross_commission_percentage, gross_commission_amount, agent_commission_amount, agency_commission_amount, registered_at, completed_at, archived_at, cancelled_at, last_meaningful_activity_at, updated_at, created_at, is_active'
const DASHBOARD_CORE_TRANSACTION_FALLBACK_SELECT_CLAUSE =
  'id, organisation_id, development_id, unit_id, buyer_id, finance_type, purchaser_type, purchase_price, sales_price, stage, attorney, bond_originator, next_action, updated_at, created_at'

const TRANSACTION_SUMMARY_OPTIONAL_COLUMNS = [
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
  'property_image_url',
  'listing_image_url',
  'primary_image_url',
  'cover_image_url',
  'hero_image_url',
  'image_url',
  'thumbnail_url',
]

const BOND_HQ_WORKSPACE_ROLES = new Set(['owner', 'director', 'hq_manager'])

function firstImageUrl(value) {
  if (!value) return ''
  if (typeof value === 'string') return value.trim()
  if (Array.isArray(value)) {
    for (const item of value) {
      const imageUrl = firstImageUrl(item)
      if (imageUrl) return imageUrl
    }
    return ''
  }
  if (typeof value === 'object') {
    return firstImageUrl(value.url || value.src || value.imageUrl || value.image_url || value.coverImageUrl || value.cover_image_url || value.heroImageUrl || value.hero_image_url)
  }
  return ''
}

function getDevelopmentProfileImage(profile = {}) {
  const mediaLibrary = profile?.marketing_content?.mediaLibrary || profile?.marketing_content?.media_library || {}
  return firstImageUrl([
    mediaLibrary.heroImageUrl,
    mediaLibrary.hero_image_url,
    mediaLibrary.coverImageUrl,
    mediaLibrary.cover_image_url,
    mediaLibrary.galleryImageUrls,
    mediaLibrary.gallery_image_urls,
    profile?.image_links,
  ])
}

async function fetchDashboardDevelopmentProfileImages(client, developmentIds = []) {
  const ids = [...new Set((developmentIds || []).filter(Boolean))]
  if (!ids.length) return new Map()

  let query = await client.from('development_profiles').select('development_id, image_links, marketing_content').in('development_id', ids)
  if (query.error && isMissingColumnError(query.error, 'marketing_content')) {
    query = await client.from('development_profiles').select('development_id, image_links').in('development_id', ids)
  }
  if (query.error) {
    if (isMissingTableError(query.error, 'development_profiles') || isPermissionDeniedError(query.error)) return new Map()
    throw query.error
  }

  return new Map(
    (query.data || [])
      .map((profile) => [String(profile?.development_id || '').trim(), getDevelopmentProfileImage(profile)])
      .filter(([developmentId, imageUrl]) => developmentId && imageUrl),
  )
}

async function fetchTransactionSummaryUnits(client, unitIds = []) {
  const ids = [...new Set((unitIds || []).filter(Boolean))]
  if (!ids.length) return { data: [], error: null }

  let query = await client
    .from('units')
    .select('id, development_id, unit_number, phase, price, status, image_url, thumbnail_url, cover_image_url, primary_image_url, gallery_images')
    .in('id', ids)
  if (query.error && isMissingColumnError(query.error)) {
    query = await client.from('units').select('id, development_id, unit_number, phase, price, status').in('id', ids)
  }
  return query
}

function normalizeEmailAddress(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  return normalized || ''
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || '').trim(),
  )
}

function normalizeNullableUuid(value) {
  const text = normalizeTextValue(value)
  return text && isUuidLike(text) ? text : null
}

function normalizeStakeholderStatus(value, fallback = 'draft') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  return STAKEHOLDER_STATUS_VALUES.includes(normalized) ? normalized : fallback
}

function normalizeTransactionAccessLevel(value, fallback = 'shared') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  return TRANSACTION_ACCESS_LEVEL_VALUES.includes(normalized) ? normalized : fallback
}

function normalizeFirmRole(value, fallback = 'attorney') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  return FIRM_ROLE_VALUES.includes(normalized) ? normalized : fallback
}

function normalizeRequestRoleScope(value, fallback = 'client') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
  if (!normalized) return fallback
  if (normalized === 'bond') return 'bond_originator'
  if (normalized === 'buyer_and_seller' || normalized === 'both_buyer_and_seller') return 'client'
  return normalized
}

function normalizeAdditionalDocumentRequestVisibility(value, fallback = 'shared_role_players') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
  if (!normalized) return fallback
  if (normalized === 'client' || normalized === 'client_visible') return 'client_visible'
  if (normalized === 'shared' || normalized === 'shared_role_players') return 'shared_role_players'
  if (normalized === 'internal' || normalized === 'internal_only') return 'internal_only'
  return ADDITIONAL_DOCUMENT_REQUEST_VISIBILITY_TYPES.includes(normalized) ? normalized : fallback
}

function normalizeAdditionalDocumentRequestRequestedFrom(value, fallback = 'buyer') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
  if (!normalized) return fallback
  if (normalized === 'both_buyer_and_seller' || normalized === 'buyer_seller' || normalized === 'both') {
    return 'buyer_and_seller'
  }
  if (normalized === 'client' || normalized === 'buyer_or_seller') return 'buyer_and_seller'
  if (normalized === 'bond' || normalized === 'bond_originator') return 'bond_originator'
  return ADDITIONAL_DOCUMENT_REQUEST_REQUESTED_FROM_TYPES.includes(normalized) ? normalized : fallback
}

function normalizeAdditionalDocumentRequestPriority(value, fallback = 'normal') {
  const normalized = normalizeDocumentRequestPriority(value)
  if (normalized === 'urgent' || normalized === 'required') return 'urgent'
  if (normalized === 'optional') return 'normal'
  if (normalized === 'important') return 'normal'
  if (normalized === 'normal') return 'normal'
  return fallback
}

function mapRequestedFromToAssignedRole(requestedFrom = '') {
  const normalized = normalizeAdditionalDocumentRequestRequestedFrom(requestedFrom, 'buyer')
  if (normalized === 'buyer') return 'buyer'
  if (normalized === 'seller') return 'seller'
  if (normalized === 'buyer_and_seller') return 'client'
  if (normalized === 'agent') return 'agent'
  if (normalized === 'developer') return 'developer'
  if (normalized === 'attorney') return 'attorney'
  if (normalized === 'bond_originator') return 'bond_originator'
  return 'client'
}

function normalizeDocumentRequestRow(row) {
  const visibility = normalizeAdditionalDocumentRequestVisibility(
    row?.visibility_scope || row?.visibility || 'shared_role_players',
  )
  const requestedFrom = normalizeAdditionalDocumentRequestRequestedFrom(
    row?.requested_from || row?.requestedFrom || mapRequestedFromToAssignedRole(row?.assigned_to_role || 'buyer'),
    'buyer',
  )
  const requestType = String(row?.request_type || row?.requestType || 'additional_document_request')
    .trim()
    .toLowerCase()
  return {
    id: row?.id || null,
    transactionId: row?.transaction_id || null,
    category: row?.category || 'General',
    documentType: row?.document_type || null,
    title: row?.title || row?.document_type || 'Document Request',
    description: row?.description || null,
    priority: normalizeDocumentRequestPriority(row?.priority),
    additionalPriority: normalizeAdditionalDocumentRequestPriority(row?.priority),
    dueDate: row?.due_date || null,
    assignedToRole:
      normalizeRoleType(row?.assigned_to_role || null) || normalizeRequestRoleScope(row?.assigned_to_role || null),
    assignedToUserId: row?.assigned_to_user_id || null,
    requestGroupId: row?.request_group_id || null,
    status: normalizeDocumentRequestStatus(row?.status),
    requiresReview: row?.requires_review !== false,
    requestedDocumentId: row?.requested_document_id || null,
    createdBy: row?.created_by || null,
    createdByRole:
      normalizeRoleType(row?.created_by_role || null) ||
      normalizeRequestRoleScope(row?.created_by_role || null, 'attorney'),
    completedAt: row?.completed_at || null,
    rejectedReason: row?.rejected_reason || null,
    resendCount: Number(row?.resend_count || 0) || 0,
    lastResentAt: row?.last_resent_at || null,
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null,
    requestType,
    requestedFrom,
    visibility,
    clientVisible: visibility === 'client_visible',
    notes: row?.notes || row?.description || null,
    audience: visibility,
  }
}

async function resolveActiveProfileContext(client) {
  try {
    const { data, error } = await client.auth.getSession()
    if (error) return { userId: null, role: null, firmId: null, firmRole: null }

    const user = data?.session?.user
    if (!user?.id) return { userId: null, role: null, firmId: null, firmRole: null }

    const profileQuery = await client
      .from('profiles')
      .select('id, role, firm_id, firm_role')
      .eq('id', user.id)
      .limit(1)
      .maybeSingle()
    if (profileQuery.error) return { userId: user.id, role: null, firmId: null, firmRole: null }

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

async function resolveProfileIdentityByUserId(client, userId) {
  if (!userId) return { userId: null, email: '', fullName: '' }

  let profileQuery = await client.from('profiles').select('id, email, full_name').eq('id', userId).maybeSingle()
  if (profileQuery.error && isMissingColumnError(profileQuery.error)) {
    profileQuery = await client.from('profiles').select('id, email').eq('id', userId).maybeSingle()
  }
  if (profileQuery.error) {
    if (isMissingSchemaError(profileQuery.error)) return { userId, email: '', fullName: '' }
    console.warn('resolveProfileIdentityByUserId fallback: profiles lookup failed', {
      userId,
      code: profileQuery.error?.code,
      message: profileQuery.error?.message,
    })
    return { userId, email: '', fullName: '' }
  }

  let email = normalizeEmailAddress(profileQuery.data?.email)
  let fullName = normalizeTextValue(profileQuery.data?.full_name)
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
      // Keep access resolution working with userId when auth lookup fails.
    }
  }

  return { userId, email, fullName }
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
  if (!identityColumn || !identityValue) return { rows: [], requiresOrganisationFilter: false }

  const normalizedOrganisationId = normalizeTextValue(organisationId)
  const runQuery = async ({ includeStatus = true } = {}) => {
    const selectFields = [
      'transaction_id',
      'role_type',
      ...(includeStatus ? ['status', 'removed_at'] : []),
      ...(normalizedOrganisationId ? ['transaction:transactions!inner(organisation_id)'] : []),
    ].join(', ')
    let builder = client.from('transaction_participants').select(selectFields).eq(identityColumn, identityValue)
    if (normalizedOrganisationId) {
      builder = builder.eq('transaction.organisation_id', normalizedOrganisationId)
    }
    return builder
  }

  const runWithSchemaFallback = async () => {
    let query = await runQuery()
    if (query.error && isMissingColumnError(query.error, 'user_id') && identityColumn === 'user_id') {
      return { data: [], error: null }
    }
    if (query.error && (isMissingColumnError(query.error, 'status') || isMissingColumnError(query.error, 'removed_at'))) {
      query = await runQuery({ includeStatus: false })
    }
    return query
  }

  const query = await runWithSchemaFallback()
  if (query.error && !isMissingSchemaError(query.error)) throw query.error
  return { rows: query.data || [], requiresOrganisationFilter: false }
}

async function filterTransactionIdsToOrganisation(client, transactionIds = [], organisationId = '') {
  const normalizedOrganisationId = normalizeTextValue(organisationId)
  const ids = [...new Set((transactionIds || []).filter(Boolean))]
  if (!normalizedOrganisationId || !ids.length) return new Set()

  const runQuery = async ({ includeActive = true } = {}) =>
    client
      .from('transactions')
      .select(includeActive ? 'id, is_active' : 'id')
      .in('id', ids)
      .eq('organisation_id', normalizedOrganisationId)

  let query = await runQuery()
  if (query.error && isMissingColumnError(query.error, 'is_active')) query = await runQuery({ includeActive: false })
  if (query.error) {
    if (isMissingSchemaError(query.error) || isMissingColumnError(query.error, 'organisation_id')) return new Set()
    throw query.error
  }

  return new Set((query.data || []).filter((row) => row?.id && row?.is_active !== false).map((row) => row.id))
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
    if (normalizedOrganisationId) query = query.eq('organisation_id', normalizedOrganisationId)
    return query.eq(legacyColumn, normalizedEmail)
  }

  let query = await runQuery()
  if (query.error && isMissingColumnError(query.error, 'is_active')) query = await runQuery({ includeActive: false })
  if (query.error && !isMissingColumnError(query.error, legacyColumn) && !isMissingSchemaError(query.error)) {
    throw query.error
  }

  return new Set((query.data || []).filter((row) => row?.id && row?.is_active !== false).map((row) => row.id))
}

function normalizeDevelopmentParticipantRoleType(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()

  if (
    ['attorney', 'conveyancer', 'transfer_conveyancer', 'buyer_attorney', 'seller_attorney', 'tuckers'].includes(
      normalized,
    )
  ) {
    return 'attorney'
  }

  if (['developer', 'internal_admin', 'agent', 'bond_originator', 'client'].includes(normalized)) return normalized
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
    if (value) return value
  }
  return ''
}

function normalizeStakeholderTeamParticipant(member, teamKey) {
  const definition = DEVELOPMENT_TEAM_ROLE_MAP[teamKey]
  if (!definition || !member || typeof member !== 'object') return null

  const participantName = resolveTeamValue(member, definition.nameFields)
  const participantEmail = normalizeEmailAddress(resolveTeamValue(member, definition.emailFields))
  const organisationName = resolveTeamValue(member, definition.organisationFields)
  if (!participantName && !participantEmail) return null

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
  if (!userId) return []
  const firmIds = new Set()

  const profileQuery = await client.from('profiles').select('id, firm_id').eq('id', userId).maybeSingle()
  if (!profileQuery.error && profileQuery.data?.firm_id) {
    firmIds.add(profileQuery.data.firm_id)
  } else if (profileQuery.error && !isMissingSchemaError(profileQuery.error)) {
    throw profileQuery.error
  }

  let membershipsQuery = await client.from('firm_memberships').select('firm_id, status, accepted_at').eq('user_id', userId)
  if (
    membershipsQuery.error &&
    (isMissingColumnError(membershipsQuery.error, 'status') || isMissingColumnError(membershipsQuery.error, 'accepted_at'))
  ) {
    membershipsQuery = await client.from('firm_memberships').select('firm_id').eq('user_id', userId)
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
  { userId = null, participantEmail = '', roleType = null, developmentIds = [] } = {},
) {
  const normalizedRole = roleType ? normalizeRoleType(roleType) : null
  const normalizedEmail = normalizeEmailAddress(participantEmail)
  const rows = []

  const appendRows = async (queryBuilder, { userIdFilter = null, participantEmailFilter = '' } = {}) => {
    let query = queryBuilder.select(
      'id, development_id, user_id, role_type, participant_name, participant_email, organisation_name, is_primary, assignment_source, is_active',
    )
    if (userIdFilter) query = query.eq('user_id', userIdFilter)
    if (participantEmailFilter) query = query.eq('participant_email', participantEmailFilter)
    if (developmentIds.length) query = query.in('development_id', developmentIds)

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
      if (userIdFilter) fallbackQuery = fallbackQuery.eq('user_id', userIdFilter)
      if (participantEmailFilter) fallbackQuery = fallbackQuery.eq('participant_email', participantEmailFilter)
      if (developmentIds.length) fallbackQuery = fallbackQuery.in('development_id', developmentIds)
      result = await fallbackQuery
    }

    if (result.error) {
      if (isMissingTableError(result.error, 'development_participants') || isMissingSchemaError(result.error)) return
      throw result.error
    }

    rows.push(...(result.data || []).map((item) => normalizeDevelopmentParticipantRow(item)))
  }

  if (userId) {
    try {
      await appendRows(client.from('development_participants'), { userIdFilter: userId })
    } catch (error) {
      if (!isMissingColumnError(error, 'user_id')) throw error
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
      if (developmentIds.length) byFirmQuery = byFirmQuery.in('development_id', developmentIds)
      if (normalizedRole) byFirmQuery = byFirmQuery.eq('role_type', normalizedRole)

      const byFirmResult = await byFirmQuery
      if (byFirmResult.error) {
        const missingFirmColumns =
          isMissingColumnError(byFirmResult.error, 'firm_id') ||
          isMissingColumnError(byFirmResult.error, 'user_id') ||
          isMissingColumnError(byFirmResult.error, 'organisation_name') ||
          isMissingColumnError(byFirmResult.error, 'is_primary') ||
          isMissingColumnError(byFirmResult.error, 'assignment_source') ||
          isMissingColumnError(byFirmResult.error, 'is_active')
        if (
          !missingFirmColumns &&
          !isMissingTableError(byFirmResult.error, 'development_participants') &&
          !isMissingSchemaError(byFirmResult.error)
        ) {
          throw byFirmResult.error
        }
      } else {
        rows.push(...(byFirmResult.data || []).map((item) => normalizeDevelopmentParticipantRow(item)))
      }

      let configQuery = client
        .from('development_attorney_configs')
        .select(
          'development_id, attorney_firm_id, attorney_firm_name, primary_contact_name, primary_contact_email, is_active',
        )
        .in('attorney_firm_id', firmIds)
      if (developmentIds.length) configQuery = configQuery.in('development_id', developmentIds)

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
    if (!row.developmentId || !row.isActive) continue
    const comparableRole = normalizeDevelopmentParticipantRoleType(row.roleType)
    if (normalizedRole && comparableRole !== normalizedRole) continue
    const key = [row.developmentId, comparableRole || 'unknown', row.userId || '', row.participantEmail || '', row.participantName || ''].join(':')
    if (!dedupedByKey.has(key)) dedupedByKey.set(key, { ...row, roleType: comparableRole || row.roleType })
  }

  return [...dedupedByKey.values()]
}

async function fetchFallbackDevelopmentParticipantsBySettings(
  client,
  { participantEmail = '', roleType = null, developmentIds = [] } = {},
) {
  const normalizedEmail = normalizeEmailAddress(participantEmail)
  const normalizedRole = roleType ? normalizeRoleType(roleType) : null
  const mappedTeamKeys = Object.keys(DEVELOPMENT_TEAM_ROLE_MAP).filter(
    (teamKey) => !normalizedRole || DEVELOPMENT_TEAM_ROLE_MAP[teamKey].roleType === normalizedRole,
  )
  if (!mappedTeamKeys.length) return []

  let settingsQuery = client.from('development_settings').select('development_id, stakeholder_teams')
  if (developmentIds.length) settingsQuery = settingsQuery.in('development_id', developmentIds)

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
        if (!normalizedMember) continue
        if (normalizedEmail && normalizedMember.participantEmail !== normalizedEmail) continue
        fallbackRows.push({ ...normalizedMember, developmentId: row.development_id || null, assignmentSource: 'development_default' })
      }
    }
  }

  if (normalizedRole === 'attorney' || !normalizedRole) {
    let attorneyConfigQuery = client
      .from('development_attorney_configs')
      .select('development_id, attorney_firm_name, primary_contact_name, primary_contact_email, is_active')
    if (developmentIds.length) attorneyConfigQuery = attorneyConfigQuery.in('development_id', developmentIds)

    const attorneyResult = await attorneyConfigQuery
    if (
      !attorneyResult.error ||
      !(isMissingTableError(attorneyResult.error, 'development_attorney_configs') || isMissingSchemaError(attorneyResult.error))
    ) {
      if (attorneyResult.error) throw attorneyResult.error
      for (const row of attorneyResult.data || []) {
        const email = normalizeEmailAddress(row?.primary_contact_email)
        if (!email || row?.is_active === false) continue
        if (normalizedEmail && email !== normalizedEmail) continue
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
    if (!row.developmentId) continue
    const comparableRole = normalizeDevelopmentParticipantRoleType(row.roleType)
    const key = `${row.developmentId}:${comparableRole}:${row.participantEmail}`
    if (!deduped.has(key)) deduped.set(key, { ...row, roleType: comparableRole })
  }
  return [...deduped.values()]
}

async function resolveDevelopmentParticipantsByIdentity(
  client,
  { userId = null, participantEmail = '', roleType = null, developmentIds = [] } = {},
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
    if (!deduped.has(key)) deduped.set(key, row)
  }
  return [...deduped.values()]
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
  if (['owner', 'principal', 'director', 'partner', 'hq_manager', 'manager', 'admin', 'admin_staff'].includes(role)) {
    return 'workspace_hq'
  }
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
    return applicationOrganisationId && membershipOrganisationId && applicationOrganisationId === membershipOrganisationId
  })
  if (!matchingMemberships.length) return false

  const applicationRegionId = normalizeTextValue(application?.assigned_region_id)
  const applicationUnitIds = [application?.assigned_workspace_unit_id, application?.assigned_branch_id, application?.assigned_team_id]
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

async function fetchDirectTransactionIdsForUser(
  client,
  { userId = null, participantEmail = '', participantName = '', roleType = null, organisationId = '' } = {},
) {
  const normalizedRole = roleType ? normalizeRoleType(roleType) : null
  const normalizedEmail = normalizeEmailAddress(participantEmail)
  const normalizedName = normalizeTextValue(participantName)
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
  for (const transactionId of legacyTransactionIds) transactionIds.add(transactionId)

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
      if (status === 'removed' || status === 'inactive' || status === 'suspended') continue
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
      if (hasAssignmentAccess && row?.transaction_id) transactionIds.add(row.transaction_id)
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
      ...new Set((membershipsQuery.data || []).map((row) => normalizeNullableUuid(row?.organisation_id)).filter(Boolean)),
    ]
    if (organisationIds.length) {
      let workspaceTransactionsQuery = await client
        .from('transactions')
        .select('id, is_active')
        .in('bond_workspace_id', organisationIds)
      if (workspaceTransactionsQuery.error && isMissingColumnError(workspaceTransactionsQuery.error, 'is_active')) {
        workspaceTransactionsQuery = await client.from('transactions').select('id').in('bond_workspace_id', organisationIds)
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
        (isMissingColumnError(roleplayerQuery.error, 'status') || isMissingColumnError(roleplayerQuery.error, 'assignment_status'))
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

  if (normalizedName && normalizedRole === 'bond_originator') {
    let legacyNameQuery = await client.from('transactions').select('id, is_active').ilike('bond_originator', normalizedName)
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
      if (row?.is_active === false) continue
      if (row?.id) transactionIds.add(row.id)
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
  if (!developmentIds.length) return new Set()

  let query = await client.from('transactions').select('id, development_id, is_active').in('development_id', developmentIds)
  if (query.error && isMissingColumnError(query.error, 'is_active')) {
    query = await client.from('transactions').select('id, development_id').in('development_id', developmentIds)
  }
  if (query.error && isMissingColumnError(query.error, 'development_id')) return new Set()
  if (query.error && !isMissingSchemaError(query.error)) throw query.error

  const ids = new Set()
  for (const row of query.data || []) {
    if (row?.is_active === false) continue
    if (row?.id) ids.add(row.id)
  }
  return ids
}

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

  let query = await client.from('transactions').select('id, organisation_id, is_active').eq('organisation_id', normalizedOrganisationId)
  if (query.error && isMissingColumnError(query.error, 'is_active')) {
    query = await client.from('transactions').select('id, organisation_id').eq('organisation_id', normalizedOrganisationId)
  }
  if (query.error) {
    if (isMissingSchemaError(query.error) || isMissingColumnError(query.error, 'organisation_id')) return []
    throw query.error
  }
  return (query.data || []).filter((row) => row?.id && row?.is_active !== false).map((row) => row.id)
}

async function getAccessibleTransactionIdsForUser({
  userId,
  roleType = null,
  organisationId = '',
  identityContext = null,
  actorRole = null,
} = {}) {
  const client = requireClient()
  if (!userId) return []

  const normalizedRole = roleType ? normalizeRoleType(roleType) : null
  const normalizedOrganisationId = String(organisationId || '').trim()
  const suppliedIdentity = identityContext && typeof identityContext === 'object'
    ? {
        userId: identityContext.userId || identityContext.id || userId,
        email: normalizeEmailAddress(identityContext.email),
        fullName: normalizeTextValue(
          identityContext.fullName || identityContext.full_name || identityContext.name,
        ),
      }
    : null
  const [identity, actorProfile] = await Promise.all([
    suppliedIdentity ? Promise.resolve(suppliedIdentity) : resolveProfileIdentityByUserId(client, userId),
    actorRole
      ? Promise.resolve({ userId, role: normalizeRoleType(actorRole), firmId: null, firmRole: null })
      : resolveActiveProfileContext(client),
  ])

  if (normalizeRoleType(actorProfile.role) === 'internal_admin') {
    let allTransactionsBuilder = client.from('transactions').select('id, organisation_id, is_active')
    if (normalizedOrganisationId) allTransactionsBuilder = allTransactionsBuilder.eq('organisation_id', normalizedOrganisationId)
    let allTransactionsQuery = await allTransactionsBuilder
    if (allTransactionsQuery.error && isMissingColumnError(allTransactionsQuery.error, 'is_active')) {
      let fallbackBuilder = client.from('transactions').select('id, organisation_id')
      if (normalizedOrganisationId) fallbackBuilder = fallbackBuilder.eq('organisation_id', normalizedOrganisationId)
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
      if (isMissingSchemaError(allTransactionsQuery.error)) return []
      throw allTransactionsQuery.error
    }
    return (allTransactionsQuery.data || [])
      .filter((row) => row?.id && row?.is_active !== false)
      .filter((row) => !normalizedOrganisationId || String(row?.organisation_id || '').trim() === normalizedOrganisationId)
      .map((row) => row.id)
  }

  if (normalizedRole === 'bond_originator' && normalizedOrganisationId) {
    const hqMembership = await resolveBondHqOrganisationMembership(client, {
      userId: identity.userId,
      email: identity.email,
      organisationId: normalizedOrganisationId,
    })
    if (hqMembership) return fetchActiveTransactionIdsForOrganisation(client, normalizedOrganisationId)
  }

  const directIds = await fetchDirectTransactionIdsForUser(client, {
    userId: identity.userId,
    participantEmail: identity.email,
    participantName: identity.fullName,
    roleType,
    organisationId: normalizedOrganisationId,
  })
  if (normalizedRole === 'agent') return [...directIds]

  const inheritedIds = await fetchInheritedDevelopmentTransactionIdsForUser(client, {
    userId: identity.userId,
    participantEmail: identity.email,
    roleType,
  })
  const candidateIds = [...new Set([...directIds, ...inheritedIds])]
  if (!candidateIds.length) return []

  let rowsQuery = await client.from('transactions').select('id, owner_user_id, access_level, is_active').in('id', candidateIds)
  if (
    rowsQuery.error &&
    (isMissingColumnError(rowsQuery.error, 'owner_user_id') || isMissingColumnError(rowsQuery.error, 'access_level'))
  ) {
    rowsQuery = await client.from('transactions').select('id, is_active').in('id', candidateIds)
  }

  if (rowsQuery.error) {
    if (isMissingSchemaError(rowsQuery.error)) return candidateIds
    throw rowsQuery.error
  }

  const filtered = []
  for (const row of rowsQuery.data || []) {
    if (!row?.id || row?.is_active === false) continue
    if (directIds.has(row.id)) {
      filtered.push(row.id)
      continue
    }
    if (row.owner_user_id && row.owner_user_id === identity.userId) {
      filtered.push(row.id)
      continue
    }
    if (normalizedRole === 'attorney' && inheritedIds.has(row.id)) {
      filtered.push(row.id)
      continue
    }
    const accessLevel = normalizeTransactionAccessLevel(row.access_level, 'shared')
    if (accessLevel === 'shared' && inheritedIds.has(row.id)) filtered.push(row.id)
  }
  return [...new Set(filtered)]
}

function normalizeBondHybridWorkflowRow(row = {}, profileById = {}) {
  if (!row) return null
  const currentStage = normalizeBondHybridFinanceStage(row.current_stage)
  const lastUpdatedBy = row.last_updated_by || null
  const profile = lastUpdatedBy ? profileById[lastUpdatedBy] : null
  return {
    id: row.id,
    transactionId: row.transaction_id,
    workflowType: row.workflow_type || BOND_HYBRID_FINANCE_WORKFLOW_TYPE,
    currentStage,
    currentStageLabel: getBondHybridFinanceStageLabel(currentStage),
    status: row.status || 'active',
    lastUpdatedBy,
    lastUpdatedByName: profile?.full_name || profile?.name || profile?.email || null,
    lastUpdatedByEmail: profile?.email || null,
    lastUpdatedAt: row.last_updated_at || row.updated_at || row.created_at || null,
    completedAt: row.completed_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  }
}

function normalizeBondInstructionRow(row = {}, profileById = {}) {
  if (!row) return null
  const instructionSentBy = row.instruction_sent_by || null
  const grantReceivedBy = row.grant_received_by || null
  const grantSignedBy = row.grant_signed_by || null
  const grantSubmittedBy = row.grant_submitted_by || null
  return {
    id: row.id,
    transactionId: row.transaction_id,
    acceptedBondOfferId: row.accepted_bond_offer_id || null,
    grantReceived: row.grant_received === true,
    grantReceivedAt: row.grant_received_at || null,
    grantReceivedBy,
    grantReceivedByName: grantReceivedBy ? profileById[grantReceivedBy]?.full_name || profileById[grantReceivedBy]?.email || null : null,
    grantDocumentId: row.grant_document_id || null,
    grantSigned: row.grant_signed === true,
    grantSignedAt: row.grant_signed_at || null,
    grantSignedBy,
    grantSignedByName: grantSignedBy ? profileById[grantSignedBy]?.full_name || profileById[grantSignedBy]?.email || null : null,
    signedGrantDocumentId: row.signed_grant_document_id || null,
    grantSubmitted: row.grant_submitted === true,
    grantSubmittedAt: row.grant_submitted_at || null,
    grantSubmittedBy,
    grantSubmittedByName: grantSubmittedBy ? profileById[grantSubmittedBy]?.full_name || profileById[grantSubmittedBy]?.email || null : null,
    instructionSent: row.instruction_sent === true,
    instructionSentAt: row.instruction_sent_at || null,
    instructionSentBy,
    instructionSentByName: instructionSentBy ? profileById[instructionSentBy]?.full_name || profileById[instructionSentBy]?.email || null : null,
    instructionDocumentId: row.instruction_document_id || null,
    notes: row.notes || '',
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  }
}

async function loadBondHybridFinanceWorkflowSummariesByTransactionIds(client, transactionIds = []) {
  const ids = [...new Set((transactionIds || []).filter(Boolean))]
  if (!ids.length) return {}

  const workflowsQuery = await client
    .from('transaction_finance_workflows')
    .select(
      'id, transaction_id, workflow_type, current_stage, status, last_updated_by, last_updated_at, completed_at, created_at, updated_at',
    )
    .eq('workflow_type', BOND_HYBRID_FINANCE_WORKFLOW_TYPE)
    .in('transaction_id', ids)
  if (workflowsQuery.error) {
    if (
      isMissingTableError(workflowsQuery.error, 'transaction_finance_workflows') ||
      isMissingSchemaError(workflowsQuery.error) ||
      isPermissionDeniedError(workflowsQuery.error)
    ) {
      return {}
    }
    throw workflowsQuery.error
  }

  const instructionsQuery = await client.from('transaction_bond_instructions').select('*').in('transaction_id', ids)
  if (
    instructionsQuery.error &&
    !isMissingTableError(instructionsQuery.error, 'transaction_bond_instructions') &&
    !isMissingSchemaError(instructionsQuery.error) &&
    !isPermissionDeniedError(instructionsQuery.error)
  ) {
    throw instructionsQuery.error
  }

  const workflowsByTransactionId = new Map()
  for (const row of workflowsQuery.data || []) {
    const transactionId = row?.transaction_id
    if (!transactionId) continue
    const existing = workflowsByTransactionId.get(transactionId)
    const existingTimestamp = new Date(existing?.last_updated_at || existing?.updated_at || existing?.created_at || 0).getTime()
    const rowTimestamp = new Date(row?.last_updated_at || row?.updated_at || row?.created_at || 0).getTime()
    if (!existing || rowTimestamp >= existingTimestamp) workflowsByTransactionId.set(transactionId, row)
  }

  const instructionsByTransactionId = new Map()
  if (!instructionsQuery.error) {
    for (const row of instructionsQuery.data || []) {
      const transactionId = row?.transaction_id
      if (!transactionId) continue
      const existing = instructionsByTransactionId.get(transactionId)
      const existingTimestamp = new Date(existing?.updated_at || existing?.created_at || 0).getTime()
      const rowTimestamp = new Date(row?.updated_at || row?.created_at || 0).getTime()
      if (!existing || rowTimestamp >= existingTimestamp) instructionsByTransactionId.set(transactionId, row)
    }
  }

  return ids.reduce((accumulator, transactionId) => {
    const workflow = workflowsByTransactionId.get(transactionId)
    if (!workflow) return accumulator
    const snapshot = {
      workflow: normalizeBondHybridWorkflowRow(workflow),
      applications: [],
      quotes: [],
      offers: [],
      events: [],
      decisions: [],
      acceptedOffer: null,
      instruction: normalizeBondInstructionRow(instructionsByTransactionId.get(transactionId) || null),
    }
    accumulator[transactionId] = {
      ...snapshot,
      steps: buildBondHybridFinanceStageSteps(snapshot),
      summary: summarizeBondHybridFinanceWorkflow(snapshot),
    }
    return accumulator
  }, {})
}

async function loadTransactionDocumentRequestsByIds(client, transactionIds = []) {
  const ids = [...new Set((transactionIds || []).filter(Boolean))]
  if (!ids.length) return {}

  let query = await client
    .from('document_requests')
    .select(
      'id, transaction_id, category, document_type, title, description, notes, priority, due_date, assigned_to_role, assigned_to_user_id, request_group_id, status, requires_review, requested_document_id, created_by, created_by_role, completed_at, rejected_reason, resend_count, last_resent_at, requested_from, visibility_scope, request_type, created_at, updated_at',
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
      isMissingColumnError(query.error, 'last_resent_at') ||
      isMissingColumnError(query.error, 'requested_from') ||
      isMissingColumnError(query.error, 'visibility_scope') ||
      isMissingColumnError(query.error, 'request_type') ||
      isMissingColumnError(query.error, 'notes'))
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
    if (isMissingTableError(query.error, 'document_requests') || isMissingSchemaError(query.error)) return {}
    throw query.error
  }

  const map = {}
  for (const row of query.data || []) {
    const normalized = normalizeDocumentRequestRow(row)
    if (!map[normalized.transactionId]) map[normalized.transactionId] = []
    map[normalized.transactionId].push(normalized)
  }
  return map
}

async function loadBondApplicationScopesByTransactionIds(client, transactionIds = []) {
  const ids = [...new Set((transactionIds || []).filter(Boolean))]
  if (!ids.length) return {}

  let query = await client
    .from('transaction_bond_applications')
    .select(
      'id, transaction_id, application_type, bank_name, assigned_organisation_id, assigned_region_id, assigned_workspace_unit_id, assigned_branch_id, assigned_team_id, assigned_user_id, scope_level, scope_metadata, assignment_status, assignment_source, status, updated_at, created_at',
    )
    .in('transaction_id', ids)
  if (
    query.error &&
    (isMissingColumnError(query.error, 'application_type') ||
      isMissingColumnError(query.error, 'bank_name') ||
      isMissingColumnError(query.error, 'assigned_organisation_id') ||
      isMissingColumnError(query.error, 'assigned_region_id') ||
      isMissingColumnError(query.error, 'assigned_workspace_unit_id') ||
      isMissingColumnError(query.error, 'assigned_branch_id') ||
      isMissingColumnError(query.error, 'assigned_team_id') ||
      isMissingColumnError(query.error, 'assigned_user_id') ||
      isMissingColumnError(query.error, 'scope_level') ||
      isMissingColumnError(query.error, 'scope_metadata') ||
      isMissingColumnError(query.error, 'assignment_status') ||
      isMissingColumnError(query.error, 'assignment_source'))
  ) {
    query = await client
      .from('transaction_bond_applications')
      .select('id, transaction_id, status, updated_at, created_at')
      .in('transaction_id', ids)
  }
  if (query.error) {
    if (
      isMissingTableError(query.error, 'transaction_bond_applications') ||
      isMissingSchemaError(query.error) ||
      isPermissionDeniedError(query.error)
    ) {
      return {}
    }
    throw query.error
  }

  return (query.data || []).reduce((accumulator, row) => {
    if (!row?.transaction_id) return accumulator
    if (!accumulator[row.transaction_id]) accumulator[row.transaction_id] = []
    accumulator[row.transaction_id].push(row)
    return accumulator
  }, {})
}

function scoreBondApplicationScopeRow(row = {}) {
  let score = 0
  const status = normalizeTextValue(row?.assignment_status || row?.status || '').toLowerCase()
  if (!['removed', 'declined', 'rejected', 'inactive', 'suspended'].includes(status)) score += 20
  if (normalizeTextValue(row?.application_type).toLowerCase() === 'originator_intake') score += 10
  if (normalizeTextValue(row?.bank_name).toLowerCase() === 'bond originator intake') score += 10
  if (normalizeTextValue(row?.assigned_organisation_id)) score += 5
  if (normalizeTextValue(row?.assigned_user_id)) score += 3
  if (normalizeTextValue(row?.assigned_workspace_unit_id || row?.assigned_branch_id || row?.assigned_team_id)) score += 2
  if (normalizeTextValue(row?.assigned_region_id)) score += 1
  return score
}

function pickPrimaryBondApplicationScope(applicationRows = []) {
  const rows = (Array.isArray(applicationRows) ? applicationRows : []).filter(Boolean)
  if (!rows.length) return null
  return [...rows].sort((left, right) => {
    const scoreDelta = scoreBondApplicationScopeRow(right) - scoreBondApplicationScopeRow(left)
    if (scoreDelta) return scoreDelta
    return new Date(right?.updated_at || right?.created_at || 0) - new Date(left?.updated_at || left?.created_at || 0)
  })[0]
}

function mergeTransactionBondApplicationScope(transaction = {}, applicationScope = null) {
  if (!applicationScope) return transaction
  return {
    ...transaction,
    assigned_organisation_id: transaction.assigned_organisation_id || applicationScope.assigned_organisation_id || null,
    assigned_region_id: transaction.assigned_region_id || applicationScope.assigned_region_id || null,
    assigned_workspace_unit_id:
      transaction.assigned_workspace_unit_id || applicationScope.assigned_workspace_unit_id || null,
    assigned_branch_id: transaction.assigned_branch_id || applicationScope.assigned_branch_id || null,
    assigned_team_id: transaction.assigned_team_id || applicationScope.assigned_team_id || null,
    assigned_user_id: transaction.assigned_user_id || applicationScope.assigned_user_id || null,
    bond_workspace_id: transaction.bond_workspace_id || applicationScope.assigned_organisation_id || null,
    bond_region_id: transaction.bond_region_id || applicationScope.assigned_region_id || null,
    bond_workspace_unit_id:
      transaction.bond_workspace_unit_id ||
      applicationScope.assigned_workspace_unit_id ||
      applicationScope.assigned_branch_id ||
      applicationScope.assigned_team_id ||
      null,
    bond_assignment_status:
      transaction.bond_assignment_status || applicationScope.assignment_status || applicationScope.status || null,
    bond_assignment_source: transaction.bond_assignment_source || applicationScope.assignment_source || null,
    scope_level: transaction.scope_level || applicationScope.scope_level || null,
    scope_metadata: transaction.scope_metadata || applicationScope.scope_metadata || null,
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

async function enrichRowsWithBondIntakeContext(rows = []) {
  const safeRows = Array.isArray(rows) ? rows : []
  if (!safeRows.length) return safeRows
  const transactionIds = [...new Set(safeRows.map((row) => row?.transaction?.id).filter(Boolean))]
  if (!transactionIds.length) return safeRows
  const client = requireClient()

  const onboardingPromise = (async () => {
    const query = await client
      .from('onboarding_form_data')
      .select('id, transaction_id, purchaser_type, form_data, created_at, updated_at')
      .in('transaction_id', transactionIds)
    if (query.error) {
      if (
        isMissingTableError(query.error, 'onboarding_form_data') ||
        isMissingSchemaError(query.error) ||
        isPermissionDeniedError(query.error)
      ) {
        return {}
      }
      throw query.error
    }
    return (query.data || []).reduce((accumulator, row) => {
      accumulator[row.transaction_id] = row
      return accumulator
    }, {})
  })()

  const documentsPromise = (async () => {
    let query = await client
      .from('documents')
      .select('id, transaction_id, name, category, document_type, status, created_at')
      .in('transaction_id', transactionIds)
    if (
      query.error &&
      (isMissingColumnError(query.error, 'document_type') ||
        isMissingColumnError(query.error, 'status'))
    ) {
      query = await client.from('documents').select('id, transaction_id, name, category, created_at').in('transaction_id', transactionIds)
    }
    if (query.error) {
      if (
        isMissingTableError(query.error, 'documents') ||
        isMissingSchemaError(query.error) ||
        isPermissionDeniedError(query.error)
      ) {
        return {}
      }
      throw query.error
    }
    return (query.data || []).reduce((accumulator, row) => {
      if (!accumulator[row.transaction_id]) accumulator[row.transaction_id] = []
      accumulator[row.transaction_id].push(row)
      return accumulator
    }, {})
  })()

  const documentRequestsPromise = (async () => {
    try {
      return await loadTransactionDocumentRequestsByIds(client, transactionIds)
    } catch (error) {
      if (isMissingTableError(error, 'document_requests') || isMissingSchemaError(error) || isPermissionDeniedError(error)) {
        return {}
      }
      throw error
    }
  })()

  const rolePlayersPromise = (async () => {
    let query = await client
      .from('transaction_role_players')
      .select(
        'id, transaction_id, role_type, selection_source, preferred_partner_id, partner_relationship_id, organisation_id, partner_name, contact_person, email_address, phone_number, status, assignment_status, activation_trigger, removed_at, snapshot_json, created_at, updated_at',
      )
      .in('transaction_id', transactionIds)
    if (
      query.error &&
      (isMissingColumnError(query.error, 'selection_source') ||
        isMissingColumnError(query.error, 'preferred_partner_id') ||
        isMissingColumnError(query.error, 'partner_relationship_id') ||
        isMissingColumnError(query.error, 'partner_name') ||
        isMissingColumnError(query.error, 'contact_person') ||
        isMissingColumnError(query.error, 'email_address') ||
        isMissingColumnError(query.error, 'phone_number') ||
        isMissingColumnError(query.error, 'status') ||
        isMissingColumnError(query.error, 'assignment_status') ||
        isMissingColumnError(query.error, 'activation_trigger') ||
        isMissingColumnError(query.error, 'removed_at') ||
        isMissingColumnError(query.error, 'organisation_id') ||
        isMissingColumnError(query.error, 'snapshot_json'))
    ) {
      query = await client
        .from('transaction_role_players')
        .select('id, transaction_id, role_type, created_at, updated_at')
        .in('transaction_id', transactionIds)
    }
    if (query.error) {
      if (
        isMissingTableError(query.error, 'transaction_role_players') ||
        isMissingSchemaError(query.error) ||
        isPermissionDeniedError(query.error)
      ) {
        return {}
      }
      throw query.error
    }
    return (query.data || []).reduce((accumulator, row) => {
      if (!accumulator[row.transaction_id]) accumulator[row.transaction_id] = []
      accumulator[row.transaction_id].push(row)
      return accumulator
    }, {})
  })()

  const bondApplicationsPromise = loadBondApplicationScopesByTransactionIds(client, transactionIds)
  const bondFinanceWorkflowsPromise = loadBondHybridFinanceWorkflowSummariesByTransactionIds(client, transactionIds)

  const [
    onboardingByTransactionId,
    documentsByTransactionId,
    documentRequestsByTransactionId,
    rolePlayersByTransactionId,
    bondApplicationsByTransactionId,
    bondFinanceWorkflowsByTransactionId,
  ] = await Promise.all([
    onboardingPromise,
    documentsPromise,
    documentRequestsPromise,
    rolePlayersPromise,
    bondApplicationsPromise,
    bondFinanceWorkflowsPromise,
  ])

  return safeRows.map((row) => {
    const transactionId = row?.transaction?.id
    if (!transactionId) return row
    const documentRequests = documentRequestsByTransactionId[transactionId] || []
    const documents = documentsByTransactionId[transactionId] || []
    const bondApplications = bondApplicationsByTransactionId[transactionId] || []
    const primaryBondApplication = pickPrimaryBondApplicationScope(bondApplications)
    return {
      ...row,
      transaction: mergeTransactionBondApplicationScope(row.transaction, primaryBondApplication),
      onboardingFormData: onboardingByTransactionId[transactionId] || null,
      bondApplications,
      primaryBondApplication,
      documentRequests,
      documents,
      rolePlayers: rolePlayersByTransactionId[transactionId] || [],
      transactionFinanceWorkflow:
        bondFinanceWorkflowsByTransactionId[transactionId] || row.transactionFinanceWorkflow || null,
      documentSummary: row.documentSummary || {
        uploadedCount: documents.length,
        totalRequired: documentRequests.length,
        missingCount: Math.max(documentRequests.length - documents.length, 0),
      },
    }
  })
}

async function fetchTransactionSummaryRowsByIds(
  client,
  transactionIds = [],
  { organisationId = '', roleType = null, includeSecondaryData = true } = {},
) {
  const fetchStartedAt = Date.now()
  const ids = [...new Set((transactionIds || []).filter(Boolean))]
  if (!ids.length) return []
  const normalizedOrganisationId = String(organisationId || '').trim()
  const normalizedRoleType = normalizeRoleType(roleType)
  const workspaceScopeColumn = normalizedRoleType === 'bond_originator' ? 'bond_workspace_id' : 'organisation_id'
  const filterWorkspaceInDatabase = Boolean(normalizedOrganisationId && normalizedRoleType !== 'bond_originator')

  let transactionsBuilder = client
    .from('transactions')
    .select(
      selectWithoutKnownMissingColumns(
        includeSecondaryData ? TRANSACTION_SUMMARY_SELECT_CLAUSE : DASHBOARD_CORE_TRANSACTION_SELECT_CLAUSE,
      ),
    )
    .in('id', ids)
  if (filterWorkspaceInDatabase) transactionsBuilder = transactionsBuilder.eq(workspaceScopeColumn, normalizedOrganisationId)
  let transactionsQuery = await transactionsBuilder

  if (transactionsQuery.error && isMissingColumnError(transactionsQuery.error)) {
    if (filterWorkspaceInDatabase && isMissingColumnError(transactionsQuery.error, workspaceScopeColumn)) return []
    registerKnownMissingColumns(transactionsQuery.error, TRANSACTION_SUMMARY_OPTIONAL_COLUMNS)
    let fallbackBuilder = client
      .from('transactions')
      .select(
        selectWithoutKnownMissingColumns(
          includeSecondaryData
            ? TRANSACTION_SUMMARY_FALLBACK_SELECT_CLAUSE
            : DASHBOARD_CORE_TRANSACTION_FALLBACK_SELECT_CLAUSE,
        ),
      )
      .in('id', ids)
    if (filterWorkspaceInDatabase) fallbackBuilder = fallbackBuilder.eq(workspaceScopeColumn, normalizedOrganisationId)
    transactionsQuery = await fallbackBuilder
    if (
      transactionsQuery.error &&
      filterWorkspaceInDatabase &&
      isMissingColumnError(transactionsQuery.error, workspaceScopeColumn)
    ) {
      return []
    }
  }

  if (transactionsQuery.error) throw transactionsQuery.error
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
  if (!transactionRows.length) return []

  const buyerIds = [...new Set(transactionRows.map((item) => item?.buyer_id).filter(Boolean))]
  const unitIds = [...new Set(transactionRows.map((item) => item?.unit_id).filter(Boolean))]
  const developmentIds = [...new Set(transactionRows.map((item) => item?.development_id).filter(Boolean))]
  const [buyersQuery, unitsQuery] = await Promise.all([
    buyerIds.length ? client.from('buyers').select('id, name, email').in('id', buyerIds) : Promise.resolve({ data: [], error: null }),
    fetchTransactionSummaryUnits(client, unitIds),
  ])
  if (buyersQuery.error && !isMissingSchemaError(buyersQuery.error)) throw buyersQuery.error
  if (unitsQuery.error && !isMissingSchemaError(unitsQuery.error)) throw unitsQuery.error

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
    if (unit?.development_id) linkedDevelopmentIds.add(unit.development_id)
  }

  const developmentProfileImagesById = await fetchDashboardDevelopmentProfileImages(client, [...linkedDevelopmentIds])

  let developmentsById = {}
  const allDevelopmentIds = [...linkedDevelopmentIds]
  if (allDevelopmentIds.length) {
    const developmentsQuery = await client.from('developments').select('id, name, location').in('id', allDevelopmentIds)
    if (developmentsQuery.error && !isMissingSchemaError(developmentsQuery.error)) throw developmentsQuery.error
    developmentsById = (developmentsQuery.data || []).reduce((accumulator, item) => {
      accumulator[item.id] = item
      return accumulator
    }, {})
  }

  const rows = transactionRows
    .map((transaction) => {
      const unit = transaction?.unit_id ? unitsById[transaction.unit_id] || null : null
      const developmentId = transaction?.development_id || unit?.development_id || null
      const developmentBase = developmentId ? developmentsById[developmentId] || null : null
      const developmentImageUrl = developmentProfileImagesById.get(String(developmentId || '')) || ''
      const development = developmentBase && developmentImageUrl
        ? { ...developmentBase, cover_image_url: developmentImageUrl }
        : developmentBase
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
        snagSummary: { totalCount: 0, openCount: 0, latestUpdatedAt: null, status: 'clear' },
        onboarding: null,
        documentSummary: { uploadedCount: 0, totalRequired: 0, missingCount: 0 },
      }
    })
    .sort((a, b) => new Date(latestTimestamp(b) || 0) - new Date(latestTimestamp(a) || 0))

  if (!includeSecondaryData) {
    const coreRows = rows.map((row) => ({
      ...row,
      documentSummary: {
        uploadedCount: Number(row?.transaction?.uploaded_documents_count || 0),
        totalRequired: Number(row?.transaction?.total_required_documents || 0),
        missingCount: Number(row?.transaction?.missing_documents_count || 0),
      },
    }))
    return normalizedOrganisationId && normalizedRoleType === 'bond_originator'
      ? coreRows.filter((row) => rowMatchesBondWorkspaceScope(row, normalizedOrganisationId))
      : coreRows
  }

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
    if (!entry || entry.expiresAt <= now) participantSummaryResultCache.delete(key)
  }
}

export async function fetchTransactionsByParticipantSummary({
  userId,
  roleType = null,
  organisationId = '',
  includeSecondaryData = true,
  identityContext = null,
  actorRole = null,
} = {}) {
  const normalizedOrganisationId = String(organisationId || '').trim()
  const normalizedRoleType = roleType ? normalizeRoleType(roleType) : ''
  const requestKey = JSON.stringify({
    userId: String(userId || ''),
    roleType: normalizedRoleType,
    organisationId: normalizedOrganisationId,
    includeSecondaryData,
    actorRole: normalizeRoleType(actorRole || ''),
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
      identityContext,
      actorRole,
    })
    timer.mark('resolve_access_end', { transactionCount: transactionIds.length })
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
      includeSecondaryData,
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
    if (participantSummaryRequests.get(requestKey) === request) participantSummaryRequests.delete(requestKey)
  }
}

export async function fetchTransactionsListSummary({
  developmentId = null,
  organisationId = '',
  stage = 'all',
  financeType = 'all',
  activeTransactionsOnly = true,
  includeSecondaryData = true,
} = {}) {
  const normalizedOrganisationId = String(organisationId || '').trim()
  const timer = createPerfTimer('api.fetchTransactionsListSummary', {
    developmentId: developmentId || 'all',
    organisationId: normalizedOrganisationId,
    stage,
    financeType,
    activeTransactionsOnly,
  })
  const client = requireClient()
  const scopedDevelopmentIds = normalizedOrganisationId
    ? await fetchDevelopmentIdsForOrganisation(client, normalizedOrganisationId)
    : []
  const scopedDevelopmentIdSet = new Set(scopedDevelopmentIds)
  const canScopeByDevelopmentIds = normalizedOrganisationId && scopedDevelopmentIds.length > 0

  let transactionsQuery = client
    .from('transactions')
    .select(selectWithoutKnownMissingColumns(TRANSACTION_SUMMARY_SELECT_CLAUSE))
  if (developmentId) {
    transactionsQuery = transactionsQuery.eq('development_id', developmentId)
  } else if (canScopeByDevelopmentIds) {
    transactionsQuery = transactionsQuery.in('development_id', scopedDevelopmentIds)
  } else if (normalizedOrganisationId) {
    transactionsQuery = transactionsQuery.eq('organisation_id', normalizedOrganisationId)
  }

  const baseResult = await transactionsQuery
  let query = baseResult
  if (query.error && isMissingColumnError(query.error)) {
    if (normalizedOrganisationId && isMissingColumnError(query.error, 'organisation_id')) {
      timer.end({ rowCount: 0, missingOrganisationScope: true })
      return []
    }
    registerKnownMissingColumns(query.error, TRANSACTION_SUMMARY_OPTIONAL_COLUMNS)
    let fallbackQuery = client
      .from('transactions')
      .select(selectWithoutKnownMissingColumns(TRANSACTION_SUMMARY_FALLBACK_SELECT_CLAUSE))
    if (developmentId) {
      fallbackQuery = fallbackQuery.eq('development_id', developmentId)
    } else if (canScopeByDevelopmentIds) {
      fallbackQuery = fallbackQuery.in('development_id', scopedDevelopmentIds)
    } else if (normalizedOrganisationId) {
      fallbackQuery = fallbackQuery.eq('organisation_id', normalizedOrganisationId)
    }
    query = await fallbackQuery
    if (query.error && normalizedOrganisationId && isMissingColumnError(query.error, 'organisation_id')) {
      timer.end({ rowCount: 0, missingOrganisationScope: true })
      return []
    }
  }

  if (query.error) throw query.error

  let transactionRows = (query.data || []).filter((row) => {
    if (activeTransactionsOnly && row?.is_active === false) return false
    if (
      normalizedOrganisationId &&
      String(row?.organisation_id || '').trim() !== normalizedOrganisationId &&
      !scopedDevelopmentIdSet.has(String(row?.development_id || '').trim())
    ) {
      return false
    }
    return true
  })
  if (financeType !== 'all') {
    transactionRows = transactionRows.filter((row) => financeTypeMatchesFilter(row?.finance_type, financeType))
  }

  const buyerIds = [...new Set(transactionRows.map((item) => item?.buyer_id).filter(Boolean))]
  const unitIds = [...new Set(transactionRows.map((item) => item?.unit_id).filter(Boolean))]
  const developmentIds = [...new Set(transactionRows.map((item) => item?.development_id).filter(Boolean))]
  const [buyersQuery, unitsQuery] = await Promise.all([
    buyerIds.length ? client.from('buyers').select('id, name, phone, email').in('id', buyerIds) : Promise.resolve({ data: [], error: null }),
    fetchTransactionSummaryUnits(client, unitIds),
  ])
  if (buyersQuery.error && !isMissingSchemaError(buyersQuery.error)) throw buyersQuery.error
  if (unitsQuery.error && !isMissingSchemaError(unitsQuery.error)) throw unitsQuery.error

  const linkedDevelopmentIds = new Set(developmentIds)
  for (const unit of unitsQuery.data || []) {
    if (unit?.development_id) linkedDevelopmentIds.add(unit.development_id)
  }
  const developmentProfileImagesById = await fetchDashboardDevelopmentProfileImages(client, [...linkedDevelopmentIds])
  const allDevelopmentIds = [...linkedDevelopmentIds]
  const developmentsQuery = allDevelopmentIds.length
    ? await client.from('developments').select('id, name, location').in('id', allDevelopmentIds)
    : { data: [], error: null }
  if (developmentsQuery.error && !isMissingSchemaError(developmentsQuery.error)) throw developmentsQuery.error

  const buyersById = (buyersQuery.data || []).reduce((accumulator, item) => {
    accumulator[item.id] = item
    return accumulator
  }, {})
  const unitsById = (unitsQuery.data || []).reduce((accumulator, item) => {
    accumulator[item.id] = item
    return accumulator
  }, {})
  const developmentsById = (developmentsQuery.data || []).reduce((accumulator, item) => {
    accumulator[item.id] = item
    return accumulator
  }, {})

  let rows = transactionRows.map((transaction) => {
    const unit = transaction?.unit_id ? unitsById[transaction.unit_id] || null : null
    const developmentIdFromRow = transaction?.development_id || unit?.development_id || null
    const developmentBase = developmentIdFromRow ? developmentsById[developmentIdFromRow] || null : null
    const developmentImageUrl = developmentProfileImagesById.get(String(developmentIdFromRow || '')) || ''
    const development = developmentBase && developmentImageUrl
      ? { ...developmentBase, cover_image_url: developmentImageUrl }
      : developmentBase
    const buyer = transaction?.buyer_id ? buyersById[transaction.buyer_id] || null : null
    const resolvedStage = normalizeStage(transaction?.stage, unit?.status || 'Available')
    return {
      unit,
      development,
      transaction,
      buyer,
      stage: resolvedStage,
      mainStage: normalizeMainStage(transaction?.current_main_stage, resolvedStage),
      handover: null,
      snagSummary: { totalCount: 0, openCount: 0, latestUpdatedAt: null, status: 'clear' },
      onboarding: null,
      documentSummary: { uploadedCount: 0, totalRequired: 0, missingCount: 0 },
    }
  })

  if (stage !== 'all') rows = rows.filter((row) => row.stage === stage)
  if (includeSecondaryData) {
    rows = await hydrateRowsWithCommissionSnapshots(client, rows)
    rows = await enrichRowsWithBondIntakeContext(rows)
  }
  rows.sort((left, right) => new Date(latestTimestamp(right) || 0) - new Date(latestTimestamp(left) || 0))
  timer.end({ rowCount: rows.length })
  return rows
}

const dashboardSecondaryRequests = new Map()
const dashboardSecondaryCache = new Map()
const DASHBOARD_SECONDARY_CACHE_TTL_MS = 90 * 1000

export async function enrichDashboardSummaryRows(rows = []) {
  const safeRows = Array.isArray(rows) ? rows : []
  const transactionRows = safeRows.filter((row) => row?.transaction?.id)
  if (!transactionRows.length) return safeRows

  const requestKey = transactionRows
    .map((row) => `${row.transaction.id}:${row.transaction.updated_at || row.transaction.created_at || ''}`)
    .sort()
    .join('|')
  const now = Date.now()
  const cached = dashboardSecondaryCache.get(requestKey)
  if (cached?.expiresAt > now) return cached.rows
  if (dashboardSecondaryRequests.has(requestKey)) return dashboardSecondaryRequests.get(requestKey)

  const request = (async () => {
    const client = requireClient()
    const commissionRows = await hydrateRowsWithCommissionSnapshots(client, transactionRows)
    const enrichedTransactionRows = await enrichRowsWithBondIntakeContext(commissionRows)
    const enrichedById = new Map(
      enrichedTransactionRows.map((row) => [String(row?.transaction?.id || ''), row]),
    )
    const enrichedRows = safeRows.map((row) => {
      const transactionId = String(row?.transaction?.id || '')
      return transactionId ? enrichedById.get(transactionId) || row : row
    })
    dashboardSecondaryCache.set(requestKey, {
      rows: enrichedRows,
      expiresAt: Date.now() + DASHBOARD_SECONDARY_CACHE_TTL_MS,
    })
    return enrichedRows
  })()

  dashboardSecondaryRequests.set(requestKey, request)
  try {
    return await request
  } finally {
    if (dashboardSecondaryRequests.get(requestKey) === request) dashboardSecondaryRequests.delete(requestKey)
  }
}
