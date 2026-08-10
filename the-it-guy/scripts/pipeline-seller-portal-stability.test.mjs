import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const pipelineSource = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')
const agencyCrmRepositorySource = await readFile(new URL('../src/lib/agencyCrmRepository.js', import.meta.url), 'utf8')
const privateListingServiceSource = await readFile(new URL('../src/services/privateListingService.js', import.meta.url), 'utf8')
const documentPacketsApiSource = await readFile(new URL('../src/lib/documentPacketsApi.js', import.meta.url), 'utf8')
const packetStatusResolverSource = await readFile(new URL('../src/core/documents/packetStatusResolver.js', import.meta.url), 'utf8')
const clientPortalPageSource = await readFile(new URL('../src/pages/ClientPortal.jsx', import.meta.url), 'utf8')
const finalSignedResolverSource = await readFile(
  new URL('../../supabase/functions/resolve-final-signed-document-access/index.ts', import.meta.url),
  'utf8',
)
const migration = await readFile(
  new URL('../../supabase/migrations/202607250007_seller_portal_payload_optional_enrichment_guard.sql', import.meta.url),
  'utf8',
)
const corePayloadMigration = await readFile(
  new URL('../../supabase/migrations/202607270003_seller_portal_core_payload_fast_entry.sql', import.meta.url),
  'utf8',
)
const corePayloadTrimMigration = await readFile(
  new URL('../../supabase/migrations/202607270004_seller_portal_core_payload_trim_onboarding.sql', import.meta.url),
  'utf8',
)
const corePayloadSalesMigration = await readFile(
  new URL('../../supabase/migrations/202607270007_seller_portal_core_sales_documents.sql', import.meta.url),
  'utf8',
)
const clientPortalWorkspaceSource = await readFile(new URL('../src/services/clientPortalWorkspaceService.js', import.meta.url), 'utf8')
const leadWorkspaceTabSelectionBlock = pipelineSource.match(
  /const handleLeadWorkspaceTabSelection = useCallback\(\(tabKey\) => \{[\s\S]*?\}, \[isLeadWorkspaceRoute\]\)/,
)?.[0] || ''

