import { createHttpPropertyDataProvider } from './httpPropertyDataProvider'
import { createMockPropertyDataProvider } from './mockPropertyDataProvider'
import { assertPropertyDataProvider } from './propertyDataProviderContract'

export function resolvePropertyDataProviderConfig(env = {}) {
  return {
    mode: String(env.VITE_PROPERTY_DATA_PROVIDER_MODE || 'mock').trim().toLowerCase(),
    apiOptions: {
      baseUrl: String(env.VITE_PROPERTY_DATA_API_BASE_URL || '').trim(),
      allowInsecureLocalhost: String(env.DEV || '').toLowerCase() === 'true',
    },
  }
}

export function createPropertyDataProvider({ mode = 'mock', mockOptions, apiOptions } = {}) {
  const normalizedMode = String(mode || 'mock').trim().toLowerCase()
  if (normalizedMode === 'mock') return assertPropertyDataProvider(createMockPropertyDataProvider(mockOptions))
  if (normalizedMode === 'api') return assertPropertyDataProvider(createHttpPropertyDataProvider(apiOptions))
  throw new Error(`Property data provider mode "${normalizedMode}" is not configured.`)
}

export const propertyDataProviderConfig = Object.freeze(resolvePropertyDataProviderConfig(import.meta.env || {}))
export const propertyDataProvider = createPropertyDataProvider(propertyDataProviderConfig)
