export const SIGNING_COMPLETION_CONTRACT = 'arch9-signing-completion-v1'

function text(value) {
  return String(value || '').trim()
}

function key(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

export function buildSigningCompletion(input = {}) {
  const source = object(input)
  const document = object(source.document)
  const version = object(source.version)
  const signer = object(source.signer)
  const finalArtifact = object(source.finalArtifact || source.final_artifact)
  const access = object(source.access)
  const delivery = object(source.delivery)
  const completedAt = text(source.completedAt || source.completed_at || signer.signedAt || signer.signed_at) || null
  const finalPath = text(finalArtifact.path || finalArtifact.filePath || finalArtifact.file_path || version.finalSignedFilePath)
  const finalUrl = text(finalArtifact.url || finalArtifact.downloadUrl || finalArtifact.download_url || version.finalSignedFileUrl)
  const finalArtifactReady = finalArtifact.ready === true || Boolean(finalPath || finalUrl)

  return {
    contract: SIGNING_COMPLETION_CONTRACT,
    status: 'completed',
    completedAt,
    alreadyCompleted: source.alreadyCompleted === true,
    document: {
      id: text(document.id || document.packetId || document.packet_id) || null,
      packetId: text(document.packetId || document.packet_id || document.id) || null,
      type: key(document.type || document.packetType || document.packet_type) || 'document',
      title: text(document.title) || 'Document',
      transactionId: text(document.transactionId || document.transaction_id) || null,
      transactionReference: text(document.transactionReference || document.transaction_reference) || null,
      propertyLabel: text(document.propertyLabel || document.property_label) || null,
    },
    version: {
      id: text(version.id || version.versionId || version.version_id) || null,
      number: Number(version.number ?? version.versionNumber ?? version.version_number) || 1,
      locked: source.locked !== false,
      finalisedAt: text(version.finalisedAt || version.finalised_at || completedAt) || null,
      finalSha256: text(finalArtifact.sha256 || finalArtifact.finalSha256 || finalArtifact.final_sha256 || version.finalSha256) || null,
    },
    signer: {
      id: text(signer.id) || null,
      name: text(signer.name || signer.signerName || signer.signer_name) || 'Signer',
      email: text(signer.email || signer.signerEmail || signer.signer_email).toLowerCase() || null,
      role: key(signer.role || signer.signerRole || signer.signer_role) || 'signer',
      signedAt: text(signer.signedAt || signer.signed_at || completedAt) || null,
    },
    finalArtifact: {
      ready: finalArtifactReady,
      resolver: text(finalArtifact.resolver) || null,
      packetId: text(finalArtifact.packetId || finalArtifact.packet_id || document.packetId || document.packet_id || document.id) || null,
      packetVersionId: text(finalArtifact.packetVersionId || finalArtifact.packet_version_id || version.id || version.versionId || version.version_id) || null,
      documentId: text(finalArtifact.documentId || finalArtifact.document_id || version.finalSignedDocumentId) || null,
      fileName: text(finalArtifact.fileName || finalArtifact.file_name || version.finalSignedFileName) || null,
      bucket: text(finalArtifact.bucket || finalArtifact.fileBucket || finalArtifact.file_bucket) || null,
      path: finalPath || null,
      url: finalUrl || null,
    },
    transactionSaved: source.transactionSaved === true,
    access: {
      transactionVisible: access.transactionVisible === true,
      clientVisible: access.clientVisible === true,
      canonicalSatisfied: access.canonicalSatisfied === true,
      portalSurface: key(access.portalSurface || access.portal_surface) || null,
      verifiedAt: text(access.verifiedAt || access.verified_at) || null,
    },
    delivery: {
      status: key(delivery.status || source.deliveryStatus || source.delivery_status) || (finalArtifactReady ? 'available' : 'preparing'),
      emailStatus: key(delivery.emailStatus || delivery.email_status) || 'not_confirmed',
      attemptedAt: text(delivery.attemptedAt || delivery.attempted_at) || null,
    },
    deliveryStatus: key(delivery.status || source.deliveryStatus || source.delivery_status) || (finalArtifactReady ? 'available' : 'preparing'),
  }
}

export function assertSigningCompletion(value = {}) {
  const completion = buildSigningCompletion(value)
  const issues = []
  if (!completion.completedAt) issues.push('Completion time is missing.')
  if (!completion.document.id) issues.push('Completed document identity is missing.')
  if (!completion.version.id) issues.push('Completed document version identity is missing.')
  if (!completion.signer.signedAt) issues.push('Signer completion time is missing.')
  if (!completion.version.locked) issues.push('Completed version is not locked.')
  if (issues.length) {
    const error = new Error(issues.join(' '))
    error.code = 'INVALID_SIGNING_COMPLETION'
    error.issues = issues
    throw error
  }
  return completion
}
