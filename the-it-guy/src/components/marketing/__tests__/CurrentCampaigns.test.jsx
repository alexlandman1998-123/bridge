// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CurrentCampaigns from '../CurrentCampaigns'
let viewport = 1000
const campaign = (id, status = 'active') => ({
  id,
  name: `Campaign ${id}`,
  status,
  objective: 'Book valuations',
  planned_channels: ['email'],
  start_date: '2026-10-23',
  end_date: '2026-11-23',
})
const workspace = {
  campaigns: [
    campaign('a'),
    campaign('b', 'scheduled'),
    campaign('c'),
    {
      ...campaign('draft', 'draft'),
      planned_budget: 0,
      budget_currency: 'ZAR',
    },
    campaign('done', 'completed'),
  ],
  activities: [
    { campaign_id: 'a', channel: 'email', email_campaign_id: 'send-a' },
    { campaign_id: 'done', channel: 'email', email_campaign_id: 'send-done' },
  ],
  channels: {
    email: {
      data: [
        { id: 'send-a', delivered: 100, clicked: 0, status: 'sent' },
        { id: 'send-done', delivered: 999, clicked: 999, status: 'sent' },
      ],
    },
  },
}
const mount = (data = workspace) =>
  render(
    <MemoryRouter>
      <CurrentCampaigns workspace={data} onCreate={vi.fn()} />
    </MemoryRouter>,
  )
beforeEach(() => {
  viewport = 1000
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    () => ({ width: viewport === 1000 ? 490 : 330 }),
  )
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(
    () => viewport,
  )
  HTMLElement.prototype.scrollBy = vi.fn(function ({ left }) {
    this.scrollLeft += left
    fireEvent.scroll(this)
  })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
it('includes active and scheduled plans, scoped recorded results and workspace links', () => {
  mount()
  expect(screen.getAllByRole('link')).toHaveLength(3)
  expect(
    screen.queryByRole('link', { name: 'Open campaign: Campaign done' }),
  ).toBeNull()
  const card = screen.getByRole('link', { name: 'Open campaign: Campaign a' })
  expect(card.getAttribute('href')).toContain('view=detail&id=a')
  expect(within(card).getByText('100')).toBeTruthy()
  expect(within(card).getByText('0')).toBeTruthy()
  expect(within(card).queryByText('999')).toBeNull()
  expect(within(card).getAllByText('Not connected').length).toBeGreaterThan(0)
  const second = screen.getByRole('link', { name: 'Open campaign: Campaign b' })
  expect(within(second).queryByText('100')).toBeNull()
})
it('moves by one card and updates boundary arrows without a visible position count', () => {
  mount()
  expect(screen.queryByRole('status')).toBeNull()
  expect(
    screen.getByRole('button', { name: 'Previous campaigns' }).disabled,
  ).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Next campaigns' }))
  expect(HTMLElement.prototype.scrollBy).toHaveBeenCalledWith(
    expect.objectContaining({ left: 510 }),
  )
  expect(screen.getByRole('button', { name: 'Next campaigns' }).disabled).toBe(
    true,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Previous campaigns' }))
  expect(screen.queryByRole('status')).toBeNull()
})
it('keeps mobile scrolling and hides controls when one campaign is visible', () => {
  viewport = 375
  mount()
  expect(screen.queryByRole('combobox')).toBeNull()
  expect(screen.queryByRole('status')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Next campaigns' }))
  expect(
    screen.getByRole('button', { name: 'Previous campaigns' }).disabled,
  ).toBe(false)
  cleanup()
  mount({
    ...workspace,
    campaigns: [
      { ...campaign('only'), planned_budget: 0, budget_currency: 'ZAR' },
    ],
  })
  expect(screen.getByText('ZAR 0.00')).toBeTruthy()
  expect(screen.queryByRole('progressbar')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Next campaigns' })).toBeNull()
})
it('keeps incomplete metrics unknown and prioritises activity needing attention', () => {
  mount({
    ...workspace,
    channels: {
      email: {
        data: [{ id: 'send-a', delivered: 10, clicked: 20, status: 'failed' }],
      },
    },
  })
  const card = screen.getByRole('link', { name: 'Open campaign: Campaign a' })
  expect(within(card).getByText('Review Email activity')).toBeTruthy()
  expect(within(card).queryByText('20')).toBeNull()
})
it('offers an honest empty state instead of example campaigns', () => {
  mount({ ...workspace, campaigns: [] })
  expect(
    screen.getByRole('heading', { name: 'No active or scheduled campaigns' }),
  ).toBeTruthy()
  expect(screen.queryByRole('link')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Next campaigns' })).toBeNull()
})

it('renders preview budgets and results only on the labelled mock campaign', () => {
  mount({
    ...workspace,
    campaigns: [
      {
        ...campaign('2772ee16-2b06-47f3-afa7-322ebeefc303'),
        organisation_id: '13c6b79f-1d8b-4886-aabf-42ea49565ef5',
      },
    ],
  })
  expect(screen.getByText('Demo analytics')).toBeTruthy()
  expect(screen.getByRole('progressbar', { name: 'Budget used' }).getAttribute('aria-valuenow')).toBe('41.7')
  expect(screen.getByText('ZAR 15,000.00')).toBeTruthy()
  expect(screen.getByText('ZAR 6,250.00')).toBeTruthy()
  expect(screen.getByText('ZAR 8,750.00')).toBeTruthy()
  expect(screen.getByText('12,480')).toBeTruthy()
  expect(screen.getByText('186')).toBeTruthy()
  expect(screen.queryByText('Not connected')).toBeNull()
})
