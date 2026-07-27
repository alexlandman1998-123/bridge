import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

const [inbound, router, types, content, migration] = await Promise.all([
  read('supabase/functions/inbound-lead-email/index.ts'),
  read('supabase/functions/send-email/index.ts'),
  read('supabase/functions/send-email/types.ts'),
  read('supabase/functions/send-email/content/leadAcknowledgement.ts'),
  read('supabase/migrations/202607270001_lead_acknowledgement_email.sql'),
])

assert.match(router, /handleLeadAcknowledgementEmail/)
assert.match(router, /lead_acknowledgement/)
assert.match(types, /SendLeadAcknowledgementPayload/)

assert.match(inbound, /dispatchLeadAcknowledgementEmail/)
assert.match(inbound, /lead-acknowledgement:\$\{organisationId\}:/)
assert.match(inbound, /acknowledgement dispatch failed without rolling back lead ingestion/)
assert.match(inbound, /replyTo/)
assert.match(inbound, /notification_events/)
assert.match(inbound, /lead_activities/)

assert.match(content, /buildLeadAcknowledgementEmailHtml/)
assert.match(content, /buildLeadAcknowledgementEmailText/)
assert.match(content, /escapeHtml/)
assert.match(content, /originalMessage/)
assert.doesNotMatch(content, /property image/i)
assert.doesNotMatch(content, /Property address:/)
assert.doesNotMatch(content, /listing card/i)
assert.doesNotMatch(content, /WhatsApp/i)

assert.match(migration, /automatic_lead_acknowledgement_enabled/)
assert.match(migration, /acknowledgement_status/)
assert.match(migration, /notification_events_lead_acknowledgement_dedupe_idx/)

console.log('lead acknowledgement email contract checks passed')
