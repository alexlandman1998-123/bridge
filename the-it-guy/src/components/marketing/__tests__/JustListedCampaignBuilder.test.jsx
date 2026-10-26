import { createContactProvenance } from '../../../services/campaignContactProvenance'
// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import JustListedCampaignBuilder from '../JustListedCampaignBuilder'
import { justListedCopy } from '../../../services/justListedCampaignModel'
const runtime = vi.hoisted(() => ({ choices: vi.fn(), source: vi.fn() }))
vi.mock('../../../services/justListedCampaignService', () => ({
  loadJustListedChoices: runtime.choices,
  loadJustListedSource: runtime.source,
}))
const listingId = '11111111-1111-4111-8111-111111111111'
const agentId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const source = {
  title: 'Sunny home',
  price: 'R 1 250 000',
  location: 'Gardens',
  facts: '3 bedrooms',
  agencyName: 'Oak & Stone',
  agentName: 'Sarah',
  destination: 'sarah@example.test',
  language: 'en-ZA',
  tone: 'warm',
  description: 'Space for family life',
}
const props = () => ({
  organisationId: 'agency',
  userId: 'me',
  onSave: vi.fn().mockResolvedValue(),
  onCancel: vi.fn(),
  onSetup: vi.fn(),
})
beforeEach(() => {
  vi.clearAllMocks()
  runtime.choices.mockResolvedValue({
    agency: { agencyName: 'Oak & Stone' },
    listings: [{ id: listingId, title: 'Sunny home', area: 'Gardens' }],
  })
  runtime.source.mockResolvedValue({
    source,
    listingId,
    agentId,
    coverUrl: 'https://example.test/home.jpg',
  })
})
afterEach(cleanup)
const choose = async () =>
  fireEvent.click(await screen.findByRole('button', { name: /Sunny home/ }))
it('reaches a saved personalised draft without typing when source records are complete', async () => {
  const input = props()
  render(<JustListedCampaignBuilder {...input} />)
  await choose()
  await screen.findByRole('heading', {
    name: 'We’ve filled in the essentials',
  })
  expect(screen.queryByRole('textbox')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /Confirm and preview/ }))
  expect(
    screen.getByRole('heading', {
      name: 'Your campaign draft is ready to review',
    }),
  ).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Save campaign draft' }))
  await waitFor(() =>
    expect(input.onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'draft',
        listing_builder: expect.objectContaining({ listingId, agentId }),
        channel_content: expect.objectContaining({
          social: expect.objectContaining({
            body: expect.stringContaining('Sarah'),
          }),
        }),
      }),
    ),
  )
})
it('routes unfinished agency setup to the existing first-use flow', async () => {
  runtime.choices.mockResolvedValue({ agency: null, listings: [] })
  const input = props()
  render(<JustListedCampaignBuilder {...input} />)
  fireEvent.click(
    await screen.findByRole('button', { name: 'Open Campaign Setup' }),
  )
  expect(input.onSetup).toHaveBeenCalled()
  expect(runtime.source).not.toHaveBeenCalled()
})
it('asks only for missing public contact and keeps that field editable after the first keystroke', async () => {
  runtime.source.mockResolvedValue({
    source: { ...source, agentName: '', destination: '' },
    listingId,
    agentId,
  })
  render(<JustListedCampaignBuilder {...props()} />)
  await choose()
  const name = await screen.findByLabelText('Assigned agent’s public name')
  fireEvent.change(name, { target: { value: 'Sarah' } })
  expect(screen.getByLabelText('Assigned agent’s public name').value).toBe(
    'Sarah',
  )
  fireEvent.change(screen.getByLabelText('Public enquiry email or phone'), {
    target: { value: 'agent@example.test' },
  })
  expect(
    screen.getByRole('button', { name: /Confirm and preview/ }).disabled,
  ).toBe(false)
})
it('reopens saved copy, preserves edits after failure, and rebuilds only on explicit refresh', async () => {
  const campaign = {
    listing_builder: {
      version: 1,
      template: 'new-listing',
      listingId,
      agentId,
      source,
      contactProvenance: { ...createContactProvenance(source), confirmed: true },
    },
    channel_content: {
      ...justListedCopy(source),
      social: { title: 'My own headline', body: 'My edited caption' },
    },
  }
  const input = props()
  input.onSave.mockRejectedValue(new Error('Changed in another session.'))
  render(<JustListedCampaignBuilder {...input} campaign={campaign} />)
  fireEvent.click(
    await screen.findByRole('button', { name: /Confirm and preview/ }),
  )
  expect(screen.getByLabelText('Message').value).toBe('My edited caption')
  fireEvent.click(screen.getByRole('button', { name: 'Save campaign draft' }))
  expect((await screen.findByRole('alert')).textContent).toContain(
    'another session',
  )
  expect(screen.getByLabelText('Message').value).toBe('My edited caption')
  fireEvent.click(screen.getByRole('button', { name: 'Back', exact: true }))
  // Changing wording is an override, not a source change; no refresh is forced.
  expect(
    screen.queryByRole('button', { name: 'Refresh and rebuild wording' }),
  ).toBeNull()
})

