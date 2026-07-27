import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const pipelineSource = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')
const agencyCrmRepositorySource = await readFile(new URL('../src/lib/agencyCrmRepository.js', import.meta.url), 'utf8')
const privateListingServiceSource = await readFile(new URL('../src/services/privateListingService.js', import.meta.url), 'utf8')
const documentPacketsApiSource = await readFile(new URL('../src/lib/documentPacketsApi.js', import.meta.url), 'utf8')
const packetStatusResolverSource = await readFile(new URL('../src/core/documents/packetStatusResolver.js', import.meta.url), 'utf8')
const migration = await readFile(
  new URL('../../supabase/migrations/202607250007_seller_portal_payload_optional_enrichment_guard.sql', import.meta.url),
  'utf8',
)
const leadWorkspaceIndexesMigration = await readFile(
  new URL('../../supabase/migrations/202607270002_agency_lead_workspace_hot_path_indexes.sql', import.meta.url),
  'utf8',
)

assert.match(
  pipelineSource,
  /const localFallbackAvailable = isUnsafeFallbackAllowed\(\)[\s\S]*?const snapshot = localFallbackAvailable \? getAgencyPipelineSnapshot\(orgId\) : createEmptyPipelineSnapshot\(orgId\)/,
  'pipeline reload should avoid reading production-blocked local CRM snapshots before remote data loads',
)
assert.match(
  pipelineSource,
  /if \(applyLocalSnapshot && localFallbackAvailable && requestId === reloadRequestRef\.current\)/,
  'pipeline reload should only paint local snapshots when unsafe fallbacks are explicitly enabled',
)
assert.match(pipelineSource, /const PIPELINE_CONTEXT_TIMEOUT_MS = 8000/, 'context loads should not timeout at 3.5s')
assert.match(pipelineSource, /const PIPELINE_RECORDS_TIMEOUT_MS = 10000/, 'private listing and record enrichments should get the same 10s budget as CRM')
assert.match(pipelineSource, /const LEAD_WORKSPACE_HYDRATION_TIMEOUT_MS = 8000/, 'lead workspace hydration should not retry on a 2.5s hair trigger')
assert.match(pipelineSource, /snapshot\?\.leadWorkspaceStatus === 'not_found'[\s\S]*?setRouteLeadHydrationStatus\('not_found'\)/, 'stale lead workspace links should stop retrying and enter a not-found state')
assert.ok(pipelineSource.includes('This lead link is stale or the lead has been removed from the selected workspace.'), 'stale lead workspace links should show an explicit recovery message')
assert.ok(pipelineSource.includes('Back to Leads'), 'stale lead workspace links should offer a path back to the lead list')
assert.match(pipelineSource, /const resolvedRouteLeadId = normalizeText\(snapshot\?\.resolvedLeadId \|\| snapshot\.leads\[0\]\?\.leadId\)[\s\S]*?setSelectedLeadId\(resolvedRouteLeadId\)/, 'listing-derived lead routes should pivot the selected workspace row to the resolved canonical lead id')

