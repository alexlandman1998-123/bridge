import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const files = {
  api: await readFile(new URL('../src/lib/api.js', import.meta.url), 'utf8'),
  unitDetail: await readFile(new URL('../src/pages/UnitDetail.jsx', import.meta.url), 'utf8'),
}

for (const requiredApiToken of [
  'resolveBuyerAppointedBondOriginatorRequest',
  'buyer_bond_originator_request_resolved',
  'updateTransactionBondOriginatorFromBuyerRequest',
  "normalizedDecision === 'approved'",
  "normalizedDecision === 'rejected'",
  'roleplayer_change_requested',
]) {
  assert(files.api.includes(requiredApiToken), `api.js should include ${requiredApiToken}`)
}

assert(
  files.api.includes("status: normalizedDecision") &&
    files.api.includes('resolvedByRole: normalizedActorRole') &&
    files.api.includes('rejectionReason: normalizedDecision ==='),
  'resolved buyer-appointed originator requests should persist decision metadata to onboarding form data',
)

assert(
  files.api.includes("['agent', 'agency_admin', 'developer', 'internal_admin', 'admin', 'platform_admin']") &&
    files.api.includes('Your role does not have permission to resolve buyer-appointed bond originator requests.'),
  'resolution should be permission-gated to transaction coordinators/admins',
)

for (const requiredUnitDetailToken of [
  'resolveBuyerAppointedBondOriginatorRequest',
  'resolveBuyerBondOriginatorRequestFromOnboarding',
  'buyerBondOriginatorRequestPending',
  'canResolveBuyerBondOriginatorRequest',
  'Buyer-appointed originator request',
  'handleResolveBuyerBondOriginatorRequest',
  'Finance ownership has been updated.',
  'Rejection reason:',
]) {
  assert(files.unitDetail.includes(requiredUnitDetailToken), `UnitDetail should include ${requiredUnitDetailToken}`)
}

assert(
  files.unitDetail.includes("handleResolveBuyerBondOriginatorRequest('approved')") &&
    files.unitDetail.includes("handleResolveBuyerBondOriginatorRequest('rejected')"),
  'transaction workspace should expose approve and reject actions for pending requests',
)

console.log('Developer role-player defaults Phase 4 contract passed.')
