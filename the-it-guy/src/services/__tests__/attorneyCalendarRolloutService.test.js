import { describe, expect, it, vi } from 'vitest'

import {
  getAttorneyCalendarRolloutStatus,
  requireAttorneyCalendarRollout,
  resolveAttorneyCalendarEnvironment,
} from '../attorneyCalendarRolloutService'

const organisationId = '11111111-1111-4111-8111-111111111111'

describe('attorney calendar controlled rollout', () => {
  it('normalises deployment environments without exposing a server secret', () => {
    expect(resolveAttorneyCalendarEnvironment({ VITE_VERCEL_ENV: 'production' })).toBe('production')
    expect(resolveAttorneyCalendarEnvironment({ VITE_APP_ENV: 'staging' })).toBe('staging')
    expect(resolveAttorneyCalendarEnvironment({ MODE: 'test' })).toBe('development')
    expect(resolveAttorneyCalendarEnvironment({ MODE: 'production', PROD: true })).toBe('production')
  })

  it('returns the server-evaluated cohort decision', async () => {
    const rpc = vi.fn(async () => ({
      data: { enabled: true, environment: 'staging', reason: 'percentage_cohort', rolloutPercentage: 100 },
      error: null,
    }))

    const status = await getAttorneyCalendarRolloutStatus(organisationId, {
      client: { rpc },
      environment: 'staging',
    })

    expect(status.enabled).toBe(true)
    expect(rpc).toHaveBeenCalledWith('get_attorney_calendar_rollout_status', {
      p_organisation_id: organisationId,
      p_environment: 'staging',
    })
  })

  it('fails closed when production is disabled', async () => {
    const client = {
      rpc: vi.fn(async () => ({
        data: { enabled: false, environment: 'production', reason: 'rollout_disabled', rolloutPercentage: 0 },
        error: null,
      })),
    }

    await expect(requireAttorneyCalendarRollout(organisationId, { client, environment: 'production' }))
      .rejects.toMatchObject({
        code: 'ATTORNEY_CALENDAR_ROLLOUT_DISABLED',
        rollout: { environment: 'production', enabled: false },
      })
  })
})
