export const GUIDED_BOND_APPLICATION_V2_FLAG = 'guided_bond_application_v2'
export const GUIDED_BOND_APPLICATION_V2_ENV = 'VITE_FEATURE_GUIDED_BOND_APPLICATION_V2'
export const GUIDED_BOND_APPLICATION_PARTICIPANTS_FLAG = 'guided_bond_application_participants_v1'
export const GUIDED_BOND_APPLICATION_PARTICIPANTS_ENV = 'VITE_FEATURE_GUIDED_BOND_APPLICATION_PARTICIPANTS_V1'
export const GUIDED_BOND_APPLICATION_SURETIES_FLAG = 'guided_bond_application_sureties_v1'
export const GUIDED_BOND_APPLICATION_SURETIES_ENV = 'VITE_FEATURE_GUIDED_BOND_APPLICATION_SURETIES_V1'
export const GUIDED_BOND_APPLICATION_CHANGE_REQUESTS_FLAG = 'guided_bond_application_change_requests_v1'
export const GUIDED_BOND_APPLICATION_CHANGE_REQUESTS_ENV = 'VITE_FEATURE_GUIDED_BOND_APPLICATION_CHANGE_REQUESTS_V1'
export const BOND_APPLICATION_EXPORTS_FLAG = 'bond_application_exports_v1'
export const BOND_APPLICATION_EXPORTS_ENV = 'VITE_FEATURE_BOND_APPLICATION_EXPORTS_V1'
export const BOND_APPLICATION_OOBA_ADAPTER_FLAG = 'bond_application_ooba_adapter_v1'
export const BOND_APPLICATION_OOBA_ADAPTER_ENV = 'VITE_FEATURE_BOND_APPLICATION_OOBA_ADAPTER_V1'
export const BOND_APPLICATION_BANK_ADAPTERS_FLAG = 'bond_application_bank_adapters_v1'
export const BOND_APPLICATION_BANK_ADAPTERS_ENV = 'VITE_FEATURE_BOND_APPLICATION_BANK_ADAPTERS_V1'
export const BOND_APPLICATION_LIVE_DELIVERY_FLAG = 'bond_application_live_delivery_v1'
export const BOND_APPLICATION_LIVE_DELIVERY_ENV = 'VITE_FEATURE_BOND_APPLICATION_LIVE_DELIVERY_V1'
export const BOND_APPLICATION_EXTERNAL_STATUS_SYNC_FLAG = 'bond_application_external_status_sync_v1'
export const BOND_APPLICATION_EXTERNAL_STATUS_SYNC_ENV = 'VITE_FEATURE_BOND_APPLICATION_EXTERNAL_STATUS_SYNC_V1'

const ENABLED_VALUES = new Set(['1', 'true', 'yes', 'on', 'enabled'])
const DISABLED_VALUES = new Set(['0', 'false', 'no', 'off', 'disabled'])

function readRuntimeEnvironment() {
  return import.meta.env || {}
}

function normalizeBoolean(value) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (value === 1) return true
    if (value === 0) return false
  }

  const normalized = String(value ?? '').trim().toLowerCase()
  if (!normalized) return null
  if (ENABLED_VALUES.has(normalized)) return true
  if (DISABLED_VALUES.has(normalized)) return false
  return null
}

function flagValueFrom(source, flagKey = GUIDED_BOND_APPLICATION_V2_FLAG) {
  if (!source || typeof source !== 'object') return null
  const camelKey = flagKey.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())

  return normalizeBoolean(
    source[flagKey] ??
      source[camelKey] ??
      source.features?.[flagKey] ??
      source.features?.[camelKey] ??
      source.feature_flags?.[flagKey] ??
      source.featureFlags?.[camelKey],
  )
}

