import { normalizeAttorneyFirmModuleKey } from '../constants/attorneyFirmModules.js'

const LEAD_SERVICE_MODULES = Object.freeze({
  transfer_quote: 'transfer',
  property_transfer: 'transfer',
  bond_registration: 'bond',
  bond_cancellation: 'cancellation',
})

export function getAttorneyModuleKeyForLeadService(serviceType) {
  return LEAD_SERVICE_MODULES[String(serviceType || '').trim().toLowerCase()] || ''
}

export function filterAttorneyLeadServiceOptions(options = [], canCreateMatter = () => false) {
  return (Array.isArray(options) ? options : []).filter(([serviceType]) => {
    const moduleKey = getAttorneyModuleKeyForLeadService(serviceType)
    return !moduleKey || canCreateMatter(moduleKey)
  })
}

export function getCreatableAttorneyMatterTypes(canCreateMatter = () => false) {
  return ['transfer', 'bond', 'cancellation'].filter((moduleKey) => canCreateMatter(moduleKey))
}

export function assertAttorneyModuleAcceptsNewWork(moduleKey, canCreateMatter, actionLabel = 'create this Matter') {
  const normalizedModuleKey = normalizeAttorneyFirmModuleKey(moduleKey)
  if (!normalizedModuleKey || typeof canCreateMatter !== 'function' || !canCreateMatter(normalizedModuleKey)) {
    const error = new Error(`This firm is not currently accepting new ${normalizedModuleKey || 'attorney'} work.`)
    error.code = 'ATTORNEY_MODULE_NOT_ACCEPTING_NEW_WORK'
    error.actionLabel = actionLabel
    error.moduleKey = normalizedModuleKey
    throw error
  }
  return normalizedModuleKey
}

