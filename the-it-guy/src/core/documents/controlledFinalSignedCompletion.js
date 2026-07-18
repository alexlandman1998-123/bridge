function text(value) { return typeof value === 'string' ? value.trim() : '' }
const SHA256 = /^[0-9a-f]{64}$/i

export function assessControlledFinalSignedCompletion({ version = {}, layout = {}, dispatches = [], sessions = [], signers = [], fields = [], artifact = {} } = {}) {
  const reasons = []
  const versionId = text(version.id)
  if (!version.transactionPdfPersisted && !version.transaction_pdf_persisted) reasons.push('F2_CERTIFIED_PDF_MISSING')
  if (!version.nativePdfVerified && !version.native_pdf_verified) reasons.push('F2_NATIVE_PDF_UNVERIFIED')
  if (text(layout.status).toLowerCase() !== 'applied' || !(layout.placementVerified || layout.placement_verified)) reasons.push('F2_APPLIED_LAYOUT_INVALID')
  if (!(Array.isArray(dispatches) ? dispatches : []).some((dispatch) => text(dispatch.status).toLowerCase() === 'delivered' && text(dispatch.layoutId || dispatch.layout_id) === text(layout.id))) reasons.push('F2_DELIVERED_DISPATCH_MISSING')
  const signerRows = Array.isArray(signers) ? signers : []
  const sessionRows = Array.isArray(sessions) ? sessions : []
  if (!signerRows.length || signerRows.some((signer) => text(signer.status).toLowerCase() !== 'signed' || text(signer.packetVersionId || signer.packet_version_id) !== versionId)) reasons.push('F2_SIGNERS_INCOMPLETE')
  for (const signer of signerRows) {
    if (!sessionRows.some((session) => text(session.signerId || session.signer_id) === text(signer.id) && text(session.status).toLowerCase() === 'completed' && text(session.packetVersionId || session.packet_version_id) === versionId)) reasons.push('F2_CONTROLLED_SESSION_INCOMPLETE')
  }
  const required = (Array.isArray(fields) ? fields : []).filter((field) => field.required === true)
  if (!required.length || required.some((field) => text(field.status).toLowerCase() !== 'completed')) reasons.push('F2_FIELDS_INCOMPLETE')
  if (required.some((field) => ['signature', 'initial'].includes(text(field.fieldType || field.field_type).toLowerCase()) && !text(field.signatureAssetPath || field.signature_asset_path))) reasons.push('F2_SIGNATURE_ASSET_MISSING')
  if (!text(artifact.path) || !SHA256.test(text(artifact.sha256)) || Number(artifact.byteLength || artifact.byte_length) < 100) reasons.push('F2_FINAL_ARTIFACT_INVALID')
  return { ready: reasons.length === 0, reasons: [...new Set(reasons)], signerCount: signerRows.length, requiredFieldCount: required.length }
}
