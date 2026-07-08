import { fetchOrganisationSettings } from '../lib/settingsApi'
import { buildRoleHeadcount } from '../lib/reportingRoleLogic'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { assertPermission } from '../auth/permissions/permissionResolver'
import { PERMISSIONS } from '../auth/permissions/permissionRegistry'
import { BRANCH_SCOPES, getWorkspaceUnitLabels, normalizeBranchScope } from '../constants/workspaceUnits'
import { WORKSPACE_TYPES } from '../constants/workspaceTypes'
import { recordSecurityAuditEvent } from './auditLogService'
import { assertMembershipStatusTransition } from './transitions/stateTransitionEngine'
import { assertResolvedWorkspaceContext } from './workspaceResolutionService'
import { resolveWorkspaceRole } from './roleResolutionService'
import { ENTITLEMENT_KEYS } from '../constants/workspaceEntitlements'
import { assertWorkspaceEntitlementLimit } from './workspaceEntitlementsService'

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function toNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const TERMINAL_TRANSACTION_STATUSES = new Set(['registered', 'cancelled', 'canceled', 'archived', 'completed'])
const INACTIVE_LISTING_STATUSES = new Set(['withdrawn', 'sold', 'archived', 'cancelled', 'canceled', 'completed', 'inactive'])

function clampPercent(value) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function getRecordDate(row = {}) {
  const date = new Date(row?.created_at || row?.createdAt || row?.updated_at || row?.updatedAt || '')
  return Number.isNaN(date.getTime()) ? null : date
}

function getLatestRecordDate(row = {}) {
  const date = new Date(row?.updated_at || row?.updatedAt || row?.created_at || row?.createdAt || '')
  return Number.isNaN(date.getTime()) ? null : date
}

function getTransactionBranchId(row = {}) {
  return normalizeText(row?.assigned_branch_id || row?.branch_id || row?.branchId || row?.assignedBranchId)
}

function getTransactionStatus(row = {}) {
  return normalizeLower(row?.lifecycle_state || row?.stage || row?.status)
}

function isActiveTransaction(row = {}) {
  if (row?.registered_at || row?.registeredAt) return false
  const status = getTransactionStatus(row)
  return !TERMINAL_TRANSACTION_STATUSES.has(status)
}

function isActiveListing(row = {}) {
  const status = normalizeLower(row?.listing_status || row?.stage || row?.status)
  return !INACTIVE_LISTING_STATUSES.has(status)
}

function getListingValue(row = {}) {
  return toNumber(row?.estimated_value || row?.estimatedValue || row?.asking_price || row?.askingPrice || row?.price)
}

function getTransactionValue(row = {}) {
  return toNumber(row?.sales_price || row?.purchase_price || row?.sale_price || row?.asking_price || row?.estimated_value)
}

function getStoredCommissionValue(row = {}) {
  const direct = toNumber(
    row?.gross_commission_amount ||
      row?.commission_amount ||
      row?.commission_value ||
      row?.projected_commission_amount ||
      row?.estimated_commission_amount,
  )
  if (direct > 0) return direct

  const splitAmount = toNumber(row?.agent_commission_amount) + toNumber(row?.agency_commission_amount)
  return splitAmount > 0 ? splitAmount : 0
}

function getCommissionPercent(row = {}) {
  return toNumber(
    row?.gross_commission_percentage ||
      row?.commission_percentage ||
      row?.commission_percent ||
      row?.mandate_commission_percent ||
      row?.commission_rate,
  )
}

function getProjectedCommission(row = {}, value = 0) {
  const storedValue = getStoredCommissionValue(row)
  if (storedValue > 0) {
    return { value: storedValue, hasData: true }
  }

  const percent = getCommissionPercent(row)
  if (percent > 0 && value > 0) {
    return { value: value * (percent / 100), hasData: true }
  }

  return { value: 0, hasData: false }
}

function isSchemaMismatchError(error) {
  const code = normalizeText(error?.code).toUpperCase()
  const message = normalizeLower(error?.message)
  return code === 'PGRST204' || message.includes('schema cache') || message.includes('column')
}

function isMissingTableError(error) {
  const code = normalizeText(error?.code).toUpperCase()
  const message = normalizeLower(error?.message)
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    message.includes('does not exist') ||
    (message.includes('schema cache') && message.includes('organisation_branches'))
  )
}

async function resolveOrganisationContext() {
  const context = await fetchOrganisationSettings()
  const organisation = context?.organisation || {}
  const organisationId = normalizeText(organisation?.id)

  if (!organisationId) {
    throw new Error('A valid organisation is required to load workspace branches.')
  }
  assertResolvedWorkspaceContext({
    organisationId,
    profile: context?.profile || null,
    appRole: context?.profile?.role || 'agent',
    currentMembership: {
      id: context?.membershipId || organisationId,
      workspaceId: organisationId,
      status: context?.membershipStatus || 'active',
      role: context?.membershipRole || 'viewer',
    },
  }, { service: 'agencyBranchService.resolveOrganisationContext' })

  return {
    organisationId,
    organisation,
    profile: context?.profile || null,
    membershipRole: normalizeLower(context?.membershipRole || 'viewer'),
    membershipStatus: normalizeLower(context?.membershipStatus || 'pending'),
    membershipId: normalizeText(context?.membershipId),
    membershipBranchId: normalizeText(context?.membershipBranchId || context?.membershipPrimaryBranchId),
    membershipPrimaryBranchId: normalizeText(context?.membershipPrimaryBranchId || context?.membershipBranchId),
    membershipBranchScope: normalizeBranchScope(context?.membershipBranchScope, ''),
    workspaceType: normalizeLower(organisation?.type || WORKSPACE_TYPES.agency) || WORKSPACE_TYPES.agency,
    workspaceKind: normalizeLower(organisation?.workspaceKind || organisation?.workspace_kind || organisation?.type || WORKSPACE_TYPES.agency),
  }
}

