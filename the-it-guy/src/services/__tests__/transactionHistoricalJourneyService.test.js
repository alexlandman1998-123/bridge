// @vitest-environment jsdom
import { expect, it, vi } from 'vitest'
vi.mock('../../lib/supabaseClient.js', () => ({ supabase: null }))
import { saveTransactionHistoricalJourney } from '../transactionHistoricalJourneyService.js'

it('saves through the historical-only command and broadcasts a scoped refresh', async () => {
  const rpc = vi.fn(async () => ({ data: { recordRevision: 2 }, error: null }))
  const refresh = vi.fn()
  window.addEventListener('itg:transaction-updated', refresh)
  try {
    await saveTransactionHistoricalJourney({ transactionId: 'matter', milestones: { finance: { completedOn: null } }, expectedRevision: 1 }, { rpc })
    expect(rpc).toHaveBeenCalledExactlyOnceWith('bridge_save_transaction_historical_journey', {
      p_transaction_id: 'matter', p_milestones: { finance: { completedOn: null } }, p_expected_revision: 1,
    })
    expect(refresh).toHaveBeenCalledOnce()
    expect(refresh.mock.calls[0][0].detail).toEqual({ transactionId: 'matter' })
  } finally { window.removeEventListener('itg:transaction-updated', refresh) }
})
it('rejects future or invalid dates before persistence', async () => {
  const rpc = vi.fn()
  for (const date of ['2999-01-01', '2026-02-30']) {
    await expect(saveTransactionHistoricalJourney({ transactionId: 'matter', milestones: { otp_signed: { completedOn: date } } }, { rpc })).rejects.toThrow()
  }
  expect(rpc).not.toHaveBeenCalled()
})
it('explains a missing migration and propagates a stale edit without a success signal', async () => {
  const refresh = vi.fn()
  window.addEventListener('itg:transaction-updated', refresh)
  try {
    await expect(saveTransactionHistoricalJourney({ transactionId: 'matter', milestones: {} }, {
      rpc: async () => ({ error: { code: 'PGRST202' } }),
    })).rejects.toThrow('database update')
    await expect(saveTransactionHistoricalJourney({ transactionId: 'matter', milestones: {} }, {
      rpc: async () => ({ error: { code: '40001', message: 'Historical progress changed.' } }),
    })).rejects.toThrow('changed')
    expect(refresh).not.toHaveBeenCalled()
  } finally { window.removeEventListener('itg:transaction-updated', refresh) }
})
