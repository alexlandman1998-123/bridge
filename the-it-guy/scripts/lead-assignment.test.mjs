import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createServer } from 'vite'

const migrationSql = await fs.readFile(new URL('../../supabase/migrations/202606030006_lead_assignment_routing.sql', import.meta.url), 'utf8')
for (const field of [
  'assigned_queue_id text',
  'assigned_at timestamptz',
  'first_contacted_at timestamptz',
  'sla_due_at timestamptz',
  'ownership_status text not null default',
]) {
  assert.match(migrationSql, new RegExp(field), `migration should add ${field}`)
}
assert.match(migrationSql, /create table if not exists public\.lead_assignment_history/i)
for (const field of [
  'assignment_id uuid primary key',
  'organisation_id uuid not null references public.organisations',
  'lead_id uuid not null references public.leads',
  'previous_agent_id uuid',
  'new_agent_id uuid',
  'previous_queue_id text',
  'new_queue_id text',
  'reason text',
  'assigned_by uuid references auth.users',
]) {
  assert.match(migrationSql, new RegExp(field.replaceAll('(', '\\(').replaceAll(')', '\\)')), `history migration should include ${field}`)
}
for (const status of ['awaiting_assignment', 'assigned', 'contacted', 'working', 'dormant', 'escalated']) {
  assert.match(migrationSql, new RegExp(`'${status}'`), `ownership status should include ${status}`)
}
for (const indexName of [
  'leads_assignment_owner_idx',
  'leads_assignment_sla_idx',
  'leads_assigned_at_idx',
  'lead_assignment_history_org_idx',
  'lead_assignment_history_lead_idx',
]) {
  assert.match(migrationSql, new RegExp(indexName), `migration should include ${indexName}`)
}
assert.match(migrationSql, /lead_assignment_history_select_member/)
assert.match(migrationSql, /bridge_is_active_member\(organisation_id\)/)

const serviceSource = await fs.readFile(new URL('../src/services/leadAssignmentService.js', import.meta.url), 'utf8')
for (const method of [
  'assignLead',
  'assignLeadToAgent',
  'assignLeadToQueue',
  'reassignLead',
  'autoAssignLead',
  'evaluateAssignmentRules',
  'recordAssignmentHistory',
  'markLeadFirstContacted',
  'identifyEscalatedLeads',
  'flagEscalatedLeads',
]) {
  assert.match(serviceSource, new RegExp(`export .*${method}`), `service should export ${method}`)
}
assert.match(serviceSource, /Assigned to listing agent/)
assert.match(serviceSource, /Assigned by branch rule/)
assert.match(serviceSource, /unassigned queue/)
assert.match(serviceSource, /createAgencyCrmLeadActivity/)
assert.match(serviceSource, /Lead reassigned/)
assert.match(serviceSource, /Lead overdue/)

const ingestionSource = await fs.readFile(new URL('../src/services/leadIngestionService.js', import.meta.url), 'utf8')
assert.match(ingestionSource, /autoAssignLead/)
assert.match(ingestionSource, /assignment/)

const workspaceServiceSource = await fs.readFile(new URL('../src/services/agentLeadWorkspaceService.js', import.meta.url), 'utf8')
assert.match(workspaceServiceSource, /getLeadSlaStatus/)
assert.match(workspaceServiceSource, /assignmentMetrics/)
assert.match(workspaceServiceSource, /assignmentHistory/)

const leadsPageSource = await fs.readFile(new URL('../src/pages/AgentLeadsPage.jsx', import.meta.url), 'utf8')
assert.match(leadsPageSource, /Ownership/)
assert.match(leadsPageSource, /Assign Queue/)
assert.match(leadsPageSource, /Auto-Assign/)
assert.match(leadsPageSource, /Mark First Contacted/)
assert.match(leadsPageSource, /Unassigned Leads/)
assert.match(leadsPageSource, /Overdue Leads/)

