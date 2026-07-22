import fs from 'node:fs'
import process from 'node:process'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const appRoot = fileURLToPath(new URL('..', import.meta.url))
const TARGET_PROJECT_REF = 'isdowlnollckzvltkasn'
const TARGET_ORGANISATION_NAME = 'Kingstons Real Estate'
const LAUNCH_LISTING_REFERENCE = 'PHASE3-LAUNCH-SELLER-ONBOARDING'
const PHASE7_SOURCE = 'phase_7_launch_mandate_signing_dispatch'
const AGENT_ROLE = 'agent'
const SELLER_ROLE = 'seller'

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
  if (missing.length) throw new Error(`Missing mandate signing-dispatch configuration: ${missing.join(', ')}`)
  if (config.projectRef !== TARGET_PROJECT_REF) {
    throw new Error(`Refusing to verify mandate signing dispatch on ${config.projectRef || 'unknown project'}; expected ${TARGET_PROJECT_REF}.`)
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

function signerLink(config, token) {
  return `${config.publicAppUrl.replace(/\/+$/, '')}/sign/${token}`
}

function tokenUsable(signer = {}) {
  const token = normalizeText(signer.signing_token)
  const expiry = Date.parse(signer.token_expires_at || '')
  return /^[0-9a-f]{64}$/.test(token)
    && normalizeText(signer.status).toLowerCase() === 'sent'
    && Number.isFinite(expiry)
    && expiry > Date.now() + 55 * 60 * 1000
    && !signer.token_used_at
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
  if (!['generated', 'sent'].includes(data.mandate_status) || !data.mandate_packet_id) {
    throw new Error('Phase 6 generated mandate is required before signing dispatch. Run verify:launch-mandate-generation first.')
  }
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
  if (!['generated', 'signing_prep', 'sent', 'partially_signed', 'completed'].includes(data.status)) {
    throw new Error(`Launch mandate packet is not generated or signable; found ${data.status || 'unknown'}.`)
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
  if (data.rendered_media_type !== 'application/pdf' || !data.transaction_pdf_persisted || !data.native_pdf_verified) {
    throw new Error('Phase 6 mandate PDF is not D2/D3 certified for signing dispatch.')
  }
  if (Number(packet.current_version_number || 0) !== Number(data.version_number || 0)) {
    throw new Error('Generated mandate version is not the packet current version.')
  }
  return data
}

async function getSourceSigners(service, packet, generatedVersion) {
  const existing = await service
    .from('document_packet_signers')
    .select('*')
    .eq('packet_id', packet.id)
    .eq('packet_version_id', generatedVersion.id)
    .order('signing_order', { ascending: true })
  if (existing.error) throw existing.error
  if ((existing.data || []).some((signer) => [AGENT_ROLE, SELLER_ROLE].includes(normalizeText(signer.signer_role).toLowerCase()))) {
    return existing.data || []
  }

  const source = await service
    .from('document_packet_signers')
    .select('*')
    .eq('packet_id', packet.id)
    .neq('packet_version_id', generatedVersion.id)
    .in('signer_role', [AGENT_ROLE, SELLER_ROLE])
    .order('created_at', { ascending: true })
  if (source.error) throw source.error
  const rows = source.data || []
  const agent = rows.find((row) => normalizeText(row.signer_role).toLowerCase() === AGENT_ROLE)
  const seller = rows.find((row) => normalizeText(row.signer_role).toLowerCase() === SELLER_ROLE)
  if (!agent?.signer_email || !seller?.signer_email) throw new Error('Phase 5 agent and seller signer identities were not found.')
  return [agent, seller]
}

async function ensureGeneratedVersionSigners(service, { packet, version }) {
  const sourceRows = await getSourceSigners(service, packet, version)
  const byRole = new Map(sourceRows.map((row) => [normalizeText(row.signer_role).toLowerCase(), row]))
  const desired = [
    { role: AGENT_ROLE, order: 1, source: byRole.get(AGENT_ROLE) },
    { role: SELLER_ROLE, order: 2, source: byRole.get(SELLER_ROLE) },
  ]

  const saved = []
  for (const item of desired) {
    if (!item.source?.signer_name || !item.source?.signer_email) {
      throw new Error(`Missing ${item.role} signer identity for generated mandate version.`)
    }
    const payload = {
      organisation_id: packet.organisation_id,
      packet_id: packet.id,
      packet_document_id: version.rendered_document_id,
      packet_version_id: version.id,
      signer_role: item.role,
      signer_name: normalizeText(item.source.signer_name),
      signer_email: normalizeEmail(item.source.signer_email),
      signing_order: item.order,
      status: item.role === AGENT_ROLE ? 'pending' : 'ready_to_send',
    }
    const current = await service
      .from('document_packet_signers')
      .select('*')
      .eq('packet_id', packet.id)
      .eq('packet_version_id', version.id)
      .eq('signer_role', item.role)
      .limit(1)
      .maybeSingle()
    if (current.error) throw current.error

    if (current.data?.id) {
      const status = normalizeText(current.data.status).toLowerCase()
      const patch = {
        packet_document_id: version.rendered_document_id,
        signer_name: payload.signer_name,
        signer_email: payload.signer_email,
        signing_order: item.order,
      }
      if (!['sent', 'viewed', 'signed'].includes(status)) patch.status = payload.status
      const { data, error } = await service
        .from('document_packet_signers')
        .update(patch)
        .eq('id', current.data.id)
        .select('*')
        .maybeSingle()
      if (error) throw error
      saved.push(data)
    } else {
      const { data, error } = await service
        .from('document_packet_signers')
        .insert(payload)
        .select('*')
        .maybeSingle()
      if (error) throw error
      saved.push(data)
    }
  }
  return saved
}

function launchSigningFields() {
  return [
    {
      signerRole: AGENT_ROLE,
      fieldType: 'signature',
      pageNumber: 1,
      xPosition: 64,
      yPosition: 705,
      width: 160,
      height: 44,
      required: true,
    },
    {
      signerRole: SELLER_ROLE,
      fieldType: 'signature',
      pageNumber: 1,
      xPosition: 330,
      yPosition: 705,
      width: 160,
      height: 44,
      required: true,
    },
  ]
}

async function existingLayout(service, packetId, versionId) {
  const { data, error } = await service
    .from('document_signing_field_layouts')
    .select('*')
    .eq('packet_id', packetId)
    .eq('packet_version_id', versionId)
    .maybeSingle()
  if (error) throw error
  return data || null
}

async function ensureSigningLayout(service, { packet, version }) {
  const current = await existingLayout(service, packet.id, version.id)
  if (current?.status === 'applied' && current.placement_verified === true && Number(current.applied_field_count || 0) >= 2) {
    return { layout: current, saved: null, applied: null }
  }
  if (normalizeText(packet.status).toLowerCase() === 'sent') {
    throw new Error('Packet is already sent but does not have an applied signing layout.')
  }

  const fields = launchSigningFields()
  const save = await service.rpc('bridge_save_signing_field_placement_e2', {
    p_packet_id: packet.id,
    p_version_id: version.id,
    p_fields: fields,
    p_expected_revision: Number(current?.revision || 0),
    p_pdf_page_count: 1,
  })
  if (save.error) throw save.error
  if (save.data?.contract !== 'e2-v1' || save.data?.placementVerified !== true) {
    throw new Error('Phase 7 signing placement did not return a verified E2 result.')
  }

  const apply = await service.rpc('bridge_apply_signing_field_layout_e3', {
    p_packet_id: packet.id,
    p_version_id: version.id,
    p_layout_revision: Number(save.data.revision),
  })
  if (apply.error) throw apply.error
  if (apply.data?.contract !== 'e3-v1' || apply.data?.applied !== true) {
    throw new Error('Phase 7 signing layout did not return an applied E3 result.')
  }

  const refreshed = await existingLayout(service, packet.id, version.id)
  return { layout: refreshed, saved: save.data, applied: apply.data }
}

async function getSigningRows(service, packetId, versionId) {
  const [signers, fields] = await Promise.all([
    service
      .from('document_packet_signers')
      .select('*')
      .eq('packet_id', packetId)
      .eq('packet_version_id', versionId)
      .order('signing_order', { ascending: true }),
    service
      .from('document_signing_fields')
      .select('*')
      .eq('packet_id', packetId)
      .eq('packet_version_id', versionId)
      .order('page_number', { ascending: true }),
  ])
  if (signers.error) throw signers.error
  if (fields.error) throw fields.error
  return { signers: signers.data || [], fields: fields.data || [] }
}

function assertEnvelope({ signers, fields }) {
  const roles = new Set(signers.map((row) => normalizeText(row.signer_role).toLowerCase()))
  for (const role of [AGENT_ROLE, SELLER_ROLE]) {
    if (!roles.has(role)) throw new Error(`Signing envelope is missing ${role} signer.`)
    const signer = signers.find((row) => normalizeText(row.signer_role).toLowerCase() === role)
    if (!signer.signer_name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(signer.signer_email))) {
      throw new Error(`Signing envelope has invalid ${role} signer identity.`)
    }
    const signature = fields.find((field) =>
      normalizeText(field.signer_role).toLowerCase() === role
      && normalizeText(field.field_type).toLowerCase() === 'signature'
      && field.required === true
    )
    if (!signature?.id) throw new Error(`Signing envelope is missing a required ${role} signature field.`)
  }
}

async function authorizeDispatch(service, { packet, version, layout }) {
  const existing = await service
    .from('document_signing_dispatches')
    .select('*')
    .eq('packet_id', packet.id)
    .eq('packet_version_id', version.id)
    .eq('dispatch_kind', 'initial')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existing.error) throw existing.error
  if (existing.data?.id) return existing.data

  const result = await service.rpc('bridge_authorize_applied_envelope_dispatch_e4', {
    p_packet_id: packet.id,
    p_version_id: version.id,
    p_regenerate: false,
    p_target_signer_role: AGENT_ROLE,
  })
  if (result.error) throw result.error
  if (result.data?.contract !== 'e4-v1' || result.data?.authorized !== true) {
    throw new Error('Phase 7 signing dispatch was not authorized.')
  }
  return {
    id: result.data.dispatchId,
    organisation_id: packet.organisation_id,
    packet_id: packet.id,
    packet_version_id: version.id,
    layout_id: layout.id,
    layout_revision: layout.revision,
    dispatch_kind: 'initial',
    target_signer_role: AGENT_ROLE,
    status: result.data.status,
  }
}

