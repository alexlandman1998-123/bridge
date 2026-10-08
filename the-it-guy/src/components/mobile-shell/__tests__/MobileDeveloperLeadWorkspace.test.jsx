// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import MobileDeveloperLeadWorkspace from '../MobileDeveloperLeadWorkspace.jsx'

const documentMocks = vi.hoisted(() => ({ read: vi.fn(async () => ({ state: 'awaiting_onboarding', documents: [], requirements: [] })) }))
vi.mock('../../../services/documents/developerLeadDocumentsService.js', () => ({ fetchDeveloperLeadDocuments: documentMocks.read, uploadDeveloperLeadDocument: vi.fn() }))
vi.mock('../../../hooks/useTransactionLiveRefresh.js', () => ({ default: () => ({ lastErrorMessage: '' }) }))

afterEach(cleanup)
const saved = { developerLeadId: 'lead-one', developerOrgId: 'org-one', leadOwner: 'developer', buyerFullName: 'Saved Buyer', buyerEmail: 'buyer@example.test', buyerPhone: '+27 82 555 0198', leadStatus: 'viewing', unitTypeInterest: 'A two-bedroom home', nextActionNote: 'Confirm the viewing with the buyer.', publicReference: 'P24-1001', budgetMin: 2000000, budgetMax: 2500000, primaryDevelopmentId: 'dev-one', convertedTransactionId: 'tx-one', createdAt: '2026-10-05T23:30:00Z' }
const setup = (lead, props = {}) => render(<MemoryRouter><MobileDeveloperLeadWorkspace lead={lead} {...props} /></MemoryRouter>)

it('shows buyer interest directly with Documents hidden and no document query', async () => {
  documentMocks.read.mockClear()
  setup(saved)
  await act(async () => {})
  expect(screen.getByRole('region', { name: 'Buyer interest' })).toBeTruthy()
  expect(screen.getByText('A two-bedroom home')).toBeTruthy()
  expect(screen.queryByRole('tablist')).toBeNull()
  expect(screen.queryByRole('heading', { name: 'Documents' })).toBeNull()
  expect(documentMocks.read).not.toHaveBeenCalled()
})

it('keeps documents hidden for agency-protected leads without querying the document store', async () => {
  documentMocks.read.mockClear()
  setup({ ...saved, leadOwner: 'agency', ownershipModel: 'agency_introduced', sourceAgencyOrgId: 'agency-two', visibilityState: 'limited' })
  await act(async () => {})
  expect(screen.queryByRole('tab', { name: 'Documents' })).toBeNull()
  expect(screen.queryByRole('heading', { name: 'Documents' })).toBeNull()
  expect(screen.getByText('Buyer contact details are protected until the agency completes handover.')).toBeTruthy()
  expect(documentMocks.read).not.toHaveBeenCalled()
})

it('keeps the saved contact actions, interest, budget and linked work together without inventing progress', () => {
  setup(saved)
  expect(screen.getByRole('heading', { name: 'Saved Buyer' })).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Call Saved Buyer' }).getAttribute('href')).toBe('tel:+27825550198')
  expect(screen.getByRole('link', { name: 'WhatsApp Saved Buyer' }).getAttribute('href')).toBe('https://wa.me/27825550198')
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
  expect(screen.queryByRole('link', { name: /Call|Email|WhatsApp/ })).toBeNull()
  expect(screen.queryByRole('region', { name: 'Contact lead' })).toBeNull()
  expect(screen.getByText('Request agency handover')).toBeTruthy()
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
  expect(screen.getByRole('region', { name: 'Next best action' }).textContent).toContain('Buyer full name is required')
})

it('retains complete multiline notes and only presents contact actions for usable saved details', () => {
  const note = 'Buyer needs a larger home.\nProperty24 reference: ' + 'b'.repeat(64)
  setup({ ...saved, buyerPhone: 'Phone pending', buyerEmail: 'not recorded', privateNotes: note })
  expect(screen.getByText((_, element) => element.tagName === 'P' && element.textContent === note)).toBeTruthy()
  expect(screen.queryByRole('link', { name: /Call|Email/ })).toBeNull()
})

it('uses the desktop stages and shows saved progress with the journey above the next action', () => {
  setup(saved)
  const strip = screen.getByRole('list', { name: 'Buyer journey stages' })
  const stages = within(strip).getAllByRole('listitem')
  expect(stages).toHaveLength(7)
  expect(stages.slice(0, 3).every((stage) => stage.textContent.includes('Completed'))).toBe(true)
  expect(stages[3].getAttribute('aria-current')).toBe('step')
  expect(stages[3].textContent).toContain('Viewing')
  expect(stages[4].textContent).toContain('Upcoming')
  expect(screen.getByText('3 of 7 steps complete')).toBeTruthy()
  const sections = Array.from(document.querySelectorAll('.mobile-lead-workspace > section'))
  expect(sections.slice(0, 4).map((section) => section.getAttribute('aria-label') || section.getAttribute('aria-labelledby'))).toEqual(['Lead profile', 'Contact lead', 'Buyer journey', 'mobile-lead-next-action-title'])
})

