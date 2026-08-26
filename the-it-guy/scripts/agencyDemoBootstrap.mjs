import crypto from 'node:crypto'
import { DEMO_ACCOUNTS } from '../src/services/demo/demoManifest.js'

const DEMO_ACCOUNT = DEMO_ACCOUNTS.find((account) => account.id === 'home-seekers') || DEMO_ACCOUNTS[0] || {}
const DEMO_PROFILE = DEMO_ACCOUNT.profile || {}

export const HOME_SEEKERS_DEMO_ACCOUNT = DEMO_ACCOUNT
export const HOME_SEEKERS_DEMO_EMAIL = String(DEMO_PROFILE.email || 'principal@homeseekers.demo').trim().toLowerCase()
export const HOME_SEEKERS_DEMO_PASSWORD = 'HomeSeekersDemo!2026'
export const HOME_SEEKERS_DEMO_SEED_KEY = String(DEMO_ACCOUNT.seedData?.seedKey || 'home-seekers-demo-seed-v1').trim()
export const HOME_SEEKERS_DEMO_ORGANISATION_ID = stableUuid('home-seekers:organisation')
export const HOME_SEEKERS_DEMO_BRANCH_ID = stableUuid('home-seekers:branch:head-office')
export const HOME_SEEKERS_DEMO_MEMBERSHIP_ID = stableUuid('home-seekers:membership:principal')

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeEmail(value = '') {
  return normalizeText(value).toLowerCase()
}

function stableUuid(seed) {
  const hash = crypto.createHash('sha1').update(`bridge9-home-seekers-demo:${seed}`).digest('hex')
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `4${hash.slice(13, 16)}`,
    `${((parseInt(hash.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0')}${hash.slice(18, 20)}`,
    hash.slice(20, 32),
  ].join('-')
}

function asColumns(definitions, table) {
  const columns = definitions?.[table]
  return columns instanceof Set ? columns : null
}

function pickColumns(definitions, table, row) {
  const columns = asColumns(definitions, table)
  if (!columns) return row
  return Object.fromEntries(Object.entries(row).filter(([key]) => columns.has(key)))
}

async function upsertRow(client, definitions, table, row, onConflict = 'id') {
  const payload = pickColumns(definitions, table, row)
  const result = await client.from(table).upsert(payload, {
    onConflict,
    ignoreDuplicates: false,
  })
  if (result.error) {
    throw new Error(`${table} upsert failed: ${result.error.message}`)
  }
  return result
}

async function findAuthUserIdByEmail(client, email) {
  if (!client?.auth?.admin?.listUsers) return ''
  const normalizedEmail = normalizeEmail(email)
  for (let page = 1; page <= 5; page += 1) {
    const result = await client.auth.admin.listUsers({ page, perPage: 200 })
    if (result.error) throw result.error
    const match = (result.data?.users || []).find((user) => normalizeEmail(user?.email) === normalizedEmail)
    if (match?.id) return match.id
    if ((result.data?.users || []).length < 200) break
  }
  return ''
}

async function ensureAuthUser(client, { email, password, account = HOME_SEEKERS_DEMO_ACCOUNT }) {
  const normalizedEmail = normalizeEmail(email || HOME_SEEKERS_DEMO_EMAIL)
  const profileQuery = await client
    .from('profiles')
    .select('id, email, full_name, first_name, last_name')
    .ilike('email', normalizedEmail)
    .maybeSingle()
  if (profileQuery.error) throw profileQuery.error

  const metadata = {
    source: 'home_seekers_demo_bootstrap',
    seedKey: HOME_SEEKERS_DEMO_SEED_KEY,
    demoAccountId: account.id || 'home-seekers',
    full_name: account.profile?.fullName || 'Home Seekers Principal',
    first_name: account.profile?.firstName || 'Home',
    last_name: account.profile?.lastName || 'Seekers',
    company_name: account.profile?.companyName || 'Home Seekers',
    role: account.profile?.role || 'agent',
  }

  if (profileQuery.data?.id) {
    const userId = profileQuery.data.id
    if (password && client?.auth?.admin?.updateUserById) {
      const updateResult = await client.auth.admin.updateUserById(userId, {
        email_confirm: true,
        password,
        user_metadata: metadata,
      })
      if (updateResult.error) throw updateResult.error
    }
    return { userId, created: false }
  }

  const existingAuthUserId = await findAuthUserIdByEmail(client, normalizedEmail)
  if (existingAuthUserId) {
    if (password && client?.auth?.admin?.updateUserById) {
      const updateResult = await client.auth.admin.updateUserById(existingAuthUserId, {
        email_confirm: true,
        password,
        user_metadata: metadata,
      })
      if (updateResult.error) throw updateResult.error
    }
    return { userId: existingAuthUserId, created: false }
  }

  if (!password) {
    throw new Error(`No profile found for ${normalizedEmail}, and no password was supplied to create one.`)
  }

  const createResult = await client.auth.admin.createUser({
    email: normalizedEmail,
    password,
    email_confirm: true,
    user_metadata: metadata,
  })
  if (createResult.error) throw createResult.error
  const userId = createResult.data?.user?.id || ''
  if (!userId) throw new Error(`Could not create auth user for ${normalizedEmail}.`)
  return { userId, created: true }
}

