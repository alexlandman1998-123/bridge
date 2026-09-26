import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getAttorneyStageDefinitionsForLane } from '../src/constants/attorneyWorkflowStages.js'
import { resolveMatterScenarioProfile, partyCapacityCheckRequirements, partyCapacityReviewReady, applyPartyCapacityDecisions } from '../src/services/matterScenarioProfile.js'
import { buildMatterWorkflowPlan, diffMatterWorkflowPlans, getMatterWorkflowPlanStepKeys, inspectMatterWorkflowPlanSnapshot } from '../src/services/attorneyWorkflow/matterWorkflowPlanService.js'
import { SPECIALIST_ROUTE_TASKS, requiredSpecialistRouteKeys } from '../src/services/attorneyWorkflow/specialistRoutePolicy.js'

const actor = { canReview: true, userId: 'transfer-attorney', now: '2026-09-26T14:00:00Z' }
const individual = (id, role, overrides = {}) => ({ id, role, name: id, entityType: 'individual', maritalRegime: 'single', identityRoute: 'sa_id', taxResidence: 'south_africa', ownershipShare: 100, ...overrides })
const company = (id, role, overrides = {}) => ({ id, role, name: id, entityType: 'company', taxResidence: 'south_africa', ownershipShare: 100,
  representatives: [{ id: `${id}-signer`, name: 'Director', capacity: 'Director' }], ...overrides })
const trust = (id, role, overrides = {}) => ({ id, role, name: id, entityType: 'trust', taxResidence: 'south_africa', ownershipShare: 100,
  representatives: [{ id: `${id}-trustee`, name: 'Trustee', capacity: 'Trustee' }], ...overrides })
const scenario = (parties, extra = {}) => resolveMatterScenarioProfile({ parties, ...extra })
const profile = (parties, overrides = {}) => ({
  financeType: 'cash', propertyTenure: 'freehold', hoaApplicable: 'no', sellerHasExistingBond: false,
  transferTaxDecision: { route: 'transfer_duty', dutyPaymentRequired: 'yes', sarsStatus: 'receipted' },
  mvpProfile: { propertyConditions: { titleRestrictions: 'no', complianceCertificates: 'no' } },
  matterProfile: { status: 'confirmed', revision: 1, factFingerprint: 'acceptance-facts' },
  scenarioProfile: scenario(parties), ...overrides,
})
const planFor = input => buildMatterWorkflowPlan({ routingProfile: input })
const steps = (plan, lane = 'transfer') => new Set(getMatterWorkflowPlanStepKeys(plan, lane))
const includesAll = (actual, expected, label) => expected.forEach(key => assert.ok(actual.has(key), `${label}: missing ${key}`))
const excludesAll = (actual, excluded, label) => excluded.forEach(key => assert.ok(!actual.has(key), `${label}: unexpected ${key}`))

