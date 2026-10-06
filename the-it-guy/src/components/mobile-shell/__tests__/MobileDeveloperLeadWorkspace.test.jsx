// @vitest-environment jsdom
import React from 'react'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it } from 'vitest'
import MobileDeveloperLeadWorkspace from '../MobileDeveloperLeadWorkspace.jsx'

afterEach(cleanup)
const saved = { developerLeadId: 'lead-one', developerOrgId: 'org-one', leadOwner: 'developer', buyerFullName: 'Saved Buyer', buyerEmail: 'buyer@example.test', buyerPhone: '+27 82 555 0198', leadStatus: 'viewing', unitTypeInterest: 'A two-bedroom home', nextActionNote: 'Confirm the viewing with the buyer.', publicReference: 'P24-1001', budgetMin: 2000000, budgetMax: 2500000, primaryDevelopmentId: 'dev-one', convertedTransactionId: 'tx-one', createdAt: '2026-10-05T23:30:00Z' }
const setup = (lead) => render(<MemoryRouter><MobileDeveloperLeadWorkspace lead={lead} /></MemoryRouter>)

it('keeps the saved contact actions, interest, budget and linked work together without inventing progress', () => {
  setup(saved)
  expect(screen.getByRole('heading', { name: 'Saved Buyer' })).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Call Saved Buyer' }).getAttribute('href')).toBe('tel:+27825550198')
  expect(screen.getByRole('link', { name: 'Email Saved Buyer' }).getAttribute('href')).toBe('mailto:buyer@example.test')
  expect(screen.getByText('Confirm the viewing with the buyer.')).toBeTruthy()
  expect(screen.getByText('A two-bedroom home')).toBeTruthy()
  expect(screen.getByText(/R\s*2\s*000\s*000.*R\s*2\s*500\s*000/)).toBeTruthy()
  expect(screen.getByRole('link', { name: 'View development' }).getAttribute('href')).toBe('/mobile/development/dev-one')
  expect(screen.getByRole('link', { name: /Open transaction/ }).getAttribute('href')).toBe('/mobile/transaction/tx-one')
  expect(screen.getByText('06 Oct 2026')).toBeTruthy()
})

it('preserves agency protection even if unmasked private fields reach the view', () => {
  setup({ ...saved, leadOwner: 'agency', ownershipModel: 'agency_introduced', sourceAgencyOrgId: 'agency-two', visibilityState: 'limited', qualificationNote: 'Private qualification', privateNotes: 'Private buyer notes' })
  expect(screen.queryByRole('heading', { name: 'Saved Buyer' })).toBeNull()
  expect(screen.queryByText('buyer@example.test')).toBeNull()
  expect(screen.queryByText('+27 82 555 0198')).toBeNull()
  expect(screen.queryByRole('link', { name: /Call|Email/ })).toBeNull()
  expect(screen.queryByText('Private buyer notes')).toBeNull()
  expect(screen.queryByText('Private qualification')).toBeNull()
  expect(screen.getByText(/protected until the agency completes handover/)).toBeTruthy()
})

it('keeps opaque source references out of the profile while retaining their full value in details', () => {
  const reference = 'a'.repeat(64)
  setup({ ...saved, buyerFullName: '', publicReference: reference, buyerEmail: '', buyerPhone: '', nextActionNote: '', convertedTransactionId: '', primaryDevelopmentId: '' })
  expect(screen.getByRole('heading', { name: 'Buyer lead' })).toBeTruthy()
  expect(within(screen.getByRole('region', { name: 'Lead profile' })).queryByText(reference)).toBeNull()
  expect(screen.getByText(reference)).toBeTruthy()
  expect(screen.queryByRole('link', { name: /Call|Email|Open transaction|View development/ })).toBeNull()
  expect(screen.getByText('Contact details not recorded.')).toBeTruthy()
  expect(screen.getByText('No next action recorded.')).toBeTruthy()
})

it('retains complete multiline notes and only presents contact actions for usable saved details', () => {
  const note = 'Buyer needs a larger home.\nProperty24 reference: ' + 'b'.repeat(64)
  setup({ ...saved, buyerPhone: 'Phone pending', buyerEmail: 'not recorded', privateNotes: note })
  expect(screen.getByText((_, element) => element.tagName === 'P' && element.textContent === note)).toBeTruthy()
  expect(screen.queryByRole('link', { name: /Call|Email/ })).toBeNull()
})