function buildOrganisationPayload({ account = HOME_SEEKERS_DEMO_ACCOUNT } = {}) {
  const organisationName = normalizeText(account.name || 'Home Seekers') || 'Home Seekers'
  return {
    id: HOME_SEEKERS_DEMO_ORGANISATION_ID,
    name: organisationName,
    display_name: organisationName,
    legal_name: `${organisationName} (Pty) Ltd`,
    type: 'agency',
    workspace_kind: 'agency',
    status: 'active',
    company_email: HOME_SEEKERS_DEMO_EMAIL,
    company_phone: null,
    website: 'https://homeseekers.demo',
    support_email: HOME_SEEKERS_DEMO_EMAIL,
    support_phone: null,
    primary_contact_person: account.profile?.fullName || 'Home Seekers Principal',
    is_demo_data: true,
    settings_json: {
      businessLines: ['sales', 'rentals'],
      business_lines: ['sales', 'rentals'],
      enabledModules: {
        sales: true,
        rentals: true,
      },
      agencyOnboarding: {
        branding: {
          organisationName,
          agencyName: organisationName,
          senderName: organisationName,
        },
      },
    },
    demo_metadata: {
      seedKey: HOME_SEEKERS_DEMO_SEED_KEY,
      accountId: account.id || 'home-seekers',
      source: 'home_seekers_demo_bootstrap',
    },
  }
}

function buildBranchPayload({ account = HOME_SEEKERS_DEMO_ACCOUNT } = {}) {
  return {
    id: HOME_SEEKERS_DEMO_BRANCH_ID,
    organisation_id: HOME_SEEKERS_DEMO_ORGANISATION_ID,
    name: 'Cape Town CBD',
    location: 'Cape Town, Western Cape',
    manager_name: account.profile?.fullName || 'Home Seekers Principal',
    agent_count: 3,
    is_head_office: true,
    is_active: true,
    metadata_json: {
      seedKey: HOME_SEEKERS_DEMO_SEED_KEY,
      accountId: account.id || 'home-seekers',
      source: 'home_seekers_demo_bootstrap',
    },
  }
}

function buildOrganisationSettingsPayload({ account = HOME_SEEKERS_DEMO_ACCOUNT } = {}) {
  const organisationName = normalizeText(account.name || 'Home Seekers') || 'Home Seekers'
  return {
    organisation_id: HOME_SEEKERS_DEMO_ORGANISATION_ID,
    settings_json: {
      businessLines: ['sales', 'rentals'],
      business_lines: ['sales', 'rentals'],
      enabledModules: {
        sales: true,
        rentals: true,
      },
      agencyOnboarding: {
        branding: {
          organisationName,
          agencyName: organisationName,
          senderName: organisationName,
        },
      },
      demoSeed: {
        seedKey: HOME_SEEKERS_DEMO_SEED_KEY,
        accountId: account.id || 'home-seekers',
      },
    },
  }
}

function buildProfilePayload(userId, { account = HOME_SEEKERS_DEMO_ACCOUNT } = {}) {
  return {
    id: userId,
    email: HOME_SEEKERS_DEMO_EMAIL,
    full_name: account.profile?.fullName || 'Home Seekers Principal',
    first_name: account.profile?.firstName || 'Home',
    last_name: account.profile?.lastName || 'Seekers',
    company_name: account.profile?.companyName || 'Home Seekers',
    phone_number: null,
    avatar_url: null,
    role: 'agent',
    system_role: 'agent',
    primary_attorney_firm_id: null,
    attorney_role: null,
    onboarding_completed: true,
    updated_at: new Date().toISOString(),
  }
}

