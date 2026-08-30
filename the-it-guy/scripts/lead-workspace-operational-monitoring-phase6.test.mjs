import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [packageSource, pipelineSource, healthSource, smokeSource] = await Promise.all([
  readFile(new URL('../package.json', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/services/observability/leadWorkspaceOperationalHealth.js', import.meta.url), 'utf8'),
  readFile(new URL('./agency-lead-workspace-hydration-smoke.mjs', import.meta.url), 'utf8'),
])
const packageJson = JSON.parse(packageSource)

assert.match(healthSource, /arch9-lead-workspace-operational-health-v1/)
assert.match(healthSource, /rollback_recommended/)
assert.match(healthSource, /minimumRollbackSampleSize/)
assert.match(pipelineSource, /assessLeadWorkspaceOperationalHealth/)
assert.match(pipelineSource, /recordPipelineTelemetry\('lead_workspace_loading_sequence_completed', health\.metadata, health\.severity\)/)
assert.equal(
  (pipelineSource.match(/recordPipelineTelemetry\('lead_workspace_loading_sequence_completed'/g) || []).length,
  2,
  'Ready and terminal paths should enrich the same canonical completion event.',
)
assert.match(smokeSource, /telemetryBodies/)
assert.match(smokeSource, /LEAD_WORKSPACE_PHASE6_OPERATIONAL_MONITORING/)
assert.equal(
  packageJson.scripts['verify:lead-workspace-operational-monitoring-phase6:browser'],
  'LEAD_WORKSPACE_PHASE6_OPERATIONAL_MONITORING=1 node scripts/agency-lead-workspace-hydration-smoke.mjs',
)
assert.match(packageJson.scripts['verify:lead-workspace-loading'], /test:lead-workspace-operational-monitoring-phase6/)
assert.match(packageJson.scripts['verify:lead-workspace-loading'], /verify:lead-workspace-operational-monitoring-phase6:browser/)

console.log('lead workspace operational monitoring phase 6 checks passed')
