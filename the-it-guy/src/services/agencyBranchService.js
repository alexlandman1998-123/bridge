import { fetchOrganisationSettings } from '../lib/settingsApi'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'

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
    throw new Error('A valid organisation is required to load agency branches.')
  }

  return {
    organisationId,
    organisation,
    membershipRole: normalizeLower(context?.membershipRole || 'viewer'),
    membershipStatus: normalizeLower(context?.membershipStatus || 'pending'),
  }
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
    .select('id, organisation_id, user_id, branch_id, first_name, last_name, email, role, status, last_active_at, updated_at, accepted_at, created_at')
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
  const query = await client
    .from('transactions')
    .select('id, organisation_id, assigned_branch_id, assigned_user_id, assigned_agent, assigned_agent_email, stage, lifecycle_state, sales_price, purchase_price, registered_at, created_at, updated_at')
    .eq('organisation_id', organisationId)

  if (query.error) {
    if (isMissingTableError(query.error)) return []
    if (isSchemaMismatchError(query.error)) {
      const fallbackQuery = await client
        .from('transactions')
        .select('id, organisation_id, assigned_user_id, assigned_agent, assigned_agent_email, stage, lifecycle_state, sales_price, purchase_price, registered_at, created_at, updated_at')
        .eq('organisation_id', organisationId)
      if (fallbackQuery.error) {
        if (isMissingTableError(fallbackQuery.error)) return []
        throw fallbackQuery.error
      }
      return (fallbackQuery.data || []).map((row) => ({ ...row, assigned_branch_id: null }))
    }
    throw query.error
  }

  return query.data || []
}

async function listOrganisationPrivateListings(client, organisationId) {
  const query = await client
    .from('private_listings')
    .select('id, organisation_id, branch_id, assigned_agent_email, assigned_agent_name, listing_title, asking_price, listing_status, stage, created_at, updated_at')
    .eq('organisation_id', organisationId)
    .neq('listing_status', 'withdrawn')

  if (query.error) {
    if (isMissingTableError(query.error) || isSchemaMismatchError(query.error)) return []
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
  const branchTransactions = transactions.filter((row) => normalizeText(row?.assigned_branch_id) === normalizeText(branch?.id))
  const branchListings = listings.filter((row) => normalizeText(row?.branch_id) === normalizeText(branch?.id))
  const branchLeads = leads.filter((row) => normalizeText(row?.branch_id) === normalizeText(branch?.id))

  const activeTransactions = branchTransactions.filter((row) => {
    const lifecycle = normalizeLower(row?.lifecycle_state)
    return lifecycle !== 'completed' && lifecycle !== 'archived' && lifecycle !== 'cancelled'
  })
  const registeredTransactions = branchTransactions.filter((row) => Boolean(row?.registered_at)).length

  const pipelineValue = activeTransactions.reduce((sum, row) => {
    const value = toNumber(row?.sales_price || row?.purchase_price)
    return sum + value
  }, 0)

  const activeListings = branchListings.filter((row) => {
    const status = normalizeLower(row?.listing_status || row?.stage)
    return !status.includes('archived') && !status.includes('sold')
  }).length

  const closedDeals = branchTransactions.length ? registeredTransactions : 0
  const conversionRate = branchLeads.length ? Math.round((closedDeals / branchLeads.length) * 100) : 0

  const principalMember = activeMembers.find((member) => ['principal', 'super_admin', 'admin', 'branch_manager'].includes(normalizeLower(member?.role)))

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
      activeAgents: activeMembers.filter((member) => normalizeLower(member?.role) === 'agent').length,
      activeListings,
      activeTransactions: activeTransactions.length,
      pipelineValue,
      registeredDeals: registeredTransactions,
      conversionRate,
    },
  }
}

export async function getBranches() {
  if (!isSupabaseConfigured || !supabase) {
    return []
  }

  const { organisationId } = await resolveOrganisationContext()
  const [branches, members, transactions, listings, leads] = await Promise.all([
    listOrganisationBranches(supabase, organisationId),
    listOrganisationUsers(supabase, organisationId),
    listOrganisationTransactions(supabase, organisationId),
    listOrganisationPrivateListings(supabase, organisationId),
    listOrganisationLeads(supabase, organisationId),
  ])

  const membersByBranchId = new Map()
  for (const member of members) {
    const branchId = normalizeText(member?.branch_id)
    if (!branchId) continue
    if (!membersByBranchId.has(branchId)) {
      membersByBranchId.set(branchId, [])
    }
    membersByBranchId.get(branchId).push(member)
  }

  return branches.map((branch) =>
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

  const { organisationId } = await resolveOrganisationContext()
  const name = normalizeText(payload?.name)
  if (!name) {
    throw new Error('Branch name is required.')
  }

  const insertPayload = {
    organisation_id: organisationId,
    name,
    slug: toSlug(payload?.slug || name),
    province: normalizeText(payload?.province) || null,
    city: normalizeText(payload?.city) || null,
    address: normalizeText(payload?.address) || null,
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

  const patch = {}
  if (payload?.name !== undefined) patch.name = normalizeText(payload.name)
  if (payload?.slug !== undefined) patch.slug = toSlug(payload.slug || payload.name || '') || null
  if (payload?.province !== undefined) patch.province = normalizeText(payload.province) || null
  if (payload?.city !== undefined) patch.city = normalizeText(payload.city) || null
  if (payload?.address !== undefined) patch.address = normalizeText(payload.address) || null
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
    .select('id')
    .single()

  if (query.error) {
    if (isMissingTableError(query.error)) {
      throw new Error('Agency branch storage is not installed yet. Run the latest Supabase migration before editing branches.')
    }
    throw query.error
  }

  return getBranch(query.data?.id)
}

export async function archiveBranch(branchId) {
  return updateBranch(branchId, { isActive: false })
}

export async function getBranchKPIs(branchId) {
  const branch = await getBranch(branchId)
  return branch?.kpis || null
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

  const { organisationId } = await resolveOrganisationContext()
  const email = normalizeLower(payload?.email)
  const branchId = normalizeText(payload?.branchId)
  const role = normalizeLower(payload?.role || 'agent') || 'agent'

  if (!email) {
    throw new Error('Invite email is required.')
  }
  if (!branchId) {
    throw new Error('Branch is required for member invite.')
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

  const result = await supabase
    .from('organisation_users')
    .update({ status: 'deactivated', updated_at: new Date().toISOString() })
    .eq('id', safeMemberId)
    .select('id')
    .single()

  if (result.error) {
    throw result.error
  }

  return true
}
