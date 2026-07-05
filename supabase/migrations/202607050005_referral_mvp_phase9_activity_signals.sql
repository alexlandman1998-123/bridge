begin;

do $$
begin
  if to_regclass('public.lead_referrals') is not null
     and to_regclass('public.referral_status_events') is not null then
    execute $function$
create or replace function public.bridge_referral_status_event_to_lead_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $body$
declare
  referral_row public.lead_referrals%rowtype;
  activity_type text;
  activity_note text;
begin
  if to_regclass('public.lead_activities') is null then
    return new;
  end if;

  if coalesce(new.metadata, '{}'::jsonb) ->> 'suppress_lead_activity' = 'true' then
    return new;
  end if;

  select *
    into referral_row
  from public.lead_referrals
  where id = new.referral_id
  limit 1;

  if referral_row.id is null
     or referral_row.source_organisation_id is null
     or referral_row.source_lead_id is null then
    return new;
  end if;

  activity_type := case
    when new.event_type = 'referral_created' then 'Referral Created'
    when new.event_type = 'invite_response' and new.to_status = 'accepted' then 'Referral Accepted'
    when new.event_type = 'invite_response' and new.to_status = 'declined' then 'Referral Declined'
    when new.event_type = 'terms_response' and new.to_status = 'accepted' then 'Referral Accepted'
    when new.event_type = 'terms_response' and new.to_status = 'declined' then 'Referral Declined'
    when new.event_type = 'terms_needs_review' or new.to_status = 'needs_review' then 'Referral Needs Review'
    when new.event_type = 'conversion_recorded' then 'Referral Converted'
    when new.event_type = 'commission_due' or new.to_status = 'commission_due' then 'Referral Commission Due'
    when new.event_type = 'commission_paid' or new.to_status = 'paid' then 'Referral Commission Paid'
    when new.event_type = 'follow_up_scheduled' then 'Referral Follow-up Scheduled'
    when new.event_type = 'follow_up_completed' then 'Referral Follow-up Completed'
    when new.event_type = 'referral_lost' or new.to_status = 'lost' then 'Referral Lost'
    else 'Referral Update'
  end;

  activity_note := coalesce(
    nullif(trim(coalesce(new.event_note, '')), ''),
    activity_type || case
      when referral_row.target_agent_name is not null then ' with ' || referral_row.target_agent_name
      when referral_row.target_agent_email is not null then ' with ' || referral_row.target_agent_email
      else ''
    end
  );

  insert into public.lead_activities (
    activity_id,
    organisation_id,
    lead_id,
    agent_id,
    activity_type,
    activity_note,
    activity_date,
    outcome
  )
  values (
    gen_random_uuid(),
    referral_row.source_organisation_id,
    referral_row.source_lead_id,
    new.actor_id,
    activity_type,
    activity_note,
    coalesce(new.created_at, now()),
    new.to_status
  );

  return new;
exception
  when others then
    return new;
end;
$body$;
$function$;

    execute 'drop trigger if exists referral_status_events_lead_activity_signal on public.referral_status_events';
    execute 'create trigger referral_status_events_lead_activity_signal
      after insert on public.referral_status_events
      for each row
      execute function public.bridge_referral_status_event_to_lead_activity()';
  end if;
end $$;

commit;
