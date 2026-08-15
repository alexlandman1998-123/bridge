import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildBondApplicationViewModel } from '../../utils/bondApplicationViewModel.js'
import {
  GUIDED_BOND_APPLICATION_PHASE2_HANDOFF_SECTION,
  GUIDED_BOND_APPLICATION_V2_FLOW_VERSION,
  applyGuidedBondApplicationMetadata,
  buildGuidedBondApplicationProgress,
  buildLegacyBondApplicationPersistencePayload,
  cloneBondApplicationValue,
  createGuidedBondApplicationMetadataPatch,
  createGuidedBondApplicationSaveController,
  fromLegacyBondApplication,
  getGuidedBondApplicationMetadata,
  getPhase2GuidedBondApplicationEligibility,
  shouldUseGuidedBondApplicationV2,
  toLegacyBondApplication,
  validateGuidedBondApplicationScreen,
} from '../index.js'
import { legacyBondApplicationFixtures } from '../__fixtures__/legacyBondApplicationFixtures.js'
import { resolveGuidedBondApplicationV2Flag } from '../../../../lib/guidedBondApplicationFeatureFlag.js'

const testDirectory = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(testDirectory, '../../../../..')

function readFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

function stateFromFixture(key) {
  return fromLegacyBondApplication(legacyBondApplicationFixtures[key].sources.existingBondApplication, {
    portal: legacyBondApplicationFixtures[key].portal,
  })
}

function runFeatureFlagAndEligibilityTests() {
  const eligibleState = stateFromFixture('solePermanentEmployee')
  assert.equal(resolveGuidedBondApplicationV2Flag({ env: {} }).enabled, false)
  assert.deepEqual(
    shouldUseGuidedBondApplicationV2({
      featureFlags: { guidedBondApplicationV2: false },
      applicationState: eligibleState,
      activeBondApplicationTab: 'application',
    }),
    { eligible: false, reason: 'feature_disabled' },
  )
  assert.deepEqual(
    shouldUseGuidedBondApplicationV2({
      featureFlags: { guidedBondApplicationV2: true },
      applicationState: eligibleState,
      activeBondApplicationTab: 'application',
    }),
    { eligible: true, reason: null },
  )
  const emptyShellState = cloneBondApplicationValue(eligibleState)
  emptyShellState.application.applicantStructure = null
  emptyShellState.compatibility.legacyBase.summary.has_co_applicant = ''
  emptyShellState.participants.coApplicant = {
    role: 'co_applicant',
    legacyApplicantKey: 'co_applicant',
    personal: { key: 'co_applicant', label: 'Co-applicant' },
    employment: {},
  }
  assert.equal(
    shouldUseGuidedBondApplicationV2({
      featureFlags: { guidedBondApplicationV2: true },
      applicationState: emptyShellState,
      activeBondApplicationTab: 'application',
    }).eligible,
    true,
  )
  assert.equal(
    shouldUseGuidedBondApplicationV2({
      featureFlags: { guidedBondApplicationV2: true },
      applicationState: eligibleState,
      activeBondApplicationTab: 'offers',
    }).reason,
    'not_application_tab',
  )
  assert.equal(
    getPhase2GuidedBondApplicationEligibility(stateFromFixture('jointApplication'), {
      featureFlags: { guidedBondApplicationV2: true },
      activeBondApplicationTab: 'application',
    }).reason,
    'joint_application',
  )
  assert.equal(
    getPhase2GuidedBondApplicationEligibility(stateFromFixture('soleSelfEmployed'), {
      featureFlags: { guidedBondApplicationV2: true },
      activeBondApplicationTab: 'application',
    }).eligible,
    true,
  )
  assert.equal(
    getPhase2GuidedBondApplicationEligibility(stateFromFixture('financialCommitments'), {
      featureFlags: { guidedBondApplicationV2: true },
      activeBondApplicationTab: 'application',
    }).reason,
    'submitted_application',
  )
}

