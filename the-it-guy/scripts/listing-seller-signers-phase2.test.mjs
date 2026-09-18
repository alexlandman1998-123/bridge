import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { buildSellerSigningPlan } from '../src/lib/sellerSigningPlanModel.js'

{
  const plan = buildSellerSigningPlan({ sellerType: 'multiple_owners', form: {
    multipleOwners: [{ fullName: 'Ava Seller', email: 'ava@example.test' }, { fullName: 'Ben Seller', email: 'ben@example.test' }],
  } })
  assert.equal(plan.ready, true)
  assert.equal(plan.recipients.length, 2)
  assert.equal(plan.requiresIndividualSignatures, true)
}

{
  const plan = buildSellerSigningPlan({ sellerType: 'company', form: {
    authorisedSignatoryName: 'Casey Director', authorisedSignatoryEmail: 'casey@example.test',
  } })
  assert.equal(plan.ready, true)
  assert.deepEqual(plan.recipients.map((recipient) => recipient.role), ['Authorised signatory'])
}

{
  const plan = buildSellerSigningPlan({ sellerType: 'married', form: {
    sellerName: 'Ava Seller', sellerEmail: 'ava@example.test', spouseName: 'Ben Seller', spouseEmail: 'ben@example.test', maritalStatus: 'married_in_community',
  } })
  assert.equal(plan.ready, true)
  assert.deepEqual(plan.recipients.map((recipient) => recipient.role), ['Seller', 'Spouse'])
}

{
  const plan = buildSellerSigningPlan({ sellerType: 'trust', form: { authorisedTrusteeName: 'Taylor Trustee', authorisedTrusteeEmail: '' } })
  assert.equal(plan.ready, false)
  assert.match(plan.missing[0], /authorised trustee/i)
}

const [edge, migration, detail] = await Promise.all([
  readFile(new URL('../../supabase/functions/listing-mandate-signing/index.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../supabase/migrations/20260918114553_listing_multi_signer_sessions_phase2.sql', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8'),
])

assert.match(edge, /const signingGroupId = crypto\.randomUUID\(\)/)
assert.match(edge, /signing_group_id: signingGroupId/)
assert.match(edge, /signingLinks: issued/)
assert.match(migration, /add column if not exists signing_group_id uuid/)
assert.match(migration, /groupComplete/)
assert.match(detail, /signers: signingPlan\.recipients/)
assert.match(detail, /listing-seller-signers/)

console.log('listing seller signers phase 2 checks passed.')
