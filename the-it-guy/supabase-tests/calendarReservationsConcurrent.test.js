import { Client } from 'pg'
import process from 'node:process'
import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest'
import { id, org, actor, booking, input, people, setupCalendarReservationDatabase } from './calendarReservationFixture.js'

// Opt in only with the Unix socket of a fresh, isolated local test cluster.
// No connection URL or production/staging credentials are accepted.
const socket = process.env.CALENDAR_LOCAL_PG_SOCKET
let admin, first, second
const database = `calendar_reservations_${process.pid}_${Date.now()}`
const settings = { host: socket, port: 55439, database: 'postgres', user: 'calendar_test' }
const save = (client, appointment = booking, command = id(20)) => client.query(
  'select save_calendar_appointment($1,$2,$3,$4,null,$5) as receipt',
  [org, appointment, JSON.stringify(input()), JSON.stringify(people([])), command],
)
async function waitForBlockedConnection() {
  for (let n = 0; n < 100; n++) {
    const state = await admin.query("select count(*)::int as blocked from pg_stat_activity where wait_event='advisory'")
    if (state.rows[0].blocked > 0) return
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  throw new Error('The second transaction did not wait for the reservation lock.')
}

describe.skipIf(!socket)('Independent local PostgreSQL reservation transactions', () => {
  beforeAll(async () => {
    if (!socket.startsWith('/') || !socket.includes('/calendar-phase3-')) throw new Error('Use an isolated calendar test socket.')
    const bootstrap = new Client(settings)
    await bootstrap.connect()
    await bootstrap.query(`create database ${database}`)
    await bootstrap.end()
    admin = new Client({ ...settings, database })
    await admin.connect()
    await setupCalendarReservationDatabase({ exec: sql => admin.query(sql), query: (sql, args) => admin.query(sql, args) })
    first = new Client({ ...settings, database })
    second = new Client({ ...settings, database })
    await Promise.all([first.connect(), second.connect()])
    for (const client of [first, second]) {
      await client.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: actor, email: 'agent@example.test' })])
      await client.query('set role authenticated')
    }
  }, 30000)
  beforeEach(async () => {
    await first.query('rollback')
    await second.query('rollback')
    await first.query('reset role;set role authenticated')
    await second.query('reset role;set role authenticated')
    await admin.query('truncate appointments,appointment_participants,appointment_reminders,appointment_reschedule_requests,transaction_checklist_items,private.calendar_mutation_receipts,private.calendar_repair_batches cascade')
  })
  afterAll(async () => {
    await Promise.all([first?.end(), second?.end(), admin?.end()])
    const bootstrap = new Client(settings)
    await bootstrap.connect()
    await bootstrap.query(`drop database if exists ${database}`)
    await bootstrap.end()
  })

  it('gives conflicting simultaneous bookings one winner after the first commit', async () => {
    await first.query('begin')
    await save(first)
    await second.query('begin')
    const competing = save(second, id(30), id(31)).catch(error => error)
    await waitForBlockedConnection()
    await first.query('commit')
    const result = await competing
    expect(result.code).toBe('23P01')
    await second.query('rollback')
    expect((await admin.query('select count(*)::int as total from appointments')).rows[0].total).toBe(1)
  })

  it('lets the waiting booking succeed when the first transaction rolls back', async () => {
    await first.query('begin')
    await save(first)
    await second.query('begin')
    const competing = save(second, id(30), id(31))
    await waitForBlockedConnection()
    await first.query('rollback')
    expect((await competing).rows[0].receipt.verified).toBe(true)
    await second.query('commit')
    expect((await admin.query('select appointment_id from appointments')).rows[0].appointment_id).toBe(id(30))
  })

  it('serializes a token response with an edit and rejects the edit’s stale revision', async () => {
    const initial=(await first.query('select save_calendar_appointment($1,$2,$3,$4,null,$5) as receipt',
      [org,booking,JSON.stringify(input()),JSON.stringify(people([{name:'Buyer',email:'buyer@example.test',participant_role:'Buyer',is_required:true}])),id(20)])).rows[0].receipt
    const buyer=initial.participants.find(p=>p.email==='buyer@example.test')
    await first.query('begin')
    await first.query("select * from submit_appointment_rsvp($1,'Accepted')",[buyer.rsvp_token])
    await second.query('begin')
    const editing=second.query('select save_calendar_appointment($1,$2,$3,null,0,$4)',[org,booking,JSON.stringify({notes:'Competing edit'}),id(21)]).catch(error=>error)
    await waitForBlockedConnection()
    await first.query('commit')
    expect((await editing).code).toBe('40001')
    await second.query('rollback')
    expect((await admin.query('select status from appointments where appointment_id=$1',[booking])).rows[0].status).toBe('confirmed')
  })

  it('also protects a room when the two agents have no shared attendees', async () => {
    const args = (key, agent, command) => [org, key, JSON.stringify(input({ agent_id: agent, resource_id: id(7) })), JSON.stringify([]), command]
    await first.query('begin')
    await first.query('select save_calendar_appointment($1,$2,$3,$4,null,$5)', args(booking, actor, id(20)))
    await second.query('begin')
    const competing = second.query('select save_calendar_appointment($1,$2,$3,$4,null,$5)', args(id(30), id(4), id(31))).catch(error => error)
    await waitForBlockedConnection()
    await first.query('commit')
    expect((await competing).code).toBe('23P01')
    await second.query('rollback')
  })

  it('rejects a concurrent stale edit instead of replacing the winning edit', async () => {
    await save(first)
    await first.query('begin')
    await first.query('select save_calendar_appointment($1,$2,$3,null,0,$4)', [org, booking, JSON.stringify({ notes: 'First edit' }), id(22)])
    await second.query('begin')
    const competing = second.query('select save_calendar_appointment($1,$2,$3,null,0,$4)', [org, booking, JSON.stringify({ notes: 'Stale edit' }), id(23)]).catch(error => error)
    await waitForBlockedConnection()
    await first.query('commit')
    expect((await competing).code).toBe('40001')
    await second.query('rollback')
    expect((await admin.query('select notes from appointments')).rows[0].notes).toBe('First edit')
  })

  it('checks a legacy privileged table write against the newly committed reservation', async () => {
    await first.query('begin')
    await save(first)
    const competing = admin.query(`insert into appointments(appointment_id,organisation_id,agent_id,created_by,status,appointment_date,start_time,end_time,date_time,end_date_time,timezone)
      values($1,$2,$3,$3,'requested','2099-07-20','10:00','11:00','2099-07-20T08:00Z','2099-07-20T09:00Z','Africa/Johannesburg')`, [id(30), org, actor]).catch(error => error)
    // Use a third connection for the lock-state check while admin waits.
    const monitor = new Client({ ...settings, database })
    await monitor.connect()
    const checkingAdmin = admin
    admin = monitor
    try {
      await waitForBlockedConnection()
      await first.query('commit')
      expect((await competing).code).toBe('23P01')
    } finally { admin = checkingAdmin; await monitor.end() }
  })

  it('replays a simultaneous retry of the same command without duplicating the booking', async () => {
    await first.query('begin')
    await save(first)
    await second.query('begin')
    const retry = save(second)
    await waitForBlockedConnection()
    await first.query('commit')
    expect((await retry).rows[0].receipt.replayed).toBe(true)
    await second.query('commit')
    expect((await admin.query('select count(*)::int as total from appointments')).rows[0].total).toBe(1)
  })
  it('lets concurrent workers claim separate jobs without claiming either one twice', async () => {
    await save(first)
    await first.query('reset role;set role service_role;begin')
    const a=(await first.query('select * from claim_calendar_delivery(1)')).rows
    await second.query('reset role;set role service_role;begin')
    const b=(await second.query('select * from claim_calendar_delivery(25)')).rows
    expect(a).toHaveLength(1);expect(b).toHaveLength(1)
    expect(new Set([...a,...b].map(j=>j.id)).size).toBe(2)
    await first.query('commit');await second.query('commit')
    expect((await first.query('select * from claim_calendar_delivery(25)')).rows).toHaveLength(0)
  })

  it('blocks worker preparation behind a cancellation, then refuses the obsolete delivery', async () => {
    await save(first)
    await second.query('reset role;set role service_role')
    const job=(await second.query('select * from claim_calendar_delivery(1)')).rows[0]
    await first.query('begin')
    await first.query("select save_calendar_appointment_with_delivery($1,$2,$3,null,0,$4)",[org,booking,JSON.stringify({status:'cancelled'}),id(21)])
    const prepared=second.query('select prepare_calendar_delivery($1,$2,null) as receipt',[job.id,job.attempt_count])
    await waitForBlockedConnection();await first.query('commit')
    expect((await prepared).rows[0].receipt).toBeNull()
  })

  it('serializes draft archive with an issue command and rejects the waiting issue without a partial save',async()=>{
    await first.query('select save_calendar_appointment_with_delivery($1,$2,$3,$4,null,$5)',[org,booking,JSON.stringify(input({status:'draft'})),JSON.stringify(people([])),id(20)])
    await first.query('begin')
    await first.query('select set_calendar_appointment_archive($1,$2,true,$3,0,null,$4)',[org,booking,'Duplicate',id(21)])
    const issue=second.query('select save_calendar_appointment_with_delivery($1,$2,$3,null,0,$4)',[org,booking,JSON.stringify({status:'requested'}),id(22)]).catch(error=>error)
    await waitForBlockedConnection();await first.query('commit')
    expect((await issue).message).toMatch(/Restore/)
    const row=(await admin.query('select status,calendar_revision,archived_at from appointments')).rows[0]
    expect(row.status).toBe('draft');expect(row.calendar_revision).toBe(0);expect(row.archived_at).toBeTruthy()
  })
  it('blocks worker preparation behind archive and never revives that cancellation job after restore',async()=>{
    await save(first)
    await first.query('select save_calendar_appointment_with_delivery($1,$2,$3,null,0,$4)',[org,booking,JSON.stringify({status:'cancelled'}),id(21)])
    await second.query('reset role;set role service_role')
    const job=(await second.query('select * from claim_calendar_delivery(1)')).rows[0]
    await first.query('begin')
    const hidden=(await first.query('select set_calendar_appointment_archive($1,$2,true,$3,1,null,$4) as receipt',[org,booking,'Keep history',id(22)])).rows[0].receipt
    const prepared=second.query('select prepare_calendar_delivery($1,$2,null) as receipt',[job.id,job.attempt_count])
    await waitForBlockedConnection();await first.query('commit')
    expect((await prepared).rows[0].receipt).toBeNull()
    await first.query('select set_calendar_appointment_archive($1,$2,false,$3,1,$4,$5)',[org,booking,'Show history',hidden.appointment.archived_at,id(23)])
    expect((await second.query('select * from claim_calendar_delivery(25)')).rows).toHaveLength(0)
  })

  async function repairEntry() {
    await first.query('reset role;set role service_role')
    await admin.query("update organisation_users set role='principal' where user_id=$1",[actor])
    const snapshot=(await first.query('select export_calendar_repair_snapshot($1) as snapshot',[org])).rows[0].snapshot
    return {appointmentId:booking,expectedFingerprint:snapshot.records[0].fingerprint,action:'suppress_historical_delivery',reason:'Reviewed old delivery',evidence:'Original request and provider receipts reviewed'}
  }
  const applyRepair=(client,entry,batch=id(70))=>client.query('select repair_calendar_appointments($1,$2,$3,$4,$5,false) as receipt',
    [org,batch,actor,'Historical delivery review',JSON.stringify([entry])])

  it('rejects a repair waiting behind an agent edit using the complete snapshot fence',async()=>{
    await save(first);const entry=await repairEntry()
    await second.query('begin');await second.query('select save_calendar_appointment($1,$2,$3,null,0,$4)',[org,booking,JSON.stringify({notes:'New agent evidence'}),id(21)])
    const repairing=applyRepair(first,entry).catch(error=>error)
    await waitForBlockedConnection();await second.query('commit')
    expect((await repairing).code).toBe('40001')
    expect((await admin.query('select count(*)::int as n from private.calendar_repair_batches')).rows[0].n).toBe(0)
  })
  it('serializes repair against delivery completion without reviving an in-flight job',async()=>{
    await save(first);await second.query('reset role;set role service_role')
    const job=(await second.query('select * from claim_calendar_delivery(1)')).rows[0]
    const entry=await repairEntry();await first.query('begin');await applyRepair(first,entry)
    const completing=second.query("select complete_calendar_delivery($1,$2,'provider_accepted','repair-race-provider') as accepted",[job.id,job.attempt_count])
    await waitForBlockedConnection();await first.query('commit')
    expect((await completing).rows[0].accepted).toBe(false)
    const row=(await admin.query('select status,provider_message_id from calendar_delivery_jobs where id=$1',[job.id])).rows[0]
    expect(row).toEqual({status:'superseded',provider_message_id:'repair-race-provider'})
    await expect(first.query('select rollback_calendar_repair($1,$2,$3,$4,$5,false)',[org,id(70),id(71),actor,'Recover repair'])).rejects.toMatchObject({code:'40001'})
  })
  it('rejects a repair after a competing provider receipt changes its snapshot',async()=>{
    await save(first);await second.query('reset role;set role service_role')
    const job=(await second.query('select * from claim_calendar_delivery(1)')).rows[0];const entry=await repairEntry()
    await second.query('begin');await second.query("select complete_calendar_delivery($1,$2,'provider_accepted','first-provider')",[job.id,job.attempt_count])
    const repairing=applyRepair(first,entry).catch(error=>error)
    await waitForBlockedConnection();await second.query('commit')
    expect((await repairing).code).toBe('40001')
    expect((await admin.query('select calendar_revision from appointments')).rows[0].calendar_revision).toBe(0)
  })
  it('deduplicates a simultaneous retry of the same reviewed repair batch',async()=>{
    await save(first);const entry=await repairEntry();await second.query('reset role;set role service_role')
    await first.query('begin');await applyRepair(first,entry)
    const retry=applyRepair(second,entry)
    await waitForBlockedConnection();await first.query('commit')
    expect((await retry).rows[0].receipt).toMatchObject({replayed:true,current:true})
    expect((await admin.query('select count(*)::int as n from private.calendar_repair_entries')).rows[0].n).toBe(1)
  })

})
