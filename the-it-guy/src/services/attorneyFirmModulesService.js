import {
  ATTORNEY_FIRM_MODULE_KEYS,
  ATTORNEY_FIRM_MODULE_REGISTRY,
  normalizeAttorneyFirmModuleKey,
  normalizeAttorneyFirmModuleStatus,
} from '../constants/attorneyFirmModules.js'
import { normalizeText, requireClient } from './attorneyFirmServiceShared.js'

function isMissingModuleFoundationError(error) {
  const code = String(error?.code || '').trim().toUpperCase()
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase()
  return (
    ['42P01', '42883', 'PGRST202', 'PGRST205'].includes(code) ||
    message.includes('get_attorney_firm_modules') ||
    message.includes('attorney_firm_modules') && (
      message.includes('does not exist') ||
      message.includes('could not find') ||
      message.includes('schema cache')
    )
  )
}

export function mapAttorneyFirmModuleRow(row = {}) {
  const moduleKey = normalizeAttorneyFirmModuleKey(row.module_key || row.moduleKey)
  if (!moduleKey) return null
  const status = normalizeAttorneyFirmModuleStatus(row.status)
  return {
    id: row.id || null,
    firmId: row.firm_id || row.firmId || null,
    moduleKey,
    status,
    activatedAt: row.activated_at || row.activatedAt || null,
    deactivatedAt: row.deactivated_at || row.deactivatedAt || null,
    changedBy: row.changed_by || row.changedBy || null,
    createdAt: row.created_at || row.createdAt || null,
    updatedAt: row.updated_at || row.updatedAt || null,
    openMatterCount: Math.max(0, Number(row.open_matter_count ?? row.openMatterCount ?? 0) || 0),
    definition: ATTORNEY_FIRM_MODULE_REGISTRY[moduleKey],
  }
}

export function mapAttorneyFirmModuleHistoryRow(row = {}) {
  const moduleKey = normalizeAttorneyFirmModuleKey(row.module_key || row.moduleKey)
  if (!moduleKey) return null
  return {
    id: row.id || null,
    firmId: row.firm_id || row.firmId || null,
    moduleKey,
    previousStatus: normalizeAttorneyFirmModuleStatus(row.previous_status || row.previousStatus, ''),
    newStatus: normalizeAttorneyFirmModuleStatus(row.new_status || row.newStatus),
    openMatterCount: Math.max(0, Number(row.open_matter_count ?? row.openMatterCount ?? 0) || 0),
    changedBy: row.changed_by || row.changedBy || null,
    changedByName: normalizeText(row.changed_by_name || row.changedByName) || 'Firm administrator',
    changeSource: normalizeText(row.change_source || row.changeSource) || 'firm_settings',
    changedAt: row.changed_at || row.changedAt || null,
    definition: ATTORNEY_FIRM_MODULE_REGISTRY[moduleKey],
  }
}

export function mapAttorneyFirmModuleLifecycleRow(row = {}) {
  const moduleKey = normalizeAttorneyFirmModuleKey(row.module_key || row.moduleKey)
  if (!moduleKey) return null
  return {
    moduleKey,
    status: normalizeAttorneyFirmModuleStatus(row.status),
    openMatterCount: Math.max(0, Number(row.open_matter_count ?? row.openMatterCount ?? 0) || 0),
    acceptsNewWork: Boolean(row.accepts_new_work ?? row.acceptsNewWork),
    isOperational: Boolean(row.is_operational ?? row.isOperational),
    readyToDeactivate: Boolean(row.ready_to_deactivate ?? row.readyToDeactivate),
    lastTransitionAt: row.last_transition_at || row.lastTransitionAt || null,
    definition: ATTORNEY_FIRM_MODULE_REGISTRY[moduleKey],
  }
}

function countValue(value) {
  return Math.max(0, Number(value) || 0)
}

export function mapAttorneyFirmModulesLaunchReadiness(payload = {}) {
  const row = Array.isArray(payload) ? payload[0] || {} : payload || {}
  return {
    status: normalizeText(row.status).toUpperCase() || 'BLOCKED',
    assessedAt: row.assessedAt || row.assessed_at || null,
    releaseReady: row.releaseReady === true || row.release_ready === true,
    strictReleaseReady: row.strictReleaseReady === true || row.strict_release_ready === true,
    mutatedData: row.mutatedData === true || row.mutated_data === true,
    moduleCount: countValue(row.moduleCount ?? row.module_count),
    expectedModuleCount: countValue(row.expectedModuleCount ?? row.expected_module_count ?? 3),
    activeCount: countValue(row.activeCount ?? row.active_count),
    windingDownCount: countValue(row.windingDownCount ?? row.winding_down_count),
    inactiveCount: countValue(row.inactiveCount ?? row.inactive_count),
    readyToDeactivateCount: countValue(row.readyToDeactivateCount ?? row.ready_to_deactivate_count),
    inactiveWithOpenMattersCount: countValue(row.inactiveWithOpenMattersCount ?? row.inactive_with_open_matters_count),
    historyGapCount: countValue(row.historyGapCount ?? row.history_gap_count),
    writeGuardInstalled: row.writeGuardInstalled === true || row.write_guard_installed === true,
    publicIntakeGuardInstalled: row.publicIntakeGuardInstalled === true || row.public_intake_guard_installed === true,
    lifecycleHistoryInstalled: row.lifecycleHistoryInstalled === true || row.lifecycle_history_installed === true,
    issueCodes: Array.isArray(row.issueCodes || row.issue_codes) ? row.issueCodes || row.issue_codes : [],
  }
}

