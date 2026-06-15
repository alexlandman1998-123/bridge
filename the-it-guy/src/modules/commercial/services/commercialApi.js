import { fetchOrganisationSettings, listOrganisationUsers, updateWorkflowSettings } from '../../../lib/settingsApi'
import { invokeEdgeFunction, isSupabaseConfigured, supabase } from '../../../lib/supabaseClient'
import { recordSecurityAuditEvent } from '../../../services/auditLogService'
import { createBranch, getBranches } from '../../../services/agencyBranchService'
import { isActiveMembershipStatus, normalizeMembershipStatus } from '../../../constants/membershipStatuses'
import { normalizeCommercialLifecycleStage } from '../commercialWorkflow'

const TABLES = {
  companies: 'commercial_companies',
  contacts: 'commercial_contacts',
  landlords: 'commercial_landlords',
  tenants: 'commercial_tenants',
  properties: 'commercial_properties',
  requirements: 'commercial_requirements',
  deals: 'commercial_deals',
  leases: 'commercial_leases',
  vacancies: 'commercial_vacancies',
  listings: 'commercial_listings',
  viewings: 'commercial_viewings',
  transactions: 'commercial_transactions',
  commissions: 'commercial_commissions',
  activity: 'commercial_activity',
  documents: 'commercial_documents',
  documentRequests: 'commercial_document_requests',
  headsOfTerms: 'commercial_heads_of_terms',
}

const SELECTS = {
  companies:
    'id, organisation_id, branch_id, team_id, broker_id, created_at, updated_at, created_by, updated_by, status, notes, company_name, company_type, industry, website, registration_number, vat_number, phone, email, address, city, province, country, primary_contact_id, legacy_source_type, legacy_source_id',
  contacts:
    'id, organisation_id, branch_id, team_id, broker_id, company_id, first_name, last_name, job_title, email, phone, mobile, preferred_contact_method, decision_maker, is_primary, notes, status, legacy_source_type, legacy_source_id, created_at, updated_at, created_by, updated_by',
  landlords:
    'id, organisation_id, branch_id, team_id, broker_id, created_at, updated_at, created_by, updated_by, status, notes, name, contact_person, email, phone, website, landlord_type, portfolio_notes, preferred_contact_method',
  tenants:
    'id, organisation_id, branch_id, team_id, broker_id, created_at, updated_at, created_by, updated_by, status, notes, name, contact_person, email, phone, industry, company_size, current_location, current_lease_expiry, preferred_contact_method',
  properties:
    'id, organisation_id, branch_id, team_id, broker_id, created_at, updated_at, created_by, updated_by, status, notes, landlord_id, property_name, property_type, address, suburb, city, province, country, gla_m2, available_space_m2, vacancy_percentage, zoning, parking_ratio, loading_bays, power_supply, height_m, asking_rental_per_m2, asking_sale_price, number_of_units, building_grade, backup_power, generator, solar, fibre, number_of_lifts, amenities, yard_size_m2, eaves_height_m, roller_doors, truck_access, sprinklers, warehouse_area_m2, office_area_m2, frontage_m, anchor_tenants, foot_traffic, trading_hours, mall_type, visibility_rating, noi, cap_rate, wale_months, gross_yield, net_yield, annual_income, land_size_m2, bulk, coverage, services_available, environmental_status, farm_size_ha, water_rights, irrigation, crop_type, livestock_capacity',
  requirements:
    'id, organisation_id, branch_id, team_id, broker_id, created_at, updated_at, created_by, updated_by, status, notes, requirement_type, client_type, tenant_id, company_id, contact_id, requirement_name, property_type, preferred_locations, min_size_m2, max_size_m2, budget_min, budget_max, target_occupation_date, lease_term_months, special_requirements, assigned_broker, stage',
  deals:
    'id, organisation_id, branch_id, team_id, broker_id, created_at, updated_at, created_by, updated_by, status, notes, deal_name, deal_type, requirement_id, tenant_id, landlord_id, company_id, contact_id, property_id, vacancy_id, listing_id, assigned_broker, stage, deal_value, estimated_commission, expected_close_date, probability_percentage',
  leases:
    'id, organisation_id, branch_id, team_id, broker_id, created_at, updated_at, created_by, updated_by, status, notes, deal_id, heads_of_terms_id, tenant_id, landlord_id, property_id, vacancy_id, lease_start_date, lease_end_date, occupation_date, lease_term_months, monthly_rental, rental_per_m2, escalation_percentage, deposit_amount, tenant_installation_allowance, rent_free_period_months, renewal_option, renewal_notice_date',
  vacancies:
    'id, organisation_id, branch_id, team_id, broker_id, created_at, updated_at, created_by, updated_by, status, notes, property_id, landlord_id, vacancy_name, unit_or_floor, available_area_m2, asking_rental, availability_date, broker_assignment, incentives, fit_out_allowance, marketed_at, occupied_at, withdrawn_at, suspended_at, archived_at',
  listings:
    'id, organisation_id, branch_id, team_id, broker_id, created_at, updated_at, created_by, updated_by, status, notes, landlord_id, property_id, vacancy_id, listing_type, listing_category, listing_status, title, description, pricing, pricing_notes, featured, available_from, metadata_json, marketing_json, media_json, performance_json, internal_reviewed_at, approved_at, published_at, closed_at, expired_at, withdrawn_at',
  viewings:
    'id, organisation_id, branch_id, team_id, broker_id, requirement_id, property_id, vacancy_id, listing_id, company_id, contact_id, viewing_date, viewing_time, status, notes, feedback, created_at, updated_at, created_by, updated_by',
  transactions:
    'id, organisation_id, branch_id, team_id, broker_id, deal_id, requirement_id, property_id, vacancy_id, listing_id, company_id, contact_id, transaction_type, status, transaction_name, target_value, expected_close_date, actual_close_date, notes, created_at, updated_at, created_by, updated_by',
  commissions:
    'id, organisation_id, branch_id, team_id, broker_id, transaction_id, commission_percent, commission_amount, status, manual_override, created_at, updated_at, created_by, updated_by',
  activity:
    'id, organisation_id, branch_id, team_id, broker_id, entity_type, entity_id, activity_type, title, body, metadata, created_at, created_by',
  documents:
    'id, organisation_id, branch_id, team_id, broker_id, entity_type, entity_id, document_name, category, status, notes, file_name, file_path, file_bucket, file_size, mime_type, uploaded_by, uploaded_at, archived_at, version_number, supersedes_document_id, expires_at, reviewed_by, reviewed_at, created_at, updated_at, created_by, updated_by',
  documentRequests:
    'id, organisation_id, branch_id, team_id, broker_id, entity_type, entity_id, document_name, category, requested_from, due_date, priority, requested_by, completed_document_id, notes, status, created_at, updated_at, created_by, updated_by',
  headsOfTerms:
    'id, organisation_id, branch_id, team_id, broker_id, deal_id, tenant_id, landlord_id, property_id, vacancy_id, premises_description, lease_commencement_date, lease_term_months, monthly_rental, rental_per_m2, escalation_percentage, deposit_amount, tenant_installation_allowance, rent_free_period_months, beneficial_occupation_date, permitted_use, special_conditions, broker_commission_notes, status, sent_at, accepted_at, rejected_at, signed_at, converted_at, created_at, updated_at, created_by, updated_by',
}

const COMMERCIAL_DOCUMENT_BUCKET_CANDIDATES = ['documents', 'transaction-documents', 'private-listing-documents']
const COMMERCIAL_PORTAL_ACCESS_TABLE = 'commercial_portal_access'
const COMMERCIAL_PORTAL_CONTACTS_TABLE = 'commercial_portal_contacts'
const COMMERCIAL_PORTAL_NOTIFICATIONS_TABLE = 'commercial_portal_notifications'
const COMMERCIAL_HIERARCHY_COLUMNS = ['branch_id', 'team_id', 'broker_id']
const COMMERCIAL_DOCUMENT_WORKFLOW_COLUMNS = ['version_number', 'supersedes_document_id', 'expires_at', 'reviewed_by', 'reviewed_at', 'priority', 'requested_by', 'completed_document_id']
const COMMERCIAL_LEASING_WORKFLOW_COLUMNS = ['vacancy_id', 'heads_of_terms_id', 'sent_at', 'accepted_at', 'rejected_at', 'signed_at', 'converted_at']
const COMMERCIAL_SCOPE_CACHE_TTL_MS = 60 * 1000
const COMMERCIAL_PLATFORM_INSTALL_CACHE_TTL_MS = 5 * 60 * 1000
const COMMERCIAL_MODULE_KEY = 'commercial'
export const COMMERCIAL_PLATFORM_INSTALL_ERROR_MESSAGE = 'Commercial is not installed on this environment. Contact platform support.'
const COMMERCIAL_PLATFORM_MIGRATION_GUIDE = Object.freeze({
  'commercial organisation module entitlement': '202606100002_commercial_organisation_modules_phase3.sql',
  'organisation commercial activation columns': '202606080001_commercial_brokerage_hierarchy.sql',
  'commercial teams': '202606080001_commercial_brokerage_hierarchy.sql',
  commercial_listings: '202606080002_commercial_listings_foundation.sql',
  commercial_viewings: '202606110003_commercial_viewings_phase1.sql',
  commercial_transactions: '202606110004_commercial_transactions_phase2.sql',
  commercial_companies: '202606110005_commercial_crm_foundation_phase3.sql',
  commercial_contacts: '202606110005_commercial_crm_foundation_phase3.sql',
  commercial_commissions: '202606110007_commercial_brokerage_os_phase5.sql',
  'commercial access request workflow': '202606100003_commercial_access_requests_phase4.sql',
})
const COMMERCIAL_HQ_ROLES = new Set(['owner', 'principal', 'director', 'partner', 'admin', 'admin_staff', 'manager', 'hq_manager', 'commercial_hq_admin', 'commercial_hq_manager', 'super_admin'])
const COMMERCIAL_BRANCH_ROLES = new Set(['branch_manager', 'branch_admin', 'regional_manager'])
const COMMERCIAL_TEAM_ROLES = new Set(['team_leader', 'team_manager', 'commercial_team_leader'])
const COMMERCIAL_BROKER_ROLES = new Set(['broker', 'commercial_broker', 'agent', 'senior_agent'])
const COMMERCIAL_MODULE_MARKERS = new Set(['commercial', 'commercial_brokerage', 'commercial_agency'])
const COMMERCIAL_ACCESS_REVIEWER_ROLES = new Set(['owner', 'principal', 'director', 'partner', 'admin', 'super_admin'])
const COMMERCIAL_ACCESS_AUDIT_ACTIONS = Object.freeze({
  requested: 'commercial_access_requested',
  approved: 'commercial_access_approved',
  rejected: 'commercial_access_rejected',
  reminded: 'commercial_access_reminded',
  moduleEnabled: 'commercial_module_enabled',
  moduleDisabled: 'commercial_module_disabled',
  userGranted: 'commercial_user_access_granted',
  userRevoked: 'commercial_user_access_revoked',
})
const COMMERCIAL_ACCESS_AUDIT_ACTION_LIST = Object.freeze(Object.values(COMMERCIAL_ACCESS_AUDIT_ACTIONS))
const REQUIRED_COMMERCIAL_CORE_PLATFORM_PROBES = [
  { table: 'organisation_modules', fields: 'id, organisation_id, module_key, status, source, metadata', label: 'commercial organisation module entitlement' },
  { table: 'organisation_users', fields: 'id, module_context, module_metadata', label: 'organisation commercial activation columns' },
  { table: 'commercial_teams', fields: 'id', label: 'commercial teams' },
  ...Object.values(TABLES).map((table) => ({ table, fields: 'id', label: table })),
]
const REQUIRED_COMMERCIAL_ACCESS_WORKFLOW_PROBES = [
  { table: 'commercial_access_requests', fields: 'id, organisation_id, requester_user_id, status', label: 'commercial access request workflow' },
]
let commercialScopeCache = null
let commercialScopeInflight = null
let commercialPlatformInstallCache = null
let commercialPlatformInstallInflight = null

export const COMMERCIAL_TABLES = TABLES

function buildCommercialPlatformMigrationHint(missing = []) {
  const migrations = Array.from(
    new Set(
      (Array.isArray(missing) ? missing : [])
        .map((label) => COMMERCIAL_PLATFORM_MIGRATION_GUIDE[label])
        .filter(Boolean),
    ),
  )

  if (!migrations.length) return ''
  return `Apply Commercial migrations: ${migrations.join(', ')}`
}

const ENTITY_TYPES = {
  companies: 'commercial_company',
  contacts: 'commercial_contact',
  landlords: 'commercial_landlord',
  tenants: 'commercial_tenant',
  properties: 'commercial_property',
  requirements: 'commercial_requirement',
  deals: 'commercial_deal',
  leases: 'commercial_lease',
  vacancies: 'commercial_vacancy',
  listings: 'commercial_listing',
  viewings: 'commercial_viewing',
  transactions: 'commercial_transaction',
  commissions: 'commercial_commission',
  documents: 'commercial_document',
  documentRequests: 'commercial_document_request',
}

const NAME_FIELDS = {
  companies: 'company_name',
  contacts: 'name',
  landlords: 'name',
  tenants: 'name',
  properties: 'property_name',
  requirements: 'requirement_name',
  deals: 'deal_name',
  leases: 'id',
  vacancies: 'vacancy_name',
  listings: 'title',
  viewings: 'viewing_date',
  transactions: 'transaction_name',
  commissions: 'id',
  documents: 'document_name',
  documentRequests: 'document_name',
}

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase()
}

function parseJsonObject(value) {
  if (!value) return {}
  if (typeof value === 'object' && !Array.isArray(value)) return value
  if (typeof value !== 'string') return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function uniqueValues(values = []) {
  return [...new Set((values || []).map((value) => normalizeText(value)).filter(Boolean))]
}

function normalizeCommercialBusinessModel(value = '', fallback = 'sales_leasing') {
  const normalized = normalizeLower(value)
  if (['sales', 'leasing', 'sales_leasing'].includes(normalized)) return normalized
  return fallback
}

function normalizeCommercialBranchMode(value = '', fallback = 'existing') {
  const normalized = normalizeLower(value)
  if (['existing', 'dedicated'].includes(normalized)) return normalized
  return fallback
}

function normalizeCommercialWorkspaceFeatureSelections(input = {}) {
  const source = input && typeof input === 'object' ? input : {}
  return {
    commercialListings: true,
    commercialPipeline: true,
    brokerageReporting: true,
    commercialLeasing: source.commercialLeasing !== false,
    headsOfTerms: source.headsOfTerms !== false,
    tenantManagement: Boolean(source.tenantManagement),
    commercialDocumentCentre: source.commercialDocumentCentre !== false,
  }
}

function resolveCommercialWorkspaceEnabledFeatureKeys(featureSelections = {}) {
  return Object.entries(normalizeCommercialWorkspaceFeatureSelections(featureSelections))
    .filter(([, enabled]) => Boolean(enabled))
    .map(([key]) => key)
}

function buildCommercialWorkspaceTeamAccessEntry(input = {}) {
  const email = normalizeEmail(input.email)
  const fullName = normalizeText(input.fullName || input.name || [input.firstName, input.lastName].filter(Boolean).join(' '))
  return {
    organisationUserId: normalizeText(input.organisationUserId || input.id),
    userId: normalizeText(input.userId),
    email,
    fullName,
    role: normalizeLower(input.role || input.workspaceRole || input.organisationRole),
    status: normalizeLower(input.status || (email ? 'pending' : 'selected')) || 'selected',
    source: normalizeText(input.source) || 'commercial_workspace_enablement',
    grantedAt: input.grantedAt || input.activatedAt || new Date().toISOString(),
  }
}

function getCommercialWorkspaceTeamAccessEntryKey(entry = {}) {
  return normalizeText(entry.organisationUserId || entry.id) ||
    normalizeText(entry.userId) ||
    normalizeEmail(entry.email)
}

function normalizeCommercialWorkspaceTeamAccessEntries(entries = []) {
  const map = new Map()
  for (const entry of Array.isArray(entries) ? entries : []) {
    const normalizedEntry = buildCommercialWorkspaceTeamAccessEntry(entry)
    const key = getCommercialWorkspaceTeamAccessEntryKey(normalizedEntry)
    if (!key) continue
    map.set(key, normalizedEntry)
  }
  return [...map.values()]
}

function mergeCommercialWorkspaceTeamAccessEntries(existingEntries = [], incomingEntries = []) {
  const map = new Map()
  for (const entry of normalizeCommercialWorkspaceTeamAccessEntries(existingEntries)) {
    map.set(getCommercialWorkspaceTeamAccessEntryKey(entry), entry)
  }
  for (const entry of normalizeCommercialWorkspaceTeamAccessEntries(incomingEntries)) {
    map.set(getCommercialWorkspaceTeamAccessEntryKey(entry), entry)
  }
  return [...map.values()]
}

function removeCommercialWorkspaceTeamAccessEntries(existingEntries = [], matcher = {}) {
  const safeOrganisationUserId = normalizeText(matcher.organisationUserId || matcher.id)
  const safeUserId = normalizeText(matcher.userId)
  const safeEmail = normalizeEmail(matcher.email)

  return normalizeCommercialWorkspaceTeamAccessEntries(existingEntries).filter((entry) => {
    if (safeOrganisationUserId && normalizeText(entry.organisationUserId) === safeOrganisationUserId) return false
    if (safeUserId && normalizeText(entry.userId) === safeUserId) return false
    if (safeEmail && normalizeEmail(entry.email) === safeEmail) return false
    return true
  })
}

function getCommercialWorkspaceTeamAccessEntries(settings = {}) {
  const commercialWorkspace = parseJsonObject(parseJsonObject(settings).commercialWorkspace)
  return normalizeCommercialWorkspaceTeamAccessEntries(
    commercialWorkspace.teamAccess ||
      commercialWorkspace.userAccess ||
      commercialWorkspace.selectedUsers,
  )
}

function hasCommercialWorkspacePlannedAccess(settings = {}, identifiers = {}) {
  const safeOrganisationUserId = normalizeText(identifiers.organisationUserId || identifiers.id)
  const safeUserId = normalizeText(identifiers.userId)
  const safeEmail = normalizeEmail(identifiers.email)

  return getCommercialWorkspaceTeamAccessEntries(settings).some((entry) => {
    if (safeOrganisationUserId && normalizeText(entry.organisationUserId) === safeOrganisationUserId) return true
    if (safeUserId && normalizeText(entry.userId) === safeUserId) return true
    if (safeEmail && normalizeEmail(entry.email) === safeEmail) return true
    return false
  })
}

function resolveCommercialAgencyTypeForWorkspace(settings = {}) {
  const normalizedSettings = parseJsonObject(settings)
  const currentAgencyType = normalizeLower(
    normalizedSettings.agencyType ||
      parseJsonObject(normalizedSettings.agencyOnboarding).agencyInformation?.agencyType,
  )
  if (['commercial', 'mixed'].includes(currentAgencyType)) return currentAgencyType
  return 'mixed'
}

function resolveCommercialWorkspaceModeForAgencyType(agencyType = '') {
  const normalizedAgencyType = normalizeLower(agencyType)
  if (normalizedAgencyType === 'commercial') return 'commercial_only'
  if (normalizedAgencyType === 'mixed') return 'mixed_residential_commercial'
  return 'residential_only'
}

function normalizeCommercialWorkspaceBranchDraft(branch = {}) {
  return {
    ...parseJsonObject(branch),
    id: normalizeText(branch.id),
    branchName: normalizeText(branch.branchName || branch.name),
    officeLocation: normalizeText(branch.officeLocation || branch.location),
    branchManager: normalizeText(branch.branchManager || branch.managerName || branch.manager_name),
    numberOfAgents: normalizeText(branch.numberOfAgents),
  }
}

function getCommercialWorkspaceBranchDraftKey(branch = {}) {
  return normalizeText(branch.id) || normalizeLower(branch.branchName || branch.name)
}

function normalizeCommercialWorkspaceBranchDrafts(branches = []) {
  const map = new Map()
  for (const branch of Array.isArray(branches) ? branches : []) {
    const normalizedBranch = normalizeCommercialWorkspaceBranchDraft(branch)
    const key = getCommercialWorkspaceBranchDraftKey(normalizedBranch)
    if (!key || !normalizedBranch.branchName) continue
    map.set(key, normalizedBranch)
  }
  return [...map.values()]
}

function mergeCommercialWorkspaceBranchDrafts(existingBranches = [], incomingBranches = []) {
  const map = new Map()
  for (const branch of normalizeCommercialWorkspaceBranchDrafts(existingBranches)) {
    map.set(getCommercialWorkspaceBranchDraftKey(branch), branch)
  }
  for (const branch of normalizeCommercialWorkspaceBranchDrafts(incomingBranches)) {
    const key = getCommercialWorkspaceBranchDraftKey(branch)
    const existing = map.get(key) || {}
    map.set(key, {
      ...existing,
      ...branch,
      id: normalizeText(branch.id) || normalizeText(existing.id),
      branchName: normalizeText(branch.branchName) || normalizeText(existing.branchName),
      officeLocation: normalizeText(branch.officeLocation) || normalizeText(existing.officeLocation),
      branchManager: normalizeText(branch.branchManager) || normalizeText(existing.branchManager),
      numberOfAgents: normalizeText(branch.numberOfAgents) || normalizeText(existing.numberOfAgents),
    })
  }
  return [...map.values()]
}

async function syncCommercialWorkspaceTeamAccessEntries({ context = null, addEntries = [], removeEntry = null } = {}) {
  const resolvedContext = context || await resolveCommercialOrganisationContext()
  if (!resolvedContext.organisationId) return []

  const currentSettings = parseJsonObject(resolvedContext.organisationSettings)
  const commercialWorkspace = parseJsonObject(currentSettings.commercialWorkspace)
  const mergedEntries = removeEntry
    ? removeCommercialWorkspaceTeamAccessEntries(getCommercialWorkspaceTeamAccessEntries(currentSettings), removeEntry)
    : mergeCommercialWorkspaceTeamAccessEntries(getCommercialWorkspaceTeamAccessEntries(currentSettings), addEntries)

  await updateWorkflowSettings({
    enabledModules: {
      ...(parseJsonObject(currentSettings.enabledModules)),
      commercial: parseJsonObject(currentSettings.enabledModules).commercial !== false,
    },
    commercialWorkspace: {
      ...commercialWorkspace,
      teamAccess: mergedEntries,
    },
  })

  return mergedEntries
}

function isCommercialEnabledInOrganisationSettings(settings = {}) {
  const normalizedSettings = parseJsonObject(settings)
  const enabledModules = parseJsonObject(normalizedSettings.enabledModules)
  const commercialWorkspace = parseJsonObject(normalizedSettings.commercialWorkspace)
  const agencyOnboarding = parseJsonObject(normalizedSettings.agencyOnboarding)
  const agencyType = normalizeLower(
    normalizedSettings.agencyType ||
      agencyOnboarding.agencyInformation?.agencyType ||
      commercialWorkspace.mode,
  )
  const workspaceStatus = normalizeLower(commercialWorkspace.status)
  const workspaceMode = normalizeLower(commercialWorkspace.mode)

  return enabledModules.commercial === true ||
    workspaceStatus === 'active' ||
    ['commercial', 'mixed'].includes(agencyType) ||
    ['commercial_only', 'mixed_residential_commercial'].includes(workspaceMode)
}

export function isCommercialMembershipRow(member = {}) {
  const metadata = parseJsonObject(member.metadata || member.metadata_json || member.module_metadata || member.moduleMetadata)
  const moduleValue = normalizeLower(
    member.module_context ||
      member.moduleContext ||
      member.module ||
      member.module_type ||
      member.moduleType ||
      metadata.module ||
      metadata.module_context,
  )
  if (COMMERCIAL_MODULE_MARKERS.has(moduleValue)) return true

  const workspaceType = normalizeLower(member.workspace_type || member.workspaceType)
  if (COMMERCIAL_MODULE_MARKERS.has(workspaceType)) return true

  const role = normalizeLower(member.workspace_role || member.workspaceRole || member.organisation_role || member.organisationRole || member.role)
  return role.startsWith('commercial_') || role.includes('commercial_broker')
}

function pickPreferredOrganisationMembership(rows = [], matcher = null) {
  const matchingRows = (Array.isArray(rows) ? rows : []).filter((row) => {
    if (!row) return false
    return typeof matcher === 'function' ? matcher(row) : true
  })

  if (!matchingRows.length) return null
  return (
    matchingRows.find((row) => isActiveMembershipStatus(row?.status)) ||
    matchingRows.find((row) => normalizeMembershipStatus(row?.status) === 'pending') ||
    matchingRows[0] ||
    null
  )
}

function toNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function addMonthsToDate(value, months) {
  const date = value ? new Date(value) : new Date()
  if (Number.isNaN(date.getTime())) return null
  const next = new Date(date)
  next.setMonth(next.getMonth() + Number(months || 0))
  return next.toISOString().slice(0, 10)
}

function transactionTypeFromRecord(...records) {
  for (const record of records) {
    const dealType = normalizeLower(record?.transaction_type || record?.deal_type || record?.listing_type || record?.requirement_type)
    if (['sale', 'purchase', 'investment', 'development'].includes(dealType)) return 'sale'
    if (['lease', 'rental'].includes(dealType)) return 'lease'
  }
  return 'lease'
}

function normalizeCommercialTransactionStatus(value, fallback = 'draft') {
  const normalized = normalizeCommercialLifecycleStage('transactions', value, fallback)
  return ['draft', 'negotiating', 'hot_in_progress', 'hot_signed', 'lease_pending', 'sale_pending', 'completed', 'lost', 'cancelled'].includes(normalized)
    ? normalized
    : fallback
}

function normalizeCommercialVacancyStatus(value, fallback = 'draft') {
  const normalized = normalizeCommercialLifecycleStage('vacancies', value, fallback)
  return ['draft', 'available', 'marketing', 'under_negotiation', 'hot_in_progress', 'occupied', 'withdrawn', 'suspended', 'archived'].includes(normalized)
    ? normalized
    : fallback
}

function normalizeCommercialListingStatus(value, fallback = 'draft') {
  const normalized = normalizeCommercialLifecycleStage('listings', value, fallback)
  return ['draft', 'internal_review', 'approved', 'published', 'under_offer', 'closed', 'withdrawn', 'expired', 'archived'].includes(normalized)
    ? normalized
    : fallback
}

function vacancyBlocksNewMarketing(status = '') {
  return ['occupied', 'archived', 'withdrawn', 'suspended'].includes(normalizeCommercialVacancyStatus(status, 'draft'))
}

function transactionNameFromLinks({
  payload = {},
  deal = null,
  requirement = null,
  listing = null,
  vacancy = null,
  property = null,
  company = null,
} = {}) {
  return normalizeText(
    payload.transaction_name ||
      payload.transactionName ||
      deal?.deal_name ||
      listing?.title ||
      requirement?.requirement_name ||
      [company?.name, vacancy?.vacancy_name || property?.property_name].filter(Boolean).join(' · ') ||
      vacancy?.vacancy_name ||
      property?.property_name,
  ) || 'Commercial transaction'
}

function buildCommercialContactName(row = {}) {
  return normalizeText(
    [row.first_name, row.last_name].map(normalizeText).filter(Boolean).join(' ') ||
    row.name ||
    row.email ||
    row.mobile ||
    row.phone,
  ) || 'Commercial contact'
}

function normalizeCommercialCompanyRow(row = {}) {
  if (!row?.id) return row
  const name = normalizeText(row.company_name || row.name)
  return {
    ...row,
    name,
    company_name: name,
    display_name: name,
  }
}

function normalizeCommercialContactRow(row = {}) {
  if (!row?.id) return row
  const name = buildCommercialContactName(row)
  return {
    ...row,
    name,
    contact_name: name,
    display_name: name,
    contact_person: name,
  }
}

function companyLegacyId(company = {}, sourceType = '') {
  return normalizeLower(company?.legacy_source_type) === normalizeLower(sourceType) ? normalizeText(company?.legacy_source_id) : ''
}

async function findCommercialRecordById(kind, id, organisationId = '') {
  const recordId = normalizeText(id)
  if (!recordId) return null
  const rows = await listCommercialRecords(kind, organisationId)
  return rows.find((row) => row.id === recordId) || null
}

function entityTypeForKind(kind) {
  return ENTITY_TYPES[kind] || `commercial_${kind || 'record'}`
}

function displayNameForRecord(kind, record = {}) {
  if (kind === 'viewings') {
    const datePart = normalizeText(record?.viewing_date)
    const timePart = normalizeText(record?.viewing_time).slice(0, 5)
    return [datePart, timePart].filter(Boolean).join(' ') || normalizeText(record?.id) || 'Commercial viewing'
  }
  const field = NAME_FIELDS[kind]
  return normalizeText(record?.[field]) || normalizeText(record?.display_name) || normalizeText(record?.id) || 'Commercial record'
}

function changedPayloadKeys(payload = {}) {
  return Object.keys(payload).filter((key) => !['updated_by', 'updatedBy'].includes(key))
}

function isMissingCommercialTableError(error) {
  if (!error) return false
  const code = normalizeText(error?.code).toUpperCase()
  const message = normalizeLower(error?.message)
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    message.includes('does not exist') ||
    (message.includes('schema cache') && message.includes('commercial_'))
  )
}

