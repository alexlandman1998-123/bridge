// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import SellerProgressPage from '../seller/SellerProgressPage.jsx'
import { buildSellerListingJourneyPresentation } from '../../../core/clientPortal/sellerProgressPresentationModel.js'
import { buildClientTransferJourneyPresentation } from '../../../core/clientPortal/transferJourneyPresentationModel.js'

afterEach(cleanup)
const listingProgress = {
  steps: [{ key: 'onboarding', label: 'Onboarding', state: 'completed' }, { key: 'submitted', label: 'Submitted', state: 'current' }, { key: 'mandate_signed', label: 'Mandate Signed', state: 'upcoming' }],
  currentKey: 'submitted', percent: 33, helperMessage: 'Your agent is reviewing onboarding.',
}
const defaults = { propertyTitle: 'Only Realty listing', partyName: 'Seller', listingProgress, documentsPath: '/documents', marketingPath: '/marketing', offersPath: '/offers', nextAction: { title: 'Upload the signed mandate', label: 'View required items', href: '/documents' }, gate: { offerCount: 0, description: 'Transfer starts after an accepted offer.' } }
const Page = (props) => <MemoryRouter><SellerProgressPage {...defaults} {...props} /></MemoryRouter>

it('uses the overview listing milestones and moves the active stage when refreshed', () => {
  const { rerender } = render(<Page />)
  expect(screen.getByText('33%')).toBeTruthy()
  expect(screen.getByText('The listing process')).toBeTruthy()
  expect(screen.queryByText('The conveyancing process')).toBeNull()
  expect(screen.getByRole('button', { name: /Submitted We are here/ }).getAttribute('aria-expanded')).toBe('true')
  expect(screen.getByRole('link', { name: 'View required items' }).getAttribute('href')).toBe('/documents')
  fireEvent.click(screen.getByRole('button', { name: /Mandate Signed/ }))
  expect(screen.getByRole('button', { name: /Mandate Signed/ }).getAttribute('aria-expanded')).toBe('true')
  rerender(<Page listingProgress={{ ...listingProgress, currentKey: 'mandate_signed', percent: 50, steps: listingProgress.steps.map((step) => ({ ...step, state: step.key === 'mandate_signed' ? 'current' : 'completed' })) }} />)
  expect(screen.getByText('50%')).toBeTruthy()
  expect(screen.getByRole('button', { name: /Mandate Signed We are here/ }).getAttribute('aria-expanded')).toBe('true')
  expect(screen.getByRole('button', { name: /Submitted/ }).getAttribute('aria-expanded')).toBe('false')
})

it('does not infer listing completion from position or expose legal stages before conversion', () => {
  const model = buildSellerListingJourneyPresentation({ listingProgress })
  expect(model.stages.map((stage) => stage.status)).toEqual(['completed', 'in_progress', 'not_started'])
  expect(model.progressPercent).toBe(33)
  render(<Page transferJourney={{ status: 'ready', stages: [] }} />)
  expect(screen.getByText('The listing process')).toBeTruthy()
})

it('shows the same attorney milestones as the buyer while selecting only seller-visible updates', () => {
  const legalJourney = { status: 'ready', snapshot: { clientTransferMilestones: [{ key: 'instruction', status: 'completed' }, { key: 'fica', status: 'waiting' }, { key: 'rates', status: 'not_started' }] } }
  const update = (recipient, message) => ({ laneKey: 'transfer', visibility: 'client_visible', clientRecipients: [recipient], message, createdAt: '2026-10-03T08:00:00Z', metadata: { journeyBrief: { version: 1, stageKey: 'fica', currentStatus: message } } })
  const args = { legalJourney, attorneyUpdates: [update('buyer', 'Buyer-only update'), update('seller', 'Seller document review')] }
  const seller = buildClientTransferJourneyPresentation({ ...args, audience: 'seller' })
  const buyer = buildClientTransferJourneyPresentation({ ...args, audience: 'buyer' })
  expect(seller.stages.map(({ key, status }) => ({ key, status }))).toEqual(buyer.stages.map(({ key, status }) => ({ key, status })))
  render(<Page isTransaction transferJourney={seller} />)
  expect(screen.getByText('The conveyancing process')).toBeTruthy()
  expect(screen.getAllByText('Seller document review').length).toBeGreaterThan(0)
  expect(screen.queryByText('Buyer-only update')).toBeNull()
  expect(screen.queryByText('The listing process')).toBeNull()
})

it('does not substitute old percentage guesses when canonical transaction data is unavailable', () => {
  render(<Page isTransaction transactionJourney={{ source: 'seller-legacy', steps: [], progressPercent: 80 }} transferJourney={{ status: 'unavailable' }} />)
  expect(screen.getByRole('status').textContent).toContain('temporarily unavailable')
  expect(screen.queryByText('80%')).toBeNull()
})
