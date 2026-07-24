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

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
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

function isDefaultTemplateRouteFallback(template = {}) {
  const metadata = record(template?.metadata_json || template?.metadataJson)
  const packetType = normalizeDocumentPacketType(template?.packet_type || template?.packetType)
  if (!['mandate', 'otp'].includes(packetType)) return false
  if (template?.is_default !== true && template?.isDefault !== true) return false
  if (template?.is_active === false || template?.isActive === false) return false
  const scope = normalizeDocumentPacketType(metadata.template_scope || metadata.templateScope)
  return scope === 'global_default' ||
    metadata.platform_default_can_route_without_org_template === true ||
    text(template?.template_key || template?.templateKey) === `${packetType}_default_v1`
}

/**
 * A signable packet may only bind to an authoritative, published template.
 * Ordinary route fallbacks are not eligible. A default OTP/mandate boilerplate
 * may be used as a broad fallback, with legal approval enforced by the
 * generation preflight and Edge runtime gates.
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
  const fallbackRouteSource =
    normalizedPacketType === 'mandate'
      ? 'mandate_scenario_fallback'
      : normalizedPacketType === 'otp'
        ? 'legal_scenario_fallback'
        : ''
  const defaultFallbackAllowed = fallbackRouteSource &&
    source === fallbackRouteSource &&
    isDefaultTemplateRouteFallback(template)

  if (!requiredRouteSource || (source !== requiredRouteSource && !defaultFallbackAllowed)) {
    return policyFailure(
      'TEMPLATE_ROUTE_NOT_PUBLISHED',
      'No published template matches this document’s legal route. Publish the route-specific template before generating it.',
      {
        packetType: normalizedPacketType,
        templateId,
        resolutionSource: source || null,
        requiredRouteSource: requiredRouteSource || null,
        defaultFallbackAllowed,
      },
    )
  }

  return {
    ok: true,
    packetType: normalizedPacketType,
    templateId,
    resolutionSource: defaultFallbackAllowed ? fallbackRouteSource : source,
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
