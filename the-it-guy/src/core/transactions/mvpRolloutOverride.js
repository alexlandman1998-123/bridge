export const MVP_ROLLOUT_OVERRIDE_VERSION = 'arch9_mvp_rollout_override_v1'

const normalize = (value) => String(value || '').trim()

export function createMvpRolloutOverride({ operatorId = '', reason = '', expiresAt = '', breaches = [] } = {}) {
  const actor = normalize(operatorId)
  const explanation = normalize(reason)
  const expiry = new Date(expiresAt)
  if (!actor) throw Object.assign(new Error('An operator is required for a rollout override.'), { code: 'mvp_rollout_override_operator_required' })
  if (!explanation) throw Object.assign(new Error('A reason is required for a rollout override.'), { code: 'mvp_rollout_override_reason_required' })
  if (Number.isNaN(expiry.getTime()) || expiry <= new Date()) throw Object.assign(new Error('A future override expiry is required.'), { code: 'mvp_rollout_override_expiry_required' })
  return Object.freeze({ version: MVP_ROLLOUT_OVERRIDE_VERSION, operatorId: actor, reason: explanation, expiresAt: expiry.toISOString(), breaches: [...new Set(breaches)], status: 'active' })
}

export function isMvpRolloutOverrideActive(override = {}, now = new Date()) {
  return override?.status === 'active' && new Date(override.expiresAt).getTime() > new Date(now).getTime()
}
