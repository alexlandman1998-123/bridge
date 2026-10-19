import { expect, it, vi } from 'vitest'
import { loadTransactionSellerCapture, saveTransactionSellerCapture } from '../transactionSellerCaptureService.js'
const context = { revision: { transactionId: 'tx', formUpdatedAt: 'shown' }, details: {}, roster: [] }
it('loads the seller profile with its revision and roster in one command', async () => {
  const client = { rpc: vi.fn().mockResolvedValue({ data: context }) }
  expect(await loadTransactionSellerCapture({ transactionId: 'tx', client })).toBe(context)
  expect(client.rpc).toHaveBeenCalledWith('bridge_get_transaction_seller_capture', { p_transaction_id: 'tx' })
})
it('saves only the draft profile through the protected command', async () => {
  const profile = { entityType: 'individual', people: [] }
  const receipt = { ...context, profile, mutationId: 'save' }
  const client = { rpc: vi.fn().mockResolvedValue({ data: receipt }), from: vi.fn() }
  expect(await saveTransactionSellerCapture({ transactionId: 'tx', context, profile, mutationId: 'save', client })).toBe(receipt)
  expect(client.rpc).toHaveBeenCalledWith('bridge_save_transaction_seller_capture', { p_transaction_id: 'tx', p_revision: context.revision, p_profile: profile, p_mutation_id: 'save' })
  expect(client.from).not.toHaveBeenCalled()
})
it('keeps missing migration, stale saves and uncertain receipts as errors without fallback writes', async () => {
  const client = { rpc: vi.fn().mockResolvedValue({ error: { code: 'PGRST202' } }), from: vi.fn() }
  await expect(loadTransactionSellerCapture({ transactionId: 'tx', client })).rejects.toThrow('database update')
  client.rpc.mockResolvedValue({ error: { code: 'PT409', message: 'Stale seller profile' } })
  await expect(saveTransactionSellerCapture({ transactionId: 'tx', context, profile: {}, mutationId: 'save', client })).rejects.toMatchObject({ code: 'PT409' })
  client.rpc.mockResolvedValue({ data: { ...context, profile: {}, mutationId: 'different' } })
  await expect(saveTransactionSellerCapture({ transactionId: 'tx', context, profile: {}, mutationId: 'save', client })).rejects.toThrow('could not be confirmed')
  expect(client.from).not.toHaveBeenCalled()
})
