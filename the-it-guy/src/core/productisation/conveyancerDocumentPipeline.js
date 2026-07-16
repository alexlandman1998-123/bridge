export const CONVEYANCER_DOCUMENT_PIPELINE_VERSION = 'conveyancer_document_pipeline_p5_v1'
export const CONVEYANCER_DOCUMENT_PIPELINE_MODES = Object.freeze({ disabled: 'disabled', observe: 'observe', pilot: 'pilot', live: 'live' })
export const CONVEYANCER_DOCUMENT_OPERATIONS = Object.freeze({
  render: 'render', sendForSigning: 'send_for_signing', finaliseSignedPack: 'finalise_signed_pack', manualUpload: 'manual_upload',
})
export const CONVEYANCER_DOCUMENT_ADAPTERS = Object.freeze({ arch9Packet: 'arch9_packet', manual: 'manual' })

const OPERATIONS = new Set(Object.values(CONVEYANCER_DOCUMENT_OPERATIONS))
const ADAPTERS = new Set(Object.values(CONVEYANCER_DOCUMENT_ADAPTERS))
function text(value = '') { return String(value ?? '').trim() }
function key(value = '') { return text(value).toLowerCase().replace(/[\s/-]+/g, '_').replace(/[^a-z0-9_.:]+/g, '') }
function iso(value) { return value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toISOString() : null }
function clone(value) { return JSON.parse(JSON.stringify(value ?? null)) }
function freeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.values(value).forEach(freeze); return Object.freeze(value) }
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (!value || typeof value !== 'object') return value; return Object.keys(value).sort().reduce((result, itemKey) => { result[itemKey] = stable(value[itemKey]); return result }, {}) }
function fnv(value) { const source = JSON.stringify(stable(value)); let hash = 0x811c9dc5; for (let index = 0; index < source.length; index += 1) { hash ^= source.charCodeAt(index); hash = Math.imul(hash, 0x01000193) } return `fnv1a_${(hash >>> 0).toString(16).padStart(8, '0')}` }
function fingerprint(value) { return text(value).length >= 8 }
function objectRef(value = {}) { return { bucket: text(value.bucket), path: text(value.path), mimeType: text(value.mimeType || value.mime_type), contentHash: text(value.contentHash || value.content_hash) } }

export function buildConveyancerDocumentPipelineControl(input = {}) {
  const control = {
    version: CONVEYANCER_DOCUMENT_PIPELINE_VERSION,
    organisationId: text(input.organisationId || input.organisation_id), attorneyFirmId: text(input.attorneyFirmId || input.attorney_firm_id),
    mode: key(input.mode) || CONVEYANCER_DOCUMENT_PIPELINE_MODES.disabled,
    allowedOperations: [...new Set((input.allowedOperations || input.allowed_operations || []).map(key).filter((value) => OPERATIONS.has(value)))].sort(),
    allowedAdapters: [...new Set((input.allowedAdapters || input.allowed_adapters || [CONVEYANCER_DOCUMENT_ADAPTERS.manual]).map(key).filter((value) => ADAPTERS.has(value)))].sort(),
    pilotTransactionIds: [...new Set((input.pilotTransactionIds || input.pilot_transaction_ids || []).map(text).filter(Boolean))].sort(),
    killSwitchEnabled: (input.killSwitchEnabled ?? input.kill_switch_enabled) !== false,
    reason: text(input.reason),
  }
  control.fingerprint = fnv(control)
  return freeze(control)
}

export function evaluateConveyancerDocumentPipelineGate(control = {}, command = {}) {
  if (control.version !== CONVEYANCER_DOCUMENT_PIPELINE_VERSION || !control.organisationId || !control.attorneyFirmId) return freeze({ allowed: false, observeOnly: false, reason: 'document_pipeline_control_invalid' })
  if (control.killSwitchEnabled) return freeze({ allowed: false, observeOnly: false, reason: 'document_pipeline_kill_switch_enabled' })
  if (control.mode === 'disabled') return freeze({ allowed: false, observeOnly: false, reason: 'document_pipeline_disabled' })
  if (control.allowedOperations.length && !control.allowedOperations.includes(command.operation)) return freeze({ allowed: false, observeOnly: false, reason: 'document_operation_not_enabled' })
  if (!control.allowedAdapters.includes(command.adapter)) return freeze({ allowed: false, observeOnly: false, reason: 'document_adapter_not_enabled' })
  if (control.mode === 'pilot' && !control.pilotTransactionIds.includes(command.transactionId)) return freeze({ allowed: false, observeOnly: false, reason: 'matter_outside_document_pilot' })
  return freeze({ allowed: true, observeOnly: control.mode === 'observe', reason: control.mode === 'observe' ? 'observe_only' : 'allowed' })
}

