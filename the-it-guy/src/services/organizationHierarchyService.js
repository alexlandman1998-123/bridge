import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'

export const BRANCH_ROLE_OPTIONS = Object.freeze([
  { value: 'branch_manager', label: 'Branch Manager' },
  { value: 'consultant', label: 'Consultant' },
  { value: 'attorney', label: 'Attorney' },
  { value: 'agent', label: 'Agent' },
  { value: 'admin', label: 'Branch Admin' },
])

function requireClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured for organization hierarchy.')
  }
  return supabase
}

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

function toBoolean(value) {
  return value === true
}

function assertRpcSuccess(result, fallbackMessage) {
  if (result.error) throw result.error
  if (result.data?.success === false) {
    throw new Error(result.data.code || fallbackMessage)
  }
  return result.data || {}
}

export function getBranchRoleLabel(value) {
  const normalized = normalizeLower(value)
  return BRANCH_ROLE_OPTIONS.find((option) => option.value === normalized)?.label || 'Member'
}

export function toRegion(row = {}) {
  return {
    id: row.id || '',
    organizationId: row.organization_id || row.organizationId || row.workspace_id || row.workspaceId || '',
    name: normalizeText(row.name),
    code: normalizeText(row.code),
    status: normalizeLower(row.status) || (row.active === false ? 'inactive' : 'active'),
    managerUserId: row.manager_user_id || row.managerUserId || null,
    branchCount: toNumber(row.branch_count || row.branchCount),
    userCount: toNumber(row.user_count || row.userCount),
    transactionCount: toNumber(row.transaction_count || row.transactionCount),
    createdAt: row.created_at || row.createdAt || null,
    updatedAt: row.updated_at || row.updatedAt || null,
  }
}

export function toBranch(row = {}) {
  return {
    id: row.id || '',
    organizationId: row.organization_id || row.organizationId || row.organisation_id || row.organisationId || '',
    regionId: row.region_id || row.regionId || null,
    regionName: normalizeText(row.region_name || row.regionName),
    name: normalizeText(row.name),
    code: normalizeText(row.code || row.slug),
    email: normalizeText(row.email),
    phone: normalizeText(row.phone),
    status: normalizeLower(row.status) || (row.is_active === false ? 'inactive' : 'active'),
    managerUserId: row.manager_user_id || row.managerUserId || row.principal_user_id || row.principalUserId || null,
    userCount: toNumber(row.user_count || row.userCount),
    transactionCount: toNumber(row.transaction_count || row.transactionCount),
    activeTransactionCount: toNumber(row.active_transaction_count || row.activeTransactionCount),
    isEmptyDefault: toBoolean(row.is_empty_default || row.isEmptyDefault),
    createdAt: row.created_at || row.createdAt || null,
    updatedAt: row.updated_at || row.updatedAt || null,
  }
}

export function toHierarchyMember(row = {}) {
  const branchRole = normalizeLower(row.branch_role || row.branchRole || row.workspace_role || row.workspaceRole)
  return {
    id: row.membership_id || row.membershipId || row.id || '',
    membershipId: row.membership_id || row.membershipId || row.id || '',
    userId: row.user_id || row.userId || '',
    fullName: normalizeText(row.full_name || row.fullName || row.name || row.email) || 'Unnamed member',
    email: normalizeText(row.email),
    workspaceRole: normalizeLower(row.workspace_role || row.workspaceRole || row.role) || 'member',
    scopeLevel: normalizeLower(row.scope_level || row.scopeLevel) || 'assigned',
    regionId: row.region_id || row.regionId || null,
    regionName: normalizeText(row.region_name || row.regionName),
    branchId: row.branch_id || row.branchId || null,
    branchName: normalizeText(row.branch_name || row.branchName),
    branchRole,
    branchRoleLabel: getBranchRoleLabel(branchRole),
    membershipStatus: normalizeLower(row.membership_status || row.membershipStatus) || 'active',
  }
}

export function toBranchMember(row = {}) {
  const role = normalizeLower(row.role) || 'consultant'
  return {
    id: row.id || '',
    branchId: row.branch_id || row.branchId || '',
    membershipId: row.organisation_user_id || row.organisationUserId || row.organization_user_id || row.organizationUserId || null,
    userId: row.user_id || row.userId || '',
    role,
    roleLabel: getBranchRoleLabel(role),
    status: normalizeLower(row.status) || 'active',
    joinedAt: row.joined_at || row.joinedAt || null,
    acceptedAt: row.accepted_at || row.acceptedAt || null,
    createdAt: row.created_at || row.createdAt || null,
    updatedAt: row.updated_at || row.updatedAt || null,
  }
}

