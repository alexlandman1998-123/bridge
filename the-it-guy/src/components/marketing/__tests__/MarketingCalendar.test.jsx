// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
const metaRequest = vi.hoisted(() => vi.fn())
vi.mock('../../../services/metaIntegrationService', () => ({ metaIntegrationRequest: metaRequest }))
import MarketingCalendar from '../MarketingCalendar'
afterEach(() => { cleanup(); metaRequest.mockReset() })
const workspace = {
  campaigns: [
    {
      id: 'plan',
      name: 'Seller valuations',
      status: 'active',
      start_date: '2026-10-24',
      end_date: '2026-10-26',
    },
    { id: 'undated', name: 'Unplanned idea', status: 'draft' },
  ],
  activities: [
    { channel: 'email', email_campaign_id: 'send', campaign_id: 'plan' },
  ],
  channels: {
    email: {
      data: [
        {
          id: 'send',
          name: 'Valuation invitation',
          status: 'scheduled',
          scheduled_for: '2026-10-25T08:00:00Z',
        },
      ],
    },
  },
}
const mount = (data = workspace) =>
  render(
    <MemoryRouter>
      <MarketingCalendar workspace={data} date="2026-10-25" />
    </MemoryRouter>,
  )
it('shows campaign plans and real email times in the selected-day agenda with scoped links', () => {
  mount()
  expect(screen.getByRole('grid')).toBeTruthy()
  expect(
    screen.getByRole('heading', { name: 'Seller valuations' }),
  ).toBeTruthy()
  expect(
    screen.getByRole('heading', { name: 'Valuation invitation' }),
  ).toBeTruthy()
  expect(
    screen.getByRole('link', { name: 'Open campaign' }).getAttribute('href'),
  ).toContain('page=calendar&date=2026-10-25&view=detail&id=plan')
  expect(
    screen.getByRole('link', { name: 'Open email' }).getAttribute('href'),
  ).toContain('section=email&view=detail&id=send')
  expect(screen.getByText('1 campaign without dates')).toBeTruthy()
})
it('navigates months and supports arrow-key day selection', () => {
  mount()
  const selected = screen
    .getByRole('gridcell', { selected: true })
    .querySelector('button')
  fireEvent.keyDown(selected, { key: 'ArrowRight' })
  expect(screen.getByRole('heading', { name: /26 October|October 26/ })).toBeTruthy()
  expect(
    screen.queryByRole('heading', { name: 'Valuation invitation' }),
  ).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
  expect(screen.getByRole('heading', { name: 'November 2026' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
  expect(screen.getByRole('heading', { name: 'October 2026' })).toBeTruthy()
})
it('filters the calendar without inventing automation runs and handles unavailable email activity', () => {
  mount({
    ...workspace,
    channels: { email: { data: [], error: 'Unavailable' } },
  })
  expect(
    screen.getByText(/Email activity is unavailable/),
  ).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Calendar item type'), {
    target: { value: 'automation' },
  })
  expect(
    screen.getByText(/Configured automation runs will appear/),
  ).toBeTruthy()
  expect(
    screen.queryByRole('heading', { name: 'Seller valuations' }),
  ).toBeNull()
  fireEvent.change(screen.getByLabelText('Calendar item type'), {
    target: { value: 'campaign' },
  })
  fireEvent.change(screen.getByLabelText('Search marketing calendar'), {
    target: { value: 'no match' },
  })
  expect(screen.getByText('No matching items on this day.')).toBeTruthy()
})

it('counts a multi-day plan once and updates the month summary with navigation and filters', () => {
  mount()
  const summary = screen.getByLabelText('Month at a glance')
  expect(within(summary).getByText('Campaign plans').previousSibling.textContent).toBe('1')
  expect(within(summary).getByText('Communications & posts').previousSibling.textContent).toBe('1')
  expect(within(summary).getByText('Days with activity').previousSibling.textContent).toBe('3')
  fireEvent.change(screen.getByLabelText('Calendar item type'), { target: { value: 'email' } })
  expect(within(summary).getByText('Campaign plans').previousSibling.textContent).toBe('0')
  expect(within(summary).getByText('Days with activity').previousSibling.textContent).toBe('1')
  fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
  expect(within(summary).getByText('Communications & posts').previousSibling.textContent).toBe('0')
  expect(within(summary).getByText('Days with activity').previousSibling.textContent).toBe('0')
})
const unified = {
  ...workspace,
  activities: [...workspace.activities, { channel: 'whatsapp', whatsapp_campaign_id: 'wa-linked', campaign_id: 'plan' }],
  channels: {
    ...workspace.channels,
    whatsapp: { data: [
      { id: 'wa-linked', name: 'Viewing reminder', status: 'queued', display_status: 'scheduled', scheduled_at: '2026-10-25T09:00:00Z' },
      { id: 'wa-solo', name: 'Once-off WhatsApp', status: 'sent', display_status: 'sent', sent_at: '2026-10-25T10:00:00Z' },
      { id: 'wa-draft', name: 'Unscheduled WhatsApp', status: 'draft', scheduled_at: '2026-10-25T12:00:00Z' },
    ] },
    posts: { data: [
      { id: 'post', title: 'New home on Facebook', listing_id: 'listing', status: 'published', published_at: '2026-10-25T11:00:00Z' },
      { id: 'draft-post', title: 'Draft property post', listing_id: 'listing', status: 'draft' },
    ] },
  },
}
it('combines standalone communications and posts with campaign context and source-specific links', () => {
  mount(unified)
  expect(screen.getByRole('heading', { name: 'Viewing reminder' })).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'Once-off WhatsApp' })).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'New home on Facebook' })).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Open listing post' }).getAttribute('href')).toBe('/agent/listings/listing')
  expect(screen.getAllByRole('link', { name: 'Seller valuations' }).every((link) => link.getAttribute('href').includes('view=detail&id=plan'))).toBe(true)
  fireEvent.click(screen.getByText('Not scheduled · 2 communications'))
  expect(screen.getByRole('link', { name: /Unscheduled WhatsApp/ }).getAttribute('href')).toContain('section=whatsapp&view=create&id=wa-draft')
  expect(screen.getByRole('gridcell', { selected: true }).textContent).not.toContain('Unscheduled WhatsApp')
})
it('filters once-off activity, campaign membership, channel and status together', () => {
  mount(unified)
  fireEvent.click(screen.getByRole('button', { name: 'Once-off' }))
  expect(screen.queryByRole('heading', { name: 'Viewing reminder' })).toBeNull()
  expect(screen.queryByRole('heading', { name: 'Seller valuations' })).toBeNull()
  expect(screen.getByRole('heading', { name: 'Once-off WhatsApp' })).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Calendar item type'), { target: { value: 'post' } })
  fireEvent.change(screen.getByLabelText('Calendar status'), { target: { value: 'published' } })
  expect(screen.getByRole('heading', { name: 'New home on Facebook' })).toBeTruthy()
  expect(screen.queryByRole('heading', { name: 'Once-off WhatsApp' })).toBeNull()
  fireEvent.change(screen.getByLabelText('Calendar item type'), { target: { value: 'all' } })
  fireEvent.change(screen.getByLabelText('Calendar status'), { target: { value: 'all' } })
  fireEvent.click(screen.getByRole('button', { name: 'Campaign-linked' }))
  fireEvent.change(screen.getByLabelText('Filter by campaign'), { target: { value: 'plan' } })
  expect(screen.getByRole('heading', { name: 'Viewing reminder' })).toBeTruthy()
  expect(screen.queryByRole('heading', { name: 'Once-off WhatsApp' })).toBeNull()
  fireEvent.change(screen.getByLabelText('Search marketing calendar'), { target: { value: 'Seller valuations' } })
  expect(screen.getByRole('heading', { name: 'Valuation invitation' })).toBeTruthy()
})
it('offers existing campaign, email, WhatsApp and post creation workspaces', () => {
  mount()
  fireEvent.click(screen.getByText('Create'))
  for (const [name, route] of [['Campaign', 'view=create'], ['Email', 'section=email&view=create'], ['WhatsApp', 'section=whatsapp&view=create'], ['Post', 'section=meta&tab=organic']]) {
    expect(screen.getByRole('link', { name }).getAttribute('href')).toContain(route)
  }
})
it('loads posts only for the current organisation and ignores stale responses', async () => {
  let resolveOld
  metaRequest.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve }))
    .mockResolvedValueOnce({ posts: [{ id: 'new', title: 'Current agency post', listing_id: 'new-listing', status: 'published', published_at: '2026-10-25T11:00:00Z' }] })
  const { rerender } = render(<MemoryRouter><MarketingCalendar workspace={workspace} organisationId="old" date="2026-10-25" /></MemoryRouter>)
  rerender(<MemoryRouter><MarketingCalendar workspace={workspace} organisationId="new" date="2026-10-25" /></MemoryRouter>)
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Current agency post' })).toBeTruthy())
  resolveOld({ posts: [{ id: 'old', title: 'Old agency post', listing_id: 'old-listing', status: 'published', published_at: '2026-10-25T11:00:00Z' }] })
  await waitFor(() => expect(screen.queryByRole('heading', { name: 'Old agency post' })).toBeNull())
  expect(metaRequest).toHaveBeenCalledWith('new', 'calendar_posts')
})
it('keeps other activity available if the post read fails', async () => {
  metaRequest.mockRejectedValue(new Error('Unsupported action'))
  render(<MemoryRouter><MarketingCalendar workspace={workspace} organisationId="agency" date="2026-10-25" /></MemoryRouter>)
  await waitFor(() => expect(screen.getByText(/Posts could not be loaded/)).toBeTruthy())
  expect(screen.getByRole('heading', { name: 'Valuation invitation' })).toBeTruthy()
})

