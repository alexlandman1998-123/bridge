import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()

function readSource(...parts) {
  return fs.readFileSync(path.join(root, ...parts), 'utf8')
}

function assertIncludes(source, needle, label) {
  assert.ok(source.includes(needle), `${label} is missing: ${needle}`)
}

const telemetry = readSource('src', 'services', 'observability', 'dashboardPerformanceTelemetry.js')
const auth = readSource('src', 'context', 'AuthSessionContext.jsx')
const organisation = readSource('src', 'context', 'OrganisationContext.jsx')
const agentDashboard = readSource('src', 'pages', 'Dashboard.jsx')
const principalDashboard = readSource('src', 'pages', 'PrincipalDashboard.jsx')

assertIncludes(telemetry, "DASHBOARD_PERFORMANCE_TELEMETRY_CONTRACT = 'agent-principal-dashboard-performance-v1'", 'Phase 0 telemetry contract')
assertIncludes(telemetry, "authSessionRestore: 'dashboard.auth.session_restore'", 'Session restore metric')
assertIncludes(telemetry, "authBridgeBoot: 'dashboard.auth.bridge_boot'", 'Auth bridge metric')
assertIncludes(telemetry, "organisationBootstrap: 'dashboard.organisation.bootstrap'", 'Organisation bootstrap metric')
assertIncludes(telemetry, "agentSummary: 'dashboard.agent.summary'", 'Agent summary metric')
assertIncludes(telemetry, "agentPrivateListings: 'dashboard.agent.private_listings'", 'Agent private-listing metric')
assertIncludes(telemetry, "principalSummary: 'dashboard.principal.summary'", 'Principal summary metric')
assertIncludes(telemetry, 'summarizeDashboardPerformanceByRole', 'Role p50/p95 summary')
assertIncludes(telemetry, 'fetchDashboardPerformanceSnapshot', 'Performance snapshot fetcher')
assertIncludes(telemetry, "'/rest/v1/performance_metrics'", 'Telemetry request exclusion')
assertIncludes(telemetry, 'resourceTimingAvailable', 'Resource timing marker')

assertIncludes(auth, 'DASHBOARD_PERFORMANCE_METRICS.authSessionRestore', 'Session restore trace')
assertIncludes(auth, 'DASHBOARD_PERFORMANCE_METRICS.authBridgeBoot', 'Auth bridge trace')
assertIncludes(auth, 'void persistDashboardPerformanceTrace(sessionTrace', 'Non-blocking session metric persistence')
assertIncludes(auth, 'void persistDashboardPerformanceTrace(bridgeTrace', 'Non-blocking bridge metric persistence')

assertIncludes(organisation, 'DASHBOARD_PERFORMANCE_METRICS.organisationBootstrap', 'Organisation bootstrap trace')
assertIncludes(organisation, 'void persistDashboardPerformanceTrace(bootstrapTrace', 'Non-blocking organisation metric persistence')
assertIncludes(organisation, "lifecycle: 'initial'", 'Initial organisation lifecycle')
assertIncludes(organisation, "lifecycle: 'refresh'", 'Refresh organisation lifecycle')

assertIncludes(agentDashboard, 'DASHBOARD_PERFORMANCE_METRICS.agentSummary', 'Agent summary trace')
assertIncludes(agentDashboard, 'void persistDashboardPerformanceTrace(agentSummaryTrace', 'Non-blocking Agent metric persistence')
assertIncludes(agentDashboard, 'resultCount: agentSummaryResultCount', 'Agent result-count telemetry')
assertIncludes(agentDashboard, 'DASHBOARD_PERFORMANCE_METRICS.agentPrivateListings', 'Agent private-listing trace')
assertIncludes(agentDashboard, 'void persistDashboardPerformanceTrace(privateListingTrace', 'Non-blocking Agent private-listing metric persistence')

assertIncludes(principalDashboard, 'DASHBOARD_PERFORMANCE_METRICS.principalSummary', 'Principal summary trace')
assertIncludes(principalDashboard, 'void persistDashboardPerformanceTrace(dashboardTrace', 'Non-blocking Principal metric persistence')
assertIncludes(principalDashboard, 'scopeNormalized', 'Principal scope-normalisation telemetry')
assertIncludes(principalDashboard, 'agencyResolutionFallback: !agencyId', 'Principal agency-resolution telemetry')

console.log('dashboard performance telemetry wiring checks passed')
