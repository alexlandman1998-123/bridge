// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, useLocation } from 'react-router-dom'
import MarketingComingSoonPage from '../MarketingComingSoonPage'
vi.mock('../../components/marketing/WhatsAppAutomations', () => ({ default: () => <span>Automations preserved</span> }))
vi.mock('../../components/marketing/EmailCampaigns', () => ({
  EmailCampaignOverview: ({ selectedView, onViewChange, onOpenCampaign, onCreateCampaign }) => <div><span>Selected: {selectedView}</span><button onClick={() => onViewChange('past')}>Past campaigns</button><button onClick={() => onViewChange('templates')}>Templates</button><button onClick={() => onOpenCampaign('campaign')}>Open report</button><button onClick={() => onCreateCampaign()}>New campaign</button></div>,
  EmailCampaignDetail: ({ onBack }) => <button onClick={onBack}>Back to campaigns</button>,
  CreateEmailCampaign: ({ onBack, onDraftCreated }) => <div><button onClick={onBack}>Back to campaigns</button><button onClick={() => onDraftCreated('draft')}>Remember draft</button></div>,
}))
vi.mock('../../components/marketing/LaunchesAuctions', () => ({ LaunchesOverview: () => null }))
vi.mock('../../components/marketing/MarketingDashboard', () => ({ default: () => null }))
vi.mock('../../components/marketing/MarketingCampaigns', () => ({ default: () => <span>Campaign workspace</span> }))
vi.mock('../../components/marketing/WebsiteWorkspace', () => ({ default: () => null }))
vi.mock('../../components/marketing/ShowDays', () => ({ ShowDayDetail: () => null, ShowDaysOverview: () => null }))
vi.mock('../../components/marketing/ShowDayCreate', () => ({ default: () => null }))
vi.mock('../../components/marketing/WhatsAppCampaigns', () => ({
  WhatsAppCampaignOverview: ({ selectedView, onViewChange, onOpenCampaign, onCreateCampaign }) => <div><span>WhatsApp selected: {selectedView}</span><button onClick={() => onViewChange('past')}>Past campaigns</button><button onClick={() => onViewChange('templates')}>Templates</button><button onClick={() => onOpenCampaign('campaign')}>Open report</button><button onClick={() => onCreateCampaign()}>New campaign</button></div>,
  WhatsAppCampaignDetail: ({ onBack }) => <button onClick={onBack}>Back to campaigns</button>,
  CreateWhatsAppCampaign: ({ onBack, onDraftCreated }) => <div><button onClick={onBack}>Back to campaigns</button><button onClick={() => onDraftCreated('draft')}>Remember draft</button></div>,
}))
function Location() { const location = useLocation(); return <output data-path={location.pathname}>{location.search}</output> }
const mount = (url) => render(<MemoryRouter initialEntries={[url]}><MarketingComingSoonPage /><Location /></MemoryRouter>)
afterEach(cleanup)

it('opens a shareable business goal in its existing builder while retaining the mobile workspace path', () => {
  mount('/mobile/marketing?section=campaigns&goal=client-nurture')
  expect(screen.getByText('Campaign workspace')).toBeTruthy()
  expect(screen.getByRole('status').getAttribute('data-path')).toBe('/mobile/marketing')
  const params = new URLSearchParams(screen.getByRole('status').textContent)
  expect(Object.fromEntries(params)).toEqual({ section: 'campaigns', goal: 'client-nurture', view: 'create', template: 'client-check-in' })
})

