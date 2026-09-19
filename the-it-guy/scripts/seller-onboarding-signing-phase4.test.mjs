import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')
assert.match(source, /sellerMandateSignatureRoute/)
assert.match(source, /Arrange manual mandate signature/)
assert.match(source, /status: 'awaiting_upload'/)
assert.match(source, /sellerMandateSignatureRoute === 'manual_upload'/)
assert.match(source, /No digital link will be sent/)
assert.match(source, /mandate will remain unsigned until that evidence is recorded/)
assert.match(source, /Send digital signing pack/)

console.log('seller onboarding signing Phase 4 checks passed')
