import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, writeFile, readFile, stat, chmod, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { buildSellerAlignmentSnapshotQuery } from './lib/seller-data-alignment-audit.mjs'
import { buildSellerReconciliationPacket, sanitizeSellerAlignmentSnapshot } from './lib/seller-data-reconciliation.mjs'
import { transactionSellerProfileFromSource } from '../src/core/transactions/transactionPartyProfile.js'

const projectRef = 'abcdefghijklmnopqrst'
const query = () => buildSellerAlignmentSnapshotQuery({ projectRef, environmentLabel: 'Synthetic test only' })
const cli = resolve(import.meta.dirname, 'report-seller-data-ownership.mjs')
const revision = '2026-10-10T12:00:00Z'
const form = () => ({ ownerStructureType: 'individual', sellerFirstName: 'Synthetic', sellerSurname: 'Owner', idNumber: 'SYNTHETIC-ID', primaryContactName: 'Synthetic Owner', email: 'current@example.test', sellerEmail: 'current@example.test', phone: 'synthetic-new', sellerPhone: 'synthetic-new', mobile: 'synthetic-new' })
const facts = () => ({ seller: { legal_type: 'individual', owner_structure_type: 'individual', first_name: 'Synthetic', surname: 'Owner', name: 'Synthetic Owner', id_number: 'SYNTHETIC-ID', contact: { name: 'Synthetic Owner', email: 'current@example.test', phone: 'synthetic-new' }, email: 'current@example.test', phone: 'synthetic-new' } })
function snapshot() {
  const old = facts(); old.seller.contact.email = old.seller.email = 'old@example.test'
  const tables = {
    private_listings: [{ id: 'listing-1', organisation_id: 'agency-1', updated_at: revision, seller_lead_id: 'lead-1', seller_canonical_facts_json: old, canonical_shape: 'object', protected_seller_fingerprint: 'same-protected', canonical_fingerprint: 'old-full-canonical' }],
    private_listing_seller_onboarding: [{ id: 'capture-1', private_listing_id: 'listing-1', status: 'completed', updated_at: revision, form_data: form(), canonical_facts_json: facts(), form_shape: 'object', canonical_shape: 'object', protected_seller_fingerprint: 'same-protected', canonical_fingerprint: 'source-full-canonical' }],
    leads: [{ lead_id: 'lead-1', organisation_id: 'agency-1', listing_id: 'listing-1', contact_id: 'contact-1', lead_category: 'sellerOutbound' }],
    contacts: [{ contact_id: 'contact-1', organisation_id: 'agency-1', email: 'current@example.test', phone: 'synthetic-new' }],
    transactions: [], onboarding_form_data: [], transaction_participants: [], client_portal_contexts: [], profiles: [],
  }
  return { environment: { projectRef, label: 'Synthetic test only' }, capturedAt: revision, readOnly: 'on', scope: { listingIds: ['listing-1'], description: 'Synthetic' }, tables, completeTables: Object.keys(tables), schema: { guardMigrations: ['20261010215549', '20261010225607', '20261011065947', '20261011073408'], functions: ['save_private_listing_seller_onboarding_profile', 'save_private_listing_seller_canonical_update', 'bridge_get_transaction_seller_edit_context', 'bridge_save_transaction_seller_details', 'bridge_get_transaction_seller_profile'], participantSourceColumns: ['seller_source_onboarding_id', 'seller_source_contact_key'] }, evidence: [{ listingId: 'listing-1', fingerprint: 'frozen-version-evidence', preserveCopies: true }] }
}
const run = buildSellerReconciliationPacket
const reasons = s => run(s).report.records[0].reasons

test('plans exact contact projection paths with revisions, recovery values and evidence; does not mutate input', () => {
  const s = snapshot(), before = JSON.stringify(s)
  const { report, packet } = run(s)
  assert.equal(report.summary.contactProjectionCandidates, 1)
  assert.equal(report.automaticRepairAllowed, false)
  assert.equal(packet.applySupported, false)
  assert.deepEqual(packet.proposals[0].changes.map(change => change.path), ['seller.contact.email', 'seller.email'])
  assert.equal(packet.proposals[0].changes[0].before, 'old@example.test')
  assert.equal(packet.proposals[0].changes[0].proposed, 'current@example.test')
  assert.equal(packet.proposals[0].recovery.documentEvidenceFingerprint, 'frozen-version-evidence')
  assert.equal(packet.proposals[0].recovery.sourceUpdatedAt, revision)
  assert.equal(JSON.stringify(s), before)
  assert.equal(run(s).packet.id, packet.id)
})

