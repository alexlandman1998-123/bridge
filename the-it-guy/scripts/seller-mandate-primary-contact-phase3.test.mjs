import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const migration = read('../../supabase/migrations/20260918201425_listing_signing_primary_document_contact_phase3.sql')
const signing = read('../../supabase/functions/listing-mandate-signing/index.ts')
const agent = read('../src/pages/AgentListingDetail.jsx')
const portal = read('../src/pages/ListingMandateSigning.jsx')

assert.match(migration, /is_primary_document_contact boolean not null default true/)
assert.match(migration, /private_listing_signing_group_one_primary_contact_idx/)
assert.match(signing, /primaryDocumentContactEmail/)
assert.match(signing, /Only the primary document contact can change shared seller details/)
assert.match(signing, /The primary document contact must complete the shared details and sign first/)
assert.match(signing, /eq\("signing_group_id", session\.signing_group_id\)/)
assert.match(agent, /Primary document contact/)
assert.match(agent, /primaryDocumentContactEmail: primarySigner\.email/)
assert.match(portal, /primaryDocumentContactPending/)
assert.match(portal, /isPrimaryDocumentContact \? \{ sellerResponses/)

console.log('seller mandate primary contact phase 3 checks passed')
