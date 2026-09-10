import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migration = readFileSync(resolve('supabase/migrations/20260909113000_email_campaigns_foundation.sql'), 'utf8')
const worker = readFileSync(resolve('supabase/functions/email-campaign-worker/index.ts'), 'utf8')
const tracker = readFileSync(resolve('supabase/functions/email-campaign-track/index.ts'), 'utf8')
const service = readFileSync(resolve('the-it-guy/src/services/emailCampaignService.js'), 'utf8')

for (const expected of ['create table if not exists public.email_campaign_links', 'tracking_token text not null unique', 'create or replace view public.email_campaign_link_performance with (security_invoker = true)', 'create policy email_campaign_links_member']) assert.ok(migration.includes(expected), `Missing Phase 4 analytics contract: ${expected}`)
assert.match(worker, /async function trackLinks/)
assert.match(worker, /email-campaign-track/)
assert.match(tracker, /recipient\.campaign_id !== link\.campaign_id/)
assert.match(tracker, /Response\.redirect\(link\.target_url, 302\)/)
assert.match(service, /getEmailCampaignAnalytics/)
console.log('Email campaign Phase 4 analytics checks passed.')
