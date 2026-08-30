import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  clearAgencyLeadWorkspaceSnapshotCache,
  readAgencyLeadWorkspaceSnapshot,
  seedAgencyLeadWorkspaceSnapshot,
  writeAgencyLeadWorkspaceSnapshot,
} from '../src/pages/agency/agencyLeadWorkspaceSnapshotCache.js'

const organisationId = '11111111-1111-4111-8111-111111111111'
const leadId = '22222222-2222-4222-8222-222222222222'
const contactId = '33333333-3333-4333-8333-333333333333'

clearAgencyLeadWorkspaceSnapshotCache()
writeAgencyLeadWorkspaceSnapshot(organisationId, leadId, {
  leads: [{ leadId, leadCategory: 'seller', stage: 'New Lead' }],
  contacts: [],
  leadActivities: [{ activityId: 'activity-1' }],
  tasks: [{ taskId: 'task-1' }],
  linkedListings: [{ id: 'listing-1' }],
})
seedAgencyLeadWorkspaceSnapshot(organisationId, leadId, {
  lead: { leadId, contactId, leadCategory: 'seller', stage: 'Valuation booked' },
  contact: { contactId, firstName: 'Seller', lastName: 'Lead' },
}, 'remote_core')

const snapshot = readAgencyLeadWorkspaceSnapshot(organisationId, leadId)
assert.equal(snapshot.leads.length, 1)
assert.equal(snapshot.leads[0].stage, 'Valuation booked')
assert.equal(snapshot.contacts[0].contactId, contactId)
assert.equal(snapshot.leadActivities.length, 1)
assert.equal(snapshot.tasks.length, 1)
assert.equal(snapshot.linkedListings.length, 1)
assert.equal(snapshot.leadWorkspaceStatus, 'ready')
assert.equal(snapshot.leadWorkspaceReason, 'remote_core')

const [pipeline, hydrationShell, readRepository, leadListPage] = await Promise.all([
  readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/agency/LeadWorkspaceHydrationShell.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/agency/agencyLeadListReadRepository.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/agency/AgencyLeadListRoutePage.jsx', import.meta.url), 'utf8'),
])

assert.match(pipeline, /readAgencyLeadWorkspaceSnapshot as readLeadWorkspaceSessionSnapshot/)
assert.doesNotMatch(pipeline, /function readLeadWorkspaceSessionSnapshot/)
assert.match(pipeline, /markRouteSnapshotReady\(warmRouteSnapshot, \{ source: 'warm_snapshot_seed' \}\)/)
assert.ok(
  pipeline.indexOf("source: 'warm_snapshot_seed'") < pipeline.indexOf('fetchAgencyCrmLeadRouteHydrationSeed(organisationId, routeLeadId)'),
  'The shared warm snapshot must satisfy the visible workspace before a remote route seed is attempted.',
)
assert.match(hydrationShell, /readAgencyLeadWorkspaceSnapshot/)
assert.match(readRepository, /seedAgencyLeadWorkspaceSnapshot\(workspaceId, resolvedLeadId, data, 'remote_core'\)/)
assert.match(leadListPage, /seedAgencyLeadWorkspaceSnapshot\(organisationId, created\.leadId, createdCore, 'lead_created'\)/)
assert.match(leadListPage, /onAddLead=\{\(nextCategory\) => \{[\s\S]*void loadLeadMutationActions\(\)/)

console.log('lead workspace single hydration phase 3 checks passed')
