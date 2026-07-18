function text(value) {
  return String(value || '').trim()
}

function key(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function iso(value) {
  const parsed = Date.parse(text(value))
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null
}

function roleLabel(value) {
  const role = key(value)
  const labels = {
    agent: 'Agency representative',
    seller: 'Seller',
    seller_spouse: 'Co-seller or spouse',
    purchaser_1: 'First purchaser',
    purchaser_2: 'Second purchaser',
    witness_1: 'First witness',
    witness_2: 'Second witness',
    attorney: 'Attorney',
  }
  return labels[role] || role.replace(/_/g, ' ').replace(/^./, (letter) => letter.toUpperCase()) || 'Signer'
}

export function buildSigningCompletionCertificate({
  packet = {},
  version = {},
  signers = [],
  finalCompletion = null,
  launchChain = null,
  signingActivity = null,
} = {}) {
  const signerRows = (Array.isArray(signers) ? signers : []).map((signer) => ({
    role: key(signer?.signer_role || signer?.role) || 'signer',
    roleLabel: roleLabel(signer?.signer_role || signer?.role),
    name: text(signer?.signer_name || signer?.signerName) || roleLabel(signer?.signer_role || signer?.role),
    email: text(signer?.signer_email || signer?.signerEmail).toLowerCase() || null,
    signedAt: iso(signer?.signed_at || signer?.signedAt),
    viewedAt: iso(signer?.viewed_at || signer?.viewedAt),
    status: key(signer?.status),
  }))
  const artifactSha256 = text(launchChain?.finalArtifact?.sha256).toLowerCase()
  const artifactByteLength = Number(launchChain?.finalArtifact?.byteLength || 0)
  const completedAt = iso(finalCompletion?.completedAt || version?.finalised_at || packet?.completed_at)
  const reasons = []
  if (finalCompletion?.ready !== true || key(finalCompletion?.stage) !== 'completed_everywhere') reasons.push('COMPLETION_NOT_VERIFIED')
  if (!signerRows.length || signerRows.some((signer) => signer.status !== 'signed' || !signer.signedAt)) reasons.push('SIGNERS_INCOMPLETE')
  if (!/^[a-f0-9]{64}$/.test(artifactSha256) || artifactByteLength < 100) reasons.push('FINAL_ARTIFACT_EVIDENCE_INVALID')
  if (!completedAt) reasons.push('COMPLETION_TIMESTAMP_MISSING')
  const ready = reasons.length === 0
  const certificateId = ready ? `ARCH9-${artifactSha256.slice(0, 12).toUpperCase()}-${completedAt.slice(0, 10).replaceAll('-', '')}` : null

  return {
    contract: 'arch9-signing-completion-certificate-v1',
    ready,
    reasons,
    certificateId,
    packetType: key(packet?.packet_type) || 'document',
    documentTitle: text(packet?.title) || (key(packet?.packet_type) === 'otp' ? 'Offer to Purchase' : 'Mandate'),
    versionNumber: Number(version?.version_number || 0) || null,
    completedAt,
    signers: signerRows,
    signerCount: signerRows.length,
    artifact: ready ? {
      sha256: artifactSha256,
      byteLength: artifactByteLength,
      fileName: text(version?.final_signed_file_name) || null,
    } : null,
    delivery: ready ? {
      recipientCount: Number(finalCompletion?.recipientCount || 0),
      deliveredRecipientCount: Number(finalCompletion?.deliveredRecipientCount || 0),
      transactionSaved: Boolean(finalCompletion?.transactionDocumentId),
    } : null,
    evidenceEventCount: Number(signingActivity?.totalCount || 0),
    statement: 'This system-generated record identifies the final signed PDF and the completion evidence recorded by Arch9. It is not an independent legal opinion.',
  }
}