test('schema gaps gate every repair and are exposed instead of claiming alignment', () => {
  const s = snapshot(); s.schema.guardMigrations.pop(); s.schema.functions.pop(); s.schema.participantSourceColumns = []
  const result = run(s)
  assert.equal(result.report.releasePrerequisites.ready, false)
  assert.equal(result.packet.proposals[0].status, 'awaiting_guard_release_and_repair_approval')
  assert(result.report.coverage.identityIndexTablesNotChecked.includes('agency_client_profiles'))
})

test('later capture and later listing timestamps never resolve disagreeing authoritative contact facts', () => {
  for (const target of ['capture', 'listing']) {
    const s = snapshot(); s.tables.private_listing_seller_onboarding[0].form_data.email = s.tables.private_listing_seller_onboarding[0].form_data.sellerEmail = 'raw-conflict@example.test'
    ;(target === 'capture' ? s.tables.private_listing_seller_onboarding[0] : s.tables.private_listings[0]).updated_at = '2099-01-01T00:00:00Z'
    assert(reasons(s).includes('capture_and_its_canonical_projection_disagree'))
    assert.equal(run(s).packet.proposals.length, 0)
  }
})

test('deliberate contact clear remains a clear; contradictory legacy aliases require review', () => {
  const s = snapshot(); const o = s.tables.private_listing_seller_onboarding[0]
  o.form_data.email = o.form_data.sellerEmail = ''; o.canonical_facts_json.seller.contact.email = o.canonical_facts_json.seller.email = ''
  assert.equal(run(s).packet.proposals[0].changes[0].proposed, '')
  o.form_data.sellerEmail = 'old@example.test'
  assert(reasons(s).includes('contact_source_or_aliases_require_review'))
  assert.equal(run(s).packet.proposals.length, 0)
})

test('hidden contact aliases cannot silently remain stale when the display already agrees', () => {
  const s = snapshot(); s.tables.private_listings[0].seller_canonical_facts_json.seller.contact.email = 'current@example.test'
  const result = run(s)
  assert.deepEqual(result.packet.proposals[0].changes.map(change => change.path), ['seller.email'])
  s.tables.private_listing_seller_onboarding[0].canonical_facts_json.seller.email = 'conflicting-source@example.test'
  assert(reasons(s).includes('canonical_contact_aliases_disagree'))
  assert.equal(run(s).packet.proposals.length, 0)
})

test('identity, authority, tax, marriage and even hidden protected payload differences cannot become contact backfills', () => {
  for (const [key, value] of [['id_number', 'OTHER-ID'], ['marital_regime', 'in_community'], ['tax_number', 'OTHER-TAX'], ['authority_basis', 'different resolution']]) {
    const s = snapshot(); s.tables.private_listings[0].seller_canonical_facts_json.seller[key] = value
    s.tables.private_listings[0].protected_seller_fingerprint = 'different-protected'
    assert(reasons(s).includes('protected_source_payloads_disagree'))
    assert.equal(run(s).packet.proposals.length, 0)
  }
})

test('contradictory legal identity aliases block a contact proposal even when the preferred display value agrees', () => {
  for (const [key, value] of [['id_number', 'OTHER-SAVED-ID'], ['ownershipType', 'trust']]) {
    const s = snapshot(); s.tables.private_listing_seller_onboarding[0].form_data[key] = value
    const result = run(s)
    assert.equal(result.packet.proposals.length, 0)
    assert(result.report.records[0].reasons.includes('protected_capture_aliases_disagree'))
    assert(result.packet.reviews[0].conflictingAliasValues.some(item => Object.values(item.values).includes(value)))
    assert.doesNotMatch(JSON.stringify(result.report), /OTHER-SAVED-ID/)
  }
})

