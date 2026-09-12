begin;

-- Exit pending automation work as soon as a recipient is no longer eligible.
-- The delivery worker still independently checks consent immediately before a
-- provider call, which protects the small race between a claimed job and this
-- database transition.
create or replace function public.email_automation_exit_contact_by_email(
  p_organisation_id uuid,
  p_email text,
  p_reason text
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exited integer := 0;
begin
  with exited as (
    update public.email_automation_enrolments e
    set status = 'exited', completed_at = now(), locked_at = null,
      last_error = left(coalesce(p_reason, 'Marketing eligibility changed.'), 1000)
    from public.email_marketing_contacts c
    where e.contact_id = c.id
      and c.organisation_id = p_organisation_id
      and c.email = lower(btrim(p_email))
      and e.status in ('queued', 'waiting', 'processing')
    returning e.id, e.organisation_id
  ), logged as (
    insert into public.email_automation_run_log (organisation_id, enrolment_id, event_type, detail)
    select organisation_id, id, 'exited', jsonb_build_object('reason', p_reason, 'source', 'eligibility_gate')
    from exited
    returning enrolment_id
  )
  select count(*)::integer into v_exited from logged;

  update public.email_automation_deliveries d
  set status = 'suppressed', locked_at = null,
    last_error = left(coalesce(p_reason, 'Marketing eligibility changed.'), 1000)
  from public.email_marketing_contacts c
  where d.contact_id = c.id
    and c.organisation_id = p_organisation_id
    and c.email = lower(btrim(p_email))
    and d.status in ('queued', 'processing');

  return v_exited;
end $$;

create or replace function public.email_automation_preference_exit_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.marketing_consent_status <> 'opted_in'
    and new.marketing_consent_status is distinct from old.marketing_consent_status then
    perform public.email_automation_exit_contact_by_email(new.organisation_id, new.email, 'Marketing consent was withdrawn.');
  end if;
  return new;
end $$;

drop trigger if exists email_automation_preference_exit_trigger on public.contact_marketing_preferences;
create trigger email_automation_preference_exit_trigger
after update of marketing_consent_status on public.contact_marketing_preferences
for each row execute function public.email_automation_preference_exit_trigger();

create or replace function public.email_automation_suppression_exit_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.email_automation_exit_contact_by_email(
    new.organisation_id,
    new.email,
    'Email address is suppressed: ' || new.reason
  );
  return new;
end $$;

drop trigger if exists email_automation_suppression_exit_trigger on public.email_suppressions;
create trigger email_automation_suppression_exit_trigger
after insert or update of reason on public.email_suppressions
for each row execute function public.email_automation_suppression_exit_trigger();

create or replace view public.email_automation_journey_health
with (security_invoker = true) as
select
  j.organisation_id,
  j.id as journey_id,
  count(e.id)::integer as enrolled,
  count(e.id) filter (where e.status in ('queued', 'waiting', 'processing'))::integer as in_progress,
  count(e.id) filter (where e.status = 'completed')::integer as completed,
  count(e.id) filter (where e.status = 'exited')::integer as exited,
  count(e.id) filter (where e.status = 'failed')::integer as failed_enrolments,
  count(d.id) filter (where d.status = 'queued')::integer as queued_deliveries,
  count(d.id) filter (where d.status in ('sent', 'delivered', 'opened', 'clicked'))::integer as sent,
  count(d.id) filter (where d.status in ('delivered', 'opened', 'clicked'))::integer as delivered,
  count(d.id) filter (where d.status in ('opened', 'clicked'))::integer as opened,
  count(d.id) filter (where d.status = 'clicked')::integer as clicked,
  count(d.id) filter (where d.status = 'bounced')::integer as bounced,
  count(d.id) filter (where d.status = 'complained')::integer as complained,
  count(d.id) filter (where d.status = 'suppressed')::integer as suppressed,
  count(d.id) filter (where d.status = 'failed')::integer as failed_deliveries,
  max(e.created_at) as last_enrolled_at,
  max(d.sent_at) as last_sent_at
from public.email_automation_journeys j
left join public.email_automation_enrolments e on e.journey_id = j.id
left join public.email_automation_deliveries d on d.enrolment_id = e.id
group by j.organisation_id, j.id;

grant select on public.email_automation_journey_health to authenticated;
revoke all on function public.email_automation_exit_contact_by_email(uuid, text, text) from public, anon, authenticated;
revoke all on function public.email_automation_preference_exit_trigger(), public.email_automation_suppression_exit_trigger() from public, anon, authenticated;

commit;