function isCommercialSchemaMismatchError(error) {
  if (!error) return false
  const code = normalizeText(error?.code).toUpperCase()
  const message = normalizeLower(error?.message)
  return code === 'PGRST204' || code === '42703' || message.includes('schema cache') || message.includes('column')
}

function getMissingCommercialColumn(error) {
  const message = String(error?.message || '')
  const details = String(error?.details || '')
  const quotedMatch = message.match(/'([a-zA-Z0-9_]+)'/) || details.match(/column\s+"?([a-zA-Z0-9_]+)"?/i)
  return quotedMatch?.[1] || ''
}

function withoutSelectColumns(fields, columns = []) {
  const blocked = new Set(columns.filter(Boolean))
  return String(fields || '')
    .split(',')
    .map((field) => field.trim())
    .filter((field) => field && !blocked.has(field))
    .join(', ')
}

function isAuthSessionMissingError(error) {
  const message = normalizeLower(error?.message)
  return message.includes('auth session missing') || message.includes('missing auth session')
}

function isUniqueConstraintError(error) {
  return normalizeText(error?.code).toUpperCase() === '23505' || normalizeLower(error?.message).includes('duplicate key')
}

function isMissingAuditSchemaError(error) {
  if (!error) return false
  const code = normalizeText(error?.code).toUpperCase()
  const message = normalizeLower(`${error.message || ''} ${error.details || ''} ${error.hint || ''}`)
  return code === '42P01' || code === 'PGRST205' || message.includes('security_audit_events')
}

function isMissingCommercialNotificationError(error) {
  if (!error) return false
  const code = normalizeText(error?.code).toUpperCase()
  const message = normalizeLower(`${error.message || ''} ${error.details || ''} ${error.hint || ''}`)
  return (
    code === '42P01' ||
    code === 'PGRST202' ||
    code === 'PGRST205' ||
    message.includes('bridge_notify_commercial_access_request') ||
    message.includes('bridge_notify_commercial_access_decision') ||
    message.includes('bridge_notify_commercial_viewing') ||
    message.includes('bridge_notify_commercial_transaction') ||
    message.includes('bridge_nudge_commercial_access_request') ||
    message.includes('transaction_notifications')
  )
}

function createCommercialPlatformInstallError(status = {}) {
  const missing = Array.isArray(status?.missing) ? status.missing.filter(Boolean) : []
  const error = new Error(COMMERCIAL_PLATFORM_INSTALL_ERROR_MESSAGE)
  error.code = 'commercial_platform_not_installed'
  error.installStatus = status
  const migrationHint = buildCommercialPlatformMigrationHint(missing)
  error.details = missing.length
    ? `Missing commercial setup: ${missing.join(', ')}${migrationHint ? `. ${migrationHint}` : ''}`
    : COMMERCIAL_PLATFORM_INSTALL_ERROR_MESSAGE
  return error
}

export function isCommercialPlatformInstallError(error) {
  return normalizeText(error?.code) === 'commercial_platform_not_installed' ||
    normalizeText(error?.message) === COMMERCIAL_PLATFORM_INSTALL_ERROR_MESSAGE
}

export async function getCommercialPlatformInstallStatus({ forceRefresh = false } = {}) {
  if (!isSupabaseConfigured || !supabase) {
    return {
      installed: false,
      reason: 'supabase_not_configured',
      missing: ['Supabase connection'],
      message: 'Commercial setup requires Supabase to be configured.',
    }
  }

  if (!forceRefresh && commercialPlatformInstallCache && commercialPlatformInstallCache.expiresAt > Date.now()) {
    return commercialPlatformInstallCache.value
  }
  if (!forceRefresh && commercialPlatformInstallInflight) return commercialPlatformInstallInflight

  commercialPlatformInstallInflight = (async () => {
    const missing = []
    for (const probe of REQUIRED_COMMERCIAL_CORE_PLATFORM_PROBES) {
      const result = await supabase
        .from(probe.table)
        .select(probe.fields)
        .limit(1)

      if (!result.error) continue
      if (isMissingCommercialTableError(result.error) || isCommercialSchemaMismatchError(result.error)) {
        missing.push(probe.label)
        continue
      }
      throw result.error
    }

    const status = {
      installed: missing.length === 0,
      reason: missing.length ? 'schema_missing' : 'installed',
      missing,
      message: missing.length ? COMMERCIAL_PLATFORM_INSTALL_ERROR_MESSAGE : '',
    }
    commercialPlatformInstallCache = { value: status, expiresAt: Date.now() + COMMERCIAL_PLATFORM_INSTALL_CACHE_TTL_MS }
    return status
  })().finally(() => {
    commercialPlatformInstallInflight = null
  })

  return commercialPlatformInstallInflight
}

async function assertCommercialPlatformInstalled({ forceRefresh = false } = {}) {
  const status = await getCommercialPlatformInstallStatus({ forceRefresh })
  if (!status.installed) throw createCommercialPlatformInstallError(status)
  return status
}

async function assertCommercialAccessWorkflowInstalled({ forceRefresh = false } = {}) {
  await assertCommercialPlatformInstalled({ forceRefresh })
  const missing = []
  for (const probe of REQUIRED_COMMERCIAL_ACCESS_WORKFLOW_PROBES) {
    const result = await supabase
      .from(probe.table)
      .select(probe.fields)
      .limit(1)

    if (!result.error) continue
    if (isMissingCommercialTableError(result.error) || isCommercialSchemaMismatchError(result.error)) {
      missing.push(probe.label)
      continue
    }
    throw result.error
  }

  if (missing.length) {
    throw createCommercialPlatformInstallError({
      installed: false,
      reason: 'access_workflow_missing',
      missing,
    })
  }
}

function createCommercialOrganisationDisabledStatus(organisationId = '', row = null) {
  return {
    organisationId: normalizeText(organisationId),
    moduleKey: COMMERCIAL_MODULE_KEY,
    enabled: false,
    status: normalizeLower(row?.status) || 'disabled',
    source: normalizeText(row?.source),
    row,
  }
}

export async function getCommercialOrganisationModuleStatus({ organisationId = '', forceRefresh = false } = {}) {
  await assertCommercialPlatformInstalled({ forceRefresh })
  const resolvedOrganisationId = normalizeText(organisationId) || normalizeText((await resolveCommercialOrganisationContext()).organisationId)
  if (!resolvedOrganisationId || !isSupabaseConfigured || !supabase) {
    return createCommercialOrganisationDisabledStatus(resolvedOrganisationId)
  }

  const query = await supabase
    .from('organisation_modules')
    .select('id, organisation_id, module_key, status, source, enabled_by, enabled_at, requested_by, requested_at, disabled_by, disabled_at, metadata')
    .eq('organisation_id', resolvedOrganisationId)
    .eq('module_key', COMMERCIAL_MODULE_KEY)
    .maybeSingle()

  if (query.error) {
    if (isMissingCommercialTableError(query.error) || isCommercialSchemaMismatchError(query.error)) {
      throw createCommercialPlatformInstallError({
        installed: false,
        reason: 'schema_missing',
        missing: ['commercial organisation module entitlement'],
      })
    }
    throw query.error
  }

  const row = query.data || null
  const status = normalizeLower(row?.status) || 'disabled'
  return {
    organisationId: resolvedOrganisationId,
    moduleKey: COMMERCIAL_MODULE_KEY,
    enabled: status === 'active',
    status,
    source: normalizeText(row?.source),
    row,
  }
}

function normalizeCommercialAccessRequest(row = {}) {
  const metadata = parseJsonObject(row.metadata)
  return {
    id: normalizeText(row.id),
    organisationId: normalizeText(row.organisation_id),
    requesterUserId: normalizeText(row.requester_user_id),
    requesterMembershipId: normalizeText(row.requester_membership_id),
    requesterEmail: normalizeText(row.requester_email),
    requesterName: normalizeText(row.requester_name),
    moduleKey: normalizeText(row.module_key) || COMMERCIAL_MODULE_KEY,
    status: normalizeLower(row.status || 'pending'),
    message: normalizeText(row.request_message),
    principalNote: normalizeText(row.principal_note),
    reviewedBy: normalizeText(row.reviewed_by),
    reviewedAt: row.reviewed_at || null,
    metadata,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  }
}

function buildCommercialAccessRequestMetadata({ scope = {}, organisationModuleStatus = null } = {}) {
  return {
    source: 'commercial_blocked_access_prompt',
    organisation_module_status: organisationModuleStatus?.status || 'disabled',
    organisation_module_source: organisationModuleStatus?.source || '',
    membership_role: scope?.membershipRole || '',
    requested_at: new Date().toISOString(),
  }
}

function buildCommercialAccessApprovalMetadata({ request = {}, reviewerId = '' } = {}) {
  return {
    module: COMMERCIAL_MODULE_KEY,
    module_context: COMMERCIAL_MODULE_KEY,
    source: 'commercial_access_request',
    request_id: normalizeText(request.id),
    approved_at: new Date().toISOString(),
    approved_by: normalizeText(reviewerId),
  }
}

function buildCommercialManualGrantMetadata({ organisationUserId = '', reviewerId = '' } = {}) {
  return {
    module: COMMERCIAL_MODULE_KEY,
    module_context: COMMERCIAL_MODULE_KEY,
    source: 'manual_grant',
    organisation_user_id: normalizeText(organisationUserId),
    granted_at: new Date().toISOString(),
    granted_by: normalizeText(reviewerId),
  }
}

function buildCommercialManualRevokeMetadata({ organisationUserId = '', reviewerId = '' } = {}) {
  return {
    source: 'manual_revoke',
    organisation_user_id: normalizeText(organisationUserId),
    revoked_at: new Date().toISOString(),
    revoked_by: normalizeText(reviewerId),
    previous_module: COMMERCIAL_MODULE_KEY,
  }
}

function assertCommercialAccessReviewer(context = {}) {
  const role = normalizeLower(context.membershipRole || context.membership?.role || 'viewer')
  if (!COMMERCIAL_ACCESS_REVIEWER_ROLES.has(role)) {
    throw new Error('Only a principal or workspace administrator can review Commercial access requests.')
  }
}

function normalizeCommercialAccessAssignment(row = {}) {
  const metadata = parseJsonObject(row.module_metadata || row.moduleMetadata || row.metadata)
  return {
    organisationUserId: normalizeText(row.id),
    organisationId: normalizeText(row.organisation_id),
    userId: normalizeText(row.user_id),
    email: normalizeText(row.email),
    fullName: [normalizeText(row.first_name), normalizeText(row.last_name)].filter(Boolean).join(' ') || normalizeText(row.email),
    role: normalizeLower(row.workspace_role || row.organisation_role || row.role || 'viewer'),
    status: normalizeLower(row.status || 'invited'),
    hasCommercialAccess: isCommercialMembershipRow(row),
    moduleContext: normalizeLower(row.module_context),
    source: normalizeText(metadata.source),
    updatedAt: row.updated_at || null,
  }
}

function normalizeCommercialAccessAuditEvent(row = {}) {
  const metadata = parseJsonObject(row.metadata)
  return {
    id: normalizeText(row.id),
    userId: normalizeText(row.user_id),
    workspaceId: normalizeText(row.workspace_id),
    action: normalizeText(row.action),
    targetType: normalizeText(row.target_type),
    targetId: normalizeText(row.target_id),
    metadata,
    createdAt: row.created_at || null,
  }
}

function normalizeCommercialAccessNotificationResult(rows = []) {
  const normalizedRows = Array.isArray(rows) ? rows : []
  const recipients = normalizedRows
    .map((row) => ({
      notificationId: normalizeText(row.notification_id || row.notificationId || row.id),
      userId: normalizeText(row.recipient_user_id || row.recipientUserId || row.user_id),
      email: normalizeText(row.recipient_email || row.recipientEmail || row.email).toLowerCase(),
      name: normalizeText(row.recipient_name || row.recipientName || row.name),
    }))
    .filter((row) => row.userId)
  const notifiedUserIds = normalizedRows
    .map((row) => normalizeText(row.recipient_user_id || row.recipientUserId || row.user_id))
    .filter(Boolean)
  return {
    notificationCount: notifiedUserIds.length,
    notifiedUserIds,
    recipients,
    emailCount: 0,
    emailSkippedReason: '',
    skippedReason: '',
  }
}

function buildCommercialAccessActionLink(actionRoute = '/settings/users') {
  const route = normalizeText(actionRoute) || '/settings/users'
  if (typeof window === 'undefined' || !window.location?.origin) return route
  return `${window.location.origin}${route.startsWith('/') ? route : `/${route}`}`
}

async function sendCommercialAccessNotificationEmails({
  recipients = [],
  request = {},
  eventKind = 'request',
  decision = '',
  organisationName = '',
  actionRoute = '/settings/users',
} = {}) {
  const deliverableRecipients = (recipients || []).filter((recipient) => recipient.email)
  if (!deliverableRecipients.length) {
    return { emailCount: 0, emailSkippedReason: 'no_email_recipients' }
  }

  let emailCount = 0
  for (const recipient of deliverableRecipients) {
    try {
      const response = await invokeEdgeFunction('send-email', {
        body: {
          type: 'commercial_access_notification',
          to: recipient.email,
          recipientName: recipient.name,
          eventKind,
          decision,
          requestId: request.id,
          requesterName: request.requesterName,
          requesterEmail: request.requesterEmail,
          organisationName: organisationName || 'Bridge workspace',
          actionLink: buildCommercialAccessActionLink(actionRoute),
        },
      })
      const sendError = response?.error || response?.data?.error
      if (sendError) {
        console.warn('[Commercial access notifications] email was not sent.', sendError)
        continue
      }
      if (response?.data?.sent !== false) emailCount += 1
    } catch (error) {
      console.warn('[Commercial access notifications] email failed.', error)
    }
  }

  return {
    emailCount,
    emailSkippedReason: emailCount ? '' : 'email_delivery_failed',
  }
}

function recordCommercialAccessAudit({
  userId = '',
  workspaceId = '',
  action = '',
  targetType = '',
  targetId = '',
  metadata = {},
} = {}) {
  void recordSecurityAuditEvent({
    userId,
    workspaceId,
    action,
    targetType,
    targetId,
    metadata: {
      module: COMMERCIAL_MODULE_KEY,
      ...metadata,
    },
  }).catch((error) => {
    if (!isMissingAuditSchemaError(error)) {
      console.warn('[Commercial access audit] event was not persisted.', error)
    }
  })
}

async function notifyCommercialAccessReviewers(request = {}, { organisationName = '' } = {}) {
  if (!isSupabaseConfigured || !supabase || !request?.id) {
    return { notificationCount: 0, notifiedUserIds: [], skippedReason: 'notification_unavailable' }
  }

  const result = await supabase.rpc('bridge_notify_commercial_access_request', {
    p_request_id: request.id,
  })

  if (result.error) {
    if (isMissingCommercialNotificationError(result.error)) {
      return { notificationCount: 0, notifiedUserIds: [], skippedReason: 'notification_helper_missing' }
    }
    console.warn('[Commercial access notifications] reviewer notification failed.', result.error)
    return { notificationCount: 0, notifiedUserIds: [], skippedReason: 'notification_failed' }
  }

  const notificationResult = normalizeCommercialAccessNotificationResult(result.data)
  const emailResult = notificationResult.notificationCount
    ? await sendCommercialAccessNotificationEmails({
        recipients: notificationResult.recipients,
        request,
        eventKind: 'request',
        organisationName,
        actionRoute: '/settings/users',
      })
    : { emailCount: 0, emailSkippedReason: 'no_reviewers_found' }
  const mergedResult = { ...notificationResult, ...emailResult }
  return mergedResult.notificationCount
    ? mergedResult
    : { ...mergedResult, skippedReason: 'no_reviewers_found' }
}

async function notifyCommercialAccessRequesterDecision(request = {}, { organisationName = '' } = {}) {
  if (!isSupabaseConfigured || !supabase || !request?.id) {
    return { notificationCount: 0, notifiedUserIds: [], skippedReason: 'notification_unavailable' }
  }

  const result = await supabase.rpc('bridge_notify_commercial_access_decision', {
    p_request_id: request.id,
  })

  if (result.error) {
    if (isMissingCommercialNotificationError(result.error)) {
      return { notificationCount: 0, notifiedUserIds: [], skippedReason: 'notification_helper_missing' }
    }
    console.warn('[Commercial access notifications] requester decision notification failed.', result.error)
    return { notificationCount: 0, notifiedUserIds: [], skippedReason: 'notification_failed' }
  }

  const notificationResult = normalizeCommercialAccessNotificationResult(result.data)
  const actionRoute = request.status === 'approved' ? '/commercial' : '/dashboard'
  const emailResult = notificationResult.notificationCount
    ? await sendCommercialAccessNotificationEmails({
        recipients: notificationResult.recipients,
        request,
        eventKind: 'decision',
        decision: request.status,
        organisationName,
        actionRoute,
      })
    : { emailCount: 0, emailSkippedReason: 'requester_not_notified' }
  const mergedResult = { ...notificationResult, ...emailResult }
  return mergedResult.notificationCount
    ? mergedResult
    : { ...mergedResult, skippedReason: 'requester_not_notified' }
}

async function nudgeCommercialAccessReviewers(request = {}, { organisationName = '' } = {}) {
  if (!isSupabaseConfigured || !supabase || !request?.id) {
    return { notificationCount: 0, notifiedUserIds: [], skippedReason: 'notification_unavailable' }
  }

  const result = await supabase.rpc('bridge_nudge_commercial_access_request', {
    p_request_id: request.id,
  })

  if (result.error) {
    if (isMissingCommercialNotificationError(result.error)) {
      return { notificationCount: 0, notifiedUserIds: [], skippedReason: 'notification_helper_missing' }
    }
    console.warn('[Commercial access notifications] reviewer reminder failed.', result.error)
    return { notificationCount: 0, notifiedUserIds: [], skippedReason: 'notification_failed' }
  }

  const notificationResult = normalizeCommercialAccessNotificationResult(result.data)
  const emailResult = notificationResult.notificationCount
    ? await sendCommercialAccessNotificationEmails({
        recipients: notificationResult.recipients,
        request,
        eventKind: 'reminder',
        organisationName,
        actionRoute: '/settings/users',
      })
    : { emailCount: 0, emailSkippedReason: 'no_reviewers_found' }
  const mergedResult = { ...notificationResult, ...emailResult }
  return mergedResult.notificationCount
    ? mergedResult
    : { ...mergedResult, skippedReason: 'no_reviewers_found' }
}

async function findPendingCommercialAccessRequest(organisationId, userId) {
  if (!organisationId || !userId || !isSupabaseConfigured || !supabase) return null
  const query = await supabase
    .from('commercial_access_requests')
    .select('id, organisation_id, requester_user_id, requester_membership_id, requester_email, requester_name, module_key, status, request_message, principal_note, reviewed_by, reviewed_at, metadata, created_at, updated_at')
    .eq('organisation_id', organisationId)
    .eq('requester_user_id', userId)
    .eq('module_key', COMMERCIAL_MODULE_KEY)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (query.error) {
    if (isMissingCommercialTableError(query.error) || isCommercialSchemaMismatchError(query.error)) return null
    throw query.error
  }
  return query.data ? normalizeCommercialAccessRequest(query.data) : null
}

