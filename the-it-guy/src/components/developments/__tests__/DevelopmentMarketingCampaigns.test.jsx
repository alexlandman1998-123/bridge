// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import DevelopmentMarketingCampaigns from '../DevelopmentMarketingCampaigns'

vi.mock('../../../context/AuthSessionContext', () => ({ useAuthSession: () => ({ authState: { currentWorkspace: { id: 'org' } } }) }))
vi.mock('../../marketing/EmailCampaigns', () => ({ CreateEmailCampaign: ({ developmentContext, onBack }) => <div role="region" aria-label="Email builder">{developmentContext.development_id}<button onClick={onBack}>Back to development</button></div>, EmailCampaignDetail: () => <div>Email results</div> }))
vi.mock('../../marketing/WhatsAppCampaigns', () => ({ CreateWhatsAppCampaign: ({ developmentContext, onBack }) => <div role="region" aria-label="WhatsApp builder">{developmentContext.development_id}<button onClick={onBack}>Back to development</button></div>, WhatsAppCampaignDetail: () => <div>WhatsApp results</div> }))
afterEach(cleanup)
const development = { id: 'harbour', name: 'Harbour Heights' }
const results = { campaigns: [
  { id: 'sent', channel: 'email', name: 'Launch invitation', status: 'sent', recipients: 25, delivered: 20, engaged: 3, date: '2026-10-01', createdBy: 'agent' },
  { id: 'draft', channel: 'whatsapp', name: 'Buyer follow up', status: 'draft', recipients: 0, delivered: 0, engaged: 0, date: '2026-10-05' },
], errors: [] }

it('shows past results separately from drafts, supports channel filtering and never invents lead counts', async () => {
  const load = vi.fn().mockResolvedValue(results)
  render(<DevelopmentMarketingCampaigns development={development} loadCampaigns={load} organisationUsers={[{ userId: 'agent', fullName: 'Alex Agent' }]} />)
  expect(await screen.findByRole('button', { name: /Launch invitation/ })).toBeTruthy()
  expect(screen.getByRole('button', { name: /Launch invitation/ }).disabled).toBe(true)
  expect(load).toHaveBeenCalledWith({ organisationId: 'org', developmentId: 'harbour' })
  expect(screen.getByText('Created by Alex Agent')).toBeTruthy()
  expect(within(screen.getByRole('table')).getByText('Not tracked')).toBeTruthy()
  expect(screen.queryByRole('button', { name: /Buyer follow up/ })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /Drafts & scheduled/ }))
  expect(screen.getByRole('button', { name: /Buyer follow up/ })).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Campaign channel'), { target: { value: 'email' } })
  expect(screen.getByText('No matching campaigns')).toBeTruthy()
  expect(screen.getByRole('button', { name: /Meta Campaign/ }).disabled).toBe(true)
  expect(screen.getByRole('button', { name: /Email Campaign/ }).disabled).toBe(true)
})

it('opens both existing builders with development context and refreshes history when returning', async () => {
  const load = vi.fn().mockResolvedValue({ campaigns: [], errors: [] })
  render(<DevelopmentMarketingCampaigns development={development} canManage loadCampaigns={load} />)
  fireEvent.click(screen.getByRole('button', { name: /Email Campaign/ }))
  expect((await screen.findByRole('region', { name: 'Email builder' })).textContent).toContain('harbour')
  fireEvent.click(screen.getByRole('button', { name: 'Back to development' }))
  await waitFor(() => expect(load).toHaveBeenCalledTimes(2))
  fireEvent.click(screen.getByRole('button', { name: /WhatsApp Campaign/ }))
  expect((await screen.findByRole('region', { name: 'WhatsApp builder' })).textContent).toContain('harbour')
})

it('discards an obsolete response when switching developments', async () => {
  let first
  const load = vi.fn().mockImplementationOnce(() => new Promise(resolve => { first = resolve })).mockResolvedValue(results)
  const view = render(<DevelopmentMarketingCampaigns development={{ id: 'old-development', name: 'Old development' }} loadCampaigns={load} />)
  await waitFor(() => expect(first).toBeTruthy())
  view.rerender(<DevelopmentMarketingCampaigns development={development} loadCampaigns={load} />)
  expect(await screen.findByRole('button', { name: /Launch invitation/ })).toBeTruthy()
  await act(async () => first({ campaigns: [], errors: [] }))
  expect(screen.getByRole('button', { name: /Launch invitation/ })).toBeTruthy()
})
