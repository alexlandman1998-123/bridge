import {
  CONVEYANCER_DOCUMENT_ADAPTERS,
  CONVEYANCER_DOCUMENT_OPERATIONS,
  loadConveyancerDocumentPipelineContext,
  loadConveyancerDocumentPipelineSummary,
  runConveyancerDocumentJob,
} from './conveyancerDocumentPipeline.js'
import {
  createArch9PacketConveyancerDocumentAdapter,
  createManualConveyancerDocumentAdapter,
} from '../../services/attorneyWorkflow/conveyancerDocumentPipelineAdapter.js'

export const CONVEYANCER_DOCUMENT_APPLICATION_H5_VERSION = 'conveyancer_document_application_h5_v1'
export const CONVEYANCER_DOCUMENT_REVIEW_DECISIONS = Object.freeze({ approve: 'approve', reject: 'reject' })

const text = (value = '') => String(value ?? '').trim()
const freeze = (value) => { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.values(value).forEach(freeze); return Object.freeze(value) }
const missingH5 = (error) => ['42P01', 'PGRST205', 'PGRST202'].includes(error?.code) || /conveyancer_document_review|bridge_review_conveyancer_document/i.test(error?.message || '')

function latestRevisions(rows = []) {
  const latest = new Map()
  for (const row of rows) {
    const key = text(row.record_id || row.id)
    if (!latest.has(key) || Number(row.revision || 0) > Number(latest.get(key).revision || 0)) latest.set(key, row)
  }
  return [...latest.values()]
}

export function buildConveyancerDocumentReviewRequest(input = {}) {
  const request = {
    version: CONVEYANCER_DOCUMENT_APPLICATION_H5_VERSION,
    idempotencyKey: text(input.idempotencyKey || input.idempotency_key),
    organisationId: text(input.organisationId || input.organisation_id),
    attorneyFirmId: text(input.attorneyFirmId || input.attorney_firm_id),
    transactionId: text(input.transactionId || input.transaction_id),
    artifactId: text(input.artifactId || input.artifact_id),
    expectedFingerprint: text(input.expectedFingerprint || input.expected_fingerprint),
    reviewFingerprint: text(input.reviewFingerprint || input.review_fingerprint),
    decision: text(input.decision).toLowerCase(),
    reason: text(input.reason),
    reviewedAt: text(input.reviewedAt || input.reviewed_at) || new Date().toISOString(),
  }
  const errors = []
  if (!request.idempotencyKey || !request.organisationId || !request.attorneyFirmId || !request.transactionId || !request.artifactId) errors.push('document_review_identity_invalid')
  if (request.expectedFingerprint.length < 8 || request.reviewFingerprint.length < 8) errors.push('document_review_provenance_invalid')
  if (!Object.values(CONVEYANCER_DOCUMENT_REVIEW_DECISIONS).includes(request.decision) || request.reason.length < 3) errors.push('document_review_decision_invalid')
  if (Number.isNaN(new Date(request.reviewedAt).getTime())) errors.push('document_review_time_invalid')
  return freeze({ ok: errors.length === 0, errors, request })
}

export async function reviewConveyancerDocumentArtifact(client, input = {}) {
  if (!client?.rpc) throw new Error('A Supabase-compatible RPC client is required.')
  const built = buildConveyancerDocumentReviewRequest(input)
  if (!built.ok) return freeze({ ok: false, skipped: true, reason: 'document_review_invalid', errors: built.errors, request: built.request })
  const response = await client.rpc('bridge_review_conveyancer_document_artifact_h5', { payload: built.request })
  if (response?.error) { if (missingH5(response.error)) return freeze({ ok: false, skipped: true, reason: 'h5_not_installed' }); throw response.error }
  return freeze({ ok: true, skipped: false, request: built.request, persistence: response?.data || null })
}

