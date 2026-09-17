import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(path.join(process.cwd(), 'src/pages/AgentListingDetail.jsx'), 'utf8')

assert.match(source, /const \[mandateSetupOpen, setMandateSetupOpen\] = useState\(false\)/)
assert.match(source, /function openMandateSetup\(\)/)
assert.match(source, /async function saveMandateSetup\(\)/)
assert.match(source, /Enter the commission percentage before preparing the mandate\./)
assert.match(source, /Choose the VAT treatment before preparing the mandate\./)
assert.match(source, /Add a valid seller email before preparing the mandate\./)
assert.match(source, /documentMatchesSellerPackTransactionKey\(doc, SELLER_BASE_PACK_KEYS\.SIGNED_MANDATE\) && !isListingDocumentComplete\(doc\)/)
assert.match(source, /Generate Mandate/)
assert.match(source, /title="Generate mandate"/)
assert.match(source, /Confirm the saved details, then prepare the mandate as the secure HTML signing draft\. No email is sent yet\./)
assert.match(source, /Generate HTML mandate/)
assert.match(source, /await handleStartListingMandateDocument\(\{[\s\S]*?sourceMode: DOCUMENT_START_SOURCE_MODES\.saved/)

console.log('listing mandate setup phase 1 tests passed')
