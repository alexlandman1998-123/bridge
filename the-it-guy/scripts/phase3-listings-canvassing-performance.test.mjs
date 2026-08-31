import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const listings = await readFile(new URL('../src/pages/AgentListings.jsx', import.meta.url), 'utf8')
const canvassing = await readFile(new URL('../src/pages/PipelineCanvassingPage.jsx', import.meta.url), 'utf8')

const listingsSummaryIndex = listings.indexOf('await getAgentPrivateListingSummaries(profile.id, listingScope)')
const listingsCoreReadyIndex = listings.indexOf('if (showLoading) setLoading(false)', listingsSummaryIndex)
const listingsDetailIndex = listings.indexOf('getAgentPrivateListings(profile.id, {', listingsSummaryIndex)

assert.ok(listingsSummaryIndex > 0, 'Listings must use a lightweight summary query for its first usable render.')
assert.match(listings, /coreFieldsOnly: true/, 'Listings hot path must request schema-stable core fields only.')
assert.ok(
  listingsCoreReadyIndex > listingsSummaryIndex && listingsCoreReadyIndex < listingsDetailIndex,
  'Listings must publish core rows before detailed listing hydration starts.',
)
assert.match(
  listings,
  /data-performance-settled=\{isPrimaryListingsRoute \? \(loading \|\| supportingDataLoading \? 'false' : 'true'\)/,
  'Listings must not report settled while background hydration is running.',
)
assert.match(listings, /contentVisibility: 'auto'/, 'Off-screen listing cards should defer layout and paint work.')

const currentWorkspaceIndex = canvassing.indexOf('let orgId = normalizeText(currentWorkspace?.id)')
const settingsFallbackIndex = canvassing.indexOf('if (!orgId) {', currentWorkspaceIndex)
const workspaceLoadIndex = canvassing.indexOf('const store = await listCanvassingWorkspace(orgId)', settingsFallbackIndex)
const canvassingCoreReadyIndex = canvassing.indexOf('setLoading(false)', workspaceLoadIndex)
const supportingDataIndex = canvassing.indexOf('const [users, remoteListings] = await Promise.all([', workspaceLoadIndex)

assert.ok(currentWorkspaceIndex > 0, 'Canvassing must use the already-selected workspace first.')
assert.ok(settingsFallbackIndex > currentWorkspaceIndex, 'Organisation settings must only be a workspace fallback.')
assert.ok(
  canvassingCoreReadyIndex > workspaceLoadIndex && canvassingCoreReadyIndex < supportingDataIndex,
  'Canvassing must render prospects before loading users and listing options.',
)
assert.match(canvassing, /getAgentPrivateListingSummaries\(currentAgentForWrites\.id, \{/, 'Canvassing listing options must use summary rows.')
assert.match(canvassing, /coreFieldsOnly: true/, 'Canvassing listing options must request schema-stable core fields only.')
assert.doesNotMatch(canvassing, /getAgentPrivateListings\(currentAgentForWrites\.id, \{/, 'Canvassing must not hydrate full listing workspaces.')
assert.match(canvassing, /disabled=\{loading \|\| !organisationId\}/, 'Write actions must remain disabled until workspace scope is resolved.')
assert.match(canvassing, /if \(loading && isProspectWorkspaceRoute\)/, 'Only a detail route may retain the blocking loading state.')
assert.match(canvassing, /containIntrinsicSize: '0 88px'/, 'Off-screen prospect rows should defer layout and paint work.')

console.log('Phase 3 Listings and Canvassing performance checks passed.')
