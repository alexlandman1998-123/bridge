import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { buildBondApplicationViewModel } from '../src/modules/bond/utils/bondApplicationViewModel.js'
import {
  buildNormalizedBondApplicationFromState,
  fromLegacyBondApplication,
} from '../src/modules/bond/application/index.js'
import { legacyBondApplicationFixtures } from '../src/modules/bond/application/__fixtures__/legacyBondApplicationFixtures.js'

const root = process.cwd()

function buildViewModelFromFixture(fixture, overrides = {}) {
  const legacy = fixture.sources.existingBondApplication
  return buildBondApplicationViewModel({
    transaction: fixture.sources.transactionInformation,
    buyer: fixture.sources.portalBuyer,
    development: fixture.sources.developmentInformation,
    unit: fixture.sources.unitInformation,
    onboarding: { status: legacy.status },
    onboardingFormData: {
      formData: {
        ...fixture.sources.buyerOnboardingInformation.formData,
        bond_application: legacy,
      },
    },
    statusLabel: legacy.status,
    ...overrides,
  })
}

function fieldByKey(viewModel, key) {
  return viewModel.fieldAlignment.fields.find((field) => field.key === key)
}

function assertField(viewModel, key, expectedValue) {
  const field = fieldByKey(viewModel, key)
  assert.ok(field, `missing field ${key}`)
  assert.equal(field.captured, true, `${key} should be captured`)
  if (expectedValue !== undefined) assert.deepEqual(field.value, expectedValue, `${key} value mismatch`)
}

const fixture = legacyBondApplicationFixtures.financialCommitments
const legacyViewModel = buildViewModelFromFixture(fixture)

assert.equal(legacyViewModel.fieldAlignment, legacyViewModel.originatorFieldAlignment)
assert.equal(legacyViewModel.fieldAlignment.source, 'buyer_portal_bond_application')
assert.equal(legacyViewModel.fieldAlignment.target, 'bond_originator_view_model')
assert.equal(legacyViewModel.fieldAlignment.totalCount >= 40, true)
assert.equal(legacyViewModel.fieldAlignment.sections.Application.captured >= 3, true)
assert.equal(legacyViewModel.fieldAlignment.sections['Banking & Liabilities'].captured >= 5, true)

assertField(legacyViewModel, 'status', 'Submitted')
assertField(legacyViewModel, 'submitted_at', '2026-02-13T09:15:00.000Z')
assertField(legacyViewModel, 'selected_banks', ['ABSA', 'Nedbank', 'Other'])
assertField(legacyViewModel, 'primary_identity_number', '9001015000088')
assertField(legacyViewModel, 'primary_email', 'lerato.nkosi@example.test')
assertField(legacyViewModel, 'residential_address_street', '14 Sample Street')
assertField(legacyViewModel, 'employer_name', 'Sample Logistics (Pty) Ltd')
assertField(legacyViewModel, 'gross_salary', '72000')
assertField(legacyViewModel, 'primary_bank_name', 'ABSA')
assertField(legacyViewModel, 'home_loan_1_outstanding_balance', '820000')
assertField(legacyViewModel, 'total_assets', '2020000')
assertField(legacyViewModel, 'total_liabilities', '1053500')
assertField(legacyViewModel, 'net_asset_value', '966500')
assertField(legacyViewModel, 'currently_under_debt_review', 'no')
assertField(legacyViewModel, 'declaration_accepted', true)
assertField(legacyViewModel, 'digital_signature_name', 'Lerato Nkosi')

const state = fromLegacyBondApplication(fixture.sources.existingBondApplication)
const normalizedApplication = buildNormalizedBondApplicationFromState({
  applicationState: state,
  transactionId: fixture.sources.transactionInformation.id,
  onboardingFormDataId: 'phase-6-onboarding-form-data',
})
const normalizedViewModel = buildViewModelFromFixture(fixture, {
  bondApplication: normalizedApplication,
})

assert.equal(normalizedViewModel.canonical.storageMode, 'normalized_v1')
assertField(normalizedViewModel, 'selected_banks', ['ABSA', 'Nedbank', 'Other'])
assertField(normalizedViewModel, 'primary_identity_number', '9001015000088')
assertField(normalizedViewModel, 'primary_bank_name', 'ABSA')
assertField(normalizedViewModel, 'home_loan_1_outstanding_balance', '820000')
assertField(normalizedViewModel, 'total_assets', 2020000)
assertField(normalizedViewModel, 'total_liabilities', '1053500')
assertField(normalizedViewModel, 'net_asset_value', '966500')

const [viewModelSource, persistenceSource, phase6Doc] = await Promise.all([
  readFile(resolve(root, 'src/modules/bond/utils/bondApplicationViewModel.js'), 'utf8'),
  readFile(resolve(root, 'src/modules/bond/application/bondApplicationPersistence.js'), 'utf8'),
  readFile(resolve(root, 'docs/bond-application/phase-6-originator-field-alignment.md'), 'utf8'),
])

assert.match(viewModelSource, /fieldAlignment/)
assert.match(viewModelSource, /originatorFieldAlignment/)
assert.match(viewModelSource, /buyer_portal_bond_application/)
assert.equal(persistenceSource.includes('transaction_bond_applications'), false)
assert.match(phase6Doc, /Originator Field Alignment/)
assert.match(phase6Doc, /originatorFieldAlignment/)

console.log('Bond application email plumbing Phase 6 checks passed.')
