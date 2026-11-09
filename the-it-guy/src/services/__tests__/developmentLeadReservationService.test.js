import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ notify: vi.fn() }))
vi.mock('../../lib/supabaseClient.js', () => ({ supabase: null }))
vi.mock('../developmentLeadRefreshService.js', () => ({ notifyDevelopmentLeadChange: mocks.notify }))
import { setDevelopmentLeadReservation } from '../developmentLeadReservationService.js'
const input = { developerLeadId: 'buyer', unitId: 'unit' }
const receipt = { ...input, reservationState: 'reserved', unitStatus: 'Reserved', developerOrgId: 'developer', sourceLeadId: 'canonical-buyer', sourceAgencyOrgId: 'agency' }
beforeEach(() => mocks.notify.mockReset())
it('saves buyer and stock with the atomic command and refreshes other readers only after a verified receipt', async () => {
  const rpc = vi.fn().mockResolvedValue({ data: receipt, error: null })
  expect(await setDevelopmentLeadReservation(input, { rpc })).toBe(receipt)
  expect(rpc).toHaveBeenCalledExactlyOnceWith('bridge_set_development_lead_reservation', { p_developer_lead_id: 'buyer', p_unit_id: 'unit', p_reserved: true })
  expect(mocks.notify).toHaveBeenCalledExactlyOnceWith(receipt, { stockChanged: true })
})
it('releases the same reservation without creating another lead or transaction', async () => {
  const data = { ...receipt, reservationState: 'none', unitStatus: 'Available' }
  const rpc = vi.fn().mockResolvedValue({ data })
  await setDevelopmentLeadReservation({ ...input, reserved: false }, { rpc })
  expect(rpc).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ p_reserved: false }))
  expect(mocks.notify).toHaveBeenCalledWith(data, { stockChanged: true })
})
it.each([{ error: Error('Unit no longer available') }, { data: { ...receipt, unitId: 'other' } }, { data: { ...receipt, reservationState: 'none' } }, { data: { ...receipt, unitStatus: 'Available' } }])('never announces success for a failed or mismatched save', async result => {
  await expect(setDevelopmentLeadReservation(input, { rpc: vi.fn().mockResolvedValue(result) })).rejects.toThrow()
  expect(mocks.notify).not.toHaveBeenCalled()
})
