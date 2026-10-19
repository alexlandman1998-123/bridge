type Row = Record<string, any>;
type Configuration = { supabaseUrl: string; serviceRoleKey: string; appUrl: string };
const text = (value: unknown) => String(value ?? '').trim();

export function buildCalendarDeliveryPayload(job: Row, appointment: Row, participant: Row, organizer: Row, appUrl: string, proposal: Row | null = null) {
  const kind = text(job.event_kind);
  const reminder = kind.startsWith('reminder:');
  const terminal = ['cancelled','completed','declined','no_show'].includes(kind);
  const timeChangeStage = kind.startsWith('time_change:') ? kind.split(':')[1] : '';
  const proposed = (kind === 'reschedule_proposed' || timeChangeStage === 'proposed') && proposal?.status === 'proposed';
  const timezone = proposed ? proposal.proposed_timezone || appointment.timezone : appointment.timezone;
  const allDay = proposed ? proposal.proposed_all_day ?? appointment.all_day : appointment.all_day;
  const start = proposed ? proposal.preferred_start : appointment.date_time;
  const end = proposed ? proposal.preferred_end : appointment.end_date_time || (timeChangeStage ? proposal?.original_end : null);
  const parts = (instant: string) => Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone:timezone || 'Africa/Johannesburg', year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23',
  }).formatToParts(new Date(instant)).map(part => [part.type,part.value]));
  const localStart = parts(start), localEnd = parts(end);
  const participantAction = !terminal && !participant.rsvp_revoked_at && participant.rsvp_token
    ? `${appUrl.replace(/\/$/,'')}/appointment-rsvp/${encodeURIComponent(participant.rsvp_token)}` : '';
  const organizerAction = `${appUrl.replace(/\/$/,'')}/pipeline/calendar?appointmentId=${encodeURIComponent(appointment.appointment_id)}`;
  const action = reminder ? '' : timeChangeStage && participant.user_id === (appointment.agent_id || appointment.created_by) ? organizerAction : participantAction;
  const timeChangeCopy: Record<string,string> = {
    requested:'A new time has been requested. The organiser must review it. The current appointment remains booked.',
    proposed:'Please accept or decline this proposed replacement. The appointment has not moved; the current time stays booked until every required attendee accepts.',
    confirmed:'Every required attendee has accepted. The appointment is confirmed at the agreed new time.',
    declined:'The proposed time was not accepted. The current appointment remains booked at its original time.',
    withdrawn:'The time-change request was withdrawn. The original appointment remains booked.',
    expired:'The time-change request expired without agreement. The original appointment remains booked.',
  };
  const alreadyAccepted = proposed && participant.proposal_response === 'Accepted';
  const describe = (start: string, end: string, zone: string, day: boolean) => {
    if (!start) return 'Time to be confirmed';
    const date = new Date(start).toLocaleDateString('en-ZA',{timeZone:zone,weekday:'long',day:'numeric',month:'long',year:'numeric'});
    const clock = (value: string) => new Date(value).toLocaleTimeString('en-ZA',{timeZone:zone,hour:'2-digit',minute:'2-digit'});
    return `${date} · ${day ? 'All day' : `${clock(start)}${end ? ` – ${clock(end)}` : ''}`} (${zone})`;
  };
  const timeChangeNotes = timeChangeStage ? [alreadyAccepted ? 'Your acceptance of this proposed time is recorded. The original booking stays in place while the remaining required attendees respond.' : timeChangeCopy[timeChangeStage],
    `Original booking: ${describe(proposal?.original_start || appointment.date_time,proposal?.original_end || appointment.end_date_time,appointment.timezone || 'Africa/Johannesburg',appointment.all_day)}`,
    proposal?.preferred_start ? `Requested / proposed time: ${describe(proposal.preferred_start,proposal.preferred_end,proposal.proposed_timezone || appointment.timezone || 'Africa/Johannesburg',proposal.proposed_all_day ?? appointment.all_day)}` : '',
    proposal?.reason ? `Message: ${proposal.reason}` : ''].filter(Boolean).join('\n\n') : '';
  return {
    type: timeChangeStage ? `appointment_time_change_${timeChangeStage}` : kind.startsWith('reminder:') ? (kind === 'reminder:appointment_documents_required' ? 'appointment_documents_required' : 'appointment_reminder')
      : kind === 'invite' ? 'appointment_confirmation_required' : ['cancelled','declined'].includes(kind) ? 'appointment_cancelled'
      : kind === 'confirmed' ? 'appointment_confirmed' : proposed ? 'appointment_rescheduled' : 'appointment_updated',
    to: text(participant.email).toLowerCase(), organisationId:appointment.organisation_id,appointmentId:appointment.appointment_id,
    emailTheme:appointment.email_theme,emailTemplateKey:appointment.email_template_key,
    participantId:participant.participant_id,appointmentType:appointment.appointment_type,appointmentTitle:appointment.title,
    appointmentDate:`${localStart.year}-${localStart.month}-${localStart.day}`,appointmentTime:allDay ? 'All day' : `${localStart.hour}:${localStart.minute}${timeChangeStage ? ` – ${localEnd.hour}:${localEnd.minute}` : ''}`,
    appointmentEndTime:allDay ? '' : `${localEnd.hour}:${localEnd.minute}`,dateTime:start,endDateTime:end,timezone,allDay,
    status:reminder && appointment.has_confirmed_reservation ? 'confirmed' : appointment.status,location:appointment.location,meetingUrl:appointment.meeting_url,recipientName:participant.name,
    participantRole:participant.participant_role,organizerName:organizer.full_name,organizerEmail:organizer.email,
    agentName:organizer.full_name,agentEmail:organizer.email,agentRole:'Agent',replyTo:organizer.email,bccAgent:false,
    actionLink:action,acceptLink:reminder ? '' : proposed && !alreadyAccepted && action === participantAction ? `${participantAction}?action=accept` : !timeChangeStage && action ? `${action}?action=accept` : '',declineLink:reminder ? '' : proposed && !alreadyAccepted && action === participantAction ? `${participantAction}?action=decline` : !timeChangeStage && action ? `${action}?action=decline` : '',
    rescheduleLink:!reminder && !timeChangeStage && participantAction ? `${participantAction}?action=reschedule` : '',notes:timeChangeStage ? timeChangeNotes : [appointment.cancellation_reason,appointment.appointment_instructions,appointment.notes].filter(Boolean).join('\n\n'),
    attachCalendarInvite:!reminder && appointment.attach_calendar_invite !== false && (!timeChangeStage || timeChangeStage === 'confirmed') && !proposed && !['completed','no_show'].includes(kind),
    calendarSequence:job.revision,calendarTimestamp:job.created_at,idempotencyKey:`calendar-appointment:${job.id}`,
  };
}