it.each([
  '?section=campaigns&goal=buyer-growth&view=detail&id=saved&tab=audience',
  '?section=campaigns&goal=buyer-growth&view=create&template=first-time-buyer',
  '?section=email&goal=buyer-growth&view=create&listingId=property&objective=show_day',
  '?section=campaigns&goal=unknown',
])('retains an explicit campaign or channel route: %s', (search) => {
  mount(`/marketing${search}`)
  expect(screen.getByRole('status').textContent).toBe(search)
})
describe('Email workspace links', () => {
  it('loads the tab from a direct link and writes menu changes to the URL', () => {
    mount('/marketing?section=email&tab=settings')
    expect(screen.getByText('Selected: settings')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Past campaigns' }))
    expect(screen.getByRole('status').textContent).toBe('?section=email&tab=past')
  })
  it('returns from reporting to the same past campaigns tab', () => {
    mount('/marketing?section=email&tab=past')
    fireEvent.click(screen.getByRole('button', { name: 'Open report' }))
    expect(screen.getByRole('status').textContent).toContain('tab=past&view=detail&id=campaign')
    fireEvent.click(screen.getByRole('button', { name: 'Back to campaigns' }))
    expect(screen.getByText('Selected: past')).toBeTruthy()
  })
  it('retains the selected tab after remembering a new draft and returning', () => {
    mount('/marketing?section=email&tab=audiences')
    fireEvent.click(screen.getByRole('button', { name: 'New campaign' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remember draft' }))
    expect(screen.getByRole('status').textContent).toContain('tab=audiences&view=create&id=draft')
    fireEvent.click(screen.getByRole('button', { name: 'Back to campaigns' }))
    expect(screen.getByText('Selected: audiences')).toBeTruthy()
  })
})

it('preserves WhatsApp menu links through reports and draft creation', () => {
  mount('/marketing?section=whatsapp&tab=settings')
  expect(screen.getByText('WhatsApp selected: settings')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Past campaigns' }))
  expect(screen.getByRole('status').textContent).toBe('?section=whatsapp&tab=past')
  fireEvent.click(screen.getByRole('button', { name: 'Open report' }))
  expect(screen.getByRole('status').textContent).toContain('tab=past&view=detail&id=campaign')
  fireEvent.click(screen.getByRole('button', { name: 'Back to campaigns' }))
  expect(screen.getByText('WhatsApp selected: past')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'New campaign' }))
  fireEvent.click(screen.getByRole('button', { name: 'Remember draft' }))
  expect(screen.getByRole('status').textContent).toContain('tab=past&view=create&id=draft')
  fireEvent.click(screen.getByRole('button', { name: 'Back to campaigns' }))
  expect(screen.getByText('WhatsApp selected: past')).toBeTruthy()
})

it.each(['email', 'whatsapp'])('supports direct %s template links and keeps the tab after returning from reporting', (channel) => {
 mount(`/marketing?section=${channel}&tab=templates`)
 expect(screen.getByText(channel === 'email' ? 'Selected: templates' : 'WhatsApp selected: templates')).toBeTruthy()
 fireEvent.click(screen.getByRole('button', { name: 'Open report' }))
 fireEvent.click(screen.getByRole('button', { name: 'Back to campaigns' }))
 expect(screen.getByRole('status').textContent).toBe(`?section=${channel}&tab=templates`)
 fireEvent.click(screen.getByRole('button', { name: 'Past campaigns' }))
 fireEvent.click(screen.getByRole('button', { name: 'Templates' }))
 expect(screen.getByRole('status').textContent).toBe(`?section=${channel}&tab=templates`)
})

it.each(['email', 'whatsapp'])('retains the mobile %s path, selected tab and saved draft through the shared workspace', (channel) => {
  mount(`/mobile/marketing?section=${channel}&tab=templates`)
  expect(screen.getByText(channel === 'email' ? 'Selected: templates' : 'WhatsApp selected: templates')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'New campaign' }))
  fireEvent.click(screen.getByRole('button', { name: 'Remember draft' }))
  expect(screen.getByRole('status').textContent).toBe(`?section=${channel}&tab=templates&view=create&id=draft`)
  expect(screen.getByRole('status').getAttribute('data-path')).toBe('/mobile/marketing')
  fireEvent.click(screen.getByRole('button', { name: 'Back to campaigns' }))
  expect(screen.getByRole('status').textContent).toBe(`?section=${channel}&tab=templates`)
})


it('retains the released WhatsApp automations route while adding the new business goal flow', () => {
  mount('/mobile/marketing?section=whatsapp&view=automations')
  expect(screen.getByText('Automations preserved')).toBeTruthy()
  expect(screen.getByRole('status').getAttribute('data-path')).toBe('/mobile/marketing')
  expect(screen.getByRole('status').textContent).toBe('?section=whatsapp&view=automations')
})
