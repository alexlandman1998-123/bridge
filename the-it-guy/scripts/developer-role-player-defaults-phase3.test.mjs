import { readDomainApiSource } from './helpers/domainApiSource.mjs'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const files = {
  api: await readDomainApiSource(),
  onboarding: await readFile(new URL('../src/pages/ClientOnboarding.jsx', import.meta.url), 'utf8'),
  portal: await readFile(new URL('../src/pages/ClientPortal.jsx', import.meta.url), 'utf8'),
}

for (const requiredApiToken of [
  'normalizeBuyerBondOriginatorPolicy',
  'getBuyerAppointedBondOriginatorRequest',
  'processBuyerAppointedBondOriginatorRequest',
  'buyer_bond_originator_request',
  'buyer_bond_originator_request',
  'roleplayer_change_requested',
  "selectionSource: 'buyer_appointed'",
  "bond_assignment_source: 'buyer_appointed'",
]) {
  assert(files.api.includes(requiredApiToken), `api.js should include ${requiredApiToken}`)
}

assert(
  files.api.includes("status = 'pending_approval'") &&
    files.api.includes("status = 'approved'") &&
    files.api.includes("status = 'not_allowed'"),
  'buyer-appointed bond originator requests should record pending, approved, and not-allowed states',
)

assert(
  files.api.includes("roleTypes: ['agent', 'developer']") &&
    files.api.includes("dedupePrefix: 'buyer-bond-originator-request'"),
  'pending buyer-appointed originator requests should notify agent/developer role players',
)

for (const token of ['resolveBuyerOnboardingFlow', 'ooba_assist_requested', 'bond_originator_name', 'sanitizeClientFormData']) {
  assert(files.onboarding.includes(token), `Current buyer finance capture must retain ${token}`)
}
assert(!files.onboarding.includes("sectionConfig.key === 'bond_originator_support'"), 'The removed nomination section must not return alongside current finance capture')

for (const requiredPortalToken of [
  'resolveBuyerBondOriginatorRequest',
  'buyerBondOriginatorRequest',
  'Buyer request pending approval',
  'Buyer-appointed originator approved',
  'This development uses the appointed bond originator.',
  'extraDetail: buyerBondOriginatorRequestMessage',
]) {
  assert(files.portal.includes(requiredPortalToken), `ClientPortal should include ${requiredPortalToken}`)
}

console.log('Developer role-player defaults Phase 3 contract passed.')
