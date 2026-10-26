// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import AiCampaignAssistant from '../AiCampaignAssistant'
const mocks = vi.hoisted(() => ({ action: vi.fn(), document: vi.fn() }))
vi.mock('../../../services/aiCampaignService', () => ({ aiCampaignAction: mocks.action, aiCampaignDocument: mocks.document }))
vi.mock('../../../lib/featureFlags', () => ({ SHOW_CAMPAIGN_WORKSPACE: true }))
const copy = { subject: 'Welcome home', previewText: 'Explore this home', heading: 'A closer look', intro: 'Arrange your viewing.', cta: 'View home' }
const draft = { id: 'campaign', name: 'Home campaign', subscriptionTypeId: 'permission', contentJson: { version: 1, blocks: [] } }
const persist = vi.fn(async () => 'campaign'), apply = vi.fn()
const mount = (props = {}) => render(<AiCampaignAssistant organisationId="agency" draft={draft} persist={persist} onApply={apply} listings={[]} initialListingId="listing" initiallyOpen {...props} />)
beforeEach(() => {
  vi.clearAllMocks()
  mocks.document.mockReturnValue({ version: 1, blocks: [], ai_campaign: { usage_id: 'usage' } })
  mocks.action.mockImplementation(async (_org, action) => action === 'listings' ? { listings: [{ id: 'listing', title: 'Sea Point home' }, { id: 'another', title: 'Another home' }] } : action === 'audience' ? { count: 2, audienceFilter: { contact_ids: ['buyer'] }, explanation: 'Saved requirements' } : action === 'usage' ? { usage: [] } : { copy, language: 'en', listing: { id: 'listing' }, usageId: 'usage' })
})
afterEach(cleanup)
it('guides audience preview, generation, editable copy and draft application without sending', async () => {
  mount(); await screen.findByRole('option', { name: 'Sea Point home' })
  expect(screen.getByRole('button', { name: 'Generate email' }).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Preview matching buyers' }))
  await screen.findByText('2 eligible recipients')
  fireEvent.click(screen.getByRole('button', { name: 'Generate email' }))
  await screen.findByLabelText('Subject')
  expect(persist).toHaveBeenCalledTimes(1)
  fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Edited subject' } })
  fireEvent.click(screen.getByRole('button', { name: 'Use this email in my draft' }))
  expect(apply).toHaveBeenCalledWith(expect.objectContaining({ subject: 'Edited subject', audienceFilter: { contact_ids: ['buyer'] } }))
  expect(mocks.action.mock.calls.every(([, action]) => !['send', 'publish'].includes(action))).toBe(true)
})
it('supports revisions and translation through the same bounded action', async () => {
  mount(); await screen.findByRole('option', { name: 'Sea Point home' })
  fireEvent.click(screen.getByRole('button', { name: 'Preview matching buyers' })); await screen.findByText('2 eligible recipients')
  fireEvent.click(screen.getByRole('button', { name: 'Generate email' })); await screen.findByLabelText('Subject')
  fireEvent.click(screen.getByRole('button', { name: 'Translate to Afrikaans' }))
  await waitFor(() => expect(mocks.action).toHaveBeenLastCalledWith('agency', 'generate', expect.objectContaining({ language: 'af', previous: copy, brief: 'Translate to Afrikaans' }), expect.objectContaining({ signal: expect.any(AbortSignal) })))
  fireEvent.click(await screen.findByRole('button', { name: 'Apply proposed change' }))
  await waitFor(() => expect(screen.getByLabelText('Language').value).toBe('af'))
})
it('asks for SAST event times, keeps failures out of the draft and displays usage', async () => {
  mocks.action.mockImplementation(async (_org, action) => {
    if (action === 'listings') return { listings: [{ id: 'listing', title: 'Home' }] }
    if (action === 'audience') return { count: 0, audienceFilter: { contact_ids: ['none'] }, explanation: 'No saved preferences match' }
    if (action === 'usage') return { usage: [{ id: 'usage', model: 'configured-model', status: 'failed', cost_usd: 0.01, funding_mode: 'managed' }] }
    throw new Error('Agency AI spending limit reached.')
  })
  mount(); await screen.findByRole('option', { name: 'Home' })
  fireEvent.change(screen.getByLabelText('Objective'), { target: { value: 'show_day' } })
  expect(screen.getByLabelText('Show day starts (SAST)')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Preview matching buyers' })); await screen.findByText('0 eligible recipients')
  fireEvent.click(screen.getByRole('button', { name: 'Generate email' })); await screen.findByRole('alert')
  expect(apply).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'View recorded AI usage' }))
  expect((await screen.findByText(/configured-model/)).textContent).toContain('failed')
})
it('discards an old audience preview after the selected listing changes', async () => {
  mount(); await screen.findByRole('option', { name: 'Sea Point home' })
  fireEvent.click(screen.getByRole('button', { name: 'Preview matching buyers' })); await screen.findByText('2 eligible recipients')
  fireEvent.change(screen.getByLabelText('Listing'), { target: { value: 'another' } })
  expect(screen.queryByText('2 eligible recipients')).toBeNull()
  expect(screen.getByRole('button', { name: 'Generate email' }).disabled).toBe(true)
})