// Agreed matrix: each row checks the branch facts, lane composition and the
// consequential tasks, not merely a total checklist count.
const cases = [
  {
    name: 'company cash, unbonded freehold',
    input: profile([company('buyer-company', 'buyer'), company('seller-company', 'seller')]),
    lanes: ['transfer'],
    required: ['buyer_party_capacity_review', 'seller_party_capacity_review', 'cash_funding_source_review',
      'payment_security_review', 'transfer_duty_tdc01_submission', 'transfer_duty_assessment_payment', 'municipal_rates_clearance_review'],
    absent: ['body_corporate_levy_clearance_review', 'hoa_clearance_review', 'specialist_classification_review'],
  },
  {
    name: 'bonded individual seller and company buyer',
    input: profile([company('buyer-company', 'buyer'), individual('seller', 'seller')], { financeType: 'bond', sellerHasExistingBond: true }),
    lanes: ['transfer', 'bond', 'cancellation'],
    required: ['buyer_party_capacity_review', 'seller_party_capacity_review', 'payment_security_review'],
    absent: ['cash_funding_source_review'],
    bond: ['bank_conditions_resolved', 'guarantee_wording_accepted', 'bond_lodgement_instructions_confirmed'],
    cancellation: ['cancellation_figures_received', 'cancellation_guarantee_allocation_review', 'cancellation_consent_confirmed'],
  },
  {
    name: 'trust sectional title, cash, no seller bond',
    input: profile([individual('buyer', 'buyer'), trust('seller-trust', 'seller')], { propertyTenure: 'sectional_title' }),
    lanes: ['transfer'],
    required: ['seller_party_capacity_review', 'body_corporate_levy_clearance_review', 'cash_funding_source_review'],
    absent: ['hoa_clearance_review'],
  },
  {
    name: 'mixed sellers, one non-resident, foreign buyer',
    input: profile([
      individual('buyer-foreign', 'buyer', { identityRoute: 'foreign_passport', taxResidence: 'outside_south_africa' }),
      individual('seller-local', 'seller', { ownershipShare: 50 }),
      company('seller-foreign', 'seller', { ownershipShare: 50, taxResidence: 'outside_south_africa' }),
    ], { transferTaxDecision: { route: 'transfer_duty', dutyPaymentRequired: 'yes',
      nonResidentSellers: { 'seller-foreign': { applicable: 'yes', directiveStatus: 'issued', withholdingRequired: 'yes' } } } }),
    lanes: ['transfer'],
    required: ['non_resident_seller_applicability_review', 'non_resident_seller_directive_review',
      'non_resident_seller_withholding_payment_review', 'buyer_party_capacity_review', 'seller_party_capacity_review'],
  },
  {
    name: 'VAT going concern',
    input: profile([company('buyer-company', 'buyer'), company('seller-company', 'seller')], {
      transferTaxDecision: { route: 'zero_rated_going_concern', sarsStatus: 'receipted' },
    }),
    lanes: ['transfer'], required: ['going_concern_zero_rate_verified', 'sars_transfer_tax_receipt_verified'],
    absent: ['transfer_duty_assessment_payment', 'ordinary_vat_basis_verified', 'transfer_duty_exemption_basis_verified'],
  },
  {
    name: 'claimed exemption, estate and court order',
    input: profile([individual('buyer', 'buyer'), { id: 'estate-seller', role: 'seller', name: 'Estate', entityType: 'estate',
      taxResidence: 'south_africa', ownershipShare: 100, representatives: [{ id: 'executor', name: 'Executor', capacity: 'Executor' }] }], {
      transferTaxDecision: { route: 'exempt', exemptionClaims: [{ applicable: 'yes', statutoryBasis: 'Attorney review', appliesTo: 'Seller', evidenceReference: 'Estate file', basisNote: 'Review' }] },
      scenarioProfile: scenario([individual('buyer', 'buyer'), { id: 'estate-seller', role: 'seller', name: 'Estate', entityType: 'estate',
        taxResidence: 'south_africa', ownershipShare: 100, representatives: [{ id: 'executor', name: 'Executor', capacity: 'Executor' }] }],
        { specialistRoutes: { court_order_divorce: { active: true, status: 'pending' } } }),
    }),
    lanes: ['transfer'], required: ['transfer_duty_exemption_basis_verified', 'specialist_classification_review'],
    absent: [SPECIALIST_ROUTE_TASKS.deceased_estate, SPECIALIST_ROUTE_TASKS.court_order_divorce, 'transfer_duty_assessment_payment'],
  },
  {
    name: 'share block, agricultural issue and unusual title',
    input: profile([individual('buyer', 'buyer'), individual('seller', 'seller')], {
      propertyTenure: 'share_block',
      mvpProfile: { propertyConditions: { titleRestrictions: 'yes', complianceCertificates: 'no' } },
      scenarioProfile: scenario([individual('buyer', 'buyer'), individual('seller', 'seller')], {
        specialistRoutes: { agricultural_land: { active: true, status: 'pending' }, unusual_title: { active: true, status: 'pending' } },
      }),
    }),
    lanes: ['transfer'], required: ['specialist_classification_review', 'title_conditions_review'],
    absent: [SPECIALIST_ROUTE_TASKS.share_block, SPECIALIST_ROUTE_TASKS.agricultural_land, SPECIALIST_ROUTE_TASKS.unusual_title],
  },
]