function buildBranchPermissionContext(context = {}) {
  return {
    profile: context?.profile,
    appRole: context?.profile?.role || 'agent',
    organisationRole: context?.membershipRole,
    branchScope: context?.membershipBranchScope,
    branchId: context?.membershipBranchId,
    primaryBranchId: context?.membershipPrimaryBranchId,
    membershipStatus: context?.membershipStatus,
    currentMembership: {
      id: context?.membershipId || context?.organisationId || 'agency-membership',
      role: context?.membershipRole,
      status: context?.membershipStatus || 'active',
      workspaceType: context?.workspaceType || WORKSPACE_TYPES.agency,
      workspaceId: context?.organisationId,
      branch_id: context?.membershipBranchId || null,
      primary_branch_id: context?.membershipPrimaryBranchId || context?.membershipBranchId || null,
      branch_scope: context?.membershipBranchScope || null,
      workspace: { id: context?.organisationId, type: context?.workspaceType || WORKSPACE_TYPES.agency },
    },
    currentWorkspace: { id: context?.organisationId, type: context?.workspaceType || WORKSPACE_TYPES.agency },
    workspaceType: context?.workspaceType || WORKSPACE_TYPES.agency,
  }
}

function canResolvePermission(permission, context) {
  try {
    assertPermission(permission, buildBranchPermissionContext(context), 'permission_check')
    return true
  } catch {
    return false
  }
}

function assertBranchManagementAccess(context, action = 'manage branches') {
  const labels = getWorkspaceUnitLabels(context?.workspaceType || WORKSPACE_TYPES.agency)
  assertPermission(
    PERMISSIONS.manageBranches,
    buildBranchPermissionContext(context),
    `You do not have permission to ${action || `manage ${labels.plural.toLowerCase()}`}.`,
  )
}

function assertBranchOperationalAccess(context, action = 'operate this branch') {
  if (
    canResolvePermission(PERMISSIONS.manageBranches, context) ||
    canResolvePermission(PERMISSIONS.manageUsers, context) ||
    canResolvePermission(PERMISSIONS.assignLeads, context)
  ) {
    return true
  }

  throw new Error(`You do not have permission to ${action}.`)
}

function hasAllBranchAccess(context = {}) {
  return ['owner', 'principal', 'super_admin', 'admin'].includes(normalizeLower(context?.membershipRole)) ||
    normalizeBranchScope(context?.membershipBranchScope, '') === BRANCH_SCOPES.allBranches
}

function filterBranchesForContext(branches = [], context = {}) {
  if (hasAllBranchAccess(context)) return branches
  const assignedBranchId = normalizeText(context?.membershipBranchId || context?.membershipPrimaryBranchId)
  if (!assignedBranchId) return []
  return branches.filter((branch) => normalizeText(branch?.id) === assignedBranchId)
}

async function listOrganisationBranches(client, organisationId) {
  const fullSelect = [
    'id',
    'organisation_id',
    'name',
    'slug',
    'province',
    'city',
    'address',
    'formatted_address',
    'suburb',
    'country',
    'postal_code',
    'latitude',
    'longitude',
    'google_place_id',
    'location',
    'manager_name',
    'principal_user_id',
    'phone',
    'email',
    'logo_url',
    'cover_image_url',
    'is_head_office',
    'is_active',
    'agent_count',
    'metadata_json',
    'created_at',
    'updated_at',
  ].join(',')

  const fullQuery = await client
    .from('organisation_branches')
    .select(fullSelect)
    .eq('organisation_id', organisationId)
    .order('name', { ascending: true })

  if (!fullQuery.error) {
    return fullQuery.data || []
  }

  if (isMissingTableError(fullQuery.error)) {
    return []
  }

  if (!isSchemaMismatchError(fullQuery.error)) {
    throw fullQuery.error
  }

  const fallbackQuery = await client
    .from('organisation_branches')
    .select('id, organisation_id, name, location, manager_name, is_head_office, is_active, agent_count, metadata_json, created_at, updated_at')
    .eq('organisation_id', organisationId)
    .order('name', { ascending: true })

  if (fallbackQuery.error) {
    if (isMissingTableError(fallbackQuery.error)) return []
    throw fallbackQuery.error
  }

  return fallbackQuery.data || []
}

async function listOrganisationUsers(client, organisationId) {
  const query = await client
    .from('organisation_users')
    .select('id, organisation_id, user_id, branch_id, primary_branch_id, branch_scope, first_name, last_name, email, role, workspace_role, organisation_role, status, last_active_at, updated_at, accepted_at, created_at')
    .eq('organisation_id', organisationId)

  if (query.error) {
    if (isMissingTableError(query.error)) return []
    if (isSchemaMismatchError(query.error)) {
      const fallbackQuery = await client
        .from('organisation_users')
        .select('id, organisation_id, user_id, first_name, last_name, email, role, status, last_active_at, updated_at, accepted_at, created_at')
        .eq('organisation_id', organisationId)
      if (fallbackQuery.error) {
        if (isMissingTableError(fallbackQuery.error)) return []
        throw fallbackQuery.error
      }
      return (fallbackQuery.data || []).map((row) => ({ ...row, branch_id: null }))
    }
    throw query.error
  }

  return query.data || []
}

