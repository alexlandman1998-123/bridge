import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ client: { rpc: vi.fn() } }))

vi.mock('../attorneyFirmServiceShared', () => ({ requireClient: () => mocks.client }))

import {
  getAttorneyMatterTeam,
  getAttorneyMatterTeamSummaries,
  saveAttorneyMatterTeam,
} from '../attorneyMatterTeamService'

beforeEach(() => {
  mocks.client.rpc.mockReset()
})

describe('attorney matter team service', () => {
  it('loads the visible page in batches and preserves empty teams', async () => {
    const ids = Array.from({ length: 101 }, (_, index) => `matter-${index}`)
    mocks.client.rpc.mockImplementation(async (_, { p_transaction_ids: batch }) => ({
      data: Object.fromEntries(batch.map((id) => [id, []])),
      error: null,
    }))

    const summaries = await getAttorneyMatterTeamSummaries([...ids, ids[0]])

    expect(mocks.client.rpc).toHaveBeenCalledTimes(2)
    expect(mocks.client.rpc.mock.calls[0][1].p_transaction_ids).toHaveLength(100)
    expect(Object.keys(summaries)).toHaveLength(101)
    expect(summaries[ids[0]]).toEqual([])
  })

  it('loads the roster for one matter when its selector opens', async () => {
    const team = { members: [], availableMembers: [{ userId: 'person-1' }], canManage: true }
    mocks.client.rpc.mockResolvedValue({ data: team, error: null })

    await expect(getAttorneyMatterTeam('matter-1')).resolves.toEqual(team)
    expect(mocks.client.rpc).toHaveBeenCalledWith('bridge_get_attorney_matter_team', {
      p_transaction_id: 'matter-1',
    })
  })

  it('persists multiple selected people without duplicates', async () => {
    mocks.client.rpc.mockResolvedValue({ data: { members: [{ userId: 'person-1' }, { userId: 'person-2' }] }, error: null })

    await saveAttorneyMatterTeam('matter-1', ['person-1', 'person-2', 'person-1'])

    expect(mocks.client.rpc).toHaveBeenCalledWith('bridge_set_attorney_matter_team', {
      p_transaction_id: 'matter-1',
      p_user_ids: ['person-1', 'person-2'],
    })
  })
})
