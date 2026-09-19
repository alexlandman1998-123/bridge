import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveCanonicalDocumentRequestPresentation } from '../canonicalDocumentRequestPresentationService.js'

test('canonical request presentation selects the action from taxonomy kind', () => {
  assert.deepEqual(
    resolveCanonicalDocumentRequestPresentation({ key: 'solar_compliance_documents' }),
    {
      canonicalKey: 'solar_compliance_documents',
      kind: 'upload_document',
      action: 'upload_document',
      actionLabel: 'Upload',
      helpText: 'Upload the requested supporting document.',
    },
  )

  const fact = resolveCanonicalDocumentRequestPresentation({ key: 'body_corporate_details' })
  assert.equal(fact.action, 'capture_details')
  assert.equal(fact.captureSurface, 'sectional_title_details')

  const generated = resolveCanonicalDocumentRequestPresentation({ key: 'generated_mandate' })
  assert.equal(generated.action, 'generate_document')
  assert.equal(generated.actionLabel, 'Prepare document')
})
