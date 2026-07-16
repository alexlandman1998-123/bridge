begin;

-- Admin CRM intake leads Phase 4
-- Adds an immutable operational history and a guarded duplicate-review flow.

create table if not exists public.demo_enquiry_activity_events (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid not null references public.demo_enquiries(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  changed_fields text[] not null default '{}'::text[],
  before_state jsonb not null default '{}'::jsonb,
  after_state jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint demo_enquiry_activity_events_type_check
    check (event_type in ('workflow_updated', 'duplicate_reviewed', 'conversion_linked'))
);

create index if not exists demo_enquiry_activity_events_lead_idx
  on public.demo_enquiry_activity_events (enquiry_id, occurred_at desc);
create index if not exists demo_enquiry_activity_events_actor_idx
  on public.demo_enquiry_activity_events (actor_user_id, occurred_at desc)
  where actor_user_id is not null;

alter table public.demo_enquiry_activity_events enable row level security;
revoke all on table public.demo_enquiry_activity_events from public, anon, authenticated;

create or replace function public.bridge_log_demo_enquiry_activity_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_changed_fields text[];
  v_event_type text;
begin
  v_changed_fields := array_remove(array[
    case when old.sales_stage is distinct from new.sales_stage then 'salesStage' end,
    case when old.priority is distinct from new.priority then 'priority' end,
    case when old.assigned_to_user_id is distinct from new.assigned_to_user_id then 'assignedToUserId' end,
    case when old.next_action is distinct from new.next_action then 'nextAction' end,
    case when old.next_action_at is distinct from new.next_action_at then 'nextActionAt' end,
    case when old.lost_reason is distinct from new.lost_reason then 'lostReason' end,
    case when old.internal_notes is distinct from new.internal_notes then 'internalNotes' end,
    case when old.dedupe_status is distinct from new.dedupe_status then 'dedupeStatus' end,
    case when old.duplicate_of_enquiry_id is distinct from new.duplicate_of_enquiry_id then 'duplicateOfEnquiryId' end,
    case when old.converted_organisation_id is distinct from new.converted_organisation_id then 'convertedOrganisationId' end
  ], null);

  if cardinality(v_changed_fields) = 0 then
    return new;
  end if;

  v_event_type := case
    when old.converted_organisation_id is distinct from new.converted_organisation_id then 'conversion_linked'
    when old.dedupe_status is distinct from new.dedupe_status
      or old.duplicate_of_enquiry_id is distinct from new.duplicate_of_enquiry_id then 'duplicate_reviewed'
    else 'workflow_updated'
  end;

  insert into public.demo_enquiry_activity_events (
    enquiry_id,
    actor_user_id,
    event_type,
    changed_fields,
    before_state,
    after_state
  ) values (
    new.id,
    auth.uid(),
    v_event_type,
    v_changed_fields,
    jsonb_build_object(
      'stage', old.sales_stage,
      'priority', old.priority,
      'assignedToUserId', old.assigned_to_user_id,
      'nextAction', old.next_action,
      'nextActionAt', old.next_action_at,
      'dedupeStatus', old.dedupe_status,
      'duplicateOfEnquiryId', old.duplicate_of_enquiry_id,
      'convertedOrganisationId', old.converted_organisation_id
    ),
    jsonb_build_object(
      'stage', new.sales_stage,
      'priority', new.priority,
      'assignedToUserId', new.assigned_to_user_id,
      'nextAction', new.next_action,
      'nextActionAt', new.next_action_at,
      'dedupeStatus', new.dedupe_status,
      'duplicateOfEnquiryId', new.duplicate_of_enquiry_id,
      'convertedOrganisationId', new.converted_organisation_id
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_bridge_log_demo_enquiry_activity_v1 on public.demo_enquiries;
create trigger trg_bridge_log_demo_enquiry_activity_v1
after update on public.demo_enquiries
for each row execute function public.bridge_log_demo_enquiry_activity_v1();

revoke all on function public.bridge_log_demo_enquiry_activity_v1() from public, anon, authenticated, service_role;

create or replace function public.arch9_admin_intake_lead_context_v1(
  p_enquiry_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_lead public.demo_enquiries%rowtype;
  v_result jsonb;
begin
  if not public.bridge_is_platform_admin() then
    raise exception 'Admin lead context access is required.' using errcode = '42501';
  end if;

  select * into v_lead
  from public.demo_enquiries
  where id = p_enquiry_id;

  if not found then
    raise exception 'Lead not found.' using errcode = 'P0002';
  end if;

  select jsonb_build_object(
    'version', 1,
    'dedupeStatus', v_lead.dedupe_status,
    'duplicateOfEnquiryId', v_lead.duplicate_of_enquiry_id,
    'candidates', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', candidate.id,
        'contactName', trim(concat_ws(' ', candidate.first_name, candidate.last_name)),
        'organisationName', candidate.company,
        'email', candidate.email,
        'phone', candidate.phone,
        'stage', candidate.sales_stage,
        'dedupeStatus', candidate.dedupe_status,
        'submittedAt', coalesce(candidate.submitted_at, candidate.created_at),
        'matchReasons', array_remove(array[
          case when v_lead.normalized_email <> '' and candidate.normalized_email = v_lead.normalized_email then 'email' end,
          case when v_lead.normalized_phone <> '' and candidate.normalized_phone = v_lead.normalized_phone then 'phone' end,
          case when v_lead.normalized_company <> '' and candidate.normalized_company = v_lead.normalized_company then 'company' end
        ], null)
      ) order by candidate.created_at desc)
      from (
        select matched.*
        from public.demo_enquiries matched
        where matched.id <> v_lead.id
          and (
            (v_lead.normalized_email <> '' and matched.normalized_email = v_lead.normalized_email)
            or (v_lead.normalized_phone <> '' and matched.normalized_phone = v_lead.normalized_phone)
            or (v_lead.normalized_company <> '' and matched.normalized_company = v_lead.normalized_company)
          )
        order by matched.created_at desc
        limit 10
      ) candidate
    ), '[]'::jsonb),
    'activity', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', event.id,
        'eventType', event.event_type,
        'changedFields', event.changed_fields,
        'before', event.before_state,
        'after', event.after_state,
        'occurredAt', event.occurred_at,
        'actor', coalesce(nullif(trim(profile.full_name), ''), nullif(trim(concat_ws(' ', profile.first_name, profile.last_name)), ''), profile.email, 'System')
      ) order by event.occurred_at desc)
      from public.demo_enquiry_activity_events event
      left join public.profiles profile on profile.id = event.actor_user_id
      where event.enquiry_id = v_lead.id
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.arch9_admin_intake_lead_context_v1(uuid) from public, anon, authenticated, service_role;
grant execute on function public.arch9_admin_intake_lead_context_v1(uuid) to authenticated;

