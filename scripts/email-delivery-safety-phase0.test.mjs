import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migration = readFileSync(resolve('supabase/migrations/20260911172636_email_delivery_safety_phase0.sql'), 'utf8')
const campaignWorker = readFileSync(resolve('supabase/functions/email-campaign-worker/index.ts'), 'utf8')
const automationWorker = readFileSync(resolve('supabase/functions/email-automation-worker/index.ts'), 'utf8')
for (const item of ['email_delivery_reservations', 'pg_advisory_xact_lock', 'email_campaign_claim_jobs', 'email_campaign_claim_recipients', 'for update skip locked', "attempts >= 3", 'email_automation_claim_deliveries']) assert.ok(migration.includes(item), `Missing delivery safety contract: ${item}`)
for (const item of ['email_campaign_claim_jobs', 'email_campaign_claim_recipients', 'email_delivery_reserve_quota', 'email_delivery_set_reservation', 'next_attempt_at']) assert.ok(campaignWorker.includes(item), `Missing campaign worker safety contract: ${item}`)
for (const item of ['email_delivery_reserve_quota', 'email_delivery_set_reservation', 'deliveryKey']) assert.ok(automationWorker.includes(item), `Missing automation worker safety contract: ${item}`)
console.log('Email delivery safety Phase 0 checks passed.')
