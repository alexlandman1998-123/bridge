import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const files = {
  api: await readFile(new URL('../src/lib/api.js', import.meta.url), 'utf8'),
  portal: await readFile(new URL('../src/pages/ClientPortal.jsx', import.meta.url), 'utf8'),
  activityFeed: await readFile(
    new URL('../src/services/clientPortalActivityFeedService.js', import.meta.url),
    'utf8',
  ),
}

for (const requiredApiToken of [
  'buyerAppointedSelection',
  'propagateTransactionRoleplayersIfPossible',
  "selectionSource: 'buyer_appointed'",
  "activationTrigger: 'buyer_onboarding_approved_originator'",
  "visibility: 'client_visible'",
  "audience: 'buyer'",
  "actionRoute: normalizedDecision === 'approved' ? 'team' : 'progress'",
]) {
  assert(files.api.includes(requiredApiToken), `api.js should include ${requiredApiToken}`)
}

assert(
  files.api.includes('rolePlayers: [buyerAppointedSelection]') &&
    files.api.includes("finance_managed_by: 'bond_originator'"),
  'approved buyer-appointed originators should propagate into role-player participant/workspace handling',
)

assert(
  files.portal.includes('Buyer-appointed originator not approved') &&
    files.portal.includes('Buyer-appointed originator approved'),
  'client portal should show approved and rejected buyer-appointed originator outcomes',
)

for (const requiredActivityToken of [
  'buyer_bond_originator_request_resolved',
  'Bond originator request updated',
  'Your buyer-appointed bond originator request has been reviewed.',
]) {
  assert(
    files.activityFeed.includes(requiredActivityToken),
    `clientPortalActivityFeedService should include ${requiredActivityToken}`,
  )
}

console.log('Developer role-player defaults Phase 5 contract passed.')
