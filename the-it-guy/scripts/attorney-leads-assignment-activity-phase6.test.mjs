import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  addAttorneyLeadActivity,
  assignAttorneyLead,
  listAttorneyLeadAssignees,
  setAttorneyLeadFollowUp,
} from '../src/services/attorneyLeadsService.js'

const root = new URL('../', import.meta.url)
const page = await readFile(new URL('src/pages/AttorneyLeadsPage.jsx', root), 'utf8')
const service = await readFile(new URL('src/services/attorneyLeadsService.js', root), 'utf8')
const migration = await readFile(
  new URL('../../supabase/migrations/202607160005_attorney_leads_assignment_activity_phase6.sql', import.meta.url),
  'utf8',
)

async function test(name, fn) {
  try {
    await fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

await test('assignment commands require Lead-scoped assign authority', () => {
  assert.match(migration, /bridge_list_attorney_lead_assignees[\s\S]*bridge_attorney_lead_can_access\([\s\S]*'assign'/)
  assert.match(migration, /bridge_assign_attorney_lead[\s\S]*bridge_attorney_lead_can_access\([\s\S]*'assign'/)
  assert.match(migration, /lead_domain = 'attorney'/g)
})

await test('assignees must be active members of the same Attorney organisation', () => {
  assert.match(migration, /member\.organisation_id = p_organisation_id/)
  assert.match(migration, /membership_status, member\.status[\s\S]*\('active', 'accepted'\)/)
  assert.match(migration, /firm\.organisation_id = p_organisation_id/)
  assert.match(migration, /firm_member\.status = 'active'/)
  assert.match(migration, /Assignee must be an active member of this Attorney firm/)
})

await test('reassignment is atomic, reasoned, and append-only audited', () => {
  assert.match(migration, /for update/)
  assert.match(migration, /A reason is required to reassign or unassign an Attorney Lead/)
  assert.match(migration, /insert into public\.lead_assignment_history/)
  assert.match(migration, /previous_agent_id,[\s\S]*new_agent_id,[\s\S]*reason,[\s\S]*assignment_source,[\s\S]*assigned_by/)
  assert.match(migration, /'attorney_crm_manual'/)
  assert.doesNotMatch(migration, /update public\.lead_assignment_history|delete from public\.lead_assignment_history/)
})

await test('activity command is bounded and records contact timestamps', () => {
  assert.match(migration, /v_activity_type not in \('note', 'call', 'email', 'meeting', 'whatsapp'\)/)
  assert.match(migration, /must not exceed 5000 characters/)
  assert.match(migration, /insert into public\.lead_activities/)
  assert.match(migration, /first_contacted_at = coalesce\(first_contacted_at, v_now\)/)
  assert.match(migration, /last_contacted_at = v_now/)
  assert.match(migration, /stage = case when stage = 'new' then 'contacted' else stage end/)
})

await test('follow-up command protects closed Leads and audits changes', () => {
  assert.match(migration, /v_lead\.stage in \('won', 'lost'\)/)
  assert.match(migration, /follow-up must be in the future/)
  assert.match(migration, /next_follow_up_at = p_next_follow_up_at/)
  assert.match(migration, /'Follow-Up Changed'/)
  assert.match(migration, /'Cleared'[\s\S]*'Scheduled'/)
})

await test('all Phase 6 commands are authenticated-only', () => {
  for (const signature of [
    'bridge_list_attorney_lead_assignees\\(uuid, uuid\\)',
    'bridge_assign_attorney_lead\\(uuid, uuid, uuid, text\\)',
    'bridge_add_attorney_lead_activity\\(uuid, uuid, text, text, text\\)',
    'bridge_set_attorney_lead_follow_up\\(uuid, uuid, timestamptz, text\\)',
  ]) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${signature} from public, anon`))
    assert.match(migration, new RegExp(`grant execute on function public\\.${signature} to authenticated`))
  }
})

await test('service layer uses only the atomic Phase 6 RPC boundary', () => {
  for (const command of [
    'bridge_list_attorney_lead_assignees',
    'bridge_assign_attorney_lead',
    'bridge_add_attorney_lead_activity',
    'bridge_set_attorney_lead_follow_up',
  ]) {
    assert.match(service, new RegExp(`rpc\\('${command}'`))
  }
  assert.doesNotMatch(service, /from\('lead_assignment_history'\)[\s\S]*\.(?:insert|update|delete)\(/)
})

await test('Lead detail exposes assignment, authored activity, and follow-up controls', () => {
  for (const label of ['Lead assignment', 'Assigned team member', 'Reassignment reason', 'Next follow-up', 'Record activity', 'Activity notes']) {
    assert.match(page, new RegExp(label))
  }
  assert.match(page, /canAssign=\{canAssignLeads\}/)
  assert.match(page, /canEdit=\{canEditLeads\}/)
  assert.match(page, /onAssignmentSave=\{handleAssignmentSave\}/)
  assert.match(page, /onActivitySave=\{handleActivitySave\}/)
  assert.match(page, /onFollowUpSave=\{handleFollowUpSave\}/)
})

await test('assignment service normalizes the server candidate list', async () => {
  const calls = []
  const client = {
    rpc: async (name, args) => {
      calls.push({ name, args })
      return {
        data: [{ user_id: 'user-1', display_name: 'A. Attorney', email: 'A@example.com', member_role: 'transfer_attorney', branch_id: 'branch-1' }],
        error: null,
      }
    },
  }
  const rows = await listAttorneyLeadAssignees({ organisationId: 'org-1', leadId: 'lead-1', client })
  assert.equal(calls[0].name, 'bridge_list_attorney_lead_assignees')
  assert.deepEqual(rows[0], {
    userId: 'user-1',
    name: 'A. Attorney',
    email: 'A@example.com',
    role: 'transfer_attorney',
    branchId: 'branch-1',
  })
})

await test('client commands validate and pass bounded canonical payloads', async () => {
  const calls = []
  const client = {
    rpc: async (name, args) => {
      calls.push({ name, args })
      return { data: { success: true }, error: null }
    },
  }
  await assignAttorneyLead({ organisationId: 'org-1', leadId: 'lead-1', assignedUserId: 'user-1', reason: 'Workload balance', client })
  await addAttorneyLeadActivity({ organisationId: 'org-1', leadId: 'lead-1', activityType: 'CALL', note: 'Spoke to client.', client })
  await setAttorneyLeadFollowUp({ organisationId: 'org-1', leadId: 'lead-1', nextFollowUpAt: '2030-01-01T10:00:00+02:00', client })
  assert.deepEqual(calls.map((call) => call.name), [
    'bridge_assign_attorney_lead',
    'bridge_add_attorney_lead_activity',
    'bridge_set_attorney_lead_follow_up',
  ])
  assert.equal(calls[1].args.p_activity_type, 'call')
  assert.equal(calls[2].args.p_next_follow_up_at, '2030-01-01T08:00:00.000Z')
  await assert.rejects(
    addAttorneyLeadActivity({ organisationId: 'org-1', leadId: 'lead-1', activityType: 'delete', note: 'Invalid', client }),
    /valid activity type/,
  )
})

await test('Phase 6 does not touch Incoming Matters or conversion contracts', () => {
  assert.doesNotMatch(migration, /transaction_attorney_assignments|attorney_instruction_responses|insert into public\.transactions/i)
  assert.doesNotMatch(migration, /createTransactionFromLeadOverride|convert.*matter|incomingMatter/i)
})

console.log('attorney Leads assignment and activity Phase 6 tests passed')
