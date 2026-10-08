import { resolveAppointmentSchedule, parseAppointmentInstant } from './appointmentTime.js'
import { canonicalReservationStatus, appointmentReservesTime } from './appointmentReservation.js'

const statuses = new Set(['draft','requested','accepted','confirmed','alternative_requested','alternative_proposed','cancelled','declined','completed','no_show'])
const closed = new Set(['draft','cancelled','declined','completed','no_show'])
const internal = role => ['agent','co-agent'].includes(String(role).toLowerCase())
const outstanding = job => ['queued','processing','failed'].includes(job.status)
// PostgreSQL exports can use a space and a short offset. Never use the host TZ.
export function inventoryInstant(value) {
 if (typeof value !== 'string') return value
 return value.replace(/^(\d{4}-\d{2}-\d{2}) /,'$1T').replace(/([+-]\d{2})$/,'$1:00')
}
function readSchedule(row) {
 const normalised={...row,date_time:inventoryInstant(row.date_time),end_date_time:inventoryInstant(row.end_date_time)}
 const schedule=resolveAppointmentSchedule(normalised,{strict:false})
 try {resolveAppointmentSchedule(normalised)} catch (error) {schedule.schedulingTimeIssue=error.code || schedule.schedulingTimeIssue}
 return schedule
}
function rowFrom(record) { return record.appointment || record }
function peopleFrom(record) { return Array.isArray(record.participants) ? record.participants : [] }
function knownEnd(row) { return Boolean(row.end_date_time || row.end_time || row.all_day) }
function identityKeys(record) {
 const row=rowFrom(record)
 return new Set([row.agent_id,row.scheduling_owner_user_id,...peopleFrom(record).filter(p=>p.is_required && !p.rsvp_revoked_at).flatMap(p=>[p.user_id,p.emailKey && `email:${p.emailKey}`])].filter(Boolean))
}

