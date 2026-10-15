import { beforeEach, expect, it, vi } from 'vitest'
const fixture = vi.hoisted(() => ({ operations: [], failLead: false, send: vi.fn(), from: vi.fn() }))
vi.mock('../supabaseClient', () => ({ isSupabaseConfigured: true, supabase: { from: fixture.from }, invokeEdgeFunction: fixture.send }))
vi.mock('../agencyPipelineService', () => ({
  reconcileAgencyPipelineSnapshot: (_org, value) => value,
  getAgencyPipelineSnapshot: vi.fn(), deleteLeadActivity: vi.fn(), deleteAgencyLead: vi.fn(), deleteLeadTask: vi.fn(), updateAgencyContact: vi.fn(), updateLeadActivity: vi.fn(), updateAgencyLead: vi.fn(), updateLeadTask: vi.fn(),
}))
vi.mock('../agencyCrmUpdateBus', () => ({ emitAgencyCrmUpdated: vi.fn() }))
import { createAgencyCrmLeadRecord, updateAgencyCrmLeadRecord, ensureAgencyCrmLeadRecordPersisted, __agencyCrmRepositoryTestUtils } from '../agencyCrmRepository'

const organisationId = '11111111-1111-4111-8111-111111111111'
const agentId = '33333333-3333-4333-8333-333333333333'
const actor = { id: '44444444-4444-4444-8444-444444444444', email: 'manager@example.com', name: 'Manager' }
function payload(agent = { id: agentId, email: 'agent@example.com', name: 'Casey Agent' }) {
  return { contact: { firstName: 'Taylor', lastName: 'Buyer', phone: '0820000000' }, assignedAgent: agent, lead: { leadCategory: 'Buyer', leadSource: 'Walk-in' } }
}
beforeEach(() => {
  fixture.operations = []
  fixture.failLead = false
  fixture.send.mockReset().mockImplementation(async (_name, options) => {
    fixture.operations.push({ type: 'email', payload: options.body })
    return { data: { ok: true, sent: true }, error: null }
  })
  fixture.from.mockReset().mockImplementation((table) => {
    let row
    const query = {
      upsert: (value) => { row = value; return query }, select: () => query, eq: () => query, in: () => query, limit: () => query,
      maybeSingle: async () => ({ data: { user_id: agentId, email: 'looked-up-agent@example.com', first_name: 'Casey', last_name: 'Agent' }, error: null }),
      single: async () => {
        fixture.operations.push({ type: table })
        return { data: row, error: table === 'leads' && fixture.failLead ? new Error('Lead save failed') : null }
      },
    }
    return query
  })
})
it('alerts the assignee only after verifying both saved records', async () => {
  const lead = await createAgencyCrmLeadRecord(organisationId, payload(), { actor })
  await vi.waitFor(() => expect(fixture.send).toHaveBeenCalledTimes(1))
  expect(fixture.operations.map((op) => op.type)).toEqual(['contacts', 'leads', 'email'])
  expect(fixture.operations[2].payload).toMatchObject({ to: 'agent@example.com', leadId: lead.leadId, leadName: 'Taylor Buyer', leadPhone: '0820000000' })
})
it('does not email for a failed lead save', async () => {
  fixture.failLead = true
  await expect(createAgencyCrmLeadRecord(organisationId, payload(), { actor })).rejects.toThrow(/Lead save failed/)
  expect(fixture.send).not.toHaveBeenCalled()
})
it('leaves a saved lead successful when email delivery fails', async () => {
  fixture.send.mockResolvedValue({ data: null, error: new Error('Provider unavailable') })
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  try {
    const lead = await createAgencyCrmLeadRecord(organisationId, payload(), { actor })
    expect(lead.leadId).toBeTruthy()
    await vi.waitFor(() => expect(warn).toHaveBeenCalled())
  } finally { warn.mockRestore() }
})
it('defers notification during ingestion and persistence repairs', async () => {
  await createAgencyCrmLeadRecord(organisationId, payload(), { actor, notifyAgent: false })
  expect(fixture.send).not.toHaveBeenCalled()
})
it('resolves an assignee missing an email instead of using the creating manager email', async () => {
  await createAgencyCrmLeadRecord(organisationId, payload({ id: agentId }), { actor })
  await vi.waitFor(() => expect(fixture.send).toHaveBeenCalledTimes(1))
  expect(fixture.send.mock.calls[0][1].body.to).toBe('looked-up-agent@example.com')
})

