import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, expect, it } from 'vitest'

const org = '11111111-1111-4111-8111-111111111111'
const otherOrg = '22222222-2222-4222-8222-222222222222'
const user = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const otherUser = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
let db
let image
async function signIn(organisation = org, identity = user, role = 'authenticated') {
  await db.exec(`reset role; set test.organisation_id = '${organisation}'; set test.user_id = '${identity}'; set role ${role}`)
}
const reserve = (organisation = org, mime = 'image/png', bytes = 8) => db.query('select public.email_campaign_reserve_asset($1,$2,$3,$4) as asset', [organisation, 'hero.png', mime, bytes])
const objects = () => db.query("select name from storage.objects where bucket_id='email-campaign-images'")
const upload = (asset, metadata = { mimetype: asset.mime_type, size: asset.byte_size }) => db.query('insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)', ['email-campaign-images', asset.storage_path, JSON.stringify(metadata)])

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role authenticated; create role anon; create role service_role bypassrls;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key);
    create table public.organisations(id uuid primary key);
    insert into auth.users values('${user}'),('${otherUser}');
    insert into public.organisations values('${org}'),('${otherOrg}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.user_id',true),'')::uuid $$;
    create function public.bridge_has_organisation_membership(p_id uuid) returns boolean language sql stable as $$
      select auth.uid() is not null and p_id::text=current_setting('test.organisation_id',true) $$;
    grant usage on schema auth,storage to authenticated,anon;
    grant execute on all functions in schema auth to authenticated,anon;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,metadata jsonb,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant all on storage.objects to authenticated,anon;
    create policy legacy_broad_storage_access on storage.objects for all to authenticated,anon using(true) with check(true);
    alter default privileges in schema public grant all on tables to authenticated,anon;
  `)
  await db.exec(readFileSync(new URL('../../../../../supabase/migrations/20261009113022_email_campaign_image_assets.sql', import.meta.url), 'utf8'))
  await signIn()
}, 20000)
afterAll(async () => { await db?.close() })

it('reserves a canonical agency path and returns only actual, verified Storage objects', async () => {
  await signIn()
  image = (await reserve()).rows[0].asset
  expect(image.storage_path).toBe(`organisations/${org}/${image.id}.png`)
  expect((await db.query('select * from public.email_campaign_list_assets($1)', [org])).rows).toHaveLength(0)
  await upload(image)
  expect((await db.query('select * from public.email_campaign_list_assets($1,$2)', [org, image.id])).rows).toMatchObject([{ id: image.id }])
  const incomplete = (await reserve()).rows[0].asset
  expect(incomplete.original_name).toBe(image.original_name)
  expect(incomplete.storage_path).not.toBe(image.storage_path)
  await upload(incomplete, { mimetype: 'image/png', size: 999 })
  expect((await db.query('select * from public.email_campaign_list_assets($1,$2)', [org, incomplete.id])).rows).toHaveLength(0)
})

it('blocks invalid types and sizes at the database boundary', async () => {
  await signIn()
  for (const [type, size] of [['image/svg+xml', 8], ['text/html', 8], ['image/png', 0], ['image/png', 5242881]]) {
    await expect(reserve(org, type, size)).rejects.toThrow('5 MB')
  }
})

it('isolates library reads and reservations even with legacy broad Storage policies', async () => {
  await signIn(otherOrg, otherUser)
  expect((await objects()).rows).toHaveLength(0)
  expect((await db.query('select * from public.email_campaign_assets')).rows).toHaveLength(0)
  await expect(reserve(org)).rejects.toThrow('agency')
  await expect(db.query('select * from public.email_campaign_list_assets($1)', [org])).rejects.toThrow('Not authorised')
  await expect(upload(image)).rejects.toThrow()
  const otherImage = (await reserve(otherOrg)).rows[0].asset
  await upload(otherImage)
  expect((await objects()).rows).toHaveLength(1)
  await signIn()
  expect((await objects()).rows.every((row) => row.name.startsWith(`organisations/${org}/`))).toBe(true)
})

it('prevents using another member’s reservation and prevents unregistered paths', async () => {
  await signIn()
  const pending = (await reserve()).rows[0].asset
  await signIn(org, otherUser)
  await expect(upload(pending)).rejects.toThrow('row-level security')
  await signIn()
  await expect(db.query('insert into storage.objects(bucket_id,name) values($1,$2)', ['email-campaign-images', `organisations/${org}/unknown.png`])).rejects.toThrow('row-level security')
})

it('keeps every original object immutable, including assets used by drafts, sent campaigns, templates and revisions', async () => {
  await signIn()
  expect((await db.query("update storage.objects set name=name || '-moved' where name=$1 returning id", [image.storage_path])).rows).toHaveLength(0)
  expect((await db.query('delete from storage.objects where name=$1 returning id', [image.storage_path])).rows).toHaveLength(0)
  await expect(db.query('insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3) on conflict(bucket_id,name) do update set metadata=excluded.metadata', ['email-campaign-images', image.storage_path, '{"mimetype":"image/png","size":8}'])).rejects.toThrow()
  await expect(db.query("update public.email_campaign_assets set original_name='changed' where id=$1", [image.id])).rejects.toThrow('permission denied')
  await expect(db.query('delete from public.email_campaign_assets where id=$1', [image.id])).rejects.toThrow('permission denied')
  expect((await db.query('select * from public.email_campaign_list_assets($1,$2)', [org, image.id])).rows).toHaveLength(1)
})

it('does not let another bucket’s object be moved into the campaign bucket', async () => {
  await db.exec("reset role; insert into storage.buckets(id,name,public) values('other','other',false)")
  await signIn()
  await db.exec("insert into storage.objects(bucket_id,name) values('other','movable')")
  await expect(db.query('update storage.objects set bucket_id=$1,name=$2 where name=$3', ['email-campaign-images', `organisations/${org}/forged.png`, 'movable'])).rejects.toThrow('row-level security')
  expect((await db.query("delete from storage.objects where bucket_id='other' returning id")).rows).toHaveLength(1)
})

it('denies anonymous listing, upload and RPC access while provisioning a public download bucket', async () => {
  await signIn('', '', 'anon')
  expect((await objects()).rows).toHaveLength(0)
  await expect(reserve()).rejects.toThrow('permission denied')
  await expect(upload(image)).rejects.toThrow('row-level security')
  await db.exec('reset role')
  const config = (await db.query("select public,file_size_limit,allowed_mime_types from storage.buckets where id='email-campaign-images'")).rows[0]
  expect(config).toEqual({ public: true, file_size_limit: 5242880, allowed_mime_types: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] })
  const privileges = (await db.query("select has_table_privilege('authenticated','public.email_campaign_assets','INSERT') as can_insert, has_function_privilege('anon','public.email_campaign_list_assets(uuid,uuid)','EXECUTE') as can_list")).rows[0]
  expect(privileges).toEqual({ can_insert: false, can_list: false })
})
