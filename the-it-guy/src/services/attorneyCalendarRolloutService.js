import { requireClient } from './attorneyFirmServiceShared'

const ENABLED_FALLBACK_ENVIRONMENTS = new Set(['development', 'test'])

export function resolveAttorneyCalendarEnvironment(env = import.meta.env) {
  const explicit = String(
    env?.VITE_VERCEL_ENV ||
    env?.VITE_APP_ENV ||
    env?.VITE_DEPLOY_ENV ||
    '',
  ).trim().toLowerCase()
  const raw = explicit || (env?.PROD === true ? 'production' : env?.MODE || 'development')

  if (raw === 'production') return 'production'
  if (raw === 'staging') return 'staging'
  if (raw === 'preview') return 'preview'
  return 'development'
}

export function buildAttorneyCalendarRolloutUnavailableError(status = {}) {
  const error = new Error(
    status.reason === 'outside_cohort'
      ? 'Create Invite is not enabled for this firm yet.'
      : 'Create Invite is temporarily unavailable while the attorney calendar rollout is paused.',
  )
  error.name = 'AttorneyCalendarRolloutError'
  error.code = 'ATTORNEY_CALENDAR_ROLLOUT_DISABLED'
  error.rollout = status
  return error
}

export async function getAttorneyCalendarRolloutStatus(organisationId, options = {}) {
  const environment = options.environment || resolveAttorneyCalendarEnvironment()
  const client = options.client || requireClient()

  if (!organisationId) {
    return { enabled: false, environment, reason: 'organisation_required', rolloutPercentage: 0 }
  }

  if (typeof client.rpc !== 'function') {
    return {
      enabled: ENABLED_FALLBACK_ENVIRONMENTS.has(environment),
      environment,
      reason: 'local_client_fallback',
      rolloutPercentage: ENABLED_FALLBACK_ENVIRONMENTS.has(environment) ? 100 : 0,
    }
  }

  const { data, error } = await client.rpc('get_attorney_calendar_rollout_status', {
    p_organisation_id: organisationId,
    p_environment: environment,
  })
  if (error) throw error
  return data || { enabled: false, environment, reason: 'empty_decision', rolloutPercentage: 0 }
}

export async function requireAttorneyCalendarRollout(organisationId, options = {}) {
  const status = await getAttorneyCalendarRolloutStatus(organisationId, options)
  if (!status.enabled) throw buildAttorneyCalendarRolloutUnavailableError(status)
  return status
}

export async function recordAttorneyCalendarRolloutEvent(eventType, payload = {}, options = {}) {
  const client = options.client || requireClient()
  if (typeof client.rpc !== 'function') return null

  const environment = options.environment || resolveAttorneyCalendarEnvironment()
  const { data, error } = await client.rpc('record_attorney_calendar_rollout_event', {
    p_environment: environment,
    p_organisation_id: payload.organisationId,
    p_transaction_id: payload.transactionId || null,
    p_appointment_id: payload.appointmentId || null,
    p_event_type: eventType,
    p_metadata: payload.metadata || {},
  })
  if (error && options.throwOnError) throw error
  return error ? null : data
}
