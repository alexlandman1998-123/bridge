import fs from 'node:fs'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const appRoot = fileURLToPath(new URL('..', import.meta.url))
const TARGET_PROJECT_REF = 'isdowlnollckzvltkasn'
const TARGET_ORGANISATION_NAME = 'Kingstons Real Estate'
const TARGET_ATTORNEY_NAME = 'Young Law Inc'

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
  if (missing.length) throw new Error(`Missing launch transfer attorney configuration: ${missing.join(', ')}`)
  if (config.projectRef !== TARGET_PROJECT_REF) {
    throw new Error(`Refusing to repair launch attorney on ${config.projectRef || 'unknown project'}; expected ${TARGET_PROJECT_REF}.`)
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

function displayName(organisation) {
  return normalizeText(organisation?.display_name || organisation?.name)
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
  if (!data?.session?.access_token) throw new Error('Agency runtime actor sign-in did not return a session.')
  return client
}

async function ensureAcceptedRelationship(service, { organisation, attorney }) {
  const { data: existing, error: findError } = await service
    .from('organisation_partners')
    .select('*')
    .or(
      `and(organisation_id.eq.${organisation.id},partner_organisation_id.eq.${attorney.id}),and(organisation_id.eq.${attorney.id},partner_organisation_id.eq.${organisation.id})`,
    )
    .limit(1)
    .maybeSingle()
  if (findError) throw findError

  const now = new Date().toISOString()
  const payload = {
    organisation_id: organisation.id,
    partner_organisation_id: attorney.id,
    relationship_status: 'accepted',
    relationship_type: 'preferred',
    visibility_level: 'connected_partners',
    partner_type: 'attorney_firm',
    status: 'accepted',
    scope_type: 'organisation',
    scope_id: organisation.id,
    scope_name: 'Organisation-wide',
    preferred: true,
    organisation_preferred: true,
    partner_preferred: false,
    accepted_at: existing?.accepted_at || now,
    metadata: {
      ...(existing?.metadata || {}),
      phase2LaunchTransferAttorney: true,
      launchTransferAttorneyVerifiedAt: now,
    },
    notes: existing?.notes || 'Phase 2 launch transfer attorney relationship for seller onboarding.',
    updated_at: now,
  }

  if (existing?.id) {
    const { data, error } = await service
      .from('organisation_partners')
      .update(payload)
      .eq('id', existing.id)
      .select('*')
      .maybeSingle()
    if (error) throw error
    return { relationship: data, created: false }
  }

  const { data, error } = await service
    .from('organisation_partners')
    .insert(payload)
    .select('*')
    .maybeSingle()
  if (error) throw error
  return { relationship: data, created: true }
}

async function resolvePreferredPartner(actorClient, { organisation, attorney }) {
  const { data, error } = await actorClient.rpc('bridge_resolve_seller_connected_transfer_attorney', {
    p_organisation_id: organisation.id,
    p_partner_organisation_id: attorney.id,
  })
  if (error) throw error
  if (!data?.id) throw new Error('Transfer attorney resolver did not return a preferred partner id.')
  return data
}

async function promotePreferredPartner(service, { preferredPartner, organisation, attorney, relationship }) {
  const now = new Date().toISOString()
  const attorneyEmail = normalizeEmail(attorney.company_email || attorney.email)
  if (!attorneyEmail) throw new Error(`${TARGET_ATTORNEY_NAME} has no company email to use for seller onboarding.`)

  const { error: clearPreferredError } = await service
    .from('organisation_preferred_partners')
    .update({ is_preferred_default: false, updated_at: now })
    .eq('organisation_id', organisation.id)
    .eq('partner_type', 'transfer_attorney')
    .neq('id', preferredPartner.id)
  if (clearPreferredError) throw clearPreferredError

  const { data: partner, error: partnerError } = await service
    .from('organisation_preferred_partners')
    .update({
      partner_type: 'transfer_attorney',
      partner_organisation_id: attorney.id,
      company_name: displayName(attorney),
      contact_person: null,
      email_address: attorneyEmail,
      phone_number: normalizeText(attorney.phone || attorney.phone_number) || null,
      website: normalizeText(attorney.website) || null,
      physical_address: normalizeText(attorney.physical_address || attorney.address) || null,
      province: normalizeText(attorney.province) || null,
      notes: 'Phase 2 launch default transfer attorney for Kingstons seller onboarding.',
      is_active: true,
      is_preferred_default: true,
      is_demo_data: false,
      source: 'manual',
      scope_type: 'all_developments',
      scope_json: {},
      updated_at: now,
    })
    .eq('id', preferredPartner.id)
    .select('*')
    .maybeSingle()
  if (partnerError) throw partnerError
  if (!partner?.id) throw new Error('Failed to update preferred transfer attorney.')

  const { error: clearRoleError } = await service
    .from('organisation_partner_roles')
    .update({ is_preferred_default: false, updated_at: now })
    .eq('organisation_id', organisation.id)
    .eq('role_type', 'transfer_attorney')
    .neq('external_partner_id', partner.id)
  if (clearRoleError) throw clearRoleError

  const { data: role, error: roleError } = await service
    .from('organisation_partner_roles')
    .update({
      relationship_id: relationship.id,
      external_partner_id: partner.id,
      partner_organisation_id: attorney.id,
      role_type: 'transfer_attorney',
      is_active: true,
      is_preferred_default: true,
      source: 'manual',
      scope_type: 'all_developments',
      scope_json: {},
      metadata: {
        phase2LaunchTransferAttorney: true,
        relationshipId: relationship.id,
        preferredPartnerId: partner.id,
        verifiedAt: now,
      },
      updated_at: now,
    })
    .eq('organisation_id', organisation.id)
    .eq('role_type', 'transfer_attorney')
    .or(`external_partner_id.eq.${partner.id},relationship_id.eq.${relationship.id}`)
    .select('*')
    .limit(1)
    .maybeSingle()
  if (roleError) throw roleError
  if (!role?.id) throw new Error('Failed to update transfer attorney role configuration.')

  return { partner, role }
}

async function verifyAssignmentOptions(actorClient, { organisation, attorney, preferredPartner }) {
  const { data, error } = await actorClient.rpc('bridge_list_organisation_partner_assignment_options', {
    p_organisation_id: organisation.id,
  })
  if (error) throw error
  if (!data?.success) throw new Error(`Assignment option RPC failed: ${data?.code || 'unknown'}`)

  const partners = Array.isArray(data.partners) ? data.partners : []
  const match = partners.find((partner) => (
    partner.id === preferredPartner.id
    && partner.partner_organisation_id === attorney.id
    && partner.partner_type === 'transfer_attorney'
    && partner.is_active !== false
  ))
  if (!match) throw new Error('Launch transfer attorney is not visible in assignment options.')

  const { data: resolved, error: resolveError } = await actorClient.rpc('bridge_resolve_seller_connected_transfer_attorney', {
    p_organisation_id: organisation.id,
    p_partner_organisation_id: attorney.id,
  })
  if (resolveError) throw resolveError
  if (resolved?.id !== preferredPartner.id) {
    throw new Error(`Resolver returned ${resolved?.id || 'no id'} instead of ${preferredPartner.id}.`)
  }

  return { partners, match, resolved }
}

const env = loadEnv()
const config = requireConfig(env)
const service = createClientForKey(config, config.serviceRoleKey)

try {
  const organisation = await getOrganisation(service, TARGET_ORGANISATION_NAME)
  const attorney = await getOrganisation(service, TARGET_ATTORNEY_NAME, 'attorney_firm')
  const actorClient = await signInActor(config)
  const { relationship, created: relationshipCreated } = await ensureAcceptedRelationship(service, { organisation, attorney })
  const resolvedPartner = await resolvePreferredPartner(actorClient, { organisation, attorney })
  const { partner, role } = await promotePreferredPartner(service, {
    preferredPartner: resolvedPartner,
    organisation,
    attorney,
    relationship,
  })
  const verification = await verifyAssignmentOptions(actorClient, { organisation, attorney, preferredPartner: partner })

  console.log(JSON.stringify({
    status: 'LAUNCH_TRANSFER_ATTORNEY_READY',
    projectRef: config.projectRef,
    organisation: {
      id: organisation.id,
      name: displayName(organisation),
    },
    attorney: {
      id: attorney.id,
      name: displayName(attorney),
      email: partner.email_address,
    },
    relationship: {
      id: relationship.id,
      created: relationshipCreated,
      status: relationship.status || relationship.relationship_status,
      preferred: Boolean(relationship.preferred || relationship.organisation_preferred),
    },
    preferredPartner: {
      id: partner.id,
      active: partner.is_active,
      default: partner.is_preferred_default,
      partnerType: partner.partner_type,
    },
    roleConfiguration: {
      id: role.id,
      active: role.is_active,
      default: role.is_preferred_default,
      relationshipId: role.relationship_id,
      externalPartnerId: role.external_partner_id,
    },
    verification: {
      assignmentOptionCount: verification.partners.length,
      selectedOptionId: verification.match.id,
      resolverPreferredPartnerId: verification.resolved.id,
    },
  }, null, 2))
} catch (error) {
  console.error(JSON.stringify({
    status: 'LAUNCH_TRANSFER_ATTORNEY_BLOCKED',
    message: error?.message || String(error),
  }, null, 2))
  process.exitCode = 1
}