export async function requestCommercialAccessForCurrentUser({ message = '' } = {}) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Commercial setup requires Supabase to be configured.')
  }

  await assertCommercialAccessWorkflowInstalled({ forceRefresh: true })
  const context = await resolveCommercialOrganisationContext()
  const userId = context.userId || await getCurrentUserId()
  const organisationName = normalizeText(context.organisation?.displayName || context.organisation?.name) || 'Bridge workspace'
  if (!context.organisationId || !userId) {
    throw new Error('An active organisation membership is required before Commercial access can be requested.')
  }

  const currentScope = await resolveCommercialAccessContext({ forceRefresh: true }).catch(() => null)
  if (currentScope?.hasCommercialAccess) {
    return { status: 'already_active', request: null, reviewerCount: 0 }
  }

  const member = await findCurrentOrganisationMembership(context.organisationId, userId)
  if (!member?.id) {
    throw new Error('We could not find your organisation membership for this Commercial access request.')
  }

  const existing = await findPendingCommercialAccessRequest(context.organisationId, userId)
  if (existing?.id) {
    const notificationResult = await notifyCommercialAccessReviewers(existing, { organisationName })
    return {
      status: 'pending',
      request: existing,
      reviewerCount: notificationResult.notificationCount,
      notificationResult,
      reusedExistingRequest: true,
    }
  }

  const requesterName = [normalizeText(member.first_name), normalizeText(member.last_name)].filter(Boolean).join(' ') || normalizeText(member.email)
  const organisationModuleStatus = currentScope?.commercialModuleStatus || await getCommercialOrganisationModuleStatus({ organisationId: context.organisationId, forceRefresh: true })
  const payload = {
    organisation_id: context.organisationId,
    requester_user_id: userId,
    requester_membership_id: member.id,
    requester_email: normalizeText(member.email || context.profile?.email),
    requester_name: requesterName,
    module_key: COMMERCIAL_MODULE_KEY,
    status: 'pending',
    request_message: normalizeText(message) || null,
    metadata: buildCommercialAccessRequestMetadata({ scope: context, organisationModuleStatus }),
  }

  const insert = await supabase
    .from('commercial_access_requests')
    .insert(payload)
    .select('id, organisation_id, requester_user_id, requester_membership_id, requester_email, requester_name, module_key, status, request_message, principal_note, reviewed_by, reviewed_at, metadata, created_at, updated_at')
    .single()

  if (insert.error) {
    if (isUniqueConstraintError(insert.error)) {
      const pending = await findPendingCommercialAccessRequest(context.organisationId, userId)
      const notificationResult = await notifyCommercialAccessReviewers(pending, { organisationName })
      return {
        status: 'pending',
        request: pending,
        reviewerCount: notificationResult.notificationCount,
        notificationResult,
        reusedExistingRequest: true,
      }
    }
    if (isMissingCommercialTableError(insert.error) || isCommercialSchemaMismatchError(insert.error)) {
      throw createCommercialPlatformInstallError({
        installed: false,
        reason: 'schema_missing',
        missing: ['commercial access request workflow'],
      })
    }
    throw insert.error
  }

  const request = normalizeCommercialAccessRequest(insert.data)
  const notificationResult = await notifyCommercialAccessReviewers(request, { organisationName })

  recordCommercialAccessAudit({
    userId,
    workspaceId: context.organisationId,
    action: COMMERCIAL_ACCESS_AUDIT_ACTIONS.requested,
    targetType: 'commercial_access_request',
    targetId: request.id,
    metadata: {
      requesterUserId: userId,
      requesterMembershipId: member.id,
      requesterEmail: payload.requester_email,
      organisationModuleStatus: organisationModuleStatus?.status || 'disabled',
      reviewerNotificationCount: notificationResult.notificationCount,
      reviewerNotificationSkippedReason: notificationResult.skippedReason || null,
      reviewerEmailCount: notificationResult.emailCount,
      reviewerEmailSkippedReason: notificationResult.emailSkippedReason || null,
    },
  })

  return {
    status: 'pending',
    request,
    reviewerCount: notificationResult.notificationCount,
    notificationResult,
  }
}

export async function remindCommercialAccessReviewersForCurrentUser() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Commercial setup requires Supabase to be configured.')
  }

  await assertCommercialAccessWorkflowInstalled({ forceRefresh: true })
  const context = await resolveCommercialOrganisationContext()
  const userId = context.userId || await getCurrentUserId()
  const organisationName = normalizeText(context.organisation?.displayName || context.organisation?.name) || 'Bridge workspace'
  if (!context.organisationId || !userId) {
    throw new Error('An active organisation membership is required before Commercial access can be reminded.')
  }

  const request = await findPendingCommercialAccessRequest(context.organisationId, userId)
  if (!request?.id) {
    throw new Error('There is no pending Commercial access request to remind.')
  }

  const notificationResult = await nudgeCommercialAccessReviewers(request, { organisationName })
  recordCommercialAccessAudit({
    userId,
    workspaceId: context.organisationId,
    action: COMMERCIAL_ACCESS_AUDIT_ACTIONS.reminded,
    targetType: 'commercial_access_request',
    targetId: request.id,
    metadata: {
      requesterUserId: userId,
      requesterEmail: request.requesterEmail,
      reminderNotificationCount: notificationResult.notificationCount,
      reminderNotificationSkippedReason: notificationResult.skippedReason || null,
      reminderEmailCount: notificationResult.emailCount,
      reminderEmailSkippedReason: notificationResult.emailSkippedReason || null,
    },
  })

  return {
    status: 'reminded',
    request,
    reviewerCount: notificationResult.notificationCount,
    notificationResult,
  }
}

export async function listCommercialAccessRequests({ status = 'pending' } = {}) {
  if (!isSupabaseConfigured || !supabase) return []
  await assertCommercialAccessWorkflowInstalled({ forceRefresh: false })
  const context = await resolveCommercialOrganisationContext()
  if (!context.organisationId) return []
  assertCommercialAccessReviewer(context)

  let query = supabase
    .from('commercial_access_requests')
    .select('id, organisation_id, requester_user_id, requester_membership_id, requester_email, requester_name, module_key, status, request_message, principal_note, reviewed_by, reviewed_at, metadata, created_at, updated_at')
    .eq('organisation_id', context.organisationId)
    .eq('module_key', COMMERCIAL_MODULE_KEY)
    .order('created_at', { ascending: false })

  const normalizedStatus = normalizeLower(status)
  if (normalizedStatus && normalizedStatus !== 'all') {
    query = query.eq('status', normalizedStatus)
  }

  const result = await query
  if (result.error) {
    if (isMissingCommercialTableError(result.error) || isCommercialSchemaMismatchError(result.error)) return []
    throw result.error
  }
  return (result.data || []).map(normalizeCommercialAccessRequest)
}

export async function reviewCommercialAccessRequest(requestId, { decision = 'approved', note = '' } = {}) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Commercial setup requires Supabase to be configured.')
  }

  await assertCommercialAccessWorkflowInstalled({ forceRefresh: true })
  const context = await resolveCommercialOrganisationContext()
  assertCommercialAccessReviewer(context)
  const userId = context.userId || await getCurrentUserId()
  const organisationName = normalizeText(context.organisation?.displayName || context.organisation?.name) || 'Bridge workspace'
  const normalizedDecision = normalizeLower(decision) === 'rejected' ? 'rejected' : 'approved'

  const requestQuery = await supabase
    .from('commercial_access_requests')
    .select('id, organisation_id, requester_user_id, requester_membership_id, requester_email, requester_name, module_key, status, request_message, principal_note, reviewed_by, reviewed_at, metadata, created_at, updated_at')
    .eq('id', requestId)
    .eq('organisation_id', context.organisationId)
    .eq('module_key', COMMERCIAL_MODULE_KEY)
    .maybeSingle()

  if (requestQuery.error) throw requestQuery.error
  const request = requestQuery.data ? normalizeCommercialAccessRequest(requestQuery.data) : null
  if (!request?.id) throw new Error('Commercial access request was not found.')
  if (request.status !== 'pending') throw new Error('Commercial access request has already been reviewed.')

  let membership = null
  if (normalizedDecision === 'approved') {
    const nowIso = new Date().toISOString()
    const moduleUpsert = await supabase
      .from('organisation_modules')
      .upsert(
        {
          organisation_id: request.organisationId,
          module_key: COMMERCIAL_MODULE_KEY,
          status: 'active',
          source: 'principal_request',
          enabled_by: userId,
          enabled_at: nowIso,
          disabled_by: null,
          disabled_at: null,
          metadata: {
            source: 'commercial_access_request_approval',
            request_id: request.id,
            requester_user_id: request.requesterUserId,
            approved_by: userId,
            approved_at: nowIso,
          },
        },
        { onConflict: 'organisation_id,module_key' },
      )

    if (moduleUpsert.error) throw moduleUpsert.error

    const membershipPayload = {
      module_context: COMMERCIAL_MODULE_KEY,
      module_metadata: buildCommercialAccessApprovalMetadata({ request, reviewerId: userId }),
    }
    let membershipUpdate = supabase
      .from('organisation_users')
      .update(membershipPayload)
      .eq('organisation_id', request.organisationId)
      .eq('user_id', request.requesterUserId)

    if (request.requesterMembershipId) {
      membershipUpdate = membershipUpdate.eq('id', request.requesterMembershipId)
    }

    let updatedMembership = await membershipUpdate
      .select('id, organisation_id, user_id, module_context, module_metadata, role, workspace_role, organisation_role, status, email')
      .maybeSingle()

    if (updatedMembership.error && isMissingCommercialActivationColumn(updatedMembership.error)) {
      updatedMembership = await supabase
        .from('organisation_users')
        .update({ module_context: COMMERCIAL_MODULE_KEY })
        .eq('organisation_id', request.organisationId)
        .eq('user_id', request.requesterUserId)
        .select('id, organisation_id, user_id, module_context, role, workspace_role, organisation_role, status, email')
        .maybeSingle()
    }

    if (updatedMembership.error) throw updatedMembership.error
    membership = updatedMembership.data || null
  }

  const review = await supabase
    .from('commercial_access_requests')
    .update({
      status: normalizedDecision,
      principal_note: normalizeText(note) || null,
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', request.id)
    .eq('organisation_id', request.organisationId)
    .select('id, organisation_id, requester_user_id, requester_membership_id, requester_email, requester_name, module_key, status, request_message, principal_note, reviewed_by, reviewed_at, metadata, created_at, updated_at')
    .maybeSingle()

  if (review.error) throw review.error
  const reviewedRequest = normalizeCommercialAccessRequest(review.data || requestQuery.data)
  const notificationResult = await notifyCommercialAccessRequesterDecision(reviewedRequest, { organisationName })

  recordCommercialAccessAudit({
    userId,
    workspaceId: request.organisationId,
    action: normalizedDecision === 'approved' ? COMMERCIAL_ACCESS_AUDIT_ACTIONS.approved : COMMERCIAL_ACCESS_AUDIT_ACTIONS.rejected,
    targetType: 'commercial_access_request',
    targetId: request.id,
    metadata: {
      requesterUserId: request.requesterUserId,
      requesterMembershipId: request.requesterMembershipId,
      requesterEmail: request.requesterEmail,
      decision: normalizedDecision,
      note: normalizeText(note) || null,
      requesterNotificationCount: notificationResult.notificationCount,
      requesterNotificationSkippedReason: notificationResult.skippedReason || null,
      requesterEmailCount: notificationResult.emailCount,
      requesterEmailSkippedReason: notificationResult.emailSkippedReason || null,
    },
  })
  commercialScopeCache = null
  if (normalizedDecision === 'approved') {
    await syncCommercialWorkspaceTeamAccessEntries({
      context,
      addEntries: [{
        organisationUserId: membership?.id || request.requesterMembershipId,
        userId: request.requesterUserId,
        email: request.requesterEmail,
        fullName: request.requesterName,
        role: membership?.workspace_role || membership?.organisation_role || membership?.role,
        source: 'commercial_access_request',
        status: 'active',
      }],
    }).catch(() => {})
  }
  return {
    request: reviewedRequest,
    membership,
    notificationResult,
  }
}

export async function listCommercialAccessManagementState() {
  if (!isSupabaseConfigured || !supabase) {
    return {
      organisationModuleStatus: createCommercialOrganisationDisabledStatus(),
      users: [],
      auditEvents: [],
    }
  }

  await assertCommercialPlatformInstalled({ forceRefresh: false })
  const context = await resolveCommercialOrganisationContext()
  if (!context.organisationId) {
    return {
      organisationModuleStatus: createCommercialOrganisationDisabledStatus(),
      users: [],
      auditEvents: [],
    }
  }
  assertCommercialAccessReviewer(context)

  const [organisationModuleStatus, usersQuery, auditEvents] = await Promise.all([
    getCommercialOrganisationModuleStatus({ organisationId: context.organisationId }),
    supabase
      .from('organisation_users')
      .select('id, organisation_id, user_id, first_name, last_name, email, role, workspace_role, organisation_role, status, module_context, workspace_type, module_metadata, updated_at')
      .eq('organisation_id', context.organisationId)
      .neq('status', 'deactivated')
      .order('created_at', { ascending: true }),
    listCommercialAccessAuditEvents({ limit: 8 }).catch(() => []),
  ])

  if (usersQuery.error) {
    if (isMissingCommercialTableError(usersQuery.error) || isCommercialSchemaMismatchError(usersQuery.error)) {
      throw createCommercialPlatformInstallError({
        installed: false,
        reason: 'schema_missing',
        missing: ['organisation commercial activation columns'],
      })
    }
    throw usersQuery.error
  }

  return {
    organisationModuleStatus,
    users: (usersQuery.data || []).map(normalizeCommercialAccessAssignment),
    auditEvents,
  }
}

export async function listCommercialAccessAuditEvents({ limit = 20 } = {}) {
  if (!isSupabaseConfigured || !supabase) return []
  const context = await resolveCommercialOrganisationContext()
  if (!context.organisationId) return []
  assertCommercialAccessReviewer(context)

  const result = await supabase
    .from('security_audit_events')
    .select('id, user_id, workspace_id, action, target_type, target_id, metadata, created_at')
    .eq('workspace_id', context.organisationId)
    .in('action', COMMERCIAL_ACCESS_AUDIT_ACTION_LIST)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(Number(limit) || 20, 1), 50))

  if (result.error) {
    if (isMissingAuditSchemaError(result.error)) return []
    throw result.error
  }

  return (result.data || []).map(normalizeCommercialAccessAuditEvent)
}

export async function enableCommercialWorkspaceForCurrentUser(input = {}) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Commercial setup requires Supabase to be configured.')
  }

  await assertCommercialPlatformInstalled({ forceRefresh: true })
  const context = await resolveCommercialOrganisationContext()
  assertCommercialAccessReviewer(context)

  const userId = context.userId || await getCurrentUserId()
  const actorEmail = normalizeEmail(context.profile?.email)
  if (!context.organisationId || !userId) {
    throw new Error('An active principal membership is required before Commercial can be enabled.')
  }

  const nowIso = new Date().toISOString()
  const existingSettings = parseJsonObject(context.organisationSettings)
  const existingCommercialWorkspace = parseJsonObject(existingSettings.commercialWorkspace)
  const existingAgencyOnboarding = parseJsonObject(existingSettings.agencyOnboarding)
  const existingAgencyInformation = parseJsonObject(existingAgencyOnboarding.agencyInformation)
  const existingBranchStructure = parseJsonObject(existingAgencyOnboarding.branchStructure)
  const businessModel = normalizeCommercialBusinessModel(input.businessModel)
  const branchMode = normalizeCommercialBranchMode(input.branchMode)
  const featureSelections = normalizeCommercialWorkspaceFeatureSelections(input.featureSelections)
  const enabledFeatureKeys = resolveCommercialWorkspaceEnabledFeatureKeys(featureSelections)

  const [allUsers, allBranches] = await Promise.all([
    listOrganisationUsers().catch(() => []),
    getBranches().catch(() => []),
  ])

  const currentUserRow = (allUsers || []).find((row) =>
    normalizeText(row?.userId) === userId || normalizeEmail(row?.email) === actorEmail,
  )
  const selectedOrganisationUserIds = uniqueValues([
    ...(Array.isArray(input.selectedOrganisationUserIds) ? input.selectedOrganisationUserIds : []),
    currentUserRow?.id,
  ])

  const usersById = new Map((allUsers || []).map((row) => [normalizeText(row?.id), row]))
  const selectedUsers = selectedOrganisationUserIds
    .map((userRowId) => usersById.get(userRowId))
    .filter((row) => row && normalizeLower(row.status) !== 'deactivated')

  if (!selectedUsers.length && currentUserRow) {
    selectedUsers.push(currentUserRow)
  }

  if (!selectedUsers.length) {
    const fallbackCurrentMembership = await findCurrentOrganisationMembership(context.organisationId, userId).catch(() => null)
    if (fallbackCurrentMembership?.id) {
      selectedUsers.push({
        id: fallbackCurrentMembership.id,
        userId: normalizeText(fallbackCurrentMembership.user_id),
        email: normalizeText(fallbackCurrentMembership.email || context.profile?.email),
        fullName: normalizeText(context.profile?.fullName || context.profile?.email),
        role: normalizeText(fallbackCurrentMembership.workspace_role || fallbackCurrentMembership.organisation_role || fallbackCurrentMembership.role || context.membershipRole),
        status: normalizeText(fallbackCurrentMembership.status) || 'active',
      })
    }
  }

  if (!selectedUsers.length) {
    throw new Error('Choose at least one existing user before enabling Commercial.')
  }

  const normalizedExistingBranches = (allBranches || []).map((branch) => ({
    id: normalizeText(branch?.id),
    name: normalizeText(branch?.name),
    location: normalizeText(branch?.location || [branch?.city, branch?.province].filter(Boolean).join(', ')),
    managerName: normalizeText(branch?.principalName || branch?.manager_name || branch?.managerName),
  }))

  const normalizedDedicatedBranches = (Array.isArray(input.dedicatedBranches) ? input.dedicatedBranches : [])
    .map((branch) => ({
      id: normalizeText(branch?.id),
      name: normalizeText(branch?.name || branch?.branchName),
      location: normalizeText(branch?.location || branch?.officeLocation),
      managerName: normalizeText(branch?.managerName || branch?.branchManager),
    }))
    .filter((branch) => branch.name)

  if (branchMode === 'dedicated' && !normalizedDedicatedBranches.length) {
    throw new Error('Add at least one dedicated Commercial branch to continue.')
  }

  const existingBranchesByName = new Map(
    normalizedExistingBranches
      .filter((branch) => branch.name)
      .map((branch) => [normalizeLower(branch.name), branch]),
  )

  const resolvedBranchRows = branchMode === 'existing'
    ? normalizedExistingBranches
    : await Promise.all(
      normalizedDedicatedBranches.map(async (branch) => {
        const existingBranch = existingBranchesByName.get(normalizeLower(branch.name))
        if (existingBranch) return existingBranch
        const createdBranch = await createBranch({
          name: branch.name,
          location: branch.location,
          managerName: branch.managerName,
          metadata: {
            commercial_workspace: true,
            source: 'commercial_workspace_enablement',
            created_at: nowIso,
          },
        })
        return {
          id: normalizeText(createdBranch?.id),
          name: normalizeText(createdBranch?.name || branch.name),
          location: normalizeText(createdBranch?.location || branch.location),
          managerName: normalizeText(createdBranch?.principalName || createdBranch?.manager_name || branch.managerName),
        }
      }),
    )

  const branchDrafts = (resolvedBranchRows || []).map((branch) => ({
    id: branch.id || `commercial-branch-${normalizeLower(branch.name).replace(/[^a-z0-9]+/g, '-')}`,
    branchName: branch.name,
    officeLocation: branch.location,
    branchManager: branch.managerName,
    numberOfAgents: '',
  }))
  const existingOrganisationBranchDrafts = normalizeCommercialWorkspaceBranchDrafts(
    Array.isArray(existingBranchStructure.branches) && existingBranchStructure.branches.length
      ? existingBranchStructure.branches
      : existingSettings.organisationBranches,
  )
  const nextOrganisationBranchDrafts = branchMode === 'dedicated'
    ? mergeCommercialWorkspaceBranchDrafts(existingOrganisationBranchDrafts, branchDrafts)
    : existingOrganisationBranchDrafts.length
      ? existingOrganisationBranchDrafts
      : branchDrafts

  const invitedUsers = normalizeCommercialWorkspaceTeamAccessEntries(
    (Array.isArray(input.invitedUsers) ? input.invitedUsers : []).map((invite) => ({
      email: invite?.email,
      fullName: invite?.fullName || invite?.name,
      source: 'commercial_workspace_invite',
      status: 'pending',
      grantedAt: nowIso,
    })),
  )

  const selectedUserEntries = normalizeCommercialWorkspaceTeamAccessEntries(
    selectedUsers.map((row) => ({
      organisationUserId: row.id,
      userId: row.userId,
      email: row.email,
      fullName: row.fullName,
      role: row.role,
      status: normalizeLower(row.status) === 'active' ? 'active' : 'selected',
      source: 'commercial_workspace_enablement',
      grantedAt: nowIso,
    })),
  )

  const nextAgencyType = resolveCommercialAgencyTypeForWorkspace(existingSettings)
  const nextCommercialWorkspace = {
    ...existingCommercialWorkspace,
    status: 'active',
    source: 'self_service_enablement',
    mode: resolveCommercialWorkspaceModeForAgencyType(nextAgencyType),
    enabledAt: existingCommercialWorkspace.enabledAt || nowIso,
    enabledBy: userId,
    businessModel,
    branchMode,
    branchIds: uniqueValues((resolvedBranchRows || []).map((branch) => branch.id)),
    branchNames: uniqueValues((resolvedBranchRows || []).map((branch) => branch.name)),
    teamAccess: mergeCommercialWorkspaceTeamAccessEntries(
      getCommercialWorkspaceTeamAccessEntries(existingSettings),
      [...selectedUserEntries, ...invitedUsers],
    ),
    selectedOrganisationUserIds,
    pendingInviteEmails: uniqueValues(invitedUsers.map((invite) => invite.email)),
    salesEnabled: businessModel !== 'leasing',
    leasingEnabled: featureSelections.commercialLeasing,
    headsOfTermsEnabled: featureSelections.headsOfTerms,
    tenantManagementEnabled: featureSelections.tenantManagement,
    documentCentreEnabled: featureSelections.commercialDocumentCentre,
    listingsEnabled: featureSelections.commercialListings,
    pipelineEnabled: featureSelections.commercialPipeline,
    brokerageReportingEnabled: featureSelections.brokerageReporting,
    enabledFeatures: enabledFeatureKeys,
    setup: {
      wizardVersion: 1,
      completedAt: nowIso,
      completedBy: userId,
      businessModel,
      branchMode,
      selectedOrganisationUserIds,
      branchIds: uniqueValues((resolvedBranchRows || []).map((branch) => branch.id)),
      enabledFeatures: enabledFeatureKeys,
    },
  }

  const nextSettings = {
    ...existingSettings,
    agencyType: nextAgencyType,
    agencyOnboarding: {
      ...existingAgencyOnboarding,
      agencyInformation: {
        ...existingAgencyInformation,
        agencyType: nextAgencyType,
      },
      branchStructure: {
        ...existingBranchStructure,
        branches: nextOrganisationBranchDrafts.length
          ? nextOrganisationBranchDrafts
          : Array.isArray(existingBranchStructure.branches)
            ? existingBranchStructure.branches
            : [],
      },
    },
    enabledModules: {
      ...(parseJsonObject(existingSettings.enabledModules)),
      residential: nextAgencyType !== 'commercial',
      commercial: true,
    },
    organisationBranches: nextOrganisationBranchDrafts,
    commercialWorkspace: nextCommercialWorkspace,
  }

  await updateWorkflowSettings(nextSettings)
  const commercialModuleStatus = await setCommercialOrganisationModuleEnabled(true, {
    // Persist a DB-safe source value; the richer setup context is kept in metadata.
    source: 'manual',
    metadata: {
      source: 'commercial_workspace_enablement',
      actor_email: actorEmail || null,
      business_model: businessModel,
      branch_mode: branchMode,
      enabled_features: enabledFeatureKeys,
      selected_organisation_user_ids: selectedOrganisationUserIds,
      branch_ids: uniqueValues((resolvedBranchRows || []).map((branch) => branch.id)),
    },
  })

  for (const userRow of selectedUsers) {
    await setCommercialUserAccess(userRow.id, true)
  }

  const scope = await resolveCommercialAccessContext({ forceRefresh: true })
  return {
    scope,
    commercialModuleStatus,
    selectedUsers,
    invitedUsers,
    branches: resolvedBranchRows,
    settings: nextCommercialWorkspace,
  }
}