test('private review packet includes absent-capture states and CRM before/source values without approving identity sync', () => {
  const s = snapshot(); s.tables.contacts[0].email = 'crm@example.test'
  s.scope.listingIds.push('listing-2'); s.tables.private_listings.push({ id: 'listing-2', organisation_id: 'agency-1' })
  const result = run(s)
  assert.equal(result.packet.recordStatuses.find(row => row.listingId === 'listing-2').status, 'capture_required')
  assert.equal(result.packet.crmContactReviews[0].values[0].before, 'crm@example.test')
  assert.equal(result.packet.crmContactReviews[0].values[0].proposedAfterConfirmation, 'current@example.test')
  assert.equal(result.packet.crmContactReviews[0].status, 'same_person_confirmation_required')
  assert.doesNotMatch(JSON.stringify(result.report), /crm@example/)
})

test('supported profile aliases and equivalent boolean consent values do not create false identity conflicts', () => {
  const s = snapshot(), f = s.tables.private_listing_seller_onboarding[0].form_data
  f.ownershipType = 'natural_person'; f.popiConsent = 'yes'; f.popiConsentAccepted = true
  assert(!reasons(s).includes('protected_capture_aliases_disagree'))
})

test('missing identity, incomplete capture, duplicate capture, missing revision and missing evidence all stop candidates', () => {
  const mutations = [
    s => { delete s.tables.private_listing_seller_onboarding[0].form_data.idNumber; delete s.tables.private_listing_seller_onboarding[0].canonical_facts_json.seller.id_number },
    s => { s.tables.private_listing_seller_onboarding[0].status = 'in_progress' },
    s => { s.tables.private_listing_seller_onboarding.push({ ...s.tables.private_listing_seller_onboarding[0], id: 'capture-2', updated_at: '2099-01-01' }) },
    s => { delete s.tables.private_listings[0].updated_at },
    s => { s.evidence = [] },
  ]
  for (const mutate of mutations) { const s = snapshot(); mutate(s); assert.equal(run(s).packet.proposals.length, 0); assert.equal(run(s).report.records[0].status, 'review_required') }
})

test('organisation boundaries and incomplete reference exports stop candidates', () => {
  const s = snapshot(); s.tables.contacts[0].organisation_id = 'other-agency'
  assert(reasons(s).includes('relationship_or_person_identity_review'))
  assert.equal(run(s).packet.proposals.length, 0)
  const partial = snapshot(); delete partial.tables.contacts
  assert(run(partial).report.coverage.missingTables.includes('contacts'))
  assert.equal(run(partial).packet.proposals.length, 0)
})

test('seller finance/scheme facts require review while operational address/type/price cannot be restored from capture', () => {
  const s = snapshot(), listing = s.tables.private_listings[0], source = s.tables.private_listing_seller_onboarding[0]
  listing.seller_canonical_facts_json.property = { address: 'New operational address', property_type: 'new_type', scheme: { unit_number: '12', section_number: '4' } }
  source.canonical_facts_json.property = { address: 'Old captured address', property_type: 'old_type', scheme: { unit_number: '12', section_number: '4' } }
  assert.equal(run(s).packet.proposals.length, 1)
  source.canonical_facts_json.finance = { bond_account_reference: 'CONFIDENTIAL-BOND-REFERENCE' }
  assert(reasons(s).includes('seller_owned_canonical_projection_disagrees'))
  assert.equal(run(s).packet.proposals.length, 0)
  assert.doesNotMatch(JSON.stringify(run(s).report), /New operational|Old captured|CONFIDENTIAL/)
  delete source.canonical_facts_json.finance
  source.canonical_facts_json.property.scheme.unit_number = '13'
  assert(reasons(s).includes('seller_owned_canonical_projection_disagrees'))
})

test('public report contains identifiers and reasons without private field values; packet strips embedded credentials and signing payloads', () => {
  const s = snapshot(); const o = s.tables.private_listing_seller_onboarding[0]
  o.form_data.portalToken = 'FORBIDDEN-TOKEN'
  o.form_data.company = { authorised_signatory: { full_name: 'Synthetic Signatory', token: 'FORBIDDEN-TOKEN' }, generatedHtml: 'FORBIDDEN-HTML' }
  o.canonical_facts_json.seller.signature = 'FORBIDDEN-PIXELS'
  const sanitized = sanitizeSellerAlignmentSnapshot(s)
  assert.equal(sanitized.tables.private_listing_seller_onboarding[0].form_data.company.authorised_signatory.full_name, 'Synthetic Signatory')
  assert.doesNotMatch(JSON.stringify(sanitized), /FORBIDDEN/)
  const result = run(s)
  assert.doesNotMatch(JSON.stringify(result.report), /current@example|old@example|SYNTHETIC-ID|Synthetic Owner|synthetic-new/)
  assert.doesNotMatch(JSON.stringify(result.packet), /FORBIDDEN/)
})

