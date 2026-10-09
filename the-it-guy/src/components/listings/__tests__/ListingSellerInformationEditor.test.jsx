// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest'
import { createElement, useState } from 'react'
import { cleanup, fireEvent, render as renderEditor, screen, within } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import ListingSellerInformationEditor from '../ListingSellerInformationEditor.jsx'
import SellerLeadAgentOnboardingEditor from '../../leads/SellerLeadAgentOnboardingEditor.jsx'
import { selectListingSellerProfileBranch, updateListingSellerProfileDraftField } from '../../../lib/listingSellerProfileBuilderModel.js'
import { PROPERTY_DISCLOSURE_QUESTIONS } from '../../../lib/propertyDisclosure.js'
import PropertyDisclosureQuestionnaire from '../../onboarding/PropertyDisclosureQuestionnaire.jsx'

afterEach(cleanup)

function render(branch, Component = ListingSellerInformationEditor) {
  return renderToStaticMarkup(createElement(Component, { draft: { branch, bondStatus: 'unknown', ratesTaxes: 0 }, onChange: () => {} }))
}

for (const branch of ['company', 'close_corporation', 'foreign_company', 'trust', 'foreign_trust', 'deceased_estate', 'power_of_attorney', 'other']) {
  test(`${branch} exposes contact and authority capture without individual-only fields`, () => {
    const html = render(branch)
    expect(html).toContain('Contact person full name')
    expect(html).not.toContain('>First name<')
    expect(html).not.toContain('Marital status')
    expect(html.toLowerCase()).toContain('authority')
    expect(html).toContain('<option value="unknown" selected="">Not known</option>')
  })
}

test('foreign individual has a passport field and no entity registration question', () => {
  const html = render('foreign_individual')
  expect(html).toContain('Passport number')
  expect(html).not.toContain('>ID number<')
  expect(html.toLowerCase()).not.toContain('registration')
})

test('agent onboarding does not duplicate shared company authority inputs', () => {
  const html = render('company', SellerLeadAgentOnboardingEditor)
  expect(html).toContain('value="0"')
  expect(html.match(/Company resolution date/g)).toHaveLength(1)
  expect(html.match(/Authority basis/g)).toHaveLength(1)
})

test('agent capture offers dual mandates and the second agency', () => {
  const html = renderToStaticMarkup(createElement(SellerLeadAgentOnboardingEditor, { draft: { branch: 'close_corporation', mandateType: 'dual' }, onChange: () => {} }))
  expect(html).toContain('value="close_corporation" selected=""')
  expect(html).toContain('value="dual" selected=""')
  expect(html).toContain('Second agency name')
  expect(html).toContain('Signatory ID / passport')
})

