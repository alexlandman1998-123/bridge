import { expect, it } from 'vitest'
import { tenancyProgress, tenancyRegisterRow } from '../rentalTenancyRegisterModel'
it('derives lifecycle progress from persisted tenancy and signature states', () => {
  expect(tenancyProgress({ status: 'draft', lease: { status: 'draft' } }).stage).toBe(0)
  expect(tenancyProgress({ status: 'draft', lease: { status: 'awaiting_tenant' } }).stage).toBe(1)
  expect(tenancyProgress({ status: 'move_in_pending' }).stage).toBe(2)
  expect(tenancyProgress({ status: 'active' }).stage).toBe(3)
  expect(tenancyProgress({ status: 'notice_given' }).stage).toBe(4)
  expect(tenancyProgress({ status: 'move_out_pending' }).stage).toBe(4)
  expect(tenancyProgress({ status: 'closed' }).stage).toBe(5)
})
it('uses the current lease version rather than superseded terms or identifiers for display', () => {
  const row = tenancyRegisterRow({ id: 'tenancy-1', tenant: { identity: { firstName: 'Alex', lastName: 'Tenant' } }, lease: { terms_json: { monthly_rent: 5000 }, rental_lease_versions: [{ is_current: false, monthly_rent: 6000 }, { is_current: true, monthly_rent: 7500, effective_end_date: '2027-10-01' }] } }, { name: 'Harbour View', address: { city: 'Cape Town' } }, { unitLabel: '302' })
  expect(row.monthlyRent).toBe(7500)
  expect(row.endDate).toBe('2027-10-01')
  expect(row.tenantName).toBe('Alex Tenant')
  expect(row.propertyName).toBe('Harbour View')
  expect(row.unitLabel).toBe('302')
})
it('keeps missing rent and dates unknown and supports older lease records', () => {
  expect(tenancyRegisterRow({ status: 'draft' }).monthlyRent).toBeUndefined()
  expect(tenancyRegisterRow({ lease: { terms_json: { monthly_rent: 6500, end_date: '2027-01-01' } } }).monthlyRent).toBe(6500)
})

it('uses the landlord on the current lease and keeps missing landlord identity explicit', () => {
  const tenancy = { lease: { rental_lease_versions: [{ is_current: false, rental_lease_signers: [{ signer_role: 'landlord', signer_name: 'Previous owner' }] }, { is_current: true, rental_lease_signers: [{ signer_role: 'landlord', signer_name: 'Current owner' }] }] } }
  expect(tenancyRegisterRow(tenancy).landlordName).toBe('Current owner')
  expect(tenancyRegisterRow({}).landlordName).toBe('Landlord not captured')
})
