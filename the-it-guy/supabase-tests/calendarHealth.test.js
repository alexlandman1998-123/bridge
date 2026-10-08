import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { setupCalendarReservationDatabase, org, otherOrg, actor, second, outsider, booking, id, input, people } from './calendarReservationFixture.js'
let db
async function role(user = actor, name = 'authenticated') {
 await db.exec('reset role'); await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: user })]); await db.exec(`set role ${name}`)
}
async function save(data = {}, attendees = people([]), revision = null, command = id(20)) {
 return (await db.query('select save_calendar_appointment_with_delivery($1,$2,$3,$4,$5,$6) as result', [org, booking, JSON.stringify(input(data)), attendees === null ? null : JSON.stringify(attendees), revision, command])).rows[0].result
}
const health = async (workspace = org, limit = 100) => (await db.query('select read_calendar_health($1,$2) as result', [workspace, limit])).rows[0].result
const support = async () => (await db.query('select read_calendar_appointment_support($1,$2) as result', [org, booking])).rows[0].result
const action = async ({ name = 'reconcile', job = null, revision = 0, command = id(21), reason = 'Reviewed delivery recovery' } = {}) =>
 (await db.query('select calendar_support_action($1,$2,$3,$4,$5,$6,$7) as result', [org, booking, revision, name, job, command, reason])).rows[0].result
