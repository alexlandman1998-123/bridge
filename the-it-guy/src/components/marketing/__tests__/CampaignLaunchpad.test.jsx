// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import CampaignLaunchpad from '../CampaignLaunchpad'

const runtime = vi.hoisted(() => ({ load: vi.fn() }))
vi.mock('../../../services/campaignOpportunityService', () => ({ loadCampaignOpportunities: runtime.load }))
const opportunity = { id: 'show-day-evidence', recipe: 'show-day', listingId: 'listing', eventId: 'saved-show-day', title: 'Invite buyers to the garden home', area: 'Brooklyn, Pretoria', price: 'R 2 400 000', reason: 'A saved public show day is approaching.', sourceLabel: 'Public show day updated today', evidence: [{ label: 'Confirmed show day', value: 'Saturday morning', recordedAt: '2026-10-25T08:00:00Z' }], actionLabel: 'Prepare campaign', coverUrl: 'https://agency.example.test/home.jpg' }
const data = (items = [opportunity], warnings = []) => ({ items, warnings, checkedAt: '2026-10-25T10:00:00Z' })
const workspace = { userId: 'owner', campaigns: [] }
const mount = (patch = {}) => { const props = { organisationId: 'agency', workspace, onBrowseStudio: vi.fn(), refreshedAt: 'one', ...patch }; return { ...render(<MemoryRouter><CampaignLaunchpad {...props} /></MemoryRouter>), props } }
const query = (link) => new URL(link.getAttribute('href'), 'https://app.example.test').searchParams
const deferred = () => { let resolve; const promise = new Promise((accept) => { resolve = accept }); return { promise, resolve } }
beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); runtime.load.mockResolvedValue(data()) })
afterEach(cleanup)

it('opens the existing email composer with each concrete recipe and keeps studio navigation available', async () => {
  const view = mount()
  await screen.findByRole('heading', { name: opportunity.title })
  expect(query(screen.getByRole('link', { name: 'Create a property email' })).get('objective')).toBe('new_listing')
  for (const [name, objective] of [['New listing: Introduce a property', 'new_listing'], ['Price reduction: Share a new price', 'price_reduction'], ['Show day: Bring buyers through', 'show_day']]) {
    const params = query(screen.getByRole('link', { name }))
    expect(Object.fromEntries(params)).toMatchObject({ section: 'email', view: 'create', ai: '1', objective })
  }
  fireEvent.click(screen.getByRole('button', { name: 'Explore the studio' }))
  expect(view.props.onBrowseStudio).toHaveBeenCalledOnce()
  expect(runtime.load).toHaveBeenCalledWith('agency', 'owner', { campaigns: [], emailCampaigns: [], emailCampaignsAvailable: true })
})

it('starts from six business outcomes and connects the selected goal to its existing campaign builder', async () => {
  mount()
  await screen.findByRole('heading', { name: opportunity.title })
  const goals = within(screen.getByRole('group', { name: 'Business goals' }))
  expect(goals.getAllByRole('button')).toHaveLength(6)
  expect(query(screen.getByRole('link', { name: 'Win your next valuation' })).get('template')).toBe('sellers')
  for (const [name, action, template, goal] of [
    ['Win valuations & seller mandates', 'Build a seller campaign', 'sellers', 'seller-growth'],
    ['Find buyers', 'Build a buyer campaign', 'buyers', 'buyer-growth'],
    ['Build your brand & local expertise', 'Build your introduction', 'meet-your-agent', 'brand-expertise'],
    ['Nurture past clients', 'Build a client check-in', 'client-check-in', 'client-nurture'],
    ['Earn reviews & referrals', 'Build a referral invitation', 'referral-request', 'reviews-referrals'],
    ['Market a property', 'Build a property campaign', 'new-listing', 'property-marketing'],
  ]) {
    const card = goals.getByRole('button', { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) })
    fireEvent.click(card)
    expect(card.getAttribute('aria-pressed')).toBe('true')
    expect(goals.getAllByRole('button').filter((button) => button.getAttribute('aria-pressed') === 'true')).toHaveLength(1)
    expect(Object.fromEntries(query(screen.getByRole('link', { name: action })))).toMatchObject({ section: 'campaigns', view: 'create', template, goal })
  }
})

it('keeps the selected business goal when the same market update can serve brand or past-client work', async () => {
  mount()
  await screen.findByRole('heading', { name: opportunity.title })
  fireEvent.click(screen.getByRole('button', { name: /^Build your brand & local expertise/ }))
  expect(Object.fromEntries(query(screen.getByRole('link', { name: /Explain your local market/ })))).toMatchObject({ template: 'market-update', goal: 'brand-expertise' })
  fireEvent.click(screen.getByRole('button', { name: /^Nurture past clients/ }))
  expect(Object.fromEntries(query(screen.getByRole('link', { name: /Share useful local insight/ })))).toMatchObject({ template: 'market-update', goal: 'client-nurture' })
  expect(screen.getByRole('link', { name: 'Create a property email' })).toBeTruthy()
  expect(screen.getByText(/You review each send or publishing handoff/)).toBeTruthy()
})

it('brings the selected mobile plan into view, moves focus, and honours reduced motion', async () => {
  const priorWidth = window.innerWidth
  const priorScroll = HTMLElement.prototype.scrollIntoView
  const scroll = vi.fn()
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
  HTMLElement.prototype.scrollIntoView = scroll
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
  vi.stubGlobal('requestAnimationFrame', (callback) => { callback(); return 0 })
  try {
    mount()
    await screen.findByRole('heading', { name: opportunity.title })
    fireEvent.click(screen.getByRole('button', { name: /^Nurture past clients/ }))
    const plan = screen.getByRole('region', { name: 'Plan: Nurture past clients' })
    expect(scroll).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' })
    expect(document.activeElement).toBe(plan)
  } finally {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: priorWidth })
    HTMLElement.prototype.scrollIntoView = priorScroll
    vi.unstubAllGlobals()
  }
})

