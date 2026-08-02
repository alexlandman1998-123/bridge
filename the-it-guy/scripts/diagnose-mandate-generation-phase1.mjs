import { createClient } from '@supabase/supabase-js'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'

function arg(name, fallback = '') {
  const inlinePrefix = `--${name}=`
  const inline = process.argv.find((item) => String(item || '').startsWith(inlinePrefix))
  if (inline) return String(inline.slice(inlinePrefix.length) || '').trim()
  const index = process.argv.indexOf(`--${name}`)
  if (index === -1) return fallback
  return String(process.argv[index + 1] || '').trim()
}

function isUuid(value = '') {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim())
}

function text(value = '') {
  return String(value || '').trim()
}

function keys(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value).sort() : []
}

function publicError(error) {
  if (!error) return null
  return {
    code: text(error.code) || null,
    message: text(error.message || error).slice(0, 300) || null,
    details: text(error.details).slice(0, 300) || null,
  }
}

async function timed(label, task, timeoutMs = 20_000) {
  const startedAt = Date.now()
  let timeoutId = null
  try {
    const result = await Promise.race([
      task(),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(Object.assign(new Error(`${label} timed out after ${timeoutMs}ms`), { code: 'PHASE1_TIMEOUT' })), timeoutMs)
      }),
    ])
    return {
      label,
      ok: true,
      durationMs: Date.now() - startedAt,
      ...result,
    }
  } catch (error) {
    return {
      label,
      ok: false,
      durationMs: Date.now() - startedAt,
      error: publicError(error),
      data: [],
    }
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

const leadId = arg('lead-id')
const listingId = arg('listing-id')
const packetId = arg('packet-id')
const organisationId = arg('organisation-id')
const outputPath = arg('output')
const positionalUuids = process.argv.filter(isUuid)
const resolvedLeadId = isUuid(leadId) ? leadId : positionalUuids[0] || ''
const resolvedListingId = isUuid(listingId) ? listingId : positionalUuids[1] || ''
const resolvedOrganisationId = isUuid(organisationId) ? organisationId : positionalUuids[2] || ''
const resolvedPacketId = isUuid(packetId) ? packetId : ''

if (!isUuid(resolvedPacketId) && !isUuid(resolvedLeadId)) {
  console.error('Usage: node scripts/diagnose-mandate-generation-phase1.mjs --lead-id <uuid> [--listing-id <uuid>] [--packet-id <uuid>] [--organisation-id <uuid>]')
  process.exit(1)
}

const supabaseUrl = text(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)
const serviceRoleKey = text(process.env.SUPABASE_SERVICE_ROLE_KEY)
if (!supabaseUrl || !serviceRoleKey) {
  console.error('SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
  process.exit(1)
}

const client = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const packetQuery = await timed('document_packets', async () => {
  let query = client
    .from('document_packets')
    .select('id, organisation_id, packet_type, status, current_version_number, template_id, template_key_snapshot, lead_id, transaction_id, created_at, updated_at, source_context_json')
    .eq('packet_type', 'mandate')
    .order('updated_at', { ascending: false })
    .limit(25)

  if (isUuid(resolvedPacketId)) query = query.eq('id', resolvedPacketId)
  else query = query.eq('lead_id', resolvedLeadId)
  if (isUuid(resolvedOrganisationId)) query = query.eq('organisation_id', resolvedOrganisationId)

  const { data, error } = await query
  if (error) throw error
  return { data: data || [] }
})

const packetIds = (packetQuery.data || []).map((row) => row.id).filter(isUuid)

const [onboardingQuery, versionsQuery, jobsQuery, stageTimingsQuery, eventsQuery] = await Promise.all([
  timed('seller_onboarding', async () => {
    if (!isUuid(resolvedListingId)) return { data: [] }
    const { data, error } = await client
      .from('private_listing_seller_onboarding')
      .select('id, private_listing_id, status, submitted_at, updated_at, form_data')
      .eq('private_listing_id', resolvedListingId)
      .order('updated_at', { ascending: false })
      .limit(5)
    if (error) throw error
    return { data: data || [] }
  }),
  timed('document_packet_versions', async () => {
    if (!packetIds.length) return { data: [] }
    const { data, error } = await client
      .from('document_packet_versions')
      .select('id, packet_id, version_number, render_status, rendered_file_path, rendered_file_name, rendered_file_bucket, rendered_sha256, rendered_byte_length, generated_at, created_at, updated_at, validation_summary_json')
      .in('packet_id', packetIds)
      .order('updated_at', { ascending: false })
      .limit(50)
    if (error) throw error
    return { data: data || [] }
  }),
  timed('legal_document_jobs', async () => {
    if (!packetIds.length) return { data: [] }
    const { data, error } = await client
      .from('legal_document_jobs')
      .select('id, organisation_id, packet_id, packet_version_id, job_type, status, generation_attempt_id, attempt_count, max_attempts, available_at, next_retry_at, claimed_at, started_at, last_heartbeat_at, completed_at, failed_at, cancelled_at, created_at, updated_at, error_json, metadata_json')
      .in('packet_id', packetIds)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) throw error
    return { data: data || [] }
  }),
  timed('legal_document_job_stage_timings', async () => {
    if (!packetIds.length) return { data: [] }
    const { data, error } = await client
      .from('legal_document_job_stage_timings')
      .select('id, job_id, packet_id, packet_version_id, stage, status, duration_ms, error_code, error_message, started_at, completed_at, created_at')
      .in('packet_id', packetIds)
      .order('started_at', { ascending: false })
      .limit(100)
    if (error) throw error
    return { data: data || [] }
  }),
  timed('document_packet_events', async () => {
    if (!packetIds.length) return { data: [] }
    const { data, error } = await client
      .from('document_packet_events')
      .select('id, packet_id, version_id, event_type, event_payload_json, created_at')
      .in('packet_id', packetIds)
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) throw error
    return { data: data || [] }
  }),
])