export function mapAttorneyFirmModulesLaunchMetrics(payload = {}) {
  const row = Array.isArray(payload) ? payload[0] || {} : payload || {}
  const activity = row.activity || {}
  const currentState = row.currentState || row.current_state || {}
  return {
    status: normalizeText(row.status).toUpperCase() || 'BLOCKED',
    checkedAt: row.checkedAt || row.checked_at || null,
    windowHours: countValue(row.windowHours ?? row.window_hours),
    windowStartedAt: row.windowStartedAt || row.window_started_at || null,
    mutatedData: row.mutatedData === true || row.mutated_data === true,
    readiness: mapAttorneyFirmModulesLaunchReadiness(row.readiness || {}),
    currentState: {
      active: countValue(currentState.active),
      windingDown: countValue(currentState.windingDown ?? currentState.winding_down),
      inactive: countValue(currentState.inactive),
    },
    activity: {
      transitions: countValue(activity.transitions),
      activations: countValue(activity.activations),
      reactivations: countValue(activity.reactivations),
      windDownsStarted: countValue(activity.windDownsStarted ?? activity.wind_downs_started),
      deactivations: countValue(activity.deactivations),
      baselineRecords: countValue(activity.baselineRecords ?? activity.baseline_records),
    },
  }
}

export function buildDefaultAttorneyFirmModules(firmId = '') {
  const normalizedFirmId = normalizeText(firmId) || null
  return ATTORNEY_FIRM_MODULE_KEYS.map((moduleKey) => mapAttorneyFirmModuleRow({
    firm_id: normalizedFirmId,
    module_key: moduleKey,
    status: 'active',
  }))
}

export function resolveAttorneyFirmModuleCapabilities(rows = [], { firmId = '' } = {}) {
  const suppliedByKey = (Array.isArray(rows) ? rows : []).reduce((result, row) => {
    const mapped = mapAttorneyFirmModuleRow(row)
    if (mapped) result[mapped.moduleKey] = mapped
    return result
  }, {})
  const defaultsByKey = Object.fromEntries(
    buildDefaultAttorneyFirmModules(firmId).map((module) => [module.moduleKey, module]),
  )

  // Missing rows default to active only for the Phase 1 rolling-deployment
  // window. The database trigger and backfill make the persisted state explicit.
  const modules = ATTORNEY_FIRM_MODULE_KEYS.map((moduleKey) => (
    suppliedByKey[moduleKey] || defaultsByKey[moduleKey]
  ))
  const byKey = Object.fromEntries(modules.map((module) => [module.moduleKey, module]))
  const operationalModules = modules
    .filter((module) => ['active', 'winding_down'].includes(module.status))
    .map((module) => module.moduleKey)
  const activeModules = modules
    .filter((module) => module.status === 'active')
    .map((module) => module.moduleKey)
  const acceptsNewWork = Object.fromEntries(modules.map((module) => [module.moduleKey, module.status === 'active']))
  const isOperational = Object.fromEntries(modules.map((module) => [
    module.moduleKey,
    ['active', 'winding_down'].includes(module.status),
  ]))

  return {
    firmId: normalizeText(firmId) || modules.find((module) => module.firmId)?.firmId || null,
    modules,
    byKey,
    activeModules,
    operationalModules,
    enabledModules: operationalModules,
    inactiveModules: modules.filter((module) => module.status === 'inactive').map((module) => module.moduleKey),
    acceptsNewWork,
    acceptsNewMatter: acceptsNewWork,
    isOperational,
    canAcceptNewWork: (moduleKey) => Boolean(acceptsNewWork[normalizeAttorneyFirmModuleKey(moduleKey)]),
  }
}

export async function getAttorneyFirmModules(firmId, { client = null } = {}) {
  const normalizedFirmId = normalizeText(firmId)
  if (!normalizedFirmId) throw new Error('Firm id is required.')
  const db = client || requireClient()
  const result = await db.rpc('get_attorney_firm_modules', { p_firm_id: normalizedFirmId })

  if (result.error) {
    if (isMissingModuleFoundationError(result.error)) {
      return buildDefaultAttorneyFirmModules(normalizedFirmId)
    }
    throw result.error
  }

  const modules = (result.data || []).map(mapAttorneyFirmModuleRow).filter(Boolean)
  return modules.length ? modules : buildDefaultAttorneyFirmModules(normalizedFirmId)
}

export async function getAttorneyFirmModuleCapabilities(firmId, options = {}) {
  const modules = await getAttorneyFirmModules(firmId, options)
  return resolveAttorneyFirmModuleCapabilities(modules, { firmId })
}

