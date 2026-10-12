import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(path.join(process.cwd(), 'src/pages/AgentListingDetail.jsx'), 'utf8')

assert.doesNotMatch(source, /Generate HTML mandate|mandateSetupOpen|mandateStartOpen|title="Create Mandate"/)
assert.match(source, /async function handleStartListingMandateDocument/)
assert.match(source, /prepareSellerDocumentAction\('signed_mandate', 'manual_upload'\)/)
assert.match(source, /Create printable mandate/)
assert.match(source, /<PrintableMandateTerms/)
assert.match(source, /Prepare and download mandate/)
assert.match(source, /Sign the downloaded copy, then use Upload signed copy/)

console.log('listing mandate setup phase 1 tests passed')
