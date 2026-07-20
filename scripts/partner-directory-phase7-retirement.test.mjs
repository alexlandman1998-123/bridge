import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

const migration = read('supabase/migrations/202607200013_retire_legacy_partner_paths.sql')
const settingsApi = read('the-it-guy/src/lib/settingsApi.js')
const partnerNetwork = read('the-it-guy/src/services/partnerNetworkService.js')
const privateAllocation = read('the-it-guy/src/services/privateListingAttorneyAllocationService.js')
const privateListing = read('the-it-guy/src/services/privateListingService.js')
const bondNotifications = read('the-it-guy/src/services/bondIntakeNotificationService.js')
const app = read('the-it-guy/src/App.jsx')
const addDevelopment = read('the-it-guy/src/components/AddDevelopmentModal.jsx')
const transactionApi = read('the-it-guy/src/lib/api.js')

assert.match(migration, /create or replace function public\.bridge_save_organisation_partner/i)
assert.match(migration, /create or replace function public\.bridge_remove_organisation_partner/i)
assert.match(migration, /create or replace function public\.bridge_list_partner_connections_canonical/i)
assert.match(migration, /revoke insert, update, delete on public\.partner_connections from public, anon, authenticated/i)
assert.match(migration, /revoke insert, update, delete on public\.organisation_preferred_partners from public, anon, authenticated/i)
assert.match(migration, /revoke insert, update, delete on public\.developer_partner_relationships from public, anon, authenticated/i)
assert.match(migration, /revoke execute on function public\.bridge_allocate_private_listing_transfer_attorney\(/i)
assert.match(migration, /revoke execute on function public\.bridge_phase4_list_partner_connections\(uuid\)/i)

assert.match(settingsApi, /bridge_save_organisation_partner/)
assert.match(settingsApi, /bridge_remove_organisation_partner/)
assert.doesNotMatch(settingsApi, /\.from\('organisation_preferred_partners'\)/)
assert.doesNotMatch(settingsApi, /bridge_upsert_organisation_partner_identity/)
assert.match(partnerNetwork, /bridge_list_partner_connections_canonical/)
assert.doesNotMatch(partnerNetwork, /bridge_phase4_list_partner_connections/)
assert.match(privateAllocation, /bridge_allocate_private_listing_transfer_attorney_v2/)
assert.doesNotMatch(privateAllocation, /bridge_allocate_private_listing_transfer_attorney'\s*,/)
assert.doesNotMatch(privateListing, /\.from\('organisation_preferred_partners'\)/)
assert.doesNotMatch(bondNotifications, /\.from\('organisation_preferred_partners'\)/)
assert.match(app, /path="\/developer\/partners"[\s\S]*<Navigate to="\/partners" replace \/>/)
assert.doesNotMatch(app, /DeveloperPartnersPage/)
assert.match(addDevelopment, /listOrganisationPreferredPartners/)
assert.doesNotMatch(addDevelopment, /fetchDeveloperPartnersWorkspace/)
assert.match(transactionApi, /item\.partnerRoleConfigurationId[\s\S]*partner_role_configuration_id/)

console.log('Partner directory Phase 7 legacy-path retirement contract passed.')
