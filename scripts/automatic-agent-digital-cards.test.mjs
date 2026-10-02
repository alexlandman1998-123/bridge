import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '../the-it-guy/node_modules/@electric-sql/pglite/dist/index.js'
const db = new PGlite()
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
try {
  await db.exec(`create role anon; create role authenticated;
    create table organisations(id uuid primary key,type text);
    create table profiles(id uuid primary key,full_name text,email text,avatar_url text);
    create table organisation_users(organisation_id uuid,user_id uuid,role text,status text,workspace_role text,organisation_role text,email text);
    create table agency_public_intake_links(id uuid default gen_random_uuid(),organisation_id uuid,slug text unique check(length(slug)<=80),status text,is_primary boolean,default_assigned_agent_id uuid,lead_source_label text,source_channel text,metadata_json jsonb);
    insert into organisations values('${id(1)}','agency'),('${id(2)}','developer_company'),('${id(3)}','agency');
    insert into profiles values('${id(4)}','Test Agent','agent@example.test','/avatar.png');
    insert into organisation_users values('${id(1)}','${id(4)}','agent','active',null,null,'agent@example.test');`)
  await db.exec(await readFile(new URL('../supabase/migrations/20261002075626_automatic_agent_digital_cards.sql',import.meta.url),'utf8'))
  let rows = (await db.query('select * from agency_public_intake_links')).rows
  assert.equal(rows.length,1); assert.equal(rows[0].status,'draft'); assert.equal(rows[0].metadata_json.agentDigitalCard.agent.name,'Test Agent')
  await db.exec(`update agency_public_intake_links set status='disabled'; update organisation_users set status='active';`)
  assert.equal((await db.query('select * from agency_public_intake_links')).rows.length,1)
  assert.equal((await db.query('select status from agency_public_intake_links')).rows[0].status,'disabled')
  await db.exec(`insert into organisation_users values('${id(2)}','${id(4)}','agent','active',null,null,null),('${id(3)}','${id(4)}','agent','invited',null,null,null);`)
  assert.equal((await db.query('select * from agency_public_intake_links')).rows.length,1)
  await db.exec(`update organisation_users set status='active' where organisation_id='${id(3)}';`)
  rows=(await db.query('select * from agency_public_intake_links')).rows
  assert.equal(rows.length,2); assert.notEqual(rows[0].slug,rows[1].slug)
  await db.exec(`insert into organisation_users values('${id(1)}','${id(5)}','viewer','active',null,null,null);`)
  assert.equal((await db.query('select * from agency_public_intake_links')).rows.length,2)
  await db.exec(`insert into organisation_users values('${id(1)}','${id(6)}','agent','active',null,null,'new@example.test');`)
  const created=(await db.query('select * from agency_public_intake_links where default_assigned_agent_id=$1',[id(6)])).rows[0]
  assert.equal(created.status,'draft'); assert.equal(created.metadata_json.agentDigitalCard.agent.email,'new@example.test')
  await db.exec('set role authenticated')
  await assert.rejects(db.query(`select arch9_private.ensure_agent_digital_card('${id(1)}','${id(5)}')`),/permission denied/)
  console.log('Automatic cards passed: backfill, activation, tenant isolation, duplicate prevention, disabled-card preservation, draft privacy and private function access.')
} finally { await db.close() }
