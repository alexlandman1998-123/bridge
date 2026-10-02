import { expect, it, vi } from 'vitest'
import { savePersistedRentalApplication } from '../rentalApplicationRepository.js'
it('saves the linked application with version and draft-status guards', async () => {
  const eq = vi.fn()
  const update = vi.fn()
  const query = { update, eq, select: () => query, maybeSingle: async () => ({ data: { id: 'app', status: 'draft', version: 3, application_data: { income: { monthlyIncome: 25000 }, identity: { firstName: 'Alex' } } } }) }
  update.mockReturnValue(query); eq.mockReturnValue(query)
  const result = await savePersistedRentalApplication({ id: 'app', status: 'draft', version: 2, data: { income: { monthlyIncome: 25000 } } }, { identity: { firstName: 'Alex' } }, { client: { from: () => query } })
  expect(update).toHaveBeenCalledWith({ application_data: { income: { monthlyIncome: 25000 }, identity: { firstName: 'Alex' } }, version: 3 })
  expect(eq.mock.calls).toEqual([['id', 'app'], ['version', 2], ['status', 'draft']])
  expect(result.data.identity.firstName).toBe('Alex')
})
it('rejects submitted applications and stale drafts without overwriting their data', async () => {
  const from = vi.fn()
  await expect(savePersistedRentalApplication({ status: 'submitted' }, {}, { client: { from } })).rejects.toThrow('Only draft')
  expect(from).not.toHaveBeenCalled()
  const query = { update: () => query, eq: () => query, select: () => query, maybeSingle: async () => ({ data: null }) }
  await expect(savePersistedRentalApplication({ id: 'app', status: 'draft', version: 2 }, {}, { client: { from: () => query } })).rejects.toThrow('Application changed elsewhere')
})
