import assert from 'node:assert/strict'
import test from 'node:test'
import { projectCanonicalSellerDocumentRows } from '../canonicalSellerDocumentProjectionService.js'

test('canonical seller projection collapses aliases and keeps upload evidence', () => {
  const rows = projectCanonicalSellerDocumentRows([
    { key: 'levy_statement', category: 'property', status: 'required' },
    { key: 'sectional_levy_statement', category: 'legal', status: 'uploaded', file_url: 'https://files.example/levy.pdf' },
  ])

  assert.equal(rows.length, 1)
  assert.equal(rows[0].key, 'levy_statement')
  assert.equal(rows[0].taxonomyCategory, 'property')
  assert.equal(rows[0].file_url, 'https://files.example/levy.pdf')
})

test('canonical seller projection omits structured facts and preserves party-specific requirements', () => {
  const rows = projectCanonicalSellerDocumentRows([
    { key: 'body_corporate_details' },
    { key: 'seller_id_document', party_id: 'seller-one' },
    { key: 'seller_id_document', party_id: 'seller-two' },
    { key: 'solar_compliance_documents', category: 'legal' },
  ])

  assert.equal(rows.some((row) => row.key === 'body_corporate_details'), false)
  assert.equal(rows.filter((row) => row.key === 'seller_id_document').length, 2)
  assert.equal(rows.find((row) => row.key === 'solar_compliance_documents').taxonomyCategory, 'property')
})

test('canonical seller projection is the only selector for requirement, draft, acknowledgement, and final artefact candidates', () => {
  const candidates = [
    { key: 'signed_mandate', required: true, status: 'required', original: { requirement: { id: 'requirement-1' }, document: null } },
    {
      key: 'signed_mandate',
      required: true,
      status: 'awaiting_agent_review',
      original: {
        requirement: { id: 'requirement-1' },
        document: {
          document_type: 'signed_mandate',
          name: 'Mandate preparation summary',
          source: 'seller_onboarding.post_submission_draft',
          status: 'awaiting_agent_review',
          generated_html: '<html>review only</html>',
        },
      },
    },
    {
      key: 'signed_mandate',
      required: true,
      status: 'required',
      original: {
        requirement: { id: 'requirement-1' },
        document: { id: 'acknowledgement', document_type: 'signed_mandate', status: 'completed' },
      },
    },
    {
      key: 'signed_mandate',
      required: true,
      status: 'completed',
      original: {
        requirement: { id: 'requirement-1' },
        document: { id: 'html-final', document_type: 'signed_mandate', status: 'completed', generated_html: '<html>signed</html>' },
      },
    },
    {
      key: 'signed_mandate',
      required: true,
      status: 'completed',
      original: {
        requirement: { id: 'requirement-1' },
        document: { id: 'stored-final', document_type: 'signed_mandate', status: 'completed', storage_path: 'signed/mandate.pdf' },
      },
    },
  ]

  const rows = projectCanonicalSellerDocumentRows(candidates)

  assert.equal(rows.length, 1)
  assert.equal(rows[0].key, 'signed_mandate')
  assert.equal(rows[0].original.document.id, 'stored-final')
  assert.equal(rows[0].documentContract.satisfiesRequirement, true)
  assert.equal(rows[0].required, true)
  assert.equal(rows[0].originalRows.length, 4)
})

test('canonical seller projection is idempotent', () => {
  const once = projectCanonicalSellerDocumentRows([
    { key: 'signed_fica_declaration', required: true, status: 'required' },
    { key: 'fica_declaration', required: true, status: 'completed', generated_html: '<html>signed fica</html>' },
  ])
  const twice = projectCanonicalSellerDocumentRows(once)

  assert.equal(once.length, 1)
  assert.equal(twice.length, 1)
  assert.equal(twice[0].canonicalRequirementIdentity, once[0].canonicalRequirementIdentity)
  assert.equal(twice[0].generated_html, '<html>signed fica</html>')
})

test('keeps a signed session row visible when its final PDF is missing', () => {
  const rows = projectCanonicalSellerDocumentRows([
    { key: 'signed_fica_declaration', required: true, status: 'required' },
    {
      key: 'signed_fica_declaration',
      required: true,
      status: 'completed',
      original: {
        document: {
          id: 'signed-fica-without-pdf',
          document_type: 'signed_fica_declaration',
          signing_session_id: 'session-1',
          status: 'completed',
        },
      },
    },
  ])

  assert.equal(rows.length, 1)
  assert.equal(rows[0].original.document.id, 'signed-fica-without-pdf')
  assert.equal(rows[0].artifactRecoveryState, 'missing_final_pdf')
  assert.equal(rows[0].documentContract.satisfiesRequirement, false)
  assert.equal(rows[0].canDownload, false)
  assert.equal(rows[0].canUpload, false)
})
