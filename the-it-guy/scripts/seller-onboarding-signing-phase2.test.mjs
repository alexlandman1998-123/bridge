import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')
assert.match(source, /disclosure: false,\s*fica: false,\s*mandate: byKey\.mandate\.ready/)
assert.match(source, /Review onboarding and prepare signing pack/)
assert.match(source, /Mandate-only is the default/)
assert.match(source, /Signers review and confirm them; they do not re-enter them/)
assert.match(source, /primaryDocumentContactEmail/)
assert.match(source, /Proposed conveyancing attorney/)

console.log('seller onboarding signing Phase 2 checks passed')
