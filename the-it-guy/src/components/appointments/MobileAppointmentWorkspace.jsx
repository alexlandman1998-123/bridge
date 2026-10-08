import ConnectedCalendarPanel from './ConnectedCalendarPanel'
import { useEffect, useRef, useState } from 'react'
import Modal from '../ui/Modal'
import AppointmentWorkActions from './AppointmentWorkActions'
import AppointmentDeliveryStatus from './AppointmentDeliveryStatus'
import AppointmentCalendarActions from './AppointmentCalendarActions'
import { createAppointmentAsync, updateAppointmentAsync, updateAppointmentParticipantRsvpAsync } from '../../lib/agencyPipelineService'
import { listOrganisationUsersForWorkspace } from '../../lib/settingsApi'
import { listAgencyCrmLeadContacts } from '../../lib/agencyCrmRepository'
import { appointmentWorkflowActions } from '../../core/appointments/appointmentWorkflow'
import { appointmentLocalParts, resolveAppointmentSchedule, mergeAppointmentSchedule } from '../../core/appointments/appointmentTime'
import { applyAppointmentTemplate, getAppointmentTypeTemplate } from '../../services/appointmentTemplateService'
import { getAppointmentTypeOptions } from '../../lib/appointmentTypeDefinitions'
import { proposeCalendarAppointmentReplacement } from '../../services/appointmentRescheduleService'
import { buildAppointmentSaveFeedback } from '../../services/appointmentSaveFeedbackService'