for (const entry of cases) {
  const plan = planFor(entry.input)
  assert.deepEqual(plan.laneKeys, entry.lanes, entry.name)
  for (const lane of plan.lanes) {
    const definitions = new Map(getAttorneyStageDefinitionsForLane(lane.laneKey).map(item => [item.key, item]))
    for (const stepKey of lane.stepKeys) {
      const task = definitions.get(stepKey)
      assert.ok(task?.label && task?.description && task?.ownerRole && task?.operationalContract,
        `${entry.name}: ${lane.laneKey}/${stepKey} lacks a reviewable task definition`)
    }
  }
  includesAll(steps(plan), entry.required, entry.name)
  excludesAll(steps(plan), entry.absent || [], entry.name)
  if (entry.bond) includesAll(steps(plan, 'bond'), entry.bond, entry.name)
  if (entry.cancellation) includesAll(steps(plan, 'cancellation'), entry.cancellation, entry.name)
}

const reviewPacketPath = process.argv.find(arg => arg.startsWith('--review-packet='))?.slice('--review-packet='.length)
function writeReviewPacket() {
  const packet = {
    generatedAt: new Date().toISOString(),
    purpose: 'Professional review of synthetic conveyancing scenario task plans; no legal approval is implied.',
    scenarios: cases.map(entry => {
      const plan = planFor(entry.input)
      return {
        name: entry.name,
        planVersion: plan.version,
        facts: {
          financeType: entry.input.financeType,
          propertyTenure: entry.input.propertyTenure,
          sellerHasExistingBond: entry.input.sellerHasExistingBond,
          transferTaxRoute: entry.input.transferTaxDecision?.route,
          parties: entry.input.scenarioProfile.parties.map(party => ({ role: party.role, entityType: party.entityType,
            identityRoute: party.identityRoute, taxResidence: party.taxResidence, ownershipShare: party.ownershipShare })),
        },
        lanes: plan.lanes.map(lane => {
          const definitions = new Map(getAttorneyStageDefinitionsForLane(lane.laneKey).map(item => [item.key, item]))
          return { laneKey: lane.laneKey, tasks: lane.stepKeys.map(stepKey => {
            const task = definitions.get(stepKey)
            return { key: stepKey, label: task.label, description: task.description, ownerRole: task.ownerRole,
              evidenceRequirements: task.evidenceRequirements || [] }
          }) }
        }),
      }
    }),
  }
  writeFileSync(reviewPacketPath, JSON.stringify(packet, null, 2))
}

const foreignBuyer = cases[3].input.scenarioProfile.parties.find(p => p.id === 'buyer-foreign')
assert.ok(partyCapacityCheckRequirements(foreignBuyer).some(check => check.key === 'foreign_tax_entry'))
assert.equal(cases[3].input.scenarioProfile.parties.filter(p => p.role === 'seller').length, 2)
assert.equal(requiredSpecialistRouteKeys(cases[5].input.scenarioProfile).sort().join(','), 'court_order_divorce,deceased_estate')
assert.equal(requiredSpecialistRouteKeys(cases[6].input.scenarioProfile, 'share_block').sort().join(','), 'agricultural_land,share_block,unusual_title')

// Corrections introduce and retire tasks while preserving recorded historical
// outcomes in the read-only inspection. Unknown facts do not mean "no".
const original = cases[0].input
const originalPlan = planFor(original)
const sortJsonKeys = value => Array.isArray(value) ? value.map(sortJsonKeys)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sortJsonKeys(value[key])])) : value
const databaseOrdered = inspectMatterWorkflowPlanSnapshot({ routingProfile: sortJsonKeys({ ...original, workflowPlan: originalPlan }),
  lanes: originalPlan.lanes.map(lane => ({ laneKey: lane.laneKey,
    steps: lane.stepKeys.map(stepKey => ({ step_key: stepKey, status: 'not_started' })) })) })
