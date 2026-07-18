function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export function buildDraftArtifactProvenance(artifact = {}) {
  return {
    bucket: text(artifact.renderedFileBucket),
    path: text(artifact.renderedFilePath),
    fileName: text(artifact.renderedFileName),
    mediaType: text(artifact.renderedMediaType).toLowerCase(),
    byteLength: Number(artifact.renderedByteLength || 0),
    sha256: text(artifact.renderedSha256).toLowerCase(),
  }
}

export function assessGeneratedDraftArtifact({ artifact = {}, packetType = '' } = {}) {
  const provenance = buildDraftArtifactProvenance(artifact)
  const reasons = []
  if (!provenance.bucket) reasons.push('D2_ARTIFACT_BUCKET_MISSING')
  if (!provenance.path) reasons.push('D2_ARTIFACT_PATH_MISSING')
  if (!provenance.fileName) reasons.push('D2_ARTIFACT_FILE_NAME_MISSING')
  if (!['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/pdf'].includes(provenance.mediaType)) reasons.push('D2_ARTIFACT_MEDIA_TYPE_INVALID')
  if (!Number.isInteger(provenance.byteLength) || provenance.byteLength < 100) reasons.push('D2_ARTIFACT_SIZE_INVALID')
  if (!/^sha256:[0-9a-f]{64}$/.test(provenance.sha256)) reasons.push('D2_ARTIFACT_DIGEST_INVALID')
  return { ready: reasons.length === 0, reasons, packetType: text(packetType).toLowerCase() || null, provenance }
}

export function assessPersistedDraftArtifact({ version = {}, packetType = '' } = {}) {
  const validation = version.validation_summary_json && typeof version.validation_summary_json === 'object' ? version.validation_summary_json : {}
  const stored = validation.artifact_provenance && typeof validation.artifact_provenance === 'object' ? validation.artifact_provenance : {}
  const assessment = assessGeneratedDraftArtifact({
    packetType,
    artifact: {
      renderedFileBucket: stored.bucket,
      renderedFilePath: stored.path,
      renderedFileName: stored.fileName,
      renderedMediaType: stored.mediaType,
      renderedByteLength: stored.byteLength,
      renderedSha256: stored.sha256,
    },
  })
  const reasons = [...assessment.reasons]
  if (text(version.rendered_file_path || version.renderedFilePath) !== assessment.provenance.path) reasons.push('D2_VERSION_ARTIFACT_PATH_MISMATCH')
  return { ...assessment, ready: reasons.length === 0, reasons: [...new Set(reasons)] }
}

export function assertGeneratedDraftArtifact(input = {}) {
  const assessment = assessGeneratedDraftArtifact(input)
  if (assessment.ready) return assessment
  const error = new Error('Generated legal draft artifact evidence is incomplete.')
  error.code = 'DRAFT_ARTIFACT_PROVENANCE_INCOMPLETE'
  error.details = assessment
  throw error
}