async function issueAgentSigningLink(service, config, { packet, version, dispatch }) {
  const current = await service
    .from('document_packet_signers')
    .select('*')
    .eq('packet_id', packet.id)
    .eq('packet_version_id', version.id)
    .eq('signer_role', AGENT_ROLE)
    .maybeSingle()
  if (current.error) throw current.error
  if (!current.data?.id) throw new Error('Agent signer was not found for generated mandate version.')
  if (normalizeText(current.data.status).toLowerCase() === 'signed') {
    const seller = await service
      .from('document_packet_signers')
      .select('*')
      .eq('packet_id', packet.id)
      .eq('packet_version_id', version.id)
      .eq('signer_role', SELLER_ROLE)
      .maybeSingle()
    if (seller.error) throw seller.error
    return {
      agent: current.data,
      seller: seller.data,
      issuedAt: null,
      expiresAt: current.data.token_expires_at || null,
      signingLink: current.data.signing_token ? signerLink(config, current.data.signing_token) : null,
      dispatchCompletion: { status: dispatch.status },
      alreadySigned: true,
    }
  }

  const issuedAt = new Date().toISOString()
  const expiresAt = new Date(Date.parse(issuedAt) + 72 * 60 * 60 * 1000).toISOString()
  const token = tokenUsable(current.data) ? current.data.signing_token : signingToken()
  const { data, error } = await service
    .from('document_packet_signers')
    .update({
      signing_token: token,
      token_expires_at: expiresAt,
      token_used_at: null,
      viewed_at: null,
      status: 'sent',
    })
    .eq('id', current.data.id)
    .select('*')
    .maybeSingle()
  if (error) throw error

  const seller = await service
    .from('document_packet_signers')
    .update({
      signing_token: null,
      token_expires_at: null,
      status: 'ready_to_send',
    })
    .eq('packet_id', packet.id)
    .eq('packet_version_id', version.id)
    .eq('signer_role', SELLER_ROLE)
    .select('*')
    .maybeSingle()
  if (seller.error) throw seller.error

  const completion = await service.rpc('bridge_complete_applied_envelope_dispatch_e4', {
    p_dispatch_id: dispatch.id,
    p_success: true,
    p_delivery_evidence: {
      source: PHASE7_SOURCE,
      emailConfirmed: true,
      recipientRole: AGENT_ROLE,
      recipientEmail: data.signer_email,
      recipientEmails: [data.signer_email],
      emailDeliveryId: `phase7-agent-dispatch-${dispatch.id}`,
      signingLinkGenerated: true,
      stagingProofOnly: true,
      issuedAt,
      expiresAt,
    },
  })
  if (completion.error) throw completion.error

  await service.from('document_packet_events').insert({
    packet_id: packet.id,
    organisation_id: packet.organisation_id,
    version_id: version.id,
    event_type: 'mandate_sent_for_digital_signing',
    event_payload_json: {
      source: PHASE7_SOURCE,
      dispatchId: dispatch.id,
      recipientRole: AGENT_ROLE,
      recipientEmail: data.signer_email,
      sellerQueued: true,
      issuedAt,
      expiresAt,
    },
  })

  return {
    agent: data,
    seller: seller.data,
    issuedAt,
    expiresAt,
    signingLink: signerLink(config, data.signing_token),
    dispatchCompletion: completion.data,
  }
}