function runGuidedMetadataTests() {
  const legacy = cloneBondApplicationValue(legacyBondApplicationFixtures.solePermanentEmployee.sources.existingBondApplication)
  legacy.unknown_phase2 = { keep: true }
  const metadata = createGuidedBondApplicationMetadataPatch({
    currentScreenKey: 'employment_details',
    completedScreenKeys: ['application_confirmation', 'applicant_structure'],
    now: '2026-07-28T08:00:00.000Z',
  })
  const withMetadata = applyGuidedBondApplicationMetadata(legacy, metadata)
  assert.equal(getGuidedBondApplicationMetadata(withMetadata).flow_version, GUIDED_BOND_APPLICATION_V2_FLOW_VERSION)
  assert.equal(getGuidedBondApplicationMetadata(withMetadata).current_step_key, 'employment_income')

  const roundTripped = toLegacyBondApplication(fromLegacyBondApplication(withMetadata))
  assert.deepEqual(roundTripped._meta, withMetadata._meta)
  assert.deepEqual(roundTripped.unknown_phase2, { keep: true })

  const viewModel = buildBondApplicationViewModel({
    transaction: legacyBondApplicationFixtures.solePermanentEmployee.sources.transactionInformation,
    buyer: legacyBondApplicationFixtures.solePermanentEmployee.sources.portalBuyer,
    development: legacyBondApplicationFixtures.solePermanentEmployee.sources.developmentInformation,
    unit: legacyBondApplicationFixtures.solePermanentEmployee.sources.unitInformation,
    onboardingFormData: roundTripped,
    reference: 'PHASE2-META',
    statusLabel: roundTripped.status,
  })
  assert.ok(viewModel.applicant.fullName)
  assert.equal(JSON.stringify(viewModel).includes('guided_bond_application_v2'), false)

  const handoffMetadata = createGuidedBondApplicationMetadataPatch({
    existingMetadata: metadata,
    currentScreenKey: 'phase2_completion_handoff',
    handoffReason: 'phase2_completed',
    handoffAt: '2026-07-28T09:00:00.000Z',
    now: '2026-07-28T09:00:00.000Z',
  })
  const handoffState = fromLegacyBondApplication(applyGuidedBondApplicationMetadata(legacy, handoffMetadata))
  assert.equal(
    getPhase2GuidedBondApplicationEligibility(handoffState, {
      featureFlags: { guidedBondApplicationV2: true },
      activeBondApplicationTab: 'application',
    }).reason,
    'phase2_handoff_completed',
  )
}

function runValidationAndProgressTests() {
  const state = stateFromFixture('solePermanentEmployee')
  assert.equal(validateGuidedBondApplicationScreen(state, 'application_confirmation').valid, true)
  const missingFinance = cloneBondApplicationValue(state)
  missingFinance.application.finance.requestedBondAmount = ''
  assert.deepEqual(
    validateGuidedBondApplicationScreen(missingFinance, 'application_confirmation').issues.map((issue) => issue.path),
    ['application.finance.requestedBondAmount'],
  )

  const companyBuyer = cloneBondApplicationValue(state)
  companyBuyer.application.buyerEntity = {
    entityType: 'company',
    name: '',
    registrationNumber: '',
  }
  assert.deepEqual(
    validateGuidedBondApplicationScreen(companyBuyer, 'application_confirmation').issues.map((issue) => issue.path),
    ['application.buyerEntity.name', 'application.buyerEntity.registrationNumber'],
  )

  const missingEmployment = cloneBondApplicationValue(state)
  missingEmployment.participants.primaryApplicant.employment.employer_name = ''
  missingEmployment.participants.primaryApplicant.expenses.gross_salary = ''
  assert.deepEqual(
    validateGuidedBondApplicationScreen(missingEmployment, 'employment_details').issues.map((issue) => issue.code),
    ['required', 'required'],
  )

  const progress = buildGuidedBondApplicationProgress('employment_details', [
    'application_confirmation',
    'applicant_structure',
    'about_you_confirmation',
    'employment_type',
  ])
  assert.equal(progress.currentStep.key, 'employment_income')
  assert.ok(progress.percent > 0 && progress.percent < 100)
}