export async function runConveyancerDocumentApplicationCommand(client, { command = {}, control = null, adapters = null, runtime = {} } = {}) {
  if (!client?.rpc) throw new Error('A Supabase-compatible RPC client is required.')
  let activeControl = control
  if (!activeControl) {
    const context = await loadConveyancerDocumentPipelineContext(client, { organisationId: command.organisationId, attorneyFirmId: command.attorneyFirmId })
    if (!context.available || !context.control) return freeze({ ok: true, skipped: true, reason: context.reason || 'document_control_missing' })
    activeControl = context.control
  }
  const applicationAdapters = adapters || {
    [CONVEYANCER_DOCUMENT_ADAPTERS.arch9Packet]: createArch9PacketConveyancerDocumentAdapter(),
    [CONVEYANCER_DOCUMENT_ADAPTERS.manual]: createManualConveyancerDocumentAdapter(),
  }
  const result = await runConveyancerDocumentJob(client, { control: activeControl, command, adapters: applicationAdapters, runtime: { ...runtime, client: runtime.client || client } })
  const reviewRequired = result.ok && !result.skipped && [CONVEYANCER_DOCUMENT_OPERATIONS.finaliseSignedPack, CONVEYANCER_DOCUMENT_OPERATIONS.manualUpload].includes(result.execution?.command?.operation)
  return freeze({ ...result, version: CONVEYANCER_DOCUMENT_APPLICATION_H5_VERSION, reviewRequired, nextStep: reviewRequired ? 'review_document' : result.ok ? 'continue_matter' : 'resolve_document_error' })
}

export async function loadConveyancerDocumentApplicationSummary(client, scope = {}) {
  const { organisationId = '', attorneyFirmId = '', transactionId = '' } = scope
  try {
    const pipeline = await loadConveyancerDocumentPipelineSummary(client, scope)
    if (!pipeline.available) return freeze({ ...pipeline, version: CONVEYANCER_DOCUMENT_APPLICATION_H5_VERSION, artifacts: [], signingRecords: [], reviews: [], manualFallbackAvailable: true })
    const scoped = (table, columns) => client.from(table).select(columns).eq('organisation_id', organisationId).eq('attorney_firm_id', attorneyFirmId).eq('transaction_id', transactionId).order('created_at', { ascending: false }).limit(200)
    const [artifactResponse, signingResponse, reviewResponse] = await Promise.all([
      scoped('conveyancer_document_artifacts', 'id, record_id, revision, document_type, lifecycle_status, fingerprint, object_bucket, object_path, content_hash, mime_type, created_at'),
      scoped('conveyancer_signing_records', 'id, record_id, revision, signing_status, signed_pack_artifact_id, signing_provider_reference, fingerprint, created_at'),
      scoped('conveyancer_document_review_events', 'id, artifact_id, reviewed_artifact_id, decision, reason, reviewed_at, created_at'),
    ])
    for (const response of [artifactResponse, signingResponse, reviewResponse]) if (response?.error) throw response.error
    const artifacts = latestRevisions(artifactResponse.data || [])
    const signingRecords = latestRevisions(signingResponse.data || [])
    const awaitingReview = artifacts.filter((row) => ['under_review', 'signed'].includes(row.lifecycle_status)).length
    const signingAwaitingReview = signingRecords.filter((row) => ['signed_pack_received', 'under_review'].includes(row.signing_status)).length
    return freeze({
      ...pipeline,
      version: CONVEYANCER_DOCUMENT_APPLICATION_H5_VERSION,
      artifacts,
      signingRecords,
      reviews: reviewResponse.data || [],
      counts: { ...pipeline.counts, awaiting_review: Math.max(awaitingReview, signingAwaitingReview), approved: artifacts.filter((row) => row.lifecycle_status === 'approved').length, rejected: artifacts.filter((row) => row.lifecycle_status === 'rejected').length },
      manualFallbackAvailable: pipeline.control?.allowedAdapters?.includes(CONVEYANCER_DOCUMENT_ADAPTERS.manual) !== false,
    })
  } catch (error) {
    if (missingH5(error)) {
      const pipeline = await loadConveyancerDocumentPipelineSummary(client, scope)
      return freeze({ ...pipeline, version: CONVEYANCER_DOCUMENT_APPLICATION_H5_VERSION, reason: 'h5_not_installed', artifacts: [], signingRecords: [], reviews: [], manualFallbackAvailable: true })
    }
    throw error
  }
}
