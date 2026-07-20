import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildLegalDocumentEditorPath,
  buildLegalDocumentOverviewPath,
  buildLegalDocumentPreviewPath,
  buildLegalDocumentsLandingPath,
  parseLegalDocumentPath,
} from '../legalDocumentRoutes.js'

test('builds stable landing, overview, editor and preview routes', () => {
  assert.equal(buildLegalDocumentsLandingPath(), '/settings/legal-templates')
  assert.equal(buildLegalDocumentOverviewPath('otp'), '/settings/legal-templates/otp')
  assert.equal(buildLegalDocumentEditorPath('mandate'), '/settings/legal-templates/mandate/edit/standard')
  assert.equal(buildLegalDocumentEditorPath('otp', 'standard'), '/settings/legal-templates/otp/edit/standard')
  assert.equal(buildLegalDocumentPreviewPath('otp'), '/settings/legal-templates/otp/preview')
})

test('parses legal-document routes into a small view contract', () => {
  assert.deepEqual(parseLegalDocumentPath('/settings/legal-templates'), { view: 'landing', documentKey: '', scope: '' })
  assert.deepEqual(parseLegalDocumentPath('/settings/legal-templates/mandate'), { view: 'overview', documentKey: 'mandate', scope: '' })
  assert.deepEqual(parseLegalDocumentPath('/settings/legal-templates/otp/edit/signing'), { view: 'editor', documentKey: 'otp', scope: 'signing' })
  assert.deepEqual(parseLegalDocumentPath('/settings/legal-templates/otp/preview'), { view: 'preview', documentKey: 'otp', scope: '' })
})

test('rejects unknown document routes', () => {
  assert.equal(parseLegalDocumentPath('/settings/legal-templates/not-real'), null)
  assert.throws(() => buildLegalDocumentOverviewPath('not-real'), /Unknown legal document/)
})
