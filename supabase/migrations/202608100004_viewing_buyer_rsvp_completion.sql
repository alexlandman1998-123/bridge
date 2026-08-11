-- Buyer viewing planner Phase 5: final confirmation after buyer RSVP.
-- Once the buyer accepts a seller-approved viewing, return token-scoped
-- confirmation recipients so the public RSVP page can send final emails.

drop function if exists public.get_viewing_buyer_rsvp_completion_by_token(text);
create function public.get_viewing_buyer_rsvp_completion_by_token(p_token text)
returns table (
  event_id uuid,
  appointment_id uuid,
  organisation_id uuid,
  organisation_name text,
  organisation_logo_url text,
  organisation_logo_light_url text,
  organisation_logo_dark_url text,
  organisation_brand_primary_color text,
  organisation_brand_secondary_color text,
  support_email text,
  support_phone text,
  buyer_participant_id uuid,
  recipient_participant_id uuid,
  recipient_name text,
  recipient_email text,
  recipient_role text,
  recipient_rsvp_token text,
  appointment_title text,
  appointment_type text,
  appointment_date date,
  start_time time,
  end_time time,
  timezone text,
  location text,
  meeting_url text,
  status text,
  notes text,
  listing_label text,
  agent_name text,
  agent_email text,
  email_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_context record;
  v_recipient record;
  v_event_id uuid;
  v_event_email_status text;
  v_dedupe_key text;
begin
  select
    buyer.participant_id as buyer_participant_id,
    buyer.appointment_id,
    a.organisation_id,
    a.lead_id,
    a.title,
    a.appointment_type,
    a.appointment_date,
    a.start_time,
    a.end_time,
    a.timezone,
    a.location,
    a.meeting_url,
    a.status,
    a.notes,
    a.listing_id,
    a.transaction_id,
    a.visibility_scope,
    coalesce(org.display_name, org.name) as organisation_name,
    org.logo_url as organisation_logo_url,
    org.support_email,
    org.support_phone,
    brand.logo_light_url,
    brand.logo_dark_url,
    brand.primary_brand_color as primary_color,
    brand.secondary_brand_color as secondary_color,
    coalesce(agent.full_name, agent.email) as agent_name,
    agent.email as agent_email
  into v_context
  from public.appointment_participants buyer
  join public.appointments a on a.appointment_id = buyer.appointment_id
  left join public.organisations org on org.id = a.organisation_id
  left join public.organisation_branding brand on brand.organisation_id = a.organisation_id
  left join public.profiles agent on agent.id = coalesce(a.agent_id, a.created_by)
  where buyer.rsvp_token = nullif(trim(p_token), '')
    and lower(coalesce(buyer.participant_role, '')) like '%buyer%'
    and buyer.rsvp_status = 'Accepted'
    and buyer.responded_at is not null
    and buyer.rsvp_revoked_at is null
    and lower(coalesce(a.appointment_type, '')) like '%view%'
    and lower(coalesce(a.status, '')) = 'confirmed'
  limit 1;

  if not found then
    return;
  end if;

  if v_context.lead_id is not null and to_regclass('public.leads') is not null then
    update public.leads l
    set
      notes = regexp_replace(
        regexp_replace(
          coalesce(l.notes, ''),
          '(\[Buyer viewing plan\][^[]*Status: )[^\n\r]*',
          '\1booked'
        ),
        '(Viewing appointments booked at: )[^\n\r]*',
        '\1' || now()::text
      ),
      updated_at = now()
    where l.lead_id = v_context.lead_id
      and l.organisation_id = v_context.organisation_id
      and coalesce(l.notes, '') like '%[Buyer viewing plan]%';
  end if;

  for v_recipient in
    select
      ap.participant_id,
      ap.name,
      lower(ap.email) as email,
      ap.participant_role,
      ap.rsvp_token,
      ap.created_at
    from public.appointment_participants ap
    where ap.appointment_id = v_context.appointment_id
      and nullif(trim(coalesce(ap.email, '')), '') is not null
      and lower(coalesce(ap.participant_role, '')) in ('buyer', 'seller', 'agent')
    union all
    select
      null::uuid as participant_id,
      coalesce(v_context.agent_name, v_context.agent_email, 'Agent') as name,
      lower(v_context.agent_email) as email,
      'Agent' as participant_role,
      null::text as rsvp_token,
      now() as created_at
    where nullif(trim(coalesce(v_context.agent_email, '')), '') is not null
      and not exists (
        select 1
        from public.appointment_participants ap
        where ap.appointment_id = v_context.appointment_id
          and lower(coalesce(ap.email, '')) = lower(v_context.agent_email)
      )
    order by created_at asc
  loop
    v_dedupe_key := v_context.appointment_id::text || '::buyer_rsvp_completion::' ||
      coalesce(v_recipient.participant_id::text, lower(v_recipient.email));
    v_event_id := null;
    v_event_email_status := 'pending';

    if to_regclass('public.appointment_notification_events') is not null then
      insert into public.appointment_notification_events (
        appointment_id,
        transaction_id,
        event_type,
        recipient_id,
        recipient_role,
        recipient_email,
        visibility,
        title,
        message,
        email_status,
        in_app_status,
        metadata,
        dedupe_key,
        created_at,
        updated_at
      )
      values (
        v_context.appointment_id,
        v_context.transaction_id,
        'appointment_confirmed',
        null,
        lower(v_recipient.participant_role),
        lower(v_recipient.email),
        coalesce(nullif(v_context.visibility_scope, ''), 'shared_role_players'),
        'Viewing confirmed',
        'Buyer and seller have both accepted the viewing appointment.',
        'pending',
        case when lower(v_recipient.participant_role) = 'agent' then 'pending' else 'skipped' end,
        jsonb_build_object(
          'source', 'buyer_rsvp_completion_confirmation',
          'buyerParticipantId', v_context.buyer_participant_id,
          'recipientParticipantId', v_recipient.participant_id,
          'appointmentStatus', v_context.status
        ),
        v_dedupe_key,
        now(),
        now()
      )
      on conflict (dedupe_key) where dedupe_key is not null do nothing;

      select ane.id, ane.email_status
      into v_event_id, v_event_email_status
      from public.appointment_notification_events ane
      where ane.dedupe_key = v_dedupe_key
      limit 1;

      if v_event_email_status = 'sent' then
        continue;
      end if;
    end if;

    return query
    select
      v_event_id,
      v_context.appointment_id,
      v_context.organisation_id,
      v_context.organisation_name,
      v_context.organisation_logo_url,
      v_context.logo_light_url,
      v_context.logo_dark_url,
      v_context.primary_color,
      v_context.secondary_color,
      v_context.support_email,
      v_context.support_phone,
      v_context.buyer_participant_id,
      v_recipient.participant_id,
      v_recipient.name,
      lower(v_recipient.email),
      v_recipient.participant_role,
      v_recipient.rsvp_token,
      v_context.title,
      v_context.appointment_type,
      v_context.appointment_date,
      v_context.start_time,
      v_context.end_time,
      coalesce(nullif(v_context.timezone, ''), 'Africa/Johannesburg'),
      v_context.location,
      v_context.meeting_url,
      v_context.status,
      v_context.notes,
      coalesce(nullif(v_context.title, ''), nullif(v_context.listing_id, '')),
      v_context.agent_name,
      v_context.agent_email,
      coalesce(v_event_email_status, 'pending');
  end loop;
end;
$$;

drop function if exists public.mark_viewing_buyer_rsvp_completion_delivery(text, uuid, text, text);
create function public.mark_viewing_buyer_rsvp_completion_delivery(
  p_token text,
  p_event_id uuid,
  p_email_status text,
  p_delivery_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_appointment_id uuid;
begin
  if p_email_status not in ('sent', 'failed', 'skipped', 'pending') then
    raise exception 'Invalid email status';
  end if;

  select buyer.appointment_id
  into v_appointment_id
  from public.appointment_participants buyer
  join public.appointments a on a.appointment_id = buyer.appointment_id
  where buyer.rsvp_token = nullif(trim(p_token), '')
    and lower(coalesce(buyer.participant_role, '')) like '%buyer%'
    and buyer.rsvp_status = 'Accepted'
    and lower(coalesce(a.status, '')) = 'confirmed'
  limit 1;

  if v_appointment_id is null or p_event_id is null then
    return;
  end if;

  update public.appointment_notification_events ane
  set
    email_status = p_email_status,
    metadata = coalesce(ane.metadata, '{}'::jsonb) || jsonb_build_object(
      'deliveryError', nullif(trim(coalesce(p_delivery_error, '')), ''),
      'deliveryMarkedAt', now()
    ),
    updated_at = now()
  where ane.id = p_event_id
    and ane.appointment_id = v_appointment_id
    and ane.event_type = 'appointment_confirmed';
end;
$$;

revoke all on function public.get_viewing_buyer_rsvp_completion_by_token(text) from public;
revoke all on function public.mark_viewing_buyer_rsvp_completion_delivery(text, uuid, text, text) from public;
grant execute on function public.get_viewing_buyer_rsvp_completion_by_token(text) to anon, authenticated;
grant execute on function public.mark_viewing_buyer_rsvp_completion_delivery(text, uuid, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
