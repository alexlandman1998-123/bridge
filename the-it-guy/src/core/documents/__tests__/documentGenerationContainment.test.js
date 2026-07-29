import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isDefaultTemplateRouteFallback,
  mandateTemplateSelectionMatchesSpecificRoute,
  resolveDocumentConversionHealthPolicy,
  resolvePdfRenderablePacketType,
  resolveSignableTemplatePolicy,
  selectSignableMandateRouteSelection,
} from '../documentGenerationContainment.js'

const publishedMandate = {
  id: 'template-mandate',
  packet_type: 'mandate',
  status: 'published',
  is_active: true,
}

const platformDefaultMandate = {
  ...publishedMandate,
  template_key: 'mandate_default_v1',
  is_default: true,
  metadata_json: {
    template_scope: 'global_default',
    platform_default_can_route_without_org_template: true,
  },
}

const platformDefaultMandateSnapshot = {
  templateId: 'template-mandate',
  templateKey: 'mandate_default_v1',
  documentType: 'mandate',
  status: 'active',
}

test('rejects unknown and non-renderable packet types instead of coercing them to OTP', () => {
  assert.equal(resolvePdfRenderablePacketType('unknown').code, 'UNSUPPORTED_DOCUMENT_TYPE')
  assert.equal(resolvePdfRenderablePacketType('addendum').code, 'DOCUMENT_TYPE_NOT_RENDERABLE')
  assert.equal(resolvePdfRenderablePacketType('custom').code, 'DOCUMENT_TYPE_NOT_RENDERABLE')
  assert.deepEqual(resolvePdfRenderablePacketType('otp'), { ok: true, packetType: 'otp' })
})

test('requires a published, matching template for a signable document', () => {
  assert.equal(
    resolveSignableTemplatePolicy({
      packetType: 'mandate',
      template: { ...publishedMandate, status: 'draft' },
      explicitSelection: true,
    }).code,
    'TEMPLATE_NOT_PUBLISHED',
  )
  assert.equal(
    resolveSignableTemplatePolicy({
      packetType: 'otp',
      template: publishedMandate,
      explicitSelection: true,
    }).code,
    'TEMPLATE_PACKET_TYPE_MISMATCH',
  )
  assert.equal(
    resolveSignableTemplatePolicy({
      packetType: 'mandate',
      template: { ...publishedMandate, status: 'active' },
      explicitSelection: true,
    }).ok,
    true,
  )
  assert.equal(
    resolveSignableTemplatePolicy({
      packetType: 'mandate',
      template: publishedMandate,
      explicitSelection: true,
    }).ok,
    true,
  )
})

test('allows default boilerplate fallbacks while rejecting non-default generic fallbacks', () => {
  assert.equal(isDefaultTemplateRouteFallback(platformDefaultMandate), true)
  assert.equal(isDefaultTemplateRouteFallback(platformDefaultMandateSnapshot), true)
  assert.equal(isDefaultTemplateRouteFallback(publishedMandate), false)
  assert.equal(
    resolveSignableTemplatePolicy({
      packetType: 'mandate',
      template: publishedMandate,
      resolutionSource: 'mandate_scenario_fallback',
    }).code,
    'TEMPLATE_ROUTE_NOT_PUBLISHED',
  )
  assert.equal(
    resolveSignableTemplatePolicy({
      packetType: 'mandate',
      template: publishedMandate,
      resolutionSource: 'mandate_scenario_variant',
    }).ok,
    true,
  )
  assert.equal(
    resolveSignableTemplatePolicy({
      packetType: 'mandate',
      template: platformDefaultMandate,
      resolutionSource: 'mandate_scenario_fallback',
    }).ok,
    true,
  )
  assert.equal(
    resolveSignableTemplatePolicy({
      packetType: 'mandate',
      template: platformDefaultMandate,
      resolutionSource: 'global_default',
    }).ok,
    true,
  )
})

test('prefers an allowed platform fallback over a generic org fallback for signable mandate routing', () => {
  const routeSpecificSelection = {
    template: { ...publishedMandate, id: 'route-specific' },
    score: 1005,
    reasons: ['exact_variant_metadata'],
  }
  const orgGenericSelection = {
    template: {
      ...publishedMandate,
      id: 'org-generic',
      is_default: true,
      metadata_json: {
        mandate_template_variant: 'default',
        template_scope: 'organisation',
      },
    },
    score: 5,
    reasons: ['wildcard_route'],
  }
  const platformFallbackSelection = {
    template: platformDefaultMandate,
    score: 5,
    reasons: ['wildcard_route'],
  }

  assert.equal(mandateTemplateSelectionMatchesSpecificRoute(routeSpecificSelection), true)
  assert.equal(mandateTemplateSelectionMatchesSpecificRoute(orgGenericSelection), false)
  assert.equal(
    selectSignableMandateRouteSelection([orgGenericSelection, platformFallbackSelection]).template.id,
    platformDefaultMandate.id,
  )
  assert.equal(
    selectSignableMandateRouteSelection([orgGenericSelection, platformFallbackSelection, routeSpecificSelection]).template.id,
    'route-specific',
  )
})

test('requires a healthy converter before a PDF render may begin', () => {
  assert.equal(
    resolveDocumentConversionHealthPolicy({ healthy: false, status: 'not_configured' }).code,
    'DOCUMENT_CONVERSION_UNAVAILABLE',
  )
  assert.equal(resolveDocumentConversionHealthPolicy({ healthy: true, status: 'healthy' }).ok, true)
})
