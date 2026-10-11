import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildSellerRelationshipReport } from '../src/services/listings/listingSellerRelationshipModel.js'
import { sellerPersonSourceKey } from '../src/lib/sellerDataOwnershipContract.js'
import { buildCanonicalSellerOnboardingPayload } from '../src/services/documents/sellerOnboardingFactTransformer.js'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

const repoRoot = resolve(import.meta.dirname, '..', '..')
const appRoot = resolve(import.meta.dirname, '..')

const migration = readFileSync(
  resolve(repoRoot, 'supabase/migrations/202606090005_private_listing_relationship_graph_integrity.sql'),
  'utf8',
)
const idempotencyMigration = readFileSync(
  resolve(repoRoot, 'supabase/migrations/202606090001_private_listing_conversion_idempotency.sql'),
  'utf8',
)
const sourceOfTruthContract = readFileSync(
  resolve(appRoot, 'docs/seller-lead-listing-source-of-truth.md'),
  'utf8',
)
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

test('extended graph migration is diagnostic and indexes compatibility links', () => {
  assert.match(migration, /create index if not exists private_listings_seller_profile_id_idx/i)
  assert.match(migration, /create index if not exists private_listings_property_profile_id_idx/i)
  assert.match(migration, /create index if not exists leads_converted_transaction_id_idx/i)
  assert.doesNotMatch(migration, /foreign key \(seller_profile_id\)/i)
  assert.doesNotMatch(migration, /foreign key \(property_profile_id\)/i)
})

test('extended graph report covers organisation and backlink integrity', () => {
  assert.match(migration, /bridge_private_listing_relationship_graph_integrity_report\(\)/i)
  assert.match(migration, /lead_listing_organisation_mismatches/i)
  assert.match(migration, /transaction_listing_organisation_mismatches/i)
  assert.match(migration, /private_listing_originating_lead_organisation_mismatches/i)
  assert.match(migration, /private_listing_seller_lead_organisation_mismatches/i)
  assert.match(migration, /lead_contact_organisation_mismatches/i)
  assert.match(migration, /transaction_seller_contact_organisation_mismatches/i)
  assert.match(migration, /listing_mandate_packet_organisation_mismatches/i)
  assert.match(migration, /lead_mandate_packet_organisation_mismatches/i)
  assert.match(migration, /lead_transaction_listing_mismatches/i)
  assert.match(migration, /transactions_without_listing_backlink_to_lead/i)
  assert.match(migration, /duplicate_transactions_per_listing/i)
})

test('extended graph report keeps text lead links compatible with existing idempotency guard', () => {
  assert.match(idempotencyMigration, /private_listings_one_active_originating_lead_idx/i)
  assert.match(idempotencyMigration, /private_listings_one_active_seller_lead_idx/i)
  assert.match(migration, /nullif\(trim\(pl\.originating_crm_lead_id\), ''\) ~\* v_uuid_regex/i)
  assert.match(migration, /nullif\(trim\(pl\.seller_lead_id\), ''\) ~\* v_uuid_regex/i)
  assert.match(migration, /l\.lead_id::text = nullif\(trim\(pl\.originating_crm_lead_id\), ''\)/i)
  assert.match(migration, /l\.lead_id::text = nullif\(trim\(pl\.seller_lead_id\), ''\)/i)
})

test('extended graph report is service-only', () => {
  assert.match(migration, /revoke all on function public\.bridge_private_listing_relationship_graph_integrity_report\(\) from authenticated/i)
  assert.match(migration, /grant execute on function public\.bridge_private_listing_relationship_graph_integrity_report\(\) to service_role/i)
})

test('source-of-truth contract documents graph integrity behavior', () => {
  assert.match(sourceOfTruthContract, /bridge_private_listing_relationship_graph_integrity_report\(\)/)
  assert.match(sourceOfTruthContract, /lead\/listing\/transaction organisation mismatches/)
  assert.match(sourceOfTruthContract, /converted lead transaction links pointing at a different listing/)
  assert.match(sourceOfTruthContract, /multiple transactions attached to the same listing/)
  assert.match(sourceOfTruthContract, /remain compatibility links until the canonical seller\/property profile tables are/)
})

test('package exposes the graph integrity test', () => {
  assert.equal(
    packageJson.scripts['test:seller-listing-relationship-graph-integrity'],
    'node scripts/seller-listing-relationship-graph-integrity.test.mjs',
  )
})

