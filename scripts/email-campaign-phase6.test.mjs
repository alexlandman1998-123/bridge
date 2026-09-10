import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migration = readFileSync(resolve('supabase/migrations/20260909113000_email_campaigns_foundation.sql'), 'utf8')
const service = readFileSync(resolve('the-it-guy/src/services/emailCampaignService.js'), 'utf8')
const adapter = readFileSync(resolve('the-it-guy/src/services/emailCampaignBillingAdapter.js'), 'utf8')
const component = readFileSync(resolve('the-it-guy/src/components/marketing/EmailCampaigns.jsx'), 'utf8')

for (const expected of ['create table if not exists public.email_billing_profiles', "adapter_key in ('no_charge','prepaid_wallet')", 'create or replace function public.email_campaign_quote_usage', "billing_status='no_charge'", 'create policy email_billing_profiles_admin']) assert.ok(migration.includes(expected), `Missing Phase 6 billing contract: ${expected}`)
assert.match(service, /quoteEmailCampaignUsage/)
assert.match(adapter, /noChargeEmailBillingAdapter/)
assert.match(adapter, /estimatedCharge: 0/)
assert.match(component, /function UsagePanel/)
console.log('Email campaign Phase 6 billing readiness checks passed.')
