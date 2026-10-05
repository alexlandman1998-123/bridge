type Row = Record<string, any>;
const text = (value: unknown) => String(value ?? '').trim();
const lower = (value: unknown) => text(value).toLowerCase();
const closed = ['cancelled', 'canceled', 'completed', 'declined', 'no_show'];

export function attorneyDeliveryDecision(job: Row, appointment: Row | null, participant: Row | null, now = new Date()) {
  if (!appointment || !participant || appointment.attorney_delivery_enabled !== true ||
    text(job.appointment_id) !== text(appointment.appointment_id) || text(participant.appointment_id) !== text(job.appointment_id) ||
    text(job.participant_id) !== text(participant.participant_id) || !text(participant.email) ||
    Number(job.revision) !== Number(appointment.calendar_revision)) return 'superseded';
  const kind = text(job.event_kind);
  const status = lower(appointment.status);
  if (kind === 'cancelled') return ['cancelled','canceled'].includes(status) ? 'send' : 'superseded';
  if (kind === 'completed') return status === 'completed' ? 'send' : 'superseded';
  if (kind === 'declined') return status === 'declined' ? 'send' : 'superseded';
  if (closed.includes(status)) return 'superseded';
  if (kind.startsWith('reminder')) {
    const start = Date.parse(text(appointment.date_time));
    if (['reschedule requested','alternative_requested','alternative_proposed'].includes(status) || lower(participant.rsvp_status) === 'declined' || !Number.isFinite(start) ||
      now.getTime() > start + (kind === 'reminder_due' ? 15 * 60000 : 0)) return 'superseded';
  }
  if (kind === 'invite' && (participant.rsvp_revoked_at || lower(participant.rsvp_status) !== 'pending' || !participant.rsvp_token || Date.parse(text(participant.rsvp_expires_at)) <= now.getTime())) return 'superseded';
  return 'send';
}

export function buildAttorneyDeliveryPayload({ job, appointment: a, participant: p, organizer = {}, appUrl, request = null }: { job: Row; appointment: Row; participant: Row; organizer?: Row; appUrl: string; request?: Row | null }) {
  const kind = text(job.event_kind);
  const proposal = kind.startsWith('reschedule');
  const terminal = closed.includes(lower(a.status));
  const token = !terminal && !proposal && !p.rsvp_revoked_at && lower(p.participant_role) !== 'attorney' && !p.is_scheduling_owner ? text(p.rsvp_token) : '';
  const actionLink = token ? `${appUrl.replace(/\/$/,'')}/appointment-rsvp/${encodeURIComponent(token)}` : '';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone:'Africa/Johannesburg',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23' })
    .formatToParts(new Date(a.date_time)).reduce((parts: Row,p) => ({...parts,[p.type]:p.value}),{});
  const type = kind === 'cancelled' || kind === 'declined' ? 'appointment_cancelled' : kind === 'invite' ? 'appointment_confirmation_required'
    : kind === 'confirmed' ? 'appointment_confirmed' : kind.startsWith('reminder') ? 'appointment_reminder' : kind === 'documents' ? 'appointment_documents_required'
    : proposal ? 'appointment_rescheduled' : 'appointment_updated';
  return {
    type, to:lower(p.email), organisationId:a.organisation_id, appointmentId:a.appointment_id, participantId:p.participant_id,
    appointmentType:a.appointment_type, appointmentTitle:a.title, appointmentDate:a.appointment_date || `${parts.year}-${parts.month}-${parts.day}`,
    appointmentTime:text(a.start_time).slice(0,5) || `${parts.hour}:${parts.minute}`, appointmentEndTime:text(a.end_time).slice(0,5),
    timezone:'Africa/Johannesburg', status: kind === 'declined' ? 'Cancelled' : a.status, location:a.location, meetingUrl:a.meeting_url,
    recipientName:p.name, participantRole:p.participant_role, organizerName:organizer.full_name, organizerEmail:organizer.email,
    agentName:organizer.full_name, agentEmail:organizer.email, agentRole:'Attorney', bccAgent:false,
    replyTo:organizer.email, actionLink, acceptLink: actionLink ? `${actionLink}?action=accept` : '', declineLink: actionLink ? `${actionLink}?action=decline` : '',
    rescheduleLink:actionLink ? `${actionLink}?action=reschedule` : '',
    notes: [kind === 'cancelled' ? a.cancellation_reason : '',kind === 'declined' ? 'A participant declined this appointment.' : '',
      proposal ? `Reschedule ${kind.replace('reschedule_','')}. Proposed time: ${text(request?.preferred_start)}. ${text(request?.reason)}` : '',a.appointment_instructions,a.notes].filter(Boolean).join('\n\n'),
    attachCalendarInvite: a.attorney_attach_calendar !== false && !proposal && kind !== 'completed',
    calendarSequence:Number(a.calendar_revision) || 0, calendarTimestamp: job.created_at || a.updated_at || a.created_at, idempotencyKey:`attorney-appointment:${job.id}`,
  };
}

