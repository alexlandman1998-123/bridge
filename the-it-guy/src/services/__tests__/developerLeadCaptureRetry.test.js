import { beforeEach, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ lead: null, privateRow: null, interests: [], leadWrites: 0, privateFailure: false, calls: [] }))
vi.mock('../../lib/supabaseClient.js', () => ({ isSupabaseConfigured: true, supabase: { from(table) {
  const operation = { table, kind: 'read', filters: {}, payload: null, options: {} }
  const execute = single => {
    state.calls.push({ ...operation })
    if (operation.kind === 'read') {
      const data = table === 'developer_leads'
        ? state.lead && Object.entries(operation.filters).every(([key, value]) => state.lead[key] === value) ? state.lead : null
        : table === 'developer_lead_development_interests' ? state.interests : []
      return { data, error: null }
    }
    if (table === 'developer_leads') {
      if (state.lead && operation.options.ignoreDuplicates) return { data: null, error: null }
      state.lead = { ...operation.payload }
      state.leadWrites += 1
      return { data: state.lead, error: null }
    }
    if (table === 'developer_lead_private_details') {
      if (state.privateFailure) { state.privateFailure = false; return { data: null, error: { message: 'Private details failed' } } }
      state.privateRow = { ...operation.payload }
      return { data: state.privateRow, error: null }
    }
    if (table === 'developer_lead_development_interests') {
      state.interests.push(...operation.payload)
      return { data: state.interests, error: null }
    }
    return { data: single ? {} : [], error: null }
  }
  const query = {
    select: () => query, eq: (key, value) => { operation.filters[key] = value; return query }, in: () => query, order: () => query,
    upsert: (payload, options) => { Object.assign(operation, { kind: 'upsert', payload, options }); return query },
    insert: payload => { Object.assign(operation, { kind: 'insert', payload }); return query },
    maybeSingle: async () => execute(true), single: async () => execute(true),
    then: (resolve, reject) => Promise.resolve(execute(false)).then(resolve, reject),
  }
  return query
} } }))
import { createDeveloperFedLead } from '../developerLeadService.js'

const id = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`
const input = { developerOrgId: id(1), primaryDevelopmentId: id(2), developerLeadId: id(3), sourceLeadId: id(4), assignedAgentId: id(5), buyerFullName: 'Jane Buyer', buyerEmail: 'jane@example.test' }
beforeEach(() => Object.assign(state, { lead: null, privateRow: null, interests: [], leadWrites: 0, privateFailure: false, calls: [] }))

it('repairs a partial capture with the same developer ID and CRM link without resetting progressed status', async () => {
  state.privateFailure = true
  await expect(createDeveloperFedLead(input)).rejects.toMatchObject({ message: 'Private details failed' })
  state.lead.lead_status = 'qualified'
  const result = await createDeveloperFedLead(input)
  expect(state.leadWrites).toBe(1)
  expect(result.sourceLeadId).toBe(id(4))
  expect(result.developerLeadId).toBe(id(3))
  expect(result.buyerFullName).toBe('Jane Buyer')
  expect(result.leadStatus).toBe('qualified')
  expect(state.interests).toHaveLength(1)
  await createDeveloperFedLead(input)
  expect(state.leadWrites).toBe(1)
  expect(state.interests).toHaveLength(1)
})

it('rejects an existing capture ID linked to a different buyer before writing private details', async () => {
  state.lead = { developer_lead_id: id(3), developer_org_id: id(1), primary_development_id: id(2), source_lead_id: id(99) }
  await expect(createDeveloperFedLead(input)).rejects.toThrow('no longer matches')
  expect(state.privateRow).toBeNull()
})
