import { fetchOrganisationSettings, listOrganisationUsers } from '../../../lib/settingsApi'
import { isSupabaseConfigured, supabase } from '../../../lib/supabaseClient'
import { normalizeCommercialLifecycleStage } from '../commercialWorkflow'

const TABLES = {
  landlords: 'commercial_landlords',
  tenants: 'commercial_tenants',
  properties: 'commercial_properties',
  requirements: 'commercial_requirements',
  deals: 'commercial_deals',
  leases: 'commercial_leases',
  vacancies: 'commercial_vacancies',
  listings: 'commercial_listings',
  activity: 'commercial_activity',
  documents: 'commercial_documents',
  documentRequests: 'commercial_document_requests',
  headsOfTerms: 'commercial_heads_of_terms',
}

const SELECTS = {
  landlords:
    'id, organisation_id, branch_id, team_id, broker_id, created_at, updated_at, created_by, updated_by, status, notes, name, contact_person, email, phone, website, landlord_type, portfolio_notes, preferred_contact_method',
  tenants:
    'id, organisation_id, branch_id, team_id, broker_id, created_at, updated_at, created_by, updated_by, status, notes, name, contact_person, email, phone, industry, company_size, current_location, current_lease_expiry, preferred_contact_method',
  properties:
    'id, organisation_id, branch_id, team_id, broker_id, created_at, updated_at, created_by, updated_by, status, notes, landlord_id, property_name, property_type, address, suburb, city, province, country, gla_m2, available_space_m2, vacancy_percentage, zoning, parking_ratio, loading_bays, power_supply, height_m, asking_rental_per_m2, asking_sale_price',
  requirements:
    'id, organisation_id, branch_id, team_id, broker_id, created_at, updated_at, created_by, updated_by, status, notes, requirement_type, client_type, tenant_id, requirement_name, property_type, preferred_locations, min_size_m2, max_size_m2, budget_min, budget_max, target_occupation_date, lease_term_months, special_requirements, assigned_broker, stage',
  deals:
    'id, organisation_id, branch_id, team_id, broker_id, created_at, updated_at, created_by, updated_by, status, notes, deal_name, deal_type, requirement_id, tenant_id, landlord_id, property_id, vacancy_id, listing_id, assigned_broker, stage, deal_value, estimated_commission, expected_close_date, probability_percentage',
  leases:
    'id, organisation_id, branch_id, team_id, broker_id, created_at, updated_at, created_by, updated_by, status, notes, deal_id, heads_of_terms_id, tenant_id, landlord_id, property_id, vacancy_id, lease_start_date, lease_end_date, occupation_date, lease_term_months, monthly_rental, rental_per_m2, escalation_percentage, deposit_amount, tenant_installation_allowance, rent_free_period_months, renewal_option, renewal_notice_date',
  vacancies:
    'id, organisation_id, branch_id, team_id, broker_id, created_at, updated_at, created_by, updated_by, status, notes, property_id, landlord_id, vacancy_name, unit_or_floor, available_area_m2, asking_rental, availability_date, broker_assignment, incentives, fit_out_allowance',
  listings:
    'id, organisation_id, branch_id, team_id, broker_id, created_at, updated_at, created_by, updated_by, status, notes, landlord_id, property_id, vacancy_id, listing_type, listing_category, listing_status, title, description, pricing, pricing_notes, featured, available_from, metadata_json, marketing_json, media_json, performance_json',
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
const COMMERCIAL_HIERARCHY_COLUMNS = ['branch_id', 'team_id', 'broker_id']
const COMMERCIAL_DOCUMENT_WORKFLOW_COLUMNS = ['version_number', 'supersedes_document_id', 'expires_at', 'reviewed_by', 'reviewed_at', 'priority', 'requested_by', 'completed_document_id']
const COMMERCIAL_LEASING_WORKFLOW_COLUMNS = ['vacancy_id', 'heads_of_terms_id', 'sent_at', 'accepted_at', 'rejected_at', 'signed_at', 'converted_at']
const COMMERCIAL_SCOPE_CACHE_TTL_MS = 60 * 1000
const COMMERCIAL_HQ_ROLES = new Set(['owner', 'principal', 'director', 'partner', 'admin', 'admin_staff', 'manager', 'hq_manager', 'commercial_hq_admin', 'commercial_hq_manager', 'super_admin'])
const COMMERCIAL_BRANCH_ROLES = new Set(['branch_manager', 'branch_admin', 'regional_manager'])
const COMMERCIAL_TEAM_ROLES = new Set(['team_leader', 'team_manager', 'commercial_team_leader'])
const COMMERCIAL_BROKER_ROLES = new Set(['broker', 'commercial_broker', 'agent', 'senior_agent'])
const COMMERCIAL_MODULE_MARKERS = new Set(['commercial', 'commercial_brokerage', 'commercial_agency'])
let commercialScopeCache = null
let commercialScopeInflight = null

export const COMMERCIAL_TABLES = TABLES

const ENTITY_TYPES = {
  landlords: 'commercial_landlord',
  tenants: 'commercial_tenant',
  properties: 'commercial_property',
  requirements: 'commercial_requirement',
  deals: 'commercial_deal',
  leases: 'commercial_lease',
  vacancies: 'commercial_vacancy',
  listings: 'commercial_listing',
  documents: 'commercial_document',
  documentRequests: 'commercial_document_request',
}

const NAME_FIELDS = {
  landlords: 'name',
  tenants: 'name',
  properties: 'property_name',
  requirements: 'requirement_name',
  deals: 'deal_name',
  leases: 'id',
  vacancies: 'vacancy_name',
  listings: 'title',
  documents: 'document_name',
  documentRequests: 'document_name',
}

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLower(value) {
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

function entityTypeForKind(kind) {
  return ENTITY_TYPES[kind] || `commercial_${kind || 'record'}`
}

function displayNameForRecord(kind, record = {}) {
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
    .select('id, organisation_id, user_id, branch_id, primary_branch_id, team_id, role, workspace_role, organisation_role, module_context, module, module_type, workspace_type, metadata, status, email, first_name, last_name, last_active_at')
    .eq('organisation_id', organisationId)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(10)

  if (!query.error) return (query.data || []).find(isCommercialMembershipRow) || null
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
    return (fallback.data || []).find(isCommercialMembershipRow) || null
  }
  throw query.error
}

export async function resolveCommercialAccessContext({ forceRefresh = false } = {}) {
  if (!forceRefresh && commercialScopeCache && commercialScopeCache.expiresAt > Date.now()) return commercialScopeCache.value
  if (!forceRefresh && commercialScopeInflight) return commercialScopeInflight

  commercialScopeInflight = (async () => {
    const context = await resolveCommercialOrganisationContext()
    const userId = context.userId || await getCurrentUserId()
    const membership = await findCurrentCommercialMembership(context.organisationId, userId).catch(() => null)
    const role = normalizeLower(membership?.workspace_role || membership?.organisation_role || membership?.role || context.membershipRole || 'viewer')
    const isPlatformAdmin = normalizeLower(context.profile?.role) === 'platform_admin' || normalizeLower(context.membershipRole) === 'platform_admin'
    const hasCommercialAccess = isPlatformAdmin || Boolean(membership?.id && isCommercialMembershipRow(membership))
    const scope = {
      ...context,
      userId,
      membership,
      membershipRole: isPlatformAdmin ? 'platform_admin' : role,
      branchId: normalizeText(membership?.primary_branch_id || membership?.branch_id),
      teamId: normalizeText(membership?.team_id),
      scopeLevel: isPlatformAdmin ? 'organisation' : hasCommercialAccess ? resolveScopeLevel(role) : 'none',
      hasCommercialAccess,
      canManageBrokerage: isPlatformAdmin || (hasCommercialAccess && resolveScopeLevel(role) !== 'broker'),
    }
    commercialScopeCache = { value: scope, expiresAt: Date.now() + COMMERCIAL_SCOPE_CACHE_TTL_MS }
    return scope
  })().finally(() => {
    commercialScopeInflight = null
  })

  return commercialScopeInflight
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
      status: 'available',
    }, { logActivity: false })
    vacancyId = vacancy?.id || ''
  }

  return createCommercialRecord('listings', {
    ...stripListingCreationOnlyFields(payload),
    organisation_id: organisationId,
    landlord_id: landlordId || null,
    property_id: propertyId || null,
    vacancy_id: vacancyId || null,
    status: payload.status || (normalizeLower(payload.listing_status) === 'archived' ? 'archived' : 'active'),
    listing_status: payload.listing_status || 'draft',
  })
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

