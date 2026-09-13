import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { it, expect } from 'vitest'

it('captures draft revisions atomically and enforces read-only history', async () => {
  const db = new PGlite()
  await db.exec(`create role authenticated; create role anon; create schema auth;
    create function auth.uid() returns uuid language sql as $$ select '00000000-0000-0000-0000-000000000001'::uuid $$;
    create function public.email_campaign_can_send(uuid) returns boolean language sql as $$ select true $$;
    create table public.organisations(id uuid primary key);
    create table public.email_campaigns(id uuid primary key, organisation_id uuid references organisations(id), created_by uuid, name text, subject text constraint email_campaigns_subject_check check(length(btrim(subject)) between 1 and 250), status text, preview_text text, content_json jsonb, audience_filter jsonb, sender_identity_id uuid, subscription_type_id uuid);
  `)
  await db.exec(readFileSync(new URL('../../../../../supabase/migrations/20260913133840_email_visual_builder.sql', import.meta.url), 'utf8'))
  await db.exec('grant all on public.email_campaign_revisions to authenticated, anon')
  await db.exec(readFileSync(new URL('../../../../../supabase/migrations/20260913135936_email_revision_permissions.sql', import.meta.url), 'utf8'))
  await db.exec(`insert into organisations values('00000000-0000-0000-0000-000000000002');
    insert into email_campaigns(id,organisation_id,created_by,name,subject,status,content_json) values('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000002',auth.uid(),'Draft','','draft','{"version":1}');
    update email_campaigns set subject='A real subject';
    update email_campaigns set subject='A real subject';`)
  expect((await db.query('select * from email_campaign_revisions')).rows).toHaveLength(2)
  await expect(db.exec("update email_campaigns set subject='',status='sending'")).rejects.toThrow()
  const privileges = await db.query("select has_table_privilege('authenticated','email_campaign_revisions','UPDATE') as can_update, has_table_privilege('authenticated','email_campaign_revisions','DELETE') as can_delete, has_table_privilege('authenticated','email_campaign_revisions','TRUNCATE') as can_truncate")
  expect(privileges.rows[0]).toEqual({ can_update: false, can_delete: false, can_truncate: false })
  await db.close()
}, 20000)
