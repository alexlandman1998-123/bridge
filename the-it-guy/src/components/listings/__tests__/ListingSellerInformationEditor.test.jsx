// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest'
import { createElement, useState } from 'react'
import { cleanup, fireEvent, render as renderEditor, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import ListingSellerInformationEditor from '../ListingSellerInformationEditor.jsx'
import SellerLeadAgentOnboardingEditor from '../../leads/SellerLeadAgentOnboardingEditor.jsx'
import { selectListingSellerProfileBranch, updateListingSellerProfileDraftField } from '../../../lib/listingSellerProfileBuilderModel.js'

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