it('requires a legacy draft to refresh contact provenance before it can reach preparation', async () => {
  const campaign = { listing_builder: { version: 1, template: 'new-listing', listingId, agentId, source }, channel_content: justListedCopy(source) }
  render(<JustListedCampaignBuilder {...props()} campaign={campaign} />)
  const refresh = await screen.findByRole('button', { name: 'Refresh public contacts and wording' })
  expect(screen.getByRole('button', { name: /Confirm and preview/ }).disabled).toBe(true)
  fireEvent.click(refresh)
  await waitFor(() => expect(screen.getByRole('button', { name: /Confirm and preview/ }).disabled).toBe(false))
  fireEvent.click(screen.getByRole('button', { name: /Confirm and preview/ }))
  expect(screen.getByLabelText('Message').value).toContain(source.destination)
  expect(campaign.listing_builder).not.toHaveProperty('contactProvenance')
})
it('requires explicit refresh after public location or assigned agent changes', async () => {
  const campaign = {
    listing_builder: {
      version: 1,
      template: 'new-listing',
      listingId,
      agentId,
      source: { ...source, location: '99 Old Private Road' },
    },
    channel_content: justListedCopy({
      ...source,
      location: '99 Old Private Road',
    }),
  }
  render(<JustListedCampaignBuilder {...props()} campaign={campaign} />)
  const next = await screen.findByRole('button', {
    name: /Confirm and preview/,
  })
  expect(next.disabled).toBe(true)
  fireEvent.click(
    screen.getByRole('button', { name: 'Refresh and rebuild wording' }),
  )
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: /Confirm and preview/ }).disabled,
    ).toBe(false),
  )
  fireEvent.click(screen.getByRole('button', { name: /Confirm and preview/ }))
  expect(screen.queryByText(/99 Old Private Road/)).toBeNull()
})
it('revalidates listing permission before save and retains editable wording on failure', async () => {
  const input = props()
  render(<JustListedCampaignBuilder {...input} />)
  await choose()
  fireEvent.click(
    await screen.findByRole('button', { name: /Confirm and preview/ }),
  )
  fireEvent.click(screen.getByText('Edit social post wording'))
  fireEvent.change(screen.getByLabelText('Message'), {
    target: { value: 'My revised wording' },
  })
  runtime.source.mockRejectedValue(
    new Error('This listing is no longer available.'),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Save campaign draft' }))
  await screen.findByRole('alert')
  expect(input.onSave).not.toHaveBeenCalled()
  expect(screen.getByLabelText('Message').value).toBe('My revised wording')
})
it('ignores a late response after changing agency', async () => {
  let finish
  runtime.choices.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const view = render(<JustListedCampaignBuilder {...props()} />)
  view.rerender(
    <JustListedCampaignBuilder {...props()} organisationId="other" />,
  )
  await screen.findByRole('button', { name: /Sunny home/ })
  finish({ agency: null, listings: [] })
  await waitFor(() =>
    expect(
      screen.queryByText('Confirm your agency preferences first'),
    ).toBeNull(),
  )
})