it('opens a dated popup with activity and scheduling options, then restores focus', () => {
  mount()
  const day = screen.getByRole('gridcell', { selected: true }).querySelector('button')
  day.focus()
  fireEvent.click(day)
  const popup = screen.getByRole('dialog')
  expect(popup.getAttribute('aria-modal')).toBe('true')
  expect(within(popup).getByRole('heading', { name: /Sunday.*25.*October.*2026|Sunday.*October.*25.*2026/ })).toBeTruthy()
  expect(within(popup).getByRole('heading', { name: 'Valuation invitation' })).toBeTruthy()
  const timeline = within(popup).getByLabelText('Hourly schedule in South Africa time')
  const scheduledRow = within(timeline).getByText('10:00').parentElement
  expect(within(scheduledRow).getByRole('heading', { name: 'Valuation invitation' })).toBeTruthy()
  expect(within(timeline).queryByRole('heading', { name: 'Seller valuations' })).toBeNull()
  expect(within(popup).getByRole('link', { name: /Schedule mailer/ }).getAttribute('href')).toBe('/marketing?section=email&view=create&scheduleDate=2026-10-25')
  expect(within(popup).getByRole('link', { name: /Prepare WhatsApp/ }).getAttribute('href')).toContain('section=whatsapp&view=create')
  expect(within(popup).getByRole('link', { name: /Plan a post/ }).getAttribute('href')).toContain('section=meta&tab=organic')
  expect(within(popup).getByRole('link', { name: /Create campaign/ })).toBeTruthy()
  fireEvent.click(within(popup).getByRole('button', { name: 'Next day' }))
  expect(within(popup).getByRole('link', { name: /Schedule mailer/ }).getAttribute('href')).toContain('scheduleDate=2026-10-26')
  expect(within(popup).queryByRole('heading', { name: 'Valuation invitation' })).toBeNull()
  fireEvent.click(within(popup).getByRole('button', { name: 'Previous day' }))
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(document.activeElement).toBe(day)
})
it('opens empty days and uses the clicked date for the mailer', () => {
  mount()
  fireEvent.click(screen.getByRole('button', { name: /Thursday.*29.*October.*2026|Thursday.*October.*29.*2026/ }))
  const popup = screen.getByRole('dialog')
  expect(within(popup).getByText('No matching items on this day.')).toBeTruthy()
  expect(within(popup).getByRole('link', { name: /Schedule mailer/ }).getAttribute('href')).toContain('scheduleDate=2026-10-29')
  fireEvent.click(within(popup).getByRole('button', { name: 'Close dialog' }))
  expect(screen.queryByRole('dialog')).toBeNull()
})
