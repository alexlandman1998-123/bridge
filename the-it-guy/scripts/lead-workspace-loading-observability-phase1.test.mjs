import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  LEAD_WORKSPACE_LOAD_STAGES,
  completeLeadWorkspaceLoadingTrace,
  readLeadWorkspaceLoadingTrace,
  recordLeadWorkspaceLoadStage,
} from '../src/services/observability/leadWorkspaceLoadingTrace.js'

let clock = 100
const marks = []
const events = []
const windowApi = {
  location: { pathname: '/pipeline/leads/seller-lead-1' },
  dispatchEvent(event) { events.push(event?.detail || null) },
}
const performanceApi = {
  now() { clock += 25; return clock },
  mark(name, options) { marks.push({ name, options }) },
}
const options = { windowApi, performanceApi }

recordLeadWorkspaceLoadStage(LEAD_WORKSPACE_LOAD_STAGES.routeChunkLoading, options)
recordLeadWorkspaceLoadStage(LEAD_WORKSPACE_LOAD_STAGES.workspaceChunkLoading, options)
recordLeadWorkspaceLoadStage(LEAD_WORKSPACE_LOAD_STAGES.workspaceChunkLoading, options)
recordLeadWorkspaceLoadStage(LEAD_WORKSPACE_LOAD_STAGES.pipelineContextLoading, options)
recordLeadWorkspaceLoadStage(LEAD_WORKSPACE_LOAD_STAGES.workspaceHydrating, options)
recordLeadWorkspaceLoadStage(LEAD_WORKSPACE_LOAD_STAGES.coreLeadReady, options)
const firstCompletion = completeLeadWorkspaceLoadingTrace('ready', options)
const duplicateCompletion = completeLeadWorkspaceLoadingTrace('ready', options)

assert.equal(firstCompletion.shouldReport, true)
assert.equal(duplicateCompletion.shouldReport, false)
assert.equal(firstCompletion.trace.outcome, 'ready')
assert.equal(firstCompletion.trace.loadingPresentationCount, 4)
assert.equal(firstCompletion.trace.terminalPresentationCount, 0)
assert.deepEqual(firstCompletion.trace.stages.map((entry) => entry.stage), [
  'route_chunk_loading',
  'workspace_chunk_loading',
  'pipeline_context_loading',
  'workspace_hydrating',
  'core_lead_ready',
  'workspace_ready',
])
assert.ok(marks.some((entry) => entry.name === 'arch9:lead-workspace:workspace_ready'))
assert.ok(events.some((entry) => entry?.stage === 'workspace_ready'))
assert.equal(readLeadWorkspaceLoadingTrace(windowApi)?.loadingPresentationCount, 4)

windowApi.location.pathname = '/pipeline/leads/seller-lead-2'
recordLeadWorkspaceLoadStage(LEAD_WORKSPACE_LOAD_STAGES.workspaceChunkLoading, options)
assert.equal(readLeadWorkspaceLoadingTrace(windowApi)?.leadId, 'seller-lead-2')
assert.equal(readLeadWorkspaceLoadingTrace(windowApi)?.loadingPresentationCount, 1)

const [app, routeShell, hydrationShell, loadingShell, pipeline, browserSmoke] = await Promise.all([
  readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/leads/LeadsRouteShell.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/agency/LeadWorkspaceHydrationShell.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/agency/LeadWorkspaceLoadingShell.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8'),
  readFile(new URL('./agency-lead-workspace-hydration-smoke.mjs', import.meta.url), 'utf8'),
])

assert.match(app, /loadStage="route_chunk_loading"/)
assert.match(routeShell, /data-lead-workspace-load-stage/)
assert.match(hydrationShell, /workspaceChunkLoading/)
assert.match(loadingShell, /data-lead-core-ready/)
assert.match(pipeline, /pipelineContextLoading/)
assert.match(pipeline, /workspaceHydrating/)
assert.match(pipeline, /lead_workspace_loading_sequence_completed/)
assert.match(browserSmoke, /terminalEmptyStateViolations/)
assert.match(browserSmoke, /Terminal lead empty-state copy must not render while a valid lead is still hydrating/)

console.log('lead workspace loading observability phase 1 checks passed')
