// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import CampaignTemplateLibrary from '../CampaignTemplateLibrary'

afterEach(cleanup)
const saved = [
  { id: 'mine', name: 'My seller playbook', objective: 'Generate seller enquiries', goal: 'seller_leads', visibility: 'personal', created_by: 'me', planned_channels: ['email'], run_mode: 'bounded', duration_days: 7 },
  { id: 'other', name: 'Someone else’s private plan', objective: 'Private', goal: 'custom', visibility: 'personal', created_by: 'other', planned_channels: ['email'], run_mode: 'bounded' },
  { id: 'agency', name: 'Our buyer playbook', objective: 'Find buyers', goal: 'buyer_leads', visibility: 'agency', created_by: 'admin', planned_channels: ['email'], run_mode: 'ongoing' },
]
function mount(props = {}) {
  const callbacks = { onUse: vi.fn(), onEdit: vi.fn(), onCreate: vi.fn(), onRetry: vi.fn() }
  render(<CampaignTemplateLibrary saved={saved} userId="me" canShare={false} {...callbacks} {...props} />)
  return callbacks
}
const category = (name) => within(screen.getByRole('navigation', { name: 'Campaign categories' })).getByRole('button', { name, exact: true })

it('shows the 18 launch families with category labels, drafts and honest planned-pack descriptions', () => {
  mount()
  expect(screen.getAllByRole('article')).toHaveLength(18)
  expect(screen.getByRole('heading', { name: 'Just Listed', exact: true })).toBeTruthy()
  expect(screen.getByText(/personalised designs, downloads/)).toBeTruthy()
  const card = screen.getByRole('heading', { name: 'Show Day / Open House' }).closest('article')
  fireEvent.click(within(card).getByText(/Pack checklist/))
  expect(within(card).getByText('Attendee follow-up')).toBeTruthy()
  expect(within(card).getByText('Asset generation and downloads are not available yet.')).toBeTruthy()
})

it('finds overlap campaigns once while retaining their primary category', () => {
  mount()
  fireEvent.click(category('Build Your Brand'))
  const headings = screen.getAllByRole('article').map((article) => within(article).getByRole('heading').textContent)
  expect(headings).toContain('Just Sold Nearby')
  expect(headings.filter((title) => title === 'Just Sold Nearby')).toHaveLength(1)
  const card = screen.getByRole('heading', { name: 'Just Sold Nearby' }).closest('article')
  expect(within(card).getByText('Find Sellers', { exact: true })).toBeTruthy()
  expect(headings).not.toContain('Price Reduced')
})

it('combines category and tag search, and can recover from no matches', () => {
  mount()
  fireEvent.click(category('Find Sellers'))
  fireEvent.change(screen.getByRole('textbox', { name: 'Search templates' }), { target: { value: '  JUST sold  ' } })
  expect(screen.getAllByRole('article')).toHaveLength(1)
  fireEvent.change(screen.getByRole('textbox', { name: 'Search templates' }), { target: { value: 'no-such-campaign' } })
  expect(screen.getByRole('heading', { name: 'No matching templates' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
  expect(screen.getAllByRole('article')).toHaveLength(18)
})

it('passes the selected catalogue definition to the existing draft flow without saving', () => {
  const callbacks = mount()
  const card = screen.getByRole('heading', { name: 'Show Day / Open House' }).closest('article')
  fireEvent.click(within(card).getByRole('button', { name: /Use template/ }))
  expect(callbacks.onUse).toHaveBeenCalledWith(expect.objectContaining({ id: 'show-day', goal: 'promote_listing', cta: 'Enquire about attending' }), true)
  expect(callbacks.onCreate).not.toHaveBeenCalled()
})

it('resets the category when changing collection and preserves private ownership and edit controls', () => {
  const callbacks = mount()
  fireEvent.click(category('Promote a Property'))
  fireEvent.click(screen.getByRole('button', { name: 'My templates' }))
  expect(category('All categories').getAttribute('aria-pressed')).toBe('true')
  expect(screen.getAllByRole('article')).toHaveLength(1)
  expect(screen.queryByText('Someone else’s private plan')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Edit template' }))
  expect(callbacks.onEdit).toHaveBeenCalledWith('mine')
  fireEvent.click(screen.getByRole('button', { name: 'Agency templates' }))
  expect(screen.getByRole('heading', { name: 'Our buyer playbook' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Edit template' })).toBeNull()
})

it('keeps ready-made campaigns usable while saved storage is loading or unavailable', () => {
  const callbacks = mount({ loading: true, error: 'Storage unavailable' })
  expect(screen.getAllByRole('article')).toHaveLength(18)
  fireEvent.click(screen.getByRole('button', { name: 'My templates' }))
  expect(screen.getByRole('alert').textContent).toContain('Storage unavailable')
  expect(screen.queryByRole('article')).toBeNull()
  expect(screen.queryByText(/No matching/)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(callbacks.onRetry).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button', { name: 'Ready-made' }))
  expect(screen.getAllByRole('article')).toHaveLength(18)
})

it('allows administrators to edit shared templates', () => {
  const callbacks = mount({ initialFilter: 'agency', canShare: true })
  fireEvent.click(screen.getByRole('button', { name: 'Edit template' }))
  expect(callbacks.onEdit).toHaveBeenCalledWith('agency')
})
