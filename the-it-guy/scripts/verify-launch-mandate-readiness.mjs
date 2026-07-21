import fs from 'node:fs'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import {
  mapSellerOnboardingToMandateData,
  validateMandateGenerationData,
} from '../src/core/documents/mandateDataMapper.js'

const appRoot = fileURLToPath(new URL('..', import.meta.url))
const TARGET_PROJECT_REF = 'isdowlnollckzvltkasn'
const TARGET_ORGANISATION_NAME = 'Kingstons Real Estate'
const TARGET_ATTORNEY_NAME = 'Young Law Inc'
const LAUNCH_LISTING_REFERENCE = 'PHASE3-LAUNCH-SELLER-ONBOARDING'
const LAUNCH_SELLER_EMAIL = 'seller.phase3.launch@example.test'
const LAUNCH_PACKET_TITLE = 'Phase 5 Launch Mandate Draft'

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
  if (missing.length) throw new Error(`Missing mandate readiness configuration: ${missing.join(', ')}`)
  if (config.projectRef !== TARGET_PROJECT_REF) {
    throw new Error(`Refusing to verify mandate readiness on ${config.projectRef || 'unknown project'}; expected ${TARGET_PROJECT_REF}.`)
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

async function getProfile(actorClient, user) {
  const { data, error } = await actorClient
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()
  if (error) throw error
  return data || {
    id: user.id,
    email: user.email,
    full_name: normalizeEmail(user.email),
  }
}

async function getLaunchContext(actorClient, { organisation, preferredAttorney }) {
  const listingResult = await actorClient
    .from('private_listings')
    .select('*')
    .eq('organisation_id', organisation.id)
    .eq('listing_reference', LAUNCH_LISTING_REFERENCE)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (listingResult.error) throw listingResult.error
  if (!listingResult.data?.id) throw new Error('Phase 3 launch listing was not found. Run verify:launch-seller-onboarding first.')

  const onboardingResult = await actorClient
    .from('private_listing_seller_onboarding')
    .select('*')
    .eq('private_listing_id', listingResult.data.id)
    .maybeSingle()
  if (onboardingResult.error) throw onboardingResult.error
  if (onboardingResult.data?.status !== 'completed') {
    throw new Error('Phase 4 seller onboarding completion is required before mandate readiness. Run verify:launch-seller-onboarding-completion first.')
  }

  const allocationResult = await actorClient
    .from('private_listing_role_players')
    .select('*')
    .eq('private_listing_id', listingResult.data.id)
    .eq('role_type', 'transfer_attorney')
    .in('allocation_status', ['awaiting_buyer', 'under_offer', 'instructed'])
    .order('selected_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (allocationResult.error) throw allocationResult.error
  if (!allocationResult.data?.id) throw new Error('No active transfer-attorney allocation exists for the launch listing.')
  if (allocationResult.data.preferred_partner_id !== preferredAttorney.id) {
    throw new Error('Launch allocation does not point to the accepted preferred attorney.')
  }

  return {
    listing: listingResult.data,
    onboarding: onboardingResult.data,
    allocation: allocationResult.data,
  }
}

function toCamelListing(row = {}) {
  return {
    ...row,
    id: row.id,
    organisationId: row.organisation_id,
    propertyAddress: row.formatted_address || row.address_line_1 || row.street_address,
    addressLine1: row.address_line_1,
    streetAddress: row.street_address,
    formattedAddress: row.formatted_address,
    propertyType: row.property_type,
    propertyStructureType: row.property_structure_type,
    askingPrice: row.asking_price,
    mandateType: row.mandate_type,
    sellerType: row.seller_type,
    sellerOnboardingStatus: row.seller_onboarding_status,
    mandateStatus: row.mandate_status,
  }
}

function buildMandateData({ organisation, profile, listing, onboarding, allocation }) {
  const formData = onboarding.form_data && typeof onboarding.form_data === 'object' ? onboarding.form_data : {}
  return mapSellerOnboardingToMandateData({
    onboardingSubmission: {
      ...formData,
      status: onboarding.status,
      askingPrice: listing.asking_price,
      mandateType: listing.mandate_type || 'sole',
      preferredTransferAttorney: {
        ...(formData.preferredTransferAttorney || {}),
        preferredPartnerId: allocation.preferred_partner_id,
        partnerOrganisationId: allocation.partner_organisation_id,
        partnerRoleConfigurationId: allocation.partner_role_configuration_id,
        companyName: allocation.company_name,
        contactPerson: allocation.contact_person,
        email: allocation.email_address,
        phone: allocation.phone_number,
        selectionSource: allocation.selection_source,
      },
    },
    lead: {
      sellerOnboardingStatus: onboarding.status,
      sellerOnboardingToken: onboarding.token,
      sellerEmail: formData.sellerEmail || LAUNCH_SELLER_EMAIL,
      sellerName: formData.sellerFirstName || formData.firstName || 'Phase',
      sellerSurname: formData.sellerSurname || formData.lastName || 'Seller',
      sellerPropertyAddress: listing.formatted_address || listing.address_line_1,
      propertyType: listing.property_type,
      askingPrice: listing.asking_price,
    },
    privateListing: toCamelListing(listing),
    agency: {
      name: displayName(organisation),
      legalName: displayName(organisation),
      organisationName: displayName(organisation),
      defaultCommissionPercentage: 7.5,
      defaultMandateType: 'sole',
    },
    organisation: {
      id: organisation.id,
      name: displayName(organisation),
      displayName: displayName(organisation),
      defaultCommissionPercentage: 7.5,
      defaultMandateType: 'sole',
    },
    agent: {
      id: profile.id,
      fullName: normalizeText(profile.full_name || `${profile.first_name || ''} ${profile.last_name || ''}`) || 'Runtime Probe',
      email: normalizeEmail(profile.email || profile.username),
      phone: normalizeText(profile.phone || profile.mobile),
    },
    contact: {
      email: formData.sellerEmail || LAUNCH_SELLER_EMAIL,
      phone: formData.sellerPhone || formData.phone,
      firstName: formData.sellerFirstName || formData.firstName,
      lastName: formData.sellerSurname || formData.lastName,
    },
    transaction: {},
    mandateDraft: {
      mandateType: listing.mandate_type || 'sole',
      commissionPercent: 7.5,
      transferAttorneyPreferredPartnerId: allocation.preferred_partner_id,
      transferAttorneyPartnerOrganisationId: allocation.partner_organisation_id,
      transferAttorneyPartnerRoleConfigurationId: allocation.partner_role_configuration_id,
      transferAttorneyCompanyName: allocation.company_name,
      transferAttorneyEmail: allocation.email_address,
    },
  })
}

function assertPracticalMandateReadiness(mandateData) {
  const missing = []
  if (!normalizeText(mandateData.seller?.fullName)) missing.push('seller.fullName')
  if (!normalizeText(mandateData.seller?.email)) missing.push('seller.email')
  if (!normalizeText(mandateData.property?.fullAddress)) missing.push('property.fullAddress')
  if (!Number.isFinite(Number(mandateData.property?.askingPrice))) missing.push('property.askingPrice')
  if (!normalizeText(mandateData.mandate?.type)) missing.push('mandate.type')
  if (!normalizeText(mandateData.mandate?.startDate)) missing.push('mandate.startDate')
  if (!normalizeText(mandateData.mandate?.expiryDate)) missing.push('mandate.expiryDate')
  if (!normalizeText(mandateData.agency?.legalName || mandateData.agency?.tradingName)) missing.push('agency.legalName')
  if (!normalizeText(mandateData.agent?.fullName)) missing.push('agent.fullName')
  if (!normalizeText(mandateData.transferAttorney?.preferredPartnerId)) missing.push('transferAttorney.preferredPartnerId')
  if (!normalizeText(mandateData.transferAttorney?.partnerRoleConfigurationId)) missing.push('transferAttorney.partnerRoleConfigurationId')
  if (!normalizeText(mandateData.transferAttorney?.companyName)) missing.push('transferAttorney.companyName')
  if (!mandateData.onboardingComplete) missing.push('onboardingComplete')
  if (missing.length) {
    throw new Error(`Mandate practical readiness is missing: ${missing.join(', ')}`)
  }
}

function buildSectionManifest() {
  return [
    { sectionKey: 'introduction_purpose', sectionLabel: 'Introduction and Purpose', required: true },
    { sectionKey: 'seller_parties', sectionLabel: 'Seller Parties', required: true },
    { sectionKey: 'property_details', sectionLabel: 'Property Details', required: true },
    { sectionKey: 'mandate_terms', sectionLabel: 'Mandate Terms', required: true },
    { sectionKey: 'commission', sectionLabel: 'Commission', required: true },
    { sectionKey: 'transfer_attorney', sectionLabel: 'Transfer Attorney', required: true },
    { sectionKey: 'signatures', sectionLabel: 'Signatures', required: true },
  ]
}

async function findReusableMandatePacket(actorClient, { organisationId, listingId }) {
  const { data, error } = await actorClient
    .from('document_packets')
    .select('*')
    .eq('organisation_id', organisationId)
    .eq('packet_type', 'mandate')
    .order('updated_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return (data || []).find((packet) => (
    packet.title === LAUNCH_PACKET_TITLE
    && packet.source_context_json?.privateListingId === listingId
    && !['sent', 'partially_signed', 'completed', 'voided', 'archived'].includes(packet.status)
  )) || null
}

async function ensureMandatePacket(actorClient, { organisation, listing, user, mandateData, validation }) {
  const existing = await findReusableMandatePacket(actorClient, {
    organisationId: organisation.id,
    listingId: listing.id,
  })
  const now = new Date().toISOString()
  const payload = {
    organisation_id: organisation.id,
    packet_type: 'mandate',
    title: LAUNCH_PACKET_TITLE,
    status: 'ready_for_generation',
    assigned_agent_id: user.id,
    created_by: user.id,
    source_context_json: {
      source: 'phase_5_launch_mandate_readiness',
      launchPhase: 'phase_5',
      privateListingId: listing.id,
      listingReference: listing.listing_reference,
      sellerOnboardingStatus: listing.seller_onboarding_status,
      mandateScenarioProfile: mandateData.mandateScenarioProfile,
      sourceContext: mandateData.sourceContext,
    },
    branding_snapshot_json: {
      organisationId: organisation.id,
      organisationName: displayName(organisation),
    },
    template_key_snapshot: 'mandate_default_v1',
    template_label_snapshot: 'Default Sales Mandate',
    template_definition_snapshot_json: {
      source: 'phase_5_launch_mandate_readiness',
      packetType: 'mandate',
      templateKey: 'mandate_default_v1',
      sectionManifest: buildSectionManifest(),
    },
    updated_at: now,
  }

  if (existing?.id) {
    const { data, error } = await actorClient
      .from('document_packets')
      .update(payload)
      .eq('id', existing.id)
      .select('*')
      .maybeSingle()
    if (error) throw error
    return { packet: data, created: false }
  }

  const { data, error } = await actorClient
    .from('document_packets')
    .insert({
      ...payload,
      current_version_number: 0,
    })
    .select('*')
    .maybeSingle()
  if (error) throw error
  return { packet: data, created: true }
}

async function ensureMandateDraftVersion(actorClient, { packet, mandateData, validation, user }) {
  const existing = await actorClient
    .from('document_packet_versions')
    .select('*')
    .eq('packet_id', packet.id)
    .eq('render_status', 'draft')
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existing.error) throw existing.error
  if (existing.data?.validation_summary_json?.source === 'phase_5_launch_mandate_readiness') {
    return existing.data
  }

  const sectionManifest = buildSectionManifest()
  const response = await actorClient.rpc('bridge_create_document_packet_version_i1', {
    p_packet_id: packet.id,
    p_render_status: 'draft',
    p_rendered_document_id: null,
    p_rendered_file_path: null,
    p_rendered_file_name: null,
    p_rendered_file_url: null,
    p_placeholders_resolved_json: mandateData.placeholders || {},
    p_placeholders_missing_json: validation.missingRequiredFields || [],
    p_section_manifest_json: sectionManifest,
    p_validation_summary_json: {
      source: 'phase_5_launch_mandate_readiness',
      canProceed: validation.canProceed,
      warningCount: validation.warnings?.length || 0,
      missingRequiredCount: validation.missingRequiredFields?.length || 0,
      practicalReadiness: 'ready',
      generatedAt: new Date().toISOString(),
    },
    p_generated_by: user.id,
    p_generated_at: new Date().toISOString(),
    p_dry_run: false,
  })
  if (response.error) throw response.error
  if (!response.data?.version?.id) throw new Error('Mandate draft version creation returned no version.')
  return response.data.version
}

