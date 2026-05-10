import { getFeatureFlags } from './envValidation'

function readBoolean(value, fallback = false) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return fallback
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)
}

export const SHOW_INTELLIGENCE_BETA = readBoolean(import.meta.env.VITE_FEATURE_INTELLIGENCE_BETA, true)
export const FEATURE_FLAGS = getFeatureFlags()
