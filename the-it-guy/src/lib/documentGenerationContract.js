/**
 * Stable client/edge contract for legal-document rendering.  The renderer is
 * allowed to evolve internally, but callers must always submit the same
 * minimum request and receive a persisted document reference in return.
 */
export const DOCUMENT_GENERATION_CONTRACT_VERSION = 'arch9-document-generation-v1'

function text(value) {
  return String(value ?? '').trim()
}

function issue(code, message) {
  return { code, message }
}

export function createDocumentGenerationContractError(code, message, details = {}) {
  const error = new Error(message)
  error.code = code
  error.details = details
  return error
}

export function buildDocumentGenerationRequestContract(input = {}) {
  return {
    contractVersion: DOCUMENT_GENERATION_CONTRACT_VERSION,
    packetId: text(input.packetId),
    transactionId: text(input.transactionId) || undefined,
    leadId: text(input.leadId) || undefined,
    renderMode: text(input.renderMode) || undefined,
    templatePath: text(input.templatePath) || undefined,
    templateBucket: text(input.templateBucket) || undefined,
    templateBase64: text(input.templateBase64) || undefined,
    templateFilename: text(input.templateFilename) || undefined,
    outputBucket: text(input.outputBucket) || undefined,
    outputPath: text(input.outputPath) || undefined,
    placeholders: input.placeholders && typeof input.placeholders === 'object' && !Array.isArray(input.placeholders)
      ? input.placeholders
      : {},
    sectionManifest: Array.isArray(input.sectionManifest) ? input.sectionManifest : [],
    generationPayload: input.generationPayload && typeof input.generationPayload === 'object' && !Array.isArray(input.generationPayload)
      ? input.generationPayload
      : undefined,
    sourceContext: input.sourceContext && typeof input.sourceContext === 'object' && !Array.isArray(input.sourceContext)
      ? input.sourceContext
      : undefined,
    branding: input.branding && typeof input.branding === 'object' && !Array.isArray(input.branding)
      ? input.branding
      : undefined,
    templateVersion: text(input.templateVersion) || undefined,
    generatedByRole: text(input.generatedByRole) || undefined,
    generatedByUserId: text(input.generatedByUserId) || undefined,
    clientVisible: Boolean(input.clientVisible),
  }
}

/** Validates only invariant transport facts, not template/business rules. */
export function validateDocumentGenerationRequestContract(input = {}) {
  const payload = buildDocumentGenerationRequestContract(input)
  const issues = []
  if (!payload.packetId) issues.push(issue('packet_id_missing', 'A persisted packet is required before rendering.'))
  // Template, mode and output details intentionally remain optional here: the
  // approved-template service owns their defaults. This preserves the legacy
  // renderer path while still making the transport contract explicit.
  return { ok: issues.length === 0, issues, payload }
}

/**
 * Packet-level preflight. Unlike the transport contract, this is deliberately
 * strict about the values Arch9 itself is responsible for producing before it
 * asks the renderer to do work. Server-side template/output defaults remain
 * valid, so only an explicitly malformed packet request is stopped here.
 */
export function validateDocumentGenerationPreflight({
  request = {},
  packetType = '',
  templateConfig = {},
  useNativeRenderer = false,
  allowTemplateFallback = false,
} = {}) {
  const transport = validateDocumentGenerationRequestContract(request)
  const payload = transport.payload
  const issues = [...transport.issues]
  const normalizedPacketType = text(packetType).toLowerCase()
  const templatePath = text(templateConfig.templatePath || payload.templatePath)
  const templateBucket = text(templateConfig.templateBucket || payload.templateBucket)
  const templateFilename = text(templateConfig.templateFilename || payload.templateFilename)
  const templateBase64 = text(payload.templateBase64)

  if (!payload.renderMode) issues.push(issue('render_mode_missing', 'A render mode is required before rendering.'))
  if (!payload.outputPath) issues.push(issue('output_path_missing', 'A document output path is required before rendering.'))
  if (!normalizedPacketType) issues.push(issue('packet_type_missing', 'A legal document type is required before rendering.'))

  const hasTemplateSource = Boolean(templateBase64 || templatePath || (templateBucket && templateFilename))
  if (!useNativeRenderer && !allowTemplateFallback && !hasTemplateSource) {
    issues.push(issue('template_source_missing', 'The approved legal template has no usable source file.'))
  }

  return { ok: issues.length === 0, issues, payload }
}

