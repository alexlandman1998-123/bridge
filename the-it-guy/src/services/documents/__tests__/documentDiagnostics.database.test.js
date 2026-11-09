import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
after(() => db.close())
await db.exec(`
  create table document_definitions(key text primary key);
  create table document_requirement_instances(id text primary key, document_definition_key text,
    context_type text default 'transaction', context_id text default 'tx', status text default 'pending',
    created_at timestamptz default now(), requirement_origin text default 'resolver', custom_label text,
    requested_from_role text default 'buyer', requested_from_contact_id text, applicability_override text,
    subject_kind text default 'party', subject_id text);
  insert into document_definitions values ('buyer_id_document');
`)
await db.exec(await readFile(new URL('../../../../../supabase/migrations/20261109103000_document_diagnostics_manual_requirement_identity.sql', import.meta.url), 'utf8'))

test('diagnostics distinguish valid custom slots and separate subjects from real broken definitions and duplicates', async () => {
  await db.exec(`
    insert into document_requirement_instances(id,requirement_origin,custom_label) values
      ('custom-a','manual','Optional file'),('custom-b','manual','Required file'),('invalid','manual',' ');
    insert into document_requirement_instances(id,document_definition_key,subject_id) values
      ('a','buyer_id_document','person-a'),('b','buyer_id_document','person-b'),
      ('duplicate-a','buyer_id_document','person-a'),('broken','unknown-key','person-a');
    insert into document_requirement_instances(id,document_definition_key,subject_id,applicability_override) values
      ('removed','buyer_id_document','person-b','removed');
  `)
  assert.deepEqual((await db.query('select requirement_instance_id from canonical_document_requirements_missing_definitions order by 1')).rows.map(row => row.requirement_instance_id), ['broken', 'invalid'])
  const duplicates = (await db.query('select * from canonical_document_duplicate_active_requirements')).rows
  assert.equal(duplicates.length, 1)
  assert.equal(Number(duplicates[0].active_count), 2)
  assert.deepEqual(duplicates[0].requirement_instance_ids.sort(), ['a', 'duplicate-a'])
  const options = (await db.query("select reloptions from pg_class where relname='canonical_document_duplicate_active_requirements'")).rows[0].reloptions
  assert(options.includes('security_invoker=true'))
})