async function listOrganisationTransactions(client, organisationId) {
  const selectAttempts = [
    'id, organisation_id, branch_id, assigned_branch_id, assigned_user_id, assigned_agent, assigned_agent_email, stage, status, lifecycle_state, sales_price, purchase_price, gross_commission_percentage, gross_commission_amount, agent_commission_amount, agency_commission_amount, registered_at, created_at, updated_at',
    'id, organisation_id, branch_id, assigned_branch_id, assigned_user_id, assigned_agent, assigned_agent_email, stage, status, lifecycle_state, sales_price, purchase_price, registered_at, created_at, updated_at',
    'id, organisation_id, assigned_branch_id, assigned_user_id, assigned_agent, assigned_agent_email, stage, lifecycle_state, sales_price, purchase_price, registered_at, created_at, updated_at',
    'id, organisation_id, assigned_user_id, assigned_agent, assigned_agent_email, stage, lifecycle_state, sales_price, purchase_price, registered_at, created_at, updated_at',
  ]

  for (const selectColumns of selectAttempts) {
    const query = await client
      .from('transactions')
      .select(selectColumns)
      .eq('organisation_id', organisationId)

    if (!query.error) {
      return (query.data || []).map((row) => ({
        ...row,
        assigned_branch_id: row?.assigned_branch_id || row?.branch_id || null,
      }))
    }

    if (isMissingTableError(query.error)) return []
    if (!isSchemaMismatchError(query.error)) throw query.error
  }

  return []
}

async function listOrganisationPrivateListings(client, organisationId) {
  const query = await client
    .from('private_listings')
    .select('id, organisation_id, branch_id, assigned_agent_id, assigned_agent_email, assigned_agent_name, listing_title, title, asking_price, estimated_value, listing_status, stage, created_at, updated_at')
    .eq('organisation_id', organisationId)
    .neq('listing_status', 'withdrawn')

  if (query.error) {
    if (isMissingTableError(query.error)) return []
    if (isSchemaMismatchError(query.error)) {
      const fallbackQuery = await client
        .from('private_listings')
        .select('id, organisation_id, branch_id, assigned_agent_email, assigned_agent_name, listing_title, asking_price, listing_status, stage, created_at, updated_at')
        .eq('organisation_id', organisationId)
        .neq('listing_status', 'withdrawn')
      if (fallbackQuery.error) {
        if (isMissingTableError(fallbackQuery.error) || isSchemaMismatchError(fallbackQuery.error)) return []
        throw fallbackQuery.error
      }
      return (fallbackQuery.data || []).filter((row) => normalizeLower(row?.listing_status || row?.stage) !== 'withdrawn')
    }
    throw query.error
  }

  return (query.data || []).filter((row) => normalizeLower(row?.listing_status || row?.stage) !== 'withdrawn')
}

async function listOrganisationLeads(client, organisationId) {
  const query = await client
    .from('leads')
    .select('lead_id, organisation_id, branch_id, assigned_agent_id, status, stage, lead_category, budget, estimated_value, created_at, updated_at')
    .eq('organisation_id', organisationId)

  if (query.error) {
    if (isMissingTableError(query.error) || isSchemaMismatchError(query.error)) return []
    throw query.error
  }

  return query.data || []
}

