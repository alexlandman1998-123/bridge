import { beforeEach, expect, it, vi } from 'vitest'
const rpc = vi.hoisted(() => vi.fn())
vi.mock('../../lib/supabaseClient', () => ({ supabase: { rpc }, isSupabaseConfigured: true }))
import { readCalendarHealth, readAppointmentSupport, recoverAppointmentDelivery, calendarSupportDeadline } from '../calendarSupportService'
beforeEach(() => rpc.mockReset())
it('validates health scope, background state and inspect permissions before exposing results', async () => {
 const report = { verified: true, organisationId: 'org', issues: [], monitor: { status: 'not_started' }, truncated: false }
 rpc.mockResolvedValueOnce({ data: report }); expect(await readCalendarHealth('org')).toEqual(report)
 expect(rpc).toHaveBeenCalledWith('read_calendar_health', { p_organisation_id: 'org', p_limit: 100 })
 for (const bad of [{ ...report, organisationId: 'other' }, { ...report, monitor: { status: 'healthy' } }, { ...report, issues: [{ issue_key: 'key', kind: 'missing_reminder' }] }, { ...report, verified: false }]) {
  rpc.mockResolvedValueOnce({ data: bad }); await expect(readCalendarHealth('org')).rejects.toThrow(/could not be verified/)
 }
})
it('rejects wrong appointment and malformed receipt or history instead of rendering it', async () => {
 const data = { verified: true, organisationId: 'org', appointmentId: 'appt', revision: 2, status: 'requested', reconcileAllowed: true, jobs: [], history: [], participants: [] }
 rpc.mockResolvedValueOnce({ data }); expect(await readAppointmentSupport('org', 'appt')).toEqual(data)
 for (const bad of [{ ...data, appointmentId: 'other' }, { ...data, history: [{ changed_fields: null }] }, { ...data, jobs: [{ id: 'job' }] }, { ...data, participants: [{}] }]) {
  rpc.mockResolvedValueOnce({ data: bad }); await expect(readAppointmentSupport('org', 'appt')).rejects.toThrow(/could not be verified/)
 }
 rpc.mockResolvedValueOnce({ error: { message: 'Access denied' } }); await expect(readAppointmentSupport('org', 'appt')).rejects.toThrow('Access denied')
})
it('sends a revision and stable command and verifies queued counts without claiming delivery', async () => {
 const args = { organisationId: 'org', appointmentId: 'appt', revision: 2, action: 'retry', jobId: 'job', commandId: 'cmd', reason: ' Checked outage ' }
 const data = { verified: true, ...args, queued: 1, retired: 0 }
 rpc.mockResolvedValueOnce({ data }); expect((await recoverAppointmentDelivery(args)).queued).toBe(1)
 expect(rpc).toHaveBeenCalledWith('calendar_support_action', { p_organisation_id: 'org', p_appointment_id: 'appt', p_expected_revision: 2, p_action: 'retry', p_job_id: 'job', p_command_id: 'cmd', p_reason: 'Checked outage' })
 for (const bad of [{ ...data, commandId: 'wrong' }, { ...data, revision: 3 }, { ...data, queued: -1 }, { ...data, verified: false }]) {
  rpc.mockResolvedValueOnce({ data: bad }); await expect(recoverAppointmentDelivery(args)).rejects.toThrow(/could not be verified/)
 }
 await expect(recoverAppointmentDelivery({ ...args, reason: ' ' })).rejects.toThrow(/reason/)
})
it('bounds a stalled support read so retry remains possible', async () => {
 vi.useFakeTimers()
 try {
  const pending = expect(calendarSupportDeadline(new Promise(() => {}))).rejects.toThrow(/taking too long/)
  await vi.advanceTimersByTimeAsync(15000); await pending
 } finally { vi.useRealTimers() }
})