it('carries the exact saved property and show-day reference through an evidence-based suggestion', async () => {
  mount(); await screen.findByRole('heading', { name: opportunity.title })
  const params = query(screen.getByRole('link', { name: 'Prepare campaign' }))
  expect(Object.fromEntries(params)).toMatchObject({ listingId: 'listing', eventId: 'saved-show-day', objective: 'show_day', ai: '1' })
  fireEvent.click(screen.getByText('Why this suggestion?'))
  expect(screen.getByText('Public show day updated today')).toBeTruthy()
  expect(screen.getByText(/Saturday morning/)).toBeTruthy()
  expect(screen.getByText('Based on records available to you in Arch9.')).toBeTruthy()
})

it('dismisses and restores a suggestion using storage scoped to both agency and person', async () => {
  mount(); await screen.findByRole('heading', { name: opportunity.title })
  fireEvent.click(screen.getByRole('button', { name: `Dismiss suggestion: ${opportunity.title}` }))
  expect(screen.queryByRole('heading', { name: opportunity.title })).toBeNull()
  expect(JSON.parse(localStorage.getItem('arch9:campaign-opportunities:agency:owner'))).toEqual(['show-day-evidence'])
  fireEvent.click(screen.getByRole('button', { name: 'Restore dismissed suggestions on this browser' }))
  expect(screen.getByRole('heading', { name: opportunity.title })).toBeTruthy()
  expect(JSON.parse(localStorage.getItem('arch9:campaign-opportunities:agency:owner'))).toEqual([])
})

it('resumes the most recently edited campaign draft without treating scheduled plans as editable drafts', async () => {
  mount({ workspace: { ...workspace, campaigns: [{ id: 'old', name: 'Older draft', status: 'draft', updated_at: '2026-10-24T08:00:00Z' }, { id: 'recent', name: 'Latest draft', objective: 'Book viewings', area: 'Brooklyn', status: 'draft', updated_at: '2026-10-25T08:00:00Z' }, { id: 'scheduled', name: 'Scheduled plan', status: 'scheduled', updated_at: '2026-10-25T09:00:00Z' }] } })
  await screen.findByRole('heading', { name: opportunity.title })
  expect(screen.getByRole('heading', { name: 'Latest draft' })).toBeTruthy()
  expect(Object.fromEntries(query(screen.getByRole('link', { name: 'Continue draft' })))).toMatchObject({ section: 'campaigns', view: 'detail', id: 'recent', tab: 'playbook' })
  expect(screen.getByText('2 drafts in your workspace')).toBeTruthy()
})

it('keeps partial-source warnings visible and describes only the available records', async () => {
  runtime.load.mockResolvedValue(data([], ['Show days are unavailable. Event opportunities could not be checked.']))
  mount()
  expect(await screen.findByText('Show days are unavailable. Event opportunities could not be checked.')).toBeTruthy()
  expect(screen.getByText('No new suggestions in the available records')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Create a property email' })).toBeTruthy()
})

it('shows a recoverable load failure while manual campaign creation remains available', async () => {
  runtime.load.mockRejectedValueOnce(new Error('Visible listings could not be checked.'))
  mount()
  expect((await screen.findByRole('alert')).textContent).toContain('Visible listings could not be checked.')
  expect(screen.queryByText('No new suggestions in the available records')).toBeNull()
  runtime.load.mockResolvedValueOnce(data())
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await screen.findByRole('heading', { name: opportunity.title })).toBeTruthy()
})

it('discards an older opportunity response after a newer workspace refresh', async () => {
  const old = deferred()
  runtime.load.mockReturnValueOnce(old.promise).mockResolvedValueOnce(data([{ ...opportunity, id: 'current', title: 'Current property evidence' }]))
  const view = mount()
  view.rerender(<MemoryRouter><CampaignLaunchpad {...view.props} refreshedAt="two" /></MemoryRouter>)
  expect(await screen.findByRole('heading', { name: 'Current property evidence' })).toBeTruthy()
  await act(async () => old.resolve(data([{ ...opportunity, title: 'Outdated property evidence' }])))
  expect(screen.queryByRole('heading', { name: 'Outdated property evidence' })).toBeNull()
  expect(screen.getByRole('heading', { name: 'Current property evidence' })).toBeTruthy()
})

it('provides an intentional property fallback when source artwork fails', async () => {
  mount(); await screen.findByRole('heading', { name: opportunity.title })
  fireEvent.error(screen.getByRole('img', { name: opportunity.title }))
  await waitFor(() => expect(screen.queryByRole('img', { name: opportunity.title })).toBeNull())
  expect(screen.getAllByText('Brooklyn, Pretoria').length).toBeGreaterThan(0)
  expect(screen.getByRole('link', { name: 'Prepare campaign' })).toBeTruthy()
})

it('passes recorded email provenance and its availability into opportunity suppression', async () => {
  const email = { id: 'email', ai_listing_id: 'listing', ai_objective: 'show_day', ai_event_id: 'saved-show-day', status: 'draft' }
  mount({ workspace: { ...workspace, channels: { email: { data: [email], error: 'Recent email activity is unavailable' } } } })
  await screen.findByRole('heading', { name: opportunity.title })
  expect(runtime.load).toHaveBeenCalledWith('agency', 'owner', { campaigns: [], emailCampaigns: [email], emailCampaignsAvailable: false })
})
