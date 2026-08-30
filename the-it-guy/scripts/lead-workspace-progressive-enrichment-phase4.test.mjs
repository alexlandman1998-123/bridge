import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [repository, pipeline, snapshotCache] = await Promise.all([
  readFile(new URL('../src/lib/agencyCrmRepository.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/agency/agencyLeadWorkspaceSnapshotCache.js', import.meta.url), 'utf8'),
])
const leadListRoute = await readFile(new URL('../src/pages/agency/AgencyLeadListRoutePage.jsx', import.meta.url), 'utf8')

const workspaceFunctionStart = repository.indexOf('export async function fetchAgencyCrmLeadWorkspace')
const nextFunctionStart = repository.indexOf('\nexport async function ', workspaceFunctionStart + 1)
const workspaceFunction = repository.slice(workspaceFunctionStart, nextFunctionStart)
const seedBranchStart = workspaceFunction.indexOf('if (seededLead)')
const coldLeadReadStart = workspaceFunction.indexOf('const leadResult = await fetchLeadRowById')
const seedBranch = workspaceFunction.slice(seedBranchStart, coldLeadReadStart)

assert.notEqual(workspaceFunctionStart, -1)
assert.match(workspaceFunction, /\{ seedSnapshot = null \} = \{\}/)
assert.ok(seedBranchStart >= 0 && seedBranchStart < coldLeadReadStart)
assert.doesNotMatch(seedBranch, /fetchLeadRowById/)
assert.match(seedBranch, /seededContact/)
assert.match(seedBranch, /Promise\.all\(\[contactPromise, activityPromise, taskPromise\]\)/)
assert.match(seedBranch, /source: 'remote-progressive-enrichment'/)
assert.match(seedBranch, /leadWorkspaceReason: 'seed_snapshot_enrichment'/)
assert.match(pipeline, /fetchAgencyCrmLeadWorkspace\(organisationId, routeLeadId, \{ seedSnapshot: snapshot \}\)/)
assert.match(snapshotCache, /leadActivities: Array\.isArray\(existing\.leadActivities\)/)
assert.match(snapshotCache, /tasks: Array\.isArray\(existing\.tasks\)/)
assert.match(leadListRoute, /from '\.\.\/\.\.\/context\/WorkspaceContextBase'/)
assert.doesNotMatch(leadListRoute, /from '\.\.\/\.\.\/context\/WorkspaceContext'/)

console.log('lead workspace progressive enrichment phase 4 checks passed')