function artifactFromResponse(response = {}) {
  const output = response.output && typeof response.output === 'object' ? response.output : {}
  const storage = response.storage && typeof response.storage === 'object' ? response.storage : {}
  const document = response.document && typeof response.document === 'object' ? response.document : {}
  const documentRecord = response.documentRecord?.data && typeof response.documentRecord.data === 'object'
    ? response.documentRecord.data
    : {}
  return {
    renderedDocumentId: text(documentRecord.id || document.id || response.documentId),
    renderedFilePath: text(output.filePath || storage.path || response.path || response.renderedFilePath),
    renderedFileName: text(output.fileName || storage.fileName || documentRecord.name || document.name || response.fileName),
    renderedFileUrl: text(output.signedUrl || storage.publicUrl || documentRecord.url || document.url || response.url || response.renderedFileUrl),
    renderedFileBucket: text(output.bucket || storage.bucket),
    renderedMediaType: text(output.mediaType || output.contentType),
    renderedByteLength: Number(output.byteLength || 0) || 0,
    renderedSha256: text(output.sha256),
    renderAttestation: response.renderAttestation && typeof response.renderAttestation === 'object' ? response.renderAttestation : null,
  }
}

/**
 * Rejects ambiguous renderer successes. A usable draft always has both a
 * document record and a stored file path; callers never guess response shape.
 */
export function normalizeDocumentGenerationResponseContract(response = {}, { packetId = '' } = {}) {
  if (!response || typeof response !== 'object' || response.success === false) {
    throw createDocumentGenerationContractError(
      'GENERATION_CONTRACT_RESPONSE_INVALID',
      'The document renderer did not return a usable result.',
      { reason: 'invalid_response' },
    )
  }

  const responsePacketId = text(response.packetId || response.packet_id)
  const expectedPacketId = text(packetId)
  if (expectedPacketId && responsePacketId && responsePacketId !== expectedPacketId) {
    throw createDocumentGenerationContractError(
      'GENERATION_CONTRACT_PACKET_MISMATCH',
      'The renderer returned a result for a different packet.',
      { expectedPacketId, responsePacketId },
    )
  }

  const artifact = artifactFromResponse(response)
  const issues = []
  if (!artifact.renderedDocumentId) issues.push(issue('document_record_missing', 'The renderer did not create a document record.'))
  if (!artifact.renderedFilePath) issues.push(issue('file_path_missing', 'The renderer did not provide a stored file path.'))
  if (issues.length) {
    throw createDocumentGenerationContractError(
      'GENERATION_CONTRACT_ARTIFACT_INVALID',
      'The renderer completed without a verifiable saved document.',
      { issues, packetId: expectedPacketId || responsePacketId || null },
    )
  }

  return {
    ...response,
    contractVersion: DOCUMENT_GENERATION_CONTRACT_VERSION,
    packetId: responsePacketId || expectedPacketId || undefined,
    documentId: artifact.renderedDocumentId,
    renderedFilePath: artifact.renderedFilePath,
    output: {
      ...(response.output && typeof response.output === 'object' ? response.output : {}),
      filePath: artifact.renderedFilePath,
      fileName: artifact.renderedFileName || undefined,
      signedUrl: artifact.renderedFileUrl || undefined,
      bucket: artifact.renderedFileBucket || undefined,
      mediaType: artifact.renderedMediaType || undefined,
      byteLength: artifact.renderedByteLength || undefined,
      sha256: artifact.renderedSha256 || undefined,
    },
    documentRecord: response.documentRecord || { data: { id: artifact.renderedDocumentId } },
    renderAttestation: artifact.renderAttestation,
  }
}
