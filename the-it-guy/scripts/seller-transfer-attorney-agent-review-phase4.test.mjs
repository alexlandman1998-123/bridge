import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

const [summarySource, leadsSource, listingSource] = await Promise.all([
  readFile(resolve(root, 'src/components/seller/SellerAttorneyDecisionSummary.jsx'), 'utf8'),
  readFile(resolve(root, 'src/pages/AgentLeadsPage.jsx'), 'utf8'),
  readFile(resolve(root, 'src/pages/AgentListingDetail.jsx'), 'utf8'),
])

for (const expectedCopy of [
  'Seller accepted recommendation',
  'Seller nominated another firm',
  'Seller wants to discuss first',
  'Waiting for seller decision',
  'Agency recommendation',
  'Seller’s choice',
  'Continue to mandate',
  'Review in mandate',
  'Email seller',
  'Call seller',
]) {
  assert.match(summarySource, new RegExp(expectedCopy))
}

assert.match(summarySource, /normalizeSellerTransferAttorneyDecision/)
assert.match(summarySource, /SELLER_TRANSFER_ATTORNEY_DECISIONS\.acceptRecommendation/)
assert.match(summarySource, /SELLER_TRANSFER_ATTORNEY_DECISIONS\.nominateOwn/)
assert.match(summarySource, /SELLER_TRANSFER_ATTORNEY_DECISIONS\.defer/)
assert.match(summarySource, /href=\{`mailto:/)
assert.match(summarySource, /href=\{`tel:/)
assert.match(summarySource, /onClick=\{\(\) => onContinueToMandate\(\)\}/)

for (const pageSource of [leadsSource, listingSource]) {
  assert.match(pageSource, /SellerAttorneyDecisionSummary/)
  assert.match(pageSource, /decision=\{/)
  assert.match(pageSource, /sellerEmail=\{/)
  assert.match(pageSource, /sellerPhone=\{/)
  assert.match(pageSource, /onContinueToMandate=\{/)
}

console.log('Seller transfer attorney agent review Phase 4 checks passed.')