export function buildConveyancerDocumentCommand(input = {}) {
  const sourceInput = input.source || {}
  const signingInput = input.signing || {}
  const command = {
    version: CONVEYANCER_DOCUMENT_PIPELINE_VERSION,
    commandId: text(input.commandId), operation: key(input.operation), adapter: key(input.adapter),
    organisationId: text(input.organisationId), attorneyFirmId: text(input.attorneyFirmId), transactionId: text(input.transactionId),
    documentType: key(input.documentType), requestedAt: iso(input.requestedAt),
    source: {
      documentId: text(sourceInput.documentId), packetId: text(sourceInput.packetId), packetVersionId: text(sourceInput.packetVersionId),
      packetType: key(sourceInput.packetType), storageBucket: text(sourceInput.storageBucket), templateReference: text(sourceInput.templateReference),
      contentFingerprint: text(sourceInput.contentFingerprint), provenanceFingerprint: text(sourceInput.provenanceFingerprint), approvalFingerprint: text(sourceInput.approvalFingerprint),
      artifactId: text(sourceInput.artifactId), signingRecordId: text(sourceInput.signingRecordId), providerEventId: text(sourceInput.providerEventId), capturedByUserId: text(sourceInput.capturedByUserId),
    },
    signing: {
      planFingerprint: text(signingInput.planFingerprint),
      signers: Array.isArray(signingInput.signers) ? signingInput.signers.map((signer) => ({ signerId: text(signer.signerId), role: key(signer.role), signingOrder: Math.max(1, Number(signer.signingOrder || 1)) })).filter((signer) => signer.signerId && signer.role) : [],
      targetSignerRole: key(signingInput.targetSignerRole), expiresInHours: Math.max(1, Math.min(720, Number(signingInput.expiresInHours || 72))),
      webhookVerified: signingInput.webhookVerified === true, completionCertificateReference: text(signingInput.completionCertificateReference),
    },
    artifact: objectRef(input.artifact || {}),
    humanReleaseApproved: input.humanReleaseApproved === true,
  }
  const errors = []
  if (!command.commandId || !OPERATIONS.has(command.operation) || !ADAPTERS.has(command.adapter) || !command.organisationId || !command.attorneyFirmId || !command.transactionId || !command.documentType || !command.requestedAt) errors.push('document_command_identity_invalid')
  if (command.operation === CONVEYANCER_DOCUMENT_OPERATIONS.render) {
    if (!text(command.source.documentId) || !text(command.source.packetType) || !text(command.source.storageBucket) || !text(command.source.templateReference) || !fingerprint(command.source.contentFingerprint) || !fingerprint(command.source.provenanceFingerprint) || !fingerprint(command.source.approvalFingerprint) || command.humanReleaseApproved) errors.push('render_source_approval_invalid')
  }
  if (command.operation === CONVEYANCER_DOCUMENT_OPERATIONS.sendForSigning) {
    if (!text(command.source.artifactId) || !fingerprint(command.artifact.contentHash) || !command.artifact.bucket || !command.artifact.path || command.artifact.mimeType !== 'application/pdf' || !fingerprint(command.signing.planFingerprint) || !Array.isArray(command.signing.signers) || !command.signing.signers.length || !command.humanReleaseApproved) errors.push('signing_release_contract_invalid')
  }
  if (command.operation === CONVEYANCER_DOCUMENT_OPERATIONS.finaliseSignedPack) {
    const manualArtifactInvalid = command.adapter === CONVEYANCER_DOCUMENT_ADAPTERS.manual && (!fingerprint(command.artifact.contentHash) || !command.artifact.path || command.artifact.mimeType !== 'application/pdf')
    if (!text(command.source.signingRecordId) || !text(command.source.providerEventId) || !command.signing.webhookVerified || !command.artifact.bucket || manualArtifactInvalid || !text(command.signing.completionCertificateReference) || command.humanReleaseApproved) errors.push('signed_pack_evidence_invalid')
  }
  if (command.operation === CONVEYANCER_DOCUMENT_OPERATIONS.manualUpload) {
    if (!command.artifact.bucket || !command.artifact.path || !command.artifact.mimeType || !fingerprint(command.artifact.contentHash) || !text(command.source.capturedByUserId) || command.humanReleaseApproved) errors.push('manual_artifact_evidence_invalid')
  }
  command.fingerprint = fnv(command)
  return freeze({ ok: errors.length === 0, errors, command })
}

