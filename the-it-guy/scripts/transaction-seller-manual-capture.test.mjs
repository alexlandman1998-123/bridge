import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { actor, agentA, outsider, transactionSellerFixture, uuid } from './fixtures/seller-alignment-database.mjs'
import { buildTransactionSellerCapture, sellerCaptureDraft } from '../src/core/transactions/transactionSellerCapture.js'
const migration = readFileSync(new URL('../../supabase/migrations/20261019192602_transaction_seller_manual_capture.sql', import.meta.url), 'utf8')
const tx = uuid(801), primary = uuid(802)
const db = await transactionSellerFixture({ linked: false })
await actor(db, 'postgres')
await db.exec(`alter table transaction_participants add column transaction_role text, add column legal_role text, add column status text;
  update transaction_participants set legal_role='none',transaction_role=role_type;
  create unique index transaction_participants_non_buyer_role_uidx on transaction_participants(transaction_id,role_type,legal_role) where coalesce(transaction_role,'')<>'buyer';
  create table test_outbox(event jsonb);
  create function test_no_onboarding_submission() returns trigger language plpgsql as $$begin
    if new.form_data ? 'submitted_at' or new.form_data ? 'onboarding_completed_at' then insert into test_outbox values(new.form_data); end if;
    return new;
  end$$;
  create trigger test_submission after update on onboarding_form_data for each row execute function test_no_onboarding_submission();`)
await db.exec(migration)
const read = async () => (await db.query('select public.bridge_get_transaction_seller_capture($1) result', [tx])).rows[0].result
const save = async (context, profile, id = uuid(901)) => (await db.query('select public.bridge_save_transaction_seller_capture($1,$2::jsonb,$3::jsonb,$4) result', [tx, JSON.stringify(context.revision), JSON.stringify(profile), id])).rows[0].result
const expectReject = async (operation, pattern) => { await assert.rejects(operation, pattern) }
let generated = 2000
await actor(db, 'authenticated', agentA)
let context = await read()
const beforeBuyer = (await db.query('select form_data from onboarding_form_data where transaction_id=$1', [tx])).rows[0].form_data.__bridge_transaction_parties.buyer
let draft = sellerCaptureDraft(context)
assert.equal(draft.email, 'old@example.com')
draft = { ...draft, branch: 'married', sellerFirstName: 'Jamie', sellerSurname: 'Owner', email: '', phone: '0812345678', idNumber: 'manual-id', incomeTaxNumber: 'tax-1', maritalStatus: 'married', maritalRegime: 'in_community', spouseName: 'Alex Owner', spouseEmail: 'spouse@example.test', spouseIdNumber: 'spouse-id', occupation: 'Engineer', politicallyExposedPerson: 'no' }
let profile = buildTransactionSellerCapture(draft, context, primary, () => uuid(++generated))
let receipt = await save(context, profile)
assert.equal(receipt.profile.people.find(person => person.primaryContact).id, primary)
assert.equal(receipt.profile.profileFields.occupation, 'Engineer')
assert.equal(receipt.details.name, 'Jamie Owner')
assert.equal(receipt.details.email, '')
assert.equal((await read()).profile.people.length, 2)
assert.deepEqual((await db.query('select form_data from onboarding_form_data where transaction_id=$1', [tx])).rows[0].form_data.__bridge_transaction_parties.buyer, beforeBuyer)
assert.equal((await db.query('select form_data from onboarding_form_data where transaction_id=$1', [tx])).rows[0].form_data.unrelated, 'preserve')
assert.equal((await db.query('select count(*)::int total from transaction_participants where transaction_id=$1 and role_type=$2 and removed_at is null', [tx, 'seller'])).rows[0].total, 1)
assert.deepEqual(await save(context, profile), receipt, 'same command replays its confirmed receipt')
await expectReject(() => save(context, profile, uuid(902)), /Someone else saved/)
await expectReject(() => save(context, { ...profile, name: 'Changed retry' }), /save reference/)
console.log('ok - full partial capture, primary IDs, buyer preservation, exact replay and stale-save conflict')