const typeOptions = getAppointmentTypeOptions()
function initialDraft(appointment, actor, selectedDate) {
  if (appointment) return { ...appointment, durationMinutes: (Date.parse(appointment.endDateTime)-Date.parse(appointment.dateTime))/60000 || 45, participants: [...(appointment.participants || [])], expectedRevision: appointment.calendarRevision }
  const next = appointmentLocalParts(new Date(Date.now() + 30 * 60000))
  return { appointmentType:'', title:'', date:selectedDate || next.date, startTime:next.time.slice(0,5), endTime:'', durationMinutes:45,
    timezone:'Africa/Johannesburg', allDay:false, assignedAgentId:actor.id, status:'requested', participants:[], notes:'', location:'',
    relatedEntityType:'none', relatedEntityId:'', sendInviteEmails:true, remindersEnabled:true, attachCalendarInvite:true }
}
export default function MobileAppointmentWorkspace({ appointment = null, organisationId, actor, selectedDate, onClose, onSaved }) {
  const [editing, setEditing] = useState(!appointment)
  const [draft, setDraft] = useState(() => initialDraft(appointment, actor, selectedDate))
  const [options, setOptions] = useState({ agents:[], leads:[], contacts:[] })
  const [lookupError, setLookupError] = useState('')
  const [lookupRetry, setLookupRetry] = useState(0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [teamId, setTeamId] = useState('')
  const pending = useRef(false)
  const command = useRef(null)
  const active = useRef(true)
  const actions = appointmentWorkflowActions(appointment || {}, actor)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  useEffect(() => {
    if (!editing) return
    let current = true, timeout
    setLookupError('')
    Promise.race([
      Promise.allSettled([listOrganisationUsersForWorkspace({ organisationId }), listAgencyCrmLeadContacts(organisationId, { includeRelatedRecords:false, includeLocalFallback:false })]),
      new Promise((_,reject) => { timeout = setTimeout(() => reject(new Error('Scheduling options are taking too long to load.')),15000) }),
    ]).then(([agents, crm]) => {
      if (!current) return
      setOptions({ agents:agents.status === 'fulfilled' ? agents.value.filter(person => (person.membershipStatus || person.status) === 'active') : [],
        leads:crm.status === 'fulfilled' ? crm.value.leads || [] : [], contacts:crm.status === 'fulfilled' ? crm.value.contacts || [] : [] })
      if (agents.status !== 'fulfilled' || crm.status !== 'fulfilled') setLookupError('Some scheduling options could not be loaded. Standalone scheduling is still available.')
    }).catch(failure => { if (current) setLookupError(failure.message) }).finally(() => clearTimeout(timeout))
    return () => { current = false; clearTimeout(timeout) }
  }, [editing, organisationId, lookupRetry])
  const field = (key,value) => setDraft(previous => ({ ...previous, [key]:value }))
  const stale = appointment && (draft.expectedRevision !== appointment.calendarRevision || Boolean(appointment.archivedAt))
  function addAttendee() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError('Enter a valid attendee email.'); return }
    if (draft.participants.some(person => person.email?.toLowerCase() === email.trim().toLowerCase())) { setError('This attendee is already included.'); return }
    setDraft(previous => ({ ...previous, participants:[...previous.participants,{ participantId:crypto.randomUUID(),name:name.trim() || email.trim(),email:email.trim().toLowerCase(),participantRole:'Client',isRequired:true }] }))
    setEmail('');setName('');setError('')
  }
  function addCoAgent() {
    const person = options.agents.find(row => (row.userId || row.id) === teamId)
    if (!person || teamId === draft.assignedAgentId) return
    if (draft.participants.some(row => row.userId === teamId || (row.email && row.email.toLowerCase() === person.email?.toLowerCase()))) { setError('This attendee is already included.'); return }
    field('participants',[...draft.participants,{participantId:crypto.randomUUID(),userId:teamId,name:person.fullName || person.email,email:person.email,participantRole:'Co-agent',isRequired:true}])
    setTeamId('');setError('')
  }
  async function save(status = draft.status) {
    if (pending.current) return
    if (stale) { setError('This appointment changed. Close and reopen it before saving.');return }
    if (!draft.appointmentType) { setError('Choose an appointment type.');return }
    const agent = options.agents.find(person => (person.userId || person.id) === draft.assignedAgentId)
    const assignedAgent = { id:draft.assignedAgentId, name:agent?.fullName || actor.name || actor.fullName, email:agent?.email || (draft.assignedAgentId === actor.id ? actor.email : '') }
    let payload
    try {
      const edits = {...draft}
      delete edits.dateTime; delete edits.endDateTime
      payload = applyAppointmentTemplate(draft.appointmentType,{ ...(appointment ? mergeAppointmentSchedule(appointment,edits) : draft),status,assignedAgent,
        title:draft.title || getAppointmentTypeTemplate(draft.appointmentType).label })
      const schedule = resolveAppointmentSchedule(payload)
      if (status !== 'draft' && (!appointment || ['date','startTime','endTime','timezone','allDay'].some(key => draft[key] !== appointment[key])) && Date.parse(schedule.dateTime) <= Date.now()) throw new Error('Choose a future time for this appointment request.')
    } catch (failure) { setError(failure.message); return }
    const fingerprint = JSON.stringify(payload)
    if (command.current?.fingerprint !== fingerprint) command.current = { fingerprint,id:crypto.randomUUID() }
    payload.commandId = command.current.id
    pending.current = true;setBusy(true);setError('')
    try {
      let saved, message
      const changedTime = appointment && ['date','startTime','endTime','timezone','allDay'].some(key => draft[key] !== appointment[key])
      if (changedTime && (appointment.status === 'confirmed' || appointment.hasConfirmedReservation || appointment.listingViewingRoundNumber != null)) {
        const schedule = resolveAppointmentSchedule(payload)
        if (appointment.listingViewingRoundNumber != null && actions.selfParticipant) {
          saved = await updateAppointmentParticipantRsvpAsync(organisationId,appointment.appointmentId,actions.selfParticipant.participantId,{commandId:payload.commandId,expectedRevision:draft.expectedRevision,rsvpStatus:'Proposed New Time',proposedNewTime:schedule.dateTime,preferredEnd:schedule.endDateTime,rsvpComment:draft.notes},{actor})
        } else {
          const receipt = await proposeCalendarAppointmentReplacement(appointment.appointmentId,{expectedRevision:draft.expectedRevision,commandId:payload.commandId,
            preferredStart:schedule.dateTime,preferredEnd:schedule.endDateTime,timezone:schedule.timezone,allDay:schedule.allDay,reason:draft.notes})
          if (receipt.verified !== true) throw new Error('The replacement proposal could not be verified.')
        }
        message = 'Replacement time submitted for approval. The original booking is preserved; other form edits have not been saved.'
      } else {
        if (appointment) {
          // Dedicated viewings keep their attendee and owner commands.
          const { participants, ...changes } = payload
          saved = await updateAppointmentAsync(organisationId,appointment.appointmentId,{...changes,expectedRevision:draft.expectedRevision,
            ...(appointment.listingViewingRoundNumber != null ? {} : {participants})},{actor})
        } else saved = await createAppointmentAsync(organisationId,payload,{actor})
        if (!saved?.appointmentId) throw new Error('The saved appointment could not be verified.')
        message = saved.status === 'draft' ? 'Draft saved. Find it under History and drafts. It does not reserve time or send invitations.' : buildAppointmentSaveFeedback(saved,{requestedInvite:draft.sendInviteEmails !== false,attachCalendarInvite:draft.attachCalendarInvite !== false})
        const warnings = saved.schedulingIntegrity?.softConflicts || []
        if (warnings.length) message += ` Please review: ${[...new Set(warnings.map(item => item.message))].join(' ')}`
      }
      if (active.current) { command.current = null; onSaved?.(saved,message) }
    } catch (failure) { if (active.current) setError(failure.message || 'Unable to save. Refresh and retry.') }
    finally { pending.current = false; if (active.current) setBusy(false) }
  }
  const reminderChoice = draft.reminderRules?.length === 1 && draft.reminderRules[0].offsetMinutes === 30 ? '30m' : JSON.stringify(draft.reminderRules) === JSON.stringify(getAppointmentTypeTemplate(draft.appointmentType).reminderRules) || !draft.reminderRules ? 'defaults' : 'saved'
  const special = appointment?.listingViewingRoundNumber != null || appointment?.attorneyDeliveryEnabled != null
  return <Modal open title={appointment ? 'Appointment details' : 'Create appointment'} onClose={busy ? undefined : onClose} className="mobile-appointment-workspace !max-w-[760px]">
    {error ? <p role="alert">{error}</p> : null}
    {!editing && appointment ? <div className="grid gap-4">
      <h4>{appointment.title || appointment.appointmentTypeLabel}</h4>
      <p>{appointment.date} · {appointment.allDay ? 'All day' : `${appointment.startTime}–${appointment.endTime}`} · {appointment.timezone}</p>
      <p>Status: {appointment.status.replaceAll('_',' ')}{appointment.archivedAt ? ' · Archived' : ''}</p>
      <p>{appointment.location || appointment.meetingUrl || 'Location to be confirmed'}</p>
      <p>{appointment.notes}</p>
      <ul aria-label="Appointment attendees">{(appointment.participants || []).map(person => <li key={person.participantId}>{person.name || person.email} · {person.participantRole} · {person.rsvpStatus}</li>)}</ul>
      {actions.canEdit ? <button type="button" onClick={() => { setDraft(initialDraft(appointment,actor,selectedDate));setEditing(true) }}>Edit appointment</button> : null}
      <AppointmentWorkActions key={`${organisationId}:${actor.id}:${appointment.appointmentId}`} appointment={appointment} organisationId={organisationId} actor={actor} onSaved={saved => onSaved?.(saved,'Appointment action saved.')} />
      <ConnectedCalendarPanel organisationId={organisationId} viewerKey={actor.id} appointmentId={appointment.appointmentId} />
      <AppointmentDeliveryStatus appointment={appointment} viewerKey={`${organisationId}:${actor.id}`} />
      <AppointmentCalendarActions appointment={appointment} preferServerGeneration compact onError={failure => setError(failure.message)} />
    </div> : <form className="grid gap-3" onSubmit={event => {event.preventDefault();void save()}}>
      {stale ? <p role="alert">This appointment changed while you were editing. Close and reopen it before saving.</p> : null}
      {lookupError ? <p role="alert">{lookupError} <button type="button" onClick={() => setLookupRetry(value => value+1)}>Retry scheduling options</button></p> : null}
      <fieldset disabled={busy || Boolean(stale)} className="grid gap-3">
        <label>Appointment type<select value={draft.appointmentType} disabled={special} onChange={event => setDraft(previous => ({...applyAppointmentTemplate(event.target.value,{...previous,appointmentType:event.target.value,reminderRules:undefined,linkedWorkflow:undefined,linkedWorkflowStage:undefined,completionBehavior:undefined,instructions:undefined,internalInstructions:undefined,workflowCompletionEffect:undefined,requiredDocuments:undefined}),appointmentType:event.target.value,title:getAppointmentTypeTemplate(event.target.value).label}))}>
          <option value="">Choose type</option>{typeOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select></label>
        <label>Title<input value={draft.title || ''} onChange={event => field('title',event.target.value)} /></label>
        <label>Responsible agent<select value={draft.assignedAgentId} disabled={!actor.canManageCalendar || special} onChange={event => {
          const selected = options.agents.find(person => (person.userId || person.id) === event.target.value)
          setDraft(previous => ({...previous,assignedAgentId:event.target.value,participants:[...previous.participants.filter(person => !(person.participantRole === 'Agent' && (person.userId === previous.assignedAgentId || person.email === appointment?.assignedAgentEmail))),{userId:event.target.value,name:selected?.fullName || selected?.email,email:selected?.email,participantRole:'Agent',isRequired:true}]}))
        }}><option value={actor.id}>{actor.name || actor.fullName || actor.email}</option>{options.agents.filter(person => (person.userId || person.id) !== actor.id).map(person => <option key={person.userId || person.id} value={person.userId || person.id}>{person.fullName || person.email}</option>)}
          {appointment && appointment.assignedAgentId !== actor.id && !options.agents.some(person => (person.userId || person.id) === appointment.assignedAgentId) ? <option value={appointment.assignedAgentId}>{appointment.assignedAgentName || 'Responsible agent'}</option> : null}
        </select></label>
        {!appointment ? <label>Related lead (optional)<select value={draft.relatedEntityId || ''} onChange={event => {
          const lead = options.leads.find(row => row.leadId === event.target.value)
          setDraft(previous => ({...previous,relatedEntityType:lead ? 'lead' : 'none',relatedEntityId:lead?.leadId || '',leadId:lead?.leadId || null,contactId:lead?.contactId || null,listingId:lead?.listingId || null}))
        }}><option value="">Standalone appointment</option>{options.leads.map(lead => <option key={lead.leadId} value={lead.leadId}>{lead.name || lead.title || lead.email || 'Lead'}</option>)}</select></label> : null}
        <label>Date<input type="date" required value={draft.date} onChange={event => field('date',event.target.value)} /></label>
        <label><input type="checkbox" checked={draft.allDay === true} onChange={event => field('allDay',event.target.checked)} /> All-day appointment</label>
        {!draft.allDay ? <div className="grid grid-cols-2 gap-2"><label>Start time<input type="time" required value={draft.startTime} onChange={event => setDraft(previous => ({...previous,startTime:event.target.value,endTime:''}))} /></label><label>End time<input type="time" value={draft.endTime || ''} onChange={event => field('endTime',event.target.value)} /></label></div> : null}
        <label>Timezone<input required value={draft.timezone} onChange={event => field('timezone',event.target.value)} /></label>
        <label>Location<input value={draft.location || ''} onChange={event => field('location',event.target.value)} /></label>
        <label>Meeting URL<input type="url" value={draft.meetingUrl || ''} onChange={event => field('meetingUrl',event.target.value)} /></label>
        <label>Notes<textarea value={draft.notes || ''} onChange={event => field('notes',event.target.value)} /></label>
        {!special ? <section className="grid gap-2" aria-label="Edit attendees">
          <ul>{draft.participants.map((person,index) => <li key={person.participantId || `${person.email}:${index}`}>{person.name || person.email} · {person.participantRole} {person.participantRole !== 'Agent' ? <button type="button" onClick={() => field('participants',draft.participants.filter((_,i) => i !== index))}>Remove {person.name || person.email}</button> : null}</li>)}</ul>
          <label>Team attendee<select value={teamId} onChange={event => setTeamId(event.target.value)}><option value="">Choose co-agent</option>{options.agents.filter(person => (person.userId || person.id) !== draft.assignedAgentId).map(person => <option key={person.userId || person.id} value={person.userId || person.id}>{person.fullName || person.email}</option>)}</select></label><button type="button" disabled={!teamId} onClick={addCoAgent}>Add co-agent</button>
          <label>Attendee name<input value={name} onChange={event => setName(event.target.value)} /></label><label>Attendee email<input type="email" value={email} onChange={event => setEmail(event.target.value)} /></label><button type="button" onClick={addAttendee}>Add attendee</button>
        </section> : <p>Viewing attendees remain managed by the shared viewing workflow. A changed time requests their approval.</p>}
        <label><input type="checkbox" checked={draft.sendInviteEmails !== false} onChange={event => field('sendInviteEmails',event.target.checked)} /> Send invitations and updates</label>
        <label><input type="checkbox" checked={draft.remindersEnabled !== false} onChange={event => field('remindersEnabled',event.target.checked)} /> Send reminders</label>
        <label>Reminder schedule<select disabled={draft.remindersEnabled === false} value={reminderChoice} onChange={event => field('reminderRules',event.target.value === '30m' ? [{reminderType:'custom_30m',offsetMinutes:30}] : getAppointmentTypeTemplate(draft.appointmentType).reminderRules)}><option value="defaults">Type defaults</option>{reminderChoice === 'saved' ? <option value="saved">Saved custom schedule</option> : null}<option value="30m">30 minutes before only</option></select></label>
        <label><input type="checkbox" checked={draft.attachCalendarInvite !== false} onChange={event => field('attachCalendarInvite',event.target.checked)} /> Attach calendar invitation</label>
        <div className="flex flex-wrap gap-2"><button type="submit">{busy ? 'Saving…' : appointment ? 'Save appointment' : 'Request appointment'}</button>{appointment?.status === 'draft' ? <button type="button" onClick={() => save('requested')}>Issue appointment request</button> : null}{!appointment || draft.status === 'draft' ? <button type="button" onClick={() => save('draft')}>Save draft</button> : null}</div>
      </fieldset>
      {appointment ? <button type="button" disabled={busy} onClick={() => setEditing(false)}>Back to details</button> : null}
    </form>}
  </Modal>
}
