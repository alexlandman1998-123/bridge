import { expect, it, vi } from 'vitest'
import { buildMobileAgentCommission, readMobileAgentCommission } from '../mobileAgentCommission.js'

const options = { organisationId: 'org', profile: { id: 'me', email: 'me@test.example' }, now: new Date('2026-10-13T10:00:00Z') }
const tx = (id, extra = {}) => ({ id, organisation_id: 'org', assigned_agent_email: 'me@test.example', stage: 'Finance', agent_commission_amount: 12500, ...extra })
const receipt = (id, date) => ({ transaction_id: id, workflow_key: 'sales_otp', step_key: 'signed_otp_received', status: 'completed', completed_at: date })

it('uses personal saved shares, SAST month boundaries and first receipt dates without counting a deal twice', () => {
  const rows = [tx('boundary'), tx('old'), tx('paid', { registered_at: '2026-10-05' }), tx('cancelled', { cancelled_at: '2026-10-06' }), tx('other-agent', { assigned_agent_email: 'other@test.example' }), tx('other-org', { organisation_id: 'other' }), tx('boundary')]
  const signedSteps = [receipt('boundary', '2026-09-30T22:15:00Z'), receipt('boundary', '2026-10-05T10:00:00Z'), receipt('old', '2026-09-10T10:00:00Z'), receipt('old', '2026-10-06T10:00:00Z'), ...['paid', 'cancelled', 'other-agent', 'other-org'].map(id => receipt(id, '2026-10-05T10:00:00Z'))]
  expect(buildMobileAgentCommission({ ...options, rows, signedSteps, commissions: [{ transaction_id: 'boundary', assigned_agent_id: 'me', agent_commission_amount: 15000 }] })).toEqual({ signedThisMonth: 27500, pipeline: 27500 })
})

it('keeps missing amounts and receipt dates unavailable rather than estimating from prices or update dates', () => {
  expect(buildMobileAgentCommission({ ...options, rows: [tx('one', { agent_commission_amount: null, sales_price: 2000000, gross_commission_percentage: 3.5, updated_at: '2026-10-12' })] })).toEqual({ signedThisMonth: null, pipeline: null })
  expect(buildMobileAgentCommission({ ...options, rows: [tx('one')], signaturesAvailable: false })).toEqual({ signedThisMonth: null, pipeline: 12500 })
  expect(buildMobileAgentCommission({ ...options })).toEqual({ signedThisMonth: 0, pipeline: 0 })
})

it('preserves a saved zero, ignores future/uncompleted receipts and excludes paid commission from the pipeline', () => {
  expect(buildMobileAgentCommission({ ...options, rows: [tx('zero', { stage: 'Lead', agent_commission_amount: 0 }), tx('paid')], commissions: [{ transaction_id: 'paid', status: 'paid', agent_commission_amount: 3000 }], signedSteps: [receipt('paid', '2026-10-02'), receipt('zero', '2026-11-01'), { ...receipt('zero', '2026-10-02'), status: 'pending' }] })).toEqual({ signedThisMonth: 3000, pipeline: 0 })
})

it('does not attribute another agent’s saved commission to an accessible shared deal', () => {
  expect(buildMobileAgentCommission({ ...options, rows: [tx('one', { assigned_agent_email: 'other@test.example' })], commissions: [{ transaction_id: 'one', assigned_agent_id: 'me', agent_commission_amount: 3000 }] })).toEqual({ signedThisMonth: 0, pipeline: 0 })
  expect(buildMobileAgentCommission({ ...options, rows: [tx('one', { assigned_agent_email: '' })], commissions: [{ transaction_id: 'one', assigned_agent_id: 'other', agent_commission_amount: 3000 }] })).toEqual({ signedThisMonth: 0, pipeline: 0 })
  expect(buildMobileAgentCommission({ ...options, rows: [tx('one', { assigned_agent_email: '' })], signedSteps: [receipt('one', '2026-10-01')] })).toEqual({ signedThisMonth: null, pipeline: null })
})

it('limits database reads to visible deals in the selected organisation and isolates failed signature reads', async () => {
  const ids = []
  const from = vi.fn(table => {
    const query = { select: vi.fn(() => query), eq: vi.fn(() => query), in: vi.fn((field, values) => { ids.push(values); return query }), then: resolve => resolve(table === 'transaction_commissions' ? { data: [{ transaction_id: 'one', assigned_agent_id: 'me', agent_commission_amount: 9000 }] } : { error: new Error('Unavailable') }) }
    return query
  })
  expect(await readMobileAgentCommission({ ...options, client: { from }, rows: [tx('one'), tx('outside', { organisation_id: 'other' })] })).toEqual({ signedThisMonth: null, pipeline: 9000 })
  expect(ids).toEqual([['one'], ['one']])
})
