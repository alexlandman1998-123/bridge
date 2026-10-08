import { describe, expect, it } from 'vitest'
import { buildAgentNeedsAttention } from '../agentNeedsAttentionModel'
import { createRentalCrmLeadMetadata } from '../../../services/rentals/rentalCrmLeadModel'

const agent = { userId: 'agent', organisationId: 'org', email: 'agent@example.com' }
const now = new Date('2026-10-08T10:00:00Z')
const lead = (id, extra = {}) => ({ lead_id: id, organisation_id: 'org', assigned_agent_id: 'agent', stage: 'New Lead', status: 'New Lead', created_at: '2026-10-08T07:00:00Z', contact_id: 'client', ...extra })
const task = (id, extra = {}) => ({ task_id: id, organisation_id: 'org', lead_id: 'lead', status: 'Pending', title: 'Call client back', due_date: '2026-10-08', ...extra })
const records = { agent, now, contacts: [{ contact_id: 'client', organisation_id: 'org', first_name: 'Sam', last_name: 'Smith' }] }
const build = (extra) => buildAgentNeedsAttention({ ...records, ...extra })

describe('Agent next actions', () => {
  it('shows five most urgent persisted actions, oldest overdue first', () => {
    const tasks = Array.from({ length: 7 }, (_, i) => task(`task-${i}`, { due_date: `2026-10-0${i + 1}` }))
    const items = build({ leads: [lead('lead')], tasks })
    expect(items.map((item) => item.id)).toEqual(['task:task-0', 'task:task-1', 'task:task-2', 'task:task-3', 'task:task-4'])
    expect(items.every((item) => item.overdue)).toBe(true)
    expect(items[0]).toMatchObject({ name: 'Sam Smith', reason: 'Call client back', href: '/pipeline/leads/lead?tab=activity', actionLabel: 'Open follow-up' })
  })

  it('excludes completed, cancelled, undated, future and orphaned tasks and tasks for closed leads', () => {
    const items = build({ leads: [lead('lead', { first_contacted_at: '2026-10-07T08:00:00Z' }), lead('closed', { status: 'Closed lost' })], tasks: [
      task('complete', { status: 'Completed' }), task('cancelled', { status: 'Cancelled' }), task('undated', { due_date: null }), task('future', { due_date: '2026-10-09' }), task('invalid', { due_date: 'invalid' }), task('orphan', { lead_id: 'missing' }), task('closed', { lead_id: 'closed' }),
    ] })
    expect(items).toEqual([])
  })

  it('inherits unassigned task ownership from its lead, giving explicit task assignees precedence', () => {
    const items = build({ leads: [lead('lead', { first_contacted_at: '2026-10-07T08:00:00Z' }), lead('other', { assigned_agent_id: 'other' })], tasks: [task('inherit'), task('foreign', { assigned_agent_id: 'other' }), task('own', { lead_id: 'other', assigned_agent_id: 'agent' }), task('foreign-inherit', { lead_id: 'other' })] })
    expect(items.map((item) => item.id).sort()).toEqual(['task:inherit', 'task:own'])
  })

  it('keeps organisations separate and never matches a creator, client email or agent name', () => {
    expect(build({ leads: [lead('foreign-org', { organisation_id: 'other-org' }), lead('foreign-agent', { assigned_agent_id: 'other', assigned_agent_email: agent.email, created_by: 'agent' }), lead('unassigned', { assigned_agent_id: '', name: 'agent', email: agent.email, created_by: 'agent' })] })).toEqual([])
    const items = build({ leads: [lead('legacy', { assigned_agent_id: '', assigned_agent_email: agent.email })] })
    expect(items[0].id).toBe('lead:legacy')
  })

  it('removes leads once contacted by timestamp, ownership, stage, status or a recorded contact event', () => {
    const leads = [lead('timestamp', { first_contacted_at: '2026-10-08T09:00:00Z' }), lead('ownership', { ownership_status: 'contacted' }), lead('stage', { stage: 'Contacted' }), lead('status', { status: 'Contacted' }), lead('activity'), lead('converted', { converted_transaction_id: 'transaction' })]
    expect(build({ leads, activities: [{ organisation_id: 'org', lead_id: 'activity', activity_type: 'Lead contacted' }] })).toEqual([])
  })

  it('uses South African dates and only marks real expired deadlines red', () => {
    const items = build({ leads: [lead('lead', { sla_due_at: '2026-10-08T14:00:00+02:00' }), lead('no-deadline', { created_at: '2026-09-01T00:00:00Z' })], tasks: [task('today'), task('past-time', { due_date: '2026-10-08T09:00:00+02:00' })] })
    expect(items.find((item) => item.id === 'task:today').overdue).toBe(false)
    expect(items.find((item) => item.id === 'task:past-time').overdue).toBe(true)
    expect(items.find((item) => item.id === 'lead:lead').overdue).toBe(false)
    expect(items.find((item) => item.id === 'lead:no-deadline')).toMatchObject({ overdue: false, dueLabel: 'No due date', receivedLabel: 'Received 01 Sept 2026' })
    expect(build({ now: new Date('2026-10-07T23:30:00Z'), leads: [lead('lead', { first_contacted_at: '2026-10-07T08:00:00Z' })], tasks: [task('today')] })[0].dueLabel).toContain('Today')
  })

  it('uses saved rental workflow stages and links to the appropriate follow-up section', () => {
    const rental = (id, role, stage = 'new') => lead(id, { raw_enquiry_payload: createRentalCrmLeadMetadata({ organisationId: 'org', role, stage }) })
    const items = build({ leads: [rental('tenant', 'tenant'), rental('landlord', 'landlord', 'contacted')], tasks: [task('tenant-task', { lead_id: 'tenant' }), task('landlord-task', { lead_id: 'landlord' })] })
    expect(items.find((item) => item.id === 'task:tenant-task').href).toBe('/agent/rentals/pipeline/leads/tenant?tab=Activity')
    expect(items.find((item) => item.id === 'task:landlord-task').href).toBe('/agent/rentals/pipeline/leads/landlord?tab=Appointments')
    expect(items.find((item) => item.id === 'lead:tenant').href).toBe('/agent/rentals/pipeline/leads/tenant')
    expect(items.find((item) => item.id === 'lead:landlord')).toBeUndefined()
  })

  it('deduplicates task records and respects SLA urgency without inventing deadlines', () => {
    const items = build({ leads: [lead('lead', { sla_due_at: '2026-10-01T10:00:00Z' })], tasks: [task('same'), task('same')] })
    expect(items.map((item) => item.id)).toEqual(['lead:lead', 'task:same'])
    expect(items[0].overdue).toBe(true)
  })
})
