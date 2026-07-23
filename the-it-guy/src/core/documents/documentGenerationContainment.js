const KNOWN_DOCUMENT_PACKET_TYPES = Object.freeze([
  'otp',
  'mandate',
  'addendum',
  'supporting_legal',
  'custom',
  'commercial_sale',
  'commercial_lease',
])

export const PDF_RENDERABLE_DOCUMENT_PACKET_TYPES = Object.freeze([
  'mandate',
  'otp',
  'commercial_sale',
  'commercial_lease',
])

export const SIGNABLE_DOCUMENT_PACKET_TYPES = PDF_RENDERABLE_DOCUMENT_PACKET_TYPES

export const PUBLISHED_TEMPLATE_STATUSES = Object.freeze(['published', 'active', 'approved', 'live'])

function text(value = '') {
  return String(value || '').trim()
}

export function normalizeDocumentPacketType(packetType = '') {
  return text(packetType).toLowerCase()
}

function policyFailure(code, message, details = {}) {
  return {
    ok: false,
    code,
    message,
    details,
  }
}

/**
 * The canonical packet model contains types that are not yet backed by a
 * production renderer.  Never coerce one of those (or an unknown value) into
 * an OTP render request.
 */
export function resolvePdfRenderablePacketType(packetType = '') {
  const normalizedPacketType = normalizeDocumentPacketType(packetType)
  if (!KNOWN_DOCUMENT_PACKET_TYPES.includes(normalizedPacketType)) {
    return policyFailure(
      'UNSUPPORTED_DOCUMENT_TYPE',
      'This document type is not supported by the document generator.',
      { packetType: normalizedPacketType || null },
    )
  }

  if (!PDF_RENDERABLE_DOCUMENT_PACKET_TYPES.includes(normalizedPacketType)) {
    return policyFailure(
      'DOCUMENT_TYPE_NOT_RENDERABLE',
      'This document type does not yet have a production PDF renderer. It cannot be generated or sent for signature.',
      { packetType: normalizedPacketType },
    )
  }

  return {
    ok: true,
    packetType: normalizedPacketType,
  }
}

export function isSignableDocumentPacketType(packetType = '') {
  return SIGNABLE_DOCUMENT_PACKET_TYPES.includes(normalizeDocumentPacketType(packetType))
}

export function isPublishedTemplateStatus(status = '') {
  return PUBLISHED_TEMPLATE_STATUSES.includes(normalizeDocumentPacketType(status))
}

/**
 * A signable packet may only bind to an authoritative, published template.
 * Route fallbacks are deliberately not eligible: the caller must publish an
 * exact route template (or explicitly choose a published one where allowed).
 */
export function resolveSignableTemplatePolicy({
  packetType = '',
  template = null,
  resolutionSource = '',
  explicitSelection = false,
} = {}) {
  const normalizedPacketType = normalizeDocumentPacketType(packetType)
  const templateId = text(template?.id)
  if (!templateId) {
    return policyFailure(
      'TEMPLATE_SELECTION_REQUIRED',
      'A published legal template must be selected before this document can be generated.',
      { packetType: normalizedPacketType || null },
    )
  }

  const templatePacketType = normalizeDocumentPacketType(template?.packet_type || template?.packetType)
  if (templatePacketType !== normalizedPacketType) {
    return policyFailure(
      'TEMPLATE_PACKET_TYPE_MISMATCH',
      'The selected template does not match this document type.',
      {
        packetType: normalizedPacketType,
        templateId,
        templatePacketType: templatePacketType || null,
      },
    )
  }

  const metadata = template?.metadata_json && typeof template.metadata_json === 'object'
    ? template.metadata_json
    : template?.metadataJson && typeof template.metadataJson === 'object'
      ? template.metadataJson
      : {}
  const templateStatus = normalizeDocumentPacketType(
    template?.status || template?.template_status || metadata?.lifecycle_status || metadata?.template_status,
  )
  if (!isPublishedTemplateStatus(templateStatus) || template?.is_active === false) {
    return policyFailure(
      'TEMPLATE_NOT_PUBLISHED',
      'Only a published legal template can be used to generate a signable document.',
      {
        packetType: normalizedPacketType,
        templateId,
        templateStatus: templateStatus || null,
      },
    )
  }

  const source = text(resolutionSource).toLowerCase()
  if (explicitSelection) {
    return {
      ok: true,
      packetType: normalizedPacketType,
      templateId,
      resolutionSource: 'explicit_published',
    }
  }

  const requiredRouteSource =
    normalizedPacketType === 'mandate'
      ? 'mandate_scenario_variant'
      : normalizedPacketType === 'otp'
        ? 'legal_scenario_variant'
        : ''
  if (!requiredRouteSource || source !== requiredRouteSource) {
    return policyFailure(
      'TEMPLATE_ROUTE_NOT_PUBLISHED',
      'No published template matches this document’s legal route. Publish the route-specific template before generating it.',
      {
        packetType: normalizedPacketType,
        templateId,
        resolutionSource: source || null,
        requiredRouteSource: requiredRouteSource || null,
      },
    )
  }

  return {
    ok: true,
    packetType: normalizedPacketType,
    templateId,
    resolutionSource: source,
  }
}

export function resolveDocumentConversionHealthPolicy(health = null) {
  if (health?.healthy === true) {
    return { ok: true, health }
  }

  const status = text(health?.status).toLowerCase() || 'unavailable'
  const message =
    text(health?.message) ||
    'PDF conversion is unavailable. Configure and verify the document converter before generating or finalising a document.'

  return policyFailure('DOCUMENT_CONVERSION_UNAVAILABLE', message, {
    status,
  })
}
