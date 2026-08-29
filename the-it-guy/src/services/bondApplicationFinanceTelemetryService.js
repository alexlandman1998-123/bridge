import { buildAgentBondApplicationWorkspaceHealth } from '../modules/bond/application/workspace/bondApplicationWorkspacePresentation.js'
import { trackTelemetryEvent } from './observability/telemetry.js'

export const BOND_APPLICATION_FINANCE_TELEMETRY_CONTRACT = 'bond-application-finance-telemetry-v1'

const reportedStateByScope = new Map()
const MAX_REPORTED_SCOPES = 100

function trimReportedScopes() {
  if (reportedStateByScope.size <= MAX_REPORTED_SCOPES) return
  const oldestKey = reportedStateByScope.keys().next().value
  if (oldestKey) reportedStateByScope.delete(oldestKey)
}

export function buildBondApplicationFinanceTelemetryEvent({ workspace = {}, liveState = {} } = {}) {
  const health = buildAgentBondApplicationWorkspaceHealth({ workspace, liveState })
  const source = workspace?.source || 'unavailable'
  const eventName = workspace?.valid === false
    ? 'bond_application_finance_identity_invalid'
    : source === 'client_fallback'
      ? 'bond_application_finance_fallback_active'
      : health.key === 'refresh_error'
        ? 'bond_application_finance_refresh_failed'
        : 'bond_application_finance_workspace_loaded'

  return Object.freeze({
    category: 'bond_application_finance',
    eventName,
    severity: workspace?.valid === false || health.key === 'refresh_error' ? 'warning' : 'info',
    metadata: {
      contract: BOND_APPLICATION_FINANCE_TELEMETRY_CONTRACT,
      workspaceVersion: workspace?.version || 'unknown',
      source,
      available: workspace?.available === true,
      valid: workspace?.valid !== false,
      healthKey: health.key,
      connectionState: liveState?.connectionState || 'idle',
    },
  })
}

export async function trackBondApplicationFinanceWorkspaceState({
  workspace = {},
  liveState = {},
  userId = '',
  workspaceId = '',
  route = '',
} = {}) {
  const event = buildBondApplicationFinanceTelemetryEvent({ workspace, liveState })
  const scopeKey = `${workspaceId || 'workspace'}:${route || 'route'}`
  const fingerprint = `${event.eventName}:${event.metadata.source}:${event.metadata.healthKey}:${event.metadata.connectionState}`
  if (reportedStateByScope.get(scopeKey) === fingerprint) {
    return { persisted: false, reason: 'duplicate_state' }
  }
  reportedStateByScope.set(scopeKey, fingerprint)
  trimReportedScopes()
  return trackTelemetryEvent({
    ...event,
    userId,
    workspaceId,
    route,
  })
}
