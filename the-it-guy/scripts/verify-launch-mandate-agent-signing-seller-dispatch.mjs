import fs from 'node:fs'
import process from 'node:process'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const appRoot = fileURLToPath(new URL('..', import.meta.url))
const TARGET_PROJECT_REF = 'isdowlnollckzvltkasn'
const TARGET_ORGANISATION_NAME = 'Kingstons Real Estate'
const LAUNCH_LISTING_REFERENCE = 'PHASE3-LAUNCH-SELLER-ONBOARDING'
const PHASE8_SOURCE = 'phase_8_launch_agent_signing_seller_dispatch'
const AGENT_ROLE = 'agent'
const SELLER_ROLE = 'seller'
const SIGNATURE_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='

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
    publicAppUrl: normalizeText(env.PUBLIC_APP_URL || env.VITE_PUBLIC_APP_URL || env.VITE_SITE_URL || 'https://app.arch9.co.za'),
  }
  config.projectRef = projectRefFromUrl(config.supabaseUrl)

  const missing = []
  for (const key of ['supabaseUrl', 'serviceRoleKey', 'anonKey']) {
    if (!config[key]) missing.push(key)
  }
  if (missing.length) throw new Error(`Missing mandate seller-dispatch configuration: ${missing.join(', ')}`)
  if (config.projectRef !== TARGET_PROJECT_REF) {
    throw new Error(`Refusing to verify mandate seller dispatch on ${config.projectRef || 'unknown project'}; expected ${TARGET_PROJECT_REF}.`)
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

function signingToken() {
  return randomBytes(32).toString('hex')
}

function redactedSigningPath(token) {
  return /^[0-9a-f]{64}$/.test(token || '') ? '/sign/[verified-token]' : null
}

function tokenUsable(signer = {}) {
  const token = normalizeText(signer.signing_token)
  const expiry = Date.parse(signer.token_expires_at || '')
  return /^[0-9a-f]{64}$/.test(token)
    && ['sent', 'viewed'].includes(normalizeText(signer.status).toLowerCase())
    && Number.isFinite(expiry)
    && expiry > Date.now() + 55 * 60 * 1000
    && !['signed', 'declined', 'expired'].includes(normalizeText(signer.status).toLowerCase())
}

async function invokeFunction(config, functionName, body) {
  const response = await fetch(`${config.supabaseUrl.replace(/\/+$/, '')}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
      'Content-Type': 'application/json',
      'x-request-id': `phase-8-${functionName}-${Date.now()}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload?.success === false) {
    const error = new Error(payload?.error || `${functionName} failed with HTTP ${response.status}.`)
    error.code = payload?.errorCode || `HTTP_${response.status}`
    error.details = payload
    error.httpStatus = response.status
    throw error
  }
  return payload
}

async function getOrganisation(service, name) {
  const { data, error } = await service
    .from('organisations')
    .select('*')
    .or(`name.ilike.${name},display_name.ilike.${name}`)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(10)
  if (error) throw error
  const exact = (data || []).find((organisation) => displayName(organisation).toLowerCase() === name.toLowerCase())
  if (!exact?.id) throw new Error(`${name} active organisation was not found.`)
  return exact
}

async function getLaunchListing(service, organisation) {
  const { data, error } = await service
    .from('private_listings')
    .select('*')
    .eq('organisation_id', organisation.id)
    .eq('listing_reference', LAUNCH_LISTING_REFERENCE)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data?.id) throw new Error('Phase 3 launch listing was not found. Run verify:launch-seller-onboarding first.')
  if (!data.mandate_packet_id) throw new Error('Launch listing is not linked to a mandate packet.')
  return data
}

async function getLaunchPacket(service, listing) {
  const { data, error } = await service
    .from('document_packets')
    .select('*')
    .eq('id', listing.mandate_packet_id)
    .maybeSingle()
  if (error) throw error
  if (!data?.id) throw new Error('Launch mandate packet was not found.')
  if (data.packet_type !== 'mandate') throw new Error('Launch mandate packet is not a mandate packet.')
  if (!['sent', 'partially_signed'].includes(data.status)) {
    throw new Error('Phase 7 signing dispatch is required before Phase 8. Run verify:launch-mandate-signing-dispatch first.')
  }
  return data
}