function snapshot() {
  const tables = {
    private_listings: [{ id: 'listing-1', organisation_id: 'agency-1', seller_lead_id: 'lead-1' }],
    leads: [{ lead_id: 'lead-1', organisation_id: 'agency-1', listing_id: 'listing-1', contact_id: 'contact-1', converted_transaction_id: 'transaction-1' }],
    contacts: [{ contact_id: 'contact-1', organisation_id: 'agency-1' }],
    private_listing_seller_onboarding: [{ id: 'onboarding-1', private_listing_id: 'listing-1',
      form_data: { multipleOwners: [{ id: 'owner-1', email: 'shared@example.test' }, { id: 'owner-2', email: 'shared@example.test' }] },
      canonical_facts_json: { seller: { owners: [{ id: 'owner-1' }, { id: 'owner-2' }] } } }],
    transactions: [{ id: 'transaction-1', organisation_id: 'agency-1', listing_id: 'listing-1', seller_contact_id: 'contact-1' }],
    transaction_participants: ['1', '2'].map(id => ({ id: `participant-${id}`, transaction_id: 'transaction-1', role_type: 'seller' })),
    agency_client_profiles: [{ id: 'client-1', organisation_id: 'agency-1' }],
    agency_client_links: [{ id: 'link-1', organisation_id: 'agency-1', client_id: 'client-1', source_kind: 'contact', source_id: 'contact-1' }],
    client_portal_contexts: [{ id: 'portal-1', transaction_id: 'transaction-1', listing_id: 'listing-1' }],
    profiles: [],
  }
  return { tables, completeTables: Object.keys(tables), personLinks: ['1', '2'].map(id => ({ transactionParticipantId: `participant-${id}`, onboardingId: 'onboarding-1', personId: `owner-${id}` })) }
}
const codes = result => result.issues.map(row => row.code)

test('read-only ownership report identifies the current profile and distinct people without mutation', () => {
  const input = snapshot()
  const before = JSON.stringify(input)
  const result = buildSellerRelationshipReport(input)
  assert.equal(result.status, 'aligned_relationships')
  assert.equal(result.journeys[0].currentProfile.id, 'onboarding-1')
  assert.equal(result.summary.people, 2)
  assert.equal(JSON.stringify(input), before)
})

test('person source identity survives rename and reorder and never matches shared email', () => {
  const input = snapshot()
  const original = buildSellerRelationshipReport(input).people.map(row => row.sourceKey).sort()
  input.tables.private_listing_seller_onboarding[0].form_data.multipleOwners.reverse()
  input.tables.private_listing_seller_onboarding[0].form_data.multipleOwners[0].name = 'Renamed owner'
  assert.deepEqual(buildSellerRelationshipReport(input).people.map(row => row.sourceKey).sort(), original)
  input.personLinks = []
  assert.equal(codes(buildSellerRelationshipReport(input)).filter(code => code === 'participant_person_link_unconfirmed').length, 2)
})

test('a captured CC roster uses the confirmed member role without changing source identity', () => {
  const input = snapshot()
  const form = input.tables.private_listing_seller_onboarding[0].form_data
  form.ownerStructureType = 'close_corporation'
  form.companyDirectors = [{ id: 'member-1' }]
  const result = buildSellerRelationshipReport(input)
  assert.equal(result.people.find(row => row.personId === 'member-1').role, 'member')
  assert.equal(result.people.find(row => row.personId === 'member-1').sourceKey, sellerPersonSourceKey('onboarding-1', 'member-1'))
})

test('cross-agency contact links are rejected as relationship findings', () => {
  const input = snapshot()
  input.tables.contacts[0].organisation_id = 'agency-2'
  assert.ok(codes(buildSellerRelationshipReport(input)).includes('relationship_crosses_organisation'))
})

test('an unloaded target is unchecked; a missing target in a complete snapshot is a finding', () => {
  const input = snapshot()
  delete input.tables.contacts
  const partial = buildSellerRelationshipReport(input)
  assert.ok(partial.coverage.incompleteTables.includes('contacts'))
  assert.ok(partial.unchecked.some(row => row.field === 'contact_id'))
  assert.ok(!codes(partial).includes('relationship_target_missing'))
  input.tables.contacts = []
  assert.ok(codes(buildSellerRelationshipReport(input)).includes('relationship_target_missing'))
})

test('two captured profiles are ambiguous even when one timestamp is later', () => {
  const input = snapshot()
  input.tables.private_listing_seller_onboarding.push({ id: 'onboarding-2', private_listing_id: 'listing-1', updated_at: '2099-01-01T00:00:00Z' })
  const result = buildSellerRelationshipReport(input)
  assert.ok(codes(result).includes('current_seller_profile_ambiguous'))
  assert.equal(result.journeys[0].currentProfile.id, '')
})

test('converted transaction and portal links must point to the same listing journey', () => {
  const input = snapshot()
  input.tables.transactions[0].listing_id = 'listing-2'
  const result = buildSellerRelationshipReport(input)
  assert.ok(codes(result).includes('converted_transaction_listing_differs'))
  assert.ok(codes(result).includes('portal_transaction_listing_differs'))
  assert.ok(codes(result).includes('participant_person_listing_differs'))
})

test('the seller_profile_id compatibility link is not treated as a client profile foreign key', () => {
  const input = snapshot()
  input.tables.private_listings[0].seller_profile_id = 'client-1'
  assert.ok(codes(buildSellerRelationshipReport(input)).includes('seller_profile_compatibility_link_unresolved'))
  input.tables.contacts.push({ contact_id: 'client-1', organisation_id: 'agency-1' })
  input.tables.profiles.push({ id: 'client-1' })
  assert.ok(codes(buildSellerRelationshipReport(input)).includes('seller_profile_compatibility_link_ambiguous'))
})

