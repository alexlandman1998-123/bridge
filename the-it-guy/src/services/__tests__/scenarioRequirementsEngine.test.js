import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveLegalDocumentRequirements, resolveAttorneySigningRequirements } from '../attorneyWorkflow/attorneyDocumentRequirementsResolver.js'
import { resolveMatterScenarioProfile } from '../matterScenarioProfile.js'
import { buildMatterWorkflowPlan, diffMatterWorkflowPlans } from '../attorneyWorkflow/matterWorkflowPlanService.js'
import { mergeRequirementCandidates } from '../documents/mergeRequirementCandidates.js'
import { buildTransferWorkspaceViewModel } from '../attorneyWorkflow/transferWorkspaceViewModel.js'

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
test('unknown and specialist types do not inherit legacy company documents', () => {
  for (const type of ['unknown', 'estate', 'insolvency', 'other']) {
    const result = resolve(profile([type]))
    assert.ok(!result.requirements.some(r => r.id === 'buyer_director_ids'))
    assert.ok(result.warnings.some(w => w.includes('no substitute entity checklist')))
  }
})
test('close corporations have their own member authority and beneficial ownership pack', () => {
  const result = resolve(profile(['close_corporation']))
  assert.ok(result.requirements.some(r => r.id === 'buyer_cc_registration'))
  assert.ok(result.requirements.some(r => r.id === 'buyer_cc_resolution'))
  assert.ok(result.requirements.some(r => r.id === 'buyer_cc_beneficial_ownership'))
  assert.ok(!result.requirements.some(r => r.id === 'buyer_company_resolution'))
  assert.deepEqual(result.signingRequirements.find(r => r.id === 'buyer_cc_member_resolution_signature').partyRequirements.map(p => p.partyId), ['buyer-0'])
})
test('trust seller pack includes beneficial ownership and trustee authority', () => {
  const scenario = resolveMatterScenarioProfile({ parties: [
    { id: 'seller-trust', role: 'seller', name: 'Seller Trust', entityType: 'trust' },
  ] })
  const result = resolve(scenario)
  for (const id of ['seller_trust_deed', 'seller_letters_of_authority', 'seller_trustee_resolution', 'seller_trust_beneficial_ownership']) {
    assert.deepEqual(result.requirements.find(r => r.id === id).partyRequirements.map(p => p.partyId), ['seller-trust'])
  }
})
test('foreign passport and marital requirements stay with the affected individual', () => {
  const scenario = resolveMatterScenarioProfile({ parties: [
    { id: 'foreign', role: 'buyer', name: 'Foreign', entityType: 'individual', identityRoute: 'foreign_passport', maritalRegime: 'foreign' },
    { id: 'local', role: 'buyer', name: 'Local', entityType: 'individual', identityRoute: 'sa_id', maritalRegime: 'single' },
  ] })
  const result = resolve(scenario)
  assert.deepEqual(result.requirements.find(r => r.id === 'buyer_passport').partyRequirements.map(p => p.partyId), ['foreign'])
  assert.deepEqual(result.requirements.find(r => r.id === 'buyer_foreign_tax_entry').partyRequirements.map(p => p.partyId), ['foreign'])
  assert.deepEqual(result.requirements.find(r => r.id === 'buyer_foreign_marital_capacity').partyRequirements.map(p => p.partyId), ['foreign'])
  assert.deepEqual(result.requirements.find(r => r.id === 'buyer_id_document').partyRequirements.map(p => p.partyId), ['local'])
})
test('capacity tasks belong to the transfer plan and specialist facts add a hold', () => {
  const ordinary = buildMatterWorkflowPlan({ routingProfile: { scenarioProfile: profile(['company']) } })
  const keys = ordinary.lanes[0].stepKeys
  assert.ok(keys.indexOf('buyer_party_capacity_review') > keys.indexOf('buyer_fica_review'))
  assert.ok(keys.indexOf('seller_party_capacity_review') < keys.indexOf('buyer_signing_review'))
  assert.ok(!keys.includes('party_capacity_specialist_review'))
  const specialist = buildMatterWorkflowPlan({ routingProfile: { scenarioProfile: profile(['estate']) } })
  assert.ok(specialist.lanes[0].stepKeys.includes('party_capacity_specialist_review'))
  const unusualMarriage = buildMatterWorkflowPlan({ routingProfile: { scenarioProfile: resolveMatterScenarioProfile({ parties: [
    { id: 'buyer', role: 'buyer', entityType: 'individual', maritalRegime: 'other' },
  ] }) } })
  assert.ok(unusualMarriage.lanes[0].stepKeys.includes('party_capacity_specialist_review'))
})
test('transfer task shows each buyer decision separately', () => {
  const scenarioProfile = profile(['individual', 'company'])
  const workflowPlan = buildMatterWorkflowPlan({ routingProfile: { scenarioProfile } })
  const model = buildTransferWorkspaceViewModel({
    workflow: { workflowPlan, facts: { scenarioProfile }, lane: { laneKey: 'transfer', steps: [] } },
    selectedTaskKey: 'buyer_party_capacity_review',
  })
  assert.equal(model.selectedTask.partyCapacity.parties.length, 2)
  assert.equal(model.selectedTask.completionReadiness.canComplete, false)
  assert.ok(model.selectedTaskContext.checklistItems.some(item => item.label.includes('Buyer 0')))
  assert.ok(model.selectedTaskContext.checklistItems.some(item => item.label.includes('Buyer 1')))
})
test('scenario changes affect plan impact even when stage task counts are unchanged', () => {
  const plan = types => buildMatterWorkflowPlan({ routingProfile: { scenarioProfile: profile(types) } })
  const impact = diffMatterWorkflowPlans(plan(['individual']), plan(['company']))
  assert.equal(impact.changed, true)
  assert.equal(impact.partyRequirementsChanged, true)
})
