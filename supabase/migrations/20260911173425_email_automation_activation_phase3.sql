begin;

-- A journey must not become live merely because a member updates a table row.
-- This keeps activation behind the same sending-administrator boundary as a
-- campaign, and re-validates every campaign that the journey will use.
create or replace function public.email_automation_set_journey_status(
  p_journey_id uuid,
  p_status text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_journey public.email_automation_journeys%rowtype;
begin
  select * into v_journey
  from public.email_automation_journeys
  where id = p_journey_id
  for update;

  if not found then
    raise exception 'Journey not found.' using errcode = 'P0002';
  end if;
  if p_status not in ('active', 'paused', 'archived') then
    raise exception 'A journey can only be activated, paused, or archived.' using errcode = '22023';
  end if;
  if not public.email_campaign_can_send(v_journey.organisation_id) then
    raise exception 'Only a sending administrator can change a journey status.' using errcode = '42501';
  end if;
  if v_journey.status = 'archived' then
    raise exception 'An archived journey cannot be reactivated.' using errcode = '22023';
  end if;

  if p_status = 'active' then
    if not exists (
      select 1 from public.email_automation_steps s
      where s.journey_id = v_journey.id and s.step_type = 'campaign'
    ) then
      raise exception 'Add a campaign step before activating this journey.' using errcode = '23514';
    end if;
    if exists (
      select 1
      from public.email_automation_steps s
      join public.email_campaigns c on c.id = s.campaign_id
      left join public.email_sender_identities i on i.id = c.sender_identity_id
      where s.journey_id = v_journey.id
        and s.step_type = 'campaign'
        and (
          c.organisation_id <> v_journey.organisation_id
          or c.status not in ('draft', 'scheduled')
          or c.subscription_type_id is null
          or nullif(btrim(c.html), '') is null
          or i.verification_status is distinct from 'verified'
          or (c.approval_required and c.approval_status <> 'approved')
        )
    ) then
      raise exception 'Every journey campaign must be send-ready, verified, and approved where required.' using errcode = '23514';
    end if;
  end if;

  perform set_config('app.email_automation_status_transition', 'true', true);
  update public.email_automation_journeys
  set status = p_status, updated_by = auth.uid(), updated_at = now()
  where id = v_journey.id;

  -- A resumed journey continues safely from its stored step. A paused journey
  -- is excluded by the claim functions below, so no in-flight queue is lost.
  if p_status = 'active' then
    update public.email_automation_enrolments
    set next_run_at = now()
    where journey_id = v_journey.id
      and status in ('queued', 'waiting')
      and next_run_at > now();
    update public.email_automation_deliveries d
    set next_run_at = now()
    from public.email_automation_enrolments e
    where d.enrolment_id = e.id
      and e.journey_id = v_journey.id
      and d.status = 'queued'
      and d.next_run_at > now();
  end if;

  return jsonb_build_object('journey_id', v_journey.id, 'status', p_status);
end $$;

create or replace function public.email_automation_journey_status_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status is distinct from old.status
    and current_setting('app.email_automation_status_transition', true) is distinct from 'true' then
    raise exception 'Journey status can only be changed through the activation workflow.' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists email_automation_journey_status_guard_trigger on public.email_automation_journeys;
create trigger email_automation_journey_status_guard_trigger
before update on public.email_automation_journeys
for each row execute function public.email_automation_journey_status_guard();

-- Do not claim a paused or archived journey. This holds pending delays and
-- sends in place rather than cancelling them or repeatedly retrying them.
create or replace function public.email_automation_claim_enrolments(p_limit integer default 25)
returns setof public.email_automation_enrolments
language sql
security definer
set search_path = public
as $$
  with claimed as (
    select e.id
    from public.email_automation_enrolments e
    join public.email_automation_journeys j on j.id = e.journey_id
    where e.status in ('queued', 'waiting') and e.next_run_at <= now() and j.status = 'active'
    order by e.next_run_at, e.created_at
    for update of e skip locked
    limit greatest(1, least(p_limit, 100))
  )
  update public.email_automation_enrolments e
  set status = 'processing', locked_at = now(), attempts = attempts + 1
  from claimed
  where e.id = claimed.id
  returning e.*;
$$;

create or replace function public.email_automation_claim_deliveries(p_limit integer default 25)
returns setof public.email_automation_deliveries
language sql
security definer
set search_path = public
as $$
  with claimed as (
    select d.id
    from public.email_automation_deliveries d
    join public.email_automation_enrolments e on e.id = d.enrolment_id
    join public.email_automation_journeys j on j.id = e.journey_id
    where d.status = 'queued' and d.next_run_at <= now() and j.status = 'active'
    order by d.next_run_at, d.created_at
    for update of d skip locked
    limit greatest(1, least(p_limit, 100))
  )
  update public.email_automation_deliveries d
  set status = 'processing', locked_at = now(), attempts = attempts + 1
  from claimed
  where d.id = claimed.id
  returning d.*;
$$;

revoke all on function public.email_automation_set_journey_status(uuid, text) from public, anon;
grant execute on function public.email_automation_set_journey_status(uuid, text) to authenticated;
revoke all on function public.email_automation_claim_enrolments(integer), public.email_automation_claim_deliveries(integer) from public, anon, authenticated;
grant execute on function public.email_automation_claim_enrolments(integer), public.email_automation_claim_deliveries(integer) to service_role;
revoke all on function public.email_automation_journey_status_guard() from public, anon, authenticated;

commit;