export async function setCommercialOrganisationModuleEnabled(enabled = true, options = {}) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Commercial setup requires Supabase to be configured.')
  }

  await assertCommercialPlatformInstalled({ forceRefresh: true })
  const context = await resolveCommercialOrganisationContext()
  assertCommercialAccessReviewer(context)
  const userId = context.userId || await getCurrentUserId()
  if (!context.organisationId || !userId) {
    throw new Error('An active principal membership is required to manage Commercial access.')
  }

  const nowIso = new Date().toISOString()
  const source = normalizeText(options.source) || 'manual'
  const metadata = options.metadata && typeof options.metadata === 'object'
    ? options.metadata
    : {}
  const payload = {
    organisation_id: context.organisationId,
    module_key: COMMERCIAL_MODULE_KEY,
    status: enabled ? 'active' : 'disabled',
    source,
    metadata: {
      source: metadata.source || (enabled ? `${source}_enable` : `${source}_disable`),
      actor_user_id: userId,
      changed_at: nowIso,
      ...metadata,
    },
  }

  if (enabled) {
    payload.enabled_by = userId
    payload.enabled_at = nowIso
    payload.disabled_by = null
    payload.disabled_at = null
  } else {
    payload.disabled_by = userId
    payload.disabled_at = nowIso
  }

  const result = await supabase
    .from('organisation_modules')
    .upsert(payload, { onConflict: 'organisation_id,module_key' })
    .select('id, organisation_id, module_key, status, source, enabled_by, enabled_at, requested_by, requested_at, disabled_by, disabled_at, metadata')
    .maybeSingle()

  if (result.error) throw result.error
  recordCommercialAccessAudit({
    userId,
    workspaceId: context.organisationId,
    action: enabled ? COMMERCIAL_ACCESS_AUDIT_ACTIONS.moduleEnabled : COMMERCIAL_ACCESS_AUDIT_ACTIONS.moduleDisabled,
    targetType: 'organisation_module',
    targetId: result.data?.id || context.organisationId,
    metadata: {
      status: enabled ? 'active' : 'disabled',
      source,
    },
  })
  commercialScopeCache = null
  return getCommercialOrganisationModuleStatus({ organisationId: context.organisationId, forceRefresh: true })
}

export async function setCommercialUserAccess(organisationUserId, enabled = true) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Commercial setup requires Supabase to be configured.')
  }

  await assertCommercialPlatformInstalled({ forceRefresh: true })
  const context = await resolveCommercialOrganisationContext()
  assertCommercialAccessReviewer(context)
  const reviewerId = context.userId || await getCurrentUserId()
  const safeOrganisationUserId = normalizeText(organisationUserId)
  if (!context.organisationId || !reviewerId || !safeOrganisationUserId) {
    throw new Error('A valid organisation user is required to manage Commercial access.')
  }

  const existing = await supabase
    .from('organisation_users')
    .select('id, organisation_id, user_id, first_name, last_name, email, role, workspace_role, organisation_role, status, module_context, workspace_type, module_metadata')
    .eq('id', safeOrganisationUserId)
    .eq('organisation_id', context.organisationId)
    .maybeSingle()

  if (existing.error) throw existing.error
  if (!existing.data?.id) throw new Error('Organisation user not found.')

  if (enabled) {
    const moduleStatus = await getCommercialOrganisationModuleStatus({ organisationId: context.organisationId, forceRefresh: true })
    if (!moduleStatus.enabled) {
      await setCommercialOrganisationModuleEnabled(true)
    }
  }

  const payload = enabled
    ? {
        module_context: COMMERCIAL_MODULE_KEY,
        module_metadata: buildCommercialManualGrantMetadata({ organisationUserId: safeOrganisationUserId, reviewerId }),
      }
    : {
        module_context: null,
        module_metadata: buildCommercialManualRevokeMetadata({ organisationUserId: safeOrganisationUserId, reviewerId }),
      }

  let result = await supabase
    .from('organisation_users')
    .update(payload)
    .eq('id', safeOrganisationUserId)
    .eq('organisation_id', context.organisationId)
    .select('id, organisation_id, user_id, first_name, last_name, email, role, workspace_role, organisation_role, status, module_context, workspace_type, module_metadata, updated_at')
    .maybeSingle()

  if (result.error && isMissingCommercialActivationColumn(result.error)) {
    result = await supabase
      .from('organisation_users')
      .update({ module_context: enabled ? COMMERCIAL_MODULE_KEY : null })
      .eq('id', safeOrganisationUserId)
      .eq('organisation_id', context.organisationId)
      .select('id, organisation_id, user_id, first_name, last_name, email, role, workspace_role, organisation_role, status, module_context, updated_at')
      .maybeSingle()
  }

  if (result.error) throw result.error
  recordCommercialAccessAudit({
    userId: reviewerId,
    workspaceId: context.organisationId,
    action: enabled ? COMMERCIAL_ACCESS_AUDIT_ACTIONS.userGranted : COMMERCIAL_ACCESS_AUDIT_ACTIONS.userRevoked,
    targetType: 'organisation_user',
    targetId: safeOrganisationUserId,
    metadata: {
      targetUserId: normalizeText(existing.data?.user_id) || null,
      targetEmail: normalizeText(existing.data?.email) || null,
      previousCommercialAccess: isCommercialMembershipRow(existing.data),
      nextCommercialAccess: Boolean(enabled),
      source: enabled ? 'manual_grant' : 'manual_revoke',
    },
  })
  if (enabled) {
    await syncCommercialWorkspaceTeamAccessEntries({
      context,
      addEntries: [{
        organisationUserId: safeOrganisationUserId,
        userId: normalizeText(existing.data?.user_id),
        email: normalizeText(existing.data?.email),
        fullName: [normalizeText(existing.data?.first_name), normalizeText(existing.data?.last_name)].filter(Boolean).join(' '),
        role: existing.data?.workspace_role || existing.data?.organisation_role || existing.data?.role,
        source: 'manual_grant',
        status: 'active',
      }],
    }).catch(() => {})
  } else {
    await syncCommercialWorkspaceTeamAccessEntries({
      context,
      removeEntry: {
        organisationUserId: safeOrganisationUserId,
        userId: normalizeText(existing.data?.user_id),
        email: normalizeText(existing.data?.email),
      },
    }).catch(() => {})
  }
  commercialScopeCache = null
  return normalizeCommercialAccessAssignment(result.data)
}

async function getCurrentUserId() {
  if (!isSupabaseConfigured || !supabase?.auth?.getUser) return null
  const { data } = await supabase.auth.getUser()
  return data?.user?.id || null
}

export async function resolveCommercialOrganisationContext() {
  let context = null
  try {
    context = await fetchOrganisationSettings()
  } catch (error) {
    if (!isAuthSessionMissingError(error)) throw error
  }

  const organisationId = normalizeText(context?.organisation?.id)

  return {
    organisationId,
    organisation: context?.organisation || null,
    organisationSettings: context?.organisationSettings || {},
    profile: context?.profile || null,
    userId: normalizeText(context?.profile?.id),
    membershipRole: normalizeLower(context?.membershipRole || 'viewer'),
    membershipStatus: normalizeLower(context?.membershipStatus || 'pending'),
  }
}

function resolveScopeLevel(role) {
  const normalized = normalizeLower(role || 'viewer')
  if (COMMERCIAL_HQ_ROLES.has(normalized)) return 'organisation'
  if (COMMERCIAL_BRANCH_ROLES.has(normalized)) return 'branch'
  if (COMMERCIAL_TEAM_ROLES.has(normalized)) return 'team'
  if (COMMERCIAL_BROKER_ROLES.has(normalized)) return 'broker'
  return 'broker'
}

async function findCurrentCommercialMembership(organisationId, userId) {
  if (!organisationId || !userId || !isSupabaseConfigured || !supabase) return null
  const query = await supabase
    .from('organisation_users')
    .select('id, organisation_id, user_id, branch_id, primary_branch_id, team_id, role, workspace_role, organisation_role, module_context, workspace_type, module_metadata, status, email, first_name, last_name, last_active_at')
    .eq('organisation_id', organisationId)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(10)

  if (!query.error) return pickPreferredOrganisationMembership(query.data, isCommercialMembershipRow)
  if (isMissingCommercialTableError(query.error) || isCommercialSchemaMismatchError(query.error)) {
    const fallback = await supabase
      .from('organisation_users')
      .select('id, organisation_id, user_id, branch_id, role, status, email, first_name, last_name, last_active_at')
      .eq('organisation_id', organisationId)
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(10)
    if (fallback.error) {
      if (isMissingCommercialTableError(fallback.error) || isCommercialSchemaMismatchError(fallback.error)) return null
      throw fallback.error
    }
    return pickPreferredOrganisationMembership(fallback.data, isCommercialMembershipRow)
  }
  throw query.error
}

export async function resolveCommercialAccessContext({ forceRefresh = false } = {}) {
  if (!forceRefresh && commercialScopeCache && commercialScopeCache.expiresAt > Date.now()) return commercialScopeCache.value
  if (!forceRefresh && commercialScopeInflight) return commercialScopeInflight

  commercialScopeInflight = (async () => {
    await assertCommercialPlatformInstalled({ forceRefresh })
    const context = await resolveCommercialOrganisationContext()
    const userId = context.userId || await getCurrentUserId()
    const isPlatformAdmin = normalizeLower(context.profile?.role) === 'platform_admin' || normalizeLower(context.membershipRole) === 'platform_admin'
    const canReviewCommercialAccess = isPlatformAdmin || COMMERCIAL_ACCESS_REVIEWER_ROLES.has(context.membershipRole)
    const organisationSettingsCommercialEnabled = isCommercialEnabledInOrganisationSettings(context.organisationSettings)
    const commercialModuleStatus = await getCommercialOrganisationModuleStatus({ organisationId: context.organisationId, forceRefresh })
    const organisationCommercialEnabled = isPlatformAdmin || Boolean(commercialModuleStatus.enabled)
    const membership = organisationCommercialEnabled
      ? await findCurrentCommercialMembership(context.organisationId, userId).catch(() => null)
      : null
    const currentMembership = await findCurrentOrganisationMembership(context.organisationId, userId).catch(() => null)
    const role = normalizeLower(membership?.workspace_role || membership?.organisation_role || membership?.role || context.membershipRole || 'viewer')
    const memberHasCommercialAccess = Boolean(membership?.id && isCommercialMembershipRow(membership))
    const hasCommercialAccess = isPlatformAdmin || (organisationCommercialEnabled && memberHasCommercialAccess)
    const eligibleForCommercialSelfActivation = Boolean(
      !hasCommercialAccess &&
        organisationCommercialEnabled &&
        (
          isPlatformAdmin ||
          canReviewCommercialAccess ||
          hasCommercialWorkspacePlannedAccess(context.organisationSettings, {
            organisationUserId: currentMembership?.id,
            userId,
            email: normalizeEmail(currentMembership?.email || context.profile?.email),
          })
        )
    )
    const scope = {
      ...context,
      userId,
      membership,
      currentMembership,
      commercialModuleStatus,
      organisationCommercialEnabled,
      organisationSettingsCommercialEnabled,
      memberHasCommercialAccess,
      membershipRole: isPlatformAdmin ? 'platform_admin' : role,
      branchId: normalizeText(membership?.primary_branch_id || membership?.branch_id),
      teamId: normalizeText(membership?.team_id),
      scopeLevel: isPlatformAdmin ? 'organisation' : hasCommercialAccess ? resolveScopeLevel(role) : 'none',
      hasCommercialAccess,
      eligibleForCommercialSelfActivation,
      canReviewCommercialAccess,
      canManageBrokerage: isPlatformAdmin || (hasCommercialAccess && resolveScopeLevel(role) !== 'broker'),
    }
    commercialScopeCache = { value: scope, expiresAt: Date.now() + COMMERCIAL_SCOPE_CACHE_TTL_MS }
    return scope
  })().finally(() => {
    commercialScopeInflight = null
  })

  return commercialScopeInflight
}

async function findCurrentOrganisationMembership(organisationId, userId) {
  if (!organisationId || !userId || !isSupabaseConfigured || !supabase) return null
  const fullSelect = 'id, organisation_id, user_id, branch_id, primary_branch_id, team_id, role, workspace_role, organisation_role, module_context, workspace_type, module_metadata, status, email'
  const basicSelect = 'id, organisation_id, user_id, branch_id, primary_branch_id, role, workspace_role, organisation_role, status, email'
  const query = await supabase
    .from('organisation_users')
    .select(fullSelect)
    .eq('organisation_id', organisationId)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(10)

  if (!query.error) return pickPreferredOrganisationMembership(query.data)
  if (!isCommercialSchemaMismatchError(query.error)) throw query.error

  const fallback = await supabase
    .from('organisation_users')
    .select(basicSelect)
    .eq('organisation_id', organisationId)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(10)

  if (fallback.error) throw fallback.error
  return pickPreferredOrganisationMembership(fallback.data)
}

function isMissingCommercialActivationColumn(error) {
  if (!isCommercialSchemaMismatchError(error)) return false
  const missingColumn = getMissingCommercialColumn(error)
  return ['module_context', 'module_metadata'].includes(missingColumn)
}

function buildCommercialActivationMetadata(member = {}, userId = '') {
  const previousMetadata = parseJsonObject(member.module_metadata || member.moduleMetadata)
  return {
    ...previousMetadata,
    module: 'commercial',
    module_context: 'commercial',
    activated_at: new Date().toISOString(),
    activated_by: userId,
    source: 'commercial_access_setup_prompt',
  }
}

export async function activateCommercialWorkspaceForCurrentUser() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Commercial setup requires Supabase to be configured.')
  }

  await assertCommercialPlatformInstalled({ forceRefresh: true })

  const context = await resolveCommercialOrganisationContext()
  const userId = context.userId || await getCurrentUserId()
  if (!context.organisationId || !userId) {
    throw new Error('An active organisation membership is required before Commercial can be activated.')
  }

  const member = await findCurrentOrganisationMembership(context.organisationId, userId)
  if (!member?.id) {
    throw new Error('We could not find an active membership to activate for Commercial.')
  }

  let commercialModuleStatus = await getCommercialOrganisationModuleStatus({
    organisationId: context.organisationId,
    forceRefresh: true,
  })
  if (!commercialModuleStatus.enabled) {
    if (COMMERCIAL_ACCESS_REVIEWER_ROLES.has(context.membershipRole) && isCommercialEnabledInOrganisationSettings(context.organisationSettings)) {
      commercialModuleStatus = await setCommercialOrganisationModuleEnabled(true)
    } else {
      throw new Error('Commercial is not enabled for this workspace. Ask your principal to enable Commercial before activating your Commercial role.')
    }
  }

  const canSelfActivate = Boolean(
    normalizeLower(context.profile?.role) === 'platform_admin' ||
      COMMERCIAL_ACCESS_REVIEWER_ROLES.has(context.membershipRole) ||
      hasCommercialWorkspacePlannedAccess(context.organisationSettings, {
        organisationUserId: member.id,
        userId,
        email: normalizeEmail(member.email || context.profile?.email),
      }),
  )

  if (!canSelfActivate) {
    throw new Error('Commercial access is not assigned to your account yet. Ask your principal to add you to the Commercial workspace.')
  }

  const existingCommercialMembership = await findCurrentCommercialMembership(context.organisationId, userId).catch(() => null)
  if (existingCommercialMembership?.id && isCommercialMembershipRow(existingCommercialMembership)) {
    commercialScopeCache = null
    return resolveCommercialAccessContext({ forceRefresh: true })
  }

  const fullPayload = {
    module_context: 'commercial',
    module_metadata: buildCommercialActivationMetadata(member, userId),
  }
  const fullSelect = 'id, organisation_id, user_id, branch_id, primary_branch_id, team_id, role, workspace_role, organisation_role, module_context, workspace_type, module_metadata, status, email'
  const update = await supabase
    .from('organisation_users')
    .update(fullPayload)
    .eq('id', member.id)
    .eq('organisation_id', context.organisationId)
    .select(fullSelect)
    .maybeSingle()

  if (update.error && isMissingCommercialActivationColumn(update.error)) {
    if (getMissingCommercialColumn(update.error) === 'module_context') {
      throw createCommercialPlatformInstallError({ installed: false, reason: 'schema_missing', missing: ['organisation_users.module_context'] })
    }
    const fallback = await supabase
      .from('organisation_users')
      .update({ module_context: 'commercial' })
      .eq('id', member.id)
      .eq('organisation_id', context.organisationId)
      .select('id, organisation_id, user_id, branch_id, primary_branch_id, role, workspace_role, organisation_role, module_context, status, email')
      .maybeSingle()
    if (fallback.error) throw fallback.error
  } else if (update.error) {
    throw update.error
  }

  commercialScopeCache = null
  return resolveCommercialAccessContext({ forceRefresh: true })
}

function applyCommercialScope(query, kind, scope = {}) {
  if (!query || scope.scopeLevel === 'none') return query?.eq?.('id', '00000000-0000-0000-0000-000000000000') || query
  if (!query || scope.scopeLevel === 'organisation') return query

  if (scope.scopeLevel === 'branch' && scope.branchId) {
    return query.or(`branch_id.eq.${scope.branchId},branch_id.is.null`)
  }

  if (scope.scopeLevel === 'team' && scope.teamId) {
    return query.or(`team_id.eq.${scope.teamId},created_by.eq.${scope.userId}`)
  }

  if (scope.scopeLevel === 'broker' && scope.userId) {
    if (kind === 'requirements' || kind === 'deals') return query.or(`assigned_broker.eq.${scope.userId},broker_id.eq.${scope.userId},created_by.eq.${scope.userId}`)
    if (kind === 'vacancies') return query.or(`broker_assignment.eq.${scope.userId},broker_id.eq.${scope.userId},created_by.eq.${scope.userId}`)
    return query.or(`broker_id.eq.${scope.userId},created_by.eq.${scope.userId}`)
  }

  return query
}

function applyDefaultCommercialHierarchy(payload = {}, scope = {}) {
  const next = { ...payload }
  if (!next.branch_id && !next.branchId && scope.branchId) next.branch_id = scope.branchId
  if (!next.team_id && !next.teamId && scope.teamId) next.team_id = scope.teamId
  if (!next.broker_id && !next.brokerId && scope.scopeLevel === 'broker' && scope.userId) next.broker_id = scope.userId
  if (!next.assigned_broker && scope.scopeLevel === 'broker' && scope.userId) next.assigned_broker = scope.userId
  if (!next.broker_assignment && scope.scopeLevel === 'broker' && scope.userId) next.broker_assignment = scope.userId
  delete next.branchId
  delete next.teamId
  delete next.brokerId
  return next
}

function removeCommercialHierarchyPayload(payload = {}) {
  const next = { ...payload }
  COMMERCIAL_HIERARCHY_COLUMNS.forEach((key) => {
    delete next[key]
  })
  return next
}

function removeCommercialDocumentWorkflowPayload(payload = {}) {
  const next = { ...payload }
  COMMERCIAL_DOCUMENT_WORKFLOW_COLUMNS.forEach((key) => {
    delete next[key]
  })
  return next
}

function removeCommercialLeasingWorkflowPayload(payload = {}) {
  const next = { ...payload }
  COMMERCIAL_LEASING_WORKFLOW_COLUMNS.forEach((key) => {
    delete next[key]
  })
  return next
}

function removeOptionalCommercialPayload(payload = {}) {
  return removeCommercialLeasingWorkflowPayload(removeCommercialDocumentWorkflowPayload(removeCommercialHierarchyPayload(payload)))
}

async function resolveOrganisationId(organisationId) {
  const provided = normalizeText(organisationId)
  if (provided) return provided
  const context = await resolveCommercialOrganisationContext()
  return normalizeText(context.organisationId)
}

async function listCommercialRecords(kind, organisationId, { order = 'updated_at', ascending = false } = {}) {
  const table = TABLES[kind]
  const fields = SELECTS[kind]
  const resolvedOrganisationId = await resolveOrganisationId(organisationId)

  if (!table || !fields || !resolvedOrganisationId || !isSupabaseConfigured || !supabase) return []

  const scope = await resolveCommercialAccessContext()
  if (!scope.hasCommercialAccess) return []
  let selectFields = fields
  let scoped = true
  let query = null

  for (let attempt = 0; attempt < 8; attempt += 1) {
    let nextQuery = supabase
      .from(table)
      .select(selectFields)
      .eq('organisation_id', resolvedOrganisationId)
      .order(order, { ascending })

    if (scoped) {
      nextQuery = applyCommercialScope(nextQuery, kind, scope)
    }

    query = await nextQuery
    if (!query.error) break
    if (isMissingCommercialTableError(query.error)) return []
    if (!isCommercialSchemaMismatchError(query.error)) throw query.error

    const missingColumn = getMissingCommercialColumn(query.error)
    const hierarchyScopeColumnMissing = ['branch_id', 'broker_id', 'broker_assignment', 'assigned_broker'].includes(missingColumn)
    if (scoped && hierarchyScopeColumnMissing) {
      scoped = false
      selectFields = withoutSelectColumns(selectFields, [missingColumn, ...COMMERCIAL_HIERARCHY_COLUMNS])
      continue
    }
    if (COMMERCIAL_DOCUMENT_WORKFLOW_COLUMNS.includes(missingColumn)) {
      selectFields = withoutSelectColumns(selectFields, [missingColumn, ...COMMERCIAL_DOCUMENT_WORKFLOW_COLUMNS])
      continue
    }
    if (COMMERCIAL_LEASING_WORKFLOW_COLUMNS.includes(missingColumn)) {
      selectFields = withoutSelectColumns(selectFields, [missingColumn, ...COMMERCIAL_LEASING_WORKFLOW_COLUMNS])
      continue
    }
    const nextFields = withoutSelectColumns(selectFields, missingColumn ? [missingColumn] : COMMERCIAL_HIERARCHY_COLUMNS)
    if (nextFields === selectFields) throw query.error
    selectFields = nextFields
  }

  if (query.error) {
    if (isMissingCommercialTableError(query.error)) return []
    throw query.error
  }

  return query.data || []
}

async function createCommercialRecord(kind, payload = {}, options = {}) {
  const table = TABLES[kind]
  const fields = SELECTS[kind]
  const organisationId = await resolveOrganisationId(payload.organisationId || payload.organisation_id)

  if (!table || !fields) throw new Error('Unknown commercial record type.')
  if (!organisationId) throw new Error('Commercial organisation context is not available.')
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase is not configured.')

  const userId = await getCurrentUserId()
  const scope = await resolveCommercialAccessContext()
  if (!scope.hasCommercialAccess) throw new Error('Commercial workspace access is required.')
  const insertPayload = {
    ...applyDefaultCommercialHierarchy(payload, scope),
    organisation_id: organisationId,
    created_by: payload.created_by || payload.createdBy || userId,
    updated_by: payload.updated_by || payload.updatedBy || userId,
  }

  delete insertPayload.organisationId
  delete insertPayload.createdBy
  delete insertPayload.updatedBy

  let query = await supabase.from(table).insert(insertPayload).select(fields).single()
  if (query.error && isCommercialSchemaMismatchError(query.error)) {
    query = await supabase
      .from(table)
      .insert(removeOptionalCommercialPayload(insertPayload))
      .select(withoutSelectColumns(fields, [...COMMERCIAL_HIERARCHY_COLUMNS, ...COMMERCIAL_DOCUMENT_WORKFLOW_COLUMNS, ...COMMERCIAL_LEASING_WORKFLOW_COLUMNS]))
      .single()
  }
  if (query.error) throw query.error
  if (options.logActivity !== false) {
    await logCommercialRecordActivity(kind, query.data, {
      activityType: `${entityTypeForKind(kind)}_created`,
      title: 'Commercial record created',
      body: `${displayNameForRecord(kind, query.data)} was created.`,
      metadata: { source: 'commercial_crud' },
    })
  }
  return query.data || null
}

async function updateCommercialRecord(kind, id, payload = {}, options = {}) {
  const table = TABLES[kind]
  const fields = SELECTS[kind]
  const recordId = normalizeText(id)

  if (!table || !fields) throw new Error('Unknown commercial record type.')
  if (!recordId) throw new Error('A valid commercial record id is required.')
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase is not configured.')

  const userId = await getCurrentUserId()
  const scope = await resolveCommercialAccessContext()
  if (!scope.hasCommercialAccess) throw new Error('Commercial workspace access is required.')
  const updatePayload = {
    ...applyDefaultCommercialHierarchy(payload, scope),
    updated_by: payload.updated_by || payload.updatedBy || userId,
  }

  delete updatePayload.id
  delete updatePayload.organisationId
  delete updatePayload.organisation_id
  delete updatePayload.createdBy
  delete updatePayload.created_by
  delete updatePayload.updatedBy

  let query = await applyCommercialScope(
    supabase.from(table).update(updatePayload).eq('id', recordId),
    kind,
    scope,
  ).select(fields).single()
  if (query.error && isCommercialSchemaMismatchError(query.error)) {
    query = await supabase
      .from(table)
      .update(removeOptionalCommercialPayload(updatePayload))
      .eq('id', recordId)
      .select(withoutSelectColumns(fields, [...COMMERCIAL_HIERARCHY_COLUMNS, ...COMMERCIAL_DOCUMENT_WORKFLOW_COLUMNS, ...COMMERCIAL_LEASING_WORKFLOW_COLUMNS]))
      .single()
  }
  if (query.error) throw query.error
  if (options.logActivity !== false) {
    await logCommercialRecordActivity(kind, query.data, {
      activityType: `${entityTypeForKind(kind)}_updated`,
      title: 'Commercial record updated',
      body: `${displayNameForRecord(kind, query.data)} was updated.`,
      metadata: { source: 'commercial_crud', changedFields: changedPayloadKeys(updatePayload) },
    })
  }
  return query.data || null
}

