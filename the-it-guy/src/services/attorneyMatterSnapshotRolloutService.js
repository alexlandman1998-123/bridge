import { normalizeText, requireClient } from './attorneyFirmServiceShared'

const DEVELOPMENT_ENVIRONMENTS = new Set(['development', 'test'])

export function resolveAttorneyMatterSnapshotEnvironment(env = import.meta.env) {
  const explicit = String(env?.VITE_VERCEL_ENV || env?.VITE_APP_ENV || env?.VITE_DEPLOY_ENV || '').trim().toLowerCase()
  const raw = explicit || (env?.PROD === true ? 'production' : env?.MODE || 'development')
  if (raw === 'production') return 'production'
  if (raw === 'staging') return 'staging'
  if (raw === 'preview') return 'preview'
  return 'development'
}

export function disabledAttorneyMatterSnapshotRollout(environment, reason = 'rollout_unavailable') {
  return {
    enabled: false,
    environment,
    reason,
    rolloutPercentage: 0,
  }
}

export async function getAttorneyMatterSnapshotRolloutStatus(firmId, options = {}) {
  const environment = options.environment || resolveAttorneyMatterSnapshotEnvironment()
  const normalizedFirmId = normalizeText(firmId)
  if (!normalizedFirmId) return disabledAttorneyMatterSnapshotRollout(environment, 'firm_required')

  const client = options.client || requireClient()
  if (typeof client.rpc !== 'function') {
    return {
      enabled: DEVELOPMENT_ENVIRONMENTS.has(environment),
      environment,
      reason: 'local_client_fallback',
      rolloutPercentage: DEVELOPMENT_ENVIRONMENTS.has(environment) ? 100 : 0,
    }
  }

  const result = await client.rpc('get_attorney_matter_snapshot_rollout_status', {
    p_attorney_firm_id: normalizedFirmId,
    p_environment: environment,
  })
  if (result.error) {
    return disabledAttorneyMatterSnapshotRollout(environment, 'rollout_status_unavailable')
  }
  return result.data || disabledAttorneyMatterSnapshotRollout(environment, 'empty_decision')
}