const packets = (packetQuery.data || []).map((row) => {
  const sourceContext = row.source_context_json && typeof row.source_context_json === 'object' ? row.source_context_json : {}
  return {
    id: row.id,
    organisationId: row.organisation_id,
    packetType: row.packet_type,
    status: row.status,
    currentVersionNumber: row.current_version_number,
    templateId: row.template_id,
    templateKeySnapshot: row.template_key_snapshot,
    leadId: row.lead_id,
    transactionId: row.transaction_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sourceContextKeys: keys(sourceContext),
    sourceContextHasGeneratedDataSnapshot: Boolean(sourceContext.generatedDataSnapshot),
    sourceContextGenerationAttemptId: text(sourceContext.generationAttemptId || sourceContext.generation_attempt_id) || null,
  }
})

const onboarding = (onboardingQuery.data || []).map((row) => {
  const form = row.form_data && typeof row.form_data === 'object' ? row.form_data : {}
  const attorney = form.preferredTransferAttorney && typeof form.preferredTransferAttorney === 'object'
    ? form.preferredTransferAttorney
    : {}
  return {
    id: row.id,
    privateListingId: row.private_listing_id,
    status: row.status,
    submittedAt: row.submitted_at,
    updatedAt: row.updated_at,
    formDataKeys: keys(form),
    hasSellerName: Boolean(text(form.sellerFullName || form.fullName || form.sellerName)),
    hasPropertyAddress: Boolean(text(form.propertyAddress || form.address || form.formattedAddress)),
    preferredTransferAttorney: {
      preferredPartnerId: text(attorney.preferredPartnerId || attorney.preferred_partner_id) || null,
      hasCompanyName: Boolean(text(attorney.companyName || attorney.company_name)),
      hasEmail: Boolean(text(attorney.email)),
      selectionDeferred: Boolean(attorney.selectionDeferred || form.transferAttorneySelectionDeferred),
    },
  }
})

const versions = (versionsQuery.data || []).map((row) => {
  const summary = row.validation_summary_json && typeof row.validation_summary_json === 'object' ? row.validation_summary_json : {}
  return {
    id: row.id,
    packetId: row.packet_id,
    versionNumber: row.version_number,
    renderStatus: row.render_status,
    hasRenderedFilePath: Boolean(text(row.rendered_file_path)),
    renderedFileName: row.rendered_file_name || null,
    renderedFileBucket: row.rendered_file_bucket || null,
    hasRenderedSha256: Boolean(text(row.rendered_sha256)),
    renderedByteLength: row.rendered_byte_length || null,
    generatedAt: row.generated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    validationSummaryKeys: keys(summary),
    generationStatus: text(summary.generationStatus || summary.generation_status) || null,
    generationAttemptId: text(summary.generationAttemptId || summary.generation_attempt_id || summary.render_provenance?.generationAttemptId) || null,
    previewOnly: summary.previewOnly ?? summary.preview_only ?? null,
  }
})

