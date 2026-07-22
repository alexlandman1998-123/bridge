import fs from 'node:fs'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const appRoot = fileURLToPath(new URL('..', import.meta.url))
const TARGET_PROJECT_REF = 'isdowlnollckzvltkasn'
const TARGET_ORGANISATION_NAME = 'Kingstons Real Estate'
const TARGET_ATTORNEY_NAME = 'Young Law Inc'
const LAUNCH_LISTING_REFERENCE = 'PHASE3-LAUNCH-SELLER-ONBOARDING'
const LAUNCH_SELLER_EMAIL = 'seller.phase3.launch@example.test'

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeEmail(value = '') {
  return normalizeText(value).toLowerCase()
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  return Object.fromEntries(
    fs
      .readFileSync(filePath, 'utf8')
      .split(/\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const separator = line.indexOf('=')
        if (separator === -1) return [line, '']
        return [line.slice(0, separator), line.slice(separator + 1).replace(/^["']|["']$/g, '')]
      }),
  )
}

function loadEnv() {
  const localEnv = parseEnvFile(`${appRoot}/.env`)
  const stagingEnv = parseEnvFile(`${appRoot}/.env.staging.local`)
  const processOverrides = Object.fromEntries(Object.entries(process.env).filter(([, value]) => normalizeText(value)))
  const merged = { ...localEnv, ...stagingEnv, ...processOverrides }

  if (!merged.SUPABASE_URL && merged.VITE_SUPABASE_URL) merged.SUPABASE_URL = merged.VITE_SUPABASE_URL
  if (!merged.VITE_SUPABASE_URL && merged.SUPABASE_URL) merged.VITE_SUPABASE_URL = merged.SUPABASE_URL
  if (!merged.VITE_SUPABASE_ANON_KEY && merged.VITE_SUPABASE_KEY) merged.VITE_SUPABASE_ANON_KEY = merged.VITE_SUPABASE_KEY
  if (!merged.VITE_SUPABASE_ANON_KEY && merged.SUPABASE_ANON_KEY) merged.VITE_SUPABASE_ANON_KEY = merged.SUPABASE_ANON_KEY

  return merged
}

function projectRefFromUrl(url = '') {
  return String(url).match(/^https:\/\/([^.]+)/)?.[1] || ''
}

function requireConfig(env) {
  const config = {
    supabaseUrl: normalizeText(env.SUPABASE_URL || env.VITE_SUPABASE_URL),
    serviceRoleKey: normalizeText(env.SUPABASE_SERVICE_ROLE_KEY),
    anonKey: normalizeText(env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_KEY || env.SUPABASE_ANON_KEY),
    actorEmail: normalizeEmail(env.AGENCY_RUNTIME_AGENT_EMAIL || env.STAGING_INTERNAL_EMAIL),
    actorPassword: normalizeText(env.AGENCY_RUNTIME_AGENT_PASSWORD || env.STAGING_INTERNAL_PASSWORD),
    appBaseUrl: normalizeText(env.VITE_APP_BASE_URL || env.APP_BASE_URL || 'https://app.arch9.co.za'),
  }
  config.projectRef = projectRefFromUrl(config.supabaseUrl)

  const missing = []
  for (const key of ['supabaseUrl', 'serviceRoleKey', 'anonKey', 'actorEmail', 'actorPassword']) {
    if (!config[key]) missing.push(key)
  }
  if (missing.length) throw new Error(`Missing seller onboarding launch configuration: ${missing.join(', ')}`)
  if (config.projectRef !== TARGET_PROJECT_REF) {
    throw new Error(`Refusing to verify seller onboarding on ${config.projectRef || 'unknown project'}; expected ${TARGET_PROJECT_REF}.`)
  }
  return config
}

function createClientForKey(config, key) {
  return createClient(config.supabaseUrl, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })
}

function displayName(organisation = {}) {
  return normalizeText(organisation.display_name || organisation.name)
}

function generateToken() {
  return `seller-phase3-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
}

function buildSellerOnboardingLink(config, token) {
  return `${config.appBaseUrl.replace(/\/+$/, '')}/seller/onboarding/${token}`
}

async function getOrganisation(service, name, type = null) {
  let query = service
    .from('organisations')
    .select('*')
    .or(`name.ilike.${name},display_name.ilike.${name}`)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(10)

  if (type) query = query.eq('type', type)

  const { data, error } = await query
  if (error) throw error
  const exact = (data || []).find((organisation) => displayName(organisation).toLowerCase() === name.toLowerCase())
  if (!exact?.id) throw new Error(`${name} active organisation was not found.`)
  return exact
}

async function signInActor(config) {
  const client = createClientForKey(config, config.anonKey)
  const { data, error } = await client.auth.signInWithPassword({
    email: config.actorEmail,
    password: config.actorPassword,
  })
  if (error) throw error
  if (!data?.session?.access_token || !data?.user?.id) {
    throw new Error('Agency runtime actor sign-in did not return a usable session.')
  }
  return { client, user: data.user }
}

async function getPreferredTransferAttorney(actorClient, { organisation, attorney }) {
  const resolution = await actorClient.rpc('bridge_resolve_seller_connected_transfer_attorney', {
    p_organisation_id: organisation.id,
    p_partner_organisation_id: attorney.id,
  })
  if (resolution.error) throw resolution.error
  if (!resolution.data?.id) throw new Error('Transfer attorney resolver did not return a preferred partner.')

  const options = await actorClient.rpc('bridge_list_organisation_partner_assignment_options', {
    p_organisation_id: organisation.id,
  })
  if (options.error) throw options.error
  if (!options.data?.success) throw new Error(`Transfer attorney assignment options failed: ${options.data?.code || 'unknown'}`)

  const activeOptions = Array.isArray(options.data.partners) ? options.data.partners : []
  const attorneyOption = activeOptions.find((partner) => (
    partner.id === resolution.data.id
    && partner.partner_organisation_id === attorney.id
    && partner.partner_type === 'transfer_attorney'
    && partner.is_active !== false
  ))
  if (!attorneyOption?.id) throw new Error('Young Law Inc is not visible as an active transfer attorney option.')
  return attorneyOption
}

async function ensureLaunchListing(actorClient, { organisation, user }) {
  const existing = await actorClient
    .from('private_listings')
    .select('*')
    .eq('organisation_id', organisation.id)
    .eq('listing_reference', LAUNCH_LISTING_REFERENCE)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existing.error) throw existing.error

  const now = new Date().toISOString()
  const payload = {
    organisation_id: organisation.id,
    assigned_agent_id: user.id,
    listing_reference: LAUNCH_LISTING_REFERENCE,
    listing_status: 'seller_lead',
    listing_visibility: 'internal',
    property_category: 'residential',
    listing_source: 'private_listing',
    property_structure_type: 'freehold',
    property_type: 'House',
    listing_category: 'private_sale',
    title: 'Phase 3 Launch Verification Listing',
    description: 'Launch verification listing for seller onboarding link generation.',
    asking_price: 1750000,
    address_line_1: '9 Launch Avenue',
    formatted_address: '9 Launch Avenue, Bryanston, Johannesburg',
    street_address: '9 Launch Avenue',
    suburb: 'Bryanston',
    city: 'Johannesburg',
    province: 'Gauteng',
    country: 'South Africa',
    mandate_type: 'sole',
    mandate_status: 'not_started',
    seller_type: 'individual',
    seller_onboarding_status: 'sent',
    is_active: false,
    is_demo_data: true,
    created_by: user.id,
    seller_canonical_facts_json: {
      seller: {
        legal_type: 'individual',
        first_name: 'Phase',
        last_name: 'Seller',
        email: LAUNCH_SELLER_EMAIL,
      },
      property: {
        full_address: '9 Launch Avenue, Bryanston, Johannesburg',
      },
      transaction: {
        mandate_type: 'sole',
      },
      context: {
        source: 'phase_3_launch_seller_onboarding',
      },
    },
    seller_canonical_fact_readiness_json: {
      ready: false,
      source: 'phase_3_launch_seller_onboarding',
    },
    seller_canonical_facts_updated_at: now,
    updated_at: now,
  }

  const mutate = existing.data?.id
    ? actorClient
        .from('private_listings')
        .update(payload)
        .eq('id', existing.data.id)
        .select('*')
        .maybeSingle()
    : actorClient
        .from('private_listings')
        .insert(payload)
        .select('*')
        .maybeSingle()
  const { data, error } = await mutate
  if (error) throw error
  return { listing: data, created: !existing.data?.id }
}

async function upsertSellerOnboarding(actorClient, { listing, preferredAttorney }) {
  const existing = await actorClient
    .from('private_listing_seller_onboarding')
    .select('*')
    .eq('private_listing_id', listing.id)
    .maybeSingle()
  if (existing.error) throw existing.error

  const token = normalizeText(existing.data?.token) || generateToken()
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
  const preferredTransferAttorney = {
    partnerRoleConfigurationId: preferredAttorney.partner_role_configuration_id || null,
    preferredPartnerId: preferredAttorney.id,
    partnerOrganisationId: preferredAttorney.partner_organisation_id || null,
    companyName: normalizeText(preferredAttorney.company_name),
    contactPerson: normalizeText(preferredAttorney.contact_person),
    email: normalizeEmail(preferredAttorney.email_address),
    phone: normalizeText(preferredAttorney.phone_number),
    selectionSource: 'agency_recommended',
  }
  const formData = {
    ...(existing.data?.form_data && typeof existing.data.form_data === 'object' ? existing.data.form_data : {}),
    sellerFirstName: 'Phase',
    firstName: 'Phase',
    sellerSurname: 'Seller',
    lastName: 'Seller',
    sellerName: 'Phase Seller',
    sellerEmail: LAUNCH_SELLER_EMAIL,
    email: LAUNCH_SELLER_EMAIL,
    sellerPhone: '+27110000000',
    phone: '+27110000000',
    preferredTransferAttorney,
    preferredTransferAttorneyAccepted: false,
    preferredTransferAttorneyDecision: '',
    preferredTransferAttorneyAcceptance: null,
    sellerNominatedTransferAttorney: null,
  }

  const payload = {
    private_listing_id: listing.id,
    token,
    token_expires_at: expiresAt,
    seller_type: 'individual',
    ownership_structure: 'single_owner',
    marital_regime: null,
    form_data: formData,
    status: 'sent',
    is_demo_data: true,
    seller_portal_link_active: true,
    seller_portal_link_expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await actorClient
    .from('private_listing_seller_onboarding')
    .upsert(payload, { onConflict: 'private_listing_id' })
    .select('*')
    .maybeSingle()
  if (error) throw error
  if (!data?.id) throw new Error('Seller onboarding upsert returned no row.')
  return data
}

async function verifyPortalPayload(anonClient, { token, preferredAttorney }) {
  const accessState = await anonClient.rpc('bridge_private_listing_seller_portal_access_state', {
    p_token: token,
  })
  if (accessState.error) throw accessState.error
  if (!accessState.data?.valid && !accessState.data?.ok) {
    throw new Error('Seller portal access state did not accept the onboarding token.')
  }

  const payload = await anonClient.rpc('bridge_private_listing_seller_portal_payload', {
    p_token: token,
    p_access_token: null,
    p_require_access: false,
  })
  if (payload.error) throw payload.error
  if (!payload.data?.listing?.id || !payload.data?.onboarding?.id) {
    throw new Error('Seller portal payload did not resolve listing and onboarding context.')
  }

  const portalAttorney = payload.data.onboarding?.form_data?.preferredTransferAttorney || {}
  if (portalAttorney.preferredPartnerId !== preferredAttorney.id) {
    throw new Error('Seller portal payload does not contain the launch transfer attorney.')
  }
  return { accessState: accessState.data, payload: payload.data }
}

async function updateListingSentStatus(actorClient, { listing }) {
  const { data, error } = await actorClient
    .from('private_listings')
    .update({
      seller_onboarding_status: 'sent',
      listing_status: 'onboarding_sent',
      updated_at: new Date().toISOString(),
    })
    .eq('id', listing.id)
    .select('id, listing_reference, listing_status, seller_onboarding_status')
    .maybeSingle()
  if (error) throw error
  return data
}

const env = loadEnv()
const config = requireConfig(env)
const service = createClientForKey(config, config.serviceRoleKey)
const anonClient = createClientForKey(config, config.anonKey)

try {
  const organisation = await getOrganisation(service, TARGET_ORGANISATION_NAME)
  const attorney = await getOrganisation(service, TARGET_ATTORNEY_NAME, 'attorney_firm')
  const { client: actorClient, user } = await signInActor(config)
  const preferredAttorney = await getPreferredTransferAttorney(actorClient, { organisation, attorney })
  const { listing, created } = await ensureLaunchListing(actorClient, { organisation, user })
  const onboarding = await upsertSellerOnboarding(actorClient, { listing, preferredAttorney })
  const updatedListing = await updateListingSentStatus(actorClient, { listing })
  const portalVerification = await verifyPortalPayload(anonClient, {
    token: onboarding.token,
    preferredAttorney,
  })

  console.log(JSON.stringify({
    status: 'SELLER_ONBOARDING_LINK_READY',
    projectRef: config.projectRef,
    organisation: {
      id: organisation.id,
      name: displayName(organisation),
    },
    listing: {
      id: listing.id,
      reference: listing.listing_reference,
      created,
      status: updatedListing?.listing_status,
      sellerOnboardingStatus: updatedListing?.seller_onboarding_status,
    },
    onboarding: {
      id: onboarding.id,
      status: onboarding.status,
      sellerEmail: onboarding.form_data?.sellerEmail,
      tokenExpiresAt: onboarding.token_expires_at,
      link: buildSellerOnboardingLink(config, onboarding.token),
    },
    attorney: {
      preferredPartnerId: preferredAttorney.id,
      partnerOrganisationId: preferredAttorney.partner_organisation_id,
      companyName: preferredAttorney.company_name,
      roleConfigurationId: preferredAttorney.partner_role_configuration_id,
    },
    portalVerification: {
      accessOk: Boolean(portalVerification.accessState?.valid || portalVerification.accessState?.ok),
      authRequired: Boolean(portalVerification.payload?.portalAccess?.authRequired),
      listingResolved: Boolean(portalVerification.payload?.listing?.id),
      onboardingResolved: Boolean(portalVerification.payload?.onboarding?.id),
      attorneyResolved: portalVerification.payload?.onboarding?.form_data?.preferredTransferAttorney?.preferredPartnerId === preferredAttorney.id,
    },
    delivery: {
      outboundEmailSent: false,
      reason: 'Phase 3 verifies link generation and portal resolution only.',
    },
  }, null, 2))
} catch (error) {
  console.error(JSON.stringify({
    status: 'SELLER_ONBOARDING_LINK_BLOCKED',
    message: error?.message || String(error),
  }, null, 2))
  process.exitCode = 1
}
