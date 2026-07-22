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
  }
  config.projectRef = projectRefFromUrl(config.supabaseUrl)

  const missing = []
  for (const key of ['supabaseUrl', 'serviceRoleKey', 'anonKey', 'actorEmail', 'actorPassword']) {
    if (!config[key]) missing.push(key)
  }
  if (missing.length) throw new Error(`Missing seller onboarding completion configuration: ${missing.join(', ')}`)
  if (config.projectRef !== TARGET_PROJECT_REF) {
    throw new Error(`Refusing to verify seller onboarding completion on ${config.projectRef || 'unknown project'}; expected ${TARGET_PROJECT_REF}.`)
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

  const attorneyOption = (Array.isArray(options.data.partners) ? options.data.partners : []).find((partner) => (
    partner.id === resolution.data.id
    && partner.partner_organisation_id === attorney.id
    && partner.partner_type === 'transfer_attorney'
    && partner.is_active !== false
  ))
  if (!attorneyOption?.id) throw new Error('Young Law Inc is not visible as an active transfer attorney option.')
  return attorneyOption
}

async function getLaunchListing(actorClient, organisation) {
  const { data, error } = await actorClient
    .from('private_listings')
    .select('*')
    .eq('organisation_id', organisation.id)
    .eq('listing_reference', LAUNCH_LISTING_REFERENCE)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data?.id) throw new Error('Phase 3 launch listing was not found. Run verify:launch-seller-onboarding first.')
  return data
}

async function getLaunchOnboarding(actorClient, listing) {
  const { data, error } = await actorClient
    .from('private_listing_seller_onboarding')
    .select('*')
    .eq('private_listing_id', listing.id)
    .maybeSingle()
  if (error) throw error
  if (!data?.id || !normalizeText(data.token)) {
    throw new Error('Phase 3 seller onboarding row was not found. Run verify:launch-seller-onboarding first.')
  }
  return data
}

function buildAcceptedFormData(onboarding, preferredAttorney) {
  const existing = onboarding.form_data && typeof onboarding.form_data === 'object' ? onboarding.form_data : {}
  const acceptedAt = new Date().toISOString()
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

  return {
    ...existing,
    sellerFirstName: normalizeText(existing.sellerFirstName || existing.firstName || 'Phase'),
    firstName: normalizeText(existing.firstName || existing.sellerFirstName || 'Phase'),
    sellerSurname: normalizeText(existing.sellerSurname || existing.lastName || 'Seller'),
    lastName: normalizeText(existing.lastName || existing.sellerSurname || 'Seller'),
    sellerName: normalizeText(existing.sellerName || 'Phase Seller'),
    sellerEmail: normalizeEmail(existing.sellerEmail || existing.email || LAUNCH_SELLER_EMAIL),
    email: normalizeEmail(existing.email || existing.sellerEmail || LAUNCH_SELLER_EMAIL),
    sellerPhone: normalizeText(existing.sellerPhone || existing.phone || '+27110000000'),
    phone: normalizeText(existing.phone || existing.sellerPhone || '+27110000000'),
    sellerType: 'individual',
    ownershipStructure: 'single_owner',
    propertyDisclosureAccepted: true,
    preferredTransferAttorney,
    preferredTransferAttorneyAccepted: true,
    preferredTransferAttorneyDecision: 'accept_preferred',
    preferredTransferAttorneyAcceptance: {
      preferredPartnerId: preferredAttorney.id,
      partnerOrganisationId: preferredAttorney.partner_organisation_id || null,
      acceptedAt,
      acceptedByName: 'Phase Seller',
      acceptedByEmail: LAUNCH_SELLER_EMAIL,
    },
    sellerNominatedTransferAttorney: null,
  }
}