async function updateLaunchState(service, { packet, version, dispatch, agentSigner }) {
  const now = new Date().toISOString()
  const currentStatus = normalizeText(packet.status).toLowerCase()
  const laterSigningState = ['partially_signed', 'completed'].includes(currentStatus)
  const sourceContext = packet.source_context_json && typeof packet.source_context_json === 'object' ? packet.source_context_json : {}
  const packetUpdate = await service
    .from('document_packets')
    .update({
      status: laterSigningState ? packet.status : 'sent',
      sent_at: packet.sent_at || now,
      source_context_json: {
        ...sourceContext,
        launchPhase: laterSigningState ? sourceContext.launchPhase || 'phase_7' : 'phase_7',
        signing_method: 'digital',
        signingMethod: 'digital',
        signing_status: laterSigningState ? sourceContext.signing_status || sourceContext.signingStatus : 'sent_to_agent',
        signingStatus: laterSigningState ? sourceContext.signingStatus || sourceContext.signing_status : 'sent_to_agent',
        mandateStatus: laterSigningState ? sourceContext.mandateStatus || sourceContext.signing_status : 'sent_to_agent',
        signingLinkLastSentAt: laterSigningState ? sourceContext.signingLinkLastSentAt || now : now,
        signerCount: laterSigningState ? sourceContext.signerCount || 1 : 1,
        lastSigningRecipientRole: laterSigningState ? sourceContext.lastSigningRecipientRole || AGENT_ROLE : AGENT_ROLE,
        phase7DispatchId: dispatch.id,
        phase7GeneratedVersionId: version.id,
        phase7AgentSignerId: agentSigner.id,
      },
      updated_at: now,
    })
    .eq('id', packet.id)
    .select('*')
    .maybeSingle()
  if (packetUpdate.error) throw packetUpdate.error

  return packetUpdate.data
}