function buildMembershipPayload(userId, { account = HOME_SEEKERS_DEMO_ACCOUNT } = {}) {
  const now = new Date().toISOString()
  return {
    id: HOME_SEEKERS_DEMO_MEMBERSHIP_ID,
    organisation_id: HOME_SEEKERS_DEMO_ORGANISATION_ID,
    user_id: userId,
    branch_id: HOME_SEEKERS_DEMO_BRANCH_ID,
    first_name: account.profile?.firstName || 'Home',
    last_name: account.profile?.lastName || 'Seekers',
    email: HOME_SEEKERS_DEMO_EMAIL,
    role: 'principal',
    status: 'active',
    permissions_json: {
      businessLines: ['sales', 'rentals'],
      workspace: 'agency',
    },
    invited_at: now,
    joined_at: now,
    accepted_at: now,
    last_active_at: now,
    workspace_role: 'principal',
    organisation_role: 'principal',
    app_role: 'agent',
    workspace_type: 'agency',
    membership_status: 'active',
    branch_scope: 'all',
    scope_level: 'organisation',
    active_workspace_selected_at: now,
    is_demo_data: true,
    demo_metadata: {
      seedKey: HOME_SEEKERS_DEMO_SEED_KEY,
      accountId: account.id || 'home-seekers',
      source: 'home_seekers_demo_bootstrap',
    },
    updated_at: now,
  }
}

export async function ensureHomeSeekersAgencyDemoWorkspace(client, {
  definitions = null,
  email = HOME_SEEKERS_DEMO_EMAIL,
  password = HOME_SEEKERS_DEMO_PASSWORD,
  account = HOME_SEEKERS_DEMO_ACCOUNT,
  createAuthUser = true,
} = {}) {
  const normalizedEmail = normalizeEmail(email)
  if (normalizedEmail !== HOME_SEEKERS_DEMO_EMAIL) {
    throw new Error(`Unexpected agency demo email ${normalizedEmail || '<empty>'}.`)
  }

  let userId = ''
  if (createAuthUser) {
    const authResult = await ensureAuthUser(client, { email: normalizedEmail, password, account })
    userId = authResult.userId
  } else {
    const profileQuery = await client
      .from('profiles')
      .select('id')
      .ilike('email', normalizedEmail)
      .maybeSingle()
    if (profileQuery.error) throw profileQuery.error
    userId = profileQuery.data?.id || ''
  }

  if (!userId) {
    throw new Error(`Could not resolve a demo profile id for ${normalizedEmail}.`)
  }

  await upsertRow(client, definitions, 'profiles', buildProfilePayload(userId, { account }), 'id')
  await upsertRow(client, definitions, 'organisations', buildOrganisationPayload({ account }), 'id')
  await upsertRow(client, definitions, 'organisation_settings', buildOrganisationSettingsPayload({ account }), 'organisation_id')
  await upsertRow(client, definitions, 'organisation_branches', buildBranchPayload({ account }), 'id')
  await upsertRow(client, definitions, 'organisation_users', buildMembershipPayload(userId, { account }), 'id')

  const [membershipResult, usersResult, listingsResult] = await Promise.all([
    client
      .from('organisation_users')
      .select('*')
      .eq('organisation_id', HOME_SEEKERS_DEMO_ORGANISATION_ID)
      .eq('status', 'active')
      .order('created_at', { ascending: true }),
    client
      .from('organisation_users')
      .select('id, user_id, email, first_name, last_name, role, workspace_role, branch_id')
      .eq('organisation_id', HOME_SEEKERS_DEMO_ORGANISATION_ID)
      .eq('status', 'active')
      .order('created_at', { ascending: true }),
    client
      .from('private_listings')
      .select('id, title, address_line_1, suburb, city, province, postal_code, asking_price, property_type, assigned_agent_id')
      .eq('organisation_id', HOME_SEEKERS_DEMO_ORGANISATION_ID)
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  if (membershipResult.error) throw membershipResult.error
  if (usersResult.error) throw usersResult.error
  if (listingsResult.error) throw listingsResult.error

  const membership = (membershipResult.data || [])[0] || null

  return {
    account,
    email: normalizedEmail,
    userId,
    profile: {
      id: userId,
      email: normalizedEmail,
      full_name: account.profile?.fullName || 'Home Seekers Principal',
      first_name: account.profile?.firstName || 'Home',
      last_name: account.profile?.lastName || 'Seekers',
      company_name: account.profile?.companyName || 'Home Seekers',
    },
    organisation: {
      id: HOME_SEEKERS_DEMO_ORGANISATION_ID,
      name: normalizeText(account.name || 'Home Seekers') || 'Home Seekers',
    },
    organisationId: HOME_SEEKERS_DEMO_ORGANISATION_ID,
    branchId: HOME_SEEKERS_DEMO_BRANCH_ID,
    membership,
    users: usersResult.data || [],
    listings: listingsResult.data || [],
  }
}
