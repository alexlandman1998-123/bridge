export const ATTORNEY_FIRM_MODULE_KEYS = Object.freeze(['transfer', 'bond', 'cancellation'])

export const ATTORNEY_FIRM_MODULE_STATUSES = Object.freeze(['active', 'winding_down', 'inactive'])

export const ATTORNEY_FIRM_MODULE_REGISTRY = Object.freeze({
  transfer: Object.freeze({
    key: 'transfer',
    label: 'Property Transfers',
    matterLabel: 'Transfer',
    description: 'Transfer instructions through preparation, signing, lodgement, and registration.',
    route: '/attorney/matters/transfer',
  }),
  bond: Object.freeze({
    key: 'bond',
    label: 'Bond Registrations',
    matterLabel: 'Bond Registration',
    description: 'Bond registration instructions, guarantees, bank conditions, and lodgement.',
    route: '/attorney/matters/bond',
  }),
  cancellation: Object.freeze({
    key: 'cancellation',
    label: 'Bond Cancellations',
    matterLabel: 'Bond Cancellation',
    description: 'Bond cancellation instructions, releases, and related follow-up work.',
    route: '/attorney/matters/cancellation',
  }),
})

export function normalizeAttorneyFirmModuleKey(value, fallback = '') {
  const normalized = String(value || '').trim().toLowerCase()
  return ATTORNEY_FIRM_MODULE_KEYS.includes(normalized) ? normalized : fallback
}

export function normalizeAttorneyFirmModuleStatus(value, fallback = 'active') {
  const normalized = String(value || '').trim().toLowerCase()
  return ATTORNEY_FIRM_MODULE_STATUSES.includes(normalized) ? normalized : fallback
}

export function getAttorneyFirmModuleDefinition(moduleKey) {
  return ATTORNEY_FIRM_MODULE_REGISTRY[normalizeAttorneyFirmModuleKey(moduleKey)] || null
}
