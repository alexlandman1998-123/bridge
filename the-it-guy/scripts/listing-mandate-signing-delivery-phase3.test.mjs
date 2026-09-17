import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const listingSource = fs.readFileSync(path.join(process.cwd(), 'src/pages/AgentListingDetail.jsx'), 'utf8')
const emailSource = fs.readFileSync(path.join(process.cwd(), '..', 'supabase/functions/send-email/index.ts'), 'utf8')
const deliveryHandler = listingSource.match(/async function sendListingMandateSigningLink\(\)[\s\S]*?\n  }\n\n  async function handleStartListingMandateDocument/)?.[0] || ''

assert.match(deliveryHandler, /prepareSigningFields\(/)
assert.match(deliveryHandler, /generateSigningLinks\(/)
assert.match(deliveryHandler, /targetSignerRole = normalizeKey\(agentSigner\?\.status\) === 'signed' \? 'seller' : 'agent'/)
assert.match(deliveryHandler, /invokeEdgeFunction\('send-email'/)
assert.match(deliveryHandler, /type: 'seller_mandate_sent'/)
assert.match(deliveryHandler, /createPrivateListingActivity\(/)
assert.match(listingSource, /Send signing link/)
assert.match(emailSource, /handleSellerMandateSentEmail/)
assert.doesNotMatch(emailSource, /SELLER_MANDATE_SIGNING_LINKS_RETIRED/)

console.log('listing mandate signing delivery phase 3 tests passed')