export function normalizeHierarchyPayload(data = {}) {
  return {
    scope: data.scope || null,
    regions: (Array.isArray(data.regions) ? data.regions : []).map(toRegion),
    branches: (Array.isArray(data.branches) ? data.branches : []).map(toBranch),
    members: (Array.isArray(data.members) ? data.members : []).map(toHierarchyMember),
    canManageHierarchy: data.canManageHierarchy === true || data.can_manage_hierarchy === true,
    canManageRegion: data.canManageRegion === true || data.can_manage_region === true,
    canManageBranch: data.canManageBranch === true || data.can_manage_branch === true,
  }
}

export async function getOrganizationHierarchy(organizationId) {
  const client = requireClient()
  if (!organizationId) throw new Error('Organization is required.')
  const result = await client.rpc('bridge_phase5_list_hierarchy', {
    p_organization_id: organizationId,
  })
  if (result.error?.code === '42883') {
    return normalizeHierarchyPayload({})
  }
  return normalizeHierarchyPayload(assertRpcSuccess(result, 'Unable to load organization hierarchy.'))
}

export async function createOrganizationRegion({ organizationId, region } = {}) {
  const client = requireClient()
  if (!organizationId) throw new Error('Organization is required.')
  const result = await client.rpc('bridge_phase5_create_region', {
    p_organization_id: organizationId,
    p_region: {
      name: normalizeText(region?.name),
      code: normalizeText(region?.code),
      managerUserId: region?.managerUserId || null,
    },
  })
  const data = assertRpcSuccess(result, 'Unable to create region.')
  return toRegion(data.region || {})
}

export async function updateOrganizationRegion({ organizationId, regionId, region } = {}) {
  const client = requireClient()
  if (!organizationId) throw new Error('Organization is required.')
  if (!regionId) throw new Error('Region is required.')
  const result = await client.rpc('bridge_phase5_update_region', {
    p_organization_id: organizationId,
    p_region_id: regionId,
    p_region: {
      name: region?.name,
      code: region?.code,
      active: region?.active,
      managerUserId: region?.managerUserId || null,
    },
  })
  const data = assertRpcSuccess(result, 'Unable to update region.')
  return toRegion(data.region || {})
}

export async function createOrganizationBranch({ organizationId, branch } = {}) {
  const client = requireClient()
  if (!organizationId) throw new Error('Organization is required.')
  const result = await client.rpc('bridge_phase5_create_branch', {
    p_organization_id: organizationId,
    p_branch: {
      name: normalizeText(branch?.name),
      code: normalizeText(branch?.code),
      regionId: branch?.regionId || null,
      email: normalizeText(branch?.email),
      phone: normalizeText(branch?.phone),
      managerUserId: branch?.managerUserId || null,
    },
  })
  const data = assertRpcSuccess(result, 'Unable to create branch.')
  return toBranch(data.branch || {})
}

export async function updateOrganizationBranch({ organizationId, branchId, branch } = {}) {
  const client = requireClient()
  if (!organizationId) throw new Error('Organization is required.')
  if (!branchId) throw new Error('Branch is required.')
  const result = await client.rpc('bridge_phase5_update_branch', {
    p_organization_id: organizationId,
    p_branch_id: branchId,
    p_branch: {
      name: branch?.name,
      code: branch?.code,
      regionId: branch?.regionId || null,
      email: branch?.email,
      phone: branch?.phone,
      active: branch?.active,
      managerUserId: branch?.managerUserId || null,
    },
  })
  const data = assertRpcSuccess(result, 'Unable to update branch.')
  return toBranch(data.branch || {})
}

export async function assignBranchMember({ organizationId, branchId, userId, role = 'consultant' } = {}) {
  const client = requireClient()
  if (!organizationId) throw new Error('Organization is required.')
  if (!branchId) throw new Error('Branch is required.')
  if (!userId) throw new Error('User is required.')
  const result = await client.rpc('bridge_phase5_assign_branch_member', {
    p_organization_id: organizationId,
    p_branch_id: branchId,
    p_user_id: userId,
    p_branch_role: role,
  })
  const data = assertRpcSuccess(result, 'Unable to assign branch member.')
  return {
    branchMember: toBranchMember(data.branchMember || data.branch_member || {}),
    member: toHierarchyMember(data.membership || {}),
  }
}

export async function assignRegionManager({ organizationId, regionId, userId } = {}) {
  if (!userId) throw new Error('User is required.')
  return updateOrganizationRegion({
    organizationId,
    regionId,
    region: {
      managerUserId: userId,
    },
  })
}

export const __organizationHierarchyServiceTestUtils = {
  getBranchRoleLabel,
  normalizeHierarchyPayload,
  toBranch,
  toBranchMember,
  toHierarchyMember,
  toRegion,
}
