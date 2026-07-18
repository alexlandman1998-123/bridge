import { resolveLegalDocumentSignerProfile } from './legalDocumentSignerProfile.js'
import { resolveMandateSecondarySignerConfig } from '../../lib/mandateSignatureRules.js'

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function key(value) {
  return text(value).toLowerCase()
}

function finiteNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function assessSigningEnvelope({ packet = {}, version = {}, signers = [], fields = [] } = {}) {
  const signerRows = Array.isArray(signers) ? signers : []
  const fieldRows = Array.isArray(fields) ? fields : []
  const reasons = []
  const packetId = text(packet.id)
  const versionId = text(version.id)
  const organisationId = text(packet.organisation_id || packet.organisationId)
  const packetType = key(packet.packet_type || packet.packetType)
  const packetStatus = key(packet.status)
  const placeholders = version.placeholders_resolved_json && typeof version.placeholders_resolved_json === 'object'
    ? version.placeholders_resolved_json
    : {}
  const context = packet.source_context_json && typeof packet.source_context_json === 'object'
    ? packet.source_context_json
    : {}

  if (
    !packetId ||
    !versionId ||
    text(version.packet_id || version.packetId) !== packetId ||
    (organisationId && text(version.organisation_id || version.organisationId) !== organisationId) ||
    Number(packet.current_version_number || packet.currentVersionNumber) !== Number(version.version_number || version.versionNumber) ||
    key(version.render_status || version.renderStatus) !== 'generated'
  ) reasons.push('E3_VERSION_BINDING_INVALID')
  if (!['signing_prep', 'sent', 'partially_signed', 'completed'].includes(packetStatus)) {
    reasons.push('E3_PACKET_NOT_READY_TO_SEND')
  }

  if (!signerRows.length) reasons.push('E3_SIGNERS_MISSING')
  if (!fieldRows.length) reasons.push('E3_FIELDS_MISSING')

  const signerByRole = new Map()
  const signingOrders = new Set()
  for (const signer of signerRows) {
    const role = key(signer.signer_role || signer.signerRole)
    const email = key(signer.signer_email || signer.signerEmail)
    const order = finiteNumber(signer.signing_order ?? signer.signingOrder)
    if (text(signer.packet_id || signer.packetId) !== packetId || text(signer.packet_version_id || signer.packetVersionId) !== versionId) reasons.push('E3_SIGNER_VERSION_BINDING_INVALID')
    if (organisationId && text(signer.organisation_id || signer.organisationId) !== organisationId) reasons.push('E3_SIGNER_ORGANISATION_BINDING_INVALID')
    if (!role || signerByRole.has(role)) reasons.push('E3_SIGNER_ROLE_DUPLICATE_OR_MISSING')
    else signerByRole.set(role, signer)
    if (!text(signer.signer_name || signer.signerName)) reasons.push('E3_SIGNER_NAME_MISSING')
    if (!EMAIL.test(email) || email.endsWith('@bridge.local')) reasons.push('E3_SIGNER_EMAIL_INVALID')
    if (!Number.isInteger(order) || order < 1 || signingOrders.has(order)) reasons.push('E3_SIGNING_ORDER_INVALID')
    else signingOrders.add(order)
  }

  let expectedSignerRoles = []
  if (packetType === 'otp') {
    expectedSignerRoles = resolveLegalDocumentSignerProfile({ packetType, placeholders, context }).signers.map((signer) => key(signer.role))
  } else if (packetType === 'mandate') {
    const secondary = resolveMandateSecondarySignerConfig({ packet, latestVersion: version, placeholders })
    expectedSignerRoles = ['agent', 'seller', ...(secondary.required ? [key(secondary.role)] : [])]
  }
  for (const role of [...new Set(expectedSignerRoles.filter(Boolean))]) {
    if (!signerByRole.has(role)) reasons.push('E3_REQUIRED_SIGNER_MISSING')
  }

  const requiredSignatureRoles = new Set()
  const fieldIdentities = new Set()
  for (const field of fieldRows) {
    const role = key(field.signer_role || field.signerRole)
    const type = key(field.field_type || field.fieldType)
    const page = finiteNumber(field.page_number ?? field.pageNumber)
    const x = finiteNumber(field.x_position ?? field.xPosition)
    const y = finiteNumber(field.y_position ?? field.yPosition)
    const width = finiteNumber(field.width)
    const height = finiteNumber(field.height)
    const required = field.required === true
    if (text(field.packet_id || field.packetId) !== packetId || text(field.packet_version_id || field.packetVersionId) !== versionId) reasons.push('E3_FIELD_VERSION_BINDING_INVALID')
    if (organisationId && text(field.organisation_id || field.organisationId) !== organisationId) reasons.push('E3_FIELD_ORGANISATION_BINDING_INVALID')
    if (!role || !signerByRole.has(role)) reasons.push('E3_FIELD_SIGNER_MISSING')
    if (!['initial', 'signature', 'date', 'text'].includes(type)) reasons.push('E3_FIELD_TYPE_INVALID')
    if (!Number.isInteger(page) || page < 1 || x === null || x < 0 || y === null || y < 0 || width === null || width <= 0 || height === null || height <= 0) reasons.push('E3_FIELD_GEOMETRY_INVALID')
    const identity = `${role}:${type}:${page}:${x}:${y}:${width}:${height}`
    if (fieldIdentities.has(identity)) reasons.push('E3_FIELD_DUPLICATE')
    fieldIdentities.add(identity)
    const signer = signerByRole.get(role)
    const fieldEmail = key(field.signer_email || field.signerEmail)
    if (fieldEmail && fieldEmail !== key(signer?.signer_email || signer?.signerEmail)) reasons.push('E3_FIELD_SIGNER_EMAIL_MISMATCH')
    if (required && type === 'signature') requiredSignatureRoles.add(role)
  }

  for (const role of signerByRole.keys()) {
    if (!requiredSignatureRoles.has(role)) reasons.push('E3_REQUIRED_SIGNATURE_FIELD_MISSING')
  }

  return {
    ready: reasons.length === 0,
    reasons: [...new Set(reasons)],
    versionBindingValid: !reasons.includes('E3_VERSION_BINDING_INVALID'),
    signerCount: signerRows.length,
    fieldCount: fieldRows.length,
    signerRoles: [...signerByRole.keys()],
    expectedSignerRoles: [...new Set(expectedSignerRoles.filter(Boolean))],
    requiredSignatureRoles: [...requiredSignatureRoles],
  }
}

export function assertSigningEnvelopeReady(input = {}) {
  const assessment = assessSigningEnvelope(input)
  if (assessment.ready) return assessment
  const error = new Error('The signing envelope is incomplete or is not bound to the exact current generated version.')
  error.code = 'SIGNING_ENVELOPE_NOT_READY'
  error.details = assessment
  throw error
}
