import { buildBuyerPartyReadiness } from './buyerPartyReadiness.js'

export const BUYER_PARTY_ACTION_QUEUE_VERSION = 'transaction_buyer_parties_phase7_v1'

const text = (value) => String(value ?? '').trim().toLowerCase()
const complete = (value) => ['completed', 'captured', 'manually_captured'].includes(text(value))

export function buildBuyerPartyActionQueue(parties = []) {
  const readiness = buildBuyerPartyReadiness(parties)
  const active = (Array.isArray(parties) ? parties : []).filter((party) => !['removed', 'inactive'].includes(text(party.status)) && !party.removed_at)
  const actions = []
  active.forEach((party, index) => {
    const name = party.participant_name || `Buyer ${index + 1}`
    if (party.signing_required !== false && !complete(party.buyer_onboarding_status)) actions.push({ key: `onboarding:${party.id}`, kind: 'onboarding', partyId: party.id, title: `Complete onboarding: ${name}`, detail: 'Required signer has not completed onboarding.', priority: 'high' })
    if (!complete(party.buyer_profile_status)) actions.push({ key: `fica:${party.id}`, kind: 'fica', partyId: party.id, title: `Capture FICA profile: ${name}`, detail: 'Buyer profile is not yet captured or complete.', priority: 'high' })
  })
  if (readiness.ownershipTotal !== null && !readiness.ownershipComplete) actions.push({ key: 'ownership:missing', kind: 'ownership', title: 'Complete buyer ownership', detail: 'Ownership has been supplied for only some buyer parties.', priority: 'medium' })
  if (readiness.ownershipComplete && readiness.ownershipTotal !== null && Math.abs(readiness.ownershipTotal - 100) > 0.01) actions.push({ key: 'ownership:total', kind: 'ownership', title: 'Correct buyer ownership total', detail: `Ownership currently totals ${readiness.ownershipTotal.toFixed(2)}%, not 100%.`, priority: 'high' })
  if (active.length && !active.some((party) => party.is_primary_buyer)) actions.push({ key: 'primary:missing', kind: 'primary_buyer', title: 'Assign a primary buyer', detail: 'One active buyer must be designated as the primary buyer.', priority: 'high' })
  return Object.freeze({ version: BUYER_PARTY_ACTION_QUEUE_VERSION, readiness, actions: Object.freeze(actions), outstandingCount: actions.length })
}
