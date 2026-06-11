import { isUnsafeFallbackAllowed } from './envValidation'
import { MOCK_DATA_ENABLED } from './mockData'

export const KEY_AGENT_DEMO_TRANSACTIONS = 'itg:agent-demo-transactions:v1'

function readJson(key, fallback) {
  if (typeof window === 'undefined') return fallback
  if (!isUnsafeFallbackAllowed()) return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

export function getAgentDemoTransactionRowsFromStorage() {
  if (!MOCK_DATA_ENABLED) return []
  const rows = readJson(KEY_AGENT_DEMO_TRANSACTIONS, [])
  return Array.isArray(rows) ? rows : []
}