assert.equal(databaseOrdered.planCurrent, true, 'JSONB key ordering must not create false plan drift')
const financed = { ...original, financeType: 'hybrid', sellerHasExistingBond: true }
const financedPlan = planFor(financed)
assert.deepEqual(financedPlan.laneKeys, ['transfer', 'bond', 'cancellation'])
assert.ok(diffMatterWorkflowPlans(originalPlan, financedPlan).addedLanes.includes('bond'))
const taxCorrected = { ...original, transferTaxDecision: { route: 'vat' } }
const taxCorrectedPlan = planFor(taxCorrected)
const taxImpact = diffMatterWorkflowPlans(originalPlan, taxCorrectedPlan)
assert.ok(taxImpact.addedSteps.some(item => item.stepKey === 'ordinary_vat_basis_verified'))
assert.ok(taxImpact.removedSteps.some(item => item.stepKey === 'transfer_duty_assessment_payment'))
const unknownFinance = planFor({ ...original, financeType: 'unknown' })
assert.deepEqual(unknownFinance.laneKeys, ['transfer'])
assert.ok(!steps(unknownFinance).has('cash_funding_source_review'))

const reviewed = structuredClone(original.scenarioProfile)
reviewed.parties[0].capacityReview = { status: 'cleared', note: 'Reviewed', reviewedBy: 'attorney', reviewedAt: actor.now,
  confirmations: Object.fromEntries(partyCapacityCheckRequirements(reviewed.parties[0]).map(check => [check.key, true])),
  reviewedFacts: null }
assert.equal(partyCapacityReviewReady(reviewed.parties[0]), false, 'a bare decision without a fact snapshot is insufficient')
const changedParty = structuredClone(original.scenarioProfile)
changedParty.parties[0].entityType = 'trust'
const changedPlan = planFor({ ...original, scenarioProfile: changedParty })
assert.equal(diffMatterWorkflowPlans(originalPlan, changedPlan).partyRequirementsChanged, true)

const estateInput = cases[5].input
const estateApproved = structuredClone(estateInput.scenarioProfile)
for (const key of ['deceased_estate', 'court_order_divorce']) estateApproved.specialistRoutes[key] = {
  active: true, status: 'confirmed', owner: 'Transfer specialist', reason: 'Authority and instrument reviewed',
  instrument: 'deeds_transfer', evidenceReference: `${key} opinion`,
}
const signed = applyPartyCapacityDecisions(estateInput.scenarioProfile, estateApproved, { ...actor,
  propertyTenure: estateInput.propertyTenure, propertyConditions: estateInput.mvpProfile.propertyConditions })
const specialistPlan = planFor({ ...estateInput, scenarioProfile: signed })
includesAll(steps(specialistPlan), [SPECIALIST_ROUTE_TASKS.deceased_estate, SPECIALIST_ROUTE_TASKS.court_order_divorce], 'specialist approval')
const alteredEstate = structuredClone(signed)
alteredEstate.parties[1].representatives[0].name = 'Replacement executor'
const stalePlan = planFor({ ...estateInput, scenarioProfile: alteredEstate })
excludesAll(steps(stalePlan), [SPECIALIST_ROUTE_TASKS.deceased_estate, SPECIALIST_ROUTE_TASKS.court_order_divorce], 'stale specialist review')

const correctedRows = taxCorrectedPlan.lanes.map(lane => ({ laneKey: lane.laneKey,
  steps: lane.stepKeys.map(stepKey => ({ step_key: stepKey, status: 'not_started' })) }))
correctedRows[0].steps.push({ step_key: 'transfer_duty_assessment_payment', status: 'completed' })
const inspection = inspectMatterWorkflowPlanSnapshot({ routingProfile: { ...taxCorrected, workflowPlan: originalPlan }, lanes: correctedRows })
assert.equal(inspection.storedVersion, originalPlan.version)
assert.equal(inspection.candidateVersion, taxCorrectedPlan.version)
assert.equal(inspection.impact.changed, true)
assert.ok(inspection.preservedHistoricalRows.some(row => row.stepKey === 'transfer_duty_assessment_payment' && row.status === 'completed'))
assert.equal(inspection.requiresReconciliation, true)
correctedRows[0].steps.find(row => row.step_key === 'lodgement_ready').status = 'completed'
const unsafe = inspectMatterWorkflowPlanSnapshot({ routingProfile: { ...taxCorrected, workflowPlan: originalPlan }, lanes: correctedRows })
assert.ok(unsafe.readinessRisks.some(item => item.reason === 'readiness_on_stale_plan'))
assert.ok(unsafe.readinessRisks.some(item => item.reason === 'unresolved_before_readiness'))
correctedRows[0].steps.find(row => row.step_key === 'payment_security_review').status = 'not_applicable'
const bypassed = inspectMatterWorkflowPlanSnapshot({ routingProfile: { ...taxCorrected, workflowPlan: originalPlan }, lanes: correctedRows })
assert.ok(bypassed.readinessRisks.some(item => item.stepKey === 'payment_security_review' && item.reason === 'reviewed_completion_required'))
const changedFingerprint = inspectMatterWorkflowPlanSnapshot({ routingProfile: {
  ...original, matterProfile: { ...original.matterProfile, factFingerprint: 'corrected' }, workflowPlan: originalPlan,
}, lanes: originalPlan.lanes.map(lane => ({ laneKey: lane.laneKey,
  steps: lane.stepKeys.map(stepKey => ({ step_key: stepKey, status: 'not_started' })) })) })
