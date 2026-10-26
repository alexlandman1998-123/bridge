import { expect, it } from 'vitest'
import { buildCampaignAttention } from '../campaignAttentionModel'

const now = new Date('2026-10-25T08:00:00Z')
const campaign = { id: 'c1', name: 'Seller valuations', status: 'active', revision: 2 }
const entry = { id: 'enquiry', campaign_id: 'c1', lead_id: 'lead', name: 'Jane Doe', lead: { status: 'New Lead' }, ownerId: 'agent', ownerName: 'Sarah Jacobs', responded_at: '2026-10-24T08:00:00Z', awaitingContact: true, nextTask: { title: 'Call Jane', due_date: '2026-10-24' } }
const workspace = (changes = {}) => ({ campaigns: [campaign], activities: [], channels: { email: { data: [] }, whatsapp: { data: [] } }, ...changes })
const model = (data, enquiries = {}, options = {}) => buildCampaignAttention(data, { entries: [], ...enquiries }, { now, ...options })
const linked = (channel, record, extra = {}) => workspace({ activities: [{ campaign_id: 'c1', channel, [`${channel}_campaign_id`]: record.id }], channels: { [channel]: { data: [record] } }, ...extra })

it('puts overdue enquiries first and routes directly to the selected responder', () => {
  const result = model(linked('email', { id: 'email', status: 'draft' }), { entries: [entry] })
  expect(result.items.map((item) => item.category)).toEqual(['enquiries', 'drafts'])
  expect(result.items[0]).toMatchObject({ label: 'Overdue follow-up', owner: 'Sarah Jacobs', detail: 'Call Jane · No contact logged since response' })
  expect(new URL(result.items[0].href, 'http://local').searchParams.get('enquiry')).toBe('lead')
})
it('shows unassigned, unanswered, due-today and missing-next-step work without double counting a shared CRM task', () => {
  const other = { ...campaign, id: 'c2', name: 'Spring sellers' }
  const entries = [entry, { ...entry, id: 'e2', campaign_id: 'c2' }, { ...entry, lead_id: 'unassigned', ownerId: null, ownerName: 'Unassigned', nextTask: null }, { ...entry, lead_id: 'today', awaitingContact: false, nextTask: { title: 'Call', due_date: '2026-10-25' } }, { ...entry, lead_id: 'no-task', awaitingContact: false, nextTask: null }]
  const result = model(workspace({ campaigns: [campaign, other] }), { entries })
  expect(result.items).toHaveLength(4)
  expect(result.items[0].campaignNames).toEqual(['Seller valuations', 'Spring sellers'])
  expect(result.items.find((row) => row.id === 'enquiry:unassigned').href).toBe('/pipeline/leads/unassigned')
  expect(result.items.find((row) => row.id === 'enquiry:today').label).toBe('Follow-up due today')
  expect(result.items.find((row) => row.id === 'enquiry:no-task').label).toBe('Set the next step')
})
it('does not count closed, hidden, unrelated or already handled people as new work', () => {
  const entries = [{ ...entry, lead: { status: 'Lost' } }, { ...entry, lead: { stage: 'Won' } }, { ...entry, campaign_id: 'not-visible' }, { ...entry, awaitingContact: false, nextTask: { due_date: '2026-10-28' } }]
  expect(model(workspace(), { entries }).items).toEqual([])
  expect(model(workspace(), { entries: [] }).items).toEqual([])
})
it('does not infer unanswered people or missing tasks when CRM sources are unavailable', () => {
  const result = model(workspace(), { entries: [{ ...entry, nextTask: null }], tasksAvailable: false, activitiesAvailable: false, warnings: ['CRM unavailable'] })
  expect(result.items).toEqual([])
  expect(result.enquiriesAvailable).toBe(false)
  expect(result.warnings).toEqual(['CRM unavailable'])
})
it('uses the SAST date boundary for overdue tasks', () => {
  const result = model(workspace(), { entries: [{ ...entry, nextTask: { due_date: '2026-10-25' } }] }, { now: new Date('2026-10-25T22:30:00Z') })
  expect(result.items[0].label).toBe('Overdue follow-up')
})
it('finds linked drafts once, excludes completed-campaign drafts and ignores unlinked one-offs', () => {
  const data = linked('email', { id: 'email', status: 'draft', scheduled_for: '2026-10-26T08:00:00Z' })
  data.activities.push({ ...data.activities[0] })
  data.channels.email.data.push({ id: 'standalone', status: 'draft' })
  expect(model(data).items).toHaveLength(1)
  expect(model(data).items[0]).toMatchObject({ category: 'drafts', href: '/marketing?section=email&view=create&id=email' })
  expect(model({ ...data, campaigns: [{ ...campaign, status: 'completed' }] }).items).toEqual([])
})
it('separates failed sends from partially failed recipients and never creates an automatic retry', () => {
  const failed = model(linked('email', { id: 'send', status: 'failed' })).items[0]
  expect(failed).toMatchObject({ category: 'delivery', label: 'Send failed', action: 'Review send', href: '/marketing?section=email&view=detail&id=send' })
  const partial = model(linked('whatsapp', { id: 'wa', status: 'sent', failed: 2, delivered: 10 })).items[0]
  expect(partial).toMatchObject({ label: 'Delivery issues', detail: '2 failed recipients' })
})
it('shows only actual schedules in the next seven days and distinguishes planned campaign starts', () => {
  const data = linked('whatsapp', { id: 'wa', status: 'scheduled', scheduled_at: '2026-10-25T22:30:00Z' }, { campaigns: [{ ...campaign, start_date: '2026-10-27' }] })
  const items = model(data).items
  expect(items).toHaveLength(2)
  expect(items[0]).toMatchObject({ label: 'WhatsApp scheduled', date: '2026-10-26', timestamp: '2026-10-25T22:30:00Z' })
  expect(items[1].label).toBe('Campaign plan starts')
  for (const row of [{ status: 'draft', scheduled_at: '2026-10-26T10:00:00Z' }, { status: 'sent', sent_at: '2026-10-26T10:00:00Z' }, { status: 'scheduled', created_at: '2026-10-26T10:00:00Z' }, { status: 'scheduled', scheduled_at: '2026-11-03T10:00:00Z' }]) {
    expect(model(linked('whatsapp', { id: 'wa', ...row })).items.some((item) => item.category === 'upcoming')).toBe(false)
  }
})
it('flags an overdue scheduled send for review after a grace period without claiming it failed', () => {
  expect(model(linked('email', { id: 'late', status: 'queued', scheduled_for: '2026-10-25T07:00:00Z' })).items[0]).toMatchObject({ category: 'delivery', label: 'Schedule needs review' })
  expect(model(linked('email', { id: 'waiting', status: 'queued', scheduled_for: '2026-10-25T07:55:00Z' })).items[0].category).toBe('upcoming')
})
it('keeps campaign drafts and changed playbooks actionable, ignoring completed plans', () => {
  const data = workspace({ campaigns: [{ ...campaign, status: 'draft' }, { ...campaign, id: 'c2', playbook: { sourceRevision: 1 } }, { ...campaign, id: 'c3', status: 'completed', playbook: { sourceRevision: 1 } }] })
  expect(model(data).items.map((row) => row.label)).toEqual(['Campaign draft', 'Playbook needs review'])
})
it('keeps the detail queue scoped to its campaign and reports channel-source failures', () => {
  const data = linked('email', { id: 'draft', status: 'draft' }, { campaigns: [campaign, { ...campaign, id: 'c2' }] })
  expect(model(data, { entries: [entry] }, { campaignId: 'c2' }).items).toEqual([])
  data.channels.email.error = 'Cannot load'
  const result = model(data)
  expect(result.items).toEqual([])
  expect(result.warnings).toContain('Email activity is unavailable.')
})
