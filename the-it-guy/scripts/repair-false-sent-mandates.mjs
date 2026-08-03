import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return {}
  return Object.fromEntries(
    fs.readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const index = line.indexOf('=')
        return [line.slice(0, index), line.slice(index + 1).replace(/^["']|["']$/g, '')]
      }),
  )
}

function text(value) {
  return String(value ?? '').trim()
}

function key(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function truthyText(...values) {
  return values.map(text).find(Boolean) || ''
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value))
}

function parseArgs(argv) {
  const args = {
    apply: false,
    allowNonStaging: false,
    leadIds: [],
    limit: 500,
  }
  for (const arg of argv) {
    if (arg === '--apply') args.apply = true
    else if (arg === '--allow-non-staging') args.allowNonStaging = true
    else if (arg.startsWith('--lead=')) args.leadIds.push(text(arg.slice('--lead='.length)))
    else if (arg.startsWith('--limit=')) args.limit = Math.max(1, Math.min(Number(arg.slice('--limit='.length)) || 500, 2000))
  }
  args.leadIds = args.leadIds.filter(isUuid)
  return args
}

function hasConfirmedSendJob(job) {
  const result = record(job?.result_json)
  const metadata = record(job?.metadata_json)
  const delivery = Object.keys(record(result.delivery)).length ? record(result.delivery) : record(metadata.delivery)
  const status = key(job?.status)
  const deliveryStatus = key(delivery.status || result.deliveryStatus || metadata.deliveryStatus)
  return Boolean(
    key(job?.job_type) === 'send_for_signature' &&
      ['succeeded', 'success', 'completed', 'complete', 'sent', 'delivered'].includes(status) &&
      (
        result.emailConfirmed === true ||
        metadata.emailConfirmed === true ||
        truthyText(result.emailId, result.deliveryId, metadata.emailId, metadata.deliveryId, delivery.id, delivery.providerMessageId, delivery.provider_message_id) ||
        ['sent', 'delivered', 'accepted', 'queued'].includes(deliveryStatus)
      ),
  )
}

function hasSignerDeliveryEvidence(signer) {
  const status = key(signer?.status)
  return Boolean(
    ['sent', 'viewed', 'signed', 'completed', 'complete'].includes(status) ||
      truthyText(signer?.sent_at, signer?.sentAt, signer?.viewed_at, signer?.viewedAt, signer?.signed_at, signer?.signedAt, signer?.token_used_at, signer?.tokenUsedAt),
  )
}

function packetHasGeneratedVersion(packet, versions = []) {
  const packetStatus = key(packet?.status)
  if (['generated', 'pdf_generated', 'ready_to_send', 'ready', 'signing_prep', 'signing_prepared'].includes(packetStatus)) return true
  return versions.some((version) => (
    Number(version.version_number) === Number(packet?.current_version_number || version.version_number) &&
      key(version.render_status) === 'generated' &&
      truthyText(version.rendered_document_id, version.rendered_file_path) &&
      key(version.rendered_media_type) === 'application_pdf'
  ))
}

function hasDeliveryEvidence({ packet, signers, jobs }) {
  const sourceContext = record(packet?.source_context_json)
  return Boolean(
    truthyText(
      packet?.sent_at,
      packet?.completed_at,
      sourceContext.mandateSentAt,
      sourceContext.mandate_sent_at,
      sourceContext.mandateSigningLink,
      sourceContext.mandate_signing_link,
      sourceContext.signingDeliveryLastAt,
      sourceContext.signing_delivery_last_at,
      sourceContext.signingDeliveryLastProviderMessageId,
      sourceContext.signing_delivery_last_provider_message_id,
    ) ||
      signers.some(hasSignerDeliveryEvidence) ||
      jobs.some(hasConfirmedSendJob),
  )
}

function isFalseSentCandidate({ lead, packet, signers, jobs, listings }) {
  if (!packet?.id || hasDeliveryEvidence({ packet, signers, jobs })) return false
  const leadSignals = [lead.stage, lead.status, lead.current_stage].map(key)
  const packetStatus = key(packet.status)
  const listingSignals = listings.map((listing) => key(listing.mandate_status))
  return Boolean(
    leadSignals.some((signal) => signal === 'mandate_sent' || signal === 'sent_for_signature') ||
      ['sent', 'partially_signed', 'completed'].includes(packetStatus) ||
      listingSignals.some((signal) => ['sent', 'viewed', 'signed', 'mandate_sent', 'sent_for_signature'].includes(signal)),
  )
}

function removeStaleMandateDeliveryFields(formData) {
  const next = { ...record(formData) }
  for (const field of [
    'mandateSentAt',
    'mandate_sent_at',
    'mandateSigningLink',
    'mandate_signing_link',
    'mandateSignerLink',
    'mandate_signer_link',
  ]) {
    delete next[field]
  }
  return next
}