async function archiveCommercialRecord(kind, id) {
  const updated = await updateCommercialRecord(kind, id, { status: 'archived' }, { logActivity: false })
  await logCommercialRecordActivity(kind, updated, {
    activityType: `${entityTypeForKind(kind)}_archived`,
    title: 'Commercial record archived',
    body: `${displayNameForRecord(kind, updated)} was archived.`,
    metadata: { source: 'commercial_crud', changedFields: ['status'] },
  })
  return updated
}

function categoryToPropertyType(category) {
  const normalized = normalizeLower(category)
  if (normalized === 'development_land') return 'land'
  if (normalized === 'agricultural') return 'land'
  return normalized || null
}

function getListingArea(payload = {}) {
  const metadata = payload.metadata_json && typeof payload.metadata_json === 'object' ? payload.metadata_json : {}
  return toNumber(metadata.gla || metadata.gla_m2 || metadata.warehouse_size || metadata.shop_gla || metadata.land_size || metadata.farm_size)
}

function stripListingCreationOnlyFields(payload = {}) {
  const next = { ...payload }
  delete next.new_landlord_name
  delete next.new_landlord_contact
  delete next.new_property_name
  delete next.new_property_area
  delete next.new_vacancy_name
  delete next.new_vacancy_unit
  return next
}

export async function createCommercialListing(payload = {}) {
  const organisationId = await resolveOrganisationId(payload.organisationId || payload.organisation_id)
  if (!organisationId) throw new Error('Commercial organisation context is not available.')

  let landlordId = normalizeText(payload.landlord_id)
  let propertyId = normalizeText(payload.property_id)
  let vacancyId = normalizeText(payload.vacancy_id)
  const requestedListingStatus = normalizeCommercialListingStatus(payload.listing_status, 'draft')
  const hierarchyPayload = {
    organisation_id: organisationId,
    branch_id: payload.branch_id || null,
    team_id: payload.team_id || null,
    broker_id: payload.broker_id || null,
  }

  if (!landlordId && normalizeText(payload.new_landlord_name)) {
    const landlord = await createCommercialRecord('landlords', {
      ...hierarchyPayload,
      name: normalizeText(payload.new_landlord_name),
      contact_person: normalizeText(payload.new_landlord_contact) || null,
      status: 'active',
    }, { logActivity: false })
    landlordId = landlord?.id || ''
  }

  if (!propertyId && normalizeText(payload.new_property_name)) {
    const property = await createCommercialRecord('properties', {
      ...hierarchyPayload,
      landlord_id: landlordId || null,
      property_name: normalizeText(payload.new_property_name),
      property_type: categoryToPropertyType(payload.listing_category),
      suburb: normalizeText(payload.new_property_area) || null,
      available_space_m2: getListingArea(payload) || null,
      broker_id: hierarchyPayload.broker_id || null,
      status: 'active',
    }, { logActivity: false })
    propertyId = property?.id || ''
  }

  if (!vacancyId && normalizeText(payload.new_vacancy_name)) {
    const vacancy = await createCommercialRecord('vacancies', {
      ...hierarchyPayload,
      landlord_id: landlordId || null,
      property_id: propertyId || null,
      vacancy_name: normalizeText(payload.new_vacancy_name),
      unit_or_floor: normalizeText(payload.new_vacancy_unit) || null,
      available_area_m2: getListingArea(payload) || null,
      asking_rental: Number.isFinite(Number(payload.pricing)) ? Number(payload.pricing) : null,
      availability_date: normalizeText(payload.available_from) || null,
      broker_assignment: payload.broker_id || null,
      broker_id: payload.broker_id || null,
      status: requestedListingStatus === 'published' ? 'marketing' : 'draft',
    }, { logActivity: false })
    vacancyId = vacancy?.id || ''
  }

  const vacancy = vacancyId ? await findCommercialRecordById('vacancies', vacancyId, organisationId) : null
  const property = propertyId ? await findCommercialRecordById('properties', propertyId, organisationId) : null
  const resolvedBrokerId = normalizeText(payload.broker_id || vacancy?.broker_id || vacancy?.broker_assignment || property?.broker_id)
  if (!resolvedBrokerId) throw new Error('A broker owner is required before a listing can be created.')
  if (vacancy?.id && vacancyBlocksNewMarketing(vacancy.status) && !['closed', 'withdrawn', 'expired', 'archived'].includes(requestedListingStatus)) {
    throw new Error('Occupied, withdrawn, suspended, or archived vacancies cannot be linked to a new active listing.')
  }

  const listing = await createCommercialRecord('listings', {
    ...stripListingCreationOnlyFields(payload),
    organisation_id: organisationId,
    landlord_id: landlordId || null,
    property_id: propertyId || vacancy?.property_id || null,
    vacancy_id: vacancyId || null,
    branch_id: payload.branch_id || vacancy?.branch_id || property?.branch_id || null,
    team_id: payload.team_id || vacancy?.team_id || property?.team_id || null,
    broker_id: resolvedBrokerId,
    status: payload.status || (requestedListingStatus === 'archived' ? 'archived' : ['closed', 'withdrawn', 'expired'].includes(requestedListingStatus) ? 'inactive' : 'active'),
    listing_status: requestedListingStatus,
    internal_reviewed_at: requestedListingStatus === 'internal_review' ? new Date().toISOString() : null,
    approved_at: requestedListingStatus === 'approved' ? new Date().toISOString() : null,
    published_at: requestedListingStatus === 'published' ? new Date().toISOString() : null,
  }, { logActivity: false })

  await logCommercialActivity({
    organisation_id: listing?.organisation_id,
    branch_id: listing?.branch_id,
    team_id: listing?.team_id,
    broker_id: listing?.broker_id,
    entityType: 'commercial_listing',
    entityId: listing?.id,
    activityType: requestedListingStatus === 'published' ? 'listing_published' : 'listing_created',
    title: requestedListingStatus === 'published' ? 'Listing Published' : 'Listing Created',
    body: `${listing?.title || 'Commercial listing'} was ${requestedListingStatus === 'published' ? 'published' : 'created'}.`,
    metadata: { listingStatus: requestedListingStatus, propertyId: listing?.property_id || null, vacancyId: listing?.vacancy_id || null },
  })

  if (vacancy?.id && requestedListingStatus === 'published') {
    await updateCommercialRecord('vacancies', vacancy.id, {
      status: ['occupied', 'archived', 'withdrawn', 'suspended'].includes(normalizeCommercialVacancyStatus(vacancy.status, 'draft')) ? vacancy.status : 'marketing',
      marketed_at: vacancy.marketed_at || new Date().toISOString(),
    }, { logActivity: false }).catch(() => null)
  }

  return listing
}

export async function archiveCommercialListing(id) {
  const updated = await updateCommercialRecord('listings', id, { status: 'archived', listing_status: 'archived' }, { logActivity: false })
  await logCommercialRecordActivity('listings', updated, {
    activityType: 'commercial_listing_archived',
    title: 'Commercial listing archived',
    body: `${displayNameForRecord('listings', updated)} was archived.`,
    metadata: { source: 'commercial_crud', changedFields: ['status', 'listing_status'] },
  })
  return updated
}

function safeFileName(value) {
  return normalizeText(value || 'document')
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120) || 'document'
}

function createObjectPath({ organisationId, entityType, entityId, fileName }) {
  const idPart = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  return [
    'commercial',
    safeFileName(organisationId || 'organisation'),
    safeFileName(entityType || 'entity'),
    safeFileName(entityId || 'record'),
    `${idPart}-${safeFileName(fileName)}`,
  ].join('/')
}

async function uploadCommercialFile({ file, organisationId, entityType, entityId } = {}) {
  if (!file) return { bucket: '', path: '' }
  if (!isSupabaseConfigured || !supabase?.storage) throw new Error('Supabase is not configured.')

  const objectPath = createObjectPath({
    organisationId,
    entityType,
    entityId,
    fileName: file.name || 'commercial-document',
  })
  const checkedBuckets = []

  for (const bucket of COMMERCIAL_DOCUMENT_BUCKET_CANDIDATES) {
    checkedBuckets.push(bucket)
    const { error } = await supabase.storage.from(bucket).upload(objectPath, file, {
      cacheControl: '3600',
      contentType: file.type || undefined,
      upsert: false,
    })
    if (!error) return { bucket, path: objectPath }
    if (!/bucket|not found|does not exist/i.test(String(error.message || ''))) throw error
  }

  throw new Error(`Commercial document storage is not configured. Checked: ${checkedBuckets.join(', ')}.`)
}

async function createCommercialActivity(payload = {}) {
  const table = TABLES.activity
  const fields = SELECTS.activity
  const organisationId = await resolveOrganisationId(payload.organisationId || payload.organisation_id)

  if (!organisationId || !isSupabaseConfigured || !supabase) return null

  const userId = await getCurrentUserId()
  const activityPayload = {
    organisation_id: organisationId,
    branch_id: payload.branch_id || payload.branchId || null,
    team_id: payload.team_id || payload.teamId || null,
    broker_id: payload.broker_id || payload.brokerId || null,
    entity_type: normalizeText(payload.entityType || payload.entity_type),
    entity_id: normalizeText(payload.entityId || payload.entity_id),
    activity_type: normalizeText(payload.activityType || payload.activity_type || 'note'),
    title: normalizeText(payload.title) || null,
    body: normalizeText(payload.body) || null,
    metadata: payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {},
    created_by: payload.created_by || payload.createdBy || userId,
  }

  if (!activityPayload.entity_type || !activityPayload.entity_id) return null
  const scope = await resolveCommercialAccessContext()
  if (!scope.hasCommercialAccess) return null

  let query = await supabase.from(table).insert(activityPayload).select(fields).single()
  if (query.error && isCommercialSchemaMismatchError(query.error)) {
    query = await supabase
      .from(table)
      .insert(removeCommercialHierarchyPayload(activityPayload))
      .select(withoutSelectColumns(fields, COMMERCIAL_HIERARCHY_COLUMNS))
      .single()
  }
  if (query.error) {
    if (isMissingCommercialTableError(query.error)) return null
    throw query.error
  }
  return query.data || null
}

export async function logCommercialActivity(payload = {}) {
  try {
    return await createCommercialActivity(payload)
  } catch (error) {
    console.warn('[commercialApi] activity log skipped', error)
    return null
  }
}

async function logCommercialRecordActivity(kind, record, { activityType, title, body, metadata = {} } = {}) {
  if (!record?.id || !record?.organisation_id) return null
  return logCommercialActivity({
    organisation_id: record.organisation_id,
    entityType: entityTypeForKind(kind),
    entityId: record.id,
    activityType,
    title,
    body,
    metadata: {
      recordKind: kind,
      recordName: displayNameForRecord(kind, record),
      ...metadata,
    },
  })
}

async function resolveCommercialRelationshipContext(payload = {}, organisationId = '') {
  const resolvedOrganisationId = await resolveOrganisationId(organisationId || payload.organisation_id || payload.organisationId)
  const [companies, contacts, tenants, landlords] = await Promise.all([
    getCommercialCompanies(resolvedOrganisationId),
    getCommercialContacts(resolvedOrganisationId),
    getCommercialTenants(resolvedOrganisationId),
    getCommercialLandlords(resolvedOrganisationId),
  ])

  const companyId = normalizeText(payload.company_id || payload.companyId)
  const contactId = normalizeText(payload.contact_id || payload.contactId)
  const tenantId = normalizeText(payload.tenant_id || payload.tenantId)
  const landlordId = normalizeText(payload.landlord_id || payload.landlordId)
  const explicitContact = contacts.find((row) => row.id === contactId) || null
  const company = companies.find((row) => row.id === companyId)
    || (explicitContact?.company_id ? companies.find((row) => row.id === explicitContact.company_id) : null)
    || (tenantId ? companies.find((row) => companyLegacyId(row, 'tenant') === tenantId) : null)
    || (landlordId ? companies.find((row) => companyLegacyId(row, 'landlord') === landlordId) : null)
    || null
  const contact = explicitContact
    || (company?.primary_contact_id ? contacts.find((row) => row.id === company.primary_contact_id) : null)
    || null
  const nextTenantId = tenantId || companyLegacyId(company, 'tenant')
  const nextLandlordId = landlordId || companyLegacyId(company, 'landlord')
  const tenant = tenants.find((row) => row.id === nextTenantId) || null
  const landlord = landlords.find((row) => row.id === nextLandlordId) || null

  return {
    organisationId: resolvedOrganisationId,
    company,
    contact,
    tenant,
    landlord,
  }
}

function withCommercialRelationshipPayload(payload = {}, context = {}, fallback = {}) {
  const companyId = normalizeText(payload.company_id || payload.companyId || context.company?.id || context.contact?.company_id || fallback.company_id)
  const contactId = normalizeText(payload.contact_id || payload.contactId || context.contact?.id || fallback.contact_id)
  const tenantId = normalizeText(payload.tenant_id || payload.tenantId || context.tenant?.id || fallback.tenant_id)
  const landlordId = normalizeText(payload.landlord_id || payload.landlordId || context.landlord?.id || fallback.landlord_id)
  return {
    ...payload,
    company_id: companyId || null,
    contact_id: contactId || null,
    tenant_id: tenantId || null,
    landlord_id: landlordId || null,
  }
}

export const getCommercialLandlords = (organisationId) => listCommercialRecords('landlords', organisationId, { order: 'name', ascending: true })
export const getCommercialTenants = (organisationId) => listCommercialRecords('tenants', organisationId, { order: 'name', ascending: true })
export const getCommercialCompanies = async (organisationId) => {
  const rows = await listCommercialRecords('companies', organisationId, { order: 'company_name', ascending: true })
  return rows.map(normalizeCommercialCompanyRow)
}
export const getCommercialContacts = async (organisationId) => {
  const rows = await listCommercialRecords('contacts', organisationId, { order: 'last_name', ascending: true })
  return rows.map(normalizeCommercialContactRow)
}
export const getCommercialProperties = (organisationId) => listCommercialRecords('properties', organisationId, { order: 'property_name', ascending: true })
export const getCommercialRequirements = (organisationId) => listCommercialRecords('requirements', organisationId)
export const getCommercialDeals = (organisationId) => listCommercialRecords('deals', organisationId)
export const getCommercialLeases = (organisationId) => listCommercialRecords('leases', organisationId)
export const getCommercialVacancies = (organisationId) => listCommercialRecords('vacancies', organisationId, { order: 'availability_date', ascending: true })
export const getCommercialListings = (organisationId) => listCommercialRecords('listings', organisationId, { order: 'updated_at', ascending: false })
export const getCommercialViewings = (organisationId) => listCommercialRecords('viewings', organisationId, { order: 'viewing_date', ascending: true })
export const getCommercialTransactions = (organisationId) => listCommercialRecords('transactions', organisationId)
export const getCommercialCommissions = (organisationId) => listCommercialRecords('commissions', organisationId)
export const getCommercialAllDocuments = (organisationId) => listCommercialRecords('documents', organisationId)
export const getCommercialAllDocumentRequests = (organisationId) => listCommercialRecords('documentRequests', organisationId)
export const getCommercialAllHeadsOfTerms = (organisationId) => listCommercialRecords('headsOfTerms', organisationId)

export async function createCommercialCompany(payload = {}) {
  const brokerId = normalizeText(payload.broker_id || payload.brokerId)
  if (!brokerId) throw new Error('An assigned broker is required before a company can be created.')
  const company = await createCommercialRecord('companies', {
    ...payload,
    broker_id: brokerId,
    company_name: normalizeText(payload.company_name || payload.name),
    status: payload.status || 'active',
  })
  await logCommercialActivity({
    organisation_id: company?.organisation_id,
    branch_id: company?.branch_id,
    team_id: company?.team_id,
    broker_id: company?.broker_id,
    entityType: 'commercial_company',
    entityId: company?.id,
    activityType: 'company_created',
    title: 'Company created',
    body: `${company?.company_name || 'Commercial company'} was created.`,
    metadata: { source: 'commercial_crm' },
  })
  return normalizeCommercialCompanyRow(company)
}

export async function createCommercialContact(payload = {}) {
  const companyId = normalizeText(payload.company_id || payload.companyId)
  if (!companyId) throw new Error('A linked company is required before a contact can be created.')
  const relationshipContext = await resolveCommercialRelationshipContext(payload)
  const company = relationshipContext.company
  const brokerId = normalizeText(payload.broker_id || payload.brokerId || company?.broker_id)
  if (!brokerId) throw new Error('An assigned broker is required before a contact can be created.')

  const contact = await createCommercialRecord('contacts', {
    ...payload,
    company_id: companyId,
    organisation_id: payload.organisation_id || company?.organisation_id,
    branch_id: payload.branch_id || company?.branch_id,
    team_id: payload.team_id || company?.team_id,
    broker_id: brokerId,
    status: payload.status || 'active',
  })

  if (payload.is_primary || !company?.primary_contact_id) {
    await setCommercialPrimaryContact(companyId, contact?.id).catch(() => null)
  }

  await Promise.all([
    logCommercialActivity({
      organisation_id: contact?.organisation_id,
      branch_id: contact?.branch_id,
      team_id: contact?.team_id,
      broker_id: contact?.broker_id,
      entityType: 'commercial_company',
      entityId: companyId,
      activityType: 'contact_added',
      title: 'Contact added',
      body: `${buildCommercialContactName(contact)} was added to ${company?.company_name || 'this company'}.`,
      metadata: { contactId: contact?.id },
    }),
    logCommercialActivity({
      organisation_id: contact?.organisation_id,
      branch_id: contact?.branch_id,
      team_id: contact?.team_id,
      broker_id: contact?.broker_id,
      entityType: 'commercial_contact',
      entityId: contact?.id,
      activityType: 'contact_created',
      title: 'Contact created',
      body: `${buildCommercialContactName(contact)} was created.`,
      metadata: { companyId },
    }),
  ])

  return normalizeCommercialContactRow(contact)
}

export const createCommercialLandlord = (payload) => createCommercialRecord('landlords', payload)
export const createCommercialTenant = (payload) => createCommercialRecord('tenants', payload)
export async function createCommercialProperty(payload = {}) {
  const brokerId = normalizeText(payload.broker_id || payload.brokerId)
  if (!brokerId) throw new Error('A broker owner is required before a property can be created.')
  const property = await createCommercialRecord('properties', {
    ...payload,
    broker_id: brokerId,
    number_of_units: payload.number_of_units ?? null,
    status: payload.status || 'active',
  }, { logActivity: false })

  await logCommercialActivity({
    organisation_id: property?.organisation_id,
    branch_id: property?.branch_id,
    team_id: property?.team_id,
    broker_id: property?.broker_id,
    entityType: 'commercial_property',
    entityId: property?.id,
    activityType: 'property_created',
    title: 'Property Created',
    body: `${property?.property_name || 'Commercial property'} was created.`,
    metadata: { propertyType: property?.property_type || null },
  })

  return property
}
export async function createCommercialRequirement(payload = {}) {
  const relationshipContext = await resolveCommercialRelationshipContext(payload)
  const brokerId = normalizeText(payload.broker_id || payload.assigned_broker || payload.brokerId || relationshipContext.company?.broker_id)
  if (!brokerId) throw new Error('An assigned broker is required before a requirement can be created.')
  return createCommercialRecord('requirements', withCommercialRelationshipPayload({
    ...payload,
    broker_id: brokerId,
    assigned_broker: payload.assigned_broker || brokerId,
  }, relationshipContext))
}
export async function createCommercialDeal(payload = {}) {
  const relationshipContext = await resolveCommercialRelationshipContext(payload)
  const brokerId = normalizeText(payload.broker_id || payload.assigned_broker || payload.brokerId || relationshipContext.company?.broker_id)
  return createCommercialRecord('deals', withCommercialRelationshipPayload({
    ...payload,
    broker_id: brokerId || null,
    assigned_broker: payload.assigned_broker || brokerId || null,
  }, relationshipContext))
}
export async function createCommercialVacancy(payload = {}) {
  const property = await findCommercialRecordById('properties', payload.property_id, payload.organisation_id || payload.organisationId)
  const brokerId = normalizeText(payload.broker_id || payload.broker_assignment || payload.brokerId || property?.broker_id)
  if (!normalizeText(payload.property_id)) throw new Error('A property is required before a vacancy can be created.')
  if (!brokerId) throw new Error('An assigned broker is required before a vacancy can be created.')
  const vacancy = await createCommercialRecord('vacancies', {
    ...payload,
    landlord_id: payload.landlord_id || property?.landlord_id || null,
    branch_id: payload.branch_id || property?.branch_id || null,
    team_id: payload.team_id || property?.team_id || null,
    broker_id: brokerId,
    broker_assignment: payload.broker_assignment || brokerId,
    status: normalizeCommercialVacancyStatus(payload.status, 'draft'),
  }, { logActivity: false })

  await logCommercialActivity({
    organisation_id: vacancy?.organisation_id,
    branch_id: vacancy?.branch_id,
    team_id: vacancy?.team_id,
    broker_id: vacancy?.broker_id,
    entityType: 'commercial_vacancy',
    entityId: vacancy?.id,
    activityType: 'vacancy_added',
    title: 'Vacancy Added',
    body: `${vacancy?.vacancy_name || 'Commercial vacancy'} was added.`,
    metadata: { propertyId: vacancy?.property_id || null },
  })

  return vacancy
}

