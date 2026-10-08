import { expect, it, vi } from 'vitest'
import { buildNewLeadAgentNotification, notifyNewLeadAssignedAgent } from '../newLeadAgentNotificationService.js'
import { createRentalCrmLeadMetadata } from '../../rentals/rentalCrmLeadModel.js'

vi.mock('../../../lib/supabaseClient', () => ({ supabase: null, invokeEdgeFunction: vi.fn() }))
const input = {
  organisationId: 'org-one',
  lead: { leadId: 'lead-one', organisationId: 'org-one', assignedUserId: 'agent-one', assignedAgentEmail: 'Agent@Example.com', assignedAgentName: 'Casey Agent', createdBy: 'manager', leadCategory: 'Buyer', leadSource: 'Property24', propertyInterest: 'Unit 12', notes: 'Please call me.' },
  contact: { firstName: 'Taylor', lastName: 'Buyer', phone: '0820000000' },
}
it('emails the saved assignee with contact details and a working sales link, without needing an enquirer email', () => {
  const payload = buildNewLeadAgentNotification(input)
  expect(payload).toMatchObject({ to: 'agent@example.com', recipientName: 'Casey Agent', leadName: 'Taylor Buyer', leadPhone: '0820000000', leadEmail: '', leadSource: 'Property24', propertyLabel: 'Unit 12', enquiryMessage: 'Please call me.', title: 'New lead assigned to you', actionLink: 'https://app.arch9.co.za/pipeline/leads/lead-one' })
  expect(payload.message).not.toMatch(/copied|introduction email/)
})
it('opens rental leads in the rental workspace and gives a meaningful subject', () => {
  const payload = buildNewLeadAgentNotification({ ...input, lead: { ...input.lead, rawEnquiryPayload: createRentalCrmLeadMetadata({ organisationId: input.organisationId }) } })
  expect(payload.actionLink).toContain('/agent/rentals/pipeline/leads/lead-one')
  expect(payload.subject).toBe('New rental lead — Property24')
})
it('uses the same delivery key for retries of the same saved lead', () => {
  expect(buildNewLeadAgentNotification(input).idempotencyKey).toBe(buildNewLeadAgentNotification(input).idempotencyKey)
  expect(buildNewLeadAgentNotification({ ...input, externalReference: 'enquiry-123' }).idempotencyKey).toBe('portal-lead-agent-notification:enquiry-123:agent@example.com')
})
it('refuses records from another organisation', () => {
  expect(() => buildNewLeadAgentNotification({ ...input, contact: { organisationId: 'other-org' } })).toThrow(/organisation/)
  expect(() => buildNewLeadAgentNotification({ ...input, organisationId: 'other-org' })).toThrow(/organisation/)
})
it('looks up a missing email by the assigned user within the lead organisation', async () => {
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { email: 'fresh@example.com', first_name: 'Fresh', last_name: 'Agent' }, error: null }) }
  const client = { from: vi.fn(() => query) }
  const send = vi.fn().mockResolvedValue({ data: { ok: true, sent: true }, error: null })
  await notifyNewLeadAssignedAgent({ ...input, lead: { ...input.lead, assignedAgentEmail: '' } }, { client, send })
  expect(query.eq.mock.calls).toEqual([['organisation_id', 'org-one'], ['user_id', 'agent-one']])
  expect(send.mock.calls[0][1].body).toMatchObject({ to: 'fresh@example.com', recipientName: 'Fresh Agent' })
})
it('does not send to the creator when the lead has no assigned agent email', async () => {
  const send = vi.fn()
  const result = await notifyNewLeadAssignedAgent({ ...input, lead: { leadId: 'lead-one', createdBy: 'manager', email: 'manager@example.com' } }, { client: null, send })
  expect(result.data.reason).toBe('missing_agent_email')
  expect(send).not.toHaveBeenCalled()
})
it('reports delivery failures without throwing and preserves suppression', async () => {
  const failed = await notifyNewLeadAssignedAgent(input, { send: vi.fn().mockRejectedValue(new Error('offline')) })
  expect(failed.error.message).toBe('offline')
  const suppressed = await notifyNewLeadAssignedAgent(input, { send: vi.fn().mockResolvedValue({ data: { ok: true, sent: false, suppressed: true }, error: null }) })
  expect(suppressed.data.sent).toBe(false)
  expect(suppressed.data.suppressed).toBe(true)
})
it('reports an agent lookup transport failure without turning a saved lead into a failed ingestion', async () => {
  const send = vi.fn()
  const result = await notifyNewLeadAssignedAgent({ ...input, lead: { ...input.lead, assignedAgentEmail: '' } }, { client: { from: () => { throw new Error('lookup offline') } }, send })
  expect(result.error.message).toBe('lookup offline')
  expect(send).not.toHaveBeenCalled()
})
