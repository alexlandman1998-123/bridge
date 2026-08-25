import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const agencySource = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')

assert.ok(agencySource.includes('Mandate signed as hard copy'), 'Seller lead actions should expose a hard-copy signed mandate path.')
assert.ok(agencySource.includes('function handleSellerLeadSignedMandateUpload'), 'Seller lead Documents tab should have a dedicated hard-copy signed mandate upload action.')
assert.ok(agencySource.includes("handleSellerJourneyAction('record_hard_copy_mandate')"), 'Hard-copy mandate action should route into seller journey handling.')
assert.ok(agencySource.includes('uploadPrivateListingDocument(targetListingId, file'), 'Hard-copy signed mandate should upload into private listing documents.')
assert.ok(agencySource.includes('data-seller-document-key={basePackDocumentKey || documentKey}'), 'Documents tab should expose a stable Signed Mandate scroll/upload target.')
assert.ok(agencySource.includes("activityType: 'Mandate Signed'"), 'Hard-copy signed mandate upload should create a lead activity audit row.')

console.log('Seller lead mandate signed upload button verified.')