export const getCommercialLandlords = (organisationId) => listCommercialRecords('landlords', organisationId, { order: 'name', ascending: true })
export const getCommercialTenants = (organisationId) => listCommercialRecords('tenants', organisationId, { order: 'name', ascending: true })
export const getCommercialProperties = (organisationId) => listCommercialRecords('properties', organisationId, { order: 'property_name', ascending: true })
export const getCommercialRequirements = (organisationId) => listCommercialRecords('requirements', organisationId)
export const getCommercialDeals = (organisationId) => listCommercialRecords('deals', organisationId)
export const getCommercialLeases = (organisationId) => listCommercialRecords('leases', organisationId)
export const getCommercialVacancies = (organisationId) => listCommercialRecords('vacancies', organisationId, { order: 'availability_date', ascending: true })
export const getCommercialListings = (organisationId) => listCommercialRecords('listings', organisationId, { order: 'updated_at', ascending: false })
export const getCommercialAllDocuments = (organisationId) => listCommercialRecords('documents', organisationId)
export const getCommercialAllDocumentRequests = (organisationId) => listCommercialRecords('documentRequests', organisationId)
export const getCommercialAllHeadsOfTerms = (organisationId) => listCommercialRecords('headsOfTerms', organisationId)

export const createCommercialLandlord = (payload) => createCommercialRecord('landlords', payload)
export const createCommercialTenant = (payload) => createCommercialRecord('tenants', payload)
export const createCommercialProperty = (payload) => createCommercialRecord('properties', payload)
export const createCommercialRequirement = (payload) => createCommercialRecord('requirements', payload)
export const createCommercialDeal = (payload) => createCommercialRecord('deals', payload)
export const createCommercialLease = (payload) => createCommercialRecord('leases', payload)
export const createCommercialVacancy = (payload) => createCommercialRecord('vacancies', payload)

