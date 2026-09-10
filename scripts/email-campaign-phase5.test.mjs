import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migration = readFileSync(resolve('supabase/migrations/20260909113000_email_campaigns_foundation.sql'), 'utf8')
const service = readFileSync(resolve('the-it-guy/src/services/emailCampaignService.js'), 'utf8')
const component = readFileSync(resolve('the-it-guy/src/components/marketing/EmailCampaigns.jsx'), 'utf8')

for (const expected of ['create table if not exists public.email_campaign_audit_events', 'create or replace function public.email_campaign_preflight', 'create or replace function public.email_campaign_duplicate', 'create or replace function public.email_campaign_archive', 'create policy email_campaign_audit_events_admin']) assert.ok(migration.includes(expected), `Missing Phase 5 operations contract: ${expected}`)
assert.match(service, /preflightEmailCampaign/)
assert.match(service, /duplicateEmailCampaign/)
assert.match(component, /Preflight & schedule/)
assert.match(component, /Run preflight/)
console.log('Email campaign Phase 5 operations checks passed.')