function buildBranchViewModel(branch = {}, related = {}) {
  const members = Array.isArray(related.members) ? related.members : []
  const transactions = Array.isArray(related.transactions) ? related.transactions : []
  const listings = Array.isArray(related.listings) ? related.listings : []
  const leads = Array.isArray(related.leads) ? related.leads : []

  const activeMembers = members.filter((member) => normalizeLower(member?.status) === 'active')
  const headcount = buildRoleHeadcount(members)
  const branchTransactions = transactions.filter((row) => getTransactionBranchId(row) === normalizeText(branch?.id))
  const branchListings = listings.filter((row) => normalizeText(row?.branch_id) === normalizeText(branch?.id))
  const branchLeads = leads.filter((row) => normalizeText(row?.branch_id) === normalizeText(branch?.id))

  const activeTransactions = branchTransactions.filter(isActiveTransaction)
  const registeredTransactions = branchTransactions.filter((row) => Boolean(row?.registered_at)).length

  const activeListingRows = branchListings.filter(isActiveListing)
  const activeListingPipeline = activeListingRows.reduce((sum, row) => sum + getListingValue(row), 0)
  const activeTransactionPipeline = activeTransactions.reduce((sum, row) => sum + getTransactionValue(row), 0)
  const pipelineValue = activeListingPipeline + activeTransactionPipeline

  const projectedCommission = [...activeListingRows, ...activeTransactions].reduce((summary, row) => {
    const sourceValue = branchTransactions.includes(row) ? getTransactionValue(row) : getListingValue(row)
    const commission = getProjectedCommission(row, sourceValue)
    summary.value += commission.value
    summary.hasData = summary.hasData || commission.hasData
    return summary
  }, { value: 0, hasData: false })

  const closedDeals = branchTransactions.length ? registeredTransactions : 0
  const conversionRate = branchLeads.length ? Math.round((closedDeals / branchLeads.length) * 100) : 0

  const principalMember = activeMembers.find((member) =>
    ['principal', 'owner', 'admin_staff', 'branch_manager'].includes(resolveWorkspaceRole(member, { workspaceType: WORKSPACE_TYPES.agency })),
  )

  const city = normalizeText(branch?.city)
  const province = normalizeText(branch?.province)
  const locationText = normalizeText(branch?.location) || [city, province].filter(Boolean).join(', ') || 'Location pending'

  const principalName = [normalizeText(principalMember?.first_name), normalizeText(principalMember?.last_name)].filter(Boolean).join(' ') || normalizeText(principalMember?.email) || normalizeText(branch?.manager_name) || 'Principal pending'

  return {
    id: normalizeText(branch?.id),
    organisationId: normalizeText(branch?.organisation_id),
    name: normalizeText(branch?.name) || 'Untitled Branch',
    slug: normalizeText(branch?.slug),
    province,
    city,
    address: normalizeText(branch?.address),
    formattedAddress: normalizeText(branch?.formatted_address),
    suburb: normalizeText(branch?.suburb),
    country: normalizeText(branch?.country) || 'South Africa',
    postalCode: normalizeText(branch?.postal_code),
    latitude: branch?.latitude === null || branch?.latitude === undefined ? null : Number(branch.latitude),
    longitude: branch?.longitude === null || branch?.longitude === undefined ? null : Number(branch.longitude),
    googlePlaceId: normalizeText(branch?.google_place_id),
    location: locationText,
    principalUserId: normalizeText(branch?.principal_user_id),
    principalName,
    phone: normalizeText(branch?.phone),
    email: normalizeText(branch?.email),
    logoUrl: normalizeText(branch?.logo_url),
    coverImageUrl: normalizeText(branch?.cover_image_url),
    isHeadOffice: Boolean(branch?.is_head_office),
    isActive: branch?.is_active !== false,
    createdAt: branch?.created_at || null,
    updatedAt: branch?.updated_at || null,
    members,
    transactions: branchTransactions,
    listings: branchListings,
    leads: branchLeads,
    kpis: {
      activeAgents: headcount.activeAgents,
      activePrincipals: headcount.activePrincipals,
      activeManagers: headcount.activeManagers,
      activeSupportUsers: headcount.activeSupportUsers,
      activeOperationalUsers: headcount.activeOperationalUsers,
      activeProductionUsers: headcount.activeAgents + headcount.activePrincipals + headcount.activeManagers,
      activeMembers: activeMembers.length,
      activeListings: activeListingRows.length,
      activeTransactions: activeTransactions.length,
      pipelineValue,
      listingPipelineValue: activeListingPipeline,
      transactionPipelineValue: activeTransactionPipeline,
      projectedCommission: projectedCommission.value,
      hasProjectedCommissionData: projectedCommission.hasData,
      registeredDeals: registeredTransactions,
      conversionRate,
    },
  }
}

export async function getBranches() {
  if (!isSupabaseConfigured || !supabase) {
    return []
  }

  const context = await resolveOrganisationContext()
  assertBranchOperationalAccess(context, 'view branch operations')
  const { organisationId } = context
  const [branches, members, transactions, listings, leads] = await Promise.all([
    listOrganisationBranches(supabase, organisationId),
    listOrganisationUsers(supabase, organisationId),
    listOrganisationTransactions(supabase, organisationId),
    listOrganisationPrivateListings(supabase, organisationId),
    listOrganisationLeads(supabase, organisationId),
  ])

  const membersByBranchId = new Map()
  for (const member of members) {
    const branchId = normalizeText(member?.branch_id || member?.primary_branch_id)
    if (!branchId) continue
    if (!membersByBranchId.has(branchId)) {
      membersByBranchId.set(branchId, [])
    }
    membersByBranchId.get(branchId).push(member)
  }

  return filterBranchesForContext(branches, context).map((branch) =>
    buildBranchViewModel(branch, {
      members: membersByBranchId.get(normalizeText(branch?.id)) || [],
      transactions,
      listings,
      leads,
    }),
  )
}

export async function getBranch(branchId) {
  const safeBranchId = normalizeText(branchId)
  if (!safeBranchId) {
    throw new Error('Branch id is required.')
  }

  const branches = await getBranches()
  return branches.find((branch) => normalizeText(branch?.id) === safeBranchId) || null
}

function toSlug(value) {
  return normalizeLower(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80)
}

