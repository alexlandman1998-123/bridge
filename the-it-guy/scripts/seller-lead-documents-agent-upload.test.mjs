import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const agencySource = readFileSync(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')

assert.ok(
  agencySource.includes('const [sellerLeadDocumentUploadingKey, setSellerLeadDocumentUploadingKey] = useState'),
  'seller lead documents should track generic agent upload state',
)

assert.ok(
  agencySource.includes('async function handleSellerLeadDocumentUpload'),
  'seller lead documents should expose a generic agent upload handler',
)

assert.match(
  agencySource,
  /const leadDocuments = \[[\s\S]*?leadRecord\?\.sellerDocuments[\s\S]*?rawPayload\?\.sellerDocuments[\s\S]*?rawPayload\?\.seller_uploaded_documents[\s\S]*?\]/,
  'seller lead document rows should include lead-side agent uploads as source rows',
)

assert.match(
  agencySource,
  /if \(!targetListingId\) \{[\s\S]*?handleCreateListingFromSellerLead/,
  'seller lead document uploads should create a draft listing when no listing is linked yet',
)

assert.match(
  agencySource,
  /uploadPrivateListingDocument\(targetListingId, file, \{[\s\S]*?requirementKey:[\s\S]*?documentCategory:[\s\S]*?status: 'uploaded'/,
  'seller lead document uploads should persist through the private listing document service',
)

assert.match(
  agencySource,
  /const canUploadSellerLeadDocument = selectedLeadIsSeller[\s\S]*?!canUploadSellerLeadSignedMandate[\s\S]*?!canUploadKingstonsDocument/,
  'normal seller document rows should receive a generic upload button without duplicating special-case upload controls',
)

assert.match(
  agencySource,
  /onChange=\{\(event\) => void handleSellerLeadDocumentUpload\(event, documentRow, category\)\}/,
  'seller document rows should wire file inputs to the generic upload handler',
)

assert.match(
  agencySource,
  /sellerDocuments: nextSellerDocuments,[\s\S]*?seller_uploaded_documents: nextSellerDocuments/,
  'uploaded seller documents should be mirrored onto the lead for immediate workspace feedback',
)

console.log('seller lead documents agent upload contract passed')
