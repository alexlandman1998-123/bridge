import { assessSigningDispatch } from './signingDispatchAssurance.js'

function text(value) { return typeof value === 'string' ? value.trim() : '' }

export function assessSignerSession({ packet = {}, version = {}, signers = [], fields = [], signer = {}, issuedAt = '' } = {}) {
  const dispatch = assessSigningDispatch({ packet, version, signers, fields, issuedAt })
  const validation = version?.validation_summary_json && typeof version.validation_summary_json === 'object'
    ? version.validation_summary_json
    : {}
  const legacyLockedEnvelope = validation.review_state === 'locked' && validation.content_locked === true && validation.lock_snapshot
  const reasons = dispatch.ready || legacyLockedEnvelope ? [] : ['F1_E4_DISPATCH_INVALID']
  const role = text(signer.signer_role || signer.signerRole).toLowerCase()
  const email = text(signer.signer_email || signer.signerEmail).toLowerCase()
  if (!text(signer.id)) reasons.push('F1_SIGNER_MISSING')
  if (text(signer.packet_id || signer.packetId) !== text(packet.id) || text(signer.packet_version_id || signer.packetVersionId) !== text(version.id)) reasons.push('F1_SIGNER_VERSION_BINDING_INVALID')
  if (!['sent', 'viewed'].includes(text(signer.status).toLowerCase())) reasons.push('F1_SIGNER_SESSION_INACTIVE')
  const scopedFields = (Array.isArray(fields) ? fields : []).filter((field) => {
    const fieldRole = text(field.signer_role || field.signerRole).toLowerCase()
    const fieldEmail = text(field.signer_email || field.signerEmail).toLowerCase()
    return fieldRole === role && (!fieldEmail || fieldEmail === email)
  })
  if (!scopedFields.length) reasons.push('F1_SIGNER_FIELDS_MISSING')
  if (scopedFields.some((field) => text(field.packet_version_id || field.packetVersionId) !== text(version.id))) reasons.push('F1_FIELD_VERSION_BINDING_INVALID')
  if (!scopedFields.some((field) => field.required === true && text(field.field_type || field.fieldType).toLowerCase() === 'signature')) reasons.push('F1_REQUIRED_SIGNATURE_FIELD_MISSING')
  return { ready: reasons.length === 0, reasons: [...new Set(reasons)], dispatch, signerRole: role, scopedFieldCount: scopedFields.length, scopedFieldIds: scopedFields.map((field) => text(field.id)).filter(Boolean) }
}

export function assertSignerSessionReady(input = {}) {
  const assessment = assessSignerSession(input)
  if (assessment.ready) return assessment
  const error = new Error('The signer session is not bound to the exact dispatched legal-document version.')
  error.code = 'SIGNER_SESSION_NOT_READY'
  error.details = assessment
  throw error
}