assert.equal(changedFingerprint.requiresReconciliation, true, 'a stale fact fingerprint requires review even when task keys match')

const temp = mkdtempSync(join(tmpdir(), 'attorney-conveyancing-acceptance-'))
try {
  const snapshotPath = join(temp, 'snapshot.json')
  const matterId = '00000000-0000-0000-0000-000000000601'
  writeFileSync(snapshotPath, JSON.stringify({ matters: [{ id: matterId,
    routingProfile: { ...original, workflowPlan: originalPlan },
    lanes: originalPlan.lanes.map(lane => ({ laneKey: lane.laneKey,
      steps: lane.stepKeys.map(stepKey => ({ step_key: stepKey, status: 'not_started' })) })),
  }] }))
  const cli = 'scripts/inspect-attorney-conveyancing-matters.mjs'
  const clean = JSON.parse(execFileSync(process.execPath, [cli, `--snapshot=${snapshotPath}`, '--require-clean'], { encoding: 'utf8' }))
  assert.equal(clean.inspectionClean, true)
  assert.equal(clean.releaseReady, null, 'a clean inspection is not professional release approval')
  const duplicateLanePath = join(temp, 'duplicate-lane.json')
  const validMatter = JSON.parse(readFileSync(snapshotPath, 'utf8')).matters[0]
  writeFileSync(duplicateLanePath, JSON.stringify({ matters: [{ ...validMatter,
    lanes: [...validMatter.lanes, validMatter.lanes[0]] }] }))
  assert.throws(() => execFileSync(process.execPath, [cli, `--snapshot=${duplicateLanePath}`],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }), /Command failed/)
  const evidencePath = join(temp, 'release-evidence.json')
  writeFileSync(evidencePath, JSON.stringify({ planVersion: originalPlan.version, cohortMatterIds: [matterId] }))
  assert.throws(() => execFileSync(process.execPath, [cli, `--snapshot=${snapshotPath}`, `--release-evidence=${evidencePath}`],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }), /Command failed/)
  const reviewed = Object.fromEntries(['transfer', 'bond', 'cancellation'].map(role => [role, {
    reviewer: `${role} fixture reviewer`, completedAt: '2026-09-26T14:00:00Z',
    planVersion: originalPlan.version, evidenceReference: `${role} fixture evidence`,
  }]))
  writeFileSync(evidencePath, JSON.stringify({ planVersion: originalPlan.version, sourceRef: 'a'.repeat(40),
    stagingMigrationReference: 'staging fixture ledger', maxCohortSize: 1, cohortMatterIds: [matterId],
    scenarioMatrixApproved: true, scenarioMatrixEvidenceReference: 'fixture matrix review',
    professionalReviews: reviewed, stagingWalkthroughs: reviewed }))
  const releaseFixture = JSON.parse(execFileSync(process.execPath,
    [cli, `--snapshot=${snapshotPath}`, `--release-evidence=${evidencePath}`], { encoding: 'utf8' }))
  assert.equal(releaseFixture.releaseReady, true, 'complete fixture evidence passes the gate')
} finally {
  rmSync(temp, { recursive: true, force: true })
}

if (reviewPacketPath) writeReviewPacket()
console.log(`Conveyancing acceptance matrix passed: ${cases.length} scenarios, corrections, specialist holds, history and readiness inspection.`)
