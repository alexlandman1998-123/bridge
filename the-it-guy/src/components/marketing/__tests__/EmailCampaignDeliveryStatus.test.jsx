// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { EmailCampaignDetail } from '../EmailCampaigns'
const mocks = vi.hoisted(() => ({ workspace: vi.fn(), analytics: vi.fn(), preflight: vi.fn() }))
vi.mock('../../../context/AuthSessionContext', () => ({ useAuthSession: () => ({ authState: { currentWorkspace: { id: 'org' }, user: { id: 'user' } } }) }))
vi.mock('../EmailCampaignBuilder', () => ({ default: () => null }))
vi.mock('../EmailCampaignSettings', () => ({ default: () => null }))
vi.mock('../EmailAudienceBuilder', () => ({ default: () => null }))
vi.mock('../ChannelWorkspaceTemplates', () => ({ default: () => null }))
vi.mock('../../../services/emailCampaignService', () => ({ getEmailCampaignWorkspace: mocks.workspace, getEmailCampaignAnalytics: mocks.analytics, preflightEmailCampaign: mocks.preflight, archiveEmailCampaign: vi.fn(), cancelEmailCampaign: vi.fn(), duplicateEmailCampaign: vi.fn(), refreshEmailSenderVerification: vi.fn() }))
const result = delivery => ({ recipients: [{ id: 'recipient', email: 'buyer@example.com', status: 'queued' }], events: [], links: [], audit: [], delivery })
beforeEach(() => {
  vi.resetAllMocks()
  mocks.workspace.mockResolvedValue({ campaigns: [{ id: 'campaign', name: 'Property news', status: 'sending', subject: 'Latest homes' }], performance: [] })
  mocks.analytics.mockResolvedValue(result({ state: 'queued', message: 'Arch9 sending capacity is unavailable. Queued recipients are retained.' }))
})
afterEach(cleanup)
it('shows why queued work is waiting and refreshes to its actual failure reason', async () => {
  render(<EmailCampaignDetail campaignId="campaign" onBack={() => {}} />)
  await screen.findByText('Arch9 sending capacity is unavailable. Queued recipients are retained.')
  expect(screen.getByText('buyer@example.com', { selector: 'strong' })).toBeTruthy()
  mocks.analytics.mockResolvedValue(result({ state: 'failed', message: 'The sender is no longer verified.' }))
  fireEvent.click(screen.getByRole('button', { name: 'Refresh delivery status' }))
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'The sender is no longer verified.')
})
it('preserves recipient evidence when delivery-status storage is unavailable', async () => {
  mocks.analytics.mockResolvedValue(result(null))
  render(<EmailCampaignDetail campaignId="campaign" onBack={() => {}} />)
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('Delivery status could not be loaded'))
  expect(screen.getByText('buyer@example.com', { selector: 'strong' })).toBeTruthy()
})
it('shows precise failed preflight checks as an error instead of a success notice', async () => {
  mocks.preflight.mockResolvedValue({ ready: false, issues: ['Choose a verified sender.', 'This audience has no opted-in recipients.'] })
  render(<EmailCampaignDetail campaignId="campaign" onBack={() => {}} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Run preflight' }))
  expect(await screen.findByText('Choose a verified sender. This audience has no opted-in recipients.')).toBeTruthy()
})
