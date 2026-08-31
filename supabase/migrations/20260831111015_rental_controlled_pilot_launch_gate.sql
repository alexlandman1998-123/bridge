-- Phase 80: a manager-recorded pilot decision. This is deliberately not a
-- feature flag, publication action, portal activation, or Sales integration.
create table public.rental_pilot_release_decisions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  idempotency_key text not null,
  decision text not null check (decision in ('requested', 'approved', 'paused', 'closed')),
  cohort_label text not null check (length(btrim(cohort_label)) >= 3),
  max_active_tenancies integer not null check (max_active_tenancies > 0),
  note text not null check (length(btrim(note)) >= 8),
  recorded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (organisation_id, idempotency_key)
);

create index rental_pilot_release_decisions_org_created_idx
  on public.rental_pilot_release_decisions (organisation_id, created_at desc);

alter table public.rental_pilot_release_decisions enable row level security;

create policy "rental_pilot_release_decisions_manager_read"
  on public.rental_pilot_release_decisions for select to authenticated
  using (public.rental_financial_manager_authorized(organisation_id));

create or replace function public.rental_get_pilot_launch_gate(p_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_missing text[];
  v_cohorts text[];
  v_tenancy_cap integer;
  v_active_tenancies integer;
begin
  if auth.uid() is null or not public.rental_financial_manager_authorized(p_org) then
    raise exception 'Not authorized';
  end if;

  select coalesce(array_agg(required.capability_key order by required.capability_key), '{}'::text[])
  into v_missing
  from (values ('portfolio'::text), ('applications'::text), ('tenancies'::text)) required(capability_key)
  left join public.rental_rollout_controls control
    on control.organisation_id = p_org
    and control.capability_key = required.capability_key
    and control.status = 'pilot'
  where control.capability_key is null;

  select coalesce(array_agg(distinct control.cohort_label order by control.cohort_label), '{}'::text[])
  into v_cohorts
  from public.rental_rollout_controls control
  where control.organisation_id = p_org
    and control.capability_key in ('portfolio', 'applications', 'tenancies')
    and control.status = 'pilot';

  select control.max_active_tenancies into v_tenancy_cap
  from public.rental_rollout_controls control
  where control.organisation_id = p_org and control.capability_key = 'tenancies';

  select count(*) into v_active_tenancies
  from public.rental_tenancies tenancy
  where tenancy.organisation_id = p_org
    and tenancy.status in ('active', 'notice_given', 'move_out_pending');

  return jsonb_build_object(
    'required_capabilities', jsonb_build_array('portfolio', 'applications', 'tenancies'),
    'missing_pilot_controls', to_jsonb(v_missing),
    'cohort_labels', to_jsonb(v_cohorts),
    'cohort_consistent', cardinality(v_cohorts) = 1,
    'active_tenancies', v_active_tenancies,
    'tenancy_cap', v_tenancy_cap,
    'within_tenancy_cap', v_tenancy_cap is null or v_active_tenancies <= v_tenancy_cap,
    'eligible', cardinality(v_missing) = 0 and cardinality(v_cohorts) = 1 and (v_tenancy_cap is null or v_active_tenancies <= v_tenancy_cap),
    'guardrail', 'An approval records a controlled Rentals pilot decision only. A separate matching environment flag is still required; this never enables Sales, portals, publishing, or messages.'
  );
end;
$$;

create or replace function public.rental_record_pilot_release_decision(
  p_org uuid,
  p_decision text,
  p_cohort_label text,
  p_max_active_tenancies integer,
  p_note text,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.rental_pilot_release_decisions;
  v_gate jsonb;
  v_id uuid;
begin
  if auth.uid() is null
    or not public.rental_financial_manager_authorized(p_org)
    or p_decision not in ('requested', 'approved', 'paused', 'closed')
    or length(btrim(coalesce(p_cohort_label, ''))) < 3
    or p_max_active_tenancies is null or p_max_active_tenancies < 1
    or length(btrim(coalesce(p_note, ''))) < 8
    or length(btrim(coalesce(p_idempotency_key, ''))) < 8
  then
    raise exception 'Invalid pilot release decision';
  end if;

  perform pg_advisory_xact_lock(hashtext('rental-pilot-release:' || p_org::text));

  select * into v_existing
  from public.rental_pilot_release_decisions
  where organisation_id = p_org and idempotency_key = btrim(p_idempotency_key);

  if found then
    return jsonb_build_object('decision_id', v_existing.id, 'decision', v_existing.decision, 'idempotent', true, 'environment_flag_required', true);
  end if;

  v_gate := public.rental_get_pilot_launch_gate(p_org);
  if p_decision = 'approved' and (
    not coalesce((v_gate ->> 'eligible')::boolean, false)
    or p_cohort_label <> v_gate -> 'cohort_labels' ->> 0
    or (v_gate ->> 'tenancy_cap') is not null and p_max_active_tenancies > (v_gate ->> 'tenancy_cap')::integer
  ) then
    raise exception 'Pilot gate is not eligible for approval';
  end if;

  insert into public.rental_pilot_release_decisions (
    organisation_id, idempotency_key, decision, cohort_label,
    max_active_tenancies, note, recorded_by
  ) values (
    p_org, btrim(p_idempotency_key), p_decision, btrim(p_cohort_label),
    p_max_active_tenancies, btrim(p_note), auth.uid()
  ) returning id into v_id;

  insert into public.rental_privileged_audit_events (
    organisation_id, event_key, subject_type, subject_id, actor_id, metadata
  ) values (
    p_org, 'rental_pilot_release_decision_recorded', 'pilot_release_decision', v_id, auth.uid(),
    jsonb_build_object('decision', p_decision, 'cohort_label', btrim(p_cohort_label), 'max_active_tenancies', p_max_active_tenancies, 'environment_flag_required', true)
  );

  return jsonb_build_object('decision_id', v_id, 'decision', p_decision, 'idempotent', false, 'environment_flag_required', true, 'gate', v_gate);
end;
$$;

revoke all on function public.rental_get_pilot_launch_gate(uuid) from public, anon;
revoke all on function public.rental_record_pilot_release_decision(uuid, text, text, integer, text, text) from public, anon;
grant execute on function public.rental_get_pilot_launch_gate(uuid) to authenticated;
grant execute on function public.rental_record_pilot_release_decision(uuid, text, text, integer, text, text) to authenticated;
