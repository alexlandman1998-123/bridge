const PAUSED_VALUES = new Set(['1', 'true', 'yes', 'on'])
const UNPAUSED_VALUES = new Set(['0', 'false', 'no', 'off'])

function readRuntimeEnvironment() {
  return import.meta.env || {}
}

function parseBoolean(value) {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (PAUSED_VALUES.has(normalized)) return true
  if (UNPAUSED_VALUES.has(normalized)) return false
  return null
}

function isProductionEnvironment(env = {}) {
  const mode = String(env.VITE_APP_ENV || env.MODE || '').trim().toLowerCase()
  return env.PROD === true || ['production', 'prod'].includes(mode)
}

/**
 * New creation is fail-closed in production while the controlled-pilot hold is
 * active. Set VITE_MVP_PILOT_CREATION_PAUSED=false only after the release gate
 * has explicitly cleared the pilot.
 */
export function resolveMvpPilotCreationFreeze(env = readRuntimeEnvironment()) {
  const configured = parseBoolean(env.VITE_MVP_PILOT_CREATION_PAUSED)
  const paused = configured === null ? isProductionEnvironment(env) : configured

  return {
    paused,
    code: 'mvp_pilot_creation_paused',
    message: 'New listings and transactions are temporarily paused while the controlled-pilot release issue is being resolved. Existing records remain available to review.',
    source: configured === null ? 'production_fail_closed_default' : 'explicit_configuration',
  }
}

export function isMvpPilotCreationPaused(env) {
  return resolveMvpPilotCreationFreeze(env).paused
}

export function assertMvpPilotCreationAllowed({ operation = 'create a new record', env } = {}) {
  const freeze = resolveMvpPilotCreationFreeze(env)
  if (!freeze.paused) return freeze

  const error = new Error(`${freeze.message} Unable to ${operation}.`)
  error.code = freeze.code
  error.pilotCreationFreeze = freeze
  throw error
}