async function upsertSigner(actorClient, { organisationId, packetId, versionId, role, name, email, order }) {
  const existing = await actorClient
    .from('document_packet_signers')
    .select('*')
    .eq('packet_id', packetId)
    .eq('signer_role', role)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (existing.error) throw existing.error

  const payload = {
    organisation_id: organisationId,
    packet_id: packetId,
    packet_version_id: versionId,
    signer_role: role,
    signer_name: name,
    signer_email: normalizeEmail(email),
    signing_order: order,
    status: 'pending',
    updated_at: new Date().toISOString(),
  }

  if (existing.data?.id) {
    const { data, error } = await actorClient
      .from('document_packet_signers')
      .update(payload)
      .eq('id', existing.data.id)
      .select('*')
      .maybeSingle()
    if (error) throw error
    return data
  }

  const { data, error } = await actorClient
    .from('document_packet_signers')
    .insert(payload)
    .select('*')
    .maybeSingle()
  if (error) throw error
  return data
}

async function stageMandateSigners(actorClient, { organisation, packet, version, mandateData }) {
  const sellerSigner = await upsertSigner(actorClient, {
    organisationId: organisation.id,
    packetId: packet.id,
    versionId: version.id,
    role: 'seller',
    name: mandateData.seller.fullName,
    email: mandateData.seller.email,
    order: 1,
  })
  const agentSigner = await upsertSigner(actorClient, {
    organisationId: organisation.id,
    packetId: packet.id,
    versionId: version.id,
    role: 'agent',
    name: mandateData.agent.fullName,
    email: mandateData.agent.email,
    order: 2,
  })
  return [sellerSigner, agentSigner]
}

