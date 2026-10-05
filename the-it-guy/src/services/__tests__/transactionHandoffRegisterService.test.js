import { describe, expect, it, vi } from 'vitest'
vi.mock('../../lib/supabaseClient', () => ({ supabase: null }))
import { readTransactionHandoffRegister, readTransactionHandoffDispatchMode } from '../transactionHandoffRegisterService'
describe('handoff register read boundary', () => {
 it('reads the authorised persisted register', async () => {
  const client = { rpc: vi.fn().mockResolvedValue({ data: { items: [] }, error: null }) }
  await expect(readTransactionHandoffRegister('matter', { client })).resolves.toEqual({ items: [] })
  expect(client.rpc).toHaveBeenCalledWith('bridge_read_transaction_handoffs', { p_transaction_id: 'matter' })
 })
 it.each(['42883', 'PGRST202'])('reports unavailable migration (%s) explicitly', async code => {
  await expect(readTransactionHandoffRegister('matter', { client: { rpc: async () => ({ error: { code } }) } })).rejects.toThrow('not available yet')
 })
 it('does not turn invalid data or permission failures into a healthy empty register', async () => {
  await expect(readTransactionHandoffRegister('matter', { client: { rpc: async () => ({ data: {} }) } })).rejects.toThrow('could not be loaded')
  await expect(readTransactionHandoffRegister('matter', { client: { rpc: async () => ({ error: new Error('Access denied') }) } })).rejects.toThrow('Access denied')
 })
})

describe('durable dispatch routing', () => {
 it('uses legacy delivery only when the migration is missing', async () => {
  await expect(readTransactionHandoffDispatchMode({ rpc: async () => ({ error: { code: 'PGRST202' } }) }, 'matter')).resolves.toBe(false)
  await expect(readTransactionHandoffDispatchMode({ rpc: async () => ({ data: { enabled: true } }) }, 'matter')).resolves.toBe(true)
  await expect(readTransactionHandoffDispatchMode({ rpc: async () => ({ error: new Error('Network failed') }) }, 'matter')).rejects.toThrow('Network failed')
  await expect(readTransactionHandoffDispatchMode({ rpc: async () => ({ data: {} }) }, 'matter')).rejects.toThrow('Unable to confirm')
 })
})

describe('handoff recovery boundary', () => {
 it('keeps the generation and request identity in the recovery RPC', async () => {
  const { recoverTransactionHandoff } = await import('../transactionHandoffRegisterService')
  const client = { rpc: vi.fn().mockResolvedValue({ data: { success: true, code: 'queued' } }) }
  await recoverTransactionHandoff({ handoffId: 'handoff', generation: 7, action: 'retry', reason: 'Reviewed delivery', requestId: 'request' }, { client })
  expect(client.rpc).toHaveBeenCalledWith('bridge_recover_transaction_handoff', { p_handoff_id: 'handoff', p_generation: 7, p_action: 'retry', p_reason: 'Reviewed delivery', p_request_id: 'request' })
 })
 it('makes finance ownership and unknown outcomes visible', async () => {
  const { recoverTransactionHandoff } = await import('../transactionHandoffRegisterService')
  await expect(recoverTransactionHandoff({}, { client: { rpc: async () => ({ data: { success: false, code: 'existing_finance_owner_required' } }) } })).rejects.toThrow('existing finance owner')
  await expect(recoverTransactionHandoff({}, { client: { rpc: async () => ({ data: null }) } })).rejects.toThrow('could not be confirmed')
 })
})

describe('organisation queue read boundary', () => {
 it('passes scope, filter and pagination to the read-only RPC', async () => {
  const { readOrganisationHandoffQueue } = await import('../transactionHandoffRegisterService')
  const data = { success: true, organisationId: 'agency', items: [], counts: {}, total: 0, hasMore: false }
  const client = { rpc: vi.fn().mockResolvedValue({ data }) }
  await expect(readOrganisationHandoffQueue('agency', { bucket: 'attention', offset: 25, client })).resolves.toEqual(data)
  expect(client.rpc).toHaveBeenCalledWith('bridge_read_organisation_handoff_queue', { p_organisation_id: 'agency', p_bucket: 'attention', p_limit: 25, p_offset: 25 })
 })
 it('rejects another scope, denial, unavailable migration and incomplete snapshots', async () => {
  const { readOrganisationHandoffQueue } = await import('../transactionHandoffRegisterService')
  for (const data of [{ success: true, organisationId: 'foreign', items: [], counts: {}, total: 0, hasMore: false }, { success: true, organisationId: 'agency', items: [] }]) {
   await expect(readOrganisationHandoffQueue('agency', { client: { rpc: async () => ({ data }) } })).rejects.toThrow('could not be confirmed')
  }
  await expect(readOrganisationHandoffQueue('agency', { client: { rpc: async () => ({ data: { code: 'organisation_authority_required' } }) } })).rejects.toThrow('agency headquarters')
  await expect(readOrganisationHandoffQueue('agency', { client: { rpc: async () => ({ error: { code: 'PGRST202' } }) } })).rejects.toThrow('not available yet')
 })
})
