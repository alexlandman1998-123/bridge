import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migration = readFileSync(resolve('supabase/migrations/20260911172914_email_automation_delivery_telemetry_phase1.sql'), 'utf8')
const webhook = readFileSync(resolve('supabase/functions/resend-webhook/index.ts'), 'utf8')
for (const item of ['email_automation_delivery_events', 'email_automation_delivery_performance', 'security_invoker = true', 'enable row level security', "'complained'", 'delivered_at']) assert.ok(migration.includes(item), `Missing automation telemetry contract: ${item}`)
for (const item of ['email_automation_deliveries', 'email_automation_delivery_events', 'automation: true', 'hard_bounce', 'complaint']) assert.ok(webhook.includes(item), `Missing automation webhook contract: ${item}`)
console.log('Email automation delivery telemetry Phase 1 checks passed.')
