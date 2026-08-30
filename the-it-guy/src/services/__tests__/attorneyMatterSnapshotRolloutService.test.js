import { describe, expect, it, vi } from 'vitest'

import {
  getAttorneyMatterSnapshotRolloutStatus,
  resolveAttorneyMatterSnapshotEnvironment,
} from '../attorneyMatterSnapshotRolloutService'

const firmId = '11111111-1111-4111-8111-111111111111'

describe('attorney matter snapshot controlled rollout', () => {
  it('normalises deployment environments', () => {
    expect(resolveAttorneyMatterSnapshotEnvironment({ VITE_VERCEL_ENV: 'production' })).toBe('production')
    expect(resolveAttorneyMatterSnapshotEnvironment({ VITE_APP_ENV: 'staging' })).toBe('staging')
    expect(resolveAttorneyMatterSnapshotEnvironment({ MODE: 'test' })).toBe('development')
  })

  it('uses the server-evaluated firm cohort decision', async () => {
    const rpc = vi.fn(async () => ({
      data: { enabled: true, environment: 'staging', reason: 'percentage_cohort', rolloutPercentage: 100 },
      error: null,
    }))

    await expect(getAttorneyMatterSnapshotRolloutStatus(firmId, { client: { rpc }, environment: 'staging' }))
      .resolves.toMatchObject({ enabled: true, environment: 'staging' })
    expect(rpc).toHaveBeenCalledWith('get_attorney_matter_snapshot_rollout_status', {
      p_attorney_firm_id: firmId,
      p_environment: 'staging',
    })
  })

  it('fails closed when rollout status cannot be read', async () => {
    const status = await getAttorneyMatterSnapshotRolloutStatus(firmId, {
      environment: 'production',
      client: { rpc: vi.fn(async () => ({ data: null, error: new Error('function missing') })) },
    })
    expect(status).toMatchObject({ enabled: false, environment: 'production', reason: 'rollout_status_unavailable' })
  })
})
