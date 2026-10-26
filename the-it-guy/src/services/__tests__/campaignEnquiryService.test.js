import { expect, it, vi } from 'vitest'
vi.mock('../../lib/supabaseClient', () => ({ supabase: null }))
vi.mock('../../lib/settingsApi', () => ({ listOrganisationUsersForWorkspace: vi.fn() }))
import { buildCampaignEnquiries, loadCampaignEnquiries, loadCampaignOverviewEnquiries, saveCampaignEnquiryAction, searchCampaignLeads } from '../campaignEnquiryService'
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const org = id(1), campaign = id(2), leadId = id(3), owner = id(4), contactId = id(5)
const links = [{ id: id(6), lead_id: leadId, channel: 'email', responded_at: '2026-10-25T08:00:00Z' }]
const leads = [{ lead_id: leadId, contact_id: contactId, assigned_agent_id: owner, stage: 'New Lead', status: 'New Lead' }]
const contacts = [{ contact_id: contactId, first_name: 'Jane', last_name: 'Doe', email: 'jane@example.test' }]
function clientFor(data = {}, errors = {}) {
  const calls = []
  const client = { calls, rpc: vi.fn().mockResolvedValue({ data: id(9) }), from(table) {
    const call = { table, eq: [], in: [], or: [] }; calls.push(call)
    const result = () => ({ data: data[table] || [], error: errors[table] })
    const query = {
      select(fields) { call.fields = fields; return query },
      eq(key, value) { call.eq.push([key, value]); return query },
      in(key, value) { call.in.push([key, value]); return query },
      or(value) { call.or.push(value); return query }, order() { return query }, limit() { return query },
      async range(start, end) { const value = result(); return { ...value, data: value.data.slice(start, end + 1) } },
      then(resolve) { return Promise.resolve(result()).then(resolve) },
    }
    return query
  } }
  return client
}
it('uses current CRM ownership, open tasks and actual contact logs rather than task activity', () => {
  const entries = buildCampaignEnquiries({ links, leads, contacts, userId: owner,
    directory: [{ userId: owner, firstName: 'Sarah', lastName: 'Jacobs' }],
    tasks: [{ task_id: id(10), lead_id: leadId, title: 'Valuation call', due_date: '2026-10-24', status: 'Pending' }, { task_id: id(11), lead_id: leadId, due_date: '2026-10-01', status: 'Completed' }],
    activities: [{ lead_id: leadId, activity_type: 'Email', activity_date: '2026-10-24T09:00:00Z', outcome: 'Sent' }, { lead_id: leadId, activity_type: 'Follow-up', activity_date: '2026-10-25T10:00:00Z', outcome: 'Completed' }],
  }, new Date('2026-10-25T08:00:00Z'))
  expect(entries[0]).toMatchObject({ name: 'Jane Doe', ownerName: 'Sarah Jacobs', canWork: true, overdue: true, awaitingContact: true, nextTask: { title: 'Valuation call' }, lastContact: { activity_type: 'Email' } })
})
it('does not invent contact history, assignment or overdue tasks when data is unavailable', () => {
  const [entry] = buildCampaignEnquiries({ links, leads: [{ ...leads[0], assigned_agent_id: null }], contacts, tasksAvailable: false, activitiesAvailable: false })
  expect(entry).toMatchObject({ ownerName: 'Unassigned', ownerId: null, overdue: false, awaitingContact: false, canWork: false })
  expect(buildCampaignEnquiries({ links, leads: [], contacts })).toEqual([])
})
it('scopes and batches CRM reads to the linked campaign leads and distinguishes failed sources', async () => {
  const client = clientFor({ marketing_campaign_enquiries: links, leads, contacts }, { tasks: { code: '42501' } })
  const result = await loadCampaignEnquiries({ organisationId: org, campaignId: campaign, userId: owner }, { client, loadDirectory: async () => [] })
  expect(result.tasksAvailable).toBe(false)
  expect(result.warnings).toContain('CRM follow-up tasks could not be loaded.')
  expect(client.calls.every((call) => call.eq.some(([key, value]) => key === 'organisation_id' && value === org))).toBe(true)
  expect(client.calls[0].eq).toContainEqual(['campaign_id', campaign])
  expect(client.calls.filter((call) => ['tasks', 'lead_activities', 'leads'].includes(call.table)).every((call) => call.in.some(([field, ids]) => field === 'lead_id' && ids.length === 1 && ids[0] === leadId))).toBe(true)
})
it('reports a missing migration and avoids loading the entire CRM for an empty campaign', async () => {
  const missing = clientFor({}, { marketing_campaign_enquiries: { code: '42P01' } })
  await expect(loadCampaignEnquiries({ organisationId: org, campaignId: campaign }, { client: missing })).rejects.toThrow('not enabled')
  const empty = clientFor()
  expect((await loadCampaignEnquiries({ organisationId: org, campaignId: campaign }, { client: empty })).entries).toEqual([])
  expect(empty.calls).toHaveLength(1)
})
it('validates before writing, forwards stable request IDs and requires a confirmed receipt', async () => {
  const client = clientFor()
  const context = { organisationId: org, campaignId: campaign, leadId }
  await expect(saveCampaignEnquiryAction({ ...context, action: 'follow_up', payload: { id: id(9), title: '', dueDate: '2026-10-26' } }, { client })).rejects.toThrow('title')
  await expect(saveCampaignEnquiryAction({ ...context, action: 'record', payload: { channel: 'email', respondedAt: '2099-01-01T00:00:00Z' } }, { client })).rejects.toThrow('past')
  expect(client.rpc).not.toHaveBeenCalled()
  const payload = { id: id(9), title: 'Call Jane', dueDate: '2026-10-26' }
  await saveCampaignEnquiryAction({ ...context, action: 'follow_up', payload }, { client })
  expect(client.rpc).toHaveBeenCalledWith('marketing_campaign_enquiry_action', { p_org: org, p_campaign: campaign, p_lead: leadId, p_action: 'follow_up', p_payload: payload })
  client.rpc.mockResolvedValueOnce({ data: null })
  await expect(saveCampaignEnquiryAction({ ...context, action: 'follow_up', payload }, { client })).rejects.toThrow('confirmed')
})
it('sanitises CRM searches and limits matching leads to the current agency', async () => {
  const client = clientFor({ contacts, leads })
  const results = await searchCampaignLeads({ organisationId: org, campaignId: campaign, search: 'Jane,()%_' }, { client })
  expect(results[0].name).toBe('Jane Doe')
  expect(client.calls[0].or).toEqual(['first_name.ilike.%Jane%,last_name.ilike.%Jane%,email.ilike.%Jane%,phone.ilike.%Jane%'])
  expect(client.calls[1].eq).toContainEqual(['organisation_id', org])
  expect(client.calls[1].in).toContainEqual(['contact_id', [contactId]])
})

