import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [app, routeShell, routeLoadingShell, hydrationShell, loadingShell, pipeline] = await Promise.all([
  readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/leads/LeadsRouteShell.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/leads/LeadWorkspaceRouteLoadingShell.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/agency/LeadWorkspaceHydrationShell.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/agency/LeadWorkspaceLoadingShell.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8'),
])

assert.match(app, /<LeadWorkspaceRouteLoadingShell loadStage="route_chunk_loading" \/>/)
assert.doesNotMatch(routeShell, /LeadWorkspaceLoadingShell/)
assert.match(routeLoadingShell, /import LeadWorkspaceLoadingShell/)
assert.match(routeLoadingShell, /<LeadWorkspaceLoadingShell/)
assert.match(hydrationShell, /<LeadWorkspaceLoadingShell/)
assert.doesNotMatch(hydrationShell, /Seller lead|Buyer lead/)

assert.match(loadingShell, /const NEUTRAL_TABS/)
assert.match(loadingShell, /: 'Lead'/)
assert.match(loadingShell, /data-lead-category-known/)
assert.match(loadingShell, /min-h-\[620px\]/)

assert.match(pipeline, /loadStage=\{LEAD_WORKSPACE_LOAD_STAGES\.pipelineContextLoading\}/)
assert.match(pipeline, /testId="lead-workspace-pipeline-context-loading"/)
assert.match(pipeline, /loadStage=\{LEAD_WORKSPACE_LOAD_STAGES\.workspaceHydrating\}/)
assert.match(pipeline, /testId="lead-workspace-loading-shell"/)
assert.equal((pipeline.match(/<LeadWorkspaceLoadingShell/g) || []).length, 2)

console.log('lead workspace shared loading shell phase 2 checks passed')