export const updateCommercialLandlord = (id, payload, options) => updateCommercialRecord('landlords', id, payload, options)
export const updateCommercialTenant = (id, payload, options) => updateCommercialRecord('tenants', id, payload, options)
export async function updateCommercialProperty(id, payload = {}, options = {}) {
  const existing = await findCommercialRecordById('properties', id, payload.organisation_id || payload.organisationId)
  const brokerId = normalizeText(payload.broker_id || existing?.broker_id)
  if (!brokerId) throw new Error('A broker owner is required before a property can be saved.')
  const updated = await updateCommercialRecord('properties', id, { ...payload, broker_id: brokerId }, { ...options, logActivity: false })
  await logCommercialActivity({
    organisation_id: updated?.organisation_id,
    branch_id: updated?.branch_id,
    team_id: updated?.team_id,
    broker_id: updated?.broker_id,
    entityType: 'commercial_property',
    entityId: updated?.id,
    activityType: 'property_updated',
    title: 'Property Updated',
    body: `${updated?.property_name || 'Commercial property'} was updated.`,
    metadata: { changedFields: changedPayloadKeys(payload) },
  })
  return updated
}
export async function updateCommercialCompany(id, payload = {}, options = {}) {
  return normalizeCommercialCompanyRow(await updateCommercialRecord('companies', id, payload, options))
}
export async function updateCommercialContact(id, payload = {}, options = {}) {
  const existing = await findCommercialRecordById('contacts', id, payload.organisation_id || payload.organisationId)
  const companyId = normalizeText(payload.company_id || payload.companyId || existing?.company_id)
  const relationshipContext = await resolveCommercialRelationshipContext({ ...existing, ...payload, company_id: companyId }, existing?.organisation_id || payload.organisation_id)
  const updated = await updateCommercialRecord('contacts', id, {
    ...payload,
    company_id: companyId || existing?.company_id || null,
    branch_id: payload.branch_id || relationshipContext.company?.branch_id || existing?.branch_id || null,
    team_id: payload.team_id || relationshipContext.company?.team_id || existing?.team_id || null,
    broker_id: payload.broker_id || relationshipContext.company?.broker_id || existing?.broker_id || null,
  }, options)
  if (payload.is_primary) {
    await setCommercialPrimaryContact(updated?.company_id, updated?.id).catch(() => null)
  }
  return normalizeCommercialContactRow(updated)
}
export async function updateCommercialRequirement(id, payload = {}, options = {}) {
  const existing = await findCommercialRecordById('requirements', id, payload.organisation_id || payload.organisationId)
  const relationshipContext = await resolveCommercialRelationshipContext({ ...existing, ...payload }, existing?.organisation_id || payload.organisation_id)
  const brokerId = normalizeText(payload.broker_id || payload.assigned_broker || existing?.broker_id || existing?.assigned_broker || relationshipContext.company?.broker_id)
  return updateCommercialRecord('requirements', id, withCommercialRelationshipPayload({
    ...payload,
    broker_id: brokerId || null,
    assigned_broker: payload.assigned_broker || existing?.assigned_broker || brokerId || null,
  }, relationshipContext, existing), options)
}
export async function updateCommercialVacancy(id, payload = {}, options = {}) {
  const existing = await findCommercialRecordById('vacancies', id, payload.organisation_id || payload.organisationId)
  const property = await findCommercialRecordById('properties', payload.property_id || existing?.property_id, existing?.organisation_id || payload.organisation_id)
  const nextStatus = normalizeCommercialVacancyStatus(payload.status || existing?.status, 'draft')
  const updated = await updateCommercialRecord('vacancies', id, {
    ...payload,
    landlord_id: payload.landlord_id || existing?.landlord_id || property?.landlord_id || null,
    branch_id: payload.branch_id || existing?.branch_id || property?.branch_id || null,
    team_id: payload.team_id || existing?.team_id || property?.team_id || null,
    broker_id: payload.broker_id || payload.broker_assignment || existing?.broker_id || existing?.broker_assignment || property?.broker_id || null,
    broker_assignment: payload.broker_assignment || existing?.broker_assignment || existing?.broker_id || property?.broker_id || null,
    status: nextStatus,
    marketed_at: nextStatus === 'marketing' ? (payload.marketed_at || existing?.marketed_at || new Date().toISOString()) : payload.marketed_at,
    occupied_at: nextStatus === 'occupied' ? (payload.occupied_at || existing?.occupied_at || new Date().toISOString()) : payload.occupied_at,
    withdrawn_at: nextStatus === 'withdrawn' ? (payload.withdrawn_at || existing?.withdrawn_at || new Date().toISOString()) : payload.withdrawn_at,
    suspended_at: nextStatus === 'suspended' ? (payload.suspended_at || existing?.suspended_at || new Date().toISOString()) : payload.suspended_at,
    archived_at: nextStatus === 'archived' ? (payload.archived_at || existing?.archived_at || new Date().toISOString()) : payload.archived_at,
  }, { ...options, logActivity: false })

  if (nextStatus === 'occupied') {
    const listings = (await getCommercialListings(updated?.organisation_id)).filter((row) => row.vacancy_id === updated?.id && !['closed', 'archived'].includes(normalizeCommercialListingStatus(row.listing_status, 'draft')))
    await Promise.all(listings.map((listing) => updateCommercialRecord('listings', listing.id, {
      listing_status: 'closed',
      status: 'inactive',
      closed_at: listing.closed_at || new Date().toISOString(),
    }, { logActivity: false }).catch(() => null)))
  }

  const previousStatus = normalizeCommercialVacancyStatus(existing?.status, 'draft')
  const activityMeta = { propertyId: updated?.property_id || null, previousStatus, nextStatus }
  const activityType = nextStatus === 'occupied'
    ? ['vacancy_occupied', 'Vacancy Occupied', `${updated?.vacancy_name || 'Commercial vacancy'} was marked occupied.`]
    : ['vacancy_updated', 'Vacancy Updated', `${updated?.vacancy_name || 'Commercial vacancy'} was updated.`]
  await logCommercialActivity({
    organisation_id: updated?.organisation_id,
    branch_id: updated?.branch_id,
    team_id: updated?.team_id,
    broker_id: updated?.broker_id,
    entityType: 'commercial_vacancy',
    entityId: updated?.id,
    activityType: activityType[0],
    title: activityType[1],
    body: activityType[2],
    metadata: activityMeta,
  })
  return updated
}

export async function updateCommercialListing(id, payload = {}, options = {}) {
  const existing = await findCommercialRecordById('listings', id, payload.organisation_id || payload.organisationId)
  const vacancy = await findCommercialRecordById('vacancies', payload.vacancy_id || existing?.vacancy_id, existing?.organisation_id || payload.organisation_id)
  const property = await findCommercialRecordById('properties', payload.property_id || existing?.property_id || vacancy?.property_id, existing?.organisation_id || payload.organisation_id)
  const nextStatus = normalizeCommercialListingStatus(payload.listing_status || existing?.listing_status || payload.status, 'draft')
  if (vacancy?.id && vacancyBlocksNewMarketing(vacancy.status) && !['closed', 'withdrawn', 'expired', 'archived'].includes(nextStatus)) {
    throw new Error('Occupied, withdrawn, suspended, or archived vacancies cannot be marketed or linked to new active listings.')
  }

  const timestamp = new Date().toISOString()
  const updated = await updateCommercialRecord('listings', id, {
    ...payload,
    landlord_id: payload.landlord_id || existing?.landlord_id || vacancy?.landlord_id || property?.landlord_id || null,
    property_id: payload.property_id || existing?.property_id || vacancy?.property_id || null,
    branch_id: payload.branch_id || existing?.branch_id || vacancy?.branch_id || property?.branch_id || null,
    team_id: payload.team_id || existing?.team_id || vacancy?.team_id || property?.team_id || null,
    broker_id: payload.broker_id || existing?.broker_id || vacancy?.broker_id || vacancy?.broker_assignment || property?.broker_id || null,
    listing_status: nextStatus,
    status: nextStatus === 'archived' ? 'archived' : ['closed', 'withdrawn', 'expired'].includes(nextStatus) ? 'inactive' : 'active',
    internal_reviewed_at: nextStatus === 'internal_review' ? (payload.internal_reviewed_at || existing?.internal_reviewed_at || timestamp) : payload.internal_reviewed_at,
    approved_at: nextStatus === 'approved' ? (payload.approved_at || existing?.approved_at || timestamp) : payload.approved_at,
    published_at: nextStatus === 'published' ? (payload.published_at || existing?.published_at || timestamp) : payload.published_at,
    closed_at: nextStatus === 'closed' ? (payload.closed_at || existing?.closed_at || timestamp) : payload.closed_at,
    expired_at: nextStatus === 'expired' ? (payload.expired_at || existing?.expired_at || timestamp) : payload.expired_at,
    withdrawn_at: nextStatus === 'withdrawn' ? (payload.withdrawn_at || existing?.withdrawn_at || timestamp) : payload.withdrawn_at,
  }, { ...options, logActivity: false })

  const previousStatus = normalizeCommercialListingStatus(existing?.listing_status, 'draft')
  const activityType = nextStatus === 'published' && previousStatus !== 'published'
    ? ['listing_published', 'Listing Published', `${updated?.title || 'Commercial listing'} was published.`]
    : nextStatus === 'closed' && previousStatus !== 'closed'
      ? ['listing_closed', 'Listing Closed', `${updated?.title || 'Commercial listing'} was closed.`]
      : ['listing_updated', 'Listing Updated', `${updated?.title || 'Commercial listing'} was updated.`]
  await logCommercialActivity({
    organisation_id: updated?.organisation_id,
    branch_id: updated?.branch_id,
    team_id: updated?.team_id,
    broker_id: updated?.broker_id,
    entityType: 'commercial_listing',
    entityId: updated?.id,
    activityType: activityType[0],
    title: activityType[1],
    body: activityType[2],
    metadata: { previousStatus, nextStatus, vacancyId: updated?.vacancy_id || null, propertyId: updated?.property_id || null },
  })
  return updated
}

export const archiveCommercialLandlord = (id) => archiveCommercialRecord('landlords', id)
export const archiveCommercialTenant = (id) => archiveCommercialRecord('tenants', id)
export const archiveCommercialCompany = (id) => archiveCommercialRecord('companies', id)
export const archiveCommercialContact = (id) => archiveCommercialRecord('contacts', id)
export const archiveCommercialProperty = (id) => archiveCommercialRecord('properties', id)
export const archiveCommercialRequirement = (id) => archiveCommercialRecord('requirements', id)
export const archiveCommercialDeal = (id) => archiveCommercialRecord('deals', id)
export const archiveCommercialLease = (id) => archiveCommercialRecord('leases', id)
export const archiveCommercialVacancy = (id) => archiveCommercialRecord('vacancies', id)

export async function setCommercialPrimaryContact(companyId, contactId) {
  const safeCompanyId = normalizeText(companyId)
  const safeContactId = normalizeText(contactId)
  if (!safeCompanyId || !safeContactId) return null
  const company = await updateCommercialRecord('companies', safeCompanyId, { primary_contact_id: safeContactId }, { logActivity: false })
  const contacts = await getCommercialContacts(company.organisation_id)
  await Promise.all(
    contacts
      .filter((row) => row.company_id === safeCompanyId)
      .map((row) => updateCommercialRecord('contacts', row.id, { is_primary: row.id === safeContactId }, { logActivity: false })),
  )
  return company
}

export async function getCommercialDocuments(entityType, entityId, organisationId) {
  const resolvedOrganisationId = await resolveOrganisationId(organisationId)
  const normalizedEntityType = normalizeText(entityType)
  const normalizedEntityId = normalizeText(entityId)
  if (!resolvedOrganisationId || !normalizedEntityType || !normalizedEntityId || !isSupabaseConfigured || !supabase) return []
  const scope = await resolveCommercialAccessContext()
  if (!scope.hasCommercialAccess) return []

  let query = await supabase
    .from(TABLES.documents)
    .select(SELECTS.documents)
    .eq('organisation_id', resolvedOrganisationId)
    .eq('entity_type', normalizedEntityType)
    .eq('entity_id', normalizedEntityId)
    .is('archived_at', null)
    .order('created_at', { ascending: false })

  if (query.error) {
    if (isMissingCommercialTableError(query.error)) return []
    if (isCommercialSchemaMismatchError(query.error)) {
      query = await supabase
        .from(TABLES.documents)
        .select(withoutSelectColumns(SELECTS.documents, [...COMMERCIAL_HIERARCHY_COLUMNS, ...COMMERCIAL_DOCUMENT_WORKFLOW_COLUMNS]))
        .eq('organisation_id', resolvedOrganisationId)
        .eq('entity_type', normalizedEntityType)
        .eq('entity_id', normalizedEntityId)
        .is('archived_at', null)
        .order('created_at', { ascending: false })
      if (!query.error) return query.data || []
    }
    throw query.error
  }
  return query.data || []
}

export async function uploadCommercialDocument(payload = {}) {
  const organisationId = await resolveOrganisationId(payload.organisationId || payload.organisation_id)
  const entityType = normalizeText(payload.entityType || payload.entity_type)
  const entityId = normalizeText(payload.entityId || payload.entity_id)
  const file = payload.file || null

  if (!organisationId) throw new Error('Commercial organisation context is not available.')
  if (!entityType || !entityId) throw new Error('A valid commercial document link is required.')
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase is not configured.')

  const userId = await getCurrentUserId()
  const scope = await resolveCommercialAccessContext()
  if (!scope.hasCommercialAccess) throw new Error('Commercial workspace access is required.')
  const uploaded = await uploadCommercialFile({ file, organisationId, entityType, entityId })
  const documentPayload = applyDefaultCommercialHierarchy({
    organisation_id: organisationId,
    entity_type: entityType,
    entity_id: entityId,
    document_name: normalizeText(payload.documentName || payload.document_name || file?.name || 'Commercial document'),
    category: normalizeText(payload.category) || null,
    status: normalizeText(payload.status || 'uploaded'),
    notes: normalizeText(payload.notes) || null,
    file_name: normalizeText(file?.name || payload.fileName || payload.file_name) || null,
    file_path: uploaded.path || normalizeText(payload.filePath || payload.file_path) || null,
    file_bucket: uploaded.bucket || normalizeText(payload.fileBucket || payload.file_bucket || 'documents'),
    file_size: Number.isFinite(Number(file?.size)) ? Number(file.size) : null,
    mime_type: normalizeText(file?.type || payload.mimeType || payload.mime_type) || null,
    version_number: Number.isFinite(Number(payload.versionNumber || payload.version_number)) ? Math.max(1, Number(payload.versionNumber || payload.version_number)) : 1,
    supersedes_document_id: normalizeText(payload.supersedesDocumentId || payload.supersedes_document_id) || null,
    expires_at: normalizeText(payload.expiresAt || payload.expires_at) || null,
    uploaded_by: userId,
    uploaded_at: new Date().toISOString(),
    created_by: userId,
    updated_by: userId,
  }, scope)

  let query = await supabase.from(TABLES.documents).insert(documentPayload).select(SELECTS.documents).single()
  if (query.error && isCommercialSchemaMismatchError(query.error)) {
    query = await supabase
      .from(TABLES.documents)
      .insert(removeOptionalCommercialPayload(documentPayload))
      .select(withoutSelectColumns(SELECTS.documents, [...COMMERCIAL_HIERARCHY_COLUMNS, ...COMMERCIAL_DOCUMENT_WORKFLOW_COLUMNS]))
      .single()
  }
  if (query.error) throw query.error

  await logCommercialActivity({
    organisationId,
    entityType,
    entityId,
    activityType: 'document_uploaded',
    title: 'Document uploaded',
    body: `${documentPayload.document_name} was uploaded.`,
    metadata: { documentId: query.data?.id, category: documentPayload.category, versionNumber: documentPayload.version_number },
  })

  return query.data || null
}

export async function updateCommercialDocumentStatus(documentId, status) {
  const userId = await getCurrentUserId()
  const normalizedStatus = normalizeText(status)
  const reviewPayload = ['approved', 'rejected', 'under_review'].includes(normalizeLower(normalizedStatus))
    ? { reviewed_by: userId, reviewed_at: new Date().toISOString() }
    : {}
  const updated = await updateCommercialRecord('documents', documentId, { status: normalizedStatus, ...reviewPayload }, { logActivity: false })
  await logCommercialActivity({
    organisation_id: updated?.organisation_id,
    entityType: updated?.entity_type,
    entityId: updated?.entity_id,
    activityType: `document_${normalizedStatus}`,
    title: `Document ${normalizedStatus.replace(/_/g, ' ')}`,
    body: `${updated?.document_name || 'A commercial document'} was marked ${normalizedStatus.replace(/_/g, ' ')}.`,
    metadata: { documentId, status: normalizedStatus, category: updated?.category, versionNumber: updated?.version_number },
  })
  return updated
}

export async function archiveCommercialDocument(documentId) {
  const updated = await updateCommercialRecord('documents', documentId, {
    status: 'archived',
    archived_at: new Date().toISOString(),
  }, { logActivity: false })
  await logCommercialActivity({
    organisation_id: updated?.organisation_id,
    entityType: updated?.entity_type,
    entityId: updated?.entity_id,
    activityType: 'document_archived',
    title: 'Document archived',
    body: `${updated?.document_name || 'A commercial document'} was archived.`,
    metadata: { documentId },
  })
  return updated
}

export async function getCommercialDocumentDownloadUrl(document) {
  const path = normalizeText(document?.file_path)
  const bucket = normalizeText(document?.file_bucket || 'documents')
  if (!path || !isSupabaseConfigured || !supabase?.storage) return ''
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60)
  if (error) throw error
  return data?.signedUrl || ''
}

export async function getCommercialDocumentRequests(entityType, entityId, organisationId) {
  const resolvedOrganisationId = await resolveOrganisationId(organisationId)
  const normalizedEntityType = normalizeText(entityType)
  const normalizedEntityId = normalizeText(entityId)
  if (!resolvedOrganisationId || !normalizedEntityType || !normalizedEntityId || !isSupabaseConfigured || !supabase) return []
  const scope = await resolveCommercialAccessContext()
  if (!scope.hasCommercialAccess) return []

  let query = await supabase
    .from(TABLES.documentRequests)
    .select(SELECTS.documentRequests)
    .eq('organisation_id', resolvedOrganisationId)
    .eq('entity_type', normalizedEntityType)
    .eq('entity_id', normalizedEntityId)
    .order('created_at', { ascending: false })

  if (query.error) {
    if (isMissingCommercialTableError(query.error)) return []
    if (isCommercialSchemaMismatchError(query.error)) {
      query = await supabase
        .from(TABLES.documentRequests)
        .select(withoutSelectColumns(SELECTS.documentRequests, [...COMMERCIAL_HIERARCHY_COLUMNS, ...COMMERCIAL_DOCUMENT_WORKFLOW_COLUMNS]))
        .eq('organisation_id', resolvedOrganisationId)
        .eq('entity_type', normalizedEntityType)
        .eq('entity_id', normalizedEntityId)
        .order('created_at', { ascending: false })
      if (!query.error) return query.data || []
    }
    throw query.error
  }
  return query.data || []
}

async function notifyPortalDocumentRequest({ organisationId, request = {} } = {}) {
  if (!organisationId || !request?.id || !isSupabaseConfigured || !supabase) return { notified: 0, emailed: 0 }
  const entityType = normalizeText(request.entity_type)
  const entityId = normalizeText(request.entity_id)
  if (!entityType || !entityId) return { notified: 0, emailed: 0 }

  const { data: accessRows, error } = await supabase
    .from(COMMERCIAL_PORTAL_ACCESS_TABLE)
    .select(`*, contact:${COMMERCIAL_PORTAL_CONTACTS_TABLE}(*)`)
    .eq('organisation_id', organisationId)
    .eq('status', 'active')

  if (error) {
    if (isMissingCommercialTableError(error)) return { notified: 0, emailed: 0 }
    throw error
  }

  const matches = (accessRows || []).filter((row) => [
    ['commercial_transaction', row.commercial_transaction_id],
    ['commercial_deal', row.deal_id],
    ['commercial_heads_of_terms', row.heads_of_terms_id],
    ['commercial_lease', row.lease_id],
    ['commercial_requirement', row.requirement_id],
    ['commercial_tenant', row.tenant_id],
    ['commercial_landlord', row.landlord_id],
    ['commercial_property', row.property_id],
    ['commercial_vacancy', row.vacancy_id],
    ['commercial_listing', row.listing_id],
    ['commercial_company', row.company_id],
    ['commercial_contact', row.commercial_contact_id],
  ].some(([type, id]) => type === entityType && normalizeText(id) === entityId))

  if (!matches.length) return { notified: 0, emailed: 0 }

  const notifications = matches.map((row) => ({
    organisation_id: organisationId,
    access_id: row.id,
    commercial_transaction_id: row.commercial_transaction_id || '',
    portal_role: row.portal_role || 'tenant',
    company_id: row.company_id || null,
    commercial_contact_id: row.commercial_contact_id || null,
    notification_type: 'document_requested',
    title: 'Document requested',
    description: `${request.document_name || 'A commercial document'} has been requested.`,
    priority: request.priority || 'normal',
    status: 'unread',
    action_route: 'documents',
    related_entity_type: entityType,
    related_entity_id: entityId,
  }))

  const insertResult = await supabase.from(COMMERCIAL_PORTAL_NOTIFICATIONS_TABLE).insert(notifications)
  if (insertResult.error && !isMissingCommercialTableError(insertResult.error)) throw insertResult.error

  let emailed = 0
  for (const row of matches) {
    const email = normalizeText(row.contact?.contact_email)
    if (!email) continue
    try {
      const portalUrl = typeof window !== 'undefined' && window.location?.origin
        ? `${window.location.origin}/commercial/portal/${row.token}`
        : `/commercial/portal/${row.token}`
      const response = await invokeEdgeFunction('send-email', {
        body: {
          type: 'client_portal_link',
          to: email,
          clientName: row.contact?.contact_name || 'Commercial client',
          recipientName: row.contact?.contact_name || 'Commercial client',
          portalUrl,
          onboardingUrl: portalUrl,
          actionLink: portalUrl,
          transactionId: row.commercial_transaction_id,
          transactionTitle: request.document_name || 'Document requested',
          organisationName: 'Bridge Commercial',
          subject: `${request.document_name || 'Commercial document'} requested`,
        },
      })
      const sendError = response?.error || response?.data?.error
      if (!sendError) emailed += 1
    } catch {
      // Portal notifications remain the source of truth when email delivery is unavailable.
    }
  }

  return { notified: matches.length, emailed }
}

export async function createCommercialDocumentRequest(payload = {}) {
  const organisationId = await resolveOrganisationId(payload.organisationId || payload.organisation_id)
  const entityType = normalizeText(payload.entityType || payload.entity_type)
  const entityId = normalizeText(payload.entityId || payload.entity_id)

  if (!organisationId) throw new Error('Commercial organisation context is not available.')
  if (!entityType || !entityId) throw new Error('A valid commercial document request link is required.')
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase is not configured.')

  const userId = await getCurrentUserId()
  const scope = await resolveCommercialAccessContext()
  if (!scope.hasCommercialAccess) throw new Error('Commercial workspace access is required.')
  const requestPayload = applyDefaultCommercialHierarchy({
    organisation_id: organisationId,
    entity_type: entityType,
    entity_id: entityId,
    document_name: normalizeText(payload.documentName || payload.document_name),
    category: normalizeText(payload.category) || null,
    requested_from: normalizeText(payload.requestedFrom || payload.requested_from) || null,
    due_date: normalizeText(payload.dueDate || payload.due_date) || null,
    priority: normalizeText(payload.priority) || 'normal',
    requested_by: userId,
    notes: normalizeText(payload.notes) || null,
    status: normalizeText(payload.status || 'requested'),
    created_by: userId,
    updated_by: userId,
  }, scope)

  let query = await supabase.from(TABLES.documentRequests).insert(requestPayload).select(SELECTS.documentRequests).single()
  if (query.error && isCommercialSchemaMismatchError(query.error)) {
    query = await supabase
      .from(TABLES.documentRequests)
      .insert(removeOptionalCommercialPayload(requestPayload))
      .select(withoutSelectColumns(SELECTS.documentRequests, [...COMMERCIAL_HIERARCHY_COLUMNS, ...COMMERCIAL_DOCUMENT_WORKFLOW_COLUMNS]))
      .single()
  }
  if (query.error) throw query.error

  await logCommercialActivity({
    organisationId,
    entityType,
    entityId,
    activityType: 'document_requested',
    title: 'Document requested',
    body: `${requestPayload.document_name || 'A commercial document'} was requested.`,
    metadata: { requestId: query.data?.id, category: requestPayload.category, priority: requestPayload.priority, dueDate: requestPayload.due_date },
  })

  await notifyPortalDocumentRequest({ organisationId, request: query.data }).catch(() => null)

  return query.data || null
}

