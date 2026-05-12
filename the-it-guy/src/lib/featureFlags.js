import { getFeatureFlags } from './envValidation'

function readBoolean(value, fallback = false) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return fallback
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)
}

const INTELLIGENCE_MODULES_LAUNCH_DISABLED = true

export const SHOW_INTELLIGENCE_BETA = INTELLIGENCE_MODULES_LAUNCH_DISABLED
  ? false
  : readBoolean(import.meta.env.VITE_FEATURE_INTELLIGENCE_BETA, false)
export const FEATURE_FLAGS = getFeatureFlags()
