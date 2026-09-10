import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migration = readFileSync(resolve('supabase/migrations/20260909113000_email_campaigns_foundation.sql'), 'utf8')
const worker = readFileSync(resolve('supabase/functions/email-campaign-worker/index.ts'), 'utf8')
const preferences = readFileSync(resolve('supabase/functions/email-preference-centre/index.ts'), 'utf8')

for (const expected of [
  'create table if not exists public.email_subscription_types',
  'create table if not exists public.contact_email_subscriptions',
  'create table if not exists public.email_sending_policies',
  'create or replace function public.email_campaign_ensure_subscription_types',
  'create or replace view public.email_deliverability_health with (security_invoker = true)',
  "coalesce(p.marketing_consent_status,'unknown') = 'opted_in'",
  "cs.status='subscribed'",
]) assert.ok(migration.includes(expected), `Missing Phase 1 contract: ${expected}`)

assert.match(worker, /daily_recipient_limit/)
assert.match(worker, /marketing_consent_status !== "opted_in"/)
assert.match(preferences, /email_suppressions.*delete/)
assert.match(preferences, /contact_email_subscriptions/)
console.log('Email campaign Phase 1 trust and deliverability checks passed.')