it('loads the overview in batches, deduplicates campaign scope and hydrates each CRM source once', async () => {
  const client = clientFor({ marketing_campaign_enquiries: [{ ...links[0], campaign_id: campaign }, { ...links[0], id: id(7), campaign_id: id(8) }], leads, contacts })
  const data = await loadCampaignOverviewEnquiries({ organisationId: org, campaignIds: [campaign, campaign, id(8)], userId: owner }, { client, loadDirectory: async () => [] })
  expect(data.entries).toHaveLength(2)
  expect(client.calls[0].in).toEqual([['campaign_id', [campaign, id(8)]]])
  expect(client.calls.filter((call) => call.table === 'leads')).toHaveLength(1)
  expect(client.calls.filter((call) => call.table === 'tasks')).toHaveLength(1)
  expect(client.calls.every((call) => call.eq.some(([key, value]) => key === 'organisation_id' && value === org))).toBe(true)
})
it('limits each overview filter to 100 campaigns, skips empty scopes and does not reveal RLS-hidden leads', async () => {
  const client = clientFor()
  const directory = vi.fn().mockResolvedValue([])
  await loadCampaignOverviewEnquiries({ organisationId: org, campaignIds: [] }, { client, loadDirectory: directory })
  expect(client.calls).toHaveLength(0)
  expect(directory).not.toHaveBeenCalled()
  await loadCampaignOverviewEnquiries({ organisationId: org, campaignIds: Array.from({ length: 101 }, (_, n) => id(n + 100)) }, { client, loadDirectory: directory })
  expect(client.calls).toHaveLength(2)
  expect(client.calls.map((call) => call.in[0][1].length)).toEqual([100, 1])
  const hidden = clientFor({ marketing_campaign_enquiries: [{ ...links[0], campaign_id: campaign }] })
  expect((await loadCampaignOverviewEnquiries({ organisationId: org, campaignIds: [campaign] }, { client: hidden, loadDirectory: directory })).entries).toEqual([])
  expect(hidden.calls.filter((call) => ['tasks', 'contacts', 'lead_activities'].includes(call.table))).toHaveLength(0)
})