test('unlinked legacy transactions remain review-only even when names and emails match a seller', () => {
  const s = snapshot(); s.tables.transactions.push({ id: 'legacy-tx', organisation_id: 'agency-1', seller_name: 'Synthetic Owner', seller_email: 'current@example.test' })
  const { report, packet } = run(s)
  assert.equal(report.summary.unlinkedNonDemoTransactions, 1)
  assert.equal(report.coverage.currentLinkedTransactions, 0)
  assert.deepEqual(report.legacyTransactions, [{ transactionId: 'legacy-tx', status: 'relationship_review_no_inferred_link' }])
  assert(!packet.proposals.some(proposal => proposal.target.startsWith('transactions')))
})

test('comparison honours explicit scope while retaining outside metadata for FK closure', () => {
  const s = snapshot(); s.tables.private_listings.push({ id: 'outside', organisation_id: 'agency-2' })
  s.tables.leads.push({ lead_id: 'outside-lead', organisation_id: 'agency-2', listing_id: 'outside', contact_id: 'missing-outside' })
  const { report } = run(s)
  assert.equal(report.records.length, 1)
  assert.equal(report.relationshipIssues.length, 0)
  assert.equal(report.summary.contactProjectionCandidates, 1)
})

test('linked transaction handoffs are compared against current source; never rewrite party decisions', () => {
  const s = snapshot(); s.tables.private_listings[0].seller_canonical_facts_json = facts()
  const profile = transactionSellerProfileFromSource({ facts: facts(), formData: form(), onboardingId: 'capture-1', updatedAt: revision })
  s.tables.transactions.push({ id: 'tx-1', listing_id: 'listing-1', organisation_id: 'agency-1', seller_name: profile.name, seller_email: 'stale@example.test', seller_phone: 'synthetic-new', updated_at: revision })
  s.tables.onboarding_form_data.push({ id: 'tx-form', transaction_id: 'tx-1', form_data: { __bridge_transaction_parties: { seller: { ...profile, people: profile.people.map(person => ({ ...person, signatory: true })) } } } })
  const result = run(s)
  assert.equal(result.report.summary.linkedTransactionReviews, 1)
  assert(result.report.linkedTransactions[0].fields.includes('transactions.seller_email'))
  assert.equal(result.packet.proposals.length, 0)
  assert.equal(s.tables.onboarding_form_data[0].form_data.__bridge_transaction_parties.seller.people[0].signatory, true)
})

test('missing transaction handoff and saved source person identities are explicit review cases', () => {
  const s = snapshot(); s.tables.transactions.push({ id: 'tx-1', listing_id: 'listing-1', organisation_id: 'agency-1' })
  s.tables.onboarding_form_data.push({ id: 'tx-form', transaction_id: 'tx-1', form_data: {} })
  assert(run(s).report.linkedTransactions[0].reasons.includes('transaction_seller_handoff_missing'))
  const o = s.tables.private_listing_seller_onboarding[0]
  o.form_data.ownerStructureType = 'multiple_owners'; o.form_data.multipleOwners = [{ id: 'saved-1', name: 'Synthetic One' }, { name: 'Synthetic Two' }]
  assert(reasons(s).includes('saved_person_ids_require_review'))
  assert.equal(run(s).packet.proposals.length, 0)
})

test('missing scoped rows, duplicate scope and a writable/unlabelled snapshot cannot certify repairs', () => {
  const s = snapshot(); s.tables.private_listings = []
  assert(reasons(s).includes('listing_identity_missing_or_ambiguous'))
  s.tables.private_listing_seller_onboarding = []
  assert.equal(run(s).report.records[0].status, 'review_required')
  const duplicate = snapshot(); duplicate.scope.listingIds.push('listing-1')
  assert.throws(() => run(duplicate), /unique listing scope/)
  const writable = snapshot(); writable.readOnly = 'off'
  assert.throws(() => run(writable), /read-only hosted snapshot/)
  assert.throws(() => buildSellerAlignmentSnapshotQuery(), /explicit Supabase project/)
})