export async function dispatchCalendarAppointmentJob(client: any, job: Row, configuration: Configuration, fetcher = fetch) {
  const complete = async (status: string, providerId: string | null = null) => {
    const result = await client.rpc('complete_calendar_delivery',{p_id:job.id,p_attempt:job.attempt_count,p_status:status,p_provider_id:providerId});
    if (result.error) throw result.error;
    return result.data === true;
  };
  const read = async (table: string, column: string, id: string) => {
    const result = await client.from(table).select('*').eq(column,id).maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) throw new Error('Delivery context unavailable.');
    return result.data;
  };
  try {
    let payload = job.payload || null;
    if (job.channel === 'email' && !payload) {
      const [appointment,participant] = await Promise.all([read('appointments','appointment_id',job.appointment_id),read('appointment_participants','participant_id',job.participant_id)]);
      const organizer = appointment.agent_id || appointment.created_by ? await read('profiles','id',appointment.agent_id || appointment.created_by) : {};
      let proposal = null;
      if (String(job.event_kind).startsWith('time_change:')) {
        const result = await client.from('appointment_reschedule_requests').select('*').eq('id',String(job.event_kind).split(':')[2]).eq('appointment_id',job.appointment_id).maybeSingle();
        if (result.error || !result.data) throw new Error('Time-change delivery context unavailable.');
        proposal = result.data;
      } else if (job.event_kind === 'reschedule_proposed') {
        const result = await client.from('appointment_reschedule_requests').select('*').eq('appointment_id',job.appointment_id).eq('status','proposed').order('created_at',{ascending:false}).limit(1).maybeSingle();
        if (result.error) throw result.error;
        proposal = result.data;
      }
      payload = buildCalendarDeliveryPayload(job,appointment,participant,organizer,configuration.appUrl,proposal);
    }
    // This service-only gate rechecks revision, claim, live participant identity,
    // visibility, hold, and saved choices immediately before dispatch.
    const prepared = await client.rpc('prepare_calendar_delivery',{p_id:job.id,p_attempt:job.attempt_count,p_payload:payload});
    if (prepared.error) throw prepared.error;
    if (!prepared.data) return {jobId:job.id,status:'superseded'};
    if (job.channel === 'in_app') return {jobId:job.id,status:'delivered'};
    const response = await fetcher(`${configuration.supabaseUrl.replace(/\/$/,'')}/functions/v1/send-email`,{
      method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${configuration.serviceRoleKey}`,apikey:configuration.serviceRoleKey},
      body:JSON.stringify(prepared.data),signal:AbortSignal.timeout(12000),
    });
    const receipt = await response.json().catch(() => ({}));
    if (!response.ok || receipt.ok !== true || !text(receipt.emailId)) throw new Error('Provider acceptance was not verified.');
    const recorded = await complete('provider_accepted',text(receipt.emailId));
    return {jobId:job.id,status:recorded ? 'provider_accepted' : 'stale_receipt'};
  } catch {
    try { await complete('failed'); } catch { /* expired leases recover interrupted persistence */ }
    return {jobId:job.id,status:'failed'};
  }
}
