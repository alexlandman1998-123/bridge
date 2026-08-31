import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  client: null,
}))

vi.mock('../../services/attorneyFirmServiceShared', () => ({
  getAuthenticatedUser: vi.fn(async () => ({
    id: '4975bf70-b92c-46c8-8b35-5244823e5a59',
  })),
  isMissingTableError: vi.fn(() => false),
  normalizeText: (value = '') => String(value || '').trim(),
  requireClient: () => mocks.client,
}))

import { canAccessAttorneyMatter } from '../attorneyPermissions.js'

beforeEach(() => {
  mocks.client = {
    rpc: vi.fn(async () => ({ data: true, error: null })),
    from: vi.fn(() => {
      throw new Error('Canonical organisation access should not fall through to browser-side membership queries.')
    }),
  }
})

describe('canonical attorney matter access', () => {
  it('opens the matter when the database grants the assigned organisation access', async () => {
    await expect(canAccessAttorneyMatter(
      '3b53b01f-9f89-4e0c-9912-77bce2ac7f69',
      '37f3adfa-5f63-45af-95cf-9acb5037b38e',
      null,
      { membership: null },
    )).resolves.toBe(true)

    expect(mocks.client.rpc).toHaveBeenCalledWith('bridge_can_access_transaction_spine', {
      target_transaction_id: '3b53b01f-9f89-4e0c-9912-77bce2ac7f69',
    })
  })
})