it('updates seller summaries without reading the lead for an unchanged assignment', async () => {
  const leadId = '55555555-5555-4555-8555-555555555555'
  const result = Promise.resolve({ data: [{ lead_id: leadId }], error: null })
  const query = {
    update: vi.fn(() => query), eq: vi.fn(() => query), select: vi.fn(() => query),
    then: (resolve, reject) => result.then(resolve, reject),
  }
  fixture.from.mockReturnValue(query)
  await updateAgencyCrmLeadRecord(organisationId, leadId, { sellerPropertyAddress: '1 Example Road' })
  expect(fixture.from).toHaveBeenCalledTimes(1)
  expect(fixture.from).toHaveBeenCalledWith('leads')
  expect(query.update).toHaveBeenCalledWith(expect.objectContaining({ seller_property_address: '1 Example Road' }))
  expect(fixture.send).not.toHaveBeenCalled()
})

it('routes rental assignment notifications to the rental journey with its role',()=>{
  const payload=__agencyCrmRepositoryTestUtils.buildLeadAssignmentEmailBase(organisationId,{lead_id:'rental-tenant',lead_category:'buyer',raw_enquiry_payload:{rental_crm:{classification:'rental',role:'tenant'}}})
  expect(payload.leadCategory).toBe('tenant')
  expect(payload.actionLink).toContain('/agent/rentals/pipeline/leads/rental-tenant')
})
it('does not discard rental classification on creation or run a rental through buyer persistence repair',async()=>{
  let leadAttempts=0
  fixture.from.mockImplementation(table=>{
    let saved
    const query={upsert:value=>{saved=value;return query},select:()=>query,single:async()=>table==='contacts'?{data:{contact_id:saved.contact_id,email:saved.email,phone:saved.phone},error:null}:(leadAttempts++,{data:null,error:{code:'PGRST204',message:'Missing raw_enquiry_payload column'}})}
    return query
  })
  const errorLog=vi.spyOn(console,'error').mockImplementation(()=>{})
  try {
    const input=payload()
    input.lead.rawEnquiryPayload={classification:'rental',role:'tenant'}
    await expect(createAgencyCrmLeadRecord(organisationId,input,{actor})).rejects.toThrow('No rental classification was discarded')
    expect(leadAttempts).toBe(1)
    fixture.from.mockClear()
    await expect(ensureAgencyCrmLeadRecordPersisted(organisationId,{rawEnquiryPayload:{rentalCrm:{classification:'rental'}}})).rejects.toThrow('Open this rental lead in Rentals')
    expect(fixture.from).not.toHaveBeenCalled()
    expect(fixture.send).not.toHaveBeenCalled()
  } finally {errorLog.mockRestore()}
})
it('rejects a stale rental save and does not retry without its classification when schema fields are missing',async()=>{
  let result={data:[],error:null}
  const query={update:vi.fn(()=>query),eq:vi.fn(()=>query),select:vi.fn(()=>query),then:(resolve,reject)=>Promise.resolve(result).then(resolve,reject)}
  fixture.from.mockReturnValue(query)
  const errorLog=vi.spyOn(console,'error').mockImplementation(()=>{})
  const patch={rawEnquiryPayload:{classification:'rental',role:'tenant',stage:'contacted'}}
  try {
    await expect(updateAgencyCrmLeadRecord(organisationId,'55555555-5555-4555-8555-555555555555',patch,{expectedUpdatedAt:'saved-version'})).rejects.toThrow('changed while you were saving')
    expect(query.eq).toHaveBeenCalledWith('updated_at','saved-version')
    result={data:null,error:{code:'PGRST204',message:'Missing raw_enquiry_payload column'}}
    query.update.mockClear()
    await expect(updateAgencyCrmLeadRecord(organisationId,'55555555-5555-4555-8555-555555555555',patch)).rejects.toThrow('No rental metadata or evidence was discarded')
    expect(query.update).toHaveBeenCalledTimes(1)
    expect(fixture.send).not.toHaveBeenCalled()
  } finally {errorLog.mockRestore()}
})
