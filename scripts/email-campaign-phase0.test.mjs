import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migration = readFileSync(resolve('supabase/migrations/20260909113000_email_campaigns_foundation.sql'), 'utf8')

for (const required of [
  'create table if not exists public.email_marketing_contact_sources',
  'unique (organisation_id, email)',
  'create or replace function public.email_campaign_refresh_contact_projection',
  'revoke all on function public.email_campaign_refresh_contact_projection(uuid) from public, anon, authenticated;',
  'create or replace function public.email_campaign_guard_immutable_snapshot',
  'alter view public.email_campaign_performance set (security_invoker = true);',
  "source_kind in ('crm_contact','crm_lead','csv_import','manual')",
]) assert.ok(migration.includes(required), `Missing Phase 0 campaign contract: ${required}`)

assert.match(migration, /email_sender_identities_create_admin[\s\S]*verification_status = 'pending'/)
assert.match(migration, /email_campaigns_immutable_snapshot before update on public\.email_campaigns/)
assert.doesNotMatch(migration, /create policy email_sender_identities_member/)

console.log('Email campaign Phase 0 contract checks passed.')
