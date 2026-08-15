import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import {
  buildBondApplicationPdfHtml,
  buildBondApplicationViewModel,
} from '../src/modules/bond/utils/bondApplicationViewModel.js'
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

const html = buildBondApplicationPdfHtml(viewModel, '2026-08-15T10:00:00.000Z')

assert.match(html, /Buyer Portal Field Alignment/)
assert.match(html, /Missing Originator Fields/)
assert.match(html, /fields matched/)
assert.match(html, /Primary Applicant/)
assert.match(html, /Contact &amp; Address/)
assert.match(html, /Email/)
assert.match(html, /Residential address/)
assert.match(html, /Employer name/)
assert.match(html, /Missing/)

const completeFields = viewModel.originatorFieldAlignment.fields.map((field) => ({
  ...field,
  captured: true,
  value: field.value || 'captured',
  displayValue: field.displayValue === 'Not captured' ? 'Captured' : field.displayValue,
}))
const completeSections = Object.entries(viewModel.originatorFieldAlignment.sections).reduce((accumulator, [key, section]) => {
  accumulator[key] = {
    total: section.total,
    captured: section.total,
    missing: 0,
  }
  return accumulator
}, {})
const completeViewModel = {
  ...viewModel,
  fieldAlignment: {
    ...viewModel.fieldAlignment,
    fields: completeFields,
    sections: completeSections,
    capturedCount: completeFields.length,
    totalCount: completeFields.length,
    missingKeys: [],
  },
}
completeViewModel.originatorFieldAlignment = completeViewModel.fieldAlignment
const completeHtml = buildBondApplicationPdfHtml(completeViewModel, '2026-08-15T10:00:00.000Z')
assert.match(completeHtml, /Buyer Portal Field Alignment/)
assert.match(completeHtml, /All tracked buyer portal fields are available/)

const [viewModelSource, phase8Doc] = await Promise.all([
  readFile(resolve(root, 'src/modules/bond/utils/bondApplicationViewModel.js'), 'utf8'),
  readFile(resolve(root, 'docs/bond-application/phase-8-originator-handoff-pdf-alignment.md'), 'utf8'),
])

assert.match(viewModelSource, /Buyer Portal Field Alignment/)
assert.match(viewModelSource, /Missing Originator Fields/)
assert.match(viewModelSource, /fieldAlignmentPercent/)
assert.match(phase8Doc, /Originator Handoff PDF Alignment/)
assert.match(phase8Doc, /buildBondApplicationPdfHtml/)

console.log('Bond application email plumbing Phase 8 checks passed.')
