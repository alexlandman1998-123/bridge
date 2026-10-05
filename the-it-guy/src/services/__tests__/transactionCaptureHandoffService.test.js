import { expect, it, vi } from 'vitest'
vi.mock('../../lib/supabaseClient.js', () => ({ supabase: null, isSupabaseConfigured: false }))
import { ensureTransactionCaptureInvitations } from '../transactionCaptureHandoffService.js'
const nomination = { roleType: 'transfer_attorney', companyName: 'Firm', email: 'firm@example.com', contactName: 'Pat' }
it('creates an external invitation and distinguishes email delivery from connection', async () => {
  const create = vi.fn(async () => ({ invitation: { id: 'invite', ...nomination, status: 'pending' }, emailResult: { sent: true } }))
  const [result] = await ensureTransactionCaptureInvitations({ transactionId: 'deal', nominations: [nomination], list: vi.fn(async () => []), create })
  expect(result).toMatchObject({ status: 'pending', invitationId: 'invite', message: 'Invitation email sent. Awaiting organisation connection.' })
  expect(create.mock.calls[0][0]).toMatchObject({ transactionId: 'deal', metadata: { source: 'transaction_capture' } })
})
it('does not create duplicate invitations on retries or resend an uncertain delivery', async () => {
  const create = vi.fn()
  const list = vi.fn(async () => [{ id: 'existing', ...nomination, status: 'pending' }])
  const [result] = await ensureTransactionCaptureInvitations({ transactionId: 'deal', nominations: [nomination], list, create })
  expect(create).not.toHaveBeenCalled()
  expect(list).toHaveBeenCalledWith('deal', { strict: true })
  expect(result.invitationId).toBe('existing')
})
it('fails closed when invitation history cannot be read', async () => {
  const create = vi.fn()
  const [result] = await ensureTransactionCaptureInvitations({ transactionId: 'deal', nominations: [nomination], list: async () => { throw new Error('Permission denied') }, create })
  expect(result.status).toBe('failed')
  expect(create).not.toHaveBeenCalled()
})
it('keeps expired and declined invitations for review without issuing another', async () => {
  for (const status of ['expired', 'declined']) {
    const create = vi.fn()
    const [result] = await ensureTransactionCaptureInvitations({ transactionId: 'deal', nominations: [nomination], list: async () => [{ id: 'existing', ...nomination, status }], create })
    expect(result.status).toBe('attention')
    expect(create).not.toHaveBeenCalled()
  }
})
it('reports a saved invitation with unconfirmed email accurately and continues if one invitation fails', async () => {
  const create = vi.fn().mockRejectedValueOnce(new Error('Lost response')).mockResolvedValueOnce({ invitation: { id: 'second' }, emailResult: { sent: false } })
  const results = await ensureTransactionCaptureInvitations({ transactionId: 'deal', nominations: [nomination, { ...nomination, roleType: 'bond_attorney' }], list: async () => [], create })
  expect(results[0].status).toBe('failed')
  expect(results[1]).toMatchObject({ status: 'pending', invitationId: 'second' })
  expect(results[1].message).toContain('Email delivery is not confirmed')
})

it.each([null, {}, [null], [{ status: 'pending' }], [{ id: 'partial' }], [{ id: 'partial', ...nomination, email: '' }]])('fails closed on incomplete invitation history: %j', async (history) => {
  const create = vi.fn()
  const [result] = await ensureTransactionCaptureInvitations({ transactionId: 'deal', nominations: [nomination], list: async () => history, create })
  expect(result.status).toBe('failed')
  expect(create).not.toHaveBeenCalled()
})
it('recovers a lost response by reusing the invitation that was actually saved', async () => {
  const history = []
  const create = vi.fn(async () => {
    history.push({ id: 'persisted', ...nomination, status: 'pending' })
    throw new Error('Response lost after save')
  })
  const args = { transactionId: 'deal', nominations: [nomination], list: async () => [...history], create }
  expect((await ensureTransactionCaptureInvitations(args))[0].status).toBe('failed')
  expect((await ensureTransactionCaptureInvitations(args))[0]).toMatchObject({ status: 'pending', invitationId: 'persisted' })
  expect(create).toHaveBeenCalledTimes(1)
})
it('does not mutate the invitation history returned by the register', async () => {
  const history = Object.freeze([])
  const [result] = await ensureTransactionCaptureInvitations({ transactionId: 'deal', nominations: [nomination], list: async () => history,
    create: async () => ({ invitation: { id: 'new', ...nomination, status: 'pending' } }) })
  expect(result.status).toBe('pending')
  expect(history).toHaveLength(0)
})
