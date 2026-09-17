import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(path.join(process.cwd(), 'src/pages/AgentListingDetail.jsx'), 'utf8')
const setupHandler = source.match(/async function saveMandateSetup\(\)[\s\S]*?\n  }\n\n  async function sendListingMandateSigningLink/)?.[0] || ''

assert.match(setupHandler, /await saveCommissionDraft\(\)/)
assert.match(setupHandler, /await handleStartListingMandateDocument\(\{[\s\S]*?sourceMode: DOCUMENT_START_SOURCE_MODES\.saved/)
assert.match(setupHandler, /legalScenario: listingMandateLegalScenario/)
assert.doesNotMatch(setupHandler, /send-email|send-mandate-signing-email|legal-document-job-runner/)
assert.match(source, /Generate HTML mandate/)
assert.match(source, /secure HTML signing draft/)

console.log('listing HTML mandate phase 2 tests passed')
