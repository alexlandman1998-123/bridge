import { expect, test } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ListingSellerInformationEditor from '../ListingSellerInformationEditor.jsx'
import SellerLeadAgentOnboardingEditor from '../../leads/SellerLeadAgentOnboardingEditor.jsx'

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
