import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const pipelineSource = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')
const repositorySource = await readFile(new URL('../src/lib/agencyCrmRepository.js', import.meta.url), 'utf8')

test('lead route seed includes stable contact identity without loading activity or tasks', () => {
  const seedStart = repositorySource.indexOf('export async function fetchAgencyCrmLeadRouteHydrationSeed')
  assert.notEqual(seedStart, -1)
  const seedSource = repositorySource.slice(seedStart, repositorySource.indexOf('\nexport async function ', seedStart + 1))
  assert.match(seedSource, /fetchAgencyCrmLeadRelatedRecords\(workspaceId, resolvedLeadId/)
  assert.match(seedSource, /includeContact: true/)
  assert.match(seedSource, /includeActivities: false/)
  assert.match(seedSource, /includeTasks: false/)
  assert.match(seedSource, /contacts: relatedRecords\.contacts/)
})

test('related lead records load directly and in parallel without rereading the lead', () => {
  const relatedStart = repositorySource.indexOf('export async function fetchAgencyCrmLeadRelatedRecords')
  assert.notEqual(relatedStart, -1)
  const relatedSource = repositorySource.slice(relatedStart, repositorySource.indexOf('\nexport async function ', relatedStart + 1))
  assert.match(relatedSource, /Promise\.all\(\[/)
  assert.match(relatedSource, /\.from\('contacts'\)/)
  assert.match(relatedSource, /\.from\('lead_activities'\)/)
  assert.match(relatedSource, /\.from\('tasks'\)/)
  assert.doesNotMatch(relatedSource, /fetchLeadRowById/)
})

test('overview no longer triggers full lead workspace hydration', () => {
  assert.doesNotMatch(pipelineSource, /hydrateFullLeadWorkspaceInBackground/)
  assert.match(pipelineSource, /leadWorkspaceTab !== 'activity'/)
  assert.match(pipelineSource, /fetchAgencyCrmLeadRelatedRecords\(organisationId, resolvedLeadId/)
  assert.match(pipelineSource, /lead_workspace_activity_panel_hydrated/)
  assert.match(pipelineSource, /getPrivateListing\(listingId, \{[\s\S]*includeOnboarding: false,[\s\S]*includeMedia: false,[\s\S]*includeAssignedAgent: false,/)
})

test('seller listing activity is owned by the Activity panel', () => {
  assert.match(pipelineSource, /leadWorkspaceTab !== 'activity' \|\| !selectedLeadIdentityKey \|\| !selectedLeadIsSeller/)
})
