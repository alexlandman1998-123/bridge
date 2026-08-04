export const ATTORNEY_MODULE_KEYS = Object.freeze({
  transfer: 'transfer',
  bond: 'bond',
  cancellation: 'cancellation',
})

export const DEFAULT_ATTORNEY_MODULE_SETTINGS = Object.freeze({
  [ATTORNEY_MODULE_KEYS.transfer]: true,
  [ATTORNEY_MODULE_KEYS.bond]: true,
  [ATTORNEY_MODULE_KEYS.cancellation]: true,
})

export const ATTORNEY_MODULE_DEFINITIONS = Object.freeze([
  {
    key: ATTORNEY_MODULE_KEYS.bond,
    title: 'Bond Registration',
    description: 'Show bond matter workspaces, queues, and registration workflows for this firm.',
  },
  {
    key: ATTORNEY_MODULE_KEYS.cancellation,
    title: 'Bond Cancellation',
    description: 'Show cancellation matter workspaces, queues, and related release workflows for this firm.',
  },
])

function normalizeText(value) {
  return String(value || '').trim().toLowerCase()
}

export function normalizeAttorneyModuleKey(value) {
  const normalized = normalizeText(value).replace(/[\s-]+/g, '_')
  if (!normalized) return ''
  if (['bond', 'bond_attorney', 'bond_registration', 'bond_registrations', 'attorney_bond'].includes(normalized)) return ATTORNEY_MODULE_KEYS.bond
  if (['cancellation', 'bond_cancellation', 'bond_cancellations', 'cancellation_attorney', 'attorney_cancellation'].includes(normalized)) return ATTORNEY_MODULE_KEYS.cancellation
  if (['transfer', 'transfer_attorney', 'transferring_attorney', 'attorney_transfer', 'conveyancing'].includes(normalized)) return ATTORNEY_MODULE_KEYS.transfer
  return normalized
}

function readBoolean(value, fallback = true) {
  if (value === false || value === 'false' || value === 0 || value === '0') return false
  if (value === true || value === 'true' || value === 1 || value === '1') return true
  return fallback
}

export function resolveAttorneyModuleSettings(settings = {}) {
  const attorneyModules = settings?.attorneyModules && typeof settings.attorneyModules === 'object' ? settings.attorneyModules : {}
  const enabledModules = settings?.enabledModules && typeof settings.enabledModules === 'object' ? settings.enabledModules : {}
  return {
    ...DEFAULT_ATTORNEY_MODULE_SETTINGS,
    [ATTORNEY_MODULE_KEYS.transfer]: readBoolean(
      attorneyModules.transfer ?? settings?.transfer ?? enabledModules.attorney_transfer ?? enabledModules.attorneyTransfer,
      DEFAULT_ATTORNEY_MODULE_SETTINGS.transfer,
    ),
    [ATTORNEY_MODULE_KEYS.bond]: readBoolean(
      attorneyModules.bond ?? settings?.bond ?? enabledModules.attorney_bond ?? enabledModules.attorneyBond ?? enabledModules.bond_attorney,
      DEFAULT_ATTORNEY_MODULE_SETTINGS.bond,
    ),
    [ATTORNEY_MODULE_KEYS.cancellation]: readBoolean(
      attorneyModules.cancellation ?? settings?.cancellation ?? enabledModules.attorney_cancellation ?? enabledModules.attorneyCancellation ?? enabledModules.bond_cancellation,
      DEFAULT_ATTORNEY_MODULE_SETTINGS.cancellation,
    ),
  }
}

export function buildAttorneyModuleSettingsPatch(settings = {}, modules = {}) {
  const nextModules = resolveAttorneyModuleSettings({
    attorneyModules: {
      ...resolveAttorneyModuleSettings(settings),
      ...modules,
    },
  })
  return {
    ...settings,
    attorneyModules: nextModules,
    enabledModules: {
      ...(settings?.enabledModules && typeof settings.enabledModules === 'object' ? settings.enabledModules : {}),
      attorney_transfer: nextModules.transfer,
      attorney_bond: nextModules.bond,
      attorney_cancellation: nextModules.cancellation,
    },
  }
}

export function isAttorneyModuleEnabled(moduleKey, settings = {}) {
  const normalized = normalizeAttorneyModuleKey(moduleKey)
  if (!normalized || normalized === 'all' || normalized === 'active' || normalized === 'development') return true
  return resolveAttorneyModuleSettings(settings)[normalized] !== false
}

export function isAttorneyMatterViewEnabled(viewKey, settings = {}) {
  return isAttorneyModuleEnabled(viewKey, settings)
}

export function filterAttorneyModuleNavigationItems(items = [], settings = {}) {
  const modules = resolveAttorneyModuleSettings(settings)
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      if (!item) return null
      const childItems = Array.isArray(item.children)
        ? filterAttorneyModuleNavigationItems(item.children, modules)
        : undefined
      const moduleKey = item.moduleKey || (item.key === 'attorney_matters_bond' ? 'bond' : item.key === 'attorney_matters_cancellation' ? 'cancellation' : '')
      if (moduleKey && !isAttorneyModuleEnabled(moduleKey, modules)) return null
      return childItems ? { ...item, children: childItems } : item
    })
    .filter(Boolean)
}
