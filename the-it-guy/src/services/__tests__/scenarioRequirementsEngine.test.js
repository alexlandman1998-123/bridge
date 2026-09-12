import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveLegalDocumentRequirements, resolveAttorneySigningRequirements } from '../attorneyWorkflow/attorneyDocumentRequirementsResolver.js'
import { resolveMatterScenarioProfile } from '../matterScenarioProfile.js'
import { buildMatterWorkflowPlan, diffMatterWorkflowPlans } from '../attorneyWorkflow/matterWorkflowPlanService.js'
import { mergeRequirementCandidates } from '../documents/mergeRequirementCandidates.js'

test('canonical precedence retains scenario explanations without changing permissions', () => {
  const canonical = { generated: { key: 'id', reviewer: 'attorney' }, source: 'canonical_rule', trace: [{ rule: 'canonical' }] }
  const adapter = { generated: { key: 'id', reviewer: 'buyer' }, source: 'adapter', trace: [{ party_id: 'buyer-1' }] }
  for (const inputs of [[canonical, adapter], [adapter, canonical]]) {
    const [merged] = mergeRequirementCandidates(inputs, generated => generated.key)
    assert.equal(merged.generated.reviewer, 'attorney')
    assert.ok(merged.trace.some(item => item.party_id === 'buyer-1'))
    assert.equal(inputs[0].trace.length, 1)
  }
})

const profile = types => resolveMatterScenarioProfile({ parties: types.map((entityType, i) => ({ id: `buyer-${i}`, role: 'buyer', entityType, name: `Buyer ${i}` })) })
const resolve = scenarioProfile => resolveLegalDocumentRequirements({ routing_profile_json: { scenarioProfile }, purchaser_type: 'company' })

test('mixed-party signing requirements identify only the relevant signatories', () => {
  const result = resolveAttorneySigningRequirements({ routing_profile_json: { scenarioProfile: profile(['individual', 'company', 'trust']) } })
  assert.deepEqual(result.signingRequirements.find(r => r.id === 'buyer_director_resolution_signature').partyRequirements.map(p => p.partyId), ['buyer-1'])
  assert.deepEqual(result.signingRequirements.find(r => r.id === 'buyer_trustee_resolution_signature').partyRequirements.map(p => p.partyId), ['buyer-2'])
  assert.equal(result.signingRequirements.find(r => r.id === 'buyer_transfer_signature').partyRequirements.length, 3)
})

test('every catalogue requirement explains applicability, satisfaction and reviewer', () => {
  for (const r of resolve(profile(['individual', 'company', 'trust'])).requirements) {
    assert.ok(r.applicability.ruleId)
    assert.ok(r.applicability.reason)
    assert.ok(r.applicability.satisfiedBy)
    assert.ok(r.applicability.approvalRole)
  }
})

test('freehold HOA produces HOA documents without inventing sectional title', () => {
  for (const hoa of ['yes', 'no']) {
    const result = resolveLegalDocumentRequirements({ property_tenure: 'freehold', routing_profile_json: { mvpProfile: { hoaApplicable: hoa } } })
    assert.equal(result.requirements.some(r => r.id === 'hoa_levy_clearance'), hoa === 'yes')
    assert.equal(result.requirements.some(r => r.id === 'body_corporate_levy_clearance'), false)
  }
})

test('individual scenario overrides stale company classification', () => {
  const result = resolve(profile(['individual']))
  assert.ok(result.requirements.some(r => r.id === 'buyer_id_document'))
  assert.ok(!result.requirements.some(r => r.id === 'buyer_director_ids'))
})
test('mixed buyers have scoped requirements, not cross-applied entity documents', () => {
  const result = resolve(profile(['individual', 'company', 'trust']))
  for (const [id, partyId] of [['buyer_id_document', 'buyer-0'], ['buyer_director_ids', 'buyer-1'], ['buyer_trust_deed', 'buyer-2']]) {
    assert.deepEqual(result.requirements.find(r => r.id === id).partyRequirements.map(p => p.partyId), [partyId])
  }
})
test('multiple individuals retain distinct requirement instances', () => {
  const requirement = resolve(profile(['individual', 'individual'])).requirements.find(r => r.id === 'buyer_id_document')
  assert.equal(new Set(requirement.partyRequirements.map(p => p.key)).size, 2)
})
test('unknown and unsupported types do not inherit legacy company documents', () => {
  for (const type of ['unknown', 'estate', 'close_corporation']) {
    const result = resolve(profile([type]))
    assert.ok(!result.requirements.some(r => r.id === 'buyer_director_ids'))
    assert.ok(result.warnings.some(w => w.includes('no substitute entity checklist')))
  }
})
test('scenario changes affect plan impact even when stage task counts are unchanged', () => {
  const plan = types => buildMatterWorkflowPlan({ routingProfile: { scenarioProfile: profile(types) } })
  const impact = diffMatterWorkflowPlans(plan(['individual']), plan(['company']))
  assert.equal(impact.changed, true)
  assert.equal(impact.partyRequirementsChanged, true)
})
