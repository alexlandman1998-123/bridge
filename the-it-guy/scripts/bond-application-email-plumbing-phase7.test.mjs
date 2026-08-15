import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { buildBondApplicationViewModel } from '../src/modules/bond/utils/bondApplicationViewModel.js'
import { legacyBondApplicationFixtures } from '../src/modules/bond/application/__fixtures__/legacyBondApplicationFixtures.js'

const root = process.cwd()

const fixture = legacyBondApplicationFixtures.solePermanentEmployee
const incompleteApplication = {
  ...fixture.sources.existingBondApplication,
  applicants: fixture.sources.existingBondApplication.applicants.map((applicant) => ({ ...applicant })),
  contact_address: {
    ...fixture.sources.existingBondApplication.contact_address,
    email_address: '',
    residential_address_street: '',
  },
  employment: {
    ...fixture.sources.existingBondApplication.employment,
    primary: {
      ...fixture.sources.existingBondApplication.employment.primary,
      employer_name: '',
    },
  },
}
incompleteApplication.applicants[0].email = ''

const viewModel = buildBondApplicationViewModel({
  transaction: fixture.sources.transactionInformation,
  buyer: { ...fixture.sources.portalBuyer, email: '' },
  development: fixture.sources.developmentInformation,
  unit: fixture.sources.unitInformation,
  onboarding: { status: incompleteApplication.status },
  onboardingFormData: {
    formData: {
      ...fixture.sources.buyerOnboardingInformation.formData,
      email: '',
      street_address: '',
      bond_application: incompleteApplication,
    },
  },
  statusLabel: incompleteApplication.status,
})

assert.equal(viewModel.fieldAlignment, viewModel.originatorFieldAlignment)
assert.equal(viewModel.originatorFieldAlignment.source, 'buyer_portal_bond_application')
assert.ok(viewModel.originatorFieldAlignment.missingKeys.includes('primary_email'))
assert.ok(viewModel.originatorFieldAlignment.missingKeys.includes('residential_address_street'))
assert.ok(viewModel.originatorFieldAlignment.missingKeys.includes('employer_name'))

const [attorneyDetailSource, phase7Doc] = await Promise.all([
  readFile(resolve(root, 'src/pages/AttorneyTransactionDetail.jsx'), 'utf8'),
  readFile(resolve(root, 'docs/bond-application/phase-7-originator-alignment-panel.md'), 'utf8'),
])

assert.match(attorneyDetailSource, /bondApplicationViewModel\.originatorFieldAlignment/)
assert.match(attorneyDetailSource, /bondApplicationFieldAlignmentSections/)
assert.match(attorneyDetailSource, /bondApplicationFieldAlignmentMissingFields/)
assert.match(attorneyDetailSource, /Buyer Portal Field Alignment/)
assert.match(attorneyDetailSource, /Missing Fields/)
assert.match(attorneyDetailSource, /originator fields matched/)

assert.match(phase7Doc, /Originator Alignment Panel/)
assert.match(phase7Doc, /Buyer Portal Field Alignment/)
assert.match(phase7Doc, /originatorFieldAlignment\.capturedCount/)

console.log('Bond application email plumbing Phase 7 checks passed.')
