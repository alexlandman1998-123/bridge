import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const signing = read('../../supabase/functions/listing-mandate-signing/index.ts')
const signer = read('../src/pages/ListingMandateSigning.jsx')
const agent = read('../src/pages/AgentListingDetail.jsx')

assert.match(signing, /action === "flag-issue"/)
assert.match(signing, /seller_signing_pack_issue_flagged/)
assert.match(signing, /update\(\{ status: "revoked"/)
assert.match(signer, /Something needs correcting\?/) 
assert.match(signer, /Flag issue for correction/)
assert.match(signer, /primaryDocumentContactPending/)
assert.match(agent, /Primary contact/)
assert.match(agent, /Replaced \/ paused/)

console.log('seller mandate experience phase 5 checks passed')