const jobs = (jobsQuery.data || []).map((row) => ({
  id: row.id,
  organisationId: row.organisation_id,
  packetId: row.packet_id,
  packetVersionId: row.packet_version_id,
  jobType: row.job_type,
  status: row.status,
  generationAttemptId: row.generation_attempt_id,
  attemptCount: row.attempt_count,
  maxAttempts: row.max_attempts,
  availableAt: row.available_at,
  nextRetryAt: row.next_retry_at,
  claimedAt: row.claimed_at,
  startedAt: row.started_at,
  lastHeartbeatAt: row.last_heartbeat_at,
  completedAt: row.completed_at,
  failedAt: row.failed_at,
  cancelledAt: row.cancelled_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  error: row.error_json || {},
  metadataKeys: keys(row.metadata_json),
}))

const stageTimings = (stageTimingsQuery.data || []).map((row) => ({
  id: row.id,
  jobId: row.job_id,
  packetId: row.packet_id,
  packetVersionId: row.packet_version_id,
  stage: row.stage,
  status: row.status,
  durationMs: row.duration_ms,
  errorCode: row.error_code || null,
  errorMessage: text(row.error_message).slice(0, 240) || null,
  startedAt: row.started_at,
  completedAt: row.completed_at,
  createdAt: row.created_at,
}))

const events = (eventsQuery.data || []).map((row) => {
  const payload = row.event_payload_json && typeof row.event_payload_json === 'object' ? row.event_payload_json : {}
  return {
    id: row.id,
    packetId: row.packet_id,
    versionId: row.version_id,
    eventType: row.event_type,
    createdAt: row.created_at,
    payloadKeys: keys(payload),
    message: text(payload.message).slice(0, 240) || null,
    generationAttemptId: text(payload.generationAttemptId || payload.generation_attempt_id) || null,
    errorCode: text(payload.errorCode || payload.error_code || payload.code) || null,
  }
})

const timings = [packetQuery, onboardingQuery, versionsQuery, jobsQuery, stageTimingsQuery, eventsQuery]
  .map(({ label, ok, durationMs, error }) => ({ label, ok, durationMs, error }))

const report = {
  contract: 'mandate-generation-phase1-diagnostic-v1',
  checkedAt: new Date().toISOString(),
  input: {
    leadId: isUuid(resolvedLeadId) ? resolvedLeadId : null,
    listingId: isUuid(resolvedListingId) ? resolvedListingId : null,
    packetId: isUuid(resolvedPacketId) ? resolvedPacketId : null,
    organisationId: isUuid(resolvedOrganisationId) ? resolvedOrganisationId : null,
  },
  timings,
  counts: {
    packets: packets.length,
    onboarding: onboarding.length,
    versions: versions.length,
    jobs: jobs.length,
    stageTimings: stageTimings.length,
    events: events.length,
  },
  packets,
  onboarding,
  versions,
  jobs,
  stageTimings,
  events,
  mutatedData: false,
}

if (outputPath) {
  const resolvedOutputPath = resolve(process.cwd(), outputPath)
  const relativeOutputPath = relative(process.cwd(), resolvedOutputPath)
  if (relativeOutputPath.startsWith('..')) {
    console.error('--output must point inside the current working directory.')
    process.exit(1)
  }
  await mkdir(dirname(resolvedOutputPath), { recursive: true })
  await writeFile(resolvedOutputPath, JSON.stringify(report, null, 2))
  const latestPacket = packets[0] || null
  const latestOnboarding = onboarding[0] || null
  console.log(JSON.stringify({
    contract: report.contract,
    checkedAt: report.checkedAt,
    outputPath: relativeOutputPath,
    input: report.input,
    timings: report.timings,
    counts: report.counts,
    latestPacket: latestPacket ? {
      ...latestPacket,
      sourceContextKeyCount: latestPacket.sourceContextKeys.length,
      sourceContextKeys: latestPacket.sourceContextKeys.slice(0, 16),
    } : null,
    latestOnboarding: latestOnboarding ? {
      ...latestOnboarding,
      formDataKeyCount: latestOnboarding.formDataKeys.length,
      formDataKeys: latestOnboarding.formDataKeys.slice(0, 16),
    } : null,
    latestVersion: versions[0] || null,
    latestJob: jobs[0] || null,
    latestStageTimings: stageTimings.slice(0, 10),
    latestEvents: events.slice(0, 10),
    mutatedData: false,
  }, null, 2))
} else {
  console.log(JSON.stringify(report, null, 2))
}
