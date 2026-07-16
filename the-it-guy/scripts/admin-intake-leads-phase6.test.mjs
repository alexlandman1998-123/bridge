import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const appRoot = new URL('../', import.meta.url)
const repoRoot = new URL('../../', import.meta.url)
const readApp = (path) => readFile(new URL(path, appRoot), 'utf8')
const [migration, api, service, page, health, detail, governance] = await Promise.all([
  readFile(new URL('supabase/migrations/202607160007_admin_intake_launch_assurance_phase6.sql', repoRoot), 'utf8'),
  readApp('server/services/publicDemoEnquiriesApi.js'),
  readApp('src/services/adminIntakeLeadService.js'),
  readApp('src/pages/PlatformLeadsPage.jsx'),
  readApp('src/components/platform/leads/LeadPipelineHealth.jsx'),
  readApp('src/components/platform/leads/LeadDetailPanel.jsx'),
  readApp('src/components/platform/leads/LeadGovernancePanel.jsx'),
])

assert.match(migration, /notification_retried/, 'The audit ledger must support notification retry events')
assert.match(migration, /demo_enquiries_notification_recovery_idx/, 'The notification recovery queue needs an index')
assert.match(migration, /where notification_status in \('pending', 'failed', 'skipped'\)/, 'Only unresolved delivery states belong in the recovery index')
assert.match(migration, /arch9_admin_intake_pipeline_health_v1/, 'Phase 6 needs an admin health contract')
assert.match(migration, /bridge_is_platform_admin\(\)/, 'Pipeline health must remain admin-only')
assert.match(migration, /created_at < now\(\) - interval '15 minutes'/, 'Stale pending notifications must degrade health')
assert.match(migration, /grant execute on function public\.arch9_admin_intake_pipeline_health_v1\(\) to authenticated/, 'Only authenticated callers may execute health checks')

assert.match(api, /action === 'retry_notification'/, 'The admin API must expose an explicit retry action')
assert.match(api, /currentResult\.data\.notification_status === 'sent'/, 'Already-delivered notifications must not be resent')
assert.match(api, /event_type: 'notification_retried'/, 'Retry attempts must be audited')
assert.match(api, /await sendNotificationEmail\(currentResult\.data, id\)/, 'Retry must reuse the canonical email renderer')
assert.match(api, /arch9_admin_intake_pipeline_health_v1/, 'Lead list responses must use database health telemetry')
assert.match(service, /retryAdminIntakeLeadNotification/, 'The browser service needs a retry operation')
assert.match(service, /health: data\.health/, 'The browser service must normalize pipeline health')
assert.match(page, /<LeadPipelineHealth/, 'The Leads workspace must show operational health')
assert.match(page, /retryNotification/, 'The Leads workspace must coordinate delivery recovery')
assert.match(detail, /Retry delivery/, 'A failed lead notification needs an operator action')
assert.match(health, /Pipeline healthy/, 'The health banner needs a healthy state')
assert.match(health, /Delivery needs attention/, 'The health banner needs an attention state')
assert.match(governance, /notification_retried/, 'Notification retries must appear in lead activity')

console.log('Admin intake Leads Phase 6 passed')