async function resetLaunchOnboardingToSent(actorClient, { listing, onboarding, formData }) {
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
  const resetFormData = {
    ...formData,
    preferredTransferAttorneyAccepted: false,
    preferredTransferAttorneyDecision: '',
    preferredTransferAttorneyAcceptance: null,
    sellerNominatedTransferAttorney: null,
  }

  const resetOnboarding = await actorClient
    .from('private_listing_seller_onboarding')
    .update({
      status: 'sent',
      submitted_at: null,
      token_expires_at: expiresAt,
      seller_type: 'individual',
      ownership_structure: 'single_owner',
      marital_regime: null,
      form_data: resetFormData,
      seller_portal_link_active: true,
      seller_portal_link_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', onboarding.id)
    .select('*')
    .maybeSingle()
  if (resetOnboarding.error) throw resetOnboarding.error

  const resetListing = await actorClient
    .from('private_listings')
    .update({
      listing_status: 'onboarding_sent',
      seller_onboarding_status: 'sent',
      seller_type: 'individual',
      updated_at: new Date().toISOString(),
    })
    .eq('id', listing.id)
    .select('id, listing_status, seller_onboarding_status')
    .maybeSingle()
  if (resetListing.error) throw resetListing.error

  return { onboarding: resetOnboarding.data, listing: resetListing.data }
}

async function completeSellerOnboarding(anonClient, { token, formData }) {
  const { data, error } = await anonClient.rpc('bridge_complete_private_listing_seller_onboarding', {
    p_token: token,
    p_form_data: formData,
    p_seller_type: 'individual',
    p_ownership_structure: 'single_owner',
    p_marital_regime: null,
  })
  if (error) throw error
  if (!data?.listing?.id || !data?.onboarding?.id) {
    throw new Error('Seller onboarding completion did not return listing and onboarding context.')
  }
  return data
}

async function verifyCompletionRows(actorClient, { listing, preferredAttorney }) {
  const [listingResult, onboardingResult, allocationResult] = await Promise.all([
    actorClient
      .from('private_listings')
      .select('id, listing_reference, listing_status, seller_onboarding_status')
      .eq('id', listing.id)
      .maybeSingle(),
    actorClient
      .from('private_listing_seller_onboarding')
      .select('*')
      .eq('private_listing_id', listing.id)
      .maybeSingle(),
    actorClient
      .from('private_listing_role_players')
      .select('*')
      .eq('private_listing_id', listing.id)
      .eq('role_type', 'transfer_attorney')
      .in('allocation_status', ['awaiting_buyer', 'under_offer', 'instructed'])
      .order('selected_at', { ascending: false })
      .limit(5),
  ])

  if (listingResult.error) throw listingResult.error
  if (onboardingResult.error) throw onboardingResult.error
  if (allocationResult.error) throw allocationResult.error

  const activeAllocations = allocationResult.data || []
  const allocation = activeAllocations[0]
  if (listingResult.data?.seller_onboarding_status !== 'completed') {
    throw new Error('Listing seller onboarding status was not completed.')
  }
  if (onboardingResult.data?.status !== 'completed') {
    throw new Error('Seller onboarding row was not completed.')
  }
  if (!allocation?.id) {
    throw new Error('No active transfer-attorney allocation was created.')
  }
  if (allocation.preferred_partner_id !== preferredAttorney.id) {
    throw new Error('Transfer-attorney allocation does not point to the accepted preferred partner.')
  }
  if (allocation.partner_organisation_id !== preferredAttorney.partner_organisation_id) {
    throw new Error('Transfer-attorney allocation does not point to the attorney organisation.')
  }
  if (allocation.partner_role_configuration_id !== preferredAttorney.partner_role_configuration_id) {
    throw new Error('Transfer-attorney allocation is missing the canonical role configuration.')
  }
  if (allocation.metadata?.source !== 'seller_onboarding_acceptance') {
    throw new Error('Transfer-attorney allocation is missing seller onboarding acceptance metadata.')
  }

  return {
    listing: listingResult.data,
    onboarding: onboardingResult.data,
    allocation,
    activeAllocationCount: activeAllocations.length,
  }
}

const env = loadEnv()
const config = requireConfig(env)
const service = createClientForKey(config, config.serviceRoleKey)
const anonClient = createClientForKey(config, config.anonKey)

try {
  const organisation = await getOrganisation(service, TARGET_ORGANISATION_NAME)
  const attorney = await getOrganisation(service, TARGET_ATTORNEY_NAME, 'attorney_firm')
  const { client: actorClient } = await signInActor(config)
  const preferredAttorney = await getPreferredTransferAttorney(actorClient, { organisation, attorney })
  const listing = await getLaunchListing(actorClient, organisation)
  const onboarding = await getLaunchOnboarding(actorClient, listing)
  const acceptedFormData = buildAcceptedFormData(onboarding, preferredAttorney)
  const reset = await resetLaunchOnboardingToSent(actorClient, {
    listing,
    onboarding,
    formData: acceptedFormData,
  })
  const completion = await completeSellerOnboarding(anonClient, {
    token: reset.onboarding.token,
    formData: acceptedFormData,
  })
  const verification = await verifyCompletionRows(actorClient, { listing, preferredAttorney })

  console.log(JSON.stringify({
    status: 'SELLER_ONBOARDING_COMPLETION_READY',
    projectRef: config.projectRef,
    organisation: {
      id: organisation.id,
      name: displayName(organisation),
    },
    listing: {
      id: listing.id,
      reference: listing.listing_reference,
      status: verification.listing.listing_status,
      sellerOnboardingStatus: verification.listing.seller_onboarding_status,
    },
    onboarding: {
      id: verification.onboarding.id,
      status: verification.onboarding.status,
      sellerEmail: verification.onboarding.form_data?.sellerEmail,
      submittedAt: verification.onboarding.submitted_at,
    },
    acceptedAttorney: {
      preferredPartnerId: preferredAttorney.id,
      partnerOrganisationId: preferredAttorney.partner_organisation_id,
      companyName: preferredAttorney.company_name,
      roleConfigurationId: preferredAttorney.partner_role_configuration_id,
    },
    allocation: {
      id: verification.allocation.id,
      status: verification.allocation.allocation_status,
      selectionSource: verification.allocation.selection_source,
      preferredPartnerId: verification.allocation.preferred_partner_id,
      partnerOrganisationId: verification.allocation.partner_organisation_id,
      partnerRoleConfigurationId: verification.allocation.partner_role_configuration_id,
      metadataSource: verification.allocation.metadata?.source,
      activeAllocationCount: verification.activeAllocationCount,
    },
    portalVerification: {
      listingResolved: Boolean(completion.listing?.id),
      onboardingResolved: Boolean(completion.onboarding?.id),
      attorneyAccepted: completion.onboarding?.form_data?.preferredTransferAttorneyAccepted === true,
    },
  }, null, 2))
} catch (error) {
  console.error(JSON.stringify({
    status: 'SELLER_ONBOARDING_COMPLETION_BLOCKED',
    message: error?.message || String(error),
  }, null, 2))
  process.exitCode = 1
}
