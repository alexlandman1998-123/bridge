import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildLegalDocumentEditorPath,
  buildLegacyLegalDocumentEditorPath,
  buildLegacyLegalDocumentRedirectPath,
  buildLegalDocumentOverviewPath,
  buildLegalDocumentPreviewPath,
  buildLegalDocumentWorkspacePath,
  buildLegalDocumentsLandingPath,
  getLegalDocumentEditorScopeFromWorkspaceArea,
  getLegalDocumentWorkspaceAreaFromEditorScope,
  parseLegalDocumentPath,
} from '../legalDocumentRoutes.js'

test('builds one canonical workspace route with optional editing context', () => {
  assert.equal(buildLegalDocumentsLandingPath(), '/settings/legal-templates')
  assert.equal(buildLegalDocumentWorkspacePath('otp'), '/settings/legal-templates/otp')
  assert.equal(buildLegalDocumentOverviewPath('otp'), '/settings/legal-templates/otp')
  assert.equal(buildLegalDocumentEditorPath('otp', 'standard'), '/settings/legal-templates/otp?area=content')
  assert.equal(
    buildLegalDocumentEditorPath('otp', 'situations', {
      templateId: 'template 1',
      situationKey: 'sectional_title',
      advanced: true,
    }),
    '/settings/legal-templates/otp?area=conditions&template=template+1&situation=sectional_title&mode=advanced',
  )
  assert.equal(buildLegalDocumentPreviewPath('otp'), '/settings/legal-templates/otp/preview')
})

test('keeps legacy editor URLs redirectable without losing query context', () => {
  assert.equal(buildLegacyLegalDocumentEditorPath('otp', 'signing'), '/settings/legal-templates/otp/edit/signing')
  assert.equal(
    buildLegacyLegalDocumentRedirectPath('otp', 'situations', '?template=template-1&situation=company'),
    '/settings/legal-templates/otp?template=template-1&situation=company&area=conditions',
  )
  assert.equal(
    buildLegacyLegalDocumentRedirectPath('otp', 'all', '?template=template-1&area=content'),
    '/settings/legal-templates/otp?template=template-1',
  )
})

test('maps temporary focused editor areas onto the canonical workspace', () => {
  assert.equal(getLegalDocumentWorkspaceAreaFromEditorScope('standard'), 'content')
  assert.equal(getLegalDocumentWorkspaceAreaFromEditorScope('situations'), 'conditions')
  assert.equal(getLegalDocumentWorkspaceAreaFromEditorScope('signing'), 'signatures')
  assert.equal(getLegalDocumentEditorScopeFromWorkspaceArea('conditions'), 'situations')
  assert.equal(getLegalDocumentEditorScopeFromWorkspaceArea('unknown'), 'all')
})

test('parses legal-document routes into a small view contract', () => {
  assert.deepEqual(parseLegalDocumentPath('/settings/legal-templates'), { view: 'landing', documentKey: '', scope: '' })
  assert.deepEqual(parseLegalDocumentPath('/settings/legal-templates/mandate'), { view: 'workspace', documentKey: 'mandate', scope: 'all' })
  assert.deepEqual(parseLegalDocumentPath('/settings/legal-templates/otp/edit/signing'), { view: 'legacy_editor', documentKey: 'otp', scope: 'signing' })
  assert.deepEqual(parseLegalDocumentPath('/settings/legal-templates/otp/preview'), { view: 'preview', documentKey: 'otp', scope: '' })
})

test('rejects unknown document routes', () => {
  assert.equal(parseLegalDocumentPath('/settings/legal-templates/not-real'), null)
  assert.throws(() => buildLegalDocumentOverviewPath('not-real'), /Unknown legal document/)
})
