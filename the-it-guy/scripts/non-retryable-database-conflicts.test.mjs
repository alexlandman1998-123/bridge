import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { createRentalListingAcceptanceFixture } from './lib/rentalListingAcceptanceFixture.mjs'

const migrations = new URL('../../supabase/migrations/', import.meta.url)
const correction = await readFile(new URL('20261006101955_non_retryable_business_conflicts.sql', migrations), 'utf8')
const targets = JSON.parse(correction.match(/\$targets\$([\s\S]*?)\$targets\$::jsonb/)[1])
const md5 = value => createHash('md5').update(value).digest('hex')
const definitions = new Map()
const names = new Map(targets.map(target => [target.signature.match(/^public\.(\w+)\(/)[1], target]))
for (const file of (await readdir(migrations)).filter(file => file.endsWith('.sql')).sort()) {
  const source = await readFile(new URL(file, migrations), 'utf8')
  for (const match of source.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?(\w+)\s*\(/gi)) {
    const target = names.get(match[1])
    if (!target) continue
    const afterHeader = match.index + match[0].length
    const delimiter = /\bas\s+(\$\w*\$)/i.exec(source.slice(afterHeader))
    if (!delimiter) continue
    const bodyStart = afterHeader + delimiter.index + delimiter[0].length
    const bodyEnd = source.indexOf(delimiter[1], bodyStart)
    const body = source.slice(bodyStart, bodyEnd)
    if (md5(body) === target.before_md5) {
      definitions.set(target.signature, { body, sql: source.slice(match.index, bodyEnd + delimiter[1].length) + ';' })
    }
  }
}
assert.equal(targets.length, 39)
assert.equal(targets.reduce((sum, target) => sum + target.conflict_count, 0), 49)
assert.equal(definitions.size, targets.length, 'Every reviewed live body must match repository source')

// Catalogue checks use the real function definitions with deferred compilation;
// they do not pretend to recreate every application's database dependencies.
// The trigger, recruitment conflict and rental tests below execute actual bodies.
async function installTargets(db, { preserveExisting = false } = {}) {
  await db.exec('reset role; set check_function_bodies=off; create schema if not exists auth;')
  for (const role of ['anon', 'authenticated', 'service_role']) {
    if (!(await db.query('select 1 from pg_roles where rolname=$1', [role])).rows.length) await db.exec(`create role ${role};`)
  }
  if (!(await db.query("select to_regprocedure('auth.uid()') as oid")).rows[0].oid) {
    await db.exec(`create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`)
  }
  await db.exec(`
    create table if not exists recruitment_leads(id uuid primary key,organisation_id uuid,version integer,status text,
      application_submitted_at timestamptz,approved_at timestamptz,approval_notes text,
      contracts_json jsonb default '[]',contract_delivery_json jsonb,contract_signature_json jsonb,
      onboarding_json jsonb,onboarding_documents_json jsonb default '[]',onboarding_completed_at timestamptz,activated_at timestamptz);
    create table if not exists organisation_users(id uuid primary key,organisation_id uuid,user_id uuid,status text,role text);
    create table if not exists organisations(id uuid primary key,type text);
    create table if not exists invites(id uuid primary key);
    create table if not exists document_packets(id uuid primary key,status text,current_version_number integer);
    create table if not exists document_packet_versions(id uuid primary key default gen_random_uuid(),packet_id uuid,version_number integer);
  `)
  for (const [index, target] of targets.entries()) {
    const existing = (await db.query('select to_regprocedure($1) as oid', [target.signature])).rows[0].oid
    if (preserveExisting && existing) continue
    await db.exec(definitions.get(target.signature).sql)
    await db.exec(`revoke all on function ${target.signature} from public,anon,authenticated,service_role;
      grant execute on function ${target.signature} to ${index % 2 ? 'authenticated' : 'authenticated,service_role'};`)
  }
}

async function catalogue(db) {
  const rows = []
  for (const target of targets) {
    rows.push((await db.query(`select prosrc,prosecdef,proconfig,proacl::text as acl,
      oid,proowner::regrole::text as owner,obj_description(oid,'pg_proc') as comment,
      proargnames,prorettype::regtype::text as return_type,provolatile,proparallel,proisstrict,
      proleakproof,proretset,procost,prorows
      from pg_proc where oid=$1::regprocedure`, [target.signature])).rows[0])
  }
  return rows
}

await test('all 39 corrections preserve contracts and grants, reject drift atomically, and replay safely', async () => {
  const db = new PGlite()
  try {
    await installTargets(db)
    await db.exec(`comment on function ${targets[0].signature} is 'Existing operational documentation';`)
    await db.exec(`create function public.unreviewed_conflict() returns void language plpgsql as $$begin raise exception 'Unreviewed' using errcode='40001'; end$$;`)
    const last = definitions.get(targets.at(-1).signature)
    await db.exec(last.sql.replace(last.body, () => last.body + '\n-- changed after review\n'))
    const drifted = await catalogue(db)
    await assert.rejects(db.exec(correction), /changed since review/)
    await db.exec('rollback')
    assert.deepEqual(await catalogue(db), drifted, 'A late failure must roll back earlier replacements')
    await db.exec(last.sql)
    const before = await catalogue(db)
    await db.exec(correction)
    const after = await catalogue(db)
    for (const [index, row] of after.entries()) {
      assert.equal(md5(row.prosrc), targets[index].after_md5)
      assert.equal(row.prosrc, before[index].prosrc.replace(/(errcode\s*=\s*)'40001'/gi, "$1'PT409'"))
      assert.deepEqual({ ...row, prosrc: undefined }, { ...before[index], prosrc: undefined })
    }
    await assert.rejects(db.query('select unreviewed_conflict()'), error => error.code === '40001')
    await db.exec(correction)
    assert.deepEqual(await catalogue(db), after)

    await db.exec('set check_function_bodies=on;')
    const packet = '11111111-1111-4111-8111-111111111111'
    await db.exec(`create trigger fixture_version_guard before insert on document_packet_versions
      for each row execute function bridge_guard_document_packet_version_insert_i1();
      insert into document_packets values('${packet}','draft',0);
      insert into document_packet_versions(packet_id,version_number) values('${packet}',1);`)
    await assert.rejects(db.query('insert into document_packet_versions(packet_id,version_number) values($1,99)', [packet]),
      error => error.code === 'PT409' && error.detail === 'I1_VERSION_SEQUENCE_INVALID')
    assert.equal((await db.query('select count(*)::int as n from document_packet_versions')).rows[0].n, 1)
    await db.exec(`update document_packets set status='sent' where id='${packet}';`)
    await assert.rejects(db.query('insert into document_packet_versions(packet_id,version_number) values($1,1)', [packet]),
      error => error.code === '55000' && error.detail === 'I1_PACKET_VERSION_LOCKED')
  } finally {
    await db.close()
  }
})

await test('all eight recruitment commands return PT409 for stale versions without changing the lead', async () => {
  const db = new PGlite()
  const actor = '11111111-1111-4111-8111-111111111111'
  const org = '22222222-2222-4222-8222-222222222222'
  const lead = '33333333-3333-4333-8333-333333333333'
  try {
    await installTargets(db)
    await db.exec(correction)
    await db.exec(`set check_function_bodies=on;
      select set_config('request.jwt.claim.sub','${actor}',false);
      insert into organisations(id,type) values('${org}','agency');
      insert into organisation_users(id,organisation_id,user_id,status,role)
      values(gen_random_uuid(),'${org}','${actor}','active','admin');
      insert into recruitment_leads(id,organisation_id,version,status,application_submitted_at)
      values('${lead}','${org}',2,'application_submitted',now());`)
    const before = (await db.query('select to_jsonb(l) as snapshot from recruitment_leads l')).rows
    const commands = [
      ['recruitment_start_review', [org, lead, 1]],
      ['recruitment_approve_application', [org, lead, 1, 'Reviewed evidence']],
      ['recruitment_prepare_contract', [org, lead, 1, '{}']],
      ['recruitment_record_contract_delivery', [org, lead, 1, '{}']],
      ['recruitment_record_contract_signature', [org, lead, 1, '{}']],
      ['recruitment_save_onboarding', [org, lead, 1, '{}', false]],
      ['recruitment_add_onboarding_document', [org, lead, 1, '{}']],
      ['recruitment_activate_agent', [org, lead, 1, 'Reviewed activation evidence', true]],
    ]
    for (const [name, args] of commands) {
      await assert.rejects(db.query(`select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')})`, args),
        error => error.code === 'PT409', name)
      assert.deepEqual((await db.query('select to_jsonb(l) as snapshot from recruitment_leads l')).rows, before)
    }
    await db.exec("select set_config('request.jwt.claim.sub','',false)")
    await assert.rejects(db.query('select recruitment_start_review($1,$2,1)', [org, lead]), error => error.code === '42501')
  } finally {
    await db.close()
  }
})

await test('rental snapshots, galleries and expiry reject stale saves while preserving real RLS and successful saves', async () => {
  const fixture = await createRentalListingAcceptanceFixture()
  const { db, listing, actor, readonlyActor, initial, patch, publication, gallery } = fixture
  try {
    await installTargets(db, { preserveExisting: true })
    await db.exec(correction)
    await db.exec('set check_function_bodies=on; set role authenticated;')
    const snapshot = async () => (await db.query(`select jsonb_build_object(
      'listing',(select to_jsonb(p) from private_listings p where id=$1),
      'media',(select jsonb_agg(m order by id) from listing_media m where listing_id=$1),
      'publication',(select jsonb_agg(p order by id) from listing_publication_data p where listing_id=$1),
      'history',(select jsonb_agg(a order by id) from private_listing_activity a where private_listing_id=$1)) as snapshot`, [listing])).rows[0].snapshot
    const before = await snapshot()
    const stale = '2000-01-01T00:00:00Z'
    const commands = [
      ['select save_rental_listing_expiry_v1($1,$2,$3)', [listing, stale, '2027-05-01']],
      ['select save_rental_listing_gallery_v2($1,$2,$3::jsonb,$4)', [listing, stale, JSON.stringify(gallery), 0]],
      ['select save_rental_listing_snapshot_v2($1,$2,$3::jsonb,$4::jsonb,$5::jsonb,$6,$7::jsonb)',
        [listing, stale, JSON.stringify(patch), JSON.stringify(publication), JSON.stringify(gallery), 0, '[]']],
    ]
    for (const [sql, args] of commands) {
      await assert.rejects(db.query(sql, args), error => error.code === 'PT409')
      assert.deepEqual(await snapshot(), before)
    }
    const saved = (await db.query('select save_rental_listing_expiry_v1($1,$2,$3) as receipt', [listing, initial, '2027-05-01'])).rows[0].receipt
    assert.equal(saved.facts.rentalInfo.property24ExpiryDate, '2027-05-01')
    const committed = await snapshot()
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [readonlyActor])
    await assert.rejects(db.query('select save_rental_listing_expiry_v1($1,$2,$3)', [listing, saved.updatedAt, '2027-06-01']))
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor])
    assert.deepEqual(await snapshot(), committed)
  } finally {
    await db.close()
  }
})
