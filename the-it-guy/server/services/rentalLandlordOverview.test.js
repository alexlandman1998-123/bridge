import { expect, it } from 'vitest'
import { buildRentalLandlordOverview, loadRentalLandlordOverview, loadRentalOverviewRows } from './rentalLandlordOverview.js'

const now = new Date('2026-10-19T10:00:00Z')
const units = [{ id: 'u1', status: 'occupied' }, { id: 'u2', status: 'vacant' }]
const tenancies = [{ id: 't1', unitId: 'u1', status: 'active', lease: { monthlyRent: 10000 } }, { id: 'old', unitId: 'u1', status: 'closed', lease: { monthlyRent: 9000 } }]
const rent = { id: 'rent', tenancy_id: 't1', charge_type: 'rent', amount: '10000.00', effective_date: '2026-10-01', due_date: '2026-10-01' }
const payment = { id: 'paid', tenancy_id: 't1', amount: '28000.00', received_date: '2026-10-02' }
const allocated = { id: 'allocated', tenancy_id: 't1', charge_id: 'rent', payment_id: 'paid', amount: '8000.00', allocated_on: '2026-10-02' }
const build = patch => buildRentalLandlordOverview({ now, units, tenancies, charges: [rent], payments: [payment], allocations: [allocated], ...patch })

it('totals saved active leases, rent allocations and occupied units without counting deposits or unallocated cash', () => {
  const result = build({ charges: [rent, { ...rent, id: 'deposit', charge_type: 'deposit', amount: 20000 }], allocations: [allocated, { ...allocated, id: 'dep-allocation', charge_id: 'deposit', amount: 20000 }] })
  expect(result).toMatchObject({ expectedRent: 10000, activeLeases: 1, collectedRent: 8000, collectionRate: 80, outstanding: 2000, attentionCount: 1, occupied: 1, totalUnits: 2, occupancyRate: 50 })
})
it('includes due historical account balances and approved adjustments, while excluding future charges', () => {
  const result = build({ charges: [rent, { ...rent, id: 'arrears', tenancy_id: 'old', amount: 300 }, { ...rent, id: 'future', amount: 99999, due_date: '2026-11-01' }], adjustments: [{ tenancy_id: 't1', amount: 500, effective_date: '2026-10-03', adjustment_type: 'credit' }, { tenancy_id: 't1', amount: 100, effective_date: '2026-10-03', adjustment_type: 'debit' }] })
  expect(result).toMatchObject({ outstanding: 1900, attentionCount: 2 })
})
it('removes reversed payments from collections and uses the posted reversal adjustment in outstanding', () => {
  const result = build({ corrections: [{ tenancy_id: 't1', correction_kind: 'payment_reversal', status: 'applied', effective_date: '2026-10-03', original_payment_id: 'paid' }], adjustments: [{ tenancy_id: 't1', amount: 28000, adjustment_type: 'debit', effective_date: '2026-10-03' }] })
  expect(result).toMatchObject({ collectedRent: 0, outstanding: 30000 })
})
it('excludes another property and future payments, and uses the South African calendar month', () => {
  const result = build({ now: new Date('2026-09-30T22:30:00Z'), charges: [rent, { ...rent, id: 'foreign', tenancy_id: 'other', amount: 99999 }], payments: [{ ...payment, received_date: '2026-10-01' }, { ...payment, id: 'future', received_date: '2026-10-20' }], allocations: [{ ...allocated, allocated_on: '2026-10-01' }, { ...allocated, payment_id: 'future', amount: 1000, allocated_on: '2026-10-20' }] })
  expect(result).toMatchObject({ asOf: '2026-10-01', period: '2026-10', collectedRent: 8000, outstanding: 2000 })
})
it('never substitutes target asking rent for missing saved lease terms or a zero balance for a failed ledger', () => {
  const result = build({ tenancies: [{ ...tenancies[0], lease: {} }], financialAvailable: false })
  expect(result).toMatchObject({ expectedRent: null, collectedRent: null, outstanding: null, collectionRate: null, attentionCount: null, occupied: 1 })
})
it('returns real zeros for an empty property', () => {
  expect(buildRentalLandlordOverview({ now })).toMatchObject({ expectedRent: 0, collectedRent: 0, outstanding: 0, activeLeases: 0, occupied: 0, totalUnits: 0, collectionRate: null })
})
it('loads more than one API page without dropping financial records', async () => {
  const rows = Array.from({ length: 501 }, (_, id) => ({ id }))
  const result = await loadRentalOverviewRows(() => ({ order() { return this }, range: async (start, end) => ({ data: rows.slice(start, end + 1) }) }))
  expect(result).toEqual(rows)
})
it('keeps occupancy and lease totals when the financial API is unavailable', async () => {
  const result = await loadRentalLandlordOverview({ from() { throw new Error('Ledger unavailable') } }, 'org', units, tenancies)
  expect(result).toMatchObject({ expectedRent: 10000, occupied: 1, financialAvailable: false, collectedRent: null, outstanding: null })
})
