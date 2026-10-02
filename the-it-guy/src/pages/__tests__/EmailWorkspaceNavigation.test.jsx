// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, useLocation } from 'react-router-dom'
import MarketingComingSoonPage from '../MarketingComingSoonPage'
vi.mock('../../components/marketing/EmailCampaigns', () => ({
  EmailCampaignOverview: ({ selectedView, onViewChange, onOpenCampaign, onCreateCampaign }) => <div><span>Selected: {selectedView}</span><button onClick={() => onViewChange('past')}>Past campaigns</button><button onClick={() => onOpenCampaign('campaign')}>Open report</button><button onClick={() => onCreateCampaign()}>New campaign</button></div>,
  EmailCampaignDetail: ({ onBack }) => <button onClick={onBack}>Back to campaigns</button>,
  CreateEmailCampaign: ({ onBack, onDraftCreated }) => <div><button onClick={onBack}>Back to campaigns</button><button onClick={() => onDraftCreated('draft')}>Remember draft</button></div>,
}))
vi.mock('../../components/marketing/LaunchesAuctions', () => ({ LaunchesOverview: () => null }))
vi.mock('../../components/marketing/MarketingDashboard', () => ({ default: () => null }))
vi.mock('../../components/marketing/WebsiteWorkspace', () => ({ default: () => null }))
vi.mock('../../components/marketing/ShowDays', () => ({ ShowDayDetail: () => null, ShowDaysOverview: () => null }))
vi.mock('../../components/marketing/ShowDayCreate', () => ({ default: () => null }))
vi.mock('../../components/marketing/WhatsAppCampaigns', () => ({
  WhatsAppCampaignOverview: ({ selectedView, onViewChange, onOpenCampaign, onCreateCampaign }) => <div><span>WhatsApp selected: {selectedView}</span><button onClick={() => onViewChange('past')}>Past campaigns</button><button onClick={() => onOpenCampaign('campaign')}>Open report</button><button onClick={() => onCreateCampaign()}>New campaign</button></div>,
  WhatsAppCampaignDetail: ({ onBack }) => <button onClick={onBack}>Back to campaigns</button>,
  CreateWhatsAppCampaign: ({ onBack, onDraftCreated }) => <div><button onClick={onBack}>Back to campaigns</button><button onClick={() => onDraftCreated('draft')}>Remember draft</button></div>,
}))
function Location() { return <output>{useLocation().search}</output> }
const mount = (url) => render(<MemoryRouter initialEntries={[url]}><MarketingComingSoonPage /><Location /></MemoryRouter>)
afterEach(cleanup)
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