context = await read()
draft = sellerCaptureDraft(context)
assert.equal(draft.idNumber, 'manual-id')
assert.equal(draft.spouseIdNumber, 'spouse-id')
assert.equal(draft.occupation, 'Engineer')
const stable = buildTransactionSellerCapture(draft, context, primary, () => uuid(++generated))
assert.deepEqual(stable.people.map(person => person.id), receipt.profile.people.map(person => person.id))
profile = buildTransactionSellerCapture({ ...draft, branch: 'company', companyName: 'Archive Pty Ltd', companyRegistrationNumber: '2026/001', primaryContactName: 'Jamie Owner', companyDirectors: [{ id: 'manual-director', name: 'Sam', surname: 'Director', idNumber: 'director-id', email: 'director@example.test' }] }, context, primary, () => uuid(++generated))
receipt = await save(context, profile, uuid(903))
assert.equal(receipt.profile.entityType, 'company')
assert.equal(receipt.profile.name, 'Archive Pty Ltd')
assert.equal(receipt.profile.people.find(person => person.role === 'director').identityNumber, 'director-id')
assert.equal(receipt.profile.people.some(person=>person.role==='spouse'),false)
assert.equal((await db.query('select count(*)::int total from transaction_participants where transaction_id=$1', [tx])).rows[0].total,1)
console.log('ok - saved answers reopen, stable person references, company people remain in the full profile without adding invitation/access rows')

context = await read()
await expectReject(() => save(context, { ...receipt.profile, profileFields: { token: 'forged' } }, uuid(904)), /Only seller profile/)
await expectReject(() => save(context, { ...receipt.profile, onboardingStatus: 'completed' }, uuid(905)), /Invalid seller profile/)
const foreign = uuid(3001)
await actor(db, 'postgres')
await db.query('insert into transactions(id,organisation_id) values($1,$2)', [uuid(3000), uuid(22)])
await db.query("insert into transaction_participants(id,transaction_id,role_type) values($1,$2,'seller')", [foreign, uuid(3000)])
await actor(db, 'authenticated', agentA)
await expectReject(() => save(context, { ...receipt.profile, people: [...receipt.profile.people, { ...receipt.profile.people[0], id: foreign, primaryContact: false }] }, uuid(906)), /another source/)
await actor(db, 'authenticated', outsider)
await expectReject(read, /permission/)
await expectReject(() => save(context, receipt.profile, uuid(907)), /permission/)
await actor(db, 'anon')
await expectReject(read, /permission denied/)
console.log('ok - forbidden evidence keys, cross-transaction people, outsider and anonymous access rejected')

await actor(db, 'postgres')
assert.equal((await db.query('select count(*)::int total from test_outbox')).rows[0].total, 0)
assert.equal((await db.query("select count(*)::int total from private_listings")).rows[0].total, 2)
await db.query('update transactions set listing_id=$1 where id=$2', [uuid(1), tx])
await actor(db, 'authenticated', agentA)
await expectReject(read, /linked listing/)
console.log('ok - no onboarding submission/outbox; linked listings remain with their existing capture authority')
await db.close()

const empty = await transactionSellerFixture({ linked: false })
await actor(empty, 'postgres')
await empty.exec('alter table transaction_participants add column transaction_role text, add column legal_role text, add column status text;')
await empty.exec(migration)
await empty.exec(`delete from transaction_participants; delete from onboarding_form_data;`)
await actor(empty, 'authenticated', agentA)
const emptyContext = (await empty.query('select public.bridge_get_transaction_seller_capture($1) result', [tx])).rows[0].result
const emptyProfile = buildTransactionSellerCapture({ ...sellerCaptureDraft(emptyContext), branch: 'individual', sellerFirstName: 'Backfill', sellerSurname: 'Seller', email: '' }, emptyContext, uuid(4000), () => uuid(++generated))
const emptyReceipt = (await empty.query('select public.bridge_save_transaction_seller_capture($1,$2::jsonb,$3::jsonb,$4) result', [tx, JSON.stringify(emptyContext.revision), JSON.stringify(emptyProfile), uuid(4001)])).rows[0].result
assert.equal(emptyReceipt.details.name, 'Backfill Seller')
assert.equal(emptyReceipt.profile.people.length, 1)
console.log('ok - captures a seller from scratch with no listing, no existing profile, no participant and no email')
await empty.close()
console.log('Transaction seller manual capture database checks passed')
