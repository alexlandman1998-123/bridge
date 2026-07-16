import { CONVEYANCER_DOCUMENT_OPERATIONS } from '../../core/productisation/conveyancerDocumentPipeline.js'

function text(value = '') { return String(value ?? '').trim() }
function hex(bytes) { return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, '0')).join('') }

async function hashStoredObject(client, bucket, path) {
  if (!client?.storage || !bucket || !path) throw new Error('Private storage client, bucket and path are required.')
  const response = await client.storage.from(bucket).download(path)
  if (response?.error) throw response.error
  const bytes = await response.data.arrayBuffer()
  return `sha256:${hex(await globalThis.crypto.subtle.digest('SHA-256', bytes))}`
}

function versionArtifact(version = {}, bucket = '', contentHash = '') {
  return {
    bucket: text(version.rendered_file_bucket || bucket),
    path: text(version.rendered_file_path),
    mimeType: 'application/pdf', contentHash,
    providerDocumentId: text(version.rendered_document_id),
    packetVersionId: text(version.id),
  }
}

export function createArch9PacketConveyancerDocumentAdapter(overrides = {}) {
  const hashObject = overrides.hashStoredObject || hashStoredObject
  async function service(name) {
    if (overrides[name]) return overrides[name]
    const packetService = await import('../../core/documents/packetService.js')
    return packetService[name]
  }
  return {
    key: 'arch9_packet',
    async execute(command, runtime = {}) {
      if (command.operation === CONVEYANCER_DOCUMENT_OPERATIONS.render) {
        const render = await service('generatePacketVersion')
        const rendered = await render({
          packetId: command.source.packetId || null, packetType: command.source.packetType,
          context: runtime.context || {}, template: runtime.template || null,
          allowWarnings: runtime.allowWarnings !== false, forceGenerate: false,
        })
        const version = rendered?.version || {}
        if (!version.rendered_file_path) return { ok: false, code: 'rendered_artifact_missing' }
        const contentHash = await hashObject(runtime.client, command.source.storageBucket, version.rendered_file_path)
        return { ok: true, completedAt: new Date().toISOString(), artifact: versionArtifact(version, command.source.storageBucket, contentHash), providerReference: `arch9_packet:${rendered.packet?.id || command.source.packetId || ''}` }
      }
      if (command.operation === CONVEYANCER_DOCUMENT_OPERATIONS.sendForSigning) {
        const signingLinks = await service('generateSigningLinks')
        const result = await signingLinks({
          packetId: command.source.packetId, packetVersionId: command.source.packetVersionId,
          expiresInHours: Number(command.signing.expiresInHours || 72), organisationId: command.organisationId,
          regenerate: false, targetSignerRole: text(command.signing.targetSignerRole),
        })
        return { ok: true, completedAt: new Date().toISOString(), signingProviderReference: `arch9_packet:${result.packetVersionId}`, providerReference: `arch9_packet:${result.packetId}`, signerCount: (result.signers || []).length, expiresAt: result.expiresAt || null }
      }
      if (command.operation === CONVEYANCER_DOCUMENT_OPERATIONS.finaliseSignedPack) {
        const finalise = await service('generateFinalSignedPacketDocument')
        const result = await finalise({ packetId: command.source.packetId, packetVersionId: command.source.packetVersionId, organisationId: command.organisationId, outputBucket: command.artifact.bucket })
        const artifact = result?.finalArtifact || result?.artifact || {}
        const path = text(artifact.path || artifact.filePath || command.artifact.path)
        const bucket = text(artifact.bucket || command.artifact.bucket)
        const contentHash = await hashObject(runtime.client, bucket, path)
        return { ok: true, completedAt: new Date().toISOString(), artifact: { bucket, path, mimeType: 'application/pdf', contentHash, providerDocumentId: text(artifact.documentId) }, signingProviderReference: `arch9_packet:${command.source.packetVersionId}`, completionCertificateReference: text(command.signing.completionCertificateReference) }
      }
      return { ok: false, code: 'arch9_packet_operation_unsupported' }
    },
  }
}

export function createManualConveyancerDocumentAdapter(overrides = {}) {
  const hashObject = overrides.hashStoredObject || hashStoredObject
  return {
    key: 'manual',
    async execute(command, runtime = {}) {
      if (command.operation !== CONVEYANCER_DOCUMENT_OPERATIONS.manualUpload && command.operation !== CONVEYANCER_DOCUMENT_OPERATIONS.finaliseSignedPack) return { ok: false, code: 'manual_operation_unsupported' }
      const actualHash = await hashObject(runtime.client, command.artifact.bucket, command.artifact.path)
      if (actualHash !== command.artifact.contentHash) return { ok: false, code: 'manual_artifact_hash_mismatch' }
      return { ok: true, completedAt: new Date().toISOString(), artifact: { ...command.artifact }, providerReference: 'manual_upload', completionCertificateReference: text(command.signing.completionCertificateReference) || null }
    },
  }
}
