import fs from 'node:fs'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const appRoot = fileURLToPath(new URL('..', import.meta.url))
const TARGET_PROJECT_REF = 'isdowlnollckzvltkasn'
const TARGET_ORGANISATION_NAME = 'Kingstons Real Estate'
const LAUNCH_LISTING_REFERENCE = 'PHASE3-LAUNCH-SELLER-ONBOARDING'
const PHASE9_SOURCE = 'phase_9_launch_mandate_completion'
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
  }
  config.projectRef = projectRefFromUrl(config.supabaseUrl)

  const missing = []
  for (const key of ['supabaseUrl', 'serviceRoleKey', 'anonKey']) {
    if (!config[key]) missing.push(key)
  }
  if (missing.length) throw new Error(`Missing mandate completion configuration: ${missing.join(', ')}`)
  if (config.projectRef !== TARGET_PROJECT_REF) {
    throw new Error(`Refusing to verify mandate completion on ${config.projectRef || 'unknown project'}; expected ${TARGET_PROJECT_REF}.`)
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

function tokenUsable(signer = {}) {
  const token = normalizeText(signer.signing_token)
  const expiry = Date.parse(signer.token_expires_at || '')
  return /^[0-9a-f]{64}$/.test(token)
    && ['sent', 'viewed'].includes(normalizeText(signer.status).toLowerCase())
    && Number.isFinite(expiry)
    && expiry > Date.now() + 55 * 60 * 1000
}

async function invokeFunction(config, functionName, body) {
  const response = await fetch(`${config.supabaseUrl.replace(/\/+$/, '')}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
      'Content-Type': 'application/json',
      'x-request-id': `phase-9-${functionName}-${Date.now()}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180_000),
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

async function ensureLaunchTransaction(service, { packet, listing }) {
  if (packet.transaction_id) {
    const { data, error } = await service
      .from('transactions')
      .select('id, transaction_reference, listing_id, mandate_packet_id, lifecycle_state, current_main_stage')
      .eq('id', packet.transaction_id)
      .maybeSingle()
    if (error) throw error
    if (data?.id) return { transaction: data, created: false, linkedPacket: false }
  }

  const idempotencyKey = `phase9:signed-mandate:${packet.id}`
  const existing = await service
    .from('transactions')
    .select('id, transaction_reference, listing_id, mandate_packet_id, lifecycle_state, current_main_stage')
    .eq('organisation_id', packet.organisation_id)
    .eq('creation_idempotency_key', idempotencyKey)
    .maybeSingle()
  if (existing.error) throw existing.error

  let transaction = existing.data
  let created = false
  if (!transaction?.id) {
    const reference = `PHASE9-${normalizeText(listing.listing_reference || listing.id).replace(/[^a-z0-9-]/gi, '-').slice(0, 40)}`
    const amount = Number(listing.asking_price || listing.estimated_value || 0) || null
    const insert = await service
      .from('transactions')
      .insert({
        organisation_id: packet.organisation_id,
        transaction_reference: reference,
        transaction_type: 'private_sale',
        property_type: listing.property_type || null,
        property_tenure: listing.property_structure_type || null,
        property_address_line_1: listing.address_line_1 || listing.formatted_address || listing.title || null,
        suburb: listing.suburb || null,
        city: listing.city || null,
        province: listing.province || null,
        property_description: listing.title || null,
        sales_price: amount,
        purchase_price: amount,
        finance_type: 'cash',
        cash_amount: amount,
        purchaser_type: 'individual',
        seller_type: listing.seller_type || 'individual',
        stage: 'Available',
        current_main_stage: 'AVAIL',
        next_action: 'Capture buyer offer or generate OTP.',
        comment: 'Launch verification transaction created from completed seller mandate.',
        assigned_agent_id: listing.assigned_agent_id || null,
        owner_user_id: listing.assigned_agent_id || null,
        is_active: true,
        lifecycle_state: 'active',
        listing_id: listing.id,
        mandate_packet_id: packet.id,
        seller_contact_id: listing.seller_contact_id || null,
        creation_idempotency_key: idempotencyKey,
      })
      .select('id, transaction_reference, listing_id, mandate_packet_id, lifecycle_state, current_main_stage')
      .maybeSingle()
    if (insert.error) throw insert.error
    transaction = insert.data
    created = true
  }

  const nextSourceContext = {
    ...(packet.source_context_json || {}),
    transactionId: transaction.id,
    transaction_id: transaction.id,
    phase9TransactionLinkedAt: new Date().toISOString(),
  }
  const packetUpdate = await service
    .from('document_packets')
    .update({
      transaction_id: transaction.id,
      source_context_json: nextSourceContext,
      updated_at: new Date().toISOString(),
    })
    .eq('id', packet.id)
    .select('*')
    .maybeSingle()
  if (packetUpdate.error) throw packetUpdate.error

  return { transaction, created, linkedPacket: true, packet: packetUpdate.data }
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
  if (!['partially_signed', 'completed'].includes(normalizeText(data.status).toLowerCase())) {
    throw new Error('Phase 8 seller dispatch is required before Phase 9. Run verify:launch-mandate-seller-dispatch first.')
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

async function completeSellerSigning(config, service, { packet, version, sellerSigner }) {
  const sellerStatus = normalizeText(sellerSigner.status).toLowerCase()
  const field = await getSignerField(service, { packetId: packet.id, versionId: version.id, role: SELLER_ROLE })

  if (sellerStatus === 'signed') {
    if (!normalizeText(version.final_signed_file_path) && /^[0-9a-f]{64}$/.test(normalizeText(sellerSigner.signing_token))) {
      const retryResult = await invokeFunction(config, 'signer-signing-action', {
        action: 'complete_signing',
        token: sellerSigner.signing_token,
      })
      return { completed: false, alreadySigned: true, finalisationRetried: true, actionResult: retryResult, field }
    }
    return { completed: false, alreadySigned: true, finalisationRetried: false, actionResult: null, field }
  }

  if (!tokenUsable(sellerSigner)) throw new Error('Seller signer does not have an active Phase 8 signing token.')

  await invokeFunction(config, 'resolve-signer-token', {
    action: 'resolve',
    token: sellerSigner.signing_token,
  })

  let appliedField = field
  let applied = normalizeText(field.status).toLowerCase() === 'completed'
  let asset = null
  if (!applied) {
    const assetResult = await invokeFunction(config, 'signer-signing-action', {
      action: 'upsert_asset',
      token: sellerSigner.signing_token,
      assetType: 'signature',
      dataUrl: SIGNATURE_DATA_URL,
    })
    asset = assetResult.asset || null
    const fieldResult = await invokeFunction(config, 'signer-signing-action', {
      action: 'apply_field',
      token: sellerSigner.signing_token,
      assetType: 'signature',
      fieldId: field.id,
      assetPath: asset?.path || null,
      completedByEmail: sellerSigner.signer_email,
    })
    appliedField = fieldResult.field || field
    applied = true
  }

  const actionResult = await invokeFunction(config, 'signer-signing-action', {
    action: 'complete_signing',
    token: sellerSigner.signing_token,
  })

  return { completed: true, alreadySigned: false, finalisationRetried: false, actionResult, field: appliedField, fieldApplied: applied, asset }
}

async function closeAlreadySignedSession(service, signer) {
  if (normalizeText(signer?.status).toLowerCase() !== 'signed') {
    return { attempted: false, signerId: signer?.id || null, signerRole: signer?.signer_role || null }
  }
  if (!/^[0-9a-f]{64}$/.test(normalizeText(signer?.signing_token))) {
    return { attempted: false, signerId: signer?.id || null, signerRole: signer?.signer_role || null, skippedReason: 'missing_token' }
  }
  const closed = await service.rpc('bridge_complete_controlled_signer_session_f2', {
    p_token: signer.signing_token,
  })
  if (closed.error) throw closed.error
  return {
    attempted: true,
    signerId: signer.id,
    signerRole: signer.signer_role,
    completed: closed.data?.completed === true,
    legacy: closed.data?.legacy === true,
    sessionId: closed.data?.sessionId || null,
  }
}

async function ensureFinalSurfaces(service, { packet, version, finalEvidence }) {
  if (!finalEvidence.artifactEvidence?.id) {
    return { attempted: false, skippedReason: 'final_artifact_missing' }
  }

  const results = {
    attempted: true,
    transactionPublication: null,
    surfaceCompletion: null,
    portalPublication: null,
  }

  if (!finalEvidence.transactionPublication?.id) {
    const publication = await service.rpc('bridge_publish_final_artifact_to_transaction_f3', {
      p_packet_version_id: version.id,
    })
    if (publication.error) throw publication.error
    results.transactionPublication = publication.data || null
  }

  if (!finalEvidence.completionReceipt?.id) {
    const completion = await service.rpc('bridge_complete_final_document_surfaces_f4', {
      p_packet_version_id: version.id,
    })
    if (completion.error) throw completion.error
    results.surfaceCompletion = completion.data || null
  }

  if (!finalEvidence.portalPublication?.id) {
    const portalSurface = normalizeText(packet.packet_type).toLowerCase() === 'mandate' ? 'seller_portal' : 'client_portal'
    const portalPublication = await service.rpc('bridge_record_final_publication_f3', {
      p_packet_version_id: version.id,
      p_portal_surface: portalSurface,
      p_verified_at: new Date().toISOString(),
    })
    if (portalPublication.error) throw portalPublication.error
    results.portalPublication = portalPublication.data || null
  }

  return results
}

async function getFinalEvidence(service, versionId) {
  const [evidenceResult, transactionPublicationResult, completionReceiptResult, portalPublicationResult, deliveriesResult, eventsResult] = await Promise.all([
    service
      .from('legal_final_artifact_evidence')
      .select('*')
      .eq('packet_version_id', versionId)
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    service
      .from('legal_final_transaction_publications')
      .select('*')
      .eq('packet_version_id', versionId)
      .maybeSingle(),
    service
      .from('legal_final_completion_receipts')
      .select('*')
      .eq('packet_version_id', versionId)
      .maybeSingle(),
    service
      .from('legal_final_artifact_publications')
      .select('*')
      .eq('packet_version_id', versionId)
      .maybeSingle(),
    service
      .from('legal_final_artifact_deliveries')
      .select('signer_id, status, provider_message_id, attempted_at, attempt_number, error_code')
      .eq('packet_version_id', versionId)
      .order('attempt_number', { ascending: false }),
    service
      .from('document_packet_events')
      .select('event_type, created_at')
      .eq('version_id', versionId)
      .in('event_type', [
        'all_signers_completed',
        'mandate_signed_by_seller',
        'final_signed_document_generated',
        'final_signed_generation_triggered',
        'final_signed_delivery_completed',
        'final_signed_delivery_incomplete',
      ])
      .order('created_at', { ascending: false }),
  ])
  for (const result of [evidenceResult, transactionPublicationResult, completionReceiptResult, portalPublicationResult, deliveriesResult, eventsResult]) {
    if (result.error) throw result.error
  }
  return {
    artifactEvidence: evidenceResult.data || null,
    transactionPublication: transactionPublicationResult.data || null,
    completionReceipt: completionReceiptResult.data || null,
    portalPublication: portalPublicationResult.data || null,
    deliveries: deliveriesResult.data || [],
    events: eventsResult.data || [],
  }
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

function latestDeliveryBySigner(deliveries = []) {
  const latest = new Map()
  for (const delivery of deliveries) {
    const signerId = normalizeText(delivery.signer_id)
    if (signerId && !latest.has(signerId)) latest.set(signerId, delivery)
  }
  return [...latest.values()]
}

const env = loadEnv()
const config = requireConfig(env)
const service = createClientForKey(config, config.serviceRoleKey)
const anonClient = createClientForKey(config, config.anonKey)

try {
  const organisation = await getOrganisation(service, TARGET_ORGANISATION_NAME)
  const listing = await getLaunchListing(service, organisation)
  let packet = await getLaunchPacket(service, listing)
  let version = await getGeneratedVersion(service, packet)
  let signers = await getSigners(service, packet.id, version.id)
  const agentSigner = signerByRole(signers, AGENT_ROLE)
  let sellerSigner = signerByRole(signers, SELLER_ROLE)
  if (normalizeText(agentSigner?.status).toLowerCase() !== 'signed') {
    throw new Error('Agent must be signed before Phase 9 can complete seller signing.')
  }
  if (!sellerSigner?.id) throw new Error('Seller signer is missing from the generated mandate version.')

  const agentSessionClosure = await closeAlreadySignedSession(service, agentSigner)
  packet = await getLaunchPacket(service, listing)
  version = await getGeneratedVersion(service, packet)
  signers = await getSigners(service, packet.id, version.id)
  sellerSigner = signerByRole(signers, SELLER_ROLE)

  const sellerCompletion = await completeSellerSigning(config, service, { packet, version, sellerSigner })
  packet = await getLaunchPacket(service, listing)
  version = await getGeneratedVersion(service, packet)
  const transactionResult = await ensureLaunchTransaction(service, { packet, listing })
  packet = transactionResult.packet || await getLaunchPacket(service, listing)
  signers = await getSigners(service, packet.id, version.id)
  const finalAgent = signerByRole(signers, AGENT_ROLE)
  const finalSeller = signerByRole(signers, SELLER_ROLE)
  const sellerField = await getSignerField(service, { packetId: packet.id, versionId: version.id, role: SELLER_ROLE })
  let finalEvidence = await getFinalEvidence(service, version.id)
  const surfaceRecovery = await ensureFinalSurfaces(service, { packet, version, finalEvidence })
  finalEvidence = await getFinalEvidence(service, version.id)
  const portalMandatePacket = await verifyPortal(anonClient, listing, packet.id)
  const latestDeliveries = latestDeliveryBySigner(finalEvidence.deliveries)

  const finalBindingValid = Boolean(finalEvidence.artifactEvidence)
    && normalizeText(finalEvidence.artifactEvidence.path) === normalizeText(version.final_signed_file_path)
    && normalizeText(finalEvidence.artifactEvidence.bucket) === normalizeText(version.final_signed_file_bucket)
    && normalizeText(finalEvidence.artifactEvidence.sha256)
    && Number(finalEvidence.artifactEvidence.byte_length || 0) > 0
  const publicationValid = Boolean(finalEvidence.transactionPublication)
    && normalizeText(finalEvidence.transactionPublication.artifact_path) === normalizeText(version.final_signed_file_path)
    && normalizeText(finalEvidence.transactionPublication.artifact_sha256) === normalizeText(finalEvidence.artifactEvidence?.sha256)
  const completionReceiptValid = Boolean(finalEvidence.completionReceipt)
    && finalEvidence.completionReceipt.transaction_visible === true
    && finalEvidence.completionReceipt.client_visible === true
    && finalEvidence.completionReceipt.canonical_satisfied === true
  const portalPublicationValid = Boolean(finalEvidence.portalPublication)
    && normalizeText(finalEvidence.portalPublication.artifact_path) === normalizeText(version.final_signed_file_path)
    && normalizeText(finalEvidence.portalPublication.artifact_sha256) === normalizeText(finalEvidence.artifactEvidence?.sha256)
  const allRequiredSigned = [finalAgent, finalSeller].every((signer) => normalizeText(signer?.status).toLowerCase() === 'signed')
  const packetCompleted = normalizeText(packet.status).toLowerCase() === 'completed'
    && normalizeText(packet.source_context_json?.signing_status).toLowerCase() === 'completed'
    && Boolean(packet.completed_at)
  const sellerFieldCompleted = normalizeText(sellerField.status).toLowerCase() === 'completed'

  const blockers = []
  if (!packetCompleted) blockers.push('packet_not_completed')
  if (!allRequiredSigned) blockers.push('required_signers_not_signed')
  if (!sellerFieldCompleted) blockers.push('seller_signature_field_not_completed')
  if (!finalBindingValid) blockers.push('final_artifact_evidence_invalid')
  if (!publicationValid) blockers.push('transaction_publication_invalid')
  if (!completionReceiptValid) blockers.push('completion_receipt_invalid')
  if (!portalPublicationValid) blockers.push('portal_publication_invalid')
  if (portalMandatePacket?.id !== packet.id) blockers.push('seller_portal_packet_not_resolved')

  const status = blockers.length ? 'MANDATE_COMPLETION_BLOCKED' : 'MANDATE_COMPLETION_READY'
  const output = {
    status,
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
      completedAt: packet.completed_at,
      finalSignedAt: packet.source_context_json?.finalSignedAt,
    },
    generatedVersion: {
      id: version.id,
      versionNumber: version.version_number,
      finalisedAt: version.finalised_at,
      finalSignedDocumentId: version.final_signed_document_id,
      finalSignedFileName: version.final_signed_file_name,
      finalSignedFilePath: version.final_signed_file_path,
      finalSignedFileBucket: version.final_signed_file_bucket,
    },
    transaction: {
      id: transactionResult.transaction?.id || null,
      reference: transactionResult.transaction?.transaction_reference || null,
      created: transactionResult.created,
      linkedPacket: transactionResult.linkedPacket,
    },
    sellerSigning: {
      signerId: finalSeller?.id,
      email: normalizeEmail(finalSeller?.signer_email),
      status: finalSeller?.status,
      signedAt: finalSeller?.signed_at,
      completedNow: sellerCompletion.completed,
      alreadySigned: sellerCompletion.alreadySigned,
      finalisationRetried: sellerCompletion.finalisationRetried,
      signatureFieldId: sellerField.id,
      signatureFieldStatus: sellerField.status,
    },
    controlledSessions: {
      agentClosureAttempted: agentSessionClosure.attempted,
      agentClosureCompleted: agentSessionClosure.completed || false,
      agentClosureLegacy: agentSessionClosure.legacy || false,
      agentSessionId: agentSessionClosure.sessionId || null,
    },
    surfaceRecovery: {
      attempted: surfaceRecovery.attempted,
      transactionPublicationRecovered: Boolean(surfaceRecovery.transactionPublication),
      completionReceiptRecovered: Boolean(surfaceRecovery.surfaceCompletion),
      portalPublicationRecovered: Boolean(surfaceRecovery.portalPublication),
      skippedReason: surfaceRecovery.skippedReason || null,
    },
    signers: {
      agent: {
        signerId: finalAgent?.id,
        status: finalAgent?.status,
        signedAt: finalAgent?.signed_at,
      },
      seller: {
        signerId: finalSeller?.id,
        status: finalSeller?.status,
        signedAt: finalSeller?.signed_at,
      },
    },
    finalArtifact: {
      evidenceReady: finalBindingValid,
      sha256: finalEvidence.artifactEvidence?.sha256 || null,
      byteLength: finalEvidence.artifactEvidence?.byte_length || null,
      path: finalEvidence.artifactEvidence?.path || null,
      generatedAt: finalEvidence.artifactEvidence?.generated_at || null,
    },
    publication: {
      transactionPublicationReady: publicationValid,
      completionReceiptReady: completionReceiptValid,
      portalPublicationReady: portalPublicationValid,
      transactionDocumentId: finalEvidence.transactionPublication?.document_id || null,
      portalSurface: finalEvidence.portalPublication?.portal_surface || null,
    },
    finalDelivery: {
      recipientCount: latestDeliveries.length,
      sentCount: latestDeliveries.filter((delivery) => normalizeText(delivery.status).toLowerCase() === 'sent').length,
      statuses: latestDeliveries.map((delivery) => ({
        signerId: delivery.signer_id,
        status: delivery.status,
        attemptedAt: delivery.attempted_at,
        errorCode: delivery.error_code || null,
      })),
    },
    portalVerification: {
      mandatePacketResolved: portalMandatePacket?.id === packet.id,
      mandatePacketState: portalMandatePacket?.state,
      signedAt: portalMandatePacket?.signedAt || null,
    },
    events: finalEvidence.events.map((event) => ({
      eventType: event.event_type,
      createdAt: event.created_at,
    })),
    blockers,
  }

  console.log(JSON.stringify(output, null, 2))
  if (blockers.length) process.exitCode = 1
} catch (error) {
  console.error(JSON.stringify({
    status: 'MANDATE_COMPLETION_BLOCKED',
    code: error?.code || null,
    message: error?.message || String(error),
    details: error?.details || null,
  }, null, 2))
  process.exitCode = 1
}