// Output deliberately contains no raw records, titles, names, addresses or tokens.
export function reconcileAppointmentInventory(input, {asOf}={}) {
 const full=!Array.isArray(input)
 const records=Array.isArray(input) ? input : input?.records
 if (!Array.isArray(records)) throw new Error('Supply an appointment array or a scoped snapshot.')
 const clock=asOf || (full && input.capturedAt)
 let instant
 try { if (typeof clock==='string' && /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(clock)) instant=parseAppointmentInstant(inventoryInstant(clock)) } catch { /* invalid timestamp rejected below */ }
 if (!instant) throw new Error('An explicit inventory timestamp with an offset is required.')
 const now=Date.parse(instant)
 const complete=full && input.version===1 && input.complete===true && input.total===records.length
 const ids=new Set()
 const reportRecords=records.map(record=>{
  const a=rowFrom(record); const id=a.appointment_id
  if (!id || ids.has(id)) throw new Error('Every appointment must have a unique identifier.')
  ids.add(id)
  const findings=[]; const add=(code,severity,message,nextStep,action)=>findings.push({code,severity,message,nextStep,...(action?{suggestedAction:action}:{})})
  const status=canonicalReservationStatus(a.status);const schedule=readSchedule(a)
  const past=Number.isFinite(Date.parse(schedule.dateTime)) && Date.parse(schedule.dateTime)<now
  const specialist=a.attorney_delivery_enabled!=null || a.listing_viewing_round_number!=null || a.specialist===true
  const excluded=a.is_demo_data===true || Boolean(a.archived_at) || specialist
  if (!complete) add('INCOMPLETE_SNAPSHOT','review','This inventory omits authoritative attendance, delivery or recovery evidence.','Export a fresh scoped snapshot before proposing a write.')
  if (!statuses.has(status)) add('UNKNOWN_STATUS','review','The saved status is outside the appointment lifecycle.','An agent must decide the correct outcome.')
  else if (a.status!==status) add('LEGACY_STATUS','repair','The saved status label has a known equivalent.','Review its equivalent without changing the outcome.','normalise_metadata')
  if (schedule.schedulingTimeIssue) add(schedule.schedulingTimeIssue,'review','Saved clock fields and timestamps cannot be reconciled safely.','Verify the original invitation and provide the complete past schedule; use rescheduling for future appointments.',past?'correct_past_schedule':undefined)
  if (!a.end_date_time) add(knownEnd(a)?'MISSING_END_INSTANT':'MISSING_DURATION',knownEnd(a)?'repair':'review',knownEnd(a)?'The explicit end instant is missing.':'No duration evidence is available.','Use the recorded clock end or verified original schedule; never assume 45 minutes.',knownEnd(a)&&!schedule.schedulingTimeIssue?'normalise_metadata':undefined)
  if (past && !closed.has(status)) add('PAST_OUTCOME_UNRESOLVED','review','A past appointment still has an open lifecycle status.','The owning agent must record the actual outcome, cancellation or follow-up through the existing appointment actions.')
  if (complete && !a.reservation_managed && !closed.has(status)) add('LEGACY_RESERVATION','repair','The booking predates managed reservation metadata.','Preserve the original request date and cap its hold at 24 hours or the start.','normalise_metadata')
  if (complete && ['requested','accepted','alternative_requested','alternative_proposed'].includes(status) && !a.has_confirmed_reservation) {
   const issued=Date.parse(a.request_issued_at || a.created_at);const expiry=Date.parse(a.hold_expires_at);const start=Date.parse(schedule.dateTime)
   if (!Number.isFinite(issued)) add('MISSING_REQUEST_EVIDENCE','review','The original hold start is unknown.','Verify the original request before repairing reservations.')
   else if (!Number.isFinite(expiry) || expiry>Math.min(issued+86400000,start)) add('HOLD_DEADLINE','repair','The hold is missing or exceeds the agreed limit.','Cap it using the original request; do not grant a new hold.','normalise_metadata')
  }
  if (a.external_calendar_status && a.external_calendar_status!=='synced') add('EXTERNAL_SYNC_UNVERIFIED','review','The record has no verified external calendar sync.','Review the connection and provider reconciliation in Phase 8; do not mark it synced during historical repair.')
  const participants=peopleFrom(record);const count=Array.isArray(record.participants)?participants.length:Number(record.participants)
  if (count===0) add('NO_ATTENDEES','review','No attendance records are saved.','The owner must select and invite the intended attendees.')
  const external=participants.some(p=>!['agent','co-agent','attorney','bond originator','developer representative'].includes(String(p.participant_role).toLowerCase()) && !p.rsvp_revoked_at)
  if (complete && !past && !closed.has(status) && !external) add('NO_EXTERNAL_ATTENDEE','review','The upcoming appointment has only internal attendees.','Confirm whether this is intentional before adding a client.')
  const attendanceKeys=new Set()
  for (const p of participants) {
   const keys=[p.user_id,p.emailKey].filter(Boolean)
   if (!p.rsvp_revoked_at && keys.some(k=>attendanceKeys.has(k))) add('DUPLICATE_ATTENDEE','review','Multiple active attendance records share an identity.','Review roles and responses through the attendee editor; do not delete RSVP history.')
   if (!p.rsvp_revoked_at) for(const key of keys) attendanceKeys.add(key)
   if (p.is_required && !p.rsvp_revoked_at && !p.user_id && p.hasEmail===false) add('UNREACHABLE_REQUIRED_ATTENDEE','review','A required attendee has neither a profile nor a delivery address.','The owner must verify the attendee and update their contact details.')
   if (!p.user_id && internal(p.participant_role) && !p.rsvp_revoked_at) add('UNLINKED_INTERNAL_ATTENDEE',p.matchingProfileIds?.length===1?'repair':'review','An internal attendee lacks a profile identity.',p.matchingProfileIds?.length===1?'Review the exact unique active profile match.':'Resolve the identity with the owner; do not guess.',p.matchingProfileIds?.length===1?'link_internal_participant':undefined)
   if (p.organisation_id!==undefined && p.organisation_id!==a.organisation_id) add('ATTENDEE_ORGANISATION','review','An attendee belongs to a different organisation.','Verify access through the dedicated attendee workflow.')
  }
  for (const [link,valid] of Object.entries(record.linkIntegrity || {})) if (valid===false) add('BROKEN_'+link.toUpperCase()+'_LINK','review',`The ${link} link is invalid for this organisation.`,'The owner must choose the correct link through the appointment editor.')
  if (Array.isArray(record.proposals) && record.proposals.some(p=>['pending','proposed'].includes(p.status) && (past || Date.parse(p.hold_expires_at)<=now))) add('UNRESOLVED_RESCHEDULE','review','A past appointment or expired replacement still has an open reschedule request.','Review the request through the existing replacement and hold-expiry workflows; do not infer acceptance.')
  const jobs=Array.isArray(record.jobs)?record.jobs:[]
  if (jobs.some(j=>outstanding(j) && j.valid===false)) add('OBSOLETE_DELIVERY','repair','Outstanding jobs no longer match the appointment revision or lifecycle.','Retire historical work without sending new messages.','suppress_historical_delivery')
  if (jobs.some(j=>j.status==='failed' && j.valid!==false)) add('FAILED_DELIVERY','review','Current delivery records contain failures.','Review provider receipts and the existing delivery retry controls.')
  if (Array.isArray(record.reminders) && record.reminders.some(r=>r.status==='pending') && (past || closed.has(status) || a.calendar_delivery_managed)) add('LEGACY_REMINDERS','repair','Legacy pending reminder work can duplicate or outlive the booking.','Retire old reminders without recreating them.','suppress_historical_delivery')
  if (!Array.isArray(record.jobs)) add('DELIVERY_EVIDENCE_UNAVAILABLE','review','This inventory cannot establish queued, accepted or delivered messages.','Export delivery receipts; an invitation timestamp alone is not proof of delivery.')
  if (a.is_demo_data) add('DEMO_DATA','separate','This record is explicitly marked as demonstration data.','Keep it outside operational repairs.')
  if (specialist) add('SPECIALIST_WORKFLOW','separate','This appointment uses a dedicated attorney or viewing workflow.','Review it through that workflow.')
  if (a.archived_at) add('ARCHIVED_HISTORY','separate','This appointment is archived history.','Restore explicitly before any ordinary change.')
  return {appointmentId:id,isDemo:a.is_demo_data===true,excluded,status,schedule:{dateTime:schedule.dateTime,endDateTime:knownEnd(a)?schedule.endDateTime:null,timezone:schedule.timezone},findings}
 })
 const pairs=new Map();const addPair=(left,right,source,current=false)=>{
  if (left===right || !ids.has(right)) return
  const key=[left,right].sort().join('|');const existing=pairs.get(key)
  pairs.set(key,{appointmentIds:key.split('|'),source,current:current || existing?.current || false})
 }
 for(let i=0;i<records.length;i++) {
  const r=records[i];const a=rowFrom(r);const s=readSchedule(a)
  if (r.reservationConflict===true) reportRecords[i].findings.push({code:'CURRENT_RESERVATION_CONFLICT',severity:'review',message:'This reservation conflicts with another person or room booking.',nextStep:'An agent must decide which booking to reschedule or cancel; no winner is inferred.'})
  for(const other of r.overlapsWith || []) addPair(a.appointment_id,typeof other==='string'?other:other.appointment_id,'historical_inventory')
  if (!complete || s.schedulingTimeIssue || !knownEnd(a)) continue
  const keys=identityKeys(r)
  for(let j=i+1;j<records.length;j++) {
   const b=rowFrom(records[j]);const t=readSchedule(b)
   if (a.organisation_id!==b.organisation_id || t.schedulingTimeIssue || !knownEnd(b)) continue
   const shared=(a.resource_id && a.resource_id===b.resource_id) || [...identityKeys(records[j])].some(k=>keys.has(k))
   if (shared && Date.parse(s.dateTime)<Date.parse(t.endDateTime) && Date.parse(t.dateTime)<Date.parse(s.endDateTime)) addPair(a.appointment_id,b.appointment_id,'snapshot',appointmentReservesTime(a,now) && appointmentReservesTime(b,now))
  }
 }
 const counts={}
 for (const r of reportRecords) for(const f of r.findings) counts[f.code]=(counts[f.code] || 0)+1
 const operational=reportRecords.filter(r=>!r.isDemo)
 return {version:1,asOf:instant,completeSnapshot:complete,writePlanAvailable:complete && Boolean(input.organisationId),organisationId:input.organisationId || null,
  summary:{total:records.length,operational:operational.length,demo:records.length-operational.length,appointmentsWithFindings:reportRecords.filter(r=>r.findings.length).length,findings:counts,
   operationalFindings:operational.reduce((counts,r)=>{for(const f of r.findings) counts[f.code]=(counts[f.code]||0)+1;return counts},{}),overlapPairs:pairs.size},
  records:reportRecords,overlapPairs:[...pairs.values()]}
}

