import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

test('preserves signed generated artefacts from the Supabase read boundary to the document projection', async () => {
  const server = await createServer({
    root: PROJECT_ROOT,
    logLevel: 'silent',
    server: { middlewareMode: true },
  })

  try {
    const { __privateListingServiceTestUtils } = await server.ssrLoadModule('/src/services/privateListingService.js')
    const { buildSellerDocumentSourceOfTruth } = await server.ssrLoadModule('/src/services/sellerDocumentRequirementsService.js')
    const [canonicalSelect, signedArtifactFallback] = __privateListingServiceTestUtils.privateListingDocumentSelectVariants

    for (const field of ['generated_html', 'generated_file_name', 'signing_session_id']) {
      assert.match(canonicalSelect, new RegExp(`(^|, )${field}(,|$)`))
      assert.match(signedArtifactFallback, new RegExp(`(^|, )${field}(,|$)`))
    }

    const [document] = __privateListingServiceTestUtils.normalizeDocumentRows([{
      id: 'document-1',
      private_listing_id: 'listing-1',
      document_type: 'signed_mandate',
      document_name: 'Signed mandate.html',
      generated_html: '<html><body>Signed mandate</body></html>',
      generated_file_name: 'signed-mandate.html',
      signing_session_id: 'session-1',
      status: 'completed',
      visibility: 'seller_visible',
      uploaded_at: '2026-09-20T16:17:22.000Z',
    }])

    assert.equal(document.generatedHtml, '<html><body>Signed mandate</body></html>')
    assert.equal(document.generatedFileName, 'signed-mandate.html')
    assert.equal(document.signingSessionId, 'session-1')

    const source = buildSellerDocumentSourceOfTruth({
      listing: {
        id: 'listing-1',
        documentRequirements: [{
          id: 'requirement-1',
          key: 'signed_mandate',
          label: 'Signed Mandate',
          status: 'required',
          is_required: true,
          group: 'legal',
        }],
        documents: [document],
      },
    })
    const mandate = source.rows.find((row) => row.key === 'signed_mandate')

    assert.equal(mandate.status, 'completed')
    assert.equal(mandate.hasUpload, true)
    assert.equal(mandate.canDownload, true)
    assert.equal(mandate.upload.generatedHtml, '<html><body>Signed mandate</body></html>')
    assert.equal(mandate.upload.generatedFileName, 'signed-mandate.html')
    assert.equal(mandate.documentContract.representation.kind, 'generated_html')
  } finally {
    await server.close()
  }
})

