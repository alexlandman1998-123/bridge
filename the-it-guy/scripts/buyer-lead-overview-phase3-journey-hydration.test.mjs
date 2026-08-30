import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const loaderSource = await readFile(new URL('../src/pages/agency/buyerLeadWorkspaceDataLoader.js', import.meta.url), 'utf8')
const pageSource = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')
const repositorySource = await readFile(new URL('../src/lib/agencyCrmRepository.js', import.meta.url), 'utf8')

const enrichmentStart = repositorySource.indexOf('export async function fetchAgencyCrmLeadJourneyEnrichment')
const enrichmentEnd = repositorySource.indexOf('\nexport ', enrichmentStart + 1)
assert.notEqual(enrichmentStart, -1, 'targeted Buyer Journey repository query is missing')
const enrichmentSource = repositorySource.slice(enrichmentStart, enrichmentEnd === -1 ? repositorySource.length : enrichmentEnd)

assert.doesNotMatch(enrichmentSource, /fetchLeadRowById/, 'Journey enrichment must reuse the already-loaded lead')
assert.match(enrichmentSource, /Promise\.all\(\[contactPromise, activityPromise\]\)/, 'contact and activity evidence must load concurrently')
assert.match(enrichmentSource, /\.eq\('organisation_id', workspaceId\)/, 'Journey reads must remain organisation scoped for RLS')
assert.match(enrichmentSource, /\.eq\('lead_id', resolvedLeadId\)/, 'Journey activity reads must remain lead scoped')
assert.doesNotMatch(enrichmentSource, /\.from\('tasks'\)/, 'Overview Journey hydration must not wait for task rows')

assert.match(loaderSource, /const DEFAULT_CACHE_TTL_MS = 60000/, 'Journey enrichment should be reused during navigation')
assert.match(loaderSource, /const hasBuyerSeed = isBuyerSnapshot\(seedSnapshot\)/, 'loader must detect the fast buyer seed')
assert.match(loaderSource, /fetchJourneyEnrichment\(organisationId, leadId, seedSnapshot\)/, 'loader must enrich the existing seed')
assert.match(pageSource, /loadBuyerLeadWorkspaceData\(\{ organisationId, leadId: routeLeadId, seedSnapshot: snapshot \}\)/, 'workspace hydration must pass its seed instead of re-querying the full lead')
assert.match(pageSource, /journey_enrichment_complete[\s\S]*enrichmentStatus/, 'Phase 0 enrichment timing must report the targeted request status')

console.log('buyer lead overview Phase 3 Journey hydration contracts passed')