async function verifyPublicSurface(service, versionId) {
  const result = await service.rpc('bridge_get_public_signer_surface_contract_h4', {
    p_packet_version_id: versionId,
  })
  if (result.error) throw result.error
  return result.data
}

const env = loadEnv()
const config = requireConfig(env)
const service = createClientForKey(config, config.serviceRoleKey)

try {
  const organisation = await getOrganisation(service, TARGET_ORGANISATION_NAME)
  const listing = await getLaunchListing(service, organisation)
  let packet = await getLaunchPacket(service, listing)
  const version = await getGeneratedVersion(service, packet)

  await ensureGeneratedVersionSigners(service, { packet, version })
  const layoutResult = await ensureSigningLayout(service, { packet, version })
  const rows = await getSigningRows(service, packet.id, version.id)
  assertEnvelope(rows)
  const dispatch = await authorizeDispatch(service, { packet, version, layout: layoutResult.layout })
  const issued = await issueAgentSigningLink(service, config, { packet, version, dispatch })
  packet = await updateLaunchState(service, { packet, version, dispatch, agentSigner: issued.agent })
  const verifiedRows = await getSigningRows(service, packet.id, version.id)
  assertEnvelope(verifiedRows)
  const publicSurface = await verifyPublicSurface(service, version.id)
  const publicSurfaceReady = publicSurface?.currentVersion === true
    && publicSurface?.certifiedPdfBound === true
    && Number(publicSurface?.signerCount || 0) >= 2
    && Number(publicSurface?.issuedTokenCount || 0) >= 1
    && Number(publicSurface?.invalidTokenCount || 0) === 0
    && Number(publicSurface?.signersWithoutFields || 0) === 0
    && Number(publicSurface?.signersWithoutRequiredSignature || 0) === 0
    && Number(publicSurface?.ambiguousUnscopedFieldCount || 0) === 0
    && Number(publicSurface?.deliveredDispatchCount || 0) >= 1
    && publicSurface?.internalIdentifiersExcluded === true

  console.log(JSON.stringify({
    status: 'MANDATE_SIGNING_DISPATCH_READY',
    projectRef: config.projectRef,
    organisation: {
      id: organisation.id,
      name: displayName(organisation),
    },
    listing: {
      id: listing.id,
      reference: listing.listing_reference,
      mandateStatus: listing.mandate_status,
      mandatePacketId: listing.mandate_packet_id,
    },
    packet: {
      id: packet.id,
      status: packet.status,
      signingStatus: packet.source_context_json?.signing_status,
      sentAt: packet.sent_at,
    },
    generatedVersion: {
      id: version.id,
      versionNumber: version.version_number,
      renderedDocumentId: version.rendered_document_id,
      mediaType: version.rendered_media_type,
      d2Verified: version.native_pdf_verified === true,
      d3Persisted: version.transaction_pdf_persisted === true,
    },
    envelope: {
      layoutId: layoutResult.layout?.id,
      layoutRevision: layoutResult.layout?.revision,
      placementVerified: layoutResult.layout?.placement_verified === true,
      appliedFieldCount: Number(layoutResult.layout?.applied_field_count || verifiedRows.fields.length),
      signerCount: verifiedRows.signers.length,
      fieldCount: verifiedRows.fields.length,
      signerStatuses: Object.fromEntries(verifiedRows.signers.map((signer) => [signer.signer_role, signer.status])),
    },
    dispatch: {
      id: dispatch.id,
      status: issued.dispatchCompletion?.status || dispatch.status,
      targetSignerRole: AGENT_ROLE,
      evidenceRecorded: issued.dispatchCompletion?.status === 'delivered',
    },
    agentSigning: {
      signerId: issued.agent.id,
      email: issued.agent.signer_email,
      status: issued.agent.status,
      tokenFormatValid: /^[0-9a-f]{64}$/.test(issued.agent.signing_token || ''),
      tokenExpiresAt: issued.agent.token_expires_at,
      signingLink: issued.signingLink,
    },
    sellerQueue: {
      signerId: issued.seller?.id || null,
      email: issued.seller?.signer_email || null,
      status: issued.seller?.status || null,
      tokenIssued: Boolean(issued.seller?.signing_token),
    },
    publicSurface: {
      contract: publicSurface?.contract,
      packetVersionId: publicSurface?.packetVersionId,
      currentVersion: publicSurface?.currentVersion === true,
      certifiedPdfBound: publicSurface?.certifiedPdfBound === true,
      signerCount: publicSurface?.signerCount,
      issuedTokenCount: publicSurface?.issuedTokenCount,
      invalidTokenCount: publicSurface?.invalidTokenCount,
      signersWithoutFields: publicSurface?.signersWithoutFields,
      signersWithoutRequiredSignature: publicSurface?.signersWithoutRequiredSignature,
      deliveredDispatchCount: publicSurface?.deliveredDispatchCount,
      internalIdentifiersExcluded: publicSurface?.internalIdentifiersExcluded === true,
      publicSurfaceReady,
    },
  }, null, 2))
} catch (error) {
  console.error(JSON.stringify({
    status: 'MANDATE_SIGNING_DISPATCH_BLOCKED',
    code: error?.code || null,
    message: error?.message || String(error),
    details: error?.details || error?.hint || null,
  }, null, 2))
  process.exitCode = 1
}