export async function dispatchAttorneyAppointmentJob(client: any, job: Row, configuration: { supabaseUrl: string; serviceRoleKey: string; appUrl: string }, fetcher = fetch) {
  const complete = async (status: string, error = '', providerId = '') => {
    const result = await client.rpc('complete_attorney_appointment_delivery', { p_id:job.id,p_attempt:job.attempt_count,p_status:status,p_error:error || null,p_provider_id:providerId || null });
    if (result.error) throw result.error;
    return result.data === true;
  };
  const readOne = async (table: string, column: string, id: unknown) => {
    const result = await client.from(table).select('*').eq(column,id).maybeSingle();
    if (result.error) throw result.error;
    return result.data;
  };
  try {
    const [appointment,participant] = await Promise.all([readOne('appointments','appointment_id',job.appointment_id), readOne('appointment_participants','participant_id',job.participant_id)]);
    if (attorneyDeliveryDecision(job,appointment,participant) !== 'send') {
      await complete('superseded'); return { jobId:job.id,status:'superseded' };
    }
    const organizer = appointment.created_by ? (await readOne('profiles','id',appointment.created_by)) || {} : {};
    let request = null;
    if (text(job.event_kind).startsWith('reschedule')) {
      const result = await client.from('appointment_reschedule_requests').select('*').eq('appointment_id',job.appointment_id).order('updated_at',{ascending:false}).limit(1).maybeSingle();
      if (result.error) throw result.error;
      request = result.data;
    }
    const payload = buildAttorneyDeliveryPayload({job,appointment,participant,organizer,request,appUrl:configuration.appUrl});
    // Re-read after preparation so a cancelled or replaced event is skipped.
    const current = await readOne('appointments','appointment_id',job.appointment_id);
    if (attorneyDeliveryDecision(job,current,participant) !== 'send') {
      await complete('superseded'); return { jobId:job.id,status:'superseded' };
    }
    const prepared = await client.rpc('record_attorney_delivery_in_app',{p_id:job.id,p_attempt:job.attempt_count});
    if (prepared.error) throw prepared.error;
    if (prepared.data !== true) return {jobId:job.id,status:'stale_receipt'};
    const frozen = await client.rpc('save_attorney_delivery_payload',{p_id:job.id,p_attempt:job.attempt_count,p_payload:payload});
    if (frozen.error) throw frozen.error;
    if (!frozen.data) return {jobId:job.id,status:'stale_receipt'};
    const response = await fetcher(`${configuration.supabaseUrl.replace(/\/$/,'')}/functions/v1/send-email`, {
      method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${configuration.serviceRoleKey}`,apikey:configuration.serviceRoleKey},body:JSON.stringify(frozen.data),signal:AbortSignal.timeout(12000),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok !== true) throw new Error(text(result.error) || `Email service returned ${response.status}.`);
    const recorded = await complete('sent','',text(result.emailId));
    if (recorded && job.event_kind === 'invite') {
      const stamped = await client.from('appointment_participants').update({invitation_sent_at:new Date().toISOString(),last_invitation_sent_at:new Date().toISOString()})
        .eq('participant_id',job.participant_id).eq('rsvp_token',participant.rsvp_token);
      if (stamped.error) console.warn('[attorney-calendar] invitation receipt could not be stamped');
    }
    return {jobId:job.id,status:recorded ? 'sent' : 'stale_receipt'};
  } catch (error) {
    // Provider errors may contain addresses. Persist a neutral receipt instead.
    try { await complete('failed','Delivery failed; automatic retry scheduled.'); } catch { /* expired lease will be reclaimed */ }
    return {jobId:job.id,status:'failed'};
  }
}
