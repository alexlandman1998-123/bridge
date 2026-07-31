const DEFAULT_DASHBOARD_AGGREGATE_ROLES = ['developer']
const DEFAULT_DASHBOARD_LAZY_PANEL_ROLES = ['developer']
const DEFAULT_DASHBOARD_ROLLUP_REFRESH_ROLES = ['developer']

const TRUTHY_VALUES = new Set(['1', 'true', 'yes', 'on', 'enabled'])
const FALSY_VALUES = new Set(['0', 'false', 'no', 'off', 'disabled'])

function readEnvValue(key) {
  return String(import.meta.env?.[key] ?? '').trim()
}

function readBooleanEnv(key, fallback) {
  const value = readEnvValue(key).toLowerCase()
  if (!value) return fallback
  if (TRUTHY_VALUES.has(value)) return true
  if (FALSY_VALUES.has(value)) return false
  return fallback
}

function parseRoleList(key, fallbackRoles) {
  const value = readEnvValue(key)
  if (!value) return new Set(fallbackRoles)
  return new Set(
    value
      .split(',')
      .map((role) => role.trim().toLowerCase())
      .filter(Boolean),
  )
}

function normalizeRole(role) {
  return String(role || '').trim().toLowerCase()
}

function roleIsEnabled(enabledRoles, role) {
  return enabledRoles.has('*') || enabledRoles.has(role)
}

export function getDashboardHydrationRollout(role) {
  const normalizedRole = normalizeRole(role)
  const aggregateRoles = parseRoleList(
    'VITE_DASHBOARD_AGGREGATE_ROLLOUT_ROLES',
    DEFAULT_DASHBOARD_AGGREGATE_ROLES,
  )
  const lazyPanelRoles = parseRoleList(
    'VITE_DASHBOARD_LAZY_PANEL_ROLLOUT_ROLES',
    DEFAULT_DASHBOARD_LAZY_PANEL_ROLES,
  )
  const rollupRefreshRoles = parseRoleList(
    'VITE_DASHBOARD_ROLLUP_REFRESH_ROLLOUT_ROLES',
    DEFAULT_DASHBOARD_ROLLUP_REFRESH_ROLES,
  )

  return Object.freeze({
    role: normalizedRole,
    aggregateEnabled:
      readBooleanEnv('VITE_DASHBOARD_AGGREGATES_ENABLED', true) &&
      roleIsEnabled(aggregateRoles, normalizedRole),
    lazyPanelsEnabled:
      readBooleanEnv('VITE_DASHBOARD_LAZY_PANELS_ENABLED', true) &&
      roleIsEnabled(lazyPanelRoles, normalizedRole),
    rollupRefreshEnabled:
      readBooleanEnv('VITE_DASHBOARD_ROLLUP_REFRESH_ENABLED', false) &&
      roleIsEnabled(rollupRefreshRoles, normalizedRole),
  })
}