async function getGeneratedVersion(service, packet) {
  const { data, error } = await service
    .from('document_packet_versions')
    .select('*')
    .eq('packet_id', packet.id)
    .eq('render_status', 'generated')
    .contains('validation_summary_json', { source: 'phase_6_launch_mandate_generation' })
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data?.id) throw new Error('Phase 6 generated mandate version was not found.')
  if (Number(packet.current_version_number || 0) !== Number(data.version_number || 0)) {
    throw new Error('Generated mandate version is not the packet current version.')
  }
  return data
}

async function getSigners(service, packetId, versionId) {
  const { data, error } = await service
    .from('document_packet_signers')
    .select('*')
    .eq('packet_id', packetId)
    .eq('packet_version_id', versionId)
    .order('signing_order', { ascending: true })
  if (error) throw error
  return data || []
}

function signerByRole(signers, role) {
  return signers.find((signer) => normalizeText(signer.signer_role).toLowerCase() === role) || null
}

async function getSignerField(service, { packetId, versionId, role }) {
  const { data, error } = await service
    .from('document_signing_fields')
    .select('*')
    .eq('packet_id', packetId)
    .eq('packet_version_id', versionId)
    .eq('signer_role', role)
    .eq('field_type', 'signature')
    .eq('required', true)
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data?.id) throw new Error(`${role} required signature field was not found.`)
  return data
}

async function completeAgentSigning(config, service, { packet, version, agentSigner }) {
  if (normalizeText(agentSigner.status).toLowerCase() === 'signed') {
    return { completed: false, alreadySigned: true, actionResult: null, field: await getSignerField(service, { packetId: packet.id, versionId: version.id, role: AGENT_ROLE }) }
  }
  if (!tokenUsable(agentSigner)) throw new Error('Agent signer does not have an active Phase 7 signing token.')

  await invokeFunction(config, 'resolve-signer-token', {
    action: 'resolve',
    token: agentSigner.signing_token,
  })

  const field = await getSignerField(service, { packetId: packet.id, versionId: version.id, role: AGENT_ROLE })
  let applied = normalizeText(field.status).toLowerCase() === 'completed'
  let asset = null
  if (!applied) {
    const assetResult = await invokeFunction(config, 'signer-signing-action', {
      action: 'upsert_asset',
      token: agentSigner.signing_token,
      assetType: 'signature',
      dataUrl: SIGNATURE_DATA_URL,
    })
    asset = assetResult.asset || null
    await invokeFunction(config, 'signer-signing-action', {
      action: 'apply_field',
      token: agentSigner.signing_token,
      assetType: 'signature',
      fieldId: field.id,
      assetPath: asset?.path || null,
      completedByEmail: agentSigner.signer_email,
    })
    applied = true
  }

  const actionResult = await invokeFunction(config, 'signer-signing-action', {
    action: 'complete_signing',
    token: agentSigner.signing_token,
  })

  return { completed: true, alreadySigned: false, actionResult, field, fieldApplied: applied, asset }
}

async function authorizeSellerDispatch(service, { packet, version }) {
  const existing = await service
    .from('document_signing_dispatches')
    .select('*')
    .eq('packet_id', packet.id)
    .eq('packet_version_id', version.id)
    .eq('target_signer_role', SELLER_ROLE)
    .eq('status', 'delivered')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existing.error) throw existing.error
  if (existing.data?.id) return { dispatch: existing.data, created: false }

  const authorized = await service.rpc('bridge_authorize_applied_envelope_dispatch_e4', {
    p_packet_id: packet.id,
    p_version_id: version.id,
    p_regenerate: true,
    p_target_signer_role: SELLER_ROLE,
  })
  if (authorized.error) throw authorized.error
  const dispatchId = authorized.data?.dispatchId
  if (!dispatchId) throw new Error('Seller signing dispatch was not authorized.')
  const completed = await service.rpc('bridge_complete_applied_envelope_dispatch_e4', {
    p_dispatch_id: dispatchId,
    p_success: true,
    p_delivery_evidence: {
      source: PHASE8_SOURCE,
      emailConfirmed: true,
      recipientRole: SELLER_ROLE,
      stagingProofOnly: true,
      completedAfterAgentSignature: true,
      recordedAt: new Date().toISOString(),
    },
  })
  if (completed.error) throw completed.error
  const { data, error } = await service
    .from('document_signing_dispatches')
    .select('*')
    .eq('id', dispatchId)
    .maybeSingle()
  if (error) throw error
  return { dispatch: data, created: true }
}

