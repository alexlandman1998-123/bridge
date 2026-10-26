import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { withSharedInboxNavigation } from '../navigation.js'
import { checkMailboxFoundation } from './mailboxFoundation.test.mjs'
import './mailboxService.test.js'
import './inboxSignature.test.js'
import { checkMailboxJourney } from './mailboxJourney.test.mjs'
import { checkSending } from './sendingDatabase.test.mjs'
import { checkReceiving } from './receivingDatabase.test.mjs'
import { checkEmailSettings } from './emailSettingsDatabase.test.mjs'

for (const key of ['dashboard', 'assistant_dashboard', 'rental_dashboard', 'short_term_dashboard']) {
  const items = withSharedInboxNavigation([{ key, label: 'Dashboard' }, { key: 'clients' }])
  assert.equal(items[1].label, 'Inbox')
  assert.equal(items[1].to, '/inbox')
  assert.equal(withSharedInboxNavigation(items).filter(item => item.label === 'Inbox').length, 1)
}
const db = new PGlite()
const migrations = resolve('../supabase/migrations')
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const admin = '11111111-1111-4111-8111-111111111111', member = '22222222-2222-4222-8222-222222222222', outsider = '33333333-3333-4333-8333-333333333333'
const channelA = '44444444-4444-4444-8444-444444444444', channelB = '55555555-5555-4555-8555-555555555555'
const threadA = '66666666-6666-4666-8666-666666666666', threadB = '77777777-7777-4777-8777-777777777777'
try {
  // Minimal surrounding platform schema; Inbox tables, policies and functions
  // below are the actual historical migrations plus the new rollout migration.
  await db.exec(`create role authenticated; create role anon; create role service_role bypassrls;
    create schema auth; create schema vault; create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated,anon,service_role;
    grant all on storage.objects to authenticated,anon,service_role;
    create policy fixture_legacy_storage on storage.objects for all to authenticated,anon using(true) with check(true);
    create table vault.decrypted_secrets(id uuid primary key default gen_random_uuid(),decrypted_secret text);
    create function vault.create_secret(secret text,name text,description text) returns uuid language plpgsql as $$declare k uuid; begin insert into vault.decrypted_secrets(decrypted_secret) values(secret) returning id into k; return k; end;$$;
    create function vault.update_secret(k uuid,secret text,name text,description text) returns void language sql as $$update vault.decrypted_secrets set decrypted_secret=secret where id=k;$$;
    create table public.organisations(id uuid primary key);
    create table public.profiles(id uuid primary key);
    create table public.organisation_users(organisation_id uuid, user_id uuid, role text, status text);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
    create function public.bridge_is_active_member(org uuid) returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from organisation_users where organisation_id=org and user_id=auth.uid() and status in ('active','accepted'))$$;
    create function public.bridge_is_org_admin(org uuid) returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from organisation_users where organisation_id=org and user_id=auth.uid() and status='active' and role='admin')$$;
    create function public.set_updated_at_timestamp() returns trigger language plpgsql as $$begin new.updated_at=now(); return new; end;$$;
    grant usage on schema public,auth to authenticated,anon,service_role;
  `)
  for (const file of (await readdir(migrations)).filter(file => /^20260913.*revo.*\.sql$/.test(file)).sort()) await db.exec(await readFile(resolve(migrations, file), 'utf8'))
  await db.exec(await readFile(resolve(migrations, '20261025063000_shared_inbox_all_workspaces.sql'), 'utf8'))
  await db.exec(`insert into organisations values ('${A}'),('${B}');
    insert into profiles values ('${admin}'),('${member}'),('${outsider}');
    insert into organisation_users values ('${A}','${admin}','admin','active'),('${B}','${admin}','admin','active'),('${A}','${member}','agent','active'),('${B}','${outsider}','admin','active');
    insert into revo_inbox_channels(id,organisation_id,channel,provider_key,address) values ('${channelA}','${A}','email','google_workspace','a@example.test'),('${channelB}','${B}','email','google_workspace','b@example.test');
    insert into revo_inbox_conversations(id,organisation_id,channel_id,contact_address) values ('${threadA}','${A}','${channelA}','client-a@example.test'),('${threadB}','${B}','${channelB}','client-b@example.test');
    insert into revo_inbox_messages(organisation_id,conversation_id,channel,direction,provider_key,sender_address,recipient_addresses,body_text) values ('${A}','${threadA}','email','inbound','google_workspace','a@example.test',array['inbox@example.test'],'Workspace A only'),('${B}','${threadB}','email','inbound','google_workspace','b@example.test',array['inbox@example.test'],'Workspace B only');`)
  await db.exec(`alter default privileges in schema public grant all on tables to authenticated,anon,service_role;
    alter default privileges in schema private grant all on tables to authenticated,anon,service_role;
    alter default privileges in schema public grant execute on functions to authenticated,anon,service_role;
    alter default privileges in schema private grant execute on functions to authenticated,anon,service_role;`)
  await db.exec(await readFile(resolve(migrations, '20261025181115_shared_inbox_mailbox_foundation.sql'), 'utf8'))
  await db.exec(await readFile(resolve(migrations, '20261025182409_shared_inbox_email_settings.sql'), 'utf8'))
  await db.exec(await readFile(resolve(migrations, '20261025185107_shared_inbox_mail_receiving.sql'), 'utf8'))
  await db.exec(await readFile(resolve(migrations, '20261025191848_shared_inbox_email_sending.sql'), 'utf8'))
  await db.exec('grant all on all tables in schema public to service_role')
  async function as(user) { await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${user}',false);`) }
  await as(member)
  assert.deepEqual((await db.query('select body_text from revo_inbox_messages')).rows.map(row => row.body_text), ['Workspace A only'])
  assert.equal((await db.query(`update revo_inbox_conversations set status='closed' where id='${threadB}' returning id`)).rows.length, 0)
  await db.exec(`insert into revo_inbox_messages(organisation_id,conversation_id,channel,direction,message_type,provider_key,sender_address,recipient_addresses,body_text,created_by,delivery_status) values ('${A}','${threadA}','email','internal','draft','google_workspace','a@example.test',array['client@example.test'],'Private draft','${member}','queued')`)
  await assert.rejects(() => db.exec(`insert into revo_inbox_channels(organisation_id,channel,provider_key,address) values ('${A}','email','google_workspace','unauthorised@example.test')`), /row-level security/)
  await assert.rejects(() => db.exec(`insert into revo_inbox_messages(organisation_id,conversation_id,channel,direction,message_type,provider_key,sender_address,recipient_addresses,body_text,created_by,delivery_status) values ('${A}','${threadA}','email','outbound','message','google_workspace','a@example.test',array['client@example.test'],'Cannot send','${member}','queued')`), /row-level security/)
  await as(outsider)
  await assert.rejects(() => db.exec(`select revo_set_default_inbox_channel('${channelA}')`), /administrator/)
  assert.equal((await db.query(`select * from revo_inbox_conversations where id='${threadA}'`)).rows.length, 0)
  await as(admin)
  await db.exec(`select revo_set_default_inbox_channel('${channelA}')`)
  await assert.rejects(() => db.exec(`update revo_inbox_channels set organisation_id='${B}' where id='${channelA}'`), /cannot move between organisations/)
  await db.exec('reset role;')
  await assert.rejects(() => db.exec(`insert into revo_inbox_conversations(organisation_id,channel_id,contact_address) values ('${A}','${channelB}','cross-tenant@example.test')`), /foreign key/)
  assert.equal((await db.query(`select has_function_privilege('authenticated','public.revo_read_inbox_connection_credential(uuid)','EXECUTE') allowed`)).rows[0].allowed, false)
  await checkMailboxFoundation(db, { A, B, admin, member, outsider, channelA, threadA })
  await checkEmailSettings(db, { A, B, admin, member, outsider, channelA })
  await checkReceiving(db, { A, B, admin, member })
  await checkSending(db, { A, B, admin, member })
  await checkMailboxJourney(db, { A, B, admin, member })
  await db.exec(`reset role; update organisation_users set status='suspended' where user_id='${member}';`)
  await as(member)
  assert.equal((await db.query('select * from revo_inbox_messages')).rows.length, 0)
  await db.exec('reset role; set role anon;')
  await assert.rejects(() => db.query('select * from revo_inbox_messages'), /permission denied/)
  console.log('Shared Inbox: all workspace navigation, migrations and tenant isolation checks passed.')
} catch (error) {
  console.error(error.message)
  if (error.where) console.error(error.where)
  process.exitCode = 1
} finally { await db.close() }