export async function createBranch(payload = {}) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured for branch creation.')
  }

  const context = await resolveOrganisationContext()
  assertBranchManagementAccess(context, 'create branches')
  const { organisationId } = context
  const name = normalizeText(payload?.name)
  if (!name) {
    throw new Error('Branch name is required.')
  }
  await assertWorkspaceEntitlementLimit({
    workspaceId: organisationId,
    workspaceType: context.workspaceType,
    workspaceKind: context.workspaceKind,
    entitlementKey: ENTITLEMENT_KEYS.maxBranches,
  })

  const insertPayload = {
    organisation_id: organisationId,
    name,
    slug: toSlug(payload?.slug || name),
    province: normalizeText(payload?.province) || null,
    city: normalizeText(payload?.city) || null,
    address: normalizeText(payload?.address) || null,
    formatted_address: normalizeText(payload?.formattedAddress) || null,
    suburb: normalizeText(payload?.suburb) || null,
    country: normalizeText(payload?.country) || 'South Africa',
    postal_code: normalizeText(payload?.postalCode) || null,
    latitude: payload?.latitude === null || payload?.latitude === undefined || payload?.latitude === '' ? null : Number(payload.latitude),
    longitude: payload?.longitude === null || payload?.longitude === undefined || payload?.longitude === '' ? null : Number(payload.longitude),
    google_place_id: normalizeText(payload?.googlePlaceId || payload?.placeId) || null,
    location: normalizeText(payload?.location) || [normalizeText(payload?.city), normalizeText(payload?.province)].filter(Boolean).join(', ') || null,
    manager_name: normalizeText(payload?.managerName) || null,
    principal_user_id: normalizeText(payload?.principalUserId) || null,
    phone: normalizeText(payload?.phone) || null,
    email: normalizeText(payload?.email) || null,
    logo_url: normalizeText(payload?.logoUrl) || null,
    cover_image_url: normalizeText(payload?.coverImageUrl) || null,
    is_active: payload?.isActive === false ? false : true,
    metadata_json: payload?.metadata && typeof payload.metadata === 'object' ? payload.metadata : {},
  }

  const query = await supabase.from('organisation_branches').insert(insertPayload).select('id').single()
  if (query.error) {
    if (isMissingTableError(query.error)) {
      throw new Error('Agency branch storage is not installed yet. Run the latest Supabase migration before creating branches.')
    }
    throw query.error
  }

  void recordSecurityAuditEvent({
    userId: context.profile?.id,
    workspaceId: organisationId,
    action: 'branch_created',
    targetType: 'organisation_branch',
    targetId: query.data?.id,
    metadata: { name },
  })
  return getBranch(query.data?.id)
}

export async function updateBranch(branchId, payload = {}) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured for branch updates.')
  }

  const safeBranchId = normalizeText(branchId)
  if (!safeBranchId) {
    throw new Error('Branch id is required.')
  }

  const context = await resolveOrganisationContext()
  assertBranchManagementAccess(context, 'edit branches')
  const patch = {}
  if (payload?.name !== undefined) patch.name = normalizeText(payload.name)
  if (payload?.slug !== undefined) patch.slug = toSlug(payload.slug || payload.name || '') || null
  if (payload?.province !== undefined) patch.province = normalizeText(payload.province) || null
  if (payload?.city !== undefined) patch.city = normalizeText(payload.city) || null
  if (payload?.address !== undefined) patch.address = normalizeText(payload.address) || null
  if (payload?.formattedAddress !== undefined) patch.formatted_address = normalizeText(payload.formattedAddress) || null
  if (payload?.suburb !== undefined) patch.suburb = normalizeText(payload.suburb) || null
  if (payload?.country !== undefined) patch.country = normalizeText(payload.country) || 'South Africa'
  if (payload?.postalCode !== undefined) patch.postal_code = normalizeText(payload.postalCode) || null
  if (payload?.latitude !== undefined) patch.latitude = payload.latitude === null || payload.latitude === '' ? null : Number(payload.latitude)
  if (payload?.longitude !== undefined) patch.longitude = payload.longitude === null || payload.longitude === '' ? null : Number(payload.longitude)
  if (payload?.googlePlaceId !== undefined || payload?.placeId !== undefined) patch.google_place_id = normalizeText(payload.googlePlaceId || payload.placeId) || null
  if (payload?.location !== undefined) patch.location = normalizeText(payload.location) || null
  if (payload?.managerName !== undefined) patch.manager_name = normalizeText(payload.managerName) || null
  if (payload?.principalUserId !== undefined) patch.principal_user_id = normalizeText(payload.principalUserId) || null
  if (payload?.phone !== undefined) patch.phone = normalizeText(payload.phone) || null
  if (payload?.email !== undefined) patch.email = normalizeText(payload.email) || null
  if (payload?.logoUrl !== undefined) patch.logo_url = normalizeText(payload.logoUrl) || null
  if (payload?.coverImageUrl !== undefined) patch.cover_image_url = normalizeText(payload.coverImageUrl) || null
  if (payload?.isActive !== undefined) patch.is_active = Boolean(payload.isActive)
  if (payload?.metadata !== undefined) patch.metadata_json = payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {}
  patch.updated_at = new Date().toISOString()

  const query = await supabase
    .from('organisation_branches')
    .update(patch)
    .eq('id', safeBranchId)
    .eq('organisation_id', context.organisationId)
    .select('id')
    .single()

  if (query.error) {
    if (isMissingTableError(query.error)) {
      throw new Error('Agency branch storage is not installed yet. Run the latest Supabase migration before editing branches.')
    }
    throw query.error
  }

  void recordSecurityAuditEvent({
    userId: context.profile?.id,
    workspaceId: context.organisationId,
    action: 'branch_updated',
    targetType: 'organisation_branch',
    targetId: safeBranchId,
    metadata: { fields: Object.keys(patch) },
  })
  return getBranch(query.data?.id)
}

export async function archiveBranch(branchId) {
  return updateBranch(branchId, { isActive: false })
}

