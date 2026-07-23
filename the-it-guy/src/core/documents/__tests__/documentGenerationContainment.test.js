import test from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveDocumentConversionHealthPolicy,
  resolvePdfRenderablePacketType,
  resolveSignableTemplatePolicy,
} from '../documentGenerationContainment.js'

const publishedMandate = {
  id: 'template-mandate',
  packet_type: 'mandate',
  status: 'published',
  is_active: true,
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

test('rejects generic scenario fallbacks while allowing a route-specific published template', () => {
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
})

test('requires a healthy converter before a PDF render may begin', () => {
  assert.equal(
    resolveDocumentConversionHealthPolicy({ healthy: false, status: 'not_configured' }).code,
    'DOCUMENT_CONVERSION_UNAVAILABLE',
  )
  assert.equal(resolveDocumentConversionHealthPolicy({ healthy: true, status: 'healthy' }).ok, true)
})