async function linkMandatePacket(actorClient, { listing, allocation, packet }) {
  const [listingResult, allocationResult] = await Promise.all([
    actorClient
      .from('private_listings')
      .update({
        mandate_packet_id: packet.id,
        mandate_status: 'ready',
        listing_status: 'mandate_ready',
        updated_at: new Date().toISOString(),
      })
      .eq('id', listing.id)
      .select('id, listing_reference, listing_status, mandate_status, mandate_packet_id')
      .maybeSingle(),
    actorClient
      .from('private_listing_role_players')
      .update({
        mandate_packet_id: packet.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', allocation.id)
      .select('id, allocation_status, mandate_packet_id, partner_role_configuration_id')
      .maybeSingle(),
  ])
  if (listingResult.error) throw listingResult.error
  if (allocationResult.error) throw allocationResult.error
  return { listing: listingResult.data, allocation: allocationResult.data }
}

async function verifyMandatePacket(actorClient, anonClient, { listing, packet, version, preferredAttorney }) {
  const [packetResult, versionResult, signerResult, eventResult, portalResult] = await Promise.all([
    actorClient.from('document_packets').select('*').eq('id', packet.id).maybeSingle(),
    actorClient.from('document_packet_versions').select('*').eq('id', version.id).maybeSingle(),
    actorClient.from('document_packet_signers').select('*').eq('packet_id', packet.id).order('signing_order', { ascending: true }),
    actorClient.from('document_packet_events').select('*').eq('packet_id', packet.id).eq('event_type', 'version_created'),
    anonClient.rpc('bridge_private_listing_seller_portal_payload', {
      p_token: listing.seller_portal_token || listing.seller_onboarding_token || '',
      p_access_token: null,
      p_require_access: false,
    }),
  ])
  if (packetResult.error) throw packetResult.error
  if (versionResult.error) throw versionResult.error
  if (signerResult.error) throw signerResult.error
  if (eventResult.error) throw eventResult.error
  if (portalResult.error) throw portalResult.error

  const signers = signerResult.data || []
  const signerRoles = new Set(signers.map((signer) => signer.signer_role))
  if (packetResult.data?.status !== 'ready_for_generation') throw new Error('Mandate packet is not ready for generation.')
  if (versionResult.data?.render_status !== 'draft') throw new Error('Mandate version is not a draft.')
  if (!signerRoles.has('seller') || !signerRoles.has('agent')) throw new Error('Mandate packet is missing seller or agent signer rows.')
  if (!eventResult.data?.length) throw new Error('Mandate draft version did not create a version_created event.')
  if (portalResult.data?.mandatePacket?.id !== packet.id) {
    throw new Error('Seller portal payload does not resolve the launch mandate packet.')
  }
  if (portalResult.data?.onboarding?.form_data?.preferredTransferAttorney?.preferredPartnerId !== preferredAttorney.id) {
    throw new Error('Seller portal mandate context no longer points to the accepted attorney.')
  }

  return {
    packet: packetResult.data,
    version: versionResult.data,
    signers,
    versionCreatedEventCount: eventResult.data.length,
    portalMandatePacket: portalResult.data.mandatePacket,
  }
}

const env = loadEnv()
const config = requireConfig(env)
const service = createClientForKey(config, config.serviceRoleKey)
const anonClient = createClientForKey(config, config.anonKey)

try {
  const organisation = await getOrganisation(service, TARGET_ORGANISATION_NAME)
  const attorney = await getOrganisation(service, TARGET_ATTORNEY_NAME, 'attorney_firm')
  const { client: actorClient, user } = await signInActor(config)
  const profile = await getProfile(actorClient, user)
  const preferredAttorney = await getPreferredTransferAttorney(actorClient, { organisation, attorney })
  const context = await getLaunchContext(actorClient, { organisation, preferredAttorney })
  const mandateData = buildMandateData({ organisation, profile, ...context })
  const validation = validateMandateGenerationData(mandateData, { action: 'generate' })
  if (!validation.canProceed) throw new Error('Mandate generation validator returned canProceed=false.')
  assertPracticalMandateReadiness(mandateData)

  const { packet, created } = await ensureMandatePacket(actorClient, {
    organisation,
    listing: context.listing,
    user,
    mandateData,
    validation,
  })
  const version = await ensureMandateDraftVersion(actorClient, {
    packet,
    mandateData,
    validation,
    user,
  })
  await stageMandateSigners(actorClient, { organisation, packet, version, mandateData })
  const linked = await linkMandatePacket(actorClient, {
    listing: context.listing,
    allocation: context.allocation,
    packet,
  })
  const onboarding = await actorClient
    .from('private_listing_seller_onboarding')
    .select('token, seller_portal_token')
    .eq('private_listing_id', context.listing.id)
    .maybeSingle()
  if (onboarding.error) throw onboarding.error
  const verified = await verifyMandatePacket(actorClient, anonClient, {
    listing: {
      ...context.listing,
      seller_portal_token: onboarding.data?.seller_portal_token,
      seller_onboarding_token: onboarding.data?.token,
    },
    packet,
    version,
    preferredAttorney,
  })

  console.log(JSON.stringify({
    status: 'MANDATE_READINESS_READY',
    projectRef: config.projectRef,
    organisation: {
      id: organisation.id,
      name: displayName(organisation),
    },
    listing: {
      id: context.listing.id,
      reference: context.listing.listing_reference,
      status: linked.listing?.listing_status,
      mandateStatus: linked.listing?.mandate_status,
      mandatePacketId: linked.listing?.mandate_packet_id,
    },
    mandateData: {
      canProceed: validation.canProceed,
      warningCount: validation.warnings?.length || 0,
      missingRequiredCount: validation.missingRequiredFields?.length || 0,
      seller: mandateData.seller.fullName,
      sellerEmail: mandateData.seller.email,
      propertyAddress: mandateData.property.fullAddress,
      mandateType: mandateData.mandate.type,
      askingPrice: mandateData.mandate.askingPrice,
      transferAttorney: mandateData.transferAttorney.companyName,
    },
    packet: {
      id: verified.packet.id,
      created,
      status: verified.packet.status,
      currentVersionNumber: verified.packet.current_version_number,
      versionId: verified.version.id,
      versionNumber: verified.version.version_number,
      renderStatus: verified.version.render_status,
      versionCreatedEventCount: verified.versionCreatedEventCount,
    },
    signers: verified.signers.map((signer) => ({
      id: signer.id,
      role: signer.signer_role,
      email: signer.signer_email,
      status: signer.status,
    })),
    allocation: {
      id: linked.allocation?.id,
      status: linked.allocation?.allocation_status,
      mandatePacketId: linked.allocation?.mandate_packet_id,
      partnerRoleConfigurationId: linked.allocation?.partner_role_configuration_id,
    },
    portalVerification: {
      mandatePacketResolved: verified.portalMandatePacket?.id === verified.packet.id,
      mandatePacketState: verified.portalMandatePacket?.state,
      acceptedAttorneyResolved: true,
    },
  }, null, 2))
} catch (error) {
  console.error(JSON.stringify({
    status: 'MANDATE_READINESS_BLOCKED',
    message: error?.message || String(error),
  }, null, 2))
  process.exitCode = 1
}
