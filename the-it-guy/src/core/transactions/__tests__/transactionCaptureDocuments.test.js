import { describe, expect, it, vi } from 'vitest'
import { saveTransactionCaptureDocuments, transactionCaptureDocumentOptions, transactionCaptureUploadTarget } from '../transactionCaptureDocuments.js'
import { buildTransactionPartiesSnapshot } from '../transactionPartyProfile.js'

describe('transaction capture evidence', () => {
  it('offers a separate identity document for each buyer owner', () => {
    const parties = buildTransactionPartiesSnapshot({ buyer: { entityType: 'multiple_owners', people: [
      { id: 'one', name: 'Jane', isOwner: true }, { id: 'two', name: 'Alex', isOwner: true },
    ] }, seller: { entityType: 'unknown', people: [] } })
    const options = transactionCaptureDocumentOptions(parties, 'cash').filter((entry) => entry.key === 'buyer_id_document')
    expect(options.map((entry) => entry.label)).toEqual(expect.arrayContaining([expect.stringContaining('Jane'), expect.stringContaining('Alex')]))
    expect(new Set(options.map((entry) => entry.value)).size).toBe(2)
  })
  it('matches the exact person, never an ambiguous or generic identity slot', () => {
    const requirements = [
      { key: 'buyer_id_document', partyId: 'one', canonicalRequirementInstanceId: 'req-one' },
      { key: 'buyer_id_document', partyId: 'two', canonicalRequirementInstanceId: 'req-two' },
    ]
    expect(transactionCaptureUploadTarget({ key: 'buyer_id_document', partyId: 'two' }, requirements)).toBe('req-two')
    expect(transactionCaptureUploadTarget({ key: 'buyer_id_document', partyId: 'removed' }, requirements)).toBeNull()
    expect(transactionCaptureUploadTarget({ key: 'buyer_id_document' }, requirements)).toBeNull()
    expect(transactionCaptureUploadTarget({ key: 'buyer_id_document', partyId: 'two' }, [...requirements, requirements[1]])).toBeNull()
  })
  it('continues after one file fails and retries only unsaved files in the same transaction', async () => {
    const upload = vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce({ id: 'saved-second' }).mockResolvedValueOnce({ id: 'saved-first' })
    const entries = [{ id: 'first', key: 'signed_otp', file: { name: 'otp.pdf' } }, { id: 'second', key: 'general', file: { name: 'extra.pdf' } }]
    const result = await saveTransactionCaptureDocuments({ transactionId: 'existing-deal', entries, upload })
    expect(result.map((entry) => entry.status)).toEqual(['failed', 'saved'])
    const retry = await saveTransactionCaptureDocuments({ transactionId: 'existing-deal', entries: result, upload })
    expect(retry.map((entry) => entry.status)).toEqual(['saved', 'saved'])
    expect(upload).toHaveBeenCalledTimes(3)
    expect(upload.mock.calls.every(([payload]) => payload.transactionId === 'existing-deal')).toBe(true)
  })
  it('saves unmatched documents without inferred links and reports checklist matching still needed', async () => {
    const upload = vi.fn(async () => ({ id: 'saved' }))
    const [entry] = await saveTransactionCaptureDocuments({ transactionId: 'deal', entries: [{ id: 'entry', key: 'buyer_id_document', partyId: 'one', file: {} }], upload })
    expect(upload.mock.calls[0][0]).toMatchObject({ inferCanonicalRequirement: false, canonicalRequirementInstanceId: null, relatedEntityId: 'one', isClientVisible: false })
    expect(entry).toMatchObject({ status: 'saved', needsMatching: true })
  })
  it('rejects unconfirmed upload results and refuses uploads before transaction creation', async () => {
    const upload = vi.fn(async () => ({}))
    const [entry] = await saveTransactionCaptureDocuments({ transactionId: 'deal', entries: [{ id: 'file', key: 'signed_otp', file: {} }], upload })
    expect(entry.status).toBe('failed')
    await expect(saveTransactionCaptureDocuments({ entries: [], upload })).rejects.toThrow('Save the transaction')
  })
})