export function draftCalendarRepairPlan(snapshot,report,{environment,projectRef,batchId}={}) {
 if (!report.writePlanAvailable || snapshot.organisationId!==report.organisationId) throw new Error('A complete scoped snapshot is required for a repair plan.')
 const entries=[]
 for (const record of snapshot.records) {
  const a=rowFrom(record);const result=report.records.find(r=>r.appointmentId===a.appointment_id)
  if (result.excluded || record.reservationConflict===true || !/^[a-f0-9]{32}$/.test(record.fingerprint || '')) continue
  const findings=result.findings
  const candidates=peopleFrom(record).filter(p=>!p.user_id && internal(p.participant_role) && !p.rsvp_revoked_at && p.matchingProfileIds?.length===1)
  let suggestion
  if (findings.some(f=>f.suggestedAction==='normalise_metadata') && !readSchedule(a).schedulingTimeIssue && knownEnd(a) && statuses.has(result.status)) suggestion={action:'normalise_metadata'}
  else if (findings.some(f=>f.suggestedAction==='suppress_historical_delivery')) suggestion={action:'suppress_historical_delivery'}
  else if (candidates.length===1) suggestion={action:'link_internal_participant',participantId:candidates[0].participant_id,userId:candidates[0].matchingProfileIds[0]}
  if (suggestion) entries.push({selected:false,appointmentId:a.appointment_id,expectedFingerprint:record.fingerprint,...suggestion,reason:'',evidence:''})
 }
 return {version:1,environment,projectRef,organisationId:snapshot.organisationId,capturedAt:snapshot.capturedAt,batchId,reviewedBy:'',reason:'',entries}
}

export function formatCalendarRepairReport(report) {
 const s=report.summary
 const lines=['# Appointment reconciliation inventory','',`Snapshot: ${report.asOf}`,`Appointments: ${s.total}; operational: ${s.operational}; demo: ${s.demo}; overlap pairs: ${s.overlapPairs}.`,
  '',report.completeSnapshot?'This scoped snapshot supports a reviewed repair plan.':'This redacted inventory supports reporting only. Obtain a fresh scoped snapshot before repairs.',
  '',...Object.entries(s.findings).map(([code,count])=>`- ${code}: ${count} (${s.operationalFindings[code] || 0} operational)`),'',
  '## Appointment review','',...report.records.flatMap(r=>[`### ${r.appointmentId}${r.isDemo?' (demo)':''}`,'',`Status: ${r.status}.`,...r.findings.map(f=>`- **${f.code}**: ${f.message} ${f.nextStep}`),'']),
  '## Overlap review','',...report.overlapPairs.map(p=>`- ${p.appointmentIds.join(' / ')}${p.current?' — current reservation conflict':' — historical time overlap; does not establish a current reservation'}`),'']
 return lines.join('\n')
}
