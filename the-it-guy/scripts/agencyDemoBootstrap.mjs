import crypto from 'node:crypto'
import { DEMO_ACCOUNTS } from '../src/services/demo/demoManifest.js'

const DEMO_ACCOUNT = DEMO_ACCOUNTS.find((account) => account.id === 'home-seekers') || DEMO_ACCOUNTS[0] || {}
const DEMO_PROFILE = DEMO_ACCOUNT.profile || {}

export const HOME_SEEKERS_DEMO_ACCOUNT = DEMO_ACCOUNT
export const HOME_SEEKERS_DEMO_EMAIL = String(DEMO_PROFILE.email || 'alex.homeseekers.training@arch9.test').trim().toLowerCase()
export const HOME_SEEKERS_DEMO_PASSWORD = 'HomeSeekersDemo!2026'
export const HOME_SEEKERS_DEMO_SEED_KEY = String(DEMO_ACCOUNT.seedData?.seedKey || 'home-seekers-demo-seed-v1').trim()
export const HOME_SEEKERS_DEMO_ORGANISATION_ID = stableUuid('home-seekers:organisation')
export const HOME_SEEKERS_DEMO_BRANCH_ID = stableUuid('home-seekers:branch:head-office')
export const HOME_SEEKERS_DEMO_MEMBERSHIP_ID = stableUuid('home-seekers:membership:principal')
export const HOME_SEEKERS_DEMO_DEVELOPMENT_ID = stableUuid('home-seekers:development:demo')
export const HOME_SEEKERS_DEMO_DEVELOPMENT_NAME = 'Home Seekers Demo Development'

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
    return { userId, created: false, profile: profileQuery.data }
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
  return { userId, created: true, profile: null }
}

async function resolveExistingOrganisationId(client, { account = HOME_SEEKERS_DEMO_ACCOUNT } = {}) {
  const organisationName = normalizeText(account.name || 'Home Seekers') || 'Home Seekers'
  const byName = await client
    .from('organisations')
    .select('id')
    .eq('name', organisationName)
    .maybeSingle()
  if (byName?.data?.id) return byName.data.id
  const byDisplayName = await client
    .from('organisations')
    .select('id')
    .eq('display_name', organisationName)
    .maybeSingle()
  if (byDisplayName?.data?.id) return byDisplayName.data.id
  return HOME_SEEKERS_DEMO_ORGANISATION_ID
}

