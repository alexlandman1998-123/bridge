import { beforeEach, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({ rows: {}, reads: [], writes: [], unavailable: false }))
vi.mock('../supabaseClient', () => ({ isSupabaseConfigured: true, supabase: { from(table) {
  const filters = []
  const query = {
    select() { return query }, eq(key, value) {
      if (table === 'documents' && key === 'organisation_id') throw new Error('documents has no organisation_id column')
      filters.push(row => row[key] === value); return query
    },
    in(key, values) { filters.push(row => values.includes(row[key])); return query },
    limit() { return query }, insert(value) { fixture.writes.push({ table, value }); return query },
    async maybeSingle() { const result = await query; return { ...result, data: result.data?.[0] || null } },
    then(resolve) {
      fixture.reads.push(table)
      const data = (fixture.rows[table] || []).filter(row => filters.every(matches => matches(row)))
      return Promise.resolve(fixture.unavailable ? { error: { code: 'PGRST204', message: 'Unavailable' } } : { data, count: data.length, error: null }).then(resolve)
    },
  }
  return query
} } }))
vi.mock('../agencyCrmRepository', () => ({ createAgencyCrmLeadActivity: vi.fn(async () => ({})), createAgencyCrmLeadTask: vi.fn(async () => ({})), updateAgencyCrmLeadRecord: vi.fn(async () => ({})) }))
vi.mock('../bridgeIntelligenceEngine', () => ({ refreshBridgeIntelligenceForLifecycleEvent: vi.fn(async () => ({})) }))
vi.mock('../../services/documents/canonicalWorkflowGateService', () => ({ canAdvanceWorkflowStage: vi.fn(async () => ({ allowed: false, reason: 'FICA awaiting review' })) }))

import { validateBuyerStageTransition, transitionBuyerLeadStage } from '../workflowEngine.js'
import { updateAgencyCrmLeadRecord } from '../agencyCrmRepository'

const org = '11111111-1111-4111-8111-111111111111', leadId = '22222222-2222-4222-8222-222222222222', transactionId = '33333333-3333-4333-8333-333333333333'
const actor = { id: '44444444-4444-4444-8444-444444444444', role: 'agent' }
const input = { organisationId: org, leadId, lead: { leadId, stage: 'Viewing', convertedTransactionId: transactionId }, transactionId, actor, toStage: 'Offer' }
beforeEach(() => {
  vi.clearAllMocks(); fixture.reads = []; fixture.writes = []; fixture.unavailable = false
  fixture.rows = {
    leads: [{ lead_id: leadId, organisation_id: org, converted_transaction_id: transactionId, raw_enquiry_payload: {} }],
    transactions: [{ id: transactionId, organisation_id: org, originating_buyer_lead_id: leadId }],
    documents: [{ id: 'document', transaction_id: transactionId, document_type: 'signed_otp', status: 'under_review', file_path: 'exact/signed.pdf' }],
  }
})
it('records an already signed OTP from Viewing without first resending and completing onboarding', async () => {
  const result = await validateBuyerStageTransition(input)
  expect(result.allowed).toBe(true)
  expect(result.requirements[0].ok).toBe(true)
  expect(fixture.reads).toContain('documents')
})
it('allows a captured paper deal to catch up to its saved evidence without approving FICA', async () => {
  const result = await validateBuyerStageTransition({ ...input, lead: { ...input.lead, stage: 'Captured' } })
  expect(result.allowed).toBe(true)
  expect(fixture.rows.documents[0].status).toBe('under_review')
})
it('does not treat a submitted offer or missing file as signed OTP evidence', async () => {
  fixture.rows.documents = []
  fixture.rows.offers = [{ organisation_id: org, buyer_lead_id: leadId, status: 'submitted' }]
  expect((await validateBuyerStageTransition(input)).allowed).toBe(false)
})
it('rejects a document belonging to another lead or organisation', async () => {
  fixture.rows.transactions[0].originating_buyer_lead_id = actor.id
  expect((await validateBuyerStageTransition(input)).allowed).toBe(false)
  fixture.rows.transactions[0].originating_buyer_lead_id = leadId
  fixture.rows.transactions[0].organisation_id = actor.id
  expect((await validateBuyerStageTransition(input)).allowed).toBe(false)
})
it('reports unavailable evidence without silently bypassing the signed-document check', async () => {
  fixture.unavailable = true
  expect((await validateBuyerStageTransition(input)).allowed).toBe(false)
})
it('a repeat of the saved stage is idempotent and creates no duplicate activity or tasks', async () => {
  const result = await transitionBuyerLeadStage({ ...input, lead: { ...input.lead, stage: 'Offer' } })
  expect(result.alreadyAtStage).toBe(true)
  expect(updateAgencyCrmLeadRecord).not.toHaveBeenCalled()
  expect(fixture.writes).toHaveLength(0)
})
it('closed leads and professional viewers cannot use the evidence shortcut', async () => {
  expect((await validateBuyerStageTransition({ ...input, lead: { ...input.lead, stage: 'Closed lost' } })).allowed).toBe(false)
  expect((await validateBuyerStageTransition({ ...input, actor: { ...actor, role: 'attorney' } })).allowed).toBe(false)
})
