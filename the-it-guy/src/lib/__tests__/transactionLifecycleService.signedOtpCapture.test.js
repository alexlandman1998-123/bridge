import { beforeEach, expect, it, vi } from 'vitest'
const fixture = vi.hoisted(() => ({ existing: null, updates: [], payloads: [], prepare: vi.fn(async () => ({})), handoff: vi.fn(async () => ({})) }))
vi.mock('../supabaseClient', () => ({ isSupabaseConfigured: true, supabase: {
  from() {
    const query = { select() { return query }, eq() { return query }, or() { return query }, in() { return query }, order() { return query }, limit() { return query }, update(payload) { fixture.updates.push(payload); return query },
      maybeSingle: async () => ({ data: fixture.existing, error: null }), then: resolve => Promise.resolve({ data: [], error: null }).then(resolve) }
    return query
  },
  rpc: async (name, { p_payload }) => {
    expect(name).toBe('bridge_create_mvp_transaction')
    fixture.payloads.push(p_payload)
    return { data: { transaction: { ...p_payload, id: '55555555-5555-4555-8555-555555555555' }, existing: false }, error: null }
  },
} }))
vi.mock('../envValidation', () => ({ isUnsafeFallbackAllowed: () => false }))
vi.mock('../mvpPilotCreationFreeze.js', () => ({ assertMvpPilotCreationAllowed: () => {} }))
vi.mock('../api', () => ({ prepareBuyerOnboardingDocumentWorkspace: (...args) => fixture.prepare(...args) }))
vi.mock('../../services/documents/buyerLeadDocumentHandoffService.js', () => ({ promoteStagedBuyerLeadDocuments: (...args) => fixture.handoff(...args) }))
import { createTransactionFromLeadOverride } from '../transactionLifecycleService.js'

const org = '11111111-1111-4111-8111-111111111111', leadId = '22222222-2222-4222-8222-222222222222', listingId = '33333333-3333-4333-8333-333333333333', actorId = '44444444-4444-4444-8444-444444444444'
const args = {
  lead: { leadId, organisationId: org, assignedAgentId: actorId, firstName: 'Example', lastName: 'Buyer', email: 'buyer@example.com' },
  listing: { id: listingId, organisationId: org, propertyType: 'house', propertyTenure: 'freehold', sellerType: 'individual' },
  actor: { id: actorId, role: 'agent', name: 'Example Agent', email: 'agent@example.com' },
  payload: { organisationId: org, listingId, originatingLeadId: leadId, assignedAgentId: actorId, purchasePrice: 1000000, dealValue: 1000000, financeType: 'cash', purchaserType: 'individual', propertyType: 'house', propertyTenure: 'freehold', sellerType: 'individual', creationMode: 'signed_otp_capture', signedOtpStoragePath: `buyer-otp-documents/${org}/${leadId}/uploaded_otp/signed.pdf` },
  options: { allowDirectLeadConversion: true, creationMode: 'signed_otp_capture', allowIncompleteRoutingFacts: true },
}
beforeEach(() => { fixture.existing = null; fixture.updates = []; fixture.payloads = []; fixture.prepare.mockClear(); fixture.handoff.mockClear(); fixture.prepare.mockResolvedValue({}) })
it('the real agent creation service sends the proof to the server and prepares shared documents', async () => {
  const result = await createTransactionFromLeadOverride(args)
  expect(result.persisted).toBe(true)
  expect(fixture.payloads).toHaveLength(1)
  expect(fixture.payloads[0].creation_mode).toBe('signed_otp_capture')
  expect(fixture.payloads[0].signed_otp_storage_path).toBe(args.payload.signedOtpStoragePath)
  expect(fixture.prepare).toHaveBeenCalledWith(result.transactionId)
  expect(fixture.handoff).toHaveBeenCalledOnce()
  expect(fixture.prepare.mock.invocationCallOrder[0]).toBeLessThan(fixture.handoff.mock.invocationCallOrder[0])
})
it('an ordinary agent cannot turn a missing physical proof into a manual override', async () => {
  await expect(createTransactionFromLeadOverride({ ...args, payload: { ...args.payload, signedOtpStoragePath: '' } })).rejects.toThrow(/principal\/admin/)
  expect(fixture.payloads).toHaveLength(0)
})
it('a marked synthetic buyer needs the explicit controlled pilot context and cannot permit external delivery', async () => {
  const lead = { ...args.lead, email: 'workflow@example.invalid' }
  await expect(createTransactionFromLeadOverride({ ...args, lead })).rejects.toThrow(/controlled test mode/)
  await createTransactionFromLeadOverride({ ...args, lead, payload: { ...args.payload, testMode: true, controlledTestRoleSet: 'mvp_pilot_v1' } })
  expect(fixture.payloads[0].routing_profile_json.testDataProtection.externalDeliveryAllowed).toBe(false)
})
it('failure after a durable transaction keeps its identity and exposes the incomplete document setup', async () => {
  fixture.prepare.mockRejectedValueOnce(new Error('Requirement setup temporarily unavailable'))
  const result = await createTransactionFromLeadOverride(args)
  expect(result.persisted).toBe(true)
  expect(result.transactionId).toBeTruthy()
  expect(result.warning).toContain('shared document setup needs retry')
  expect(fixture.handoff).not.toHaveBeenCalled()
})

it('a principal recording the assigned agent’s paper deal retains the existing assignment', async () => {
  await createTransactionFromLeadOverride({ ...args, actor: { ...args.actor, id: '66666666-6666-4666-8666-666666666666', role: 'principal' }, payload: { ...args.payload, assignedAgentId: '66666666-6666-4666-8666-666666666666' } })
  expect(fixture.payloads[0].assigned_agent_id).toBe(actorId)
  expect(fixture.payloads[0].owner_user_id).toBe(actorId)
})
it('reusing the correct saved deal retains the lead stage and never creates another transaction', async () => {
  const id = '55555555-5555-4555-8555-555555555555'
  fixture.existing = { id, organisation_id: org, originating_buyer_lead_id: leadId, listing_id: listingId, stage: 'Registered' }
  const result = await createTransactionFromLeadOverride({ ...args, lead: { ...args.lead, convertedTransactionId: id, stage: 'Transaction' } })
  expect(result.transactionId).toBe(id)
  expect(fixture.payloads).toHaveLength(0)
  expect(fixture.updates).toHaveLength(1)
  expect(fixture.updates[0]).not.toHaveProperty('stage')
  expect(fixture.updates[0]).not.toHaveProperty('status')
  expect(fixture.prepare).toHaveBeenCalledWith(id)
})
it('a stale converted-deal link cannot attach the buyer to another lead’s deal', async () => {
  const id = '55555555-5555-4555-8555-555555555555'
  fixture.existing = { id, organisation_id: org, originating_buyer_lead_id: actorId, listing_id: listingId }
  await expect(createTransactionFromLeadOverride({ ...args, lead: { ...args.lead, convertedTransactionId: id } })).rejects.toThrow(/not linked to this buyer/)
  expect(fixture.updates).toHaveLength(0)
  expect(fixture.payloads).toHaveLength(0)
})
