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
      throw new Error('Known-firm access should not fall through to browser-side membership queries.')
    }),
  }
})

describe('attorney matter team access', () => {
  it('opens the matter when the database grants assigned-firm team access', async () => {
    await expect(canAccessAttorneyMatter(
      '3b53b01f-9f89-4e0c-9912-77bce2ac7f69',
      '37f3adfa-5f63-45af-95cf-9acb5037b38e',
      null,
      { membership: null },
    )).resolves.toBe(true)

    expect(mocks.client.rpc).toHaveBeenCalledWith('bridge_attorney_matter_team_access', {
      p_transaction_id: '3b53b01f-9f89-4e0c-9912-77bce2ac7f69',
      p_firm_id: '37f3adfa-5f63-45af-95cf-9acb5037b38e',
      p_capability: 'view',
    })
  })

  it('hides an allocated matter from a firm member outside its team', async () => {
    mocks.client.rpc.mockResolvedValue({ data: false, error: null })
    await expect(canAccessAttorneyMatter(
      '3b53b01f-9f89-4e0c-9912-77bce2ac7f69',
      '37f3adfa-5f63-45af-95cf-9acb5037b38e',
    )).resolves.toBe(false)
  })
})
