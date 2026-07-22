import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

const migration = read('supabase/migrations/202607200009_partner_identity_linking_and_deduplication.sql')
const settingsApi = read('the-it-guy/src/lib/settingsApi.js')
const partnersRepository = read('the-it-guy/src/lib/partnersRepository.js')
const partnersPage = read('the-it-guy/src/pages/PartnersPage.jsx')
const directoryService = read('the-it-guy/src/services/partnerDirectoryService.js')

assert.match(migration, /add column if not exists external_partner_id uuid/i)
assert.match(migration, /create table if not exists public\.partner_identity_aliases/i)
assert.match(migration, /bridge_merge_preferred_partner_identity/i)
assert.match(migration, /organisation_preferred_partners_linked_identity_idx/i)
assert.match(migration, /organisation_preferred_partners_external_identity_idx/i)
assert.match(migration, /partner_invitations_pending_organisation_identity_idx/i)
assert.match(migration, /partner_invitations_pending_email_identity_idx/i)
assert.match(migration, /bridge_link_partner_identity_on_acceptance/i)
assert.match(migration, /partner_invitation_link_identity_on_acceptance/i)
assert.match(migration, /bridge_upsert_organisation_partner_identity/i)
assert.match(migration, /pg_advisory_xact_lock/i)
assert.match(migration, /accepted_invitation_identity_link/i)
assert.match(migration, /update public\.transaction_role_players[\s\S]*preferred_partner_id = v_canonical\.id/i)
assert.match(migration, /update public\.private_listing_role_players[\s\S]*preferred_partner_id = v_canonical\.id/i)

assert.match(settingsApi, /client\.rpc\('bridge_save_organisation_partner'/)
assert.doesNotMatch(settingsApi, /bridge_upsert_organisation_partner_identity/)
assert.match(partnersRepository, /externalPartnerId = ''/)
assert.match(partnersRepository, /external_partner_id: normalizeNullableUuid\(externalPartnerId\)/)
assert.match(partnersRepository, /String\(result\.error\.code \|\| ''\) === '23505'/)
assert.match(partnersRepository, /recipientOrganisationId: resolvedRecipientOrganisationId/)
assert.match(partnersPage, /externalPartnerId: savedPartner\?\.id \|\| ''/)
assert.match(directoryService, /counterpart\.externalPartnerId[\s\S]*`external:\$\{counterpart\.externalPartnerId\}`/)

console.log('Partner directory Phase 3 identity-linking contract passed.')
