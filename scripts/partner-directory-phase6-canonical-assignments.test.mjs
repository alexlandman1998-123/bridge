import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

const migration = read('supabase/migrations/202607200012_canonical_partner_assignment_ids.sql')
const api = read('the-it-guy/src/lib/api.js')
const settingsApi = read('the-it-guy/src/lib/settingsApi.js')
const options = read('the-it-guy/src/lib/newTransactionPartnerOptions.js')
const privateAllocation = read('the-it-guy/src/services/privateListingAttorneyAllocationService.js')

assert.match(migration, /bridge_resolve_partner_role_configuration/i)
assert.match(migration, /transaction_role_players_canonical_partner_assignment_check/i)
assert.match(migration, /private_listing_role_players_canonical_partner_assignment_check/i)
assert.match(migration, /transaction_partner_assignment_validate/i)
assert.match(migration, /private_listing_partner_assignment_validate/i)
assert.match(migration, /partner_role_configuration_id is null[\s\S]*preferred_partner_id is not null or partner_relationship_id is not null/i)
assert.match(migration, /foreign key \(partner_role_configuration_id\)[\s\S]*on delete restrict/i)
assert.match(migration, /bridge_list_organisation_partner_assignment_options/i)
assert.match(migration, /assignmentIdentitySource', 'organisation_partner_roles\.id'/i)
assert.match(migration, /bridge_allocate_private_listing_transfer_attorney_v2/i)
assert.match(migration, /Deprecated compatibility projection from partner_role_configuration_id/i)

assert.match(settingsApi, /bridge_list_organisation_partner_assignment_options/i)
assert.match(options, /partnerRoleConfigurationId:/i)
assert.match(api, /partner_role_configuration_id: item\.partnerRoleConfigurationId/i)
assert.match(api, /partnerRoleConfigurationId: normalizeTextValue/i)
assert.match(privateAllocation, /bridge_allocate_private_listing_transfer_attorney_v2/i)
assert.match(privateAllocation, /partnerRoleConfigurationId: row\.partner_role_configuration_id/i)

console.log('Partner directory Phase 6 canonical-assignment contract passed.')