test('changing the legal owner updates the displayed entity fields and seeds multiple owner cards', () => {
  function Editor() {
    const [draft, setDraft] = useState({ branch: 'individual', sellerFirstName: 'Current', sellerSurname: 'Owner' })
    return <ListingSellerInformationEditor draft={draft} onChange={(key, value) => setDraft(previous => key === 'branch'
      ? selectListingSellerProfileBranch(previous, value)
      : updateListingSellerProfileDraftField(previous, key, value))} />
  }
  renderEditor(<Editor />)
  fireEvent.change(screen.getByLabelText('Legal owner type'), { target: { value: 'company' } })
  expect(screen.getByLabelText('Company / CC name')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Company / CC name'), { target: { value: 'Previous Company' } })
  fireEvent.change(screen.getByLabelText('Legal owner type'), { target: { value: 'trust' } })
  expect(screen.queryByLabelText('Company / CC name')).toBeNull()
  expect(screen.getByLabelText('Trust name')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Legal owner type'), { target: { value: 'multiple_owners' } })
  expect(screen.getAllByLabelText('First name')).toHaveLength(2)
  fireEvent.change(screen.getByLabelText('Legal owner type'), { target: { value: 'company' } })
  expect(screen.getByLabelText('Company / CC name').value).toBe('')
})

test('saving locks ownership controls until the save finishes', () => {
  const { rerender } = renderEditor(<ListingSellerInformationEditor draft={{ branch: 'company' }} saving />)
  expect(screen.getByLabelText('Legal owner type').matches(':disabled')).toBe(true)
  expect(screen.getByLabelText('Company / CC name').matches(':disabled')).toBe(true)
  rerender(<ListingSellerInformationEditor draft={{ branch: 'company' }} saving={false} />)
  expect(screen.getByLabelText('Legal owner type').matches(':disabled')).toBe(false)
})

test('agent onboarding presents shared identity and FICA questions once with one consent confirmation', () => {
  renderEditor(<SellerLeadAgentOnboardingEditor draft={{ branch: 'individual', saResident: false, politicallyExposedPerson: false, popiConsentAccepted: true }} onChange={() => {}} />)
  for (const label of ['Date of birth', 'Nationality', 'Residential address', 'Income tax number', 'Occupation or business activity', 'Source of funds / wealth']) {
    expect(screen.getAllByLabelText(label)).toHaveLength(1)
  }
  expect(screen.getByLabelText('SA resident').value).toBe('no')
  expect(screen.getByLabelText('Is the seller, an owner / controller or a representative politically exposed?').value).toBe('no')
  expect(screen.getByLabelText('I confirm the seller gave consent to capture and process these details for onboarding.').checked).toBe(true)
  expect(screen.queryByText('POPI consent')).toBeNull()
})

test('profile FICA and consent controls save the displayed selection', () => {
  const changes = []
  renderEditor(<ListingSellerInformationEditor draft={{ branch: 'trust', trustFounders: [], trustBeneficiaries: [], popiConsent: 'Accepted' }} onChange={(key, value) => changes.push([key, value])} />)
  expect(screen.getAllByText('Beneficiaries')).toHaveLength(1)
  fireEvent.change(screen.getByLabelText(/POPI consent/), { target: { value: 'No' } })
  fireEvent.change(screen.getByLabelText('Source of funds / wealth'), { target: { value: 'Inheritance' } })
  expect(changes).toEqual([['popiConsent', 'No'], ['sourceOfFunds', 'Inheritance']])
})

test('agent capture presents all disclosure questions and records answers, explanations and comments without a signature control', () => {
  function Editor() {
    const [draft, setDraft] = useState({ branch: 'individual', propertyDisclosure: { responses: {} } })
    return <SellerLeadAgentOnboardingEditor draft={draft} onChange={(key, value) => setDraft(previous => ({ ...previous, [key]: value }))} />
  }
  const { container } = renderEditor(<Editor />)
  const table = within(screen.getByRole('table'))
  expect(table.getAllByRole('radio')).toHaveLength(PROPERTY_DISCLOSURE_QUESTIONS.length * 3)
  fireEvent.click(table.getByLabelText('Question 1: Yes'))
  fireEvent.change(table.getByLabelText('Describe the issue or uncertainty for question 1'), { target: { value: 'Seller reports a fault.' } })
  expect(table.getByLabelText('Question 1: Yes').checked).toBe(true)
  expect(table.getByLabelText('Describe the issue or uncertainty for question 1').value).toBe('Seller reports a fault.')
  fireEvent.change(table.getByLabelText('Provide quantity'), { target: { value: '0' } })
  expect(table.getByLabelText('Provide quantity').value).toBe('0')
  fireEvent.change(screen.getByLabelText('21. Comments or explanation for any of the above'), { target: { value: 'Agent captured by phone.' } })
  expect(screen.getByLabelText('21. Comments or explanation for any of the above').value).toBe('Agent captured by phone.')
  expect(screen.getByText(/1 \/ 20 answered/)).toBeTruthy()
  expect(container.querySelector('canvas')).toBeNull()
  expect(screen.queryByText('Seller Declaration')).toBeNull()
})

test('signed disclosure answers and all agent fields lock while saving', () => {
  const { rerender } = renderEditor(<SellerLeadAgentOnboardingEditor draft={{ branch: 'individual', disclosureLocked: true }} />)
  expect(screen.getByRole('table').querySelector('input').matches(':disabled')).toBe(true)
  expect(screen.getByText(/answers are locked/)).toBeTruthy()
  expect(screen.getByLabelText('City').matches(':disabled')).toBe(false)
  rerender(<SellerLeadAgentOnboardingEditor draft={{ branch: 'individual' }} saving />)
  expect(screen.getByLabelText('City').matches(':disabled')).toBe(true)
  expect(screen.getByLabelText('21. Comments or explanation for any of the above').matches(':disabled')).toBe(true)
})

test('seller review renders the same captured answers and explanations as read-only', () => {
  const { container } = renderEditor(<PropertyDisclosureQuestionnaire disclosure={{ responses: { electrical_faults: { answer: 'yes', note: 'Light trips.' } }, comments: 'Seller to confirm.' }} disabled />)
  const table = within(screen.getByRole('table'))
  expect(table.getByLabelText('Question 1: Yes').checked).toBe(true)
  expect(table.getByLabelText('Describe the issue or uncertainty for question 1').value).toBe('Light trips.')
  expect(screen.getByLabelText('21. Comments or explanation for any of the above').value).toBe('Seller to confirm.')
  expect(Array.from(container.querySelectorAll('input, textarea, button')).every(control => control.matches(':disabled'))).toBe(true)
})
