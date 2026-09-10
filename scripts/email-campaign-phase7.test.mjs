import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migration = readFileSync(resolve('supabase/migrations/20260909113000_email_campaigns_foundation.sql'), 'utf8')
const service = readFileSync(resolve('the-it-guy/src/services/emailCampaignService.js'), 'utf8')
const component = readFileSync(resolve('the-it-guy/src/components/marketing/EmailCampaigns.jsx'), 'utf8')

for (const expected of ['create or replace view public.email_campaign_daily_performance with (security_invoker = true)', 'create or replace view public.email_campaign_category_performance with (security_invoker = true)', 'grant select on public.email_campaign_daily_performance, public.email_campaign_category_performance to authenticated;']) assert.ok(migration.includes(expected), `Missing Phase 7 intelligence contract: ${expected}`)
assert.match(service, /dailyPerformance/)
assert.match(service, /categoryPerformance/)
assert.match(component, /function InsightsPanel/)
assert.match(component, /PERFORMANCE INTELLIGENCE/)
console.log('Email campaign Phase 7 intelligence checks passed.')
