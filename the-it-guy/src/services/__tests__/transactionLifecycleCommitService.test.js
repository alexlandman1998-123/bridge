import { expect, it, vi } from 'vitest'
import { commitTransactionLifecycle, getTransactionLifecyclePermissions, readCommittedLifecycle, requireLifecycleActionReceipt } from '../transactionLifecycleCommitService.js'

const receipt = { transactionId: 'tx', action: 'register', lifecycleState: 'registered', registeredAt: '2026-11-08T10:00:00Z', completedAt: null }
it('requires the matching action, transaction and saved lifecycle receipt', async () => {
  const client = { rpc: vi.fn().mockResolvedValue({ data: receipt }) }
  expect(await commitTransactionLifecycle(client, { transactionId: 'tx', action: 'register' })).toBe(receipt)
  expect(client.rpc).toHaveBeenCalledOnce()
})
it.each([null, {}, { ...receipt, transactionId: 'other' }, { ...receipt, action: 'complete' }, { ...receipt, registeredAt: null }, { ...receipt, lifecycleState: 'active' }])('rejects an unconfirmed mutation response: %j', async data => {
  await expect(commitTransactionLifecycle({ rpc: vi.fn().mockResolvedValue({ data }) }, { transactionId: 'tx', action: 'register' })).rejects.toMatchObject({ code: 'TRANSACTION_LIFECYCLE_UNCONFIRMED' })
})
it('turns a mechanical RLS rejection into an actionable permission message', async () => {
  await expect(commitTransactionLifecycle({ rpc: vi.fn().mockResolvedValue({ error: { code: '42501', message: 'new row violates row-level security policy' } }) }, { transactionId: 'tx', action: 'complete' })).rejects.toThrow(/transaction permissions blocked/)
})
it('a successful receipt survives a notification failure without another send', async () => {
  const notify = vi.fn().mockRejectedValue(new Error('provider private body'))
  const result = await readCommittedLifecycle({ receipt, transaction: { id: 'tx' }, read: async () => ({ transaction: { id: 'tx', lifecycle_state: 'registered' } }), followUps: [{ label: 'registration notifications', run: notify }] })
  expect(result.lifecycleReceipt).toBe(receipt)
  expect(result.lifecycleWarnings[0]).toMatch(/saved.*notifications/)
  expect(result.lifecycleWarnings[0]).not.toContain('private body')
  expect(notify).toHaveBeenCalledOnce()
})
it('keeps confirmed facts when the page read fails after a commit', async () => {
  const result = await readCommittedLifecycle({ receipt, transaction: { id: 'tx', title: 'Saved matter' }, read: async () => { throw new Error('offline') } })
  expect(result.transaction).toMatchObject({ id: 'tx', title: 'Saved matter', lifecycle_state: 'registered', registered_at: receipt.registeredAt })
  expect(result.lifecycleWarnings[0]).toMatch(/saved.*refresh/i)
})
it('does not overwrite newer saved state with an older receipt', async () => {
  const result = await readCommittedLifecycle({ receipt, transaction: { id: 'tx' }, read: async () => ({ transaction: { id: 'tx', lifecycle_state: 'completed' } }) })
  expect(result.transaction.lifecycle_state).toBe('completed')
})
it('a refresh for another matter cannot replace this transaction after its save', async () => {
  const result = await readCommittedLifecycle({ receipt, transaction: { id: 'tx' }, read: async () => ({ transaction: { id: 'other' } }) })
  expect(result.transaction.id).toBe('tx')
  expect(result.lifecycleWarnings[0]).toMatch(/latest view could not be loaded/)
})
it('malformed archive, cancellation and restore replies never count as saved', () => {
  for (const data of [null, {}, { id: 'other', lifecycle_state: 'archived' }, { id: 'tx', lifecycle_state: 'active' }]) expect(() => requireLifecycleActionReceipt(data, 'tx', ['archived'])).toThrow(/could not be confirmed/)
  expect(requireLifecycleActionReceipt({ id: 'tx', lifecycle_state: 'archived' }, 'tx', ['archived']).id).toBe('tx')
})
it('permission errors remain errors and an empty permission reply never grants access', async () => {
  expect(await getTransactionLifecyclePermissions({ rpc: async () => ({ data: null }) }, 'tx')).toEqual({})
  await expect(getTransactionLifecyclePermissions({ rpc: async () => ({ error: new Error('Access denied') }) }, 'tx')).rejects.toThrow('Access denied')
})
