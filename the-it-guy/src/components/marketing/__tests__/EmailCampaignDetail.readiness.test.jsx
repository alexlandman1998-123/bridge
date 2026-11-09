// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
const api = vi.hoisted(() => ({ workspace: vi.fn(), check: vi.fn(), analytics: vi.fn() }))
vi.mock('../../../context/AuthSessionContext', () => ({ useAuthSession: () => ({ authState: { currentWorkspace: { id: 'revo' }, user: { id: 'agent' } } }) }))
vi.mock('../../../services/emailCampaignService', () => ({
  getEmailCampaignWorkspace: api.workspace, preflightEmailCampaign: api.check, getEmailCampaignAnalytics: api.analytics,
  archiveEmailCampaign: vi.fn(), cancelEmailCampaign: vi.fn(), duplicateEmailCampaign: vi.fn(), refreshEmailSenderVerification: vi.fn(),
}))
import { EmailCampaignDetail } from '../EmailCampaigns'
beforeEach(() => {
  vi.clearAllMocks()
  api.workspace.mockResolvedValue({ campaigns: [{ id: 'campaign', name: 'The Lyle', status: 'draft' }], performance: [] })
  api.analytics.mockResolvedValue({ recipients: [], events: [], links: [], audit: [] })
})
afterEach(cleanup)
it('finishes an inaccessible campaign lookup with a useful access message', async () => {
  api.workspace.mockResolvedValue({ campaigns: [], performance: [] })
  render(<EmailCampaignDetail campaignId="missing" onBack={vi.fn()} />)
  expect((await screen.findByRole('alert')).textContent).toContain('not available in your current workspace')
  expect(screen.queryByText('Loading campaign…')).toBeNull()
})
it('replaces an earlier successful preflight with the actual new failure reasons', async () => {
  api.check.mockResolvedValueOnce({ ready: true, eligible_recipients: 3 }).mockResolvedValueOnce({ ready: false, checks: [{ key: 'sender', ok: false }, { key: 'policy', ok: false }] })
  render(<EmailCampaignDetail campaignId="campaign" onBack={vi.fn()} onEdit={vi.fn()} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Run preflight' }))
  await screen.findByText('Preflight passed for 3 eligible recipients.')
  await waitFor(() => expect(screen.getByRole('button', { name: 'Run preflight' }).disabled).toBe(false))
  fireEvent.click(screen.getByRole('button', { name: 'Run preflight' }))
  expect((await screen.findByRole('alert')).textContent).toContain('Choose a verified sender')
  expect(screen.getByRole('alert').textContent).toContain('not approved or is paused')
  expect(screen.queryByText('Preflight passed for 3 eligible recipients.')).toBeNull()
})