export const updateCommercialLandlord = (id, payload, options) => updateCommercialRecord('landlords', id, payload, options)
export const updateCommercialTenant = (id, payload, options) => updateCommercialRecord('tenants', id, payload, options)
export const updateCommercialProperty = (id, payload, options) => updateCommercialRecord('properties', id, payload, options)
export const updateCommercialRequirement = (id, payload, options) => updateCommercialRecord('requirements', id, payload, options)
export const updateCommercialDeal = (id, payload, options) => updateCommercialRecord('deals', id, payload, options)
export const updateCommercialLease = (id, payload, options) => updateCommercialRecord('leases', id, payload, options)
export const updateCommercialVacancy = (id, payload, options) => updateCommercialRecord('vacancies', id, payload, options)
export const updateCommercialListing = (id, payload, options) => updateCommercialRecord('listings', id, payload, options)

export const archiveCommercialLandlord = (id) => archiveCommercialRecord('landlords', id)
export const archiveCommercialTenant = (id) => archiveCommercialRecord('tenants', id)
export const archiveCommercialProperty = (id) => archiveCommercialRecord('properties', id)
export const archiveCommercialRequirement = (id) => archiveCommercialRecord('requirements', id)
export const archiveCommercialDeal = (id) => archiveCommercialRecord('deals', id)
export const archiveCommercialLease = (id) => archiveCommercialRecord('leases', id)
export const archiveCommercialVacancy = (id) => archiveCommercialRecord('vacancies', id)

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
      signed: 'lease_pending',
      converted: 'lease_pending',
      rejected: 'under_offer',
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

export async function createDealFromRequirement(requirement, payload = {}) {
  const sourceRequirement = requirement || {}
  const deal = await createCommercialRecord('deals', {
    ...payload,
    organisation_id: payload.organisation_id || sourceRequirement.organisation_id,
    requirement_id: payload.requirement_id || sourceRequirement.id,
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
    await updateCommercialRecord('requirements', sourceRequirement.id, { stage: 'converted' }, { logActivity: false }).catch(() => null)
  }
  if (deal?.vacancy_id) {
    await updateCommercialRecord('vacancies', deal.vacancy_id, { status: 'under_offer' }, { logActivity: false }).catch(() => null)
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
  const lease = await createCommercialRecord('leases', {
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
  }, { logActivity: false })

  await Promise.all([
    hot.deal_id ? updateCommercialRecord('deals', hot.deal_id, { stage: 'converted' }, { logActivity: false }).catch(() => null) : null,
    hot.vacancy_id ? updateCommercialRecord('vacancies', hot.vacancy_id, { status: lease.status === 'active' ? 'occupied' : 'lease_pending' }, { logActivity: false }).catch(() => null) : null,
    updateHeadsOfTerms(hot.id, { status: 'converted', converted_at: new Date().toISOString() }, { logActivity: false }).catch(() => null),
  ])

  await logCommercialActivity({
    organisation_id: organisationId,
    entityType: 'commercial_deal',
    entityId: hot.deal_id,
    activityType: 'lease_created_from_hot',
    title: 'Lease created from HOT',
    body: lease?.id ? `Lease ${String(lease.id).slice(0, 8)} was created from signed HOT.` : 'Lease was created from signed HOT.',
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
    return { landlords: [], tenants: [], properties: [], requirements: [], deals: [], leases: [], vacancies: [], listings: [], brokers: [], branches: [], teams: [] }
  }

  const [landlords, tenants, properties, requirements, deals, leases, vacancies, listings, brokers, branches, teams] = await Promise.all([
    getCommercialLandlords(resolvedOrganisationId),
    getCommercialTenants(resolvedOrganisationId),
    getCommercialProperties(resolvedOrganisationId),
    getCommercialRequirements(resolvedOrganisationId),
    getCommercialDeals(resolvedOrganisationId),
    getCommercialLeases(resolvedOrganisationId),
    getCommercialVacancies(resolvedOrganisationId),
    getCommercialListings(resolvedOrganisationId),
    listOrganisationUsers().catch(() => []),
    listCommercialBranches(resolvedOrganisationId),
    listCommercialTeams(resolvedOrganisationId),
  ])

  return { landlords, tenants, properties, requirements, deals, leases, vacancies, listings, brokers, branches, teams }
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
  const requirementsNeedingFollowUp = requirements.filter((row) => isActiveStatus(row) && ['new_requirement', 'shortlisting', 'viewing'].includes(normalizeLower(row.stage)))
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