export async function getAttorneyFirmModuleOverview(firmId, { client = null } = {}) {
  const normalizedFirmId = normalizeText(firmId)
  if (!normalizedFirmId) throw new Error('Firm id is required.')
  const db = client || requireClient()
  const result = await db.rpc('get_attorney_firm_module_overview', { p_firm_id: normalizedFirmId })

  if (result.error) {
    if (isMissingModuleFoundationError(result.error)) {
      return getAttorneyFirmModules(normalizedFirmId, { client: db })
    }
    throw result.error
  }

  const modules = (result.data || []).map(mapAttorneyFirmModuleRow).filter(Boolean)
  return modules.length ? modules : buildDefaultAttorneyFirmModules(normalizedFirmId)
}

export async function getAttorneyFirmModuleHistory(firmId, { client = null, limit = 20 } = {}) {
  const normalizedFirmId = normalizeText(firmId)
  if (!normalizedFirmId) throw new Error('Firm id is required.')
  const db = client || requireClient()
  const result = await db.rpc('get_attorney_firm_module_history', {
    p_firm_id: normalizedFirmId,
    p_limit: Math.min(Math.max(Number(limit) || 20, 1), 100),
  })
  if (result.error) {
    if (isMissingModuleFoundationError(result.error)) return []
    throw result.error
  }
  return (result.data || []).map(mapAttorneyFirmModuleHistoryRow).filter(Boolean)
}

export async function getAttorneyFirmModuleLifecycleAssurance(firmId, { client = null } = {}) {
  const normalizedFirmId = normalizeText(firmId)
  if (!normalizedFirmId) throw new Error('Firm id is required.')
  const db = client || requireClient()
  const result = await db.rpc('get_attorney_firm_module_lifecycle_assurance', {
    p_firm_id: normalizedFirmId,
  })
  if (result.error) {
    if (isMissingModuleFoundationError(result.error)) return []
    throw result.error
  }
  return (result.data || []).map(mapAttorneyFirmModuleLifecycleRow).filter(Boolean)
}

export async function getAttorneyFirmModulesLaunchReadiness(firmId, { client = null } = {}) {
  const normalizedFirmId = normalizeText(firmId)
  if (!normalizedFirmId) throw new Error('Firm id is required.')
  const db = client || requireClient()
  const result = await db.rpc('get_attorney_firm_modules_launch_readiness', {
    p_firm_id: normalizedFirmId,
  })
  if (result.error) throw result.error
  return mapAttorneyFirmModulesLaunchReadiness(result.data)
}

export async function getAttorneyFirmModulesLaunchMetrics(firmId, { client = null, windowHours = 24 } = {}) {
  const normalizedFirmId = normalizeText(firmId)
  const requestedWindow = Number(windowHours)
  if (!normalizedFirmId) throw new Error('Firm id is required.')
  if (!Number.isInteger(requestedWindow) || requestedWindow < 1 || requestedWindow > 168) {
    throw new Error('Launch telemetry window must be between 1 and 168 hours.')
  }
  const db = client || requireClient()
  const result = await db.rpc('get_attorney_firm_modules_launch_metrics', {
    p_firm_id: normalizedFirmId,
    p_window_hours: requestedWindow,
  })
  if (result.error) throw result.error
  return mapAttorneyFirmModulesLaunchMetrics(result.data)
}

export async function setAttorneyFirmModuleStatus(firmId, moduleKey, status, { client = null } = {}) {
  const normalizedFirmId = normalizeText(firmId)
  const normalizedModuleKey = normalizeAttorneyFirmModuleKey(moduleKey)
  const normalizedStatus = normalizeAttorneyFirmModuleStatus(status, '')
  if (!normalizedFirmId) throw new Error('Firm id is required.')
  if (!normalizedModuleKey) throw new Error('Choose a valid attorney module.')
  if (!normalizedStatus) throw new Error('Choose a valid attorney module status.')

  const db = client || requireClient()
  const result = await db.rpc('set_attorney_firm_module_status', {
    p_firm_id: normalizedFirmId,
    p_module_key: normalizedModuleKey,
    p_status: normalizedStatus,
  })
  if (result.error) throw result.error
  const row = Array.isArray(result.data) ? result.data[0] : result.data
  return mapAttorneyFirmModuleRow(row)
}

export async function attorneyFirmModuleAcceptsNewWork(firmId, moduleKey, { client = null } = {}) {
  const normalizedFirmId = normalizeText(firmId)
  const normalizedModuleKey = normalizeAttorneyFirmModuleKey(moduleKey)
  if (!normalizedFirmId) throw new Error('Firm id is required.')
  if (!normalizedModuleKey) throw new Error('Choose a valid attorney module.')

  const db = client || requireClient()
  const result = await db.rpc('attorney_firm_module_accepts_new_work', {
    p_firm_id: normalizedFirmId,
    p_module_key: normalizedModuleKey,
  })
  if (result.error) {
    if (isMissingModuleFoundationError(result.error)) return true
    throw result.error
  }
  return Boolean(result.data)
}