assert.match(
  pipelineSource,
  /const localFallbackAvailable = isUnsafeFallbackAllowed\(\)[\s\S]*?const snapshot = localFallbackAvailable \? getAgencyPipelineSnapshot\(orgId\) : createEmptyPipelineSnapshot\(orgId\)/,
  'pipeline reload should avoid reading production-blocked local CRM snapshots before remote data loads',
)
assert.match(
  pipelineSource,
  /function replaceLeadWorkspaceTabInUrl\(tab = ''\)[\s\S]*?window\.history\.replaceState\(window\.history\.state/,
  'lead workspace tab switches should update the URL without routing the page',
)
assert.ok(leadWorkspaceTabSelectionBlock.includes('replaceLeadWorkspaceTabInUrl(nextTab)'), 'lead workspace tab handler should use the non-routing URL update')
assert.doesNotMatch(leadWorkspaceTabSelectionBlock, /navigate\(/, 'lead workspace tab handler should not route on tab changes')
assert.doesNotMatch(leadWorkspaceTabSelectionBlock, /scrollIntoView/, 'lead workspace tab handler should not force a page jump on tab changes')
assert.match(
  pipelineSource,
  /if \([\s\S]*?applyLocalSnapshot &&[\s\S]*?localFallbackAvailable &&[\s\S]*?requestId === reloadRequestRef\.current[\s\S]*?\) \{[\s\S]*?applySnapshotRecords\(snapshot\)[\s\S]*?markPrimaryRecordsReady\(\)/,
  'pipeline reload should only paint local snapshots when unsafe fallbacks are explicitly enabled',
)
assert.match(
  pipelineSource,
  /relatedCrmSnapshotPromise = withPipelineTimeout\([\s\S]*?listAgencyCrmLeadContacts\(orgId, \{[\s\S]*?includePrimaryRecords: false[\s\S]*?includeLocalFallback: false/s,
  'pipeline list load should hydrate lead activities/tasks separately from the first lead row paint',
)
assert.match(
  pipelineSource,
  /listAgencyCrmLeadContacts\(orgId, \{[\s\S]*?includeRelatedRecords: false[\s\S]*?\}\)/s,
  'pipeline list load should fetch leads and contacts before waiting on related activity/task rows',
)
assert.match(
  pipelineSource,
  /if \(crmLeads\.length\) \{[\s\S]*?markPrimaryRecordsReady\(\)[\s\S]*?\}/,
  'pipeline list load should leave the skeleton up for truly empty CRM results until private-listing fallback is checked',
)
assert.match(pipelineSource, /const PIPELINE_CONTEXT_TIMEOUT_MS = 8000/, 'context loads should not timeout at 3.5s')
assert.match(pipelineSource, /const PIPELINE_RECORDS_TIMEOUT_MS = 10000/, 'private listing and record enrichments should get the same 10s budget as CRM')
assert.match(pipelineSource, /const LEAD_WORKSPACE_HYDRATION_TIMEOUT_MS = 8000/, 'lead workspace hydration should not retry on a 2.5s hair trigger')
assert.match(pipelineSource, /snapshot\?\.leadWorkspaceStatus === 'not_found'[\s\S]*?setRouteLeadHydrationStatus\('not_found'\)/, 'stale lead workspace links should stop retrying and enter a not-found state')
assert.ok(pipelineSource.includes('This lead link is stale or the lead has been removed from the selected workspace.'), 'stale lead workspace links should show an explicit recovery message')
assert.ok(pipelineSource.includes('Back to Leads'), 'stale lead workspace links should offer a path back to the lead list')
assert.match(pipelineSource, /const resolvedRouteLeadId = normalizeText\(snapshot\?\.resolvedLeadId \|\| snapshot\.leads\[0\]\?\.leadId\)[\s\S]*?setSelectedLeadId\(resolvedRouteLeadId\)/, 'listing-derived lead routes should pivot the selected workspace row to the resolved canonical lead id')
assert.match(
  pipelineSource,
  /const routeLeadWorkspaceSnapshotRef = useRef\(null\)/,
  'lead workspace should keep a route-specific hydration snapshot',
)
assert.match(
  pipelineSource,
  /mergeActiveRouteLeadSnapshot[\s\S]*?routeLeadWorkspaceSnapshotRef\.current[\s\S]*?sourceHasRouteLead[\s\S]*?mergeLeadRowsForReload\(sourceLeads, pinned\.leads\)/,
  'background pipeline refreshes should preserve the active route lead when the full list omits it',
)
assert.match(
  pipelineSource,
  /function resolveActualLeadSource[\s\S]*?isLifecycleLeadSourceLabel/,
  'seller lead fallback rows should resolve actual lead sources separately from lifecycle labels',
)
assert.match(
  pipelineSource,
  /const leadSource = resolveActualLeadSource\([\s\S]*?localRow\.leadSource[\s\S]*?remoteRow\.leadSource[\s\S]*?baseRow\.leadSource/,
  'lead refresh merges should preserve persisted CRM lead sources over listing lifecycle fallback labels',
)
assert.match(
  pipelineSource,
  /const preserveCrmLifecycle = Boolean\(localRow\?\.leadId\) && isPrivateListingFallbackLead\(remoteRow\)/,
  'private-listing fallback rows must not overwrite persisted CRM lifecycle stage/status values',
)
assert.match(
  pipelineSource,
  /first_contacted_at: firstWorkspaceText\(baseRow\.first_contacted_at, baseRow\.firstContactedAt, localRow\.first_contacted_at, localRow\.firstContactedAt\)/,
  'lead refresh merges should preserve first-contact evidence across camelCase and snake_case fields',
)
assert.doesNotMatch(
  pipelineSource,
  /leadSource:\s*['"]Seller Onboarding['"]/,
  'seller listing fallback rows must not populate the Source column with the seller onboarding lifecycle label',
)
assert.match(
  pipelineSource,
  /routeLeadWorkspaceSnapshotRef\.current = \{[\s\S]*?requestedLeadId: normalizeText\(routeLeadId\)[\s\S]*?resolvedLeadId: resolvedRouteLeadId/,
  'successful direct lead hydration should pin the requested and resolved lead ids',
)
const selectedLeadIsSellerDeclarationIndex = pipelineSource.indexOf('const selectedLeadIsSeller = resolveLeadCategoryView(selectedLead) === \'seller\'')
const buyerViewingReloadIndex = pipelineSource.indexOf('const reloadBuyerViewingPreferenceLinks = useCallback')
const sellerViewingReloadIndex = pipelineSource.indexOf('const reloadSellerViewingCoordinationLinks = useCallback')
assert.ok(selectedLeadIsSellerDeclarationIndex !== -1, 'selected lead seller classification should remain declared.')
assert.ok(
  selectedLeadIsSellerDeclarationIndex < buyerViewingReloadIndex &&
    selectedLeadIsSellerDeclarationIndex < sellerViewingReloadIndex,
  'selectedLeadIsSeller must be initialized before viewing reload callbacks use it in hook dependencies.',
)

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
  /const includePrimaryRecords = options\?\.includePrimaryRecords !== false[\s\S]*?const includeRelatedRecords = options\?\.includeRelatedRecords !== false/s,
  'CRM lead list repository should support primary-row and related-row load phases',
)
assert.match(
  agencyCrmRepositorySource,
  /includePrimaryRecords[\s\S]*?\.from\('contacts'\)[\s\S]*?: Promise\.resolve\(emptyResult\)[\s\S]*?includeRelatedRecords[\s\S]*?\.from\('lead_activities'\)[\s\S]*?: Promise\.resolve\(emptyResult\)/s,
  'CRM lead list repository should skip unneeded table queries for lightweight phases',
)
assert.match(
  agencyCrmRepositorySource,
  /leadWorkspaceStatus: leadBlocked \? 'unavailable' : 'not_found'[\s\S]*?leadWorkspaceReason: leadBlocked \? 'lead_lookup_unavailable' : \(listingResolution\?\.reason \|\| 'lead_not_found'\)/,
  'lead workspace repository should return terminal status for stale listing-derived IDs instead of retrying indefinitely',
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
  privateListingServiceSource,
  /fetchSellerClientPortalCorePayloadByToken\([\s\S]*?bridge_private_listing_seller_portal_core_payload/s,
  'seller portal core loads should use the fast core payload RPC',
)
assert.match(
  clientPortalWorkspaceSource,
  /includeRequirementsAndDocuments: !corePayload[\s\S]*?corePayload,/s,
  'seller portal core loads should request the lightweight onboarding payload',
)
assert.match(
  clientPortalWorkspaceSource,
  /if \(mode !== 'core'\) \{[\s\S]*?hydrateSellerMandatePacketForPortalData/s,
  'client portal core mode should not hydrate mandate packets before first paint',
)
assert.match(
  clientPortalWorkspaceSource,
  /if \(mode !== 'core' && portalData\?\.transaction\?\.id\)/,
  'client portal core mode should not load the workflow read model before first paint',
)
assert.match(
  corePayloadMigration,
  /create or replace function public\.bridge_private_listing_seller_portal_core_payload\(/,
  'seller portal needs a dedicated fast core payload RPC',
)
assert.match(
  corePayloadMigration,
  /'requirements', '\[\]'::jsonb,[\s\S]*?'documents', '\[\]'::jsonb,[\s\S]*?'appointments', '\[\]'::jsonb,[\s\S]*?'mandatePacket', 'null'::jsonb/s,
  'core payload must not synchronously enrich documents, appointments, or mandate artifacts',
)
assert.match(
  corePayloadMigration,
  /bridge_resolve_private_listing_seller_portal_token\(p_token\)/,
  'core payload must preserve stable, legacy, and invite token resolution',
)
assert.match(
  corePayloadTrimMigration,
  /v_onboarding_core := jsonb_build_object\(/,
  'seller portal core payload should return a deliberately slim onboarding object',
)
assert.doesNotMatch(
  corePayloadTrimMigration,
  /'onboarding', to_jsonb\(v_onboarding\)/,
  'seller portal core payload must not return the full onboarding form snapshot',
)
assert.doesNotMatch(
  corePayloadTrimMigration,
  /canonical_facts_json/,
  'seller portal core payload must not include canonical fact snapshots before first paint',
)
assert.match(
  privateListingServiceSource,
  /function mapSellerClientPortalCorePayload\(payload\)[\s\S]*?const mandatePacket = payload\?\.mandatePacket[\s\S]*?mandatePacket: safeMandatePacket/s,
  'seller portal core mapper should preserve compact mandate metadata for mobile Sales documents',
)
assert.match(
  clientPortalWorkspaceSource,
  /let mandatePacket = mapSellerMandatePacket\(context\?\.mandatePacket \|\| listing\?\.mandatePacket \|\| null\)/,
  'seller portal core document center should no longer discard compact mandate metadata',
)
assert.match(
  clientPortalWorkspaceSource,
  /resolveSellerClientPortalFinalSignedDocumentAccess\([\s\S]*?\)\.catch\(\(error\) => \{[\s\S]*?seller mandate final-signed access skipped during portal hydration[\s\S]*?return null[\s\S]*?\}\)/,
  'seller portal hydration should not fail the whole portal when final-signed access resolution returns a transient edge error',
)
assert.match(
  clientPortalPageSource,
  /openGeneratedPortalDocumentHtml\([\s\S]*?new Blob\(\[htmlWithPrintTools \|\| html\], \{ type: 'text\/html;charset=utf-8' \}\)/,
  'seller generated disclosure downloads should open rendered HTML instead of a fragile mobile PDF conversion',
)
assert.match(
  clientPortalPageSource,
  /documentId: normalizedPacketId && normalizedPacketVersionId \? '' : normalizedDocumentId/,
  'seller final signed mandate downloads should not send synthetic document ids when packet and version ids are present',
)
assert.match(
  clientPortalPageSource,
  /if \(!portal\) \{/,
  'document action failures should not replace an already-loaded seller portal with the fatal load screen',
)
assert.match(
  clientPortalPageSource,
  /window\.open\('about:blank', '_blank'\)/,
  'seller document downloads should pre-open a neutral tab instead of cloning the current portal route on mobile Safari',
)
assert.match(
  finalSignedResolverSource,
  /bridge_private_listing_seller_portal_core_payload[\s\S]*?bridge_private_listing_seller_portal_payload/,
  'seller final signed mandate authorization should use the fast core payload before falling back to the heavy payload',
)
assert.match(
  finalSignedResolverSource,
  /sellerPortalMandateAccess[\s\S]*?allowEvidenceArtifactAccess: context === "signer" \|\|[\s\S]*?sellerPortalMandateAccess/,
  'seller final signed mandates should fall back to the verified F2 artifact when transaction publication is not available yet',
)
assert.match(
  corePayloadSalesMigration,
  /'propertyDisclosure', v_form_data -> 'propertyDisclosure'[\s\S]*?'property_disclosure', v_form_data -> 'property_disclosure'/,
  'core payload should include generated seller disclosure data for the mobile Sales category',
)
assert.match(
  corePayloadSalesMigration,
  /'requirements', '\[\]'::jsonb,[\s\S]*?'documents', '\[\]'::jsonb,[\s\S]*?'appointments', '\[\]'::jsonb,[\s\S]*?'mandatePacket', coalesce\(v_mandate_packet, 'null'::jsonb\)/s,
  'core payload should keep general document hydration deferred while carrying compact mandate metadata',
)
assert.doesNotMatch(
  corePayloadSalesMigration,
  /'finalSignedFilePath'|'final_signed_file_path'|'rendered_file_path'/,
  'core payload Sales metadata must not expose raw storage paths',
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