async function resolveExistingBranchId(client, organisationId) {
  const branchQuery = await client
    .from('organisation_branches')
    .select('id')
    .eq('organisation_id', organisationId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (branchQuery?.data?.id) return branchQuery.data.id
  return HOME_SEEKERS_DEMO_BRANCH_ID
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

function buildProfilePayload(userId, { account = HOME_SEEKERS_DEMO_ACCOUNT, existingProfile = null } = {}) {
  const existing = existingProfile && typeof existingProfile === 'object' ? existingProfile : {}
  return {
    id: userId,
    email: HOME_SEEKERS_DEMO_EMAIL,
    full_name: existing.full_name || account.profile?.fullName || 'Home Seekers Principal',
    first_name: existing.first_name || account.profile?.firstName || 'Home',
    last_name: existing.last_name || account.profile?.lastName || 'Seekers',
    company_name: existing.company_name || account.profile?.companyName || 'Home Seekers',
    phone_number: null,
    avatar_url: null,
    role: existing.role || 'agent',
    system_role: existing.system_role || 'agent',
    primary_attorney_firm_id: null,
    attorney_role: null,
    onboarding_completed: existing.onboarding_completed ?? true,
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
    branch_scope: 'all_branches',
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

function buildListingPayloads(userId, { account = HOME_SEEKERS_DEMO_ACCOUNT } = {}) {
  const now = new Date().toISOString()
  const listings = Array.isArray(account.seedData?.listings) && account.seedData.listings.length
    ? account.seedData.listings
    : [
        {
          id: 'home-seekers-listing-116-ridge-road',
          title: '116 Ridge Road',
          addressLine1: '116 Ridge Road',
          suburb: 'Sea Point',
          city: 'Cape Town',
          province: 'Western Cape',
          postalCode: '8005',
          askingPrice: 3125000,
          propertyType: 'House',
        },
        {
          id: 'home-seekers-listing-117-ridge-road',
          title: '117 Ridge Road',
          addressLine1: '117 Ridge Road',
          suburb: 'Sea Point',
          city: 'Cape Town',
          province: 'Western Cape',
          postalCode: '8005',
          askingPrice: 4850000,
          propertyType: 'House',
        },
        {
          id: 'home-seekers-listing-constantia',
          title: '18 Constantia Road',
          addressLine1: '18 Constantia Road',
          suburb: 'Constantia',
          city: 'Cape Town',
          province: 'Western Cape',
          postalCode: '7806',
          askingPrice: 6250000,
          propertyType: 'House',
        },
        {
          id: 'home-seekers-listing-woodstock',
          title: '12 Woodstock Street',
          addressLine1: '12 Woodstock Street',
          suburb: 'Woodstock',
          city: 'Cape Town',
          province: 'Western Cape',
          postalCode: '7925',
          askingPrice: 2650000,
          propertyType: 'Apartment',
        },
      ]

  return listings.map((listing, index) => {
    const title = normalizeText(listing.title || `Home Seekers Listing ${index + 1}`)
    const addressLine1 = normalizeText(listing.addressLine1 || title)
    const suburb = normalizeText(listing.suburb || '')
    const city = normalizeText(listing.city || 'Cape Town')
    const province = normalizeText(listing.province || 'Western Cape')
    const postalCode = normalizeText(listing.postalCode || '')
    return {
      id: stableUuid(`home-seekers:listing:${listing.id || title}`),
      organisation_id: HOME_SEEKERS_DEMO_ORGANISATION_ID,
      branch_id: HOME_SEEKERS_DEMO_BRANCH_ID,
      assigned_agent_id: userId,
      assigned_agent_email: HOME_SEEKERS_DEMO_EMAIL,
      listing_reference: `HS-${String(index + 1).padStart(3, '0')}`,
      title,
      description: `Demo listing for ${title}.`,
      listing_category: 'sale',
      listing_status: 'seller_lead',
      listing_visibility: 'internal',
      mandate_status: 'not_started',
      seller_onboarding_status: 'sent',
      is_active: false,
      listing_source: 'home_seekers_demo_seed',
      property_type: listing.propertyType || 'House',
      property_category: 'residential',
      property_structure_type: 'freehold',
      asking_price: Number(listing.askingPrice || 0),
      street_address: addressLine1,
      address_line_1: addressLine1,
      formatted_address: [addressLine1, suburb, city, province, postalCode].filter(Boolean).join(', '),
      suburb,
      city,
      province,
      postal_code: postalCode,
      country: 'South Africa',
      bedrooms: 3,
      bathrooms: 2,
      floor_size_sqm: 140,
      is_demo_data: true,
      demo_metadata: {
        seedKey: HOME_SEEKERS_DEMO_SEED_KEY,
        accountId: account.id || 'home-seekers',
        listingId: listing.id || title,
        source: 'home_seekers_demo_bootstrap',
      },
      created_at: now,
      updated_at: now,
    }
  })
}

function buildDevelopmentPayload({ account = HOME_SEEKERS_DEMO_ACCOUNT } = {}) {
  const now = new Date().toISOString()
  const organisationName = normalizeText(account.name || 'Home Seekers') || 'Home Seekers'

  return {
    id: HOME_SEEKERS_DEMO_DEVELOPMENT_ID,
    organisation_id: HOME_SEEKERS_DEMO_ORGANISATION_ID,
    name: HOME_SEEKERS_DEMO_DEVELOPMENT_NAME,
    code: 'HS-DEMO',
    planned_units: 6,
    total_units_expected: 6,
    location: 'Cape Town',
    suburb: 'Cape Town CBD',
    city: 'Cape Town',
    province: 'Western Cape',
    country: 'South Africa',
    description: `${organisationName} demo development used to anchor transaction workspace data.`,
    status: 'active',
    developer_company: organisationName,
    launch_date: '2026-08-21',
    expected_completion_date: '2027-02-21',
    assigned_attorney_id: null,
    handover_enabled: true,
    snag_tracking_enabled: true,
    alterations_enabled: false,
    onboarding_enabled: true,
    address: 'Cape Town, Western Cape, South Africa',
    formatted_address: 'Cape Town, Western Cape, South Africa',
    street_address: 'Cape Town',
    latitude: null,
    longitude: null,
    google_place_id: null,
    postal_code: null,
    created_at: now,
    updated_at: now,
  }
}

function buildDevelopmentSettingsPayload() {
  const now = new Date().toISOString()
  return {
    development_id: HOME_SEEKERS_DEMO_DEVELOPMENT_ID,
    client_portal_enabled: true,
    snag_reporting_enabled: true,
    alteration_requests_enabled: false,
    service_reviews_enabled: false,
    reservation_deposit_enabled_by_default: false,
    reservation_deposit_amount: null,
    reservation_deposit_amount_type: 'fixed',
    reservation_deposit_treatment: 'credited_to_purchase_price',
    reservation_deposit_payable_to: 'developer',
    reservation_deposit_payment_details: {
      account_holder_name: '',
      bank_name: '',
      account_number: '',
      branch_code: '',
      account_type: '',
      payment_reference_format: '',
      payment_instructions: '',
      vat_treatment: 'including_vat',
      due_trigger: 'on_reservation',
    },
    reservation_deposit_notification_recipients: [],
    default_alteration_charge_treatment: 'included_in_purchase_price',
    enabled_modules: {
      agent: true,
      conveyancing: true,
      bond_originator: true,
    },
    stakeholder_teams: {
      agents: [],
      conveyancers: [],
      bondOriginators: [],
      developers: [],
      rolePlayerDefaults: {
        defaultAgentSource: 'first_agent',
        defaultAgentRelationshipId: '',
        defaultAgentPreferredPartnerId: '',
        defaultAgentName: '',
        multipleAgentsAllowed: true,
        developerSellingDirectly: false,
        defaultTransferAttorneySource: 'first_conveyancer',
        defaultBondOriginatorSource: 'first_bond_originator',
        defaultTransferAttorneyRelationshipId: '',
        defaultTransferAttorneyPreferredPartnerId: '',
        defaultTransferAttorneyName: '',
        defaultBondOriginatorRelationshipId: '',
        defaultBondOriginatorPreferredPartnerId: '',
        defaultBondOriginatorName: '',
        buyerAppointedBondOriginatorAllowed: true,
        buyerAppointedBondOriginatorRequiresApproval: false,
        autoInviteSelectedBondOriginator: true,
      },
    },
    created_at: now,
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

  const organisationId = await resolveExistingOrganisationId(client, { account })
  const branchId = await resolveExistingBranchId(client, organisationId)
  let profileRecord = null

  let userId = ''
  if (createAuthUser) {
    const authResult = await ensureAuthUser(client, { email: normalizedEmail, password, account })
    userId = authResult.userId
    profileRecord = authResult.profile
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

  const profilePayload = buildProfilePayload(userId, { account, existingProfile: profileRecord })
  const organisationPayload = { ...buildOrganisationPayload({ account }), id: organisationId }
  const organisationSettingsPayload = { ...buildOrganisationSettingsPayload({ account }), organisation_id: organisationId }
  const branchPayload = { ...buildBranchPayload({ account }), id: branchId, organisation_id: organisationId }
  const membershipPayload = {
    ...buildMembershipPayload(userId, { account }),
    organisation_id: organisationId,
    branch_id: branchId,
  }
  const developmentPayload = {
    ...buildDevelopmentPayload({ account }),
    organisation_id: organisationId,
  }
  const developmentSettingsPayload = buildDevelopmentSettingsPayload()
  const listingRows = buildListingPayloads(userId, { account }).map((row) => ({
    ...row,
    organisation_id: organisationId,
    branch_id: branchId,
  }))

  await upsertRow(client, definitions, 'profiles', profilePayload, 'id')
  await upsertRow(client, definitions, 'organisations', organisationPayload, 'id')
  await upsertRow(client, definitions, 'organisation_settings', organisationSettingsPayload, 'organisation_id')
  await upsertRow(client, definitions, 'organisation_branches', branchPayload, 'id')
  await upsertRow(client, definitions, 'organisation_users', membershipPayload, 'organisation_id,email')
  await upsertRow(client, definitions, 'developments', developmentPayload, 'id')
  await upsertRow(client, definitions, 'development_settings', developmentSettingsPayload, 'development_id')
  await Promise.all(listingRows.map((row) => upsertRow(client, definitions, 'private_listings', row, 'id')))

  const [membershipResult, usersResult, listingsResult] = await Promise.all([
    client
      .from('organisation_users')
      .select('*')
      .eq('organisation_id', organisationId)
      .eq('status', 'active')
      .order('created_at', { ascending: true }),
    client
      .from('organisation_users')
      .select('id, user_id, email, first_name, last_name, role, workspace_role, branch_id')
      .eq('organisation_id', organisationId)
      .eq('status', 'active')
      .order('created_at', { ascending: true }),
    client
      .from('private_listings')
      .select('id, title, address_line_1, suburb, city, province, postal_code, asking_price, property_type, assigned_agent_id')
      .eq('organisation_id', organisationId)
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
      id: organisationId,
      name: normalizeText(account.name || 'Home Seekers') || 'Home Seekers',
    },
    development: {
      id: HOME_SEEKERS_DEMO_DEVELOPMENT_ID,
      name: HOME_SEEKERS_DEMO_DEVELOPMENT_NAME,
    },
    organisationId,
    branchId,
    membership,
    users: usersResult.data || [],
    listings: listingsResult.data || listingRows,
  }
}
