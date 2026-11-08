import { beforeEach, expect, it, vi } from 'vitest'
const fixture = vi.hoisted(() => ({ from: vi.fn(), insert: vi.fn(), eq: vi.fn(), is: vi.fn(), result: null, recovery: null, row: null }))
vi.mock('../supabaseClient', () => ({ isSupabaseConfigured: true, supabase: { from: fixture.from }, invokeEdgeFunction: vi.fn() }))
vi.mock('../agencyPipelineService', () => ({ reconcileAgencyPipelineSnapshot: vi.fn(), getAgencyPipelineSnapshot: vi.fn(), deleteLeadActivity: vi.fn(), deleteAgencyLead: vi.fn(), deleteLeadTask: vi.fn(), updateAgencyContact: vi.fn(), updateLeadActivity: vi.fn(), updateAgencyLead: vi.fn(), updateLeadTask: vi.fn() }))
import { createAgencyTask } from '../agencyCrmRepository.js'

const organisationId = '11111111-1111-4111-8111-111111111111'
const actor = { id: '22222222-2222-4222-8222-222222222222' }
const payload = { taskId: '33333333-3333-4333-8333-333333333333', title: 'Prepare meeting notes', dueDate: '2026-10-22', priority: 'High', description: 'Bring the floor plans.' }
beforeEach(() => {
  vi.clearAllMocks()
  fixture.result = null; fixture.recovery = null; fixture.row = null
  let reading = false
  const query = {
    insert: value => { reading = false; fixture.row = value; fixture.insert(value); return query },
    select: () => query,
    eq: (...args) => { reading = true; fixture.eq(...args); return query },
    is: (...args) => { fixture.is(...args); return query },
    single: async () => reading ? fixture.recovery : fixture.result || { data: fixture.row, error: null },
  }
  fixture.from.mockReturnValue(query)
})

it('persists a task owned by the signed-in actor without a lead or transaction', async () => {
  const task = await createAgencyTask(organisationId, payload, { actor })
  expect(fixture.from).toHaveBeenCalledWith('tasks')
  expect(fixture.insert).toHaveBeenCalledWith(expect.objectContaining({ organisation_id: organisationId, assigned_agent_id: actor.id, created_by: actor.id, lead_id: null, transaction_id: null, title: payload.title, due_date: payload.dueDate, priority: 'High', status: 'Pending' }))
  expect(task).toMatchObject({ taskId: payload.taskId, title: payload.title, leadId: '', assignedAgentId: actor.id })
})

it.each([{ title: '' }, { dueDate: '2026-02-30' }, { priority: 'Urgent' }, { taskId: 'invalid' }])('rejects invalid task data before writing: %j', async change => {
  await expect(createAgencyTask(organisationId, { ...payload, ...change }, { actor })).rejects.toThrow()
  expect(fixture.insert).not.toHaveBeenCalled()
})

it('rechecks the same saved task on retry without overwriting or creating a duplicate', async () => {
  await createAgencyTask(organisationId, payload, { actor })
  fixture.result = { data: null, error: { code: '23505' } }
  fixture.recovery = { data: fixture.row, error: null }
  const task = await createAgencyTask(organisationId, payload, { actor })
  expect(task.taskId).toBe(payload.taskId)
  expect(fixture.eq).toHaveBeenCalledWith('organisation_id', organisationId)
  expect(fixture.eq).toHaveBeenCalledWith('assigned_agent_id', actor.id)
  expect(fixture.is).toHaveBeenCalledWith('lead_id', null)
})

it('does not report success on an unconfirmed save or mismatching record', async () => {
  fixture.result = { data: null, error: new Error('Connection lost') }
  await expect(createAgencyTask(organisationId, payload, { actor })).rejects.toThrow('Connection lost')
  fixture.result = { data: { title: 'Another task' }, error: null }
  await expect(createAgencyTask(organisationId, payload, { actor })).rejects.toThrow(/could not be confirmed/)
})