export async function deleteBranch(branchId) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured for branch deletion.')
  }

  const safeBranchId = normalizeText(branchId)
  if (!safeBranchId) {
    throw new Error('Branch id is required.')
  }

  const context = await resolveOrganisationContext()
  assertBranchManagementAccess(context, 'delete branches')

  const existing = await supabase
    .from('organisation_branches')
    .select('id, name')
    .eq('id', safeBranchId)
    .eq('organisation_id', context.organisationId)
    .maybeSingle()

  if (existing.error) {
    if (isMissingTableError(existing.error)) {
      throw new Error('Agency branch storage is not installed yet. Run the latest Supabase migration before deleting branches.')
    }
    throw existing.error
  }
  if (!existing.data?.id) {
    throw new Error('Branch could not be found.')
  }

  const result = await supabase
    .from('organisation_branches')
    .delete()
    .eq('id', safeBranchId)
    .eq('organisation_id', context.organisationId)
    .select('id')
    .maybeSingle()

  if (result.error) {
    if (isMissingTableError(result.error)) {
      throw new Error('Agency branch storage is not installed yet. Run the latest Supabase migration before deleting branches.')
    }
    throw result.error
  }
  if (!result.data?.id) {
    throw new Error('Branch could not be deleted. Please refresh and try again.')
  }

  void recordSecurityAuditEvent({
    userId: context.profile?.id,
    workspaceId: context.organisationId,
    action: 'branch_deleted',
    targetType: 'organisation_branch',
    targetId: safeBranchId,
    metadata: { name: existing.data?.name || '' },
  })
  return true
}

export async function getBranchKPIs(branchId) {
  const branch = await getBranch(branchId)
  return branch?.kpis || null
}

function getLatestBranchActivityDate(branch = {}) {
  const candidates = [
    branch.updatedAt,
    branch.createdAt,
    ...(branch.members || []).flatMap((row) => [row?.last_active_at, row?.updated_at, row?.accepted_at, row?.created_at]),
    ...(branch.transactions || []).flatMap((row) => [row?.updated_at, row?.created_at]),
    ...(branch.listings || []).flatMap((row) => [row?.updated_at, row?.created_at]),
    ...(branch.leads || []).flatMap((row) => [row?.updated_at, row?.created_at]),
  ]
    .map((value) => {
      const date = new Date(value || '')
      return Number.isNaN(date.getTime()) ? null : date
    })
    .filter(Boolean)

  return candidates.length ? candidates.sort((left, right) => right.getTime() - left.getTime())[0] : null
}

function getDaysSince(date) {
  if (!date) return 999
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000))
}

function getBranchProductionUsers(branch = {}) {
  const kpis = branch.kpis || {}
  return toNumber(kpis.activeProductionUsers || (toNumber(kpis.activeAgents) + toNumber(kpis.activePrincipals) + toNumber(kpis.activeManagers)))
}

function getBranchHealthOverview(branch = {}) {
  if (branch?.isActive === false) {
    return { label: 'Inactive', statusKey: 'inactive', tone: 'slate', score: 0, daysSinceActivity: 999 }
  }

  const kpis = branch.kpis || {}
  const activeAgents = getBranchProductionUsers(branch)
  const activeListings = toNumber(kpis.activeListings)
  const activeTransactions = toNumber(kpis.activeTransactions)
  const latestActivity = getLatestBranchActivityDate(branch)
  const daysSinceActivity = getDaysSince(latestActivity)
  const hasRecentActivity = daysSinceActivity <= 30
  const hasListingsOrTransactions = activeListings > 0 || activeTransactions > 0
  const stalePenalty = daysSinceActivity > 30 ? Math.min(24, Math.round((daysSinceActivity - 30) / 4)) : 0
  const score = clampPercent(
    10 +
      Math.min(activeAgents, 3) * 12 +
      (hasRecentActivity ? 20 : daysSinceActivity <= 60 ? 10 : 0) +
      Math.min(activeListings, 5) * 4 +
      Math.min(activeTransactions, 4) * 5 -
      stalePenalty,
  )

  if (!activeAgents || !hasListingsOrTransactions || daysSinceActivity > 30) {
    return { label: 'Needs Attention', statusKey: 'needs_attention', tone: 'red', score, daysSinceActivity }
  }

  if (!activeTransactions || !activeListings || !hasRecentActivity || daysSinceActivity > 14) {
    return { label: 'Watch', statusKey: 'watch', tone: 'gold', score, daysSinceActivity }
  }

  return { label: 'Healthy', statusKey: 'healthy', tone: 'green', score, daysSinceActivity }
}

function startOfDay(date) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

function addDays(date, days) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function endOfPreviousMoment(date) {
  return new Date(date.getTime() - 1)
}

function resolveOverviewPeriod(period = 'this_month', now = new Date()) {
  const today = startOfDay(now)
  const currentMonthStart = startOfMonth(today)

  if (period === 'last_month') {
    const currentStart = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const currentEnd = endOfPreviousMoment(currentMonthStart)
    const previousStart = new Date(today.getFullYear(), today.getMonth() - 2, 1)
    const previousEnd = endOfPreviousMoment(currentStart)
    return { key: period, currentStart, currentEnd, previousStart, previousEnd }
  }

  if (period === '90_days') {
    const currentStart = addDays(today, -89)
    const currentEnd = now
    const previousStart = addDays(currentStart, -90)
    const previousEnd = endOfPreviousMoment(currentStart)
    return { key: period, currentStart, currentEnd, previousStart, previousEnd }
  }

  const previousStart = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const previousEnd = endOfPreviousMoment(currentMonthStart)
  return { key: 'this_month', currentStart: currentMonthStart, currentEnd: now, previousStart, previousEnd }
}

function isWithinWindow(date, start, end) {
  if (!date) return false
  return date.getTime() >= start.getTime() && date.getTime() <= end.getTime()
}