assert.match(
  agencyCrmRepositorySource,
  /async function resolveListingDerivedLeadRow\(workspaceId, routeUuid\)[\s\S]*?\.from\('private_listings'\)[\s\S]*?seller_lead_id[\s\S]*?originating_crm_lead_id/,
  'lead workspace repository should resolve route IDs through linked private listing seller lead columns',
)
assert.match(
  agencyCrmRepositorySource,
  /\.eq\('lead_id', resolvedLeadId\)[\s\S]*?\.from\('tasks'\)[\s\S]*?\.eq\('lead_id', resolvedLeadId\)/,
  'lead workspace activities and tasks should load against the resolved canonical lead id',
)
assert.match(
  agencyCrmRepositorySource,
  /const LEAD_WORKSPACE_OPTIONAL_QUERY_TIMEOUT_MS = 2500/,
  'lead workspace optional enrichment should have its own shorter timeout',
)
assert.match(
  agencyCrmRepositorySource,
  /settleOptionalLeadWorkspaceQuery\(contactPromise, 'lead contact lookup'\)[\s\S]*?settleOptionalLeadWorkspaceQuery\(activityPromise, 'lead activity lookup'\)[\s\S]*?settleOptionalLeadWorkspaceQuery\(taskPromise, 'lead task lookup'\)/,
  'lead workspace should open from the core lead row even when optional enrichment is slow',
)
assert.match(
  agencyCrmRepositorySource,
  /leadWorkspaceStatus: leadBlocked \? 'unavailable' : 'not_found'[\s\S]*?leadWorkspaceReason: leadBlocked \? 'lead_lookup_unavailable' : \(listingResolution\?\.reason \|\| 'lead_not_found'\)/,
  'lead workspace repository should return terminal status for stale listing-derived IDs instead of retrying indefinitely',
)
assert.match(
  leadWorkspaceIndexesMigration,
  /lead_activities_org_lead_activity_hot_path_idx[\s\S]*?on public\.lead_activities \(organisation_id, lead_id, activity_date desc, created_at desc\)/,
  'lead workspace activity timeline should have a tenant and lead scoped ordering index',
)
assert.match(
  leadWorkspaceIndexesMigration,
  /contacts_org_contact_hot_path_idx[\s\S]*?on public\.contacts \(organisation_id, contact_id\)/,
  'lead workspace contact lookup should have a tenant and contact scoped index',
)
assert.match(
  leadWorkspaceIndexesMigration,
  /private_listings_org_originating_crm_lead_hot_path_idx[\s\S]*?on public\.private_listings \(organisation_id, originating_crm_lead_id, updated_at desc\)/,
  'listing-derived workspace routes should have a hot-path originating CRM lead index',
)

assert.match(
  privateListingServiceSource,
  /let sellerPortalPayloadRpcUnavailable = false[\s\S]*?function isRecoverableSellerPortalPayloadRpcError\(error\)[\s\S]*?sellerPortalPayloadRpcUnavailable = true/s,
  'seller portal payload RPC should circuit-break recoverable non-secure backend failures',
)
assert.match(
  privateListingServiceSource,
  /const securePortalLookup = requirePortalAccess \|\| Boolean\(accessToken\)[\s\S]*?if \(sellerPortalPayloadRpcUnavailable && !securePortalLookup\) return null/s,
  'seller portal payload circuit breaker should only skip non-secure fallback lookups',
)
assert.match(
  documentPacketsApiSource,
  /let documentWorkspaceStatusFastPathUnavailable = false[\s\S]*?FAST_PATH_DISABLED[\s\S]*?documentWorkspaceStatusFastPathUnavailable = true/s,
  'document workspace status fast path should disable itself after recoverable RPC failures',
)
assert.match(
  packetStatusResolverSource,
  /status >= 500[\s\S]*?code === 'FAST_PATH_DISABLED'/s,
  'document packet resolver should treat disabled or failing fast path reads as fallbackable',
)

assert.match(
  migration,
  /create or replace function public\.bridge_private_listing_seller_portal_payload_phase1\(/,
  'corrective migration should redefine the phase1 seller portal payload used by stable-token wrappers',
)
assert.match(
  migration,
  /bridge_promote_pending_private_listing_documents\(v_listing\.id\)[\s\S]*?exception[\s\S]*?when others then[\s\S]*?null;/,
  'seller portal document promotion should not take down payload reads',
)
for (const assignment of [
  "v_requirements := '[]'::jsonb;",
  "v_documents := '[]'::jsonb;",
  "v_appointments := '[]'::jsonb;",
  "v_mandate_packet := 'null'::jsonb;",
]) {
  assert.ok(migration.includes(assignment), `optional seller portal enrichment should fail closed with ${assignment}`)
}
assert.match(
  migration,
  /when undefined_column or undefined_table then[\s\S]*?v_appointments := '\[\]'::jsonb;/,
  'appointment enrichment should be protected from production schema drift',
)
assert.match(
  migration,
  /revoke all on function public\.bridge_private_listing_seller_portal_payload_phase1\(text, text, boolean\)/,
  'phase1 payload should remain callable only through the guarded public wrapper',
)
assert.match(
  migration,
  /notify pgrst, 'reload schema';/,
  'PostgREST schema cache should be reloaded after redefining the RPC dependency',
)

console.log('pipeline and seller portal stability checks passed')
