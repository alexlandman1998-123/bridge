// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import MobileConnectSheet from '../MobileConnectSheet.jsx'
import { loadAgencyAgentCardLink } from '../../../services/agencyPublicIntakeLinkService.js'
import { createAgentDigitalCardQrDataUrl } from '../../../services/agentDigitalCardShareService.js'

vi.mock('../../../context/OrganisationContext', () => ({ useOptionalOrganisation: () => ({ organisation: { id: 'org', name: 'Kingdom' } }) }))
vi.mock('../../../services/agencyPublicIntakeLinkService.js', () => ({ loadAgencyAgentCardLink: vi.fn(), buildAgencyAgentCardUrls: ({ slug }) => ({ cardUrl: `https://app.arch9.co.za/card/${slug}` }) }))
vi.mock('../../../services/agentDigitalCardShareService.js', () => ({ createAgentDigitalCardQrDataUrl: vi.fn() }))
const workspace = { role: 'agent', profile: { id: 'alex', fullName: 'Alex Private' } }
const link = { id: 'card', isAgentDigitalCard: true, organisationId: 'org', defaultAssignedAgentId: 'alex', status: 'active', slug: 'kingdom-alex', agentDigitalCard: { agent: { name: 'Alex Agent', jobTitle: 'Property professional' }, features: {} } }
const copy = vi.fn().mockResolvedValue()
function sheet(props = {}) { return <MemoryRouter><MobileConnectSheet workspace={workspace} onClose={vi.fn()} {...props} /></MemoryRouter> }
beforeEach(() => {
  vi.clearAllMocks()
  loadAgencyAgentCardLink.mockResolvedValue({ link })
  createAgentDigitalCardQrDataUrl.mockResolvedValue('data:image/png;base64,qr')
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } })
  Object.defineProperty(navigator, 'share', { configurable: true, value: undefined })
  copy.mockResolvedValue()
})
afterEach(cleanup)

it('loads only the signed-in agent’s card and generates a public QR, with working copy', async () => {
  render(sheet())
  expect(await screen.findByAltText('Scan to open Alex Agent’s digital contact card')).toBeTruthy()
  expect(loadAgencyAgentCardLink).toHaveBeenCalledWith({ organisationId: 'org', agentUserId: 'alex' })
  expect(createAgentDigitalCardQrDataUrl).toHaveBeenCalledWith('https://app.arch9.co.za/card/kingdom-alex', expect.objectContaining({ margin: 4 }))
  expect(screen.getByText('Scan to save my contact')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
  await screen.findByText('Card link copied')
  expect(copy).toHaveBeenCalledWith('https://app.arch9.co.za/card/kingdom-alex')
})

it('uses the native share sheet and treats cancellation quietly', async () => {
  const share = vi.fn().mockRejectedValue(Object.assign(new Error('Cancelled'), { name: 'AbortError' }))
  Object.defineProperty(navigator, 'share', { configurable: true, value: share })
  render(sheet())
  await screen.findByText('Scan to save my contact')
  fireEvent.click(screen.getByRole('button', { name: 'Share card' }))
  await waitFor(() => expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://app.arch9.co.za/card/kingdom-alex' })))
  expect(screen.queryByText('Card shared')).toBeNull()
  expect(copy).not.toHaveBeenCalled()
})

it.each(['draft', 'inactive'])('shows setup instead of a QR or share link for a %s card', async status => {
  loadAgencyAgentCardLink.mockResolvedValue({ link: { ...link, status } })
  render(sheet())
  await screen.findByText('Your card isn’t ready yet')
  expect(createAgentDigitalCardQrDataUrl).not.toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: 'Share card' })).toBeNull()
})

it('respects saved QR, sharing and Save Contact feature settings', async () => {
  loadAgencyAgentCardLink.mockResolvedValue({ link: { ...link, agentDigitalCard: { ...link.agentDigitalCard, features: { qr: false, share: false, vcf: false } } } })
  render(sheet())
  await screen.findByText('QR sharing is turned off for this card.')
  expect(screen.queryByRole('button', { name: 'Copy link' })).toBeNull()
  expect(screen.queryByText('Scan to save my contact')).toBeNull()
  expect(createAgentDigitalCardQrDataUrl).not.toHaveBeenCalled()
})

it('offers retry after a failed read and manual copy when clipboard access fails', async () => {
  loadAgencyAgentCardLink.mockRejectedValueOnce(new Error('Offline'))
  render(sheet())
  await screen.findByRole('alert')
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  await screen.findByText('Scan to save my contact')
  copy.mockRejectedValueOnce(new Error('Denied'))
  fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
  expect((await screen.findByRole('textbox', { name: 'Card link' })).value).toBe('https://app.arch9.co.za/card/kingdom-alex')
})

it('discards a previous agent’s delayed response after an identity switch', async () => {
  let resolveOld
  loadAgencyAgentCardLink.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve })).mockResolvedValueOnce({ link: { ...link, defaultAssignedAgentId: 'other', slug: 'other', agentDigitalCard: { agent: { name: 'Other Agent' } } } })
  const view = render(sheet())
  view.rerender(sheet({ workspace: { profile: { id: 'other' } } }))
  await screen.findByText('Other Agent')
  resolveOld({ link })
  await waitFor(() => expect(screen.queryByText('Alex Agent')).toBeNull())
  expect(screen.getByText('Other Agent')).toBeTruthy()
})
