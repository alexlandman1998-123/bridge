import { beforeEach, expect, it, vi } from 'vitest'
import { checkEmailCampaignContent, preflightEmailCampaign, scheduleEmailCampaign } from '../emailCampaignService'
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), rpc: vi.fn() }))
vi.mock('../../lib/supabaseClient', () => ({ supabase: { functions: { invoke: mocks.invoke }, rpc: mocks.rpc } }))
beforeEach(() => {
  vi.resetAllMocks()
  mocks.invoke.mockResolvedValue({ data: { ready: true, errors: [], warnings: [] }, error: null })
  mocks.rpc.mockResolvedValue({ data: { ready: true, checks: [{ key: 'sender', ok: true }] }, error: null })
})

it('checks the saved campaign on the server instead of sending a client manifest or HTML', async () => {
  await checkEmailCampaignContent('campaign')
  expect(mocks.invoke).toHaveBeenCalledWith('email-campaign-content-check', { body: { campaignId: 'campaign' } })
})

it('blocks dispatch when content or image checks fail', async () => {
  mocks.invoke.mockResolvedValue({ data: { ready: false, errors: ['Image missing.'], warnings: [] } })
  await expect(scheduleEmailCampaign('campaign')).rejects.toThrow('Image missing.')
  expect(mocks.rpc).not.toHaveBeenCalled()
})

it('combines content readiness with sender, consent and audience readiness', async () => {
  mocks.invoke.mockResolvedValue({ data: { ready: false, errors: ['Image missing.'], warnings: [] } })
  const result = await preflightEmailCampaign('campaign')
  expect(result.ready).toBe(false)
  expect(result.contentCheck.errors).toEqual(['Image missing.'])
  expect(result.checks).toEqual([{ key: 'sender', ok: true }, { key: 'content', ok: false }])
})

it('rechecks content before queueing and retains the existing dispatch RPC and time', async () => {
  const date = '2026-10-10T12:00:00.000Z'
  await scheduleEmailCampaign('campaign', date)
  expect(mocks.invoke).toHaveBeenCalledTimes(1)
  expect(mocks.rpc).toHaveBeenCalledWith('email_campaign_prepare_dispatch', { p_campaign_id: 'campaign', p_send_at: date })
})

it.each([null, { ready: true }, { ready: true, errors: 'bad', warnings: [] }])('fails closed for an incomplete server response', async (data) => {
  mocks.invoke.mockResolvedValue({ data })
  await expect(scheduleEmailCampaign('campaign')).rejects.toThrow('could not be confirmed')
  expect(mocks.rpc).not.toHaveBeenCalled()
})

it('explains an unavailable server check without falling back to client-only validation', async () => {
  mocks.invoke.mockResolvedValue({ error: new Error('Function not found') })
  await expect(scheduleEmailCampaign('campaign')).rejects.toThrow('administrator to enable it')
  expect(mocks.rpc).not.toHaveBeenCalled()
})
