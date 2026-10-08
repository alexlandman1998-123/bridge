import { describe,it,expect } from 'vitest'
import { reconcileAppointmentInventory, draftCalendarRepairPlan,formatCalendarRepairReport,inventoryInstant } from '../appointmentReconciliation.js'
const now='2026-10-08T15:00:00Z', org='10000000-0000-4000-8000-000000000001'
const a={appointment_id:'one',organisation_id:org,status:'requested',agent_id:'agent',appointment_date:'2026-10-09',start_time:'10:00',end_time:'11:00',date_time:'2026-10-09 08:00:00+00',timezone:'Africa/Johannesburg',all_day:false,created_at:'2026-10-01T10:00:00Z'}
const record=changes=>({appointment:{...a,...changes},fingerprint:'a'.repeat(32),participants:[],jobs:[],reminders:[],linkIntegrity:{agent:true}})
const snapshot=records=>({version:1,organisationId:org,capturedAt:now,complete:true,total:records.length,records})
describe('Historical inventory decisions',()=>{
 it('reads PostgreSQL offsets independent of host timezone without assuming a duration',()=>{
  const report=reconcileAppointmentInventory([a],{asOf:now});expect(report.records[0].schedule.dateTime).toBe('2026-10-09T08:00:00.000Z')
  expect(inventoryInstant('2026-06-12 10:44:21.178294+00')).toBe('2026-06-12T10:44:21.178294+00:00')
  const unknown=reconcileAppointmentInventory([{...a,end_time:null}],{asOf:now})
  expect(unknown.records[0].schedule.endDateTime).toBeNull();expect(unknown.summary.findings.MISSING_DURATION).toBe(1)
 })
 it('separates demo records and past outcomes without inferring completed attendance',()=>{
  const report=reconcileAppointmentInventory([{...a,appointment_id:'old',appointment_date:'2020-01-01',date_time:'2020-01-01T08:00:00Z'}, {...a,appointment_id:'demo',is_demo_data:true}],{asOf:now})
  expect(report.summary).toMatchObject({total:2,operational:1,demo:1});expect(report.records[0].findings.find(f=>f.code==='PAST_OUTCOME_UNRESOLVED').suggestedAction).toBeUndefined()
  expect(()=>draftCalendarRepairPlan([],report)).toThrow(/complete scoped/)
 })
 it('keeps conflicting timestamps explicit and creates no speculative time patch',()=>{
  const r=record({appointment_date:'2020-01-01',date_time:'2020-01-01T10:00:00Z'})
  const s=snapshot([r]);const report=reconcileAppointmentInventory(s)
  expect(report.summary.findings.APPOINTMENT_TIME_MISMATCH).toBe(1)
  expect(draftCalendarRepairPlan(s,report).entries).toEqual([])
 })
 it('requires an explicit timestamp and unique identifiers',()=>{
  expect(()=>reconcileAppointmentInventory([a])).toThrow(/timestamp/)
  expect(()=>reconcileAppointmentInventory([a],{asOf:'2026-10-08T15:00:00'})).toThrow(/timestamp/)
  expect(()=>reconcileAppointmentInventory([a,a],{asOf:now})).toThrow(/unique/)
 })
 it('drafts only opt-in repairs with blank reason and evidence',()=>{
  const s=snapshot([record({status:'Pending Confirmation'})]);const report=reconcileAppointmentInventory(s)
  const plan=draftCalendarRepairPlan(s,report,{environment:'staging',projectRef:'project',batchId:'batch'})
  expect(plan.entries).toEqual([{selected:false,appointmentId:'one',expectedFingerprint:'a'.repeat(32),action:'normalise_metadata',reason:'',evidence:''}])
 })
 it('excludes archived, demo, specialist and current conflicts from a draft',()=>{
  const records=[record({archived_at:now}),record({appointment_id:'two',is_demo_data:true}),record({appointment_id:'three',attorney_delivery_enabled:false}),{...record({appointment_id:'four'}),reservationConflict:true}]
  const s=snapshot(records);expect(draftCalendarRepairPlan(s,reconcileAppointmentInventory(s)).entries).toEqual([])
 })
 it('separates historical overlap from live reservation collisions and deduplicates pairs',()=>{
  const legacy=[{...a,overlapsWith:['two']},{...a,appointment_id:'two',overlapsWith:['one']}]
  expect(reconcileAppointmentInventory(legacy,{asOf:now}).overlapPairs).toEqual([{appointmentIds:['one','two'],source:'historical_inventory',current:false}])
  const s=snapshot([record({status:'confirmed',end_date_time:'2026-10-09T09:00:00Z'}),record({appointment_id:'two',status:'confirmed',end_date_time:'2026-10-09T09:00:00Z'})])
  expect(reconcileAppointmentInventory(s).overlapPairs[0].current).toBe(true)
 })
 it('does not count released or past overlaps as live conflicts',()=>{
  const s=snapshot([record({status:'confirmed',end_date_time:'2026-10-09T09:00:00Z'}),record({appointment_id:'two',status:'cancelled',end_date_time:'2026-10-09T09:00:00Z'})])
  expect(reconcileAppointmentInventory(s).overlapPairs[0].current).toBe(false)
 })
 it('reports attendance, organisation links and obsolete work without printing personal data',()=>{
  const r={...record(),participants:[{participant_id:'p',name:'Private Person',email:'secret@example.test',rsvp_token:'sensitive-token',participant_role:'Co-agent',matchingProfileIds:['profile'],organisation_id:org}],jobs:[{status:'queued',valid:false}],linkIntegrity:{agent:false}}
  const report=reconcileAppointmentInventory(snapshot([r]));expect(report.summary.findings).toMatchObject({UNLINKED_INTERNAL_ATTENDEE:1,BROKEN_AGENT_LINK:1,OBSOLETE_DELIVERY:1})
  const text=JSON.stringify(report)+formatCalendarRepairReport(report);for(const secret of ['Private Person','secret@example.test','sensitive-token']) expect(text).not.toContain(secret)
 })
 it('does not interpret missing delivery evidence as a failed or unsent invitation',()=>{
  const report=reconcileAppointmentInventory([{...a,notification_events:0,participants:2}],{asOf:now})
  expect(report.summary.findings.DELIVERY_EVIDENCE_UNAVAILABLE).toBe(1);expect(report.summary.findings.FAILED_DELIVERY).toBeUndefined();expect(report.summary.findings.NO_ATTENDEES).toBeUndefined()
 })
})
