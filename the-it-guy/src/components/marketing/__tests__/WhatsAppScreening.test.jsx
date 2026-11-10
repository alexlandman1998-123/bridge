// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import WhatsAppScreening, { ScreeningChatPreview, ScreeningPreview, WhatsAppScreeningSessions } from '../WhatsAppScreening'

const mocks = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('../../../services/metaIntegrationService', () => ({ metaIntegrationRequest: mocks.request }))
const context = { propertyLabel: 'Example Property', location: 'Cape Town', price: 12000, agencyName: 'Example Agency', conditions: 'Verified property conditions', petPolicy: 'Written approval required', privacyUrl: 'https://agency.test/privacy', privacyContact: 'privacy@agency.test', retention: 'Approved retention criteria', rates: 1000, levy: 0, deposit: 24000, availableFrom: '2027-01-01', leaseTerm: '12 months', depositDue: 'before occupation', fees: 'Administration fee R500 incl VAT, due on signature; non-refundable after preparation. No other charges.' }
const profile = { id: 'profile', version: 2, enabled: false, kind: 'buyer', config: { deliveryMode: 'live', listingId: 'listing', senderId: 'shared', kind: 'buyer', context, template: null, values: {} } }
const workspace = { organisationId: 'org', accessScope: 'org:manager', senders: [{ id: 'shared', connection_status: 'connected', display_phone_number: '+27820000000', owner_user_id: null }, { id: 'private', connection_status: 'connected', display_phone_number: 'Private phone', owner_user_id: 'agent' }] }
const wrap = element => <MemoryRouter>{element}</MemoryRouter>
beforeEach(() => mocks.request.mockReset().mockImplementation(async (_org, action) => action === 'screening_list' ? { profiles: [profile] } : action === 'screening_listings' ? { listings: [{ id: 'listing', title: context.propertyLabel, city: 'Cape Town', asking_price: 12000 }] } : { sessions: [] }))
afterEach(cleanup)

it('previews both questionnaires and reveals only relevant finance and pet follow-ups', () => {
  const { rerender } = render(<ScreeningPreview profile={{ kind: 'buyer', context }} />)
  expect(screen.queryByText('What is your intended bond amount?')).toBeNull()
  fireEvent.change(screen.getByLabelText('Preview: funding'), { target: { value: 'Home loan / bond' } })
  expect(screen.getByText('What is your intended bond amount?')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Preview: funding'), { target: { value: 'Cash purchase' } })
  expect(screen.queryByText('What is your intended bond amount?')).toBeNull()
  rerender(<ScreeningPreview key="tenant" profile={{ kind: 'tenant', context }} />)
  expect(screen.getByText(/combined monthly take-home income/)).toBeTruthy()
  expect(screen.queryByText(/Please give the number and type of pets/)).toBeNull()
  fireEvent.change(screen.getByLabelText('Preview: pets'), { target: { value: 'Yes' } })
  expect(screen.getByText(/Please give the number and type of pets/)).toBeTruthy()
})

it('requires deliberate enablement and restricts setup to shared company senders', async () => {
  render(wrap(<WhatsAppScreening workspace={workspace} />))
  const enable = await screen.findByRole('button', { name: 'Enable future enquiries' })
  expect(enable.disabled).toBe(true)
  fireEvent.click(screen.getByLabelText(/I reviewed the property terms/))
  fireEvent.click(enable)
  await waitFor(() => expect(mocks.request).toHaveBeenCalledWith('org', 'screening_enable', { id: 'profile', version: 2, confirmed: true }))
  fireEvent.click(screen.getByRole('button', { name: 'Set up property screening' }))
  expect(screen.getByLabelText('Who can receive screening?').value).toBe('test')
  expect(screen.getByLabelText(/Test recipient mobile number/).required).toBe(true)
  expect(screen.queryByRole('option', { name: 'Private phone' })).toBeNull()
  expect(screen.getByRole('option', { name: '+27820000000' })).toBeTruthy()
  expect(screen.getByText(/Complete the property terms above/)).toBeTruthy()
})

it('shows persisted answers with an agent handoff and never offers an unknown send retry', async () => {
  const session = { id: 'session', version: 3, kind: 'tenant', lead_id: 'lead', status: 'blocked', reason: 'Unconfirmed send; automatic resend blocked', context_snapshot: context, answers: { income: 25000, viewing_options: [{ date: '2027-01-15', from: '10:00', until: '11:00' }] }, last_prompt_id: 'message' }
  mocks.request.mockResolvedValue({ sessions: [session] })
  render(wrap(<WhatsAppScreeningSessions organisationId="org" conversationId="chat" />))
  expect(await screen.findByText('25000')).toBeTruthy()
  expect(screen.getByText(/2027-01-15 10:00–11:00/)).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Recheck opening' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Hand over to agent' }))
  await waitFor(() => expect(mocks.request).toHaveBeenCalledWith('org', 'screening_handoff', { id: 'session', version: 3 }))
})

it('clears previous workspace answers and ignores a late response after switching context', async () => {
  let finishOld
  mocks.request.mockImplementation((org) => org === 'old' ? new Promise(resolve => { finishOld = resolve }) : Promise.resolve({ sessions: [] }))
  const { rerender } = render(wrap(<WhatsAppScreeningSessions organisationId="old" conversationId="one" />))
  rerender(wrap(<WhatsAppScreeningSessions organisationId="new" conversationId="two" />))
  await screen.findByText('No screening is recorded in your current scope.')
  finishOld({ sessions: [{ id: 'secret', kind: 'buyer', context_snapshot: { ...context, propertyLabel: 'Previous workspace private answers' }, answers: { income: 12345 }, status: 'active' }] })
  await waitFor(() => expect(screen.queryByText('Previous workspace private answers')).toBeNull())
})

it('runs a local conversation preview through answers, pause and stop without calling the server', () => {
  render(<ScreeningChatPreview profile={{ kind: 'buyer', context }} />)
  fireEvent.click(screen.getByRole('button', { name: 'START', exact: true }))
  fireEvent.change(screen.getByLabelText('Preview reply'), { target: { value: '1' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send preview reply' }))
  expect(screen.getByRole('status').textContent).toContain('1 answer')
  fireEvent.click(screen.getByRole('button', { name: 'PAUSE', exact: true }))
  expect(screen.getByRole('status').textContent).toContain('paused')
  fireEvent.click(screen.getByRole('button', { name: 'RESUME', exact: true }))
  expect(screen.getByRole('status').textContent).toContain('active')
  fireEvent.click(screen.getByRole('button', { name: 'STOP', exact: true }))
  expect(screen.getByRole('status').textContent).toContain('stopped')
  expect(mocks.request).not.toHaveBeenCalled()
})
