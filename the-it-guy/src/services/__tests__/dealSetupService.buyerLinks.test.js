import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ parties: vi.fn() }))
vi.mock('../../lib/supabaseClient.js', () => ({ supabase: null }))
vi.mock('../buyerProfileReuseService.js', () => ({ listTransactionBuyerParties: mocks.parties }))
vi.mock('../documents/transactionCanonicalDocumentRequirementService.js', () => ({
  resolveTransactionDocumentRequirements: vi.fn(),
  TRANSACTION_CANONICAL_PERSISTENCE_MODES: { creationRpc: 'creation_rpc' },
}))
vi.mock('../documents/documentRequestCanonicalTransactionSyncService.js', () => ({ syncCanonicalRequiredDocumentsForTransactionContext: vi.fn() }))

import { auditDealSetupCompatibility, loadCanonicalDealSetup } from '../dealSetupService.js'

const transaction = { id: 'tx', buyer_id: 'captured', primary_buyer_participant_id: null, purchaser_type: 'individual', finance_type: 'cash', buyer_parties_model_version: 'legacy' }
function readOnlyClient(row = transaction) {
  const single = vi.fn().mockResolvedValue({ data: row, error: null })
  const select = vi.fn(() => ({ eq: () => ({ single }) }))
  const from = vi.fn((table) => {
    expect(table).toBe('transactions')
    return { select }
  })
  return { from, select }
}
beforeEach(() => { vi.clearAllMocks(); mocks.parties.mockResolvedValue([]) })

describe('Deal Setup buyer link loading', () => {
  it('loads a captured buyer as a link gap without modifying any records', async () => {
    const client = readOnlyClient()
    const result = await loadCanonicalDealSetup({ transactionId: 'tx', client })
    expect(result.setup.primaryBuyerId).toBe('')
    expect(result.setup.buyerLinkIssues[0].code).toBe('unlinked_captured_buyer')
    expect(client.select.mock.calls[0][0]).toContain('primary_buyer_participant_id')
    expect(mocks.parties).toHaveBeenCalledWith({ transactionId: 'tx', client })
    expect(client.from).toHaveBeenCalledTimes(1)
  })

  it('uses the same transaction snapshot when auditing stale primary links', async () => {
    mocks.parties.mockResolvedValue([{ id: 'primary', buyer_party_id: 'other', is_primary_buyer: true }])
    const client = readOnlyClient({ ...transaction, primary_buyer_participant_id: 'old' })
    const result = await auditDealSetupCompatibility({ transactionId: 'tx', client })
    expect(result.readyForBackfill).toBe(false)
    expect(result.setup.buyerLinkIssues.map((issue) => issue.code)).toContain('invalid_primary_participant_link')
    expect(client.from).toHaveBeenCalledTimes(1)
  })
})