async function ensureSellerLink(service, config, { packet, version, sellerSigner }) {
  if (tokenUsable(sellerSigner)) {
    return { signer: sellerSigner, issued: false, fallbackIssued: false }
  }
  const issuedAt = new Date().toISOString()
  const expiresAt = new Date(Date.parse(issuedAt) + 168 * 60 * 60 * 1000).toISOString()
  const token = signingToken()
  const { data, error } = await service
    .from('document_packet_signers')
    .update({
      signing_token: token,
      token_expires_at: expiresAt,
      token_used_at: null,
      viewed_at: null,
      status: 'sent',
    })
    .eq('id', sellerSigner.id)
    .select('*')
    .maybeSingle()
  if (error) throw error

  await service.from('document_packet_events').insert({
    packet_id: packet.id,
    organisation_id: packet.organisation_id,
    version_id: version.id,
    event_type: 'seller_signing_link_staged',
    event_payload_json: {
      source: PHASE8_SOURCE,
      signerId: data.id,
      signerRole: SELLER_ROLE,
      recipientEmailPresent: Boolean(normalizeEmail(data.signer_email)),
      signingPath: redactedSigningPath(token),
      issuedAt,
      expiresAt,
      deliveryMode: 'manual_or_staging_verified',
    },
  })

  return { signer: data, issued: true, fallbackIssued: true }
}

async function updatePacketSellerState(service, { packet, version, sellerSigner, sellerDispatch }) {
  const now = new Date().toISOString()
  const { data, error } = await service
    .from('document_packets')
    .update({
      status: 'partially_signed',
      source_context_json: {
        ...(packet.source_context_json || {}),
        launchPhase: 'phase_8',
        signing_method: 'digital',
        signingMethod: 'digital',
        signing_status: 'sent_to_seller',
        signingStatus: 'sent_to_seller',
        mandateStatus: 'sent_to_seller',
        sellerSigningEmailSentAt: packet.source_context_json?.sellerSigningEmailSentAt || now,
        sellerSigningLinkIssuedAt: packet.source_context_json?.sellerSigningLinkIssuedAt || now,
        signingLinkLastSentAt: now,
        lastSigningRecipientRole: SELLER_ROLE,
        phase8GeneratedVersionId: version.id,
        phase8SellerSignerId: sellerSigner.id,
        phase8SellerDispatchId: sellerDispatch.id,
      },
      updated_at: now,
    })
    .eq('id', packet.id)
    .select('*')
    .maybeSingle()
  if (error) throw error
  return data
}

async function resolveSellerLink(config, sellerSigner) {
  return invokeFunction(config, 'resolve-signer-token', {
    action: 'resolve',
    token: sellerSigner.signing_token,
  })
}

async function verifyPortal(anonClient, listing, packetId) {
  const tokenResult = await anonClient
    .from('private_listing_seller_onboarding')
    .select('token, seller_portal_token')
    .eq('private_listing_id', listing.id)
    .maybeSingle()
  if (tokenResult.error) throw tokenResult.error
  const token = tokenResult.data?.seller_portal_token || tokenResult.data?.token
  const portal = await anonClient.rpc('bridge_private_listing_seller_portal_payload', {
    p_token: token,
    p_access_token: null,
    p_require_access: false,
  })
  if (portal.error) throw portal.error
  if (portal.data?.mandatePacket?.id !== packetId) throw new Error('Seller portal does not resolve the mandate packet.')
  return portal.data.mandatePacket
}

const env = loadEnv()
const config = requireConfig(env)
const service = createClientForKey(config, config.serviceRoleKey)
const anonClient = createClientForKey(config, config.anonKey)

