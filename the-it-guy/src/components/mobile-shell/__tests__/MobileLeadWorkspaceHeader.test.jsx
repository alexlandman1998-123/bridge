// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import MobileLeadWorkspaceHeader from '../MobileLeadWorkspaceOverview.jsx'
import { MobileLeadActionContext } from '../mobileLeadActionContext.js'
import { fetchAgencyCrmLeadWorkspace } from '../../../lib/agencyCrmRepository.js'

vi.mock('../MobileBuyerJourney.jsx', () => ({ default: () => null }))
vi.mock('../../../services/privateListingService.js', () => ({ getPrivateListing: vi.fn(), getPrivateListingCoverImageUrls: vi.fn() }))
vi.mock('../../../lib/agencyCrmRepository.js', () => ({ fetchAgencyCrmLeadWorkspace: vi.fn() }))
afterEach(() => { cleanup(); vi.resetAllMocks() })
const snapshot = {
  leads: [{ leadId: 'one', contactId: 'contact', leadCategory: 'buyer', stage: 'New Lead', leadSource: 'Property24', enquiredPropertyAddress: '12 Long Street' }],
  contacts: [{ contactId: 'contact', firstName: 'Sarah', lastName: 'Jones', phone: '082 123 4567', email: 'sarah@example.com' }],
}
function header(props = {}) {
  return <MemoryRouter><MobileLeadWorkspaceHeader organisationId="agency" leadId="one" {...props} /></MemoryRouter>
}

it('loads the saved identity and source without extra labels or email', async () => {
  const onContactAction = vi.fn()
  fetchAgencyCrmLeadWorkspace.mockResolvedValue(snapshot)
  render(header({ onContactAction }))
  expect(await screen.findByRole('heading', { name: 'Sarah Jones' })).toBeTruthy()
  expect(fetchAgencyCrmLeadWorkspace).toHaveBeenCalledWith('agency', 'one')
  expect(screen.queryByText('New Lead')).toBeNull()
  expect(screen.queryByText('Buyer lead')).toBeNull()
  expect(screen.getAllByText('12 Long Street').length).toBeGreaterThan(0)
  expect(screen.getByRole('img', { name: 'Property24' })).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Call' }).getAttribute('href')).toBe('tel:+27821234567')
  expect(screen.getByRole('link', { name: 'WhatsApp' }).getAttribute('href')).toBe('https://wa.me/27821234567')
  const callLink = screen.getByRole('link', { name: 'Call' })
  callLink.addEventListener('click', event => event.preventDefault(), { once: true })
  fireEvent.click(callLink)
  expect(onContactAction).toHaveBeenCalledWith('call', expect.objectContaining({ name: 'Sarah Jones' }))
  expect(screen.queryByRole('link', { name: 'sarah@example.com' })).toBeNull()
  expect(screen.queryByText('Assigned Agent')).toBeNull()
})

it('shows retry after a read failure and never offers placeholder contact details', async () => {
  fetchAgencyCrmLeadWorkspace.mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValueOnce(snapshot)
  render(header())
  expect(await screen.findByRole('alert')).toBeTruthy()
  expect(screen.queryByRole('link', { name: 'Call' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(await screen.findByRole('heading', { name: 'Sarah Jones' })).toBeTruthy()
})

it('disables phone actions for missing or invalid numbers and omits invalid email', async () => {
  fetchAgencyCrmLeadWorkspace.mockResolvedValue({ ...snapshot, contacts: [{ contactId: 'contact', firstName: 'Sarah', phone: 'not a number', email: 'missing' }] })
  render(header())
  await screen.findByRole('heading', { name: 'Sarah' })
  expect(screen.getByRole('button', { name: 'Call' }).disabled).toBe(true)
  expect(screen.getByRole('button', { name: 'WhatsApp' }).disabled).toBe(true)
  expect(screen.queryByRole('link', { name: 'missing' })).toBeNull()
})

it('does not leak an earlier lead when the organisation or route changes', async () => {
  let resolveOld
  fetchAgencyCrmLeadWorkspace.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve })).mockResolvedValueOnce({ leads: [{ leadId: 'two', name: 'New Person', stage: 'Qualified' }], contacts: [] })
  const view = render(header())
  view.rerender(header({ organisationId: 'another-agency', leadId: 'two' }))
  await screen.findByRole('heading', { name: 'New Person' })
  resolveOld(snapshot)
  await waitFor(() => expect(screen.queryByRole('heading', { name: 'Sarah Jones' })).toBeNull())
  expect(screen.getByRole('heading', { name: 'New Person' })).toBeTruthy()
})

it('requires an organisation and handles a lead that is no longer available', async () => {
  const view = render(header({ organisationId: '' }))
  expect(screen.getByRole('status').textContent).toContain('Select an organisation')
  expect(fetchAgencyCrmLeadWorkspace).not.toHaveBeenCalled()
  fetchAgencyCrmLeadWorkspace.mockResolvedValue({ leads: [], contacts: [] })
  view.rerender(header())
  expect(await screen.findByRole('alert')).toBeTruthy()
  expect(screen.queryByRole('link', { name: 'Call' })).toBeNull()
})

it('refreshes the saved header and qualification seed after the action module closes', async () => {
  fetchAgencyCrmLeadWorkspace.mockResolvedValueOnce(snapshot).mockResolvedValueOnce({ ...snapshot, contacts: [{ ...snapshot.contacts[0], firstName: 'Updated' }] })
  const view = render(<MobileLeadActionContext.Provider value={{ revision: 0 }}>{header()}</MobileLeadActionContext.Provider>)
  await screen.findByRole('heading', { name: 'Sarah Jones' })
  view.rerender(<MobileLeadActionContext.Provider value={{ revision: 1 }}>{header()}</MobileLeadActionContext.Provider>)
  expect(await screen.findByRole('heading', { name: 'Updated Jones' })).toBeTruthy()
  expect(fetchAgencyCrmLeadWorkspace).toHaveBeenCalledTimes(2)
})
