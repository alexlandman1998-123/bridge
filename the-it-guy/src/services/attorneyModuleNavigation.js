import { normalizeAttorneyFirmModuleKey } from '../constants/attorneyFirmModules.js'

export const ATTORNEY_GENERAL_MATTER_VIEW_KEYS = Object.freeze([
  'all',
  'active',
  'registered',
  'archived',
  'shared',
  'delayed',
  'development',
])

const GENERAL_VIEW_KEYS = new Set(ATTORNEY_GENERAL_MATTER_VIEW_KEYS)

export function getAttorneyMatterViewModuleKey(viewKey) {
  return normalizeAttorneyFirmModuleKey(viewKey)
}

export function canAccessAttorneyMatterView(viewKey, canViewModule) {
  const normalizedView = String(viewKey || 'all').trim().toLowerCase()
  if (GENERAL_VIEW_KEYS.has(normalizedView)) return true
  if (normalizedView === 'full-service') {
    return Boolean(
      canViewModule?.('transfer') &&
      canViewModule?.('bond') &&
      canViewModule?.('cancellation')
    )
  }

  const moduleKey = getAttorneyMatterViewModuleKey(normalizedView)
  if (!moduleKey) return false
  return typeof canViewModule === 'function' && canViewModule(moduleKey)
}

function canViewRequiredModules(item, canViewModule) {
  const moduleKey = normalizeAttorneyFirmModuleKey(item?.moduleKey || item?.value || item?.key)
  if (moduleKey) return Boolean(canViewModule(moduleKey))

  const requiredModules = Array.isArray(item?.moduleKeys)
    ? item.moduleKeys.map((key) => normalizeAttorneyFirmModuleKey(key)).filter(Boolean)
    : []
  if (!requiredModules.length) return true

  const mode = item.moduleMatch === 'any' ? 'any' : 'all'
  return mode === 'any'
    ? requiredModules.some((key) => canViewModule(key))
    : requiredModules.every((key) => canViewModule(key))
}

export function filterAttorneyModuleItems(items = [], canViewModule = () => false) {
  return (Array.isArray(items) ? items : []).flatMap((item) => {
    if (!canViewRequiredModules(item, canViewModule)) return []

    const nextItem = Array.isArray(item.children)
      ? { ...item, children: filterAttorneyModuleItems(item.children, canViewModule) }
      : item
    return [nextItem]
  })
}