export async function getHeadsOfTermsByDeal(dealId, organisationId) {
  const resolvedOrganisationId = await resolveOrganisationId(organisationId)
  const normalizedDealId = normalizeText(dealId)
  if (!resolvedOrganisationId || !normalizedDealId || !isSupabaseConfigured || !supabase) return null

  let query = await supabase
    .from(TABLES.headsOfTerms)
    .select(SELECTS.headsOfTerms)
    .eq('organisation_id', resolvedOrganisationId)
    .eq('deal_id', normalizedDealId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (query.error) {
    if (isMissingCommercialTableError(query.error)) return null
    if (isCommercialSchemaMismatchError(query.error)) {
      query = await supabase
        .from(TABLES.headsOfTerms)
        .select(withoutSelectColumns(SELECTS.headsOfTerms, [...COMMERCIAL_HIERARCHY_COLUMNS, ...COMMERCIAL_DOCUMENT_WORKFLOW_COLUMNS, ...COMMERCIAL_LEASING_WORKFLOW_COLUMNS]))
        .eq('organisation_id', resolvedOrganisationId)
        .eq('deal_id', normalizedDealId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!query.error) return query.data || null
    }
    throw query.error
  }
  return query.data || null
}

export async function createHeadsOfTerms(payload = {}) {
  const organisationId = await resolveOrganisationId(payload.organisationId || payload.organisation_id)
  if (!organisationId) throw new Error('Commercial organisation context is not available.')
  if (!normalizeText(payload.deal_id || payload.dealId)) throw new Error('A deal is required before Heads of Terms can be saved.')
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase is not configured.')

  const userId = await getCurrentUserId()
  const scope = await resolveCommercialAccessContext()
  const insertPayload = applyDefaultCommercialHierarchy({
    ...payload,
    organisation_id: organisationId,
    deal_id: payload.deal_id || payload.dealId,
    created_by: payload.created_by || payload.createdBy || userId,
    updated_by: payload.updated_by || payload.updatedBy || userId,
    status: payload.status || 'draft',
  }, scope)
  delete insertPayload.organisationId
  delete insertPayload.dealId
  delete insertPayload.createdBy
  delete insertPayload.updatedBy

  let query = await supabase.from(TABLES.headsOfTerms).insert(insertPayload).select(SELECTS.headsOfTerms).single()
  if (query.error && isCommercialSchemaMismatchError(query.error)) {
    query = await supabase
      .from(TABLES.headsOfTerms)
      .insert(removeOptionalCommercialPayload(insertPayload))
      .select(withoutSelectColumns(SELECTS.headsOfTerms, [...COMMERCIAL_HIERARCHY_COLUMNS, ...COMMERCIAL_DOCUMENT_WORKFLOW_COLUMNS, ...COMMERCIAL_LEASING_WORKFLOW_COLUMNS]))
      .single()
  }
  if (query.error) throw query.error

  if (query.data?.deal_id) {
    await updateCommercialRecord('deals', query.data.deal_id, { stage: 'hot_draft' }, { logActivity: false }).catch(() => null)
  }
  if (query.data?.vacancy_id) {
    await updateCommercialRecord('vacancies', query.data.vacancy_id, { status: 'hot_in_progress' }, { logActivity: false }).catch(() => null)
  }

  await logCommercialActivity({
    organisationId,
    entityType: 'commercial_deal',
    entityId: insertPayload.deal_id,
    activityType: 'heads_of_terms_created',
    title: 'Heads of Terms created',
    body: 'Heads of Terms draft was created.',
    metadata: { headsOfTermsId: query.data?.id },
  })

  return query.data || null
}

export async function updateHeadsOfTerms(id, payload = {}, options = {}) {
  const hotId = normalizeText(id)
  if (!hotId) throw new Error('A valid Heads of Terms id is required.')
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase is not configured.')

  const userId = await getCurrentUserId()
  const scope = await resolveCommercialAccessContext()
  const updatePayload = applyDefaultCommercialHierarchy({ ...payload, updated_by: payload.updated_by || payload.updatedBy || userId }, scope)
  delete updatePayload.id
  delete updatePayload.organisationId
  delete updatePayload.organisation_id
  delete updatePayload.createdBy
  delete updatePayload.created_by
  delete updatePayload.updatedBy

  let query = await applyCommercialScope(
    supabase.from(TABLES.headsOfTerms).update(updatePayload).eq('id', hotId),
    'headsOfTerms',
    scope,
  ).select(SELECTS.headsOfTerms).single()
  if (query.error && isCommercialSchemaMismatchError(query.error)) {
    query = await supabase
      .from(TABLES.headsOfTerms)
      .update(removeOptionalCommercialPayload(updatePayload))
      .eq('id', hotId)
      .select(withoutSelectColumns(SELECTS.headsOfTerms, [...COMMERCIAL_HIERARCHY_COLUMNS, ...COMMERCIAL_DOCUMENT_WORKFLOW_COLUMNS, ...COMMERCIAL_LEASING_WORKFLOW_COLUMNS]))
      .single()
  }
  if (query.error) throw query.error

  if (options.logActivity !== false) {
    await logCommercialActivity({
      organisation_id: query.data?.organisation_id,
      entityType: 'commercial_deal',
      entityId: query.data?.deal_id,
      activityType: 'heads_of_terms_updated',
      title: 'Heads of Terms updated',
      body: 'Heads of Terms details were updated.',
      metadata: { headsOfTermsId: hotId, changedFields: changedPayloadKeys(updatePayload) },
    })
  }

  return query.data || null
}

export async function updateHeadsOfTermsStatus(id, status) {
  const normalizedStatus = normalizeCommercialLifecycleStage('headsOfTerms', status, 'draft')
  const timestampFields = {
    sent: 'sent_at',
    accepted: 'accepted_at',
    rejected: 'rejected_at',
    signed: 'signed_at',
    converted: 'converted_at',
  }
  const payload = { status: normalizedStatus }
  if (timestampFields[normalizedStatus]) payload[timestampFields[normalizedStatus]] = new Date().toISOString()
  const updated = await updateHeadsOfTerms(id, payload, { logActivity: false })
  const dealStageByHotStatus = {
    sent: 'hot_sent',
    accepted: 'hot_accepted',
    signed: 'lease_pending',
    converted: 'converted',
    rejected: 'lost',
  }
  if (updated?.deal_id && dealStageByHotStatus[normalizedStatus]) {
    await updateCommercialRecord('deals', updated.deal_id, { stage: dealStageByHotStatus[normalizedStatus] }, { logActivity: false }).catch(() => null)
  }
  if (updated?.vacancy_id) {
    const vacancyStatusByHotStatus = {
      draft: 'hot_in_progress',
      sent: 'hot_in_progress',
      under_review: 'hot_in_progress',
      accepted: 'hot_in_progress',
      signed: 'hot_in_progress',
      converted: 'hot_in_progress',
      rejected: 'under_negotiation',
    }
    if (vacancyStatusByHotStatus[normalizedStatus]) {
      await updateCommercialRecord('vacancies', updated.vacancy_id, { status: vacancyStatusByHotStatus[normalizedStatus] }, { logActivity: false }).catch(() => null)
    }
  }
  await logCommercialActivity({
    organisation_id: updated?.organisation_id,
    entityType: 'commercial_deal',
    entityId: updated?.deal_id,
    activityType: 'heads_of_terms_status_changed',
    title: 'Heads of Terms status changed',
    body: `Heads of Terms marked ${normalizedStatus.replace(/_/g, ' ')}.`,
    metadata: { headsOfTermsId: id, status: normalizedStatus, automatedDealStage: dealStageByHotStatus[normalizedStatus] || null },
  })
  if (updated?.deal_id && ['accepted', 'signed'].includes(normalizedStatus)) {
    await updateCommercialTransactionStatusForDeal(updated.deal_id, 'hot_signed', normalizedStatus, updated.organisation_id).catch(() => null)
  }
  return updated
}

export async function updateCommercialRequirementStage(id, stage, previousStage = '') {
  const nextStage = normalizeCommercialLifecycleStage('requirements', stage, 'new')
  const updated = await updateCommercialRecord('requirements', id, { stage: nextStage }, { logActivity: false })
  await logCommercialActivity({
    organisation_id: updated?.organisation_id,
    entityType: 'commercial_requirement',
    entityId: id,
    activityType: 'stage_changed',
    title: 'Requirement stage changed',
    body: previousStage ? `Moved from ${previousStage} to ${nextStage}.` : `Moved to ${nextStage}.`,
    metadata: { previousStage, nextStage },
  })
  return updated
}

export async function updateCommercialDealStage(id, stage, previousStage = '') {
  const nextStage = normalizeCommercialLifecycleStage('deals', stage, 'new')
  const updated = await updateCommercialRecord('deals', id, { stage: nextStage }, { logActivity: false })
  await logCommercialActivity({
    organisation_id: updated?.organisation_id,
    entityType: 'commercial_deal',
    entityId: id,
    activityType: 'stage_changed',
    title: 'Deal stage changed',
    body: previousStage ? `Moved from ${previousStage} to ${nextStage}.` : `Moved to ${nextStage}.`,
    metadata: { previousStage, nextStage },
  })
  return updated
}

function viewingDisplayDate(row = {}) {
  const date = normalizeText(row.viewing_date)
  const time = normalizeText(row.viewing_time).slice(0, 5)
  return [date, time].filter(Boolean).join(' at ') || 'scheduled time'
}

function viewingActivityCopy(row = {}, fallback = 'Commercial viewing updated') {
  const label = viewingDisplayDate(row)
  return `${fallback} for ${label}.`
}

async function notifyCommercialViewingBroker(viewing = {}, eventType = 'viewing_updated', title = 'Commercial viewing update', message = '') {
  if (!viewing?.id || !isSupabaseConfigured || !supabase) return { notificationCount: 0, skippedReason: 'notification_unavailable' }
  const result = await supabase.rpc('bridge_notify_commercial_viewing', {
    p_viewing_id: viewing.id,
    p_event_type: eventType,
    p_title: title,
    p_message: message || title,
  })
  if (result.error) {
    if (isMissingCommercialNotificationError(result.error)) {
      return { notificationCount: 0, skippedReason: 'notification_helper_missing' }
    }
    console.warn('[Commercial viewings] broker notification failed.', result.error)
    return { notificationCount: 0, skippedReason: 'notification_failed' }
  }
  return {
    notificationCount: Array.isArray(result.data) ? result.data.length : 0,
    notifiedUserIds: (result.data || []).map((row) => normalizeText(row.recipient_user_id)).filter(Boolean),
  }
}

async function countRequirementViewings(organisationId, requirementId) {
  const resolvedOrganisationId = await resolveOrganisationId(organisationId)
  const safeRequirementId = normalizeText(requirementId)
  if (!resolvedOrganisationId || !safeRequirementId || !isSupabaseConfigured || !supabase) return 0
  const scope = await resolveCommercialAccessContext()
  if (!scope.hasCommercialAccess) return 0
  const query = await applyCommercialScope(
    supabase
      .from(TABLES.viewings)
      .select('id', { count: 'exact', head: true })
      .eq('organisation_id', resolvedOrganisationId)
      .eq('requirement_id', safeRequirementId),
    'viewings',
    scope,
  )
  if (query.error) {
    if (isMissingCommercialTableError(query.error) || isCommercialSchemaMismatchError(query.error)) return 0
    throw query.error
  }
  return query.count || 0
}

export async function createCommercialViewing(payload = {}) {
  const organisationId = await resolveOrganisationId(payload.organisationId || payload.organisation_id)
  const requirementId = normalizeText(payload.requirement_id)
  if (!organisationId) throw new Error('Commercial organisation context is not available.')
  if (!requirementId) throw new Error('A requirement is required before a viewing can be scheduled.')

  const relationshipContext = await resolveCommercialRelationshipContext(payload, organisationId)
  const firstViewing = await countRequirementViewings(organisationId, requirementId) === 0
  const viewing = await createCommercialRecord('viewings', {
    ...withCommercialRelationshipPayload(payload, relationshipContext),
    organisation_id: organisationId,
    requirement_id: requirementId,
    broker_id: payload.broker_id || payload.assigned_broker || relationshipContext.company?.broker_id || null,
    status: payload.status || 'scheduled',
  }, { logActivity: false })

  if (firstViewing) {
    await updateCommercialRecord('requirements', requirementId, { stage: 'viewing_scheduled' }, { logActivity: false }).catch(() => null)
  }

  await Promise.all([
    logCommercialActivity({
      organisation_id: viewing?.organisation_id,
      branch_id: viewing?.branch_id,
      team_id: viewing?.team_id,
      broker_id: viewing?.broker_id,
      entityType: 'commercial_viewing',
      entityId: viewing?.id,
      activityType: 'viewing_scheduled',
      title: 'Viewing Scheduled',
      body: viewingActivityCopy(viewing, 'Viewing scheduled'),
      metadata: { requirementId, propertyId: viewing?.property_id || null, vacancyId: viewing?.vacancy_id || null, listingId: viewing?.listing_id || null },
    }),
    logCommercialActivity({
      organisation_id: viewing?.organisation_id,
      branch_id: viewing?.branch_id,
      team_id: viewing?.team_id,
      broker_id: viewing?.broker_id,
      entityType: 'commercial_requirement',
      entityId: requirementId,
      activityType: 'viewing_scheduled',
      title: 'Viewing Scheduled',
      body: viewingActivityCopy(viewing, 'Viewing scheduled'),
      metadata: { viewingId: viewing?.id, propertyId: viewing?.property_id || null, vacancyId: viewing?.vacancy_id || null, listingId: viewing?.listing_id || null, firstViewing },
    }),
    notifyCommercialViewingBroker(
      viewing,
      'viewing_scheduled',
      'Commercial viewing scheduled',
      viewingActivityCopy(viewing, 'Viewing scheduled'),
    ),
  ])

  return viewing
}

export async function updateCommercialViewing(id, payload = {}, options = {}) {
  const previous = payload.previousRecord || null
  const updatePayload = { ...payload }
  delete updatePayload.previousRecord
  const existing = await findCommercialRecordById('viewings', id, payload.organisation_id || payload.organisationId)
  const relationshipContext = await resolveCommercialRelationshipContext({ ...existing, ...updatePayload }, existing?.organisation_id || payload.organisation_id)
  const updated = await updateCommercialRecord('viewings', id, withCommercialRelationshipPayload({
    ...updatePayload,
    broker_id: updatePayload.broker_id || existing?.broker_id || relationshipContext.company?.broker_id || null,
  }, relationshipContext, existing), { logActivity: false })
  const status = normalizeLower(updated?.status)
  const dateChanged = previous && (
    normalizeText(previous.viewing_date) !== normalizeText(updated?.viewing_date) ||
    normalizeText(previous.viewing_time).slice(0, 5) !== normalizeText(updated?.viewing_time).slice(0, 5)
  )
  const statusActivity = {
    completed: ['viewing_completed', 'Viewing Completed', 'Viewing completed'],
    cancelled: ['viewing_cancelled', 'Viewing Cancelled', 'Viewing cancelled'],
    no_show: ['viewing_no_show', 'No Show', 'Viewing marked as no show'],
  }[status]
  const activityTuple = statusActivity || (dateChanged ? ['viewing_rescheduled', 'Viewing Rescheduled', 'Viewing rescheduled'] : ['viewing_updated', 'Viewing Updated', 'Viewing updated'])
  const shouldNotify = dateChanged || ['cancelled'].includes(status) || options.notify === true

  await Promise.all([
    logCommercialActivity({
      organisation_id: updated?.organisation_id,
      branch_id: updated?.branch_id,
      team_id: updated?.team_id,
      broker_id: updated?.broker_id,
      entityType: 'commercial_viewing',
      entityId: updated?.id,
      activityType: activityTuple[0],
      title: activityTuple[1],
      body: viewingActivityCopy(updated, activityTuple[2]),
      metadata: { requirementId: updated?.requirement_id || null, previousStatus: previous?.status || null, nextStatus: updated?.status || null, dateChanged },
    }),
    updated?.requirement_id ? logCommercialActivity({
      organisation_id: updated?.organisation_id,
      branch_id: updated?.branch_id,
      team_id: updated?.team_id,
      broker_id: updated?.broker_id,
      entityType: 'commercial_requirement',
      entityId: updated.requirement_id,
      activityType: activityTuple[0],
      title: activityTuple[1],
      body: viewingActivityCopy(updated, activityTuple[2]),
      metadata: { viewingId: updated?.id, previousStatus: previous?.status || null, nextStatus: updated?.status || null, dateChanged },
    }) : null,
    shouldNotify ? notifyCommercialViewingBroker(
      updated,
      activityTuple[0],
      activityTuple[1],
      viewingActivityCopy(updated, activityTuple[2]),
    ) : null,
  ])
  return updated
}

export async function archiveCommercialViewing(id) {
  return updateCommercialViewing(id, { status: 'cancelled' }, { notify: true })
}

async function notifyCommercialTransactionStakeholders(transaction = {}, eventType = 'transaction_updated', title = 'Commercial transaction update', message = '') {
  if (!transaction?.id || !isSupabaseConfigured || !supabase) return { notificationCount: 0, skippedReason: 'notification_unavailable' }
  const result = await supabase.rpc('bridge_notify_commercial_transaction', {
    p_transaction_id: transaction.id,
    p_event_type: eventType,
    p_title: title,
    p_message: message || title,
  })
  if (result.error) {
    if (isMissingCommercialNotificationError(result.error)) {
      return { notificationCount: 0, skippedReason: 'notification_helper_missing' }
    }
    console.warn('[Commercial transactions] stakeholder notification failed.', result.error)
    return { notificationCount: 0, skippedReason: 'notification_failed' }
  }
  return {
    notificationCount: Array.isArray(result.data) ? result.data.length : 0,
    notifiedUserIds: (result.data || []).map((row) => normalizeText(row.recipient_user_id)).filter(Boolean),
  }
}

async function resolveCommercialTransactionLinks(payload = {}, organisationId = '') {
  const resolvedOrganisationId = await resolveOrganisationId(organisationId || payload.organisation_id || payload.organisationId)
  const [transactions, deals, requirements, listings, vacancies, properties, companies, contacts, tenants] = await Promise.all([
    getCommercialTransactions(resolvedOrganisationId),
    getCommercialDeals(resolvedOrganisationId),
    getCommercialRequirements(resolvedOrganisationId),
    getCommercialListings(resolvedOrganisationId),
    getCommercialVacancies(resolvedOrganisationId),
    getCommercialProperties(resolvedOrganisationId),
    getCommercialCompanies(resolvedOrganisationId),
    getCommercialContacts(resolvedOrganisationId),
    getCommercialTenants(resolvedOrganisationId),
  ])

  const deal = deals.find((row) => row.id === normalizeText(payload.deal_id || payload.dealId)) || null
  const requirement = requirements.find((row) => row.id === normalizeText(payload.requirement_id || payload.requirementId || deal?.requirement_id)) || null
  const listing = listings.find((row) => row.id === normalizeText(payload.listing_id || payload.listingId || deal?.listing_id)) || null
  const vacancy = vacancies.find((row) => row.id === normalizeText(payload.vacancy_id || payload.vacancyId || deal?.vacancy_id || listing?.vacancy_id)) || null
  const property = properties.find((row) => row.id === normalizeText(payload.property_id || payload.propertyId || deal?.property_id || vacancy?.property_id || listing?.property_id)) || null
  const contact = contacts.find((row) => row.id === normalizeText(payload.contact_id || payload.contactId || deal?.contact_id || requirement?.contact_id)) || null
  const company = companies.find((row) => row.id === normalizeText(payload.company_id || payload.companyId || contact?.company_id || deal?.company_id || requirement?.company_id))
    || companies.find((row) => companyLegacyId(row, 'tenant') === normalizeText(deal?.tenant_id || requirement?.tenant_id))
    || tenants.find((row) => row.id === normalizeText(payload.company_id || payload.companyId || deal?.tenant_id || requirement?.tenant_id))
    || null
  const existingTransaction = deal?.id ? transactions.find((row) => row.deal_id === deal.id) || null : null

  return {
    organisationId: resolvedOrganisationId,
    existingTransaction,
    deal,
    requirement,
    listing,
    vacancy,
    property,
    company,
    contact,
  }
}

function mapCommercialCommissionStatus(transactionStatus = '', currentStatus = '') {
  const current = normalizeLower(currentStatus || 'projected')
  const normalizedTransactionStatus = normalizeCommercialTransactionStatus(transactionStatus || '', 'draft')
  if (current === 'paid') return 'paid'
  if (normalizedTransactionStatus === 'completed') return current === 'projected' ? 'approved' : current || 'approved'
  return current || 'projected'
}

function deriveCommercialCommissionPayload(transaction = {}, linked = {}) {
  const deal = linked.deal || {}
  const lease = linked.lease || {}
  const hot = linked.hot || {}
  const transactionType = normalizeLower(transaction.transaction_type || linked.transactionType || 'lease')
  const targetValue = toNumber(transaction.target_value || linked.targetValue)
  const saleBase = targetValue || toNumber(deal.deal_value)
  const leaseBase = toNumber(lease.monthly_rental) * Math.max(toNumber(lease.lease_term_months || hot.lease_term_months || 12), 1)
    || toNumber(hot.monthly_rental) * Math.max(toNumber(hot.lease_term_months || lease.lease_term_months || 12), 1)
    || targetValue
    || toNumber(deal.deal_value)
  const baseValue = Math.max(0, transactionType === 'sale' ? saleBase : leaseBase)
  const estimatedAmount = toNumber(deal.estimated_commission || linked.commission_amount || linked.commissionAmount)
  const commissionAmount = estimatedAmount || (baseValue * 0.05)
  const commissionPercent = baseValue > 0 && estimatedAmount > 0
    ? (estimatedAmount / baseValue) * 100
    : toNumber(linked.commission_percent || linked.commissionPercent) || 5

  return {
    branch_id: transaction.branch_id || null,
    team_id: transaction.team_id || null,
    broker_id: transaction.broker_id || null,
    transaction_id: transaction.id,
    commission_percent: Math.round(commissionPercent * 100) / 100,
    commission_amount: Math.round(commissionAmount * 100) / 100,
    status: mapCommercialCommissionStatus(transaction.status, linked.status),
  }
}

async function findCommercialCommissionByTransaction(transactionId, organisationId = '') {
  const safeTransactionId = normalizeText(transactionId)
  if (!safeTransactionId) return null
  const commissions = await getCommercialCommissions(organisationId)
  return commissions.find((row) => row.transaction_id === safeTransactionId) || null
}

async function syncCommercialCommissionForTransaction(transaction = {}, linked = {}, options = {}) {
  if (!transaction?.id || !transaction?.organisation_id || !transaction?.broker_id) return null
  const existing = await findCommercialCommissionByTransaction(transaction.id, transaction.organisation_id)
  const derived = deriveCommercialCommissionPayload(transaction, {
    ...linked,
    status: existing?.status || options.status || linked.status || 'projected',
  })
  const payload = {
    organisation_id: transaction.organisation_id,
    branch_id: derived.branch_id,
    team_id: derived.team_id,
    broker_id: derived.broker_id,
    transaction_id: transaction.id,
    commission_percent: existing?.manual_override ? existing.commission_percent : derived.commission_percent,
    commission_amount: existing?.manual_override ? existing.commission_amount : derived.commission_amount,
    status: mapCommercialCommissionStatus(transaction.status, existing?.status || derived.status),
    manual_override: existing?.manual_override || false,
  }

  const commission = existing?.id
    ? await updateCommercialRecord('commissions', existing.id, payload, { logActivity: false })
    : await createCommercialRecord('commissions', payload, { logActivity: false })

  if (!existing?.id) {
    await Promise.all([
      logCommercialActivity({
        organisation_id: transaction.organisation_id,
        branch_id: transaction.branch_id,
        team_id: transaction.team_id,
        broker_id: transaction.broker_id,
        entityType: 'commercial_transaction',
        entityId: transaction.id,
        activityType: 'commission_created',
        title: 'Commission created',
        body: `Projected commission of ${Number(payload.commission_amount || 0).toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 })} was created.`,
        metadata: { commissionId: commission?.id || null, status: payload.status, transactionId: transaction.id },
      }),
      notifyCommercialTransactionStakeholders(
        transaction,
        'transaction_updated',
        'Commercial commission created',
        `${transaction?.transaction_name || 'Commercial transaction'} commission was created.`,
      ),
    ])
  }

  return commission
}

async function updateCommercialTransactionStatusForDeal(dealId, status, previousStatus = '', organisationId = '') {
  const safeDealId = normalizeText(dealId)
  if (!safeDealId) return null
  const resolvedOrganisationId = await resolveOrganisationId(organisationId)
  const transactions = await getCommercialTransactions(resolvedOrganisationId)
  const linked = transactions.find((row) => row.deal_id === safeDealId) || null
  if (!linked?.id) return null
  return updateCommercialTransactionStatus(linked.id, status, previousStatus)
}

export async function createCommercialTransaction(payload = {}) {
  const {
    organisationId,
    existingTransaction,
    deal,
    requirement,
    listing,
    vacancy,
    property,
    company,
    contact,
  } = await resolveCommercialTransactionLinks(payload)

  if (!organisationId) throw new Error('Commercial organisation context is not available.')
  if (existingTransaction?.id) return existingTransaction

  const brokerId = normalizeText(
    payload.broker_id ||
      payload.brokerId ||
      deal?.broker_id ||
      deal?.assigned_broker ||
      requirement?.broker_id ||
      requirement?.assigned_broker ||
      vacancy?.broker_assignment ||
      vacancy?.broker_id ||
      listing?.broker_id ||
      property?.broker_id,
  )
  if (!brokerId) throw new Error('A broker owner is required before a commercial transaction can be created.')

  const transactionType = transactionTypeFromRecord(payload, deal, listing, requirement)
  const initialStatus = normalizeCommercialTransactionStatus(payload.status || (deal?.id ? 'negotiating' : 'draft'), deal?.id ? 'negotiating' : 'draft')
  const transaction = await createCommercialRecord('transactions', {
    ...payload,
    organisation_id: organisationId,
    branch_id: payload.branch_id || deal?.branch_id || requirement?.branch_id || listing?.branch_id || vacancy?.branch_id || property?.branch_id || null,
    team_id: payload.team_id || deal?.team_id || requirement?.team_id || listing?.team_id || vacancy?.team_id || property?.team_id || null,
    deal_id: payload.deal_id || deal?.id || null,
    requirement_id: payload.requirement_id || requirement?.id || deal?.requirement_id || null,
    property_id: payload.property_id || property?.id || null,
    vacancy_id: payload.vacancy_id || vacancy?.id || null,
    listing_id: payload.listing_id || listing?.id || deal?.listing_id || null,
    broker_id: brokerId,
    company_id: payload.company_id || company?.id || deal?.tenant_id || requirement?.tenant_id || null,
    contact_id: payload.contact_id || payload.contactId || contact?.id || requirement?.contact_id || deal?.contact_id || company?.primary_contact_id || null,
    transaction_type: transactionType,
    status: initialStatus,
    transaction_name: transactionNameFromLinks({ payload, deal, requirement, listing, vacancy, property, company }),
    target_value: payload.target_value ?? payload.targetValue ?? deal?.deal_value ?? listing?.pricing ?? vacancy?.asking_rental ?? property?.asking_sale_price ?? null,
    expected_close_date: payload.expected_close_date || payload.expectedCloseDate || deal?.expected_close_date || null,
    actual_close_date: payload.actual_close_date || payload.actualCloseDate || null,
    notes: payload.notes || deal?.notes || requirement?.notes || listing?.notes || vacancy?.notes || null,
  }, { logActivity: false })

  await Promise.all([
    logCommercialActivity({
      organisation_id: transaction?.organisation_id,
      branch_id: transaction?.branch_id,
      team_id: transaction?.team_id,
      broker_id: transaction?.broker_id,
      entityType: 'commercial_transaction',
      entityId: transaction?.id,
      activityType: 'transaction_created',
      title: 'Transaction created',
      body: `${transaction?.transaction_name || 'Commercial transaction'} was created.`,
      metadata: {
        dealId: transaction?.deal_id || null,
        requirementId: transaction?.requirement_id || null,
        propertyId: transaction?.property_id || null,
        vacancyId: transaction?.vacancy_id || null,
        listingId: transaction?.listing_id || null,
        transactionType,
      },
    }),
    transaction?.deal_id ? logCommercialActivity({
      organisation_id: transaction?.organisation_id,
      branch_id: transaction?.branch_id,
      team_id: transaction?.team_id,
      broker_id: transaction?.broker_id,
      entityType: 'commercial_deal',
      entityId: transaction.deal_id,
      activityType: 'transaction_linked',
      title: 'Transaction linked',
      body: `${transaction?.transaction_name || 'Commercial transaction'} was linked to this deal.`,
      metadata: { transactionId: transaction?.id, transactionType },
    }) : null,
    transaction?.requirement_id ? logCommercialActivity({
      organisation_id: transaction?.organisation_id,
      branch_id: transaction?.branch_id,
      team_id: transaction?.team_id,
      broker_id: transaction?.broker_id,
      entityType: 'commercial_requirement',
      entityId: transaction.requirement_id,
      activityType: 'transaction_created',
      title: 'Transaction created',
      body: `${transaction?.transaction_name || 'Commercial transaction'} was opened from this requirement.`,
      metadata: { transactionId: transaction?.id, dealId: transaction?.deal_id || null },
    }) : null,
    notifyCommercialTransactionStakeholders(
      transaction,
      'transaction_created',
      'Commercial transaction created',
      `${transaction?.transaction_name || 'Commercial transaction'} was created.`,
    ),
    syncCommercialCommissionForTransaction(transaction, { deal, lease: null, hot: null, status: 'projected' }),
  ])

  return transaction
}

export async function updateCommercialTransaction(id, payload = {}, options = {}) {
  const existing = await findCommercialRecordById('transactions', id, payload.organisation_id || payload.organisationId)
  const relationshipContext = await resolveCommercialRelationshipContext({ ...existing, ...payload }, existing?.organisation_id || payload.organisation_id)
  const updated = await updateCommercialRecord('transactions', id, withCommercialRelationshipPayload(payload, relationshipContext, existing), options)
  await syncCommercialCommissionForTransaction(updated, { deal: payload.deal || null }).catch(() => null)
  return updated
}

export async function updateCommercialCommission(id, payload = {}, options = {}) {
  const existing = await findCommercialRecordById('commissions', id, payload.organisation_id || payload.organisationId)
  const updated = await updateCommercialRecord('commissions', id, {
    ...payload,
    manual_override: payload.manual_override ?? true,
  }, { ...options, logActivity: false })
  await logCommercialActivity({
    organisation_id: updated?.organisation_id,
    branch_id: updated?.branch_id,
    team_id: updated?.team_id,
    broker_id: updated?.broker_id,
    entityType: 'commercial_transaction',
    entityId: updated?.transaction_id,
    activityType: 'commission_updated',
    title: 'Commission updated',
    body: 'Commercial commission was updated.',
    metadata: {
      commissionId: updated?.id,
      previousStatus: existing?.status || null,
      nextStatus: updated?.status || null,
      manualOverride: updated?.manual_override || false,
    },
  })
  return updated
}

export async function createCommercialLease(payload = {}) {
  const lease = await createCommercialRecord('leases', payload)
  if (lease?.deal_id) {
    const nextStatus = ['executed', 'active'].includes(normalizeLower(lease.status)) ? 'completed' : 'lease_pending'
    await updateCommercialTransactionStatusForDeal(lease.deal_id, nextStatus, '', lease.organisation_id).catch(() => null)
  }
  if (lease?.vacancy_id) {
    const vacancyStatus = ['executed', 'active'].includes(normalizeLower(lease.status)) ? 'occupied' : 'hot_in_progress'
    await updateCommercialVacancy(lease.vacancy_id, { status: vacancyStatus }, { logActivity: false }).catch(() => null)
  }
  return lease
}

export async function updateCommercialTransactionStatus(id, status, previousStatus = '') {
  const nextStatus = normalizeCommercialTransactionStatus(status, 'draft')
  const payload = {
    status: nextStatus,
  }
  if (nextStatus === 'completed') {
    payload.actual_close_date = new Date().toISOString().slice(0, 10)
  }
  const updated = await updateCommercialRecord('transactions', id, payload, { logActivity: false })
  await Promise.all([
    logCommercialActivity({
      organisation_id: updated?.organisation_id,
      branch_id: updated?.branch_id,
      team_id: updated?.team_id,
      broker_id: updated?.broker_id,
      entityType: 'commercial_transaction',
      entityId: id,
      activityType: 'transaction_stage_changed',
      title: 'Transaction stage changed',
      body: previousStatus ? `Moved from ${previousStatus} to ${nextStatus}.` : `Moved to ${nextStatus}.`,
      metadata: { previousStatus, nextStatus, dealId: updated?.deal_id || null },
    }),
    ['completed', 'lost', 'cancelled'].includes(nextStatus)
      ? notifyCommercialTransactionStakeholders(
          updated,
          `transaction_${nextStatus}`,
          `Commercial transaction ${nextStatus.replace(/_/g, ' ')}`,
          `${updated?.transaction_name || 'Commercial transaction'} was marked ${nextStatus.replace(/_/g, ' ')}.`,
        )
      : null,
    syncCommercialCommissionForTransaction(updated, { status: nextStatus }),
  ])
  return updated
}

export async function archiveCommercialTransaction(id) {
  return updateCommercialTransactionStatus(id, 'cancelled')
}

export async function updateCommercialDeal(id, payload = {}, options = {}) {
  const existing = await findCommercialRecordById('deals', id, payload.organisation_id || payload.organisationId)
  const relationshipContext = await resolveCommercialRelationshipContext({ ...existing, ...payload }, existing?.organisation_id || payload.organisation_id)
  const brokerId = normalizeText(payload.broker_id || payload.assigned_broker || existing?.broker_id || existing?.assigned_broker || relationshipContext.company?.broker_id)
  return updateCommercialRecord('deals', id, withCommercialRelationshipPayload({
    ...payload,
    broker_id: brokerId || null,
    assigned_broker: payload.assigned_broker || existing?.assigned_broker || brokerId || null,
  }, relationshipContext, existing), options)
}

export async function updateCommercialLease(id, payload = {}, options = {}) {
  const previous = payload.previousRecord || null
  const updatePayload = { ...payload }
  delete updatePayload.previousRecord
  const updated = await updateCommercialRecord('leases', id, updatePayload, options)
  const statusChanged = previous && normalizeLower(previous.status) !== normalizeLower(updated?.status)
  if (statusChanged && updated?.deal_id) {
    const nextStatus = ['executed', 'active'].includes(normalizeLower(updated.status))
      ? 'completed'
      : ['draft', 'pending_signature'].includes(normalizeLower(updated.status))
        ? 'lease_pending'
        : ''
    if (nextStatus) {
      await updateCommercialTransactionStatusForDeal(updated.deal_id, nextStatus, previous?.status || '', updated.organisation_id).catch(() => null)
    }
  }
  if (statusChanged && updated?.vacancy_id) {
    const vacancyStatus = ['executed', 'active'].includes(normalizeLower(updated.status)) ? 'occupied' : 'hot_in_progress'
    await updateCommercialVacancy(updated.vacancy_id, { status: vacancyStatus }, { logActivity: false }).catch(() => null)
  }
  return updated
}

export async function createDealFromRequirement(requirement, payload = {}) {
  const sourceRequirement = requirement || {}
  const deal = await createCommercialRecord('deals', {
    ...payload,
    organisation_id: payload.organisation_id || sourceRequirement.organisation_id,
    requirement_id: payload.requirement_id || sourceRequirement.id,
    company_id: payload.company_id || sourceRequirement.company_id,
    contact_id: payload.contact_id || sourceRequirement.contact_id,
    tenant_id: payload.tenant_id || sourceRequirement.tenant_id,
    landlord_id: payload.landlord_id || sourceRequirement.landlord_id,
    property_id: payload.property_id || sourceRequirement.property_id,
    vacancy_id: payload.vacancy_id || sourceRequirement.vacancy_id,
    listing_id: payload.listing_id || sourceRequirement.listing_id,
    assigned_broker: payload.assigned_broker || sourceRequirement.assigned_broker,
    broker_id: payload.broker_id || payload.assigned_broker || sourceRequirement.broker_id || sourceRequirement.assigned_broker,
    branch_id: payload.branch_id || sourceRequirement.branch_id,
    team_id: payload.team_id || sourceRequirement.team_id,
    status: payload.status || 'active',
    stage: payload.stage || 'new',
  }, { logActivity: false })

  if (sourceRequirement.id) {
    await updateCommercialRecord('requirements', sourceRequirement.id, { stage: 'negotiating' }, { logActivity: false }).catch(() => null)
  }
  if (deal?.vacancy_id) {
    await updateCommercialRecord('vacancies', deal.vacancy_id, { status: 'under_negotiation' }, { logActivity: false }).catch(() => null)
  }

  await logCommercialActivity({
    organisation_id: sourceRequirement.organisation_id || deal?.organisation_id,
    entityType: 'commercial_requirement',
    entityId: sourceRequirement.id,
    activityType: 'requirement_converted_to_deal',
    title: 'Deal created from requirement',
    body: deal?.deal_name ? `Created ${deal.deal_name}.` : 'A commercial deal was created from this requirement.',
    metadata: { dealId: deal?.id },
  })

  await logCommercialActivity({
    organisation_id: deal?.organisation_id || sourceRequirement.organisation_id,
    entityType: 'commercial_deal',
    entityId: deal?.id,
    activityType: 'deal_created',
    title: 'Deal created',
    body: sourceRequirement.requirement_name ? `Created from ${sourceRequirement.requirement_name}.` : 'Commercial deal created.',
    metadata: { requirementId: sourceRequirement.id },
  })

  return deal
}

export async function createLeaseFromHeadsOfTerms(headsOfTerms, payload = {}) {
  const hot = headsOfTerms || {}
  const organisationId = await resolveOrganisationId(payload.organisationId || payload.organisation_id || hot.organisation_id)
  if (!organisationId) throw new Error('Commercial organisation context is not available.')
  if (!hot.id) throw new Error('A signed Heads of Terms record is required before a lease can be created.')

  const leaseStart = payload.lease_start_date || hot.lease_commencement_date || hot.beneficial_occupation_date || null
  const leaseTermMonths = payload.lease_term_months || hot.lease_term_months || null
  const lease = await createCommercialLease({
    organisation_id: organisationId,
    deal_id: payload.deal_id || hot.deal_id,
    heads_of_terms_id: hot.id,
    tenant_id: payload.tenant_id || hot.tenant_id,
    landlord_id: payload.landlord_id || hot.landlord_id,
    property_id: payload.property_id || hot.property_id,
    vacancy_id: payload.vacancy_id || hot.vacancy_id,
    branch_id: payload.branch_id || hot.branch_id,
    team_id: payload.team_id || hot.team_id,
    broker_id: payload.broker_id || hot.broker_id,
    lease_start_date: leaseStart,
    occupation_date: payload.occupation_date || hot.beneficial_occupation_date || hot.lease_commencement_date,
    lease_end_date: payload.lease_end_date || (leaseStart && leaseTermMonths ? addMonthsToDate(leaseStart, leaseTermMonths) : null),
    lease_term_months: leaseTermMonths,
    monthly_rental: payload.monthly_rental ?? hot.monthly_rental,
    rental_per_m2: payload.rental_per_m2 ?? hot.rental_per_m2,
    escalation_percentage: payload.escalation_percentage ?? hot.escalation_percentage,
    deposit_amount: payload.deposit_amount ?? hot.deposit_amount,
    tenant_installation_allowance: payload.tenant_installation_allowance ?? hot.tenant_installation_allowance,
    rent_free_period_months: payload.rent_free_period_months ?? hot.rent_free_period_months,
    status: payload.status || 'draft',
    notes: payload.notes || hot.special_conditions || null,
  })

  await Promise.all([
    hot.deal_id ? updateCommercialRecord('deals', hot.deal_id, { stage: 'converted' }, { logActivity: false }).catch(() => null) : null,
    hot.vacancy_id ? updateCommercialVacancy(hot.vacancy_id, { status: lease.status === 'active' ? 'occupied' : 'hot_in_progress' }, { logActivity: false }).catch(() => null) : null,
    updateHeadsOfTerms(hot.id, { status: 'converted', converted_at: new Date().toISOString() }, { logActivity: false }).catch(() => null),
    hot.deal_id ? updateCommercialTransactionStatusForDeal(hot.deal_id, ['executed', 'active'].includes(normalizeLower(lease.status)) ? 'completed' : 'lease_pending', hot.status || '', organisationId).catch(() => null) : null,
  ])

  await logCommercialActivity({
    organisation_id: organisationId,
    entityType: 'commercial_deal',
    entityId: hot.deal_id,
    activityType: 'lease_created_from_hot',
    title: 'Lease created from Heads of Terms',
    body: lease?.id ? `Lease ${String(lease.id).slice(0, 8)} was created from signed Heads of Terms.` : 'Lease was created from signed Heads of Terms.',
    metadata: { headsOfTermsId: hot.id, leaseId: lease?.id },
  })

  await logCommercialActivity({
    organisation_id: organisationId,
    entityType: 'commercial_lease',
    entityId: lease?.id,
    activityType: 'lease_created',
    title: 'Lease created',
    body: 'Lease record created from signed Heads of Terms.',
    metadata: { headsOfTermsId: hot.id, dealId: hot.deal_id },
  })

  return lease
}

export async function getCommercialActivity({ organisationId, entityType, entityId } = {}) {
  const resolvedOrganisationId = await resolveOrganisationId(organisationId)
  const normalizedEntityType = normalizeText(entityType)
  const normalizedEntityId = normalizeText(entityId)
  if (!resolvedOrganisationId || !normalizedEntityType || !normalizedEntityId || !isSupabaseConfigured || !supabase) return []

  const query = await supabase
    .from(TABLES.activity)
    .select(SELECTS.activity)
    .eq('organisation_id', resolvedOrganisationId)
    .eq('entity_type', normalizedEntityType)
    .eq('entity_id', normalizedEntityId)
    .order('created_at', { ascending: false })

  if (query.error) {
    if (isMissingCommercialTableError(query.error)) return []
    throw query.error
  }

  return query.data || []
}

export async function getCommercialRecentActivity(organisationId, limit = 20) {
  const resolvedOrganisationId = await resolveOrganisationId(organisationId)
  if (!resolvedOrganisationId || !isSupabaseConfigured || !supabase) return []

  const query = await supabase
    .from(TABLES.activity)
    .select(SELECTS.activity)
    .eq('organisation_id', resolvedOrganisationId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (query.error) {
    if (isMissingCommercialTableError(query.error)) return []
    throw query.error
  }

  return query.data || []
}

export async function addCommercialNote({ organisationId, entityType, entityId, body }) {
  return createCommercialActivity({
    organisationId,
    entityType,
    entityId,
    activityType: 'note_added',
    title: 'Note added',
    body,
  })
}

export async function getCommercialLookupData(organisationId) {
  const resolvedOrganisationId = await resolveOrganisationId(organisationId)
  if (!resolvedOrganisationId) {
    return { companies: [], contacts: [], landlords: [], tenants: [], properties: [], requirements: [], deals: [], leases: [], vacancies: [], listings: [], viewings: [], transactions: [], commissions: [], brokers: [], branches: [], teams: [] }
  }

  const [companies, contacts, landlords, tenants, properties, requirements, deals, leases, vacancies, listings, viewings, transactions, commissions, brokers, branches, teams] = await Promise.all([
    getCommercialCompanies(resolvedOrganisationId),
    getCommercialContacts(resolvedOrganisationId),
    getCommercialLandlords(resolvedOrganisationId),
    getCommercialTenants(resolvedOrganisationId),
    getCommercialProperties(resolvedOrganisationId),
    getCommercialRequirements(resolvedOrganisationId),
    getCommercialDeals(resolvedOrganisationId),
    getCommercialLeases(resolvedOrganisationId),
    getCommercialVacancies(resolvedOrganisationId),
    getCommercialListings(resolvedOrganisationId),
    getCommercialViewings(resolvedOrganisationId),
    getCommercialTransactions(resolvedOrganisationId),
    getCommercialCommissions(resolvedOrganisationId),
    listOrganisationUsers().catch(() => []),
    listCommercialBranches(resolvedOrganisationId),
    listCommercialTeams(resolvedOrganisationId),
  ])

  return { companies, contacts, landlords, tenants, properties, requirements, deals, leases, vacancies, listings, viewings, transactions, commissions, brokers, branches, teams }
}

export async function getCommercialDocumentCentreData(organisationId) {
  const resolvedOrganisationId = await resolveOrganisationId(organisationId)
  if (!resolvedOrganisationId) {
    return {
      documents: [],
      documentRequests: [],
      lookups: { brokers: [], branches: [], teams: [] },
    }
  }

  const [documents, documentRequests, lookups] = await Promise.all([
    getCommercialAllDocuments(resolvedOrganisationId),
    getCommercialAllDocumentRequests(resolvedOrganisationId),
    getCommercialLookupData(resolvedOrganisationId),
  ])

  return {
    documents,
    documentRequests,
    lookups,
  }
}

async function listCommercialBranches(organisationId) {
  if (!organisationId || !isSupabaseConfigured || !supabase) return []
  const query = await supabase
    .from('organisation_branches')
    .select('id, name, city, province')
    .eq('organisation_id', organisationId)
    .order('name', { ascending: true })
  if (query.error) return []
  return query.data || []
}

async function listCommercialTeams(organisationId) {
  if (!organisationId || !isSupabaseConfigured || !supabase) return []
  const query = await supabase
    .from('commercial_teams')
    .select('id, organisation_id, branch_id, name, status')
    .eq('organisation_id', organisationId)
    .order('name', { ascending: true })
  if (query.error) {
    if (isMissingCommercialTableError(query.error) || isCommercialSchemaMismatchError(query.error)) return []
    return []
  }
  return query.data || []
}

export async function getCommercialDashboardData(organisationId) {
  const resolvedOrganisationId = await resolveOrganisationId(organisationId)
  if (!resolvedOrganisationId) {
    return buildCommercialDashboardData()
  }

  const [landlords, tenants, properties, requirements, deals, leases, documents, documentRequests, headsOfTerms] = await Promise.all([
    getCommercialLandlords(resolvedOrganisationId),
    getCommercialTenants(resolvedOrganisationId),
    getCommercialProperties(resolvedOrganisationId),
    getCommercialRequirements(resolvedOrganisationId),
    getCommercialDeals(resolvedOrganisationId),
    getCommercialLeases(resolvedOrganisationId),
    getCommercialAllDocuments(resolvedOrganisationId),
    getCommercialAllDocumentRequests(resolvedOrganisationId),
    getCommercialAllHeadsOfTerms(resolvedOrganisationId),
  ])

  return buildCommercialDashboardData({ landlords, tenants, properties, requirements, deals, leases, documents, documentRequests, headsOfTerms, organisationId: resolvedOrganisationId })
}

function isActiveStatus(row) {
  return normalizeLower(row?.status || 'active') === 'active'
}

function isOpenStage(stage) {
  return !['closed_won', 'closed_lost', 'signed'].includes(normalizeLower(stage))
}

function isLeaseExpiringSoon(lease) {
  const endDate = lease?.lease_end_date ? new Date(lease.lease_end_date) : null
  if (!endDate || Number.isNaN(endDate.getTime())) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const horizon = new Date(today)
  horizon.setDate(horizon.getDate() + 180)
  return endDate >= today && endDate <= horizon
}

export function buildCommercialDashboardData({
  landlords = [],
  tenants = [],
  properties = [],
  requirements = [],
  deals = [],
  leases = [],
  documents = [],
  documentRequests = [],
  headsOfTerms = [],
  organisationId = '',
} = {}) {
  const activeRequirements = requirements.filter((row) => isActiveStatus(row) && isOpenStage(row.stage)).length
  const availableSpace = properties.reduce((total, row) => total + toNumber(row.available_space_m2), 0)
  const glaTracked = properties.reduce((total, row) => total + toNumber(row.gla_m2), 0)
  const dealsInNegotiation = deals.filter((row) =>
    isActiveStatus(row) && ['proposal', 'heads_of_terms', 'lease_draft'].includes(normalizeLower(row.stage)),
  ).length
  const leaseExpiries = leases.filter(isLeaseExpiringSoon).length
  const occupiedSpace = Math.max(glaTracked - availableSpace, 0)
  const occupancyPipeline = glaTracked > 0 ? Math.round((occupiedSpace / glaTracked) * 100) : 0
  const requirementStageCounts = requirements.reduce((counts, row) => {
    const stage = normalizeText(row.stage || 'new_requirement')
    counts[stage] = (counts[stage] || 0) + 1
    return counts
  }, {})
  const dealStageCounts = deals.reduce((counts, row) => {
    const stage = normalizeText(row.stage || 'requirement')
    counts[stage] = (counts[stage] || 0) + 1
    return counts
  }, {})
  const now = new Date()
  const closeSoonHorizon = new Date(now)
  closeSoonHorizon.setDate(closeSoonHorizon.getDate() + 45)
  const dealsClosingSoon = deals.filter((row) => {
    const date = row.expected_close_date ? new Date(row.expected_close_date) : null
    return date && !Number.isNaN(date.getTime()) && date >= now && date <= closeSoonHorizon
  })
  const requirementsNeedingFollowUp = requirements.filter((row) => isActiveStatus(row) && ['new_requirement', 'new', 'shortlisting', 'matching', 'viewing', 'viewing_scheduled'].includes(normalizeLower(row.stage)))
  const negotiationItems = [
    ...requirements.filter((row) => isActiveStatus(row) && normalizeLower(row.stage) === 'negotiation'),
    ...deals.filter((row) => isActiveStatus(row) && ['proposal', 'heads_of_terms', 'lease_draft'].includes(normalizeLower(row.stage))),
  ]
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const outstandingDocumentRequests = documentRequests.filter((row) => ['requested', 'under_review'].includes(normalizeLower(row.status))).length
  const overdueDocumentRequests = documentRequests.filter((row) => {
    const dueDate = row.due_date ? new Date(row.due_date) : null
    return dueDate && !Number.isNaN(dueDate.getTime()) && dueDate < today && !['completed', 'approved', 'archived'].includes(normalizeLower(row.status))
  }).length
  const recentlyUploadedDocuments = documents
    .filter((row) => !row.archived_at && normalizeLower(row.status) !== 'archived')
    .sort((a, b) => new Date(b.uploaded_at || b.created_at || 0) - new Date(a.uploaded_at || a.created_at || 0))
    .slice(0, 3)
  const hotStatusCounts = headsOfTerms.reduce((counts, row) => {
    const status = normalizeText(row.status || 'draft')
    counts[status] = (counts[status] || 0) + 1
    return counts
  }, {})

  return {
    organisationId,
    landlords,
    tenants,
    properties,
    requirements,
    deals,
    leases,
    documents,
    documentRequests,
    headsOfTerms,
    summary: {
      activeRequirements,
      availableSpace,
      dealsInNegotiation,
      leaseExpiries,
      occupancyPipeline,
      glaTracked,
      requirementStageCounts,
      dealStageCounts,
      priority: {
        requirementsNeedingFollowUp: requirementsNeedingFollowUp.slice(0, 4),
        dealsClosingSoon: dealsClosingSoon.slice(0, 4),
        negotiationItems: negotiationItems.slice(0, 4),
      },
      documents: {
        outstandingDocumentRequests,
        overdueDocumentRequests,
        recentlyUploadedDocuments,
      },
      headsOfTerms: {
        drafts: hotStatusCounts.draft || 0,
        sentForReview: hotStatusCounts.sent_for_review || 0,
        readyForLease: hotStatusCounts.ready_for_lease || 0,
        statusCounts: hotStatusCounts,
      },
    },
  }
}