export function resolveGuidedBondApplicationV2Flag({
  env = readRuntimeEnvironment(),
  config = null,
  organisation = null,
  transaction = null,
} = {}) {
  const candidates = [
    ['transaction', flagValueFrom(transaction, GUIDED_BOND_APPLICATION_V2_FLAG)],
    ['organisation', flagValueFrom(organisation, GUIDED_BOND_APPLICATION_V2_FLAG)],
    ['config', flagValueFrom(config, GUIDED_BOND_APPLICATION_V2_FLAG)],
    ['environment', normalizeBoolean(env?.[GUIDED_BOND_APPLICATION_V2_ENV])],
  ]
  const explicit = candidates.find(([, value]) => value !== null)

  return {
    key: GUIDED_BOND_APPLICATION_V2_FLAG,
    enabled: explicit ? explicit[1] === true : false,
    source: explicit ? explicit[0] : 'default_disabled',
  }
}

export function isGuidedBondApplicationV2Enabled(context = {}) {
  return resolveGuidedBondApplicationV2Flag(context).enabled
}

export function resolveGuidedBondApplicationParticipantsFlag({
  env = readRuntimeEnvironment(),
  config = null,
  organisation = null,
  transaction = null,
} = {}) {
  const candidates = [
    ['transaction', flagValueFrom(transaction, GUIDED_BOND_APPLICATION_PARTICIPANTS_FLAG)],
    ['organisation', flagValueFrom(organisation, GUIDED_BOND_APPLICATION_PARTICIPANTS_FLAG)],
    ['config', flagValueFrom(config, GUIDED_BOND_APPLICATION_PARTICIPANTS_FLAG)],
    ['environment', normalizeBoolean(env?.[GUIDED_BOND_APPLICATION_PARTICIPANTS_ENV])],
  ]
  const explicit = candidates.find(([, value]) => value !== null)

  return {
    key: GUIDED_BOND_APPLICATION_PARTICIPANTS_FLAG,
    enabled: explicit ? explicit[1] === true : false,
    source: explicit ? explicit[0] : 'default_disabled',
  }
}

export function isGuidedBondApplicationParticipantsEnabled(context = {}) {
  return resolveGuidedBondApplicationParticipantsFlag(context).enabled
}

export function resolveGuidedBondApplicationSuretiesFlag({
  env = readRuntimeEnvironment(),
  config = null,
  organisation = null,
  transaction = null,
} = {}) {
  const candidates = [
    ['transaction', flagValueFrom(transaction, GUIDED_BOND_APPLICATION_SURETIES_FLAG)],
    ['organisation', flagValueFrom(organisation, GUIDED_BOND_APPLICATION_SURETIES_FLAG)],
    ['config', flagValueFrom(config, GUIDED_BOND_APPLICATION_SURETIES_FLAG)],
    ['environment', normalizeBoolean(env?.[GUIDED_BOND_APPLICATION_SURETIES_ENV])],
  ]
  const explicit = candidates.find(([, value]) => value !== null)

  return {
    key: GUIDED_BOND_APPLICATION_SURETIES_FLAG,
    enabled: explicit ? explicit[1] === true : false,
    source: explicit ? explicit[0] : 'default_disabled',
  }
}

export function isGuidedBondApplicationSuretiesEnabled(context = {}) {
  return resolveGuidedBondApplicationSuretiesFlag(context).enabled
}

export function resolveGuidedBondApplicationChangeRequestsFlag({
  env = readRuntimeEnvironment(),
  config = null,
  organisation = null,
  transaction = null,
} = {}) {
  const candidates = [
    ['transaction', flagValueFrom(transaction, GUIDED_BOND_APPLICATION_CHANGE_REQUESTS_FLAG)],
    ['organisation', flagValueFrom(organisation, GUIDED_BOND_APPLICATION_CHANGE_REQUESTS_FLAG)],
    ['config', flagValueFrom(config, GUIDED_BOND_APPLICATION_CHANGE_REQUESTS_FLAG)],
    ['environment', normalizeBoolean(env?.[GUIDED_BOND_APPLICATION_CHANGE_REQUESTS_ENV])],
  ]
  const explicit = candidates.find(([, value]) => value !== null)

  return {
    key: GUIDED_BOND_APPLICATION_CHANGE_REQUESTS_FLAG,
    enabled: explicit ? explicit[1] === true : false,
    source: explicit ? explicit[0] : 'default_disabled',
  }
}

