import { expect, it } from 'vitest'
import { buildTransactionCaptureFinance, splitTransactionCaptureRolePlayers, resolveTransactionCaptureParticipantPolicy } from '../transactionCaptureFinance.js'
import { buildTransactionPartiesSnapshot } from '../transactionPartyProfile.js'
import { transactionCaptureDocumentOptions } from '../transactionCaptureDocuments.js'

it('keeps unknown finance and seller bond positions explicit', () => {
  const result = buildTransactionCaptureFinance({ financeType: 'unknown' })
  expect(result.snapshot).toMatchObject({ type: 'unknown', sellerBondStatus: 'unknown', bank: '', bondStatus: null })
  expect(result.complete).toBe(false)
  expect(result.missing).toContain('Confirm whether the seller has an existing bond to cancel.')
})
it('uses the existing funding reconciliation and does not double count a mixed-route deposit', () => {
  const form = { financeType: 'combination', financeManagedBy: 'client', financeBank: 'Bank', bondStatus: 'approved', bondAttorneyNomination: { mode: 'agency' }, cashAmount: '200000', depositAmount: '100000', bondAmount: '800000', sellerBondStatus: 'no' }
  const result = buildTransactionCaptureFinance(form, 1000000)
  expect(result.complete).toBe(true)
  expect(result.snapshot.bondStatus).toBe('approved')
  expect(result.snapshot).not.toHaveProperty('verified')
  expect(buildTransactionCaptureFinance({ ...form, bondAmount: '700000' }, 1000000).missing).toContain('Cash plus bond must equal the purchase price. The deposit is already included in cash.')
})
it('cash excludes stale buyer bond data while retaining seller cancellation facts', () => {
  const result = buildTransactionCaptureFinance({ financeType: 'cash', financeBank: 'Old buyer bank', bondStatus: 'approved', bondAmount: '500', sellerBondStatus: 'yes', sellerBondBank: 'Seller bank', sellerBondReference: '123', cashAmount: '1000', depositAmount: '0' }, 1000)
  expect(result.snapshot).toMatchObject({ bank: '', bondStatus: null, bondAmount: '', sellerBondBank: 'Seller bank', sellerBondReference: '123' })
})
it('routes professionals by organisation connection, not a preferred label or known user email', () => {
  const result = splitTransactionCaptureRolePlayers([
    { roleType: 'transfer_attorney', source: 'agency_preferred', partner: { companyName: 'External firm', email: 'external@example.com', userId: 'known-user' } },
    { roleType: 'bond_attorney', userId: 'preferred-attorney', partnerOrganisationId: 'connected-org', partner: { companyName: 'Bank firm' } },
  ], { financeType: 'bond', financeManagedBy: 'client', sellerBondStatus: 'no' })
  expect(result.connected[0]).toMatchObject({ roleType: 'bond_attorney', userId: null, firmFirstAllocation: true, preferredAttorneyUserId: 'preferred-attorney' })
  expect(result.invitations[0]).toMatchObject({ roleType: 'transfer_attorney', companyName: 'External firm', contactName: 'External firm' })
})
it('direct bank and cash routes suppress originators; cash still permits seller cancellation', () => {
  const selections = ['bond_originator', 'bond_attorney', 'cancellation_attorney'].map((roleType) => ({ roleType, partnerOrganisationId: 'org' }))
  expect(splitTransactionCaptureRolePlayers(selections, { financeType: 'cash', sellerBondStatus: 'yes' }).connected.map((item) => item.roleType)).toEqual(['cancellation_attorney'])
  expect(splitTransactionCaptureRolePlayers(selections, { financeType: 'bond', financeManagedBy: 'client', sellerBondStatus: 'no' }).connected.map((item) => item.roleType)).toEqual(['bond_attorney'])
})
it('invalid external nominees are flagged instead of assigned', () => {
  expect(splitTransactionCaptureRolePlayers([{ roleType: 'transfer_attorney', partner: { companyName: 'Firm', email: 'invalid' } }]).missing).toHaveLength(1)
})
it('seller bond statement and buyer approval evidence appear for the right scenarios', () => {
  const parties = buildTransactionPartiesSnapshot({})
  const cash = transactionCaptureDocumentOptions(parties, 'cash', true).map((item) => item.key)
  expect(cash).toContain('bond_statement')
  expect(cash).not.toContain('bond_approval')
  expect(transactionCaptureDocumentOptions(parties, 'bond', false).map((item) => item.key)).toContain('bond_approval')
})

it('preserves profession assignments after reopening captured deals and fails closed on unreadable capture history', async () => {
  const defaults = [{ role_type: 'agent' }, { role_type: 'attorney' }, { role_type: 'bond_originator' }, { role_type: 'client' }]
  const mockClient = (result) => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => result }) }) }) })
  const captured = await resolveTransactionCaptureParticipantPolicy({ client: mockClient({ data: { form_data: { __bridge_finance: { captureSnapshot: { version: 'transaction_capture_finance_v1' } } } } }), transactionId: 'deal', defaults })
  expect(captured.defaults.map((row) => row.role_type)).toEqual(['agent', 'client'])
  expect(captured.captured).toBe(true)
  await expect(resolveTransactionCaptureParticipantPolicy({ client: mockClient({ error: { code: '42501', message: 'Denied' } }), transactionId: 'deal', defaults })).rejects.toMatchObject({ code: '42501' })
  const legacy = await resolveTransactionCaptureParticipantPolicy({ client: mockClient({ data: null }), transactionId: 'legacy', defaults })
  expect(legacy.defaults).toEqual(defaults)
  const initial = await resolveTransactionCaptureParticipantPolicy({ client: null, explicitCapture: true, defaults })
  expect(initial.defaults.map((row) => row.role_type)).toEqual(['agent', 'client'])
})
