import { assessSigningEnvelope } from './signingEnvelopeAssurance.js'

function text(value) { return typeof value === 'string' ? value.trim() : '' }
const TOKEN = /^[0-9a-f]{64}$/

export function assessSigningDispatch({ packet = {}, version = {}, signers = [], fields = [], issuedAt = '', targetSignerRole = '' } = {}) {
  const envelope = assessSigningEnvelope({ packet, version, signers, fields })
  const reasons = envelope.ready ? [] : ['E4_E3_ENVELOPE_INVALID']
  const issuedTime = Date.parse(issuedAt || '')
  const baseline = Number.isFinite(issuedTime) ? issuedTime : Date.now()
  // A dispatch can be cryptographically prepared before the provider accepts
  // delivery. Only the sender promotes a prepared signer to `sent`.
  const normalizedTargetSignerRole = text(targetSignerRole).toLowerCase()
  const activeCandidates = (Array.isArray(signers) ? signers : []).filter((signer) => (
    ['ready_to_send', 'sent', 'viewed'].includes(text(signer.status).toLowerCase())
  ))
  const active = normalizedTargetSignerRole
    ? activeCandidates.filter((signer) => text(signer.signer_role || signer.signerRole).toLowerCase() === normalizedTargetSignerRole)
    : activeCandidates
  if (!active.length) {
    reasons.push(normalizedTargetSignerRole ? 'E4_TARGET_SIGNER_NOT_ACTIVE' : 'E4_ACTIVE_DISPATCH_MISSING')
  }
  const tokens = new Set()
  for (const signer of active) {
    const token = text(signer.signing_token).toLowerCase()
    const expiry = Date.parse(signer.token_expires_at || '')
    if (!TOKEN.test(token)) reasons.push('E4_TOKEN_FORMAT_INVALID')
    if (tokens.has(token)) reasons.push('E4_TOKEN_DUPLICATE')
    tokens.add(token)
    if (!Number.isFinite(expiry) || expiry < baseline + (55 * 60 * 1000) || expiry > baseline + (168 * 60 * 60 * 1000) + (5 * 60 * 1000)) reasons.push('E4_TOKEN_EXPIRY_INVALID')
  }
  return {
    ready: reasons.length === 0,
    reasons: [...new Set(reasons)],
    envelope,
    targetSignerRole: normalizedTargetSignerRole || null,
    activeSignerCount: active.length,
    activeSignerRoles: active.map((signer) => text(signer.signer_role || signer.signerRole).toLowerCase()),
  }
}

export function assertSigningDispatchReady(input = {}) {
  const assessment = assessSigningDispatch(input)
  if (assessment.ready) return assessment
  const error = new Error('Secure signing dispatch could not be verified.')
  error.code = 'SIGNING_DISPATCH_NOT_READY'
  error.details = assessment
  throw error
}