const raw = async query => { await db.exec('reset role'); return db.exec(query) }
beforeAll(async () => { db = new PGlite(); await setupCalendarReservationDatabase(db) }, 30000)
beforeEach(async () => {
 await raw('truncate appointments,appointment_participants,private.calendar_mutation_receipts,private.calendar_provider_connections,private.calendar_health_scans,private.calendar_health_incidents cascade')
 await raw(`update organisation_users set status='active',role='agent'`); await role()
})
afterAll(async () => db?.close())
it('reads live scoped health without claiming a monitor ran or exposing capabilities', async () => {
 await save(); const report = await health()
 expect(report).toMatchObject({ verified: true, organisationId: org, issues: [], truncated: false, monitor: { status: 'not_started' } })
 const details = await support()
 expect(details).toMatchObject({ verified: true, appointmentId: booking, revision: 0, reconcileAllowed: true })
 expect(details.history.some(h => h.changed_fields.includes('created'))).toBe(true)
 expect(details.participants).toHaveLength(1)
 expect(JSON.stringify(details)).not.toMatch(/rsvp_token|provider_payload|acceptLink|credential|fingerprint/)
})
it('detects overdue, interrupted, exhausted and expired delivery separately', async () => {
 await save({ reminder_rules: [{ reminderType: 'custom_30m', offsetMinutes: 30 }] })
 await raw("update calendar_delivery_jobs set next_attempt_at=now()-interval '11 minutes' where event_kind='invite'")
 await role(); expect((await health()).issues.map(i => i.kind)).toContain('delivery_overdue')
 await raw("update calendar_delivery_jobs set status='processing',claimed_at=now()-interval '6 minutes' where event_kind='invite'")
 await role(); expect((await health()).issues.map(i => i.kind)).toContain('stalled_delivery')
 await raw("update calendar_delivery_jobs set status='failed',attempt_count=max_attempts where event_kind='invite'")
 await role(); expect((await health()).issues.map(i => i.kind)).toContain('delivery_exhausted')
 await raw("update calendar_delivery_jobs set expires_at=now()-interval '1 minute' where event_kind='invite'")
 await role(); expect((await health()).issues.map(i => i.kind)).toContain('delivery_expired')
})
it('detects missing routes but reconciliation recreates only future reminders and keeps stable receipts', async () => {
 await save({ reminder_rules: [{ reminderType: 'custom_30m', offsetMinutes: 30 }] })
 await raw('delete from calendar_delivery_jobs'); await role()
 expect(new Set((await health()).issues.map(i => i.kind))).toEqual(new Set(['missing_reminder', 'missing_invitation']))
 const restored = await action(); expect(restored).toMatchObject({ queued: 2, retired: 0, revision: 0 })
 expect((await support()).jobs.every(job => job.event_kind === 'reminder:custom_30m')).toBe(true)
 expect(await action()).toMatchObject({ ...restored, replayed: true })
 expect(await action({ command: id(22) })).toMatchObject({ queued: 0 })
 expect((await health()).issues.every(issue => issue.kind === 'missing_invitation')).toBe(true)
})
it('never recreates skipped short-notice offsets or sends an invitation during reconciliation', async () => {
 const start = new Date(Date.now() + 20 * 60000), end = new Date(start.getTime() + 30 * 60000)
 const parts = date => Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date).map(p => [p.type, p.value]))
 const p = parts(start), e = parts(end)
 await save({ appointment_date: `${p.year}-${p.month}-${p.day}`, start_time: `${p.hour}:${p.minute}`, end_time: `${e.hour}:${e.minute}`, date_time: new Date(start.setUTCSeconds(0,0)).toISOString(), end_date_time: new Date(end.setUTCSeconds(0,0)).toISOString(), reminder_rules: [{ reminderType: 'custom_30m', offsetMinutes: 30 }] })
 await raw('delete from calendar_delivery_jobs'); await role()
 expect(await action()).toMatchObject({ queued: 0 })
 expect((await support()).jobs).toEqual([])
})
it('requires management scope and active membership, with anonymous and cross-organisation denials', async () => {
 await save({}, people([{ user_id: second, name: 'Co-agent', email: 'other@example.test', participant_role: 'Co-agent' }]))
 await role(second); expect((await health()).issues).toEqual([])
 await expect(support()).rejects.toThrow(/access denied/); await expect(action()).rejects.toThrow(/access denied/)
 await role(outsider); await expect(health()).rejects.toThrow(/access denied/)
 await role(); await expect(health(otherOrg)).rejects.toThrow(/access denied/)
 await role(null, 'anon'); await expect(health()).rejects.toThrow(/permission denied/)
 await expect(action()).rejects.toThrow(/permission denied/)
 await role(actor, 'service_role'); await expect(db.query('select * from private.calendar_support_commands')).rejects.toThrow(/permission denied/)
 await raw(`update organisation_users set status='removed' where user_id='${actor}'`); await role()
 await expect(support()).rejects.toThrow(/access denied/)
})
it('allows an active principal to inspect another agent but denies private-table reads', async () => {
 await save(); await raw(`update organisation_users set role='principal' where user_id='${second}'`); await role(second)
 expect((await support()).appointmentId).toBe(booking)
 await expect(db.query('select * from private.calendar_change_history')).rejects.toThrow(/permission denied/)
})
it('denies a nullable legacy permission result instead of treating it as approval', async () => {
 await save(); await raw('update appointments set created_by=null'); await role(second)
 await expect(support()).rejects.toThrow(/access denied/)
 await expect(action()).rejects.toThrow(/access denied/)
 expect((await health()).issues).toEqual([])
})
it('retries an exhausted job once without changing ID, attempt history or frozen content', async () => {
 await save(); await raw("update calendar_delivery_jobs set status='failed',attempt_count=max_attempts,payload='{\"frozen\":true}',provider_payload='{\"frozenVendor\":true}' where event_kind='invite'")
 await role(); const job = (await support()).jobs.find(j => j.event_kind === 'invite')
 expect(job.retry_allowed).toBe(true)
 const receipt = await action({ name: 'retry', job: job.id })
 expect(receipt).toMatchObject({ verified: true, queued: 1 })
 expect(await action({ name: 'retry', job: job.id })).toMatchObject({ ...receipt, replayed: true })
 await raw('select 1')
 const persisted = (await db.query('select * from calendar_delivery_jobs where id=$1', [job.id])).rows[0]
 expect(persisted).toMatchObject({ status: 'queued', attempt_count: 5, max_attempts: 6, payload: { frozen: true }, provider_payload: { frozenVendor: true } })
})
it('rejects accepted, automatically retrying, old and cancelled jobs', async () => {
 await save(); await role(actor, 'service_role')
 const job = (await db.query('select * from claim_calendar_delivery(1)')).rows[0]
 await db.query("select complete_calendar_delivery($1,$2,'provider_accepted','receipt')", [job.id, job.attempt_count])
 await role(); await expect(action({ name: 'retry', job: job.id })).rejects.toThrow(/not eligible/)
 await raw("update calendar_delivery_jobs set status='failed',provider_message_id=null,accepted_at=null where id='" + job.id + "'")
 await role(); await expect(action({ name: 'retry', job: job.id })).rejects.toThrow(/not eligible/)
 await raw("update calendar_delivery_jobs set attempt_count=max_attempts,created_at=now()-interval '24 hours' where id='" + job.id + "'")
 await role(); await expect(action({ name: 'retry', job: job.id })).rejects.toThrow(/not eligible/)
 await save({ status: 'cancelled' }, null, 0, id(22))
 await expect(action({ name: 'retry', job: job.id, revision: 1 })).rejects.toThrow(/not eligible/)
 await expect(action({ revision: 1 })).rejects.toThrow(/active reservation/)
})
it('rejects stale revisions, changed command contents and reasonless commands atomically', async () => {
 await save(); await expect(action({ reason: '' })).rejects.toThrow(/reason/)
 await action(); await expect(action({ reason: 'Different' })).rejects.toThrow(/different details/)
 await save({ title: 'Changed' }, null, 0, id(22))
 await expect(action({ command: id(23) })).rejects.toThrow(/changed/)
 expect((await support()).history.filter(h => h.source === 'support')).toHaveLength(1)
})
it('detects inconsistent schedules and refuses a guessed repair', async () => {
 await save(); await raw("alter table appointments disable trigger calendar_final_appointment_slot"); await raw("update appointments set end_date_time=end_date_time+interval '1 hour'"); await raw("alter table appointments enable trigger calendar_final_appointment_slot"); await role()
 expect((await health()).issues.map(i => i.kind)).toContain('schedule_inconsistent')
 expect((await support()).reconcileAllowed).toBe(false)
 await expect(action({ revision: (await support()).revision })).rejects.toThrow(/valid active reservation/)
})
it('collects and resolves incidents without sending or changing jobs and reports stale monitoring', async () => {
 await save(); await raw("update calendar_delivery_jobs set next_attempt_at=now()-interval '11 minutes'")
 await role(actor, 'service_role'); expect((await db.query('select collect_calendar_health(25) as result')).rows[0].result.verified).toBe(true)
 await role(); expect((await health()).monitor.status).toBe('current')
 await raw("update calendar_delivery_jobs set next_attempt_at=now()+interval '1 minute'")
 await role(actor, 'service_role'); await db.query('select collect_calendar_health(25)')
 await raw('select 1'); expect((await db.query('select * from private.calendar_health_incidents where resolved_at is not null')).rows.length).toBeGreaterThan(0)
 await raw("update private.calendar_health_scans set checked_at=now()-interval '11 minutes'"); await role()
 expect((await health()).monitor.status).toBe('stale')
 await expect(db.query('select collect_calendar_health(25)')).rejects.toThrow(/permission denied/)
})
it('caps issue output and never hides truncation', async () => {
 await save(); await raw('delete from calendar_delivery_jobs'); await role()
 expect(await health(org, 1)).toMatchObject({ truncated: true })
 expect((await health(org, 1)).issues).toHaveLength(1)
})
it('monitors reconnect, stale polling, failed and missing copies but respects a deliberate pause', async () => {
 await save(); await role(actor, 'service_role')
 const state = 'a'.repeat(64)
 const c = (await db.query('select begin_calendar_provider_oauth($1,$2,$3,$4,$5,$6) as result', [org, actor, 'google', state, 'v'.repeat(64), 'https://app.example.test/'])).rows[0].result.connectionId
 await db.query('select consume_calendar_provider_oauth($1,$2)', [state, 'google'])
 await db.query('select finish_calendar_provider_oauth($1,$2,$3,$4)', [state, 'account', 'Agent', JSON.stringify({ v: 1, iv: 'cipher-iv', ciphertext: 'encrypted' })])
 await raw("update private.calendar_provider_connections set last_checked_at=now()-interval '21 minutes'; update private.calendar_provider_events set status='failed',attempts=3")
 await role(); expect((await health()).issues.map(i => i.kind)).toEqual(expect.arrayContaining(['provider_poll_stale', 'provider_repeated_failure']))
 await raw('delete from private.calendar_provider_events'); await role()
 expect((await health()).issues.some(i => i.kind === 'missing_provider_copy' && i.inspectAllowed)).toBe(true)
 await raw("update private.calendar_provider_connections set status='needs_reconnect'"); await role()
 expect((await health()).issues.map(i => i.kind)).toContain('provider_disconnected')
 await db.query('select disconnect_calendar_provider($1)', [c])
 expect((await health()).issues.filter(i => i.connection_id)).toEqual([])
})
it('conceals a moved booking title even when its old personal calendar copy needs removal', async () => {
 await save(); await raw(`insert into private.calendar_provider_connections(id,organisation_id,user_id,provider,status,connected_at,last_checked_at)
 values('${id(40)}','${org}','${actor}','google','connected',now(),now());
 insert into private.calendar_provider_events(connection_id,appointment_id,desired_action,status,attempts) values('${id(40)}','${booking}','delete','failed',3)`)
 // Historical privileged move: fixture seeds the old copy without invoking a current save.
 await raw('alter table appointments disable trigger user')
 await raw(`update appointments set organisation_id='${otherOrg}',title='Private destination title'`)
 await raw('alter table appointments enable trigger user'); await role()
 const issue = (await health()).issues.find(i => i.kind === 'provider_repeated_failure')
 expect(issue).toMatchObject({ title: null, inspectAllowed: false })
 expect(JSON.stringify(await health())).not.toContain('Private destination title')
 await expect(support()).rejects.toThrow(/access denied/)
})
it('limits manual retries across commands and keeps acceptance and worker attempt fences intact', async () => {
 await save(); await raw("update calendar_delivery_jobs set status='failed',attempt_count=max_attempts where event_kind='invite'")
 await role(); const job = (await support()).jobs.find(j => j.event_kind === 'invite')
 await action({ name: 'retry', job: job.id }); await role(actor, 'service_role')
 const claimed = (await db.query('select * from claim_calendar_delivery(1)')).rows[0]
 expect(claimed.id).toBe(job.id); expect(claimed.attempt_count).toBe(6)
 expect((await db.query("select complete_calendar_delivery($1,$2,'failed',null) as result", [job.id, 5])).rows[0].result).toBe(false)
 await db.query("select complete_calendar_delivery($1,$2,'failed',null)", [job.id, 6]); await role()
 expect((await support()).jobs.find(j => j.id === job.id).retry_allowed).toBe(false)
 await expect(action({ name: 'retry', job: job.id, command: id(24) })).rejects.toThrow(/cooldown/)
 await raw("update private.calendar_support_commands set created_at=now()-interval '3 minutes'"); await role()
 await action({ name: 'retry', job: job.id, command: id(24) })
 await raw("update calendar_delivery_jobs set status='failed',attempt_count=max_attempts; update private.calendar_support_commands set created_at=now()-interval '3 minutes'"); await role()
 await expect(action({ name: 'retry', job: job.id, command: id(25) })).rejects.toThrow(/limit/)
})
it('retires a manually retried job if a delayed worker passes its provider safety deadline', async () => {
 await save(); await raw("update calendar_delivery_jobs set status='failed',attempt_count=max_attempts where event_kind='invite'")
 await role(); const job = (await support()).jobs.find(j => j.event_kind === 'invite')
 await action({ name: 'retry', job: job.id }); await role(actor, 'service_role')
 const claimed = (await db.query('select * from claim_calendar_delivery(1)')).rows[0]
 expect(claimed.id).toBe(job.id)
 await raw(`update calendar_delivery_jobs set support_retry_until=now()-interval '1 minute' where id='${job.id}'`)
 await role(actor, 'service_role')
 const payload = { to: job.recipient_email, appointmentId: booking, idempotencyKey: `calendar-appointment:${job.id}` }
 expect((await db.query('select prepare_calendar_delivery($1,$2,$3) as result', [job.id, claimed.attempt_count, JSON.stringify(payload)])).rows[0].result).toBeNull()
 await role(); expect((await support()).jobs.find(j => j.id === job.id)).toMatchObject({ status: 'superseded', retry_allowed: false })
})
it('respects opted out recipients, internal-only rules and expired holds during reconciliation', async () => {
 await save({ invitations_enabled: false, reminders_enabled: false }); await raw('delete from calendar_delivery_jobs'); await role()
 expect((await health()).issues).toEqual([]); expect(await action()).toMatchObject({ queued: 0 })
 await raw("update appointments set hold_expires_at=now()-interval '1 minute'"); await role()
 expect((await support()).reconcileAllowed).toBe(false); await expect(action({ command: id(26) })).rejects.toThrow(/active reservation/)
})
it('flags removed internal agents and does not infer a replacement identity', async () => {
 await save({}, people([{ user_id: second, name: 'Co-agent', email: 'other@example.test', participant_role: 'Co-agent' }]))
 await raw(`update organisation_users set status='removed' where user_id='${second}'`); await role()
 expect((await health()).issues.map(i => i.kind)).toContain('link_inconsistent')
 const before = (await support()).participants
 expect((await support()).reconcileAllowed).toBe(false)
 await expect(action()).rejects.toThrow(/links need review/); expect((await support()).participants).toEqual(before)
})
it('shows an owner their inconsistent link without granting a recovery permission', async () => {
 await save(); await raw(`insert into transactions values('${id(51)}','${otherOrg}')`)
 await raw('alter table appointments disable trigger calendar_final_appointment_slot')
 await raw(`update appointments set transaction_id='${id(51)}'`)
 await raw('alter table appointments enable trigger calendar_final_appointment_slot'); await role()
 expect((await health()).issues.find(issue => issue.kind === 'link_inconsistent')).toMatchObject({ appointment_id: booking, inspectAllowed: false })
 await expect(support()).rejects.toThrow(/access denied/)
 await expect(action({ revision: 1 })).rejects.toThrow(/access denied/)
})
it('retains open incidents and returns failure when collection cannot verify a scope', async () => {
 await save(); await raw("update calendar_delivery_jobs set next_attempt_at=now()-interval '11 minutes'")
 await role(actor, 'service_role'); await db.query('select collect_calendar_health(25)')
 // Deliberately fail the findings query in this isolated fixture, then restore it.
 await raw(`alter function private.calendar_health_findings(uuid) rename to calendar_health_fixture_findings;
 create function private.calendar_health_findings(uuid) returns table(issue_key text,appointment_id uuid,connection_id uuid,kind text,severity text,revision integer,evidence jsonb)
 language plpgsql as $$begin raise exception 'Fixture outage';end$$`)
 try {
  await role(actor, 'service_role')
  expect((await db.query('select collect_calendar_health(25) as result')).rows[0].result).toMatchObject({ verified: false, failedScans: 1 })
  await raw('select 1')
  expect((await db.query('select count(*)::int as n from private.calendar_health_incidents where resolved_at is null')).rows[0].n).toBeGreaterThan(0)
  expect((await db.query('select status from private.calendar_health_scans')).rows[0].status).toBe('failed')
 } finally {
  await raw('drop function private.calendar_health_findings(uuid); alter function private.calendar_health_fixture_findings(uuid) rename to calendar_health_findings')
 }
})
it('marks a capped scan partial without resolving an incident outside its verified findings', async () => {
 await save(); await raw("update calendar_delivery_jobs set next_attempt_at=now()-interval '11 minutes'")
 await role(actor, 'service_role'); await db.query('select collect_calendar_health(25)')
 await raw(`alter function private.calendar_health_findings(uuid) rename to calendar_health_fixture_findings;
 create function private.calendar_health_findings(uuid) returns table(issue_key text,appointment_id uuid,connection_id uuid,kind text,severity text,revision integer,evidence jsonb)
 language sql as $$select 'fixture:'||i,null::uuid,null::uuid,'fixture','warning',null::integer,'{}'::jsonb from generate_series(1,1001) i$$`)
 try {
  await role(actor, 'service_role')
  expect((await db.query('select collect_calendar_health(25) as result')).rows[0].result).toMatchObject({ verified: false, partialScans: 1 })
  await raw('select 1')
  expect((await db.query("select count(*)::int as n from private.calendar_health_incidents where issue_key like 'delivery:%' and resolved_at is null")).rows[0].n).toBeGreaterThan(0)
  expect((await db.query('select status from private.calendar_health_scans')).rows[0].status).toBe('partial')
 } finally {
  await raw('drop function private.calendar_health_findings(uuid); alter function private.calendar_health_fixture_findings(uuid) rename to calendar_health_findings')
 }
})
it('installs a five minute database monitor without network delivery', async () => {
 await raw(`create schema cron;create table cron.fixture_jobs(name text,schedule text,command text);
 create function cron.schedule(name text,schedule text,command text) returns bigint language plpgsql as $$begin insert into cron.fixture_jobs values(name,schedule,command);return 1;end$$;`)
 const sql = await readFile(new URL('../../supabase/migrations/20261008221320_calendar_health_monitor_schedule.sql', import.meta.url), 'utf8')
 await db.exec(sql.replace('create extension if not exists pg_cron;', ''))
 expect((await db.query('select * from cron.fixture_jobs')).rows[0]).toMatchObject({ name: 'arch9-calendar-health-5m', schedule: '*/5 * * * *', command: 'select public.collect_calendar_health(25);' })
})