const enquiriesPageSource = await fs.readFile(new URL('../src/pages/AgentEnquiriesPage.jsx', import.meta.url), 'utf8')
assert.match(enquiriesPageSource, /Assignment Review/)
assert.match(enquiriesPageSource, /Assign Agent/)
assert.match(enquiriesPageSource, /Assign Queue/)
assert.match(enquiriesPageSource, /Auto-Assign/)

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const { __leadAssignmentServiceTestUtils } = await server.ssrLoadModule('/src/services/leadAssignmentService.js')
  const {
    calculateSlaDueAt,
    canManageLeadAssignment,
    evaluateAssignmentRuleContext,
    getLeadSlaStatus,
    isLeadEscalationDue,
    normalizeAssignmentHistory,
    normalizeLeadAssignment,
    normalizeQueueId,
    queueForLead,
  } = __leadAssignmentServiceTestUtils

  const lead = normalizeLeadAssignment({
    lead_id: '11111111-1111-4111-8111-111111111111',
    organisation_id: '22222222-2222-4222-8222-222222222222',
    branch_id: '33333333-3333-4333-8333-333333333333',
    listing_id: '44444444-4444-4444-8444-444444444444',
  })
  assert.equal(lead.ownershipStatus, 'awaiting_assignment')
  assert.equal(lead.branchId, '33333333-3333-4333-8333-333333333333')

  const listingAgentDecision = evaluateAssignmentRuleContext({
    lead,
    listing: { id: lead.listingId, assigned_agent_id: '55555555-5555-4555-8555-555555555555' },
  })
  assert.equal(listingAgentDecision.type, 'agent')
  assert.equal(listingAgentDecision.agentId, '55555555-5555-4555-8555-555555555555')
  assert.equal(listingAgentDecision.rule, 'listing_agent')

  const listingQueueDecision = evaluateAssignmentRuleContext({
    lead,
    listing: { id: lead.listingId, listing_category: 'private_rental' },
  })
  assert.equal(listingQueueDecision.type, 'queue')
  assert.equal(listingQueueDecision.queueId, 'rentals')
  assert.equal(listingQueueDecision.rule, 'listing_team_queue')

  const branchDecision = evaluateAssignmentRuleContext({
    lead: { ...lead, listingId: '' },
    branchAgent: { user_id: '66666666-6666-4666-8666-666666666666' },
  })
  assert.equal(branchDecision.type, 'agent')
  assert.equal(branchDecision.rule, 'branch_agent')

  const unassignedDecision = evaluateAssignmentRuleContext({ lead: { ...lead, listingId: '', branchId: '' } })
  assert.equal(unassignedDecision.type, 'queue')
  assert.equal(unassignedDecision.queueId, 'unassigned')
  assert.equal(unassignedDecision.rule, 'unassigned_queue')

  assert.equal(queueForLead({ branchId: 'branch-one' }, { listing_category: 'commercial_lease' }), 'commercial')
  assert.equal(queueForLead({ branchId: 'branch-one' }, { listing_category: 'development_unit' }), 'developments')
  assert.equal(queueForLead({ branchId: 'branch-one' }, null), 'sales')
  assert.equal(normalizeQueueId('Commercial'), 'commercial')
  assert.equal(normalizeQueueId('mystery'), 'unassigned')

  const assignedAt = '2026-06-03T08:00:00.000Z'
  assert.equal(calculateSlaDueAt(assignedAt, 4), '2026-06-03T12:00:00.000Z')
  assert.equal(getLeadSlaStatus({ assigned_at: assignedAt, sla_due_at: '2026-06-03T12:00:00.000Z' }, new Date('2026-06-03T09:00:00.000Z')), 'on_track')
  assert.equal(getLeadSlaStatus({ assigned_at: assignedAt, sla_due_at: '2026-06-03T09:30:00.000Z' }, new Date('2026-06-03T09:00:00.000Z')), 'due_soon')
  assert.equal(getLeadSlaStatus({ assigned_at: assignedAt, sla_due_at: '2026-06-03T08:30:00.000Z' }, new Date('2026-06-03T09:00:00.000Z')), 'overdue')
  assert.equal(getLeadSlaStatus({ first_contacted_at: '2026-06-03T08:20:00.000Z' }, new Date('2026-06-03T09:00:00.000Z')), 'contacted')
  assert.equal(isLeadEscalationDue({ assigned_at: assignedAt, sla_due_at: '2026-06-03T08:30:00.000Z' }, new Date('2026-06-03T09:00:00.000Z')), true)

  assert.equal(canManageLeadAssignment({ role: 'principal' }, lead), true)
  assert.equal(canManageLeadAssignment({ id: 'agent-one' }, { assignedAgentId: 'agent-one' }), true)
  assert.equal(canManageLeadAssignment({ id: 'agent-two', role: 'agent' }, { assignedAgentId: 'agent-one' }), false)

  const history = normalizeAssignmentHistory({
    assignment_id: '77777777-7777-4777-8777-777777777777',
    lead_id: lead.leadId,
    previous_queue_id: 'unassigned',
    new_agent_id: '88888888-8888-4888-8888-888888888888',
    reason: 'Assigned by branch rule',
    assignment_source: 'branch_agent',
  })
  assert.equal(history.assignmentSource, 'branch_agent')
  assert.equal(history.previousQueueId, 'unassigned')
  assert.equal(history.newAgentId, '88888888-8888-4888-8888-888888888888')
} finally {
  await server.close()
}

console.log('lead assignment tests passed')