export async function executeConveyancerDocumentCommand({ control: controlInput = {}, command: commandInput = {}, adapters = {}, runtime = {} } = {}) {
  const control = buildConveyancerDocumentPipelineControl(controlInput)
  const built = buildConveyancerDocumentCommand(commandInput)
  if (!built.ok) return freeze({ ok: false, code: 'document_command_invalid', errors: built.errors, command: built.command, persistenceEnvelope: null })
  const gate = evaluateConveyancerDocumentPipelineGate(control, built.command)
  if (!gate.allowed) return freeze({ ok: true, code: gate.reason, decision: 'ignored', command: built.command, result: null, persistenceEnvelope: null })
  if (gate.observeOnly) return freeze({ ok: true, code: 'document_command_observed', decision: 'observed', command: built.command, result: null, persistenceEnvelope: null })
  const adapter = adapters[built.command.adapter]
  if (!adapter?.execute) return freeze({ ok: false, code: 'document_adapter_unavailable', errors: ['document_adapter_unavailable'], command: built.command, persistenceEnvelope: null })
  const result = await adapter.execute(built.command, runtime)
  const outcomeErrors = []
  if (!result?.ok) outcomeErrors.push(result?.code || 'document_adapter_failed')
  if (built.command.operation === CONVEYANCER_DOCUMENT_OPERATIONS.render && (!result?.artifact?.bucket || !result?.artifact?.path || !fingerprint(result?.artifact?.contentHash) || result?.artifact?.mimeType !== 'application/pdf')) outcomeErrors.push('rendered_artifact_evidence_invalid')
  if (built.command.operation === CONVEYANCER_DOCUMENT_OPERATIONS.sendForSigning && !text(result?.signingProviderReference)) outcomeErrors.push('signing_provider_reference_missing')
  if ([CONVEYANCER_DOCUMENT_OPERATIONS.finaliseSignedPack, CONVEYANCER_DOCUMENT_OPERATIONS.manualUpload].includes(built.command.operation) && (!result?.artifact?.bucket || !result?.artifact?.path || !fingerprint(result?.artifact?.contentHash))) outcomeErrors.push('stored_artifact_evidence_invalid')
  if (outcomeErrors.length) return freeze({ ok: false, code: 'document_adapter_result_invalid', errors: [...new Set(outcomeErrors)], command: built.command, result: clone(result), persistenceEnvelope: null })
  const persistenceEnvelope = {
    version: CONVEYANCER_DOCUMENT_PIPELINE_VERSION, commandId: built.command.commandId,
    organisationId: built.command.organisationId, attorneyFirmId: built.command.attorneyFirmId, transactionId: built.command.transactionId,
    operation: built.command.operation, commandFingerprint: built.command.fingerprint, completedAt: iso(result.completedAt) || new Date().toISOString(),
    result: clone(result), resultFingerprint: fnv(result),
  }
  return freeze({ ok: true, code: 'document_command_completed', decision: 'committed', command: built.command, result: clone(result), persistenceEnvelope })
}

function missingP5(error) { return ['42P01', 'PGRST205', 'PGRST202'].includes(error?.code) || /conveyancer_document_pipeline|bridge_(enqueue|claim|complete)_conveyancer_document/i.test(error?.message || '') }

