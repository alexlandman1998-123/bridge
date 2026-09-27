import assert from 'node:assert/strict'
import test from 'node:test'
import { createSellerReviewedDocumentVersions } from '../sellerReviewedDocumentVersions.js'
import { downloadSellerPhysicalSigningCopy, getSellerPhysicalSigningCopy } from '../sellerPhysicalSigningCopy.js'

const approval = { status: 'approved', signingRoute: 'manual_upload', commission: { confirmed: true } }
const signingPack = { signers: [{ name: 'Alex Seller', role: 'Seller' }], mandate: { propertyAddress: '1 Test Road' } }

async function reviewedMandate() {
  const pack = await createSellerReviewedDocumentVersions({
    manualSigningPack: { documents: [{ key: 'signed_mandate', generatedHtml: '<article>Frozen mandate</article>', generatedFileName: 'mandate.pdf' }] },
    formalPackApproval: approval,
    signingPack,
    actor: 'agent-1',
  })
  return { ...pack.documents[0], source: 'seller_onboarding.manual_signing_pack' }
}

test('downloads the reviewed source after a signed upload becomes the preferred row', async () => {
  const copy = await reviewedMandate()
  const row = {
    status: 'uploaded',
    original: { document: { id: 'uploaded-document', status: 'uploaded', storage_path: 'signed.pdf' } },
    originalRows: [{ original: { document: copy } }],
  }
  assert.equal(getSellerPhysicalSigningCopy(row), copy)
  let downloaded = null
  await downloadSellerPhysicalSigningCopy(row, async (html, fileName) => { downloaded = { html, fileName } })
  assert.deepEqual(downloaded, { html: copy.generatedHtml, fileName: 'mandate.pdf' })
  assert.equal(row.status, 'uploaded')
})

test('changed reviewed content cannot be downloaded', async () => {
  const copy = await reviewedMandate()
  const row = { original: { document: { ...copy, generatedHtml: '<article>Changed mandate</article>' } } }
  await assert.rejects(downloadSellerPhysicalSigningCopy(row, async () => {}), /changed since approval/)
})