export function isGuidedBondApplicationChangeRequestsEnabled(context = {}) {
  return resolveGuidedBondApplicationChangeRequestsFlag(context).enabled
}

function resolveBondApplicationIntegrationFlag({
  flagKey,
  envKey,
  env = readRuntimeEnvironment(),
  config = null,
  organisation = null,
  transaction = null,
} = {}) {
  const candidates = [
    ['transaction', flagValueFrom(transaction, flagKey)],
    ['organisation', flagValueFrom(organisation, flagKey)],
    ['config', flagValueFrom(config, flagKey)],
    ['environment', normalizeBoolean(env?.[envKey])],
  ]
  const explicit = candidates.find(([, value]) => value !== null)
  return {
    key: flagKey,
    enabled: explicit ? explicit[1] === true : false,
    source: explicit ? explicit[0] : 'default_disabled',
  }
}

export function resolveBondApplicationExportsFlag(context = {}) {
  return resolveBondApplicationIntegrationFlag({
    ...context,
    flagKey: BOND_APPLICATION_EXPORTS_FLAG,
    envKey: BOND_APPLICATION_EXPORTS_ENV,
  })
}

export function resolveBondApplicationOobaAdapterFlag(context = {}) {
  return resolveBondApplicationIntegrationFlag({
    ...context,
    flagKey: BOND_APPLICATION_OOBA_ADAPTER_FLAG,
    envKey: BOND_APPLICATION_OOBA_ADAPTER_ENV,
  })
}

export function resolveBondApplicationBankAdaptersFlag(context = {}) {
  return resolveBondApplicationIntegrationFlag({
    ...context,
    flagKey: BOND_APPLICATION_BANK_ADAPTERS_FLAG,
    envKey: BOND_APPLICATION_BANK_ADAPTERS_ENV,
  })
}

export function resolveBondApplicationLiveDeliveryFlag(context = {}) {
  return resolveBondApplicationIntegrationFlag({
    ...context,
    flagKey: BOND_APPLICATION_LIVE_DELIVERY_FLAG,
    envKey: BOND_APPLICATION_LIVE_DELIVERY_ENV,
  })
}

export function resolveBondApplicationExternalStatusSyncFlag(context = {}) {
  return resolveBondApplicationIntegrationFlag({
    ...context,
    flagKey: BOND_APPLICATION_EXTERNAL_STATUS_SYNC_FLAG,
    envKey: BOND_APPLICATION_EXTERNAL_STATUS_SYNC_ENV,
  })
}

export function resolveGuidedBondApplicationCapabilities(context = {}) {
  const guidedV2 = resolveGuidedBondApplicationV2Flag(context).enabled
  const participantsV1 = guidedV2 && resolveGuidedBondApplicationParticipantsFlag(context).enabled
  return {
    guidedV2,
    participantsV1,
    suretiesV1: participantsV1 && resolveGuidedBondApplicationSuretiesFlag(context).enabled,
    changeRequestsV1: participantsV1 && resolveGuidedBondApplicationChangeRequestsFlag(context).enabled,
  }
}

export function resolveBondApplicationIntegrationCapabilities(context = {}) {
  const guided = resolveGuidedBondApplicationCapabilities(context)
  const normalizedApplicationReady = guided.participantsV1 === true
  const exportsV1 = normalizedApplicationReady && resolveBondApplicationExportsFlag(context).enabled
  const oobaAdapterV1 = exportsV1 && resolveBondApplicationOobaAdapterFlag(context).enabled
  const bankAdaptersV1 = exportsV1 && resolveBondApplicationBankAdaptersFlag(context).enabled
  const liveDeliveryV1 = exportsV1 && (oobaAdapterV1 || bankAdaptersV1) && resolveBondApplicationLiveDeliveryFlag(context).enabled
  const externalStatusSyncV1 = exportsV1 && resolveBondApplicationExternalStatusSyncFlag(context).enabled
  return {
    ...guided,
    exportsV1,
    oobaAdapterV1,
    bankAdaptersV1,
    liveDeliveryV1,
    externalStatusSyncV1,
  }
}