function buildRepairPlan(row) {
  const generated = packetHasGeneratedVersion(row.packet, row.versions)
  const nextLead = generated
    ? { stage: 'Mandate Sent', status: 'Draft' }
    : { stage: 'Seller Onboarding Submitted', status: 'Submitted' }
  const nextPacketStatus = generated ? 'generated' : 'draft'
  const listingMandateStatus = generated ? 'generated' : 'in_progress'

  const packetPatch = ['sent', 'partially_signed', 'completed'].includes(key(row.packet.status))
    ? { status: nextPacketStatus, sent_at: null, completed_at: null }
    : null
  const leadPatch = key(row.lead.stage) !== key(nextLead.stage) || key(row.lead.status) !== key(nextLead.status)
    ? { ...nextLead, updated_at: new Date().toISOString() }
    : null
  const listingPatches = row.listings
    .filter((listing) => ['sent', 'viewed', 'signed', 'mandate_sent', 'sent_for_signature'].includes(key(listing.mandate_status)))
    .map((listing) => ({
      id: listing.id,
      patch: {
        mandate_status: listingMandateStatus,
        updated_at: new Date().toISOString(),
      },
    }))
  const onboardingPatches = row.onboardings
    .map((onboarding) => {
      const cleaned = removeStaleMandateDeliveryFields(onboarding.form_data)
      return JSON.stringify(cleaned) === JSON.stringify(record(onboarding.form_data))
        ? null
        : { id: onboarding.id, patch: { form_data: cleaned, updated_at: new Date().toISOString() } }
    })
    .filter(Boolean)

  return {
    leadId: row.lead.lead_id,
    packetId: row.packet.id,
    generated,
    nextLead,
    nextPacketStatus,
    listingMandateStatus,
    leadPatch,
    packetPatch,
    listingPatches,
    onboardingPatches,
  }
}

