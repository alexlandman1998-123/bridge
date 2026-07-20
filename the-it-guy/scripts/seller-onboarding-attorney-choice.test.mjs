import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [leadWorkspace, sellerOnboarding, privateListingService, migration] = await Promise.all([
  readFile(new URL('../src/pages/AgentLeadsPage.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/SellerOnboarding.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/services/privateListingService.js', import.meta.url), 'utf8'),
  readFile(new URL('../../supabase/migrations/20260719194500_seller_onboarding_preferred_transfer_attorney_acceptance.sql', import.meta.url), 'utf8'),
])

assert.ok(leadWorkspace.includes('function PreferredAttorneySelectionModal'), 'seller sends must open the attorney picker')
assert.ok(leadWorkspace.includes('Confirm attorney & send'), 'the picker must require an explicit confirmation')
assert.ok(leadWorkspace.includes('onSendSellerOnboarding={requestSellerOnboardingSend}'), 'seller workspace send actions must route through the picker')
assert.ok(leadWorkspace.includes('transferAttorneyPreferredPartnerId: preferredAttorneyId'), 'the selected attorney id must be bound to onboarding creation')
assert.ok(privateListingService.includes(".eq('id', requestedPreferredAttorneyId)"), 'the service must validate the selected attorney against the agency')

assert.ok(sellerOnboarding.includes('This is our preferred transferring attorney. Do you accept?'), 'seller onboarding must present the agency nomination')
assert.ok(sellerOnboarding.includes("'accept_preferred'"), 'seller onboarding must support accepting the preferred attorney')
assert.ok(sellerOnboarding.includes("'nominate_other'"), 'seller onboarding must support nominating another attorney')
assert.ok(sellerOnboarding.includes('sellerNominatedTransferAttorney'), 'alternative attorney details must be persisted')

assert.ok(migration.includes("'seller_onboarding_acceptance'"), 'seller acceptance must be auditable on the allocation')
assert.ok(migration.includes("insert into public.private_listing_role_players"), 'seller acceptance must create the attorney pipeline allocation')
assert.ok(migration.includes("allocation_status = 'withdrawn'"), 'an alternative seller nomination must remove a stale preferred allocation')

console.log('seller onboarding attorney choice checks passed')