test('CLI exports no values to stdout, requires private packet permissions, refuses overwrite, symlinks and apply flags', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'seller-reconciliation-test-'))
  try {
    await chmod(directory, 0o700)
    const input = join(directory, 'snapshot.json'), output = join(directory, 'packet.json')
    await writeFile(input, JSON.stringify(snapshot()), { mode: 0o600 })
    const call = args => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' })
    const ok = call(['--reconcile', `--input=${input}`, `--packet=${output}`])
    assert.equal(ok.status, 0, ok.stderr)
    assert.doesNotMatch(ok.stdout, /current@example|SYNTHETIC-ID/)
    assert.equal((await stat(output)).mode & 0o777, 0o600)
    assert.equal(JSON.parse(await readFile(output, 'utf8')).proposals.length, 1)
    assert.notEqual(call(['--reconcile', `--input=${input}`, `--packet=${output}`]).status, 0)
    const link = join(directory, 'symlink.json'); await symlink(output, link)
    assert.notEqual(call(['--reconcile', `--input=${input}`, `--packet=${link}`]).status, 0)
    assert.notEqual(call(['--reconcile', `--input=${input}`, '--apply']).status, 0)
    assert.notEqual(call(['--reconcile', `--input=${input}`, `--packet=${resolve(import.meta.dirname, 'forbidden-packet.json')}`]).status, 0)
    await chmod(directory, 0o755)
    assert.notEqual(call(['--reconcile', `--input=${input}`, `--packet=${join(directory, 'public.json')}`]).status, 0)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('actual snapshot SQL handles UUID/text links, absent index/source tables, live scope and frozen evidence without writes or secret exports', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create schema supabase_migrations;
      create table supabase_migrations.schema_migrations(version text);
      create table private_listings(id uuid primary key, organisation_id uuid, seller_lead_id text, originating_crm_lead_id text, seller_profile_id uuid, updated_at timestamptz, is_demo_data boolean, listing_status text, listing_visibility text, seller_canonical_facts_json jsonb);
      create table private_listing_seller_onboarding(id uuid primary key, private_listing_id uuid, status text, updated_at timestamptz, is_demo_data boolean, form_data jsonb, canonical_facts_json jsonb, portal_token_hash text);
      create table leads(lead_id uuid primary key, organisation_id uuid, listing_id uuid, contact_id uuid, converted_transaction_id uuid, lead_category text, is_demo_data boolean, updated_at timestamptz, raw_enquiry_payload jsonb);
      create table contacts(contact_id uuid primary key, organisation_id uuid, updated_at timestamptz, email text, phone text);
      create table transactions(id uuid primary key, organisation_id uuid, listing_id uuid, seller_contact_id uuid, is_demo_data boolean, deleted_at timestamptz, updated_at timestamptz, seller_name text, seller_email text, seller_phone text);
      create table onboarding_form_data(id uuid primary key, transaction_id uuid, updated_at timestamptz, form_data jsonb);
      create table transaction_participants(id uuid primary key, transaction_id uuid, role_type text, removed_at timestamptz, updated_at timestamptz, participant_name text, participant_email text, participant_phone text);
      create table client_portal_contexts(id uuid primary key, organisation_id uuid, listing_id text, seller_lead_id uuid, transaction_id uuid, context_type text, status text, updated_at timestamptz, seller_workspace_token text);
      create table profiles(id uuid primary key);
      create table private_listing_documents(id uuid primary key, private_listing_id uuid, status text, updated_at timestamptz);
      create table private_listing_seller_portal_signing_documents(id uuid primary key, private_listing_id uuid, status text, signed_at timestamptz, generated_html text);
      create table private_listing_seller_portal_signature_evidence(id uuid primary key, signing_document_id uuid, signature_pixels text);
    `)
    const listingId = randomUUID(), onboardingId = randomUUID(), agency = randomUUID(), lead = randomUUID(), contact = randomUUID()
    const current = facts(), old = facts(); old.seller.contact.email = old.seller.email = 'old@example.test'
    await db.query('insert into private_listings values($1,$2,$3,null,null,$4,false,\'active\',\'active_market\',$5)', [listingId, agency, lead, revision, JSON.stringify(old)])
    await db.query('insert into private_listing_seller_onboarding values($1,$2,\'completed\',$3,false,$4,$5,\'FORBIDDEN-TOKEN\')', [onboardingId, listingId, revision, JSON.stringify({ ...form(), sellerOnboardingManualSigningPack: { documents: [{ generatedHtml: 'FORBIDDEN-HTML' }] } }), JSON.stringify(current)])
    await db.query('insert into leads values($1,$2,$3,$4,null,\'sellerOutbound\',false,$5,\'{}\')', [lead, agency, listingId, contact, revision])
    await db.query('insert into contacts values($1,$2,$3,\'current@example.test\',\'synthetic-new\')', [contact, agency, revision])
    await db.query('insert into client_portal_contexts values($1,$2,$3,$4,null,\'selling\',\'active\',$5,\'FORBIDDEN-PORTAL-TOKEN\')', [randomUUID(), agency, listingId, lead, revision])
    const signing = randomUUID()
    await db.query('insert into private_listing_seller_portal_signing_documents values($1,$2,\'signed\',$3,\'FORBIDDEN-HTML\')', [signing, listingId, revision])
    await db.query('insert into private_listing_seller_portal_signature_evidence values($1,$2,\'FORBIDDEN-PIXELS\')', [randomUUID(), signing])
    for (const [status, visibility, demo, factsValue, captureValue] of [
      ['withdrawn', 'archived', false, current, {}], ['sold', 'archived', false, current, {}], ['active', 'active_market', true, current, {}],
      ['active', 'active_market', false, { ...current, rentalInfo: {} }, {}], ['active', 'active_market', false, { ...current, listingType: 'Rental' }, {}],
      ['active', 'active_market', false, current, { listing_type: 'rental' }],
    ]) {
      const excludedId = randomUUID()
      await db.query('insert into private_listings values($1,$2,null,null,null,$3,$4,$5,$6,$7)', [excludedId, agency, revision, demo, status, visibility, JSON.stringify(factsValue)])
      await db.query('insert into private_listing_seller_onboarding values($1,$2,\'not_started\',$3,false,$4,$5,null)', [randomUUID(), excludedId, revision, JSON.stringify({ ...captureValue, email: 'OUTSIDE-PRIVATE-VALUE' }), JSON.stringify(current)])
    }
    const tableNames = ['private_listings', 'private_listing_seller_onboarding', 'leads', 'contacts', 'transactions', 'client_portal_contexts', 'private_listing_seller_portal_signing_documents', 'private_listing_seller_portal_signature_evidence']
    const snapshotRows = async () => Promise.all(tableNames.map(async table => (await db.query(`select jsonb_agg(to_jsonb(r) order by r.id) from ${table} r`.replace('r.id', table === 'leads' ? 'r.lead_id' : table === 'contacts' ? 'r.contact_id' : 'r.id'))).rows))
    const before = await snapshotRows()
    const results = await db.exec(query())
    const s = results.find(result => result.rows?.[0]?.snapshot).rows[0].snapshot
    assert.deepEqual(s.scope.listingIds, [listingId])
    assert.equal(s.readOnly, 'on')
    assert.equal(s.schema.availableTables, null)
    assert.deepEqual(s.schema.participantSourceColumns, [])
    assert.equal(s.evidence[0].preserveCopies, true)
    assert.doesNotMatch(JSON.stringify(s), /FORBIDDEN|OUTSIDE-PRIVATE-VALUE/)
    const source = s.tables.private_listing_seller_onboarding.find(row => row.id === onboardingId)
    const listing = s.tables.private_listings.find(row => row.id === listingId)
    assert.equal(source.protected_seller_fingerprint, listing.protected_seller_fingerprint)
    assert.notEqual(source.canonical_fingerprint, listing.canonical_fingerprint)
    assert.equal(run(s).report.summary.contactProjectionCandidates, 1)
    assert.equal(run(s).report.summary.activeSellingContexts, 1)
    assert.deepEqual(await snapshotRows(), before)
  } finally { await db.close() }
})