export async function loadConveyancerDocumentPipelineContext(client, { organisationId = '', attorneyFirmId = '' } = {}) {
  if (!client?.from) return freeze({ available: false, reason: 'query_client_unavailable', control: null })
  try {
    const response = await client.from('conveyancer_document_pipeline_controls').select('*').eq('organisation_id', organisationId).eq('attorney_firm_id', attorneyFirmId).order('revision', { ascending: false }).limit(1)
    if (response?.error) throw response.error
    const row = response?.data?.[0]
    return freeze({ available: true, reason: row ? 'loaded' : 'document_control_missing', control: buildConveyancerDocumentPipelineControl(row || { organisationId, attorneyFirmId, reason: 'No P5 control exists.' }) })
  } catch (error) { if (missingP5(error)) return freeze({ available: false, reason: 'p5_not_installed', control: null }); throw error }
}

export async function persistConveyancerDocumentPipelineControl(client, controlInput = {}) {
  if (!client?.rpc) throw new Error('A Supabase-compatible RPC client is required.')
  const control = buildConveyancerDocumentPipelineControl(controlInput)
  const response = await client.rpc('bridge_set_conveyancer_document_pipeline_control', { payload: control })
  if (response?.error) throw response.error
  return freeze({ ok: true, control, data: response?.data || null })
}

export async function runConveyancerDocumentJob(client, { control = {}, command = {}, adapters = {}, runtime = {} } = {}) {
  const built = buildConveyancerDocumentCommand(command)
  if (!built.ok) return freeze({ ok: false, skipped: true, reason: 'document_command_invalid', errors: built.errors })
  const gate = evaluateConveyancerDocumentPipelineGate(buildConveyancerDocumentPipelineControl(control), built.command)
  if (!gate.allowed || gate.observeOnly) return freeze({ ok: true, skipped: true, reason: gate.reason, preview: built.command })
  const enqueue = await client.rpc('bridge_enqueue_conveyancer_document_job', { payload: built.command })
  if (enqueue?.error) { if (missingP5(enqueue.error)) return freeze({ ok: true, skipped: true, reason: 'p5_not_installed' }); throw enqueue.error }
  const jobId = text(enqueue?.data?.jobId)
  const claim = await client.rpc('bridge_claim_conveyancer_document_job', { p_job_id: jobId })
  if (claim?.error) throw claim.error
  const execution = await executeConveyancerDocumentCommand({ control, command: built.command, adapters, runtime })
  const completion = await client.rpc('bridge_complete_conveyancer_document_job', { p_job_id: jobId, payload: execution.ok ? execution.persistenceEnvelope : { version: CONVEYANCER_DOCUMENT_PIPELINE_VERSION, commandId: built.command.commandId, error: execution.code, errors: execution.errors || [] } })
  if (completion?.error) throw completion.error
  return freeze({ ok: execution.ok, skipped: false, jobId, execution, persistence: completion?.data || null })
}

export async function loadConveyancerDocumentPipelineSummary(client, { organisationId = '', attorneyFirmId = '', transactionId = '' } = {}) {
  try {
    const context = await loadConveyancerDocumentPipelineContext(client, { organisationId, attorneyFirmId })
    if (!context.available) return freeze({ available: false, reason: context.reason, control: null, counts: {}, latest: null })
    const response = await client.from('conveyancer_document_jobs').select('id, operation, status, created_at, completed_at').eq('organisation_id', organisationId).eq('attorney_firm_id', attorneyFirmId).eq('transaction_id', transactionId).order('created_at', { ascending: false }).limit(100)
    if (response?.error) throw response.error
    const rows = response?.data || []
    return freeze({ available: true, reason: 'loaded', control: context.control, counts: rows.reduce((counts, row) => { counts[row.status] = (counts[row.status] || 0) + 1; return counts }, {}), latest: rows[0] || null })
  } catch (error) { if (missingP5(error)) return freeze({ available: false, reason: 'p5_not_installed', control: null, counts: {}, latest: null }); throw error }
}