test('missing and duplicated person references are flagged instead of generated by position', () => {
  const input = snapshot()
  input.tables.private_listing_seller_onboarding[0].form_data.multipleOwners = [{ name: 'No id' }, { id: 'same-id' }, { id: 'same-id' }]
  const result = buildSellerRelationshipReport(input)
  assert.ok(codes(result).includes('person_source_identity_missing'))
  assert.ok(codes(result).includes('person_source_identity_duplicated'))
  assert.ok(!result.people.some(row => row.personId === 'owner-1'))
})

test('actual canonical transformation preserves saved roster source identities', () => {
  const input = snapshot()
  const onboarding = input.tables.private_listing_seller_onboarding[0]
  onboarding.form_data = { ownerEntityType: 'natural_person', ownerStructureType: 'multiple_owners',
    multipleOwners: [{ id: 'owner-1', name: 'One', surname: 'Owner' }, { id: 'owner-2', name: 'Two', surname: 'Owner' }] }
  const payload = buildCanonicalSellerOnboardingPayload(onboarding.form_data)
  onboarding.canonical_facts_json = payload.canonicalSellerFacts
  assert.ok(!codes(buildSellerRelationshipReport(input)).includes('canonical_person_source_identity_missing'))
  assert.ok(buildSellerRelationshipReport(input).people.some(row => row.sourceKey === sellerPersonSourceKey('onboarding-1', 'owner-1')))
})

test('client source duplicates and merge cycles require review', () => {
  const input = snapshot()
  input.tables.agency_client_links.push({ ...input.tables.agency_client_links[0], id: 'link-2' })
  input.tables.agency_client_profiles[0].merged_into = 'client-1'
  const result = buildSellerRelationshipReport(input)
  assert.ok(codes(result).includes('client_source_link_ambiguous'))
  assert.ok(codes(result).includes('client_merge_cycle'))
})

test('a listing awaiting capture is distinguished from an unloaded or failed audit', () => {
  const input = snapshot()
  input.tables.private_listing_seller_onboarding = []
  input.tables.transaction_participants = []
  assert.equal(buildSellerRelationshipReport(input).status, 'capture_required')
  assert.equal(buildSellerRelationshipReport({}).status, 'incomplete')
})

test('reports omit seller values and portal credentials', () => {
  const input = snapshot()
  Object.assign(input.tables.private_listing_seller_onboarding[0], { token: 'SECRET_TOKEN', password_hash: 'SECRET_HASH' })
  input.tables.contacts[0].name = 'PRIVATE_NAME'
  input.tables.contacts[0].email = 'PRIVATE_EMAIL'
  const output = JSON.stringify(buildSellerRelationshipReport(input))
  for (const value of ['SECRET_TOKEN', 'SECRET_HASH', 'PRIVATE_NAME', 'PRIVATE_EMAIL', 'shared@example.test']) assert.ok(!output.includes(value))
})

test('conflicting roster aliases and multiple mappings cannot choose a source person', () => {
  const input = snapshot()
  input.tables.private_listing_seller_onboarding[0].form_data.owners = [{ id: 'different-person' }]
  input.personLinks.push({ transactionParticipantId: 'participant-1', onboardingId: 'onboarding-1', personId: 'owner-2' })
  const result = buildSellerRelationshipReport(input)
  assert.ok(codes(result).includes('person_roster_aliases_conflict'))
  assert.ok(codes(result).includes('participant_person_link_ambiguous'))
})

test('unknown client source kinds and an empty export cannot produce a passing graph', () => {
  const input = snapshot()
  input.tables.agency_client_links[0].source_kind = 'unknown_source'
  assert.ok(codes(buildSellerRelationshipReport(input)).includes('client_source_kind_unknown'))
  for (const table of Object.keys(input.tables)) input.tables[table] = []
  assert.equal(buildSellerRelationshipReport(input).status, 'no_records')
})

test('offline report gates findings, rejects apply and leaves input unchanged', () => {
  const dir = mkdtempSync(resolve(tmpdir(), 'seller-ownership-'))
  try {
    const path = resolve(dir, 'snapshot.json')
    const input = JSON.stringify(snapshot())
    writeFileSync(path, input)
    const script = resolve(appRoot, 'scripts/report-seller-data-ownership.mjs')
    const success = spawnSync(process.execPath, [script, `--input=${path}`], { encoding: 'utf8' })
    assert.equal(success.status, 0, success.stderr)
    assert.equal(JSON.parse(success.stdout).mode, 'read_only')
    assert.equal(readFileSync(path, 'utf8'), input, 'report must leave the snapshot untouched')
    const failed = spawnSync(process.execPath, [script, '--apply'], { encoding: 'utf8' })
    assert.equal(failed.status, 1)
    assert.match(failed.stderr, /apply is unsupported/)
    assert.equal(readFileSync(path, 'utf8'), input)
    writeFileSync(path, '{}')
    assert.equal(spawnSync(process.execPath, [script, `--input=${path}`], { encoding: 'utf8' }).status, 1)
    writeFileSync(path, input)
    assert.equal(readFileSync(path, 'utf8'), input)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

console.log('seller listing relationship graph integrity and ownership report tests passed')