async function fetchRows(client, args) {
  let leadQuery = client
    .from('leads')
    .select('lead_id,organisation_id,stage,status,current_stage,mandate_packet_id,listing_id,seller_onboarding_status,updated_at')
    .not('mandate_packet_id', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(args.limit)
  if (args.leadIds.length) leadQuery = leadQuery.in('lead_id', args.leadIds)
  const leadsResult = await leadQuery
  assert.ifError(leadsResult.error)

  const leads = leadsResult.data || []
  const packetIds = [...new Set(leads.map((lead) => text(lead.mandate_packet_id)).filter(Boolean))]
  const listingIds = [...new Set(leads.map((lead) => text(lead.listing_id)).filter(Boolean))]
  if (!packetIds.length) return []

  const [packetsResult, versionsResult, signersResult, jobsResult, listingsByPacketResult, listingsByIdResult] = await Promise.all([
    client.from('document_packets').select('id,organisation_id,packet_type,lead_id,status,current_version_number,source_context_json,sent_at,completed_at,updated_at').in('id', packetIds),
    client.from('document_packet_versions').select('id,packet_id,version_number,render_status,rendered_document_id,rendered_file_path,rendered_media_type,updated_at').in('packet_id', packetIds),
    client.from('document_packet_signers').select('id,packet_id,status,signing_token,token_used_at,viewed_at,signed_at,updated_at').in('packet_id', packetIds),
    client.from('legal_document_jobs').select('id,packet_id,job_type,status,result_json,metadata_json,dispatch_id,updated_at').in('packet_id', packetIds).eq('job_type', 'send_for_signature'),
    client.from('private_listings').select('id,originating_crm_lead_id,seller_lead_id,mandate_packet_id,mandate_status,listing_status,updated_at').in('mandate_packet_id', packetIds),
    listingIds.length
      ? client.from('private_listings').select('id,originating_crm_lead_id,seller_lead_id,mandate_packet_id,mandate_status,listing_status,updated_at').in('id', listingIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  for (const result of [packetsResult, versionsResult, signersResult, jobsResult, listingsByPacketResult, listingsByIdResult]) {
    assert.ifError(result.error)
  }

  const packetById = new Map((packetsResult.data || []).map((packet) => [packet.id, packet]))
  const groupByPacket = (rows) => new Map(packetIds.map((id) => [id, rows.filter((row) => row.packet_id === id)]))
  const versionsByPacket = groupByPacket(versionsResult.data || [])
  const signersByPacket = groupByPacket(signersResult.data || [])
  const jobsByPacket = groupByPacket(jobsResult.data || [])
  const allListings = [...(listingsByPacketResult.data || []), ...(listingsByIdResult.data || [])]
  const listingMap = new Map(allListings.map((listing) => [listing.id, listing]))
  const listingRows = [...listingMap.values()]
  const listingIdsForOnboarding = listingRows.map((listing) => listing.id).filter(Boolean)
  const onboardingsResult = listingIdsForOnboarding.length
    ? await client.from('private_listing_seller_onboarding').select('id,private_listing_id,form_data,status,updated_at').in('private_listing_id', listingIdsForOnboarding)
    : { data: [], error: null }
  assert.ifError(onboardingsResult.error)

  return leads.map((lead) => {
    const packetId = text(lead.mandate_packet_id)
    const listings = listingRows.filter((listing) => (
      text(listing.mandate_packet_id) === packetId ||
      text(listing.id) === text(lead.listing_id) ||
      text(listing.originating_crm_lead_id) === text(lead.lead_id) ||
      text(listing.seller_lead_id) === text(lead.lead_id)
    ))
    return {
      lead,
      packet: packetById.get(packetId) || null,
      versions: versionsByPacket.get(packetId) || [],
      signers: signersByPacket.get(packetId) || [],
      jobs: jobsByPacket.get(packetId) || [],
      listings,
      onboardings: (onboardingsResult.data || []).filter((row) => listings.some((listing) => listing.id === row.private_listing_id)),
    }
  })
}

async function applyPlan(client, plan) {
  if (plan.packetPatch) {
    const result = await client.from('document_packets').update(plan.packetPatch).eq('id', plan.packetId)
    assert.ifError(result.error)
  }
  if (plan.leadPatch) {
    const result = await client.from('leads').update(plan.leadPatch).eq('lead_id', plan.leadId)
    assert.ifError(result.error)
  }
  for (const item of plan.listingPatches) {
    const result = await client.from('private_listings').update(item.patch).eq('id', item.id)
    assert.ifError(result.error)
  }
  for (const item of plan.onboardingPatches) {
    const result = await client.from('private_listing_seller_onboarding').update(item.patch).eq('id', item.id)
    assert.ifError(result.error)
  }
  const activityResult = await client.from('lead_activities').insert({
    organisation_id: plan.organisationId,
    lead_id: plan.leadId,
    agent_id: null,
    activity_type: 'Data Repair',
    activity_note: plan.generated
      ? 'Corrected stale mandate sent state: mandate packet is generated but has no confirmed delivery evidence. Lead returned to mandate draft/send-ready state.'
      : 'Corrected stale mandate sent state: mandate packet is still draft and has no confirmed delivery evidence. Lead returned to onboarding-submitted state.',
    outcome: 'False mandate sent state repaired',
  })
  assert.ifError(activityResult.error)
}

const args = parseArgs(process.argv.slice(2))
const env = { ...loadEnvFile('.env'), ...loadEnvFile('.env.staging.local'), ...process.env }
const supabaseUrl = truthyText(env.SUPABASE_URL, env.VITE_SUPABASE_URL)
const serviceRoleKey = text(env.SUPABASE_SERVICE_ROLE_KEY)
assert.ok(supabaseUrl, 'SUPABASE_URL or VITE_SUPABASE_URL is required.')
assert.ok(serviceRoleKey, 'SUPABASE_SERVICE_ROLE_KEY is required.')
if (!args.allowNonStaging) {
  assert.ok(
    supabaseUrl.includes('isdowlnollckzvltkasn'),
    'This repair is restricted to canonical staging unless --allow-non-staging is provided.',
  )
}

const require = createRequire(path.resolve('package.json'))
const { createClient } = require('@supabase/supabase-js')
const client = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const rows = await fetchRows(client, args)
const candidates = rows.filter(isFalseSentCandidate)
const plans = candidates.map((row) => ({
  ...buildRepairPlan(row),
  organisationId: row.lead.organisation_id,
  current: {
    leadStage: row.lead.stage,
    leadStatus: row.lead.status,
    packetStatus: row.packet?.status || null,
    listingStatuses: row.listings.map((listing) => ({
      id: listing.id,
      mandateStatus: listing.mandate_status,
      listingStatus: listing.listing_status,
    })),
    signerStatuses: row.signers.map((signer) => signer.status),
    sendJobs: row.jobs.map((job) => ({
      id: job.id,
      status: job.status,
      confirmed: hasConfirmedSendJob(job),
    })),
  },
}))

if (args.apply) {
  for (const plan of plans) {
    await applyPlan(client, plan)
  }
}

const verificationRows = args.apply && plans.length
  ? await fetchRows(client, { ...args, leadIds: plans.map((plan) => plan.leadId), limit: plans.length })
  : []
const remainingCandidates = verificationRows.filter(isFalseSentCandidate)

console.log(JSON.stringify({
  mode: args.apply ? 'apply' : 'dry-run',
  scannedLeads: rows.length,
  candidateCount: candidates.length,
  repairedCount: args.apply ? plans.length : 0,
  remainingCandidateCount: args.apply ? remainingCandidates.length : undefined,
  candidates: plans.map((plan) => ({
    leadId: plan.leadId,
    packetId: plan.packetId,
    generated: plan.generated,
    current: plan.current,
    nextLead: plan.nextLead,
    nextPacketStatus: plan.nextPacketStatus,
    listingPatches: plan.listingPatches,
    onboardingPatchCount: plan.onboardingPatches.length,
    willMutate: Boolean(plan.leadPatch || plan.packetPatch || plan.listingPatches.length || plan.onboardingPatches.length),
  })),
}, null, 2))
