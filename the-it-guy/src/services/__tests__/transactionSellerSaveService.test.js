import { describe, expect, it, vi } from 'vitest'
import { buildTransactionSellerPatch, loadTransactionSellerEditContext, saveTransactionSellerDetails } from '../transactionSellerSaveService.js'

const context = { details: { name: 'Owner', email: 'old@example.com', phone: 'old' }, revision: { transactionUpdatedAt: 'shown', onboardingUpdatedAt: 'shown-capture' } }
const mutationId = '00000000-0000-4000-8000-000000000001'
describe('transaction seller saving', () => {
  it('distinguishes omission, unchanged values and deliberate clearing', () => {
    expect(buildTransactionSellerPatch({ phone: ' new ', email: '' }, context.details)).toEqual({ phone: 'new', email: '' })
    expect(buildTransactionSellerPatch({ phone: undefined, name: 'Owner' }, context.details)).toEqual({})
  })
  it('loads the seller details and revision together', async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: context }) }
    expect(await loadTransactionSellerEditContext({ transactionId: 'tx', client })).toBe(context)
    expect(client.rpc).toHaveBeenCalledWith('bridge_get_transaction_seller_edit_context', { p_transaction_id: 'tx' })
  })
  it('sends only the original revision and changed fields in one command', async () => {
    const receipt = { ...context, mutationId }
    const client = { rpc: vi.fn().mockResolvedValue({ data: receipt }) }
    expect(await saveTransactionSellerDetails({ transactionId: 'tx', details: { ...context.details, phone: 'new' }, context, mutationId, client })).toBe(receipt)
    expect(client.rpc).toHaveBeenCalledWith('bridge_save_transaction_seller_details', { p_transaction_id: 'tx', p_revision: context.revision, p_patch: { phone: 'new' }, p_mutation_id: mutationId })
  })
  it('does not retry a stale save, read back or fall back to direct table writes', async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ error: { code: 'PT409', message: 'conflict' } }), from: vi.fn() }
    await expect(saveTransactionSellerDetails({ transactionId: 'tx', details: { phone: 'new' }, context, mutationId, client })).rejects.toMatchObject({ code: 'PT409' })
    expect(client.rpc).toHaveBeenCalledTimes(1); expect(client.from).not.toHaveBeenCalled()
  })
  it('fails closed without the original context or matching receipt', async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: { ...context, mutationId: 'another-save' } }) }
    await expect(saveTransactionSellerDetails({ transactionId: 'tx', details: { phone: 'new' }, mutationId, client })).rejects.toThrow(/Reload/)
    expect(client.rpc).not.toHaveBeenCalled()
    await expect(saveTransactionSellerDetails({ transactionId: 'tx', details: { phone: 'new' }, context, mutationId, client })).rejects.toThrow(/could not be confirmed/)
  })
  it('makes no write for unchanged fields and blocks unresolved links', async () => {
    const client = { rpc: vi.fn() }
    expect(await saveTransactionSellerDetails({ transactionId: 'tx', details: context.details, context, mutationId, client })).toBe(context)
    await expect(saveTransactionSellerDetails({ transactionId: 'tx', details: { phone: 'new' }, context: { ...context, blockedReason: 'Link needs review' }, mutationId, client })).rejects.toThrow('Link needs review')
    expect(client.rpc).not.toHaveBeenCalled()
  })
})
