import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migration = readFileSync(resolve('supabase/migrations/20260911172014_email_automation_event_worker_phase8.sql'), 'utf8')
const worker = readFileSync(resolve('supabase/functions/email-automation-worker/index.ts'), 'utf8')
const config = readFileSync(resolve('supabase/config.toml'), 'utf8')
for (const item of ['email_automation_events', 'email_automation_deliveries', 'email_automation_claim_events', 'for update skip locked', 'email_automation_enrol', 'email_automation_enqueue_event', 'email_automation_contact_created_event', 'email_automation_tag_added_event', 'grant execute on function public.email_automation_claim_events']) assert.ok(migration.includes(item), `Missing automation queue contract: ${item}`)
for (const item of ['email_automation_claim_events', 'email_automation_claim_enrolments', 'email_automation_claim_deliveries', 'marketing_consent_status !== "opted_in"', 'verification_status !== "verified"', 'idempotency-key', 'retryAt']) assert.ok(worker.includes(item), `Missing automation worker contract: ${item}`)
assert.ok(config.includes('[functions.email-automation-worker]'), 'Automation worker is not configured')
console.log('Email automation event worker Phase 8 checks passed.')