function getChangePercent(currentValue, previousValue) {
  const current = toNumber(currentValue)
  const previous = toNumber(previousValue)
  if (!current && !previous) return null
  if (!previous) return 100
  return Math.round(((current - previous) / previous) * 100)
}

function buildSparkline(records = [], window = {}, valueGetter = () => 1, fallbackValue = 0) {
  const bucketCount = 8
  const buckets = Array.from({ length: bucketCount }, () => 0)
  const start = window.currentStart
  const end = window.currentEnd
  const span = Math.max(1, end.getTime() - start.getTime())

  for (const row of records) {
    const date = getRecordDate(row)
    if (!isWithinWindow(date, start, end)) continue
    const ratio = (date.getTime() - start.getTime()) / span
    const index = Math.max(0, Math.min(bucketCount - 1, Math.floor(ratio * bucketCount)))
    buckets[index] += Math.max(0, toNumber(valueGetter(row)))
  }

  if (buckets.some((value) => value > 0)) return buckets
  return Array.from({ length: bucketCount }, () => Math.max(0, toNumber(fallbackValue)))
}

function buildPeriodMetric(records = [], window = {}, valueGetter = () => 1) {
  const currentValue = records.reduce((sum, row) => {
    const date = getRecordDate(row)
    return isWithinWindow(date, window.currentStart, window.currentEnd) ? sum + Math.max(0, toNumber(valueGetter(row))) : sum
  }, 0)
  const previousValue = records.reduce((sum, row) => {
    const date = getRecordDate(row)
    return isWithinWindow(date, window.previousStart, window.previousEnd) ? sum + Math.max(0, toNumber(valueGetter(row))) : sum
  }, 0)

  return {
    value: currentValue,
    previousValue,
    changePercent: getChangePercent(currentValue, previousValue),
    sparkline: buildSparkline(records, window, valueGetter),
  }
}

function getBranchTrendRecords(branch = {}) {
  return [
    ...(branch.listings || []).filter(isActiveListing).map((row) => ({ ...row, branchTrendValue: getListingValue(row) })),
    ...(branch.transactions || []).filter(isActiveTransaction).map((row) => ({ ...row, branchTrendValue: getTransactionValue(row) })),
  ]
}

function calculateCompanyHealth(branches = []) {
  const activeBranches = branches.filter((branch) => branch?.isActive !== false)
  if (!activeBranches.length) return 0

  const total = activeBranches.length
  const percent = (count) => (count / total) * 100
  const recentBranches = activeBranches.filter((branch) => getDaysSince(getLatestBranchActivityDate(branch)) <= 30).length
  const transactionBranches = activeBranches.filter((branch) => toNumber(branch?.kpis?.activeTransactions) > 0).length
  const listingBranches = activeBranches.filter((branch) => toNumber(branch?.kpis?.activeListings) > 0).length
  const coveredBranches = activeBranches.filter((branch) => getBranchProductionUsers(branch) > 0).length
  const staleBranches = activeBranches.filter((branch) => getDaysSince(getLatestBranchActivityDate(branch)) > 30).length

  const branchActivity = percent(recentBranches)
  const transactionActivity = percent(transactionBranches)
  const listingActivity = percent(listingBranches)
  const agentCoverage = percent(coveredBranches)
  const stalePenalty = percent(staleBranches)

  return clampPercent(
    branchActivity * 0.3 +
      transactionActivity * 0.25 +
      listingActivity * 0.2 +
      agentCoverage * 0.15 +
      10 -
      stalePenalty * 0.1,
  )
}

function buildOverviewBranchRows(branches = [], window = {}) {
  return branches
    .map((branch) => {
      const trendRecords = getBranchTrendRecords(branch)
      const trend = buildPeriodMetric(trendRecords, window, (row) => row.branchTrendValue)
      const health = getBranchHealthOverview(branch)

      return {
        ...branch,
        activeAgents: getBranchProductionUsers(branch),
        activeListings: toNumber(branch?.kpis?.activeListings),
        activeTransactions: toNumber(branch?.kpis?.activeTransactions),
        pipelineValue: toNumber(branch?.kpis?.pipelineValue),
        projectedCommission: toNumber(branch?.kpis?.projectedCommission),
        hasProjectedCommissionData: Boolean(branch?.kpis?.hasProjectedCommissionData),
        health,
        trend: {
          changePercent: trend.changePercent,
          sparkline: trend.sparkline,
        },
      }
    })
    .sort((left, right) =>
      toNumber(right.pipelineValue) - toNumber(left.pipelineValue) ||
      toNumber(right.activeTransactions) - toNumber(left.activeTransactions) ||
      toNumber(right.activeListings) - toNumber(left.activeListings) ||
      normalizeText(left.name).localeCompare(normalizeText(right.name)),
    )
    .map((branch, index) => ({ ...branch, rank: index + 1 }))
}