create or replace function public.arch9_admin_review_intake_lead_duplicate_v1(
  p_enquiry_id uuid,
  p_dedupe_status text,
  p_duplicate_of_enquiry_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text := lower(trim(coalesce(p_dedupe_status, '')));
  v_after public.demo_enquiries%rowtype;
begin
  if not public.bridge_is_platform_admin() then
    raise exception 'Admin duplicate review access is required.' using errcode = '42501';
  end if;

  if v_status not in ('canonical', 'possible_duplicate', 'confirmed_duplicate', 'merged') then
    raise exception 'Unsupported duplicate status.' using errcode = '22023';
  end if;

  if v_status in ('confirmed_duplicate', 'merged') and p_duplicate_of_enquiry_id is null then
    raise exception 'Select the canonical lead for this duplicate.' using errcode = '22023';
  end if;

  if p_duplicate_of_enquiry_id = p_enquiry_id then
    raise exception 'A lead cannot be its own canonical record.' using errcode = '22023';
  end if;

  if p_duplicate_of_enquiry_id is not null
    and not exists (select 1 from public.demo_enquiries where id = p_duplicate_of_enquiry_id) then
    raise exception 'Canonical lead not found.' using errcode = 'P0002';
  end if;

  update public.demo_enquiries
  set
    dedupe_status = v_status,
    duplicate_of_enquiry_id = case
      when v_status in ('confirmed_duplicate', 'merged') then p_duplicate_of_enquiry_id
      else null
    end
  where id = p_enquiry_id
  returning * into v_after;

  if not found then
    raise exception 'Lead not found.' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'id', v_after.id,
    'dedupeStatus', v_after.dedupe_status,
    'duplicateOfEnquiryId', v_after.duplicate_of_enquiry_id,
    'updatedAt', v_after.updated_at
  );
end;
$$;

revoke all on function public.arch9_admin_review_intake_lead_duplicate_v1(uuid, text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.arch9_admin_review_intake_lead_duplicate_v1(uuid, text, uuid) to authenticated;

commit;
