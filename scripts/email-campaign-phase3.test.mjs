import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migration = readFileSync(resolve('supabase/migrations/20260909113000_email_campaigns_foundation.sql'), 'utf8')
const service = readFileSync(resolve('the-it-guy/src/services/emailCampaignService.js'), 'utf8')
const component = readFileSync(resolve('the-it-guy/src/components/marketing/EmailCampaigns.jsx'), 'utf8')

for (const expected of ['create table if not exists public.email_saved_audiences', 'create or replace function public.email_campaign_preview_audience', "p.marketing_consent_status='opted_in'", "cs.status='subscribed'", "v_campaign.audience_filter->>'tag'", 'revoke all on function public.email_campaign_preview_audience(uuid,uuid,jsonb) from public, anon;']) assert.ok(migration.includes(expected), `Missing Phase 3 audience contract: ${expected}`)
assert.match(service, /previewEmailAudience/)
assert.match(service, /saveEmailAudience/)
assert.match(component, /function AudienceStudio/)
assert.match(component, /Specific contacts/)
console.log('Email campaign Phase 3 audience engine checks passed.')
