import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { buildAttorneyFirmAllocationAlertSummary } from '../src/services/attorneyFirmAllocationAlertsService.js'

const summary = buildAttorneyFirmAllocationAlertSummary([
  {
    id: 'acceptance-overdue',
    alertType: 'firm_acceptance_overdue',
    severity: 'critical',
    status: 'open',
    dueAt: '2026-07-16T08:00:00.000Z',
  },
  {
    id: 'assignment-required',
    alertType: 'internal_assignment_required',
    severity: 'warning',
    status: 'acknowledged',
    dueAt: '2026-07-18T08:00:00.000Z',
  },
  {
    id: 'resolved',
    alertType: 'firm_nomination_received',
    severity: 'info',
    status: 'resolved',
  },
], { now: new Date('2026-07-17T08:00:00.000Z') })

assert.equal(summary.totalCount, 3)
assert.equal(summary.openCount, 2)
assert.equal(summary.criticalCount, 1)
assert.equal(summary.overdueCount, 1)
assert.equal(summary.requiresAttention, true)
assert.equal(summary.nextDueAt, '2026-07-16T08:00:00.000Z')
assert.equal(summary.countsByType.firm_acceptance_overdue, 1)

const [migration, service, actionsComponent, refreshScript, packageSource, runbook] = await Promise.all([
  readFile(new URL('../../supabase/migrations/202607170009_attorney_firm_first_notifications_sla_phase9.sql', import.meta.url), 'utf8'),
  readFile(new URL('../src/services/attorneyFirmAllocationAlertsService.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/attorney/assignments/TransferFirmAllocationActions.jsx', import.meta.url), 'utf8'),
  readFile(new URL('./refresh-attorney-firm-allocation-sla-alerts.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../package.json', import.meta.url), 'utf8'),
  readFile(new URL('../docs/attorney-firm-first-operations-phase9.md', import.meta.url), 'utf8'),
])

assert.match(migration, /create table if not exists public\.attorney_firm_allocation_alerts/)
assert.match(migration, /dedupe_key text not null unique/)
assert.match(migration, /bridge_refresh_transfer_firm_allocation_sla_alerts/)
assert.match(migration, /Seed the durable outbox for allocations already in progress/)
assert.match(migration, /perform public\.bridge_refresh_transfer_firm_allocation_sla_alerts\(\)/)
assert.match(migration, /interval '48 hours'/)
assert.match(migration, /interval '24 hours'/)
assert.match(migration, /revoke update on public\.attorney_firm_allocation_alerts from authenticated/)
assert.match(migration, /bridge_acknowledge_transfer_firm_alert/)
assert.match(migration, /to service_role/)
assert.match(service, /attorney_firm_allocation_alert_queue_v1/)
assert.match(service, /bridge_acknowledge_transfer_firm_alert/)
assert.match(actionsComponent, /Operational alerts/)
assert.match(actionsComponent, /acknowledgeAttorneyFirmAllocationAlert/)
assert.match(refreshScript, /SUPABASE_SERVICE_ROLE_KEY/)
assert.match(packageSource, /test:attorney-firm-first-allocation-phase9/)
assert.match(runbook, /does not send email, SMS, or push messages/i)
assert.doesNotMatch(migration, /delete from|drop table|drop column/i)

console.log('Attorney firm-first allocation Phase 9 alerting and SLA tests passed')
