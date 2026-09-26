import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveMatterScenarioProfile, scenarioIssues, scenarioFingerprint, prepopulateMatterScenarioProfile, describeScenarioChanges, applyPartyCapacityDecisions, partyCapacityReviewReady, partyCapacityCheckRequirements } from '../matterScenarioProfile.js'
import { resolveTransactionRoutingProfile } from '../transactionRoutingProfileService.js'

test('participant prepopulation retains separate identities without assuming mixed-party types', () => {
  const profile = prepopulateMatterScenarioProfile({ legacy: { buyerEntityType: 'company' }, participants: [
    { participantId: 'a', roleType: 'buyer', participantName: 'A', entityType: 'individual' },
    { participantId: 'b', roleType: 'buyer', participantName: 'B' },
    { participantId: 'c', roleType: 'seller', participantName: 'Removed', stakeholderStatus: 'removed' },
    { participantId: 'd', roleType: 'developer', participantName: 'Contact, not proven seller' },
  ], transaction: { seller_name: 'Recorded seller' } })
  assert.deepEqual(profile.parties.map(p => p.entityType), ['individual', 'unknown', 'unknown'])
  assert.equal(profile.parties[2].name, 'Recorded seller')
  assert.equal(profile.parties[0].id, 'buyer:a')
  assert.equal(profile.parties[0].ownershipShare, null)
})

test('prepopulation does not overwrite saved attorney facts, including explicit empty parties', () => {
  const saved = resolveMatterScenarioProfile({ parties: [] })
  assert.deepEqual(prepopulateMatterScenarioProfile({ saved, transaction: { buyer_name: 'New source' } }), saved)
})

test('profile changes describe affected review areas without mutating prior state', () => {
  const before = prepopulateMatterScenarioProfile({ transaction: { buyer_name: 'A' } })
  const after = structuredClone(before)
  after.parties[0].entityType = 'company'
  after.parties[0].representatives.push({ id: 'rep', name: 'B', capacity: 'Director' })
  const changes = describeScenarioChanges(before, after)
  assert.ok(changes.some(c => c.includes('identity and authority')))
  assert.ok(changes.some(c => c.includes('signing authority')))
  assert.equal(before.parties[0].entityType, 'unknown')
})

test('mixed buyers remain separate and survive persisted JSON reload', () => {
  const scenario = resolveMatterScenarioProfile({ parties: [
    { id: 'a', role: 'buyer', entityType: 'individual', name: 'A', maritalRegime: 'single', ownershipShare: 50 },
    { id: 'b', role: 'buyer', entityType: 'company', name: 'B', ownershipShare: 50, representatives: [{ id: 'r', name: 'Director', capacity: 'Director' }] },
    { id: 's', role: 'seller', entityType: 'trust', name: 'S', ownershipShare: 100, representatives: [{ id: 't', name: 'Trustee', capacity: 'Trustee' }] },
  ] })
  assert.deepEqual(scenarioIssues(scenario), [])
  const result = resolveTransactionRoutingProfile({ transaction: { routing_profile_json: { scenarioProfile: JSON.parse(JSON.stringify(scenario)) } } })
  assert.deepEqual(result.scenarioProfile, scenario)
  assert.ok(result.scenarioIssues.some(x => x.includes('legacy workflow classification')))
  assert.equal(scenarioFingerprint(scenario), scenarioFingerprint({ ...scenario, parties: [...scenario.parties].reverse() }))
})

test('unknown facts are not assumed; party changes invalidate profile fingerprint', () => {
  const seed = resolveMatterScenarioProfile(null, { buyerEntityType: 'individual', sellerEntityType: 'company' })
  assert.ok(scenarioIssues(seed).some(x => x.includes('marital capacity')))
  assert.ok(scenarioIssues(seed).some(x => x.includes('representative')))
  const resolve = scenarioProfile => resolveTransactionRoutingProfile({ transaction: { routing_profile_json: { scenarioProfile } } }).matterProfile
  const before = resolve(seed)
  const changed = structuredClone(seed)
  changed.parties[0].maritalRegime = 'in_community'
  assert.notEqual(before.factFingerprint, resolve(changed).factFingerprint)
  assert.equal(before.status, 'needs_facts')
})

test('invalid and conflicting ownership totals remain explicit', () => {
  const profile = resolveMatterScenarioProfile({ parties: [{ id: 'a', role: 'buyer', ownershipShare: 120 }] })
  assert.ok(scenarioIssues(profile).some(x => x.includes('at most 100')))
  assert.ok(scenarioIssues(profile).some(x => x.includes('Add at least one seller')))
})

test('attorney review is scoped to one party and expires when its facts change', () => {
  const pending = resolveMatterScenarioProfile({ parties: [
    { id: 'company', role: 'buyer', name: 'Company', entityType: 'company', ownershipShare: 100,
      taxResidence: 'south_africa', representatives: [{ id: 'director', name: 'Director', capacity: 'Director' }] },
    { id: 'seller', role: 'seller', name: 'Seller', entityType: 'individual', maritalRegime: 'single',
      identityRoute: 'sa_id', taxResidence: 'south_africa', ownershipShare: 100 },
  ] })
  const proposed = structuredClone(pending)
  proposed.parties[0].capacityReview = { ...proposed.parties[0].capacityReview, status: 'cleared', note: 'CIPC, beneficial owner, resolution and signer checked.' }
  assert.throws(() => applyPartyCapacityDecisions(pending, proposed, { canReview: false }), /Only an attorney/)
  assert.throws(() => applyPartyCapacityDecisions(pending, proposed, { canReview: true, userId: 'attorney-1', now: '2026-09-26T12:00:00Z' }), /confirm identity/)
  proposed.parties[0].capacityReview.confirmations = Object.fromEntries(partyCapacityCheckRequirements(proposed.parties[0]).map(check => [check.key, true]))
  const cleared = applyPartyCapacityDecisions(pending, proposed, { canReview: true, userId: 'attorney-1', now: '2026-09-26T12:00:00Z' })
  assert.equal(partyCapacityReviewReady(cleared.parties[0]), true)
  assert.equal(partyCapacityReviewReady(cleared.parties[1]), false)
  assert.equal(scenarioFingerprint(cleared), scenarioFingerprint(pending), 'review outcome does not change routing facts')
  const changed = structuredClone(cleared)
  changed.parties[0].representatives[0].name = 'New Director'
  assert.equal(partyCapacityReviewReady(changed.parties[0]), false)
  const saved = applyPartyCapacityDecisions(cleared, changed, { canReview: true, userId: 'attorney-1', now: '2026-09-26T13:00:00Z' })
  assert.equal(saved.parties[0].capacityReview.status, 'pending')
})