async function runSaveControllerStaleProtectionTests() {
  const resolvers = {}
  const controller = createGuidedBondApplicationSaveController((state, options) => new Promise((resolve) => {
    resolvers[options.sequence] = () => resolve({ state })
  }))

  const first = controller.save({ value: 'first' })
  const second = controller.save({ value: 'second' })
  resolvers[2]()
  const secondResult = await second
  assert.equal(secondResult.stale, false)
  assert.deepEqual(controller.getLatestSavedState(), { value: 'second' })

  resolvers[1]()
  const firstResult = await first
  assert.equal(firstResult.stale, true)
  assert.deepEqual(controller.getLatestSavedState(), { value: 'second' })
}

function runPersistenceAndHandoffTests() {
  const legacy = cloneBondApplicationValue(legacyBondApplicationFixtures.solePermanentEmployee.sources.existingBondApplication)
  legacy.phase2_passthrough = { falseValue: false, zeroValue: 0, emptyString: '', nullValue: null, emptyArray: [] }
  const state = fromLegacyBondApplication(legacy)
  state.application.applicantStructure = 'joint'
  const roundTripped = toLegacyBondApplication(state)
  assert.equal(roundTripped.summary.has_co_applicant, 'yes')
  assert.deepEqual(roundTripped.phase2_passthrough, legacy.phase2_passthrough)

  const withMetadata = applyGuidedBondApplicationMetadata(roundTripped, createGuidedBondApplicationMetadataPatch({
    currentScreenKey: 'phase2_completion_handoff',
    handoffReason: 'joint_application',
    handoffAt: '2026-07-28T10:00:00.000Z',
    now: '2026-07-28T10:00:00.000Z',
  }))
  const payload = buildLegacyBondApplicationPersistencePayload({
    existingFormData: {
      existing_onboarding_answer: 'keep',
      nested: { keep: true },
      bond_application: legacy,
    },
    legacyBondApplication: withMetadata,
    submitted: false,
  })
  assert.equal(payload.formData.existing_onboarding_answer, 'keep')
  assert.deepEqual(payload.formData.nested, { keep: true })
  assert.equal(payload.formData.bond_application._meta.guided_bond_application_v2.legacy_handoff_reason, 'joint_application')
  assert.equal(payload.draftToPersist.submitted_at, '')
  assert.equal(GUIDED_BOND_APPLICATION_PHASE2_HANDOFF_SECTION, 'income_deductions_expenses')
}

function runClientPortalStaticContractTests() {
  const source = readFile('src/pages/ClientPortal.jsx')
  assert.ok(source.includes("activeBondApplicationTab === 'application'"))
  assert.ok(source.includes('shouldRenderGuidedBondApplication'))
  assert.ok(source.includes('<GuidedBondApplication'))
  assert.ok(source.includes("activeBondApplicationTab === 'offers'"))
  assert.ok(source.includes("activeBondApplicationTab === 'grant'"))
  assert.ok(source.includes("setActiveBondApplicationSectionTab(sectionKey)"))
  assert.equal(source.includes('transaction_bond_applications'), false)

  const guidedSource = readFile('src/modules/bond/application/guided/GuidedBondApplication.jsx')
  assert.equal(guidedSource.includes('summary.'), false)
  assert.equal(guidedSource.includes('transaction_bond_applications'), false)
  assert.ok(guidedSource.includes('aria-live'))
  assert.ok(guidedSource.includes('role="radio"'))
}

await runSaveControllerStaleProtectionTests()
runFeatureFlagAndEligibilityTests()
runGuidedMetadataTests()
runValidationAndProgressTests()
runPersistenceAndHandoffTests()
runClientPortalStaticContractTests()

console.log('Phase 2 guided bond application vertical slice tests passed')