it('honours desktop stage overrides without advancing protected payment stages', () => {
  setup({ ...saved, leadStatus: 'new', reservationState: 'reserved' }, { journeyOverrides: [{ stageKey: 'contacted', actionType: 'mark_complete', effectiveAt: '2026-10-07T09:00:00Z' }, { stageKey: 'reservation', actionType: 'mark_paid', effectiveAt: '2026-10-07T09:00:00Z' }] })
  const stages = within(screen.getByRole('list', { name: 'Buyer journey stages' })).getAllByRole('listitem')
  expect(stages.find((stage) => stage.textContent.includes('Contacted')).textContent).toContain('Completed by override')
  expect(stages.find((stage) => stage.textContent.includes('Reservation deposit')).textContent).toContain('review required')
})

it('formats a saved South African local number for WhatsApp and keeps email-only leads usable', () => {
  const view = setup({ ...saved, buyerPhone: '082 555 0198' })
  expect(screen.getByRole('link', { name: 'WhatsApp Saved Buyer' }).getAttribute('href')).toBe('https://wa.me/27825550198')
  view.unmount()
  setup({ ...saved, buyerPhone: '' })
  expect(screen.getByRole('button', { name: 'Call' }).disabled).toBe(true)
  expect(screen.getByRole('button', { name: 'WhatsApp' }).disabled).toBe(true)
  expect(screen.queryByText('A phone number is needed for calls and WhatsApp.')).toBeNull()
  expect(screen.getByRole('link', { name: 'Email Saved Buyer' })).toBeTruthy()
})

it('shows the desktop next action when no follow-up is recorded and retains saved follow-ups', () => {
  const view = setup({ ...saved, leadStatus: 'onboarding_submitted', nextActionNote: '' })
  expect(screen.getByRole('region', { name: 'Next best action' }).textContent).toContain('Upload signed OTP')
  view.unmount()
  setup(saved)
  expect(screen.getByRole('region', { name: 'Next best action' }).textContent).toContain(saved.nextActionNote)
})

it('does not present assumed journey progress when the saved overrides are loading or unavailable', () => {
  const view = setup(saved, { journeyLoading: true })
  expect(screen.queryByRole('list', { name: 'Buyer journey stages' })).toBeNull()
  expect(screen.getByRole('status').textContent).toBe('Loading journey…')
  view.unmount()
  setup(saved, { journeyError: 'Unavailable' })
  expect(screen.queryByRole('list', { name: 'Buyer journey stages' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Retry journey' })).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Call Saved Buyer' })).toBeTruthy()
})

it('puts the source logo and linked development on the profile without initials or decorative stars', () => {
  setup({ ...saved, leadSource: 'Property24 development enquiry' }, { development: { id: 'dev-one', name: 'Oak Court' } })
  const profile = screen.getByRole('region', { name: 'Lead profile' })
  expect(within(profile).getByRole('img', { name: 'Property24' }).getAttribute('src')).toBe('/lead-sources/property24.png')
  expect(within(profile).getByText('Oak Court')).toBeTruthy()
  expect(within(profile).getByRole('link', { name: 'View development' }).getAttribute('href')).toBe('/mobile/development/dev-one')
  expect(profile.querySelector('.mobile-lead-avatar')).toBeNull()
  expect(screen.getByRole('region', { name: 'Next best action' }).querySelector('h2 svg')).toBeNull()
  fireEvent.error(within(profile).getByRole('img', { name: 'Property24' }))
  expect(within(profile).getByText('Property24')).toBeTruthy()
})

it('matches desktop buttons to the saved lead stage and sends the same status intent', () => {
  const onAction = vi.fn()
  const view = setup({ ...saved, leadStatus: 'new' }, { onAction })
  fireEvent.click(screen.getByRole('button', { name: 'Mark Contacted' }))
  expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ key: 'update_status', status: 'contacted' }))
  view.unmount()
  const viewing = setup(saved, { onAction })
  expect(screen.getByRole('button', { name: 'Select Preferred Unit' })).toBeTruthy()
  viewing.unmount()
  const ready = setup({ ...saved, preferredUnitId: 'unit-one' }, { onAction })
  expect(screen.getByRole('button', { name: 'Send Buyer Onboarding' })).toBeTruthy()
  ready.unmount()
  setup({ ...saved, leadStatus: 'onboarding_submitted' }, { onAction })
  expect(screen.getByRole('link', { name: 'Open Onboarding Context' }).getAttribute('href')).toBe('/mobile/transaction/tx-one')
})
