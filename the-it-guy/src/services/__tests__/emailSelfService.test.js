import { beforeEach, expect, it, vi } from 'vitest'
import { createEmailSender, createEmailSendingDomain, getEmailSendingPolicy, getEmailSendingSetup, sendEmailCampaignTest, verifyEmailSendingDomain } from '../emailCampaignService'
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), rpc: vi.fn(), from: vi.fn() }))
vi.mock('../../lib/supabaseClient', () => ({ supabase: { functions: { invoke: mocks.invoke }, rpc: mocks.rpc, from: mocks.from } }))
beforeEach(() => { vi.clearAllMocks() })
it('does not load configuration for agents or indeterminate permission', async () => {
  for (const allowed of [false, null]) {
    mocks.rpc.mockResolvedValue({ data: allowed, error: null })
    expect(await getEmailSendingSetup('org')).toEqual({ canManage: false, domains: [], identities: [] })
  }
  expect(mocks.from).not.toHaveBeenCalled()
})
it('loads only domain and sender setup, without campaign dashboards or contact queries', async () => {
  mocks.rpc.mockResolvedValue({ data: true, error: null })
  mocks.from.mockImplementation(table => {
    const query = { select: vi.fn(() => query), eq: vi.fn(() => query), order: vi.fn(async () => ({ data: [{ id: table }], error: null })) }
    return query
  })
  const result = await getEmailSendingSetup('org')
  expect(result.canManage).toBe(true)
  expect(mocks.from.mock.calls.map(([name]) => name)).toEqual(['email_sending_domains', 'email_sender_identities'])
})
it('reports account activation even before an organisation has a sending policy', async () => {
  mocks.rpc.mockResolvedValue({ data: { account_ready: false, account_blocker: 'activation' } })
  expect(await getEmailSendingPolicy('org')).toEqual({ account_ready: false, account_blocker: 'activation' })
  expect(mocks.rpc).toHaveBeenCalledWith('email_domain_setup_status', { p_organisation_id: 'org' })
})
it('keeps actionable provider errors available to the agency', async () => {
  mocks.invoke.mockResolvedValue({ error: { context: Response.json({ error: 'This domain is already claimed by another organisation.' }) } })
  await expect(createEmailSendingDomain({ organisationId: 'org', domain: 'agency.co.za' })).rejects.toThrow('already claimed')
  mocks.invoke.mockResolvedValue({ error: { context: Response.json({ error: 'Test sending is paused or a limit was reached.' }) } })
  await expect(sendEmailCampaignTest({ setupTest: true })).rejects.toThrow('limit was reached')
})
it('preserves network errors without an HTTP response', async () => {
  mocks.invoke.mockResolvedValue({ error: new Error('Network unavailable') })
  await expect(verifyEmailSendingDomain({ organisationId: 'org', domainId: 'domain' })).rejects.toThrow('Network unavailable')
})
it('saves sender details through the checked RPC without trusting a browser user id', async () => {
  mocks.rpc.mockResolvedValue({ data: { id: 'sender' }, error: null })
  await createEmailSender({ organisationId: 'org', userId: 'spoofed', displayName: ' Agency ', email: 'NEWS@AGENCY.CO.ZA', replyToEmail: 'OFFICE@AGENCY.CO.ZA', sendingDomainId: 'domain', makeDefault: true })
  expect(mocks.rpc).toHaveBeenCalledWith('email_save_sender', { p_organisation_id: 'org', p_domain_id: 'domain', p_display_name: 'Agency', p_email: 'news@agency.co.za', p_reply_to: 'office@agency.co.za', p_default: true, p_identity_id: null })
})

it('saves an Arch9 identity without accepting an address or domain override', async () => {
  mocks.rpc.mockResolvedValue({ data: { id: 'shared' }, error: null })
  await createEmailSender({ organisationId: 'org', senderMode: 'arch9', displayName: ' Samlin ', replyToEmail: 'OFFICE@SAMLIN.CO.ZA', email: 'spoof@example.com', sendingDomainId: 'foreign-domain', makeDefault: false })
  expect(mocks.rpc).toHaveBeenCalledWith('email_save_platform_sender', {
    p_organisation_id: 'org', p_display_name: 'Samlin', p_reply_to: 'office@samlin.co.za', p_default: false, p_identity_id: null,
  })
})

it('rejects unknown sender modes before contacting the backend', async () => {
  await expect(createEmailSender({ organisationId: 'org', senderMode: 'override' })).rejects.toThrow('valid sending option')
  expect(mocks.rpc).not.toHaveBeenCalled()
})
