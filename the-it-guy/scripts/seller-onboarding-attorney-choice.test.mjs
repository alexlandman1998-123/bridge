import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [leadWorkspace, attorneySelector, sellerOnboarding, privateListingService, acceptanceMigration, resolutionMigration] = await Promise.all([
  readFile(new URL('../src/pages/AgentLeadsPage.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/AttorneySelector.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/SellerOnboarding.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/services/privateListingService.js', import.meta.url), 'utf8'),
  readFile(new URL('../../supabase/migrations/20260719194500_seller_onboarding_preferred_transfer_attorney_acceptance.sql', import.meta.url), 'utf8'),
  readFile(new URL('../../supabase/migrations/202607200002_seller_onboarding_connected_attorney_resolution.sql', import.meta.url), 'utf8'),
])

assert.ok(leadWorkspace.includes('function PreferredAttorneySelectionModal'), 'seller sends must open the attorney picker')
assert.ok(leadWorkspace.includes('Confirm attorney & send'), 'the picker must require an explicit confirmation')
assert.ok(leadWorkspace.includes('onSendSellerOnboarding={requestSellerOnboardingSend}'), 'seller workspace send actions must route through the picker')
assert.ok(leadWorkspace.includes('<AttorneySelector'), 'the attorney picker must use the premium searchable selector')
assert.ok(!attorneySelector.includes('<select'), 'the attorney picker must not use a native browser select')
assert.ok(attorneySelector.includes("from 'cmdk'"), 'the attorney picker must use the accessible command pattern')
assert.ok(attorneySelector.includes('Search connected attorneys...'), 'the attorney picker must support firm and location search')
assert.ok(attorneySelector.includes("isMobile ? 'fixed inset-x-0 bottom-0"), 'the attorney picker must become a bottom sheet on mobile')
assert.ok(leadWorkspace.includes("getPartnerAssignmentOptions(snapshot, 'transfer_attorney', accessContext)"), 'the dropdown must load accepted connected attorney firms')
assert.ok(leadWorkspace.includes('transferAttorneyPartnerOrganisationId: preferredAttorneyId'), 'the selected connected organisation must be bound to onboarding creation')
assert.ok(privateListingService.includes(".eq('id', requestedPreferredAttorneyId)"), 'the service must validate the selected attorney against the agency')
assert.ok(privateListingService.includes("client.rpc('bridge_resolve_seller_connected_transfer_attorney'"), 'the send path must resolve the connected organisation automatically')

assert.ok(sellerOnboarding.includes('This is our preferred transferring attorney. Do you accept?'), 'seller onboarding must present the agency nomination')
assert.ok(sellerOnboarding.includes("'accept_preferred'"), 'seller onboarding must support accepting the preferred attorney')
assert.ok(sellerOnboarding.includes("'nominate_other'"), 'seller onboarding must support nominating another attorney')
assert.ok(sellerOnboarding.includes('sellerNominatedTransferAttorney'), 'alternative attorney details must be persisted')

assert.ok(acceptanceMigration.includes("'seller_onboarding_acceptance'"), 'seller acceptance must be auditable on the allocation')
assert.ok(acceptanceMigration.includes("insert into public.private_listing_role_players"), 'seller acceptance must create the attorney pipeline allocation')
assert.ok(acceptanceMigration.includes("allocation_status = 'withdrawn'"), 'an alternative seller nomination must remove a stale preferred allocation')
assert.ok(resolutionMigration.includes('bridge_is_active_member(p_organisation_id)'), 'the connected-attorney resolver must require active agency membership')
assert.match(resolutionMigration, /coalesce\(relationship\.status, relationship\.relationship_status, ''\)\) = 'accepted'/, 'the resolver must require an accepted organisation connection')
assert.match(resolutionMigration, /coalesce\(organisation\.type, ''\)\) = 'attorney_firm'/, 'the resolver must reject non-attorney organisations')
assert.ok(resolutionMigration.includes('insert into public.organisation_preferred_partners'), 'the resolver must create the internal onboarding record automatically')
assert.ok(resolutionMigration.includes('to authenticated;'), 'signed-in users must be able to call the guarded resolver')

console.log('seller onboarding attorney choice checks passed')
