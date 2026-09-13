import { beforeEach, expect, it, vi } from 'vitest'
import { whatsappCampaignRequest } from '../whatsappCampaignService'
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('../../lib/supabaseClient', () => ({ invokeEdgeFunction: invoke }))
beforeEach(() => { invoke.mockReset() })
it('explains thrown fetch failures without adding another retry', async () => {
  invoke.mockRejectedValue(new TypeError('Failed to fetch'))
  await expect(whatsappCampaignRequest('org', 'workspace')).rejects.toThrow('Unable to reach the WhatsApp campaign service')
  expect(invoke).toHaveBeenCalledTimes(1)
})
it('explains a returned SDK transport failure', async () => {
  invoke.mockResolvedValue({ error: { name: 'FunctionsFetchError', message: 'Failed to send a request to the Edge Function' } })
  await expect(whatsappCampaignRequest('org', 'workspace')).rejects.toThrow('check that the WhatsApp service is deployed')
})
it('identifies an undeployed function and a missing campaign schema', async () => {
  invoke.mockResolvedValueOnce({ error: { code: 'NOT_FOUND', message: 'Requested function was not found' } })
    .mockResolvedValueOnce({ data: { error: 'relation "public.whatsapp_campaigns" does not exist' } })
  await expect(whatsappCampaignRequest('org', 'workspace')).rejects.toThrow('setup is incomplete')
  await expect(whatsappCampaignRequest('org', 'workspace')).rejects.toThrow('database update')
})
it('preserves actionable application errors', async () => {
  invoke.mockResolvedValue({ data: { error: 'The selected template is no longer approved.' } })
  await expect(whatsappCampaignRequest('org', 'prepare')).rejects.toThrow('The selected template is no longer approved.')
})
it('returns results and keeps the requested organisation and action authoritative', async () => {
  invoke.mockResolvedValue({ data: { campaigns: [] } })
  await expect(whatsappCampaignRequest('org', 'workspace', { organisationId: 'other', action: 'dispatch' })).resolves.toEqual({ campaigns: [] })
  expect(invoke).toHaveBeenCalledWith('whatsapp-campaigns', { body: { organisationId: 'org', action: 'workspace' } })
})
it('rejects missing workspace and empty responses', async () => {
  await expect(whatsappCampaignRequest('', 'workspace')).rejects.toThrow('Choose an organisation')
  expect(invoke).not.toHaveBeenCalled()
  invoke.mockResolvedValue({ data: null })
  await expect(whatsappCampaignRequest('org', 'workspace')).rejects.toThrow('returned no data')
})