export function buildAgencyBranchOverview(branches = [], { period = 'this_month' } = {}) {
  const window = resolveOverviewPeriod(period)
  const branchRows = buildOverviewBranchRows(branches, window)
  const activeBranchRows = branchRows.filter((branch) => branch?.isActive !== false)
  const listings = branchRows.flatMap((branch) => (branch.listings || []).filter(isActiveListing).map((row) => ({ ...row, overviewValue: getListingValue(row) })))
  const transactions = branchRows.flatMap((branch) => (branch.transactions || []).filter(isActiveTransaction).map((row) => ({ ...row, overviewValue: getTransactionValue(row) })))
  const pipelineRecords = [...listings, ...transactions]
  const members = branchRows.flatMap((branch) => branch.members || [])
  const companyPipeline = branchRows.reduce((sum, branch) => sum + toNumber(branch.pipelineValue), 0)
  const projectedCommission = branchRows.reduce((sum, branch) => sum + toNumber(branch.projectedCommission), 0)
  const activeAgents = branchRows.reduce((sum, branch) => sum + toNumber(branch.activeAgents), 0)
  const activeTransactions = branchRows.reduce((sum, branch) => sum + toNumber(branch.activeTransactions), 0)
  const hasProjectedCommissionData = branchRows.some((branch) => branch.hasProjectedCommissionData)

  return {
    totals: {
      branches: activeBranchRows.length,
      agents: activeAgents,
      companyPipeline,
      activeTransactions,
      projectedCommission,
      hasProjectedCommissionData,
      companyHealth: calculateCompanyHealth(branchRows),
      companyHealthChangePercent: null,
    },
    periodMetrics: {
      pipeline: buildPeriodMetric(pipelineRecords, window, (row) => row.overviewValue),
      transactions: buildPeriodMetric(transactions, window, () => 1),
      listings: buildPeriodMetric(listings, window, () => 1),
      agents: {
        value: activeAgents,
        previousValue: activeAgents,
        changePercent: null,
        sparkline: buildSparkline(members, window, () => 1, activeAgents),
      },
    },
    branches: branchRows,
    period: window.key,
  }
}

export async function getAgencyBranchOverview(agencyId = '', period = 'this_month') {
  const branches = await getBranches()
  const normalizedAgencyId = normalizeText(agencyId)
  const scopedBranches = normalizedAgencyId
    ? branches.filter((branch) => normalizeText(branch?.organisationId) === normalizedAgencyId)
    : branches

  return buildAgencyBranchOverview(scopedBranches, { period })
}

export async function getBranchTransactions(branchId) {
  const branch = await getBranch(branchId)
  return branch?.transactions || []
}

export async function getBranchListings(branchId) {
  const branch = await getBranch(branchId)
  return branch?.listings || []
}

export async function inviteBranchMember(payload = {}) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured for branch invites.')
  }

  const context = await resolveOrganisationContext()
  assertBranchOperationalAccess(context, 'invite branch members')
  const { organisationId } = context
  const email = normalizeLower(payload?.email)
  const branchId = normalizeText(payload?.branchId)
  const role = normalizeLower(payload?.role || 'agent') || 'agent'

  if (!email) {
    throw new Error('Invite email is required.')
  }
  if (!branchId) {
    throw new Error('Branch is required for member invite.')
  }
  if (!hasAllBranchAccess(context) && branchId !== normalizeText(context?.membershipBranchId || context?.membershipPrimaryBranchId)) {
    throw new Error('You can only invite members to your assigned branch.')
  }
  const existingInvite = await supabase
    .from('organisation_users')
    .select('id, status')
    .eq('organisation_id', organisationId)
    .eq('email', email)
    .maybeSingle()

  if (existingInvite.error && !isMissingTableError(existingInvite.error)) {
    throw existingInvite.error
  }
  if (!existingInvite.data || !['active', 'invited', 'pending'].includes(normalizeLower(existingInvite.data?.status))) {
    await assertWorkspaceEntitlementLimit({
      workspaceId: organisationId,
      workspaceType: context.workspaceType,
      workspaceKind: context.workspaceKind,
      entitlementKey: ENTITLEMENT_KEYS.maxUsers,
    })
  }

  const insertPayload = {
    organisation_id: organisationId,
    branch_id: branchId,
    email,
    role,
    status: 'invited',
    first_name: normalizeText(payload?.firstName) || null,
    last_name: normalizeText(payload?.lastName) || null,
  }

  const result = await supabase
    .from('organisation_users')
    .upsert(insertPayload, { onConflict: 'organisation_id,email' })
    .select('id, organisation_id, branch_id, first_name, last_name, email, role, status, created_at')
    .single()

  if (result.error) {
    throw result.error
  }

  void recordSecurityAuditEvent({
    userId: context.profile?.id,
    workspaceId: organisationId,
    action: 'invite_sent',
    targetType: 'organisation_user',
    targetId: result.data?.id,
    metadata: { email, role, branchId },
  })
  return result.data
}

export async function removeBranchMember(memberId) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured for member removal.')
  }

  const safeMemberId = normalizeText(memberId)
  if (!safeMemberId) {
    throw new Error('Branch member id is required.')
  }

  const context = await resolveOrganisationContext()
  assertBranchManagementAccess(context, 'remove branch members')

  const existing = await supabase
    .from('organisation_users')
    .select('id, status')
    .eq('id', safeMemberId)
    .eq('organisation_id', context.organisationId)
    .maybeSingle()
  if (existing.error) throw existing.error
  assertMembershipStatusTransition(existing.data?.status, 'deactivated')

  const result = await supabase
    .from('organisation_users')
    .update({ status: 'deactivated', updated_at: new Date().toISOString() })
    .eq('id', safeMemberId)
    .eq('organisation_id', context.organisationId)
    .select('id')
    .single()

  if (result.error) {
    throw result.error
  }

  void recordSecurityAuditEvent({
    userId: context.profile?.id,
    workspaceId: context.organisationId,
    action: 'membership_deactivated',
    targetType: 'organisation_user',
    targetId: safeMemberId,
  })
  return true
}