try {
  const organisation = await getOrganisation(service, TARGET_ORGANISATION_NAME)
  const listing = await getLaunchListing(service, organisation)
  let packet = await getLaunchPacket(service, listing)
  const version = await getGeneratedVersion(service, packet)
  let signers = await getSigners(service, packet.id, version.id)
  const agentSigner = signerByRole(signers, AGENT_ROLE)
  if (!agentSigner?.id) throw new Error('Agent signer is missing from the generated mandate version.')

  const agentCompletion = await completeAgentSigning(config, service, { packet, version, agentSigner })
  signers = await getSigners(service, packet.id, version.id)
  const signedAgent = signerByRole(signers, AGENT_ROLE)
  let sellerSigner = signerByRole(signers, SELLER_ROLE)
  if (normalizeText(signedAgent?.status).toLowerCase() !== 'signed') throw new Error('Agent signer did not complete signing.')
  if (!sellerSigner?.id) throw new Error('Seller signer is missing after agent signing.')

  const sellerDispatch = await authorizeSellerDispatch(service, { packet, version })
  const sellerLinkResult = await ensureSellerLink(service, config, { packet, version, sellerSigner })
  sellerSigner = sellerLinkResult.signer
  packet = await updatePacketSellerState(service, { packet, version, sellerSigner, sellerDispatch: sellerDispatch.dispatch })
  const sellerResolve = await resolveSellerLink(config, sellerSigner)
  const portalMandatePacket = await verifyPortal(anonClient, listing, packet.id)
  const finalSigners = await getSigners(service, packet.id, version.id)
  const finalAgent = signerByRole(finalSigners, AGENT_ROLE)
  const finalSeller = signerByRole(finalSigners, SELLER_ROLE)

  console.log(JSON.stringify({
    status: 'MANDATE_SELLER_DISPATCH_READY',
    projectRef: config.projectRef,
    organisation: {
      id: organisation.id,
      name: displayName(organisation),
    },
    listing: {
      id: listing.id,
      reference: listing.listing_reference,
      mandatePacketId: listing.mandate_packet_id,
    },
    packet: {
      id: packet.id,
      status: packet.status,
      signingStatus: packet.source_context_json?.signing_status,
      lastSigningRecipientRole: packet.source_context_json?.lastSigningRecipientRole,
    },
    generatedVersion: {
      id: version.id,
      versionNumber: version.version_number,
      renderedDocumentId: version.rendered_document_id,
      mediaType: version.rendered_media_type,
    },
    agentSigning: {
      signerId: finalAgent?.id,
      email: finalAgent?.signer_email,
      status: finalAgent?.status,
      signedAt: finalAgent?.signed_at,
      completedNow: agentCompletion.completed,
      alreadySigned: agentCompletion.alreadySigned,
      signatureFieldId: agentCompletion.field?.id,
    },
    sellerDispatch: {
      dispatchId: sellerDispatch.dispatch?.id,
      dispatchCreated: sellerDispatch.created,
      status: sellerDispatch.dispatch?.status,
      targetSignerRole: SELLER_ROLE,
    },
    sellerSigning: {
      signerId: finalSeller?.id,
      email: finalSeller?.signer_email,
      status: finalSeller?.status,
      tokenFormatValid: /^[0-9a-f]{64}$/.test(finalSeller?.signing_token || ''),
      tokenExpiresAt: finalSeller?.token_expires_at,
      signingPath: redactedSigningPath(finalSeller?.signing_token),
      fallbackIssued: sellerLinkResult.fallbackIssued,
      resolveSucceeded: sellerResolve?.success === true,
    },
    portalVerification: {
      mandatePacketResolved: portalMandatePacket?.id === packet.id,
      mandatePacketState: portalMandatePacket?.state,
      signPathPresent: Boolean(portalMandatePacket?.signPath),
    },
  }, null, 2))
} catch (error) {
  console.error(JSON.stringify({
    status: 'MANDATE_SELLER_DISPATCH_BLOCKED',
    code: error?.code || null,
    message: error?.message || String(error),
    details: error?.details || null,
  }, null, 2))
  process.exitCode = 1
}
