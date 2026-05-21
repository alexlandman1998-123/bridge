-- Agent calendar visibility helper.
-- Principals/admins can read every appointment in their organisation; agents only see appointments
-- directly assigned to them, created by them, or where they are an agent-side participant.

create or replace function public.bridge_is_org_admin(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.bridge_membership_role(target_org) in ('super_admin', 'principal', 'admin', 'developer', 'branch_manager'),
    false
  )
  or (
    public.bridge_is_active_member(target_org)
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(trim(coalesce(p.role, ''))) in (
          'super_admin',
          'superadmin',
          'principal',
          'owner',
          'admin',
          'administrator',
          'developer',
          'branch_manager',
          'branch manager'
        )
    )
  );
$$;

grant execute on function public.bridge_is_org_admin(uuid) to authenticated;

create or replace function public.bridge_list_calendar_appointments(
  p_organisation_id uuid,
  p_include_all boolean default false,
  p_listing_id text default null,
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns table (
  appointment_id uuid,
  organisation_id uuid,
  lead_id uuid,
  agent_id uuid,
  appointment_type text,
  custom_type_label text,
  title text,
  appointment_date date,
  start_time time,
  end_time time,
  date_time timestamptz,
  timezone text,
  all_day boolean,
  location_type text,
  location text,
  meeting_url text,
  contact_id uuid,
  listing_id text,
  transaction_id uuid,
  related_entity_type text,
  related_entity_id uuid,
  linked_workflow text,
  linked_workflow_stage text,
  linked_task_id uuid,
  linked_transaction_stage text,
  workflow_completion_effect jsonb,
  visibility_scope text,
  completion_behavior text,
  appointment_instructions text,
  required_documents jsonb,
  calendar_event_uid text,
  ics_generated_at timestamptz,
  external_calendar_status text,
  external_calendar_provider text,
  external_calendar_event_id text,
  resource_id uuid,
  allow_outside_business_hours boolean,
  scheduling_override_reason text,
  status text,
  notes text,
  outcome_summary text,
  client_feedback text,
  agent_notes text,
  next_step text,
  follow_up_date date,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid,
  cancellation_reason text
)
language sql
stable
security definer
set search_path = public
as $$
  with caller as (
    select
      auth.uid() as user_id,
      lower(coalesce(auth.jwt() ->> 'email', '')) as email,
      public.bridge_is_org_admin(p_organisation_id) as is_admin,
      public.bridge_is_active_member(p_organisation_id) as is_member
  )
  select
    a.appointment_id,
    a.organisation_id,
    a.lead_id,
    a.agent_id,
    a.appointment_type,
    a.custom_type_label,
    a.title,
    a.appointment_date,
    a.start_time,
    a.end_time,
    a.date_time,
    a.timezone,
    a.all_day,
    a.location_type,
    a.location,
    a.meeting_url,
    a.contact_id,
    a.listing_id,
    a.transaction_id,
    a.related_entity_type,
    a.related_entity_id,
    a.linked_workflow,
    a.linked_workflow_stage,
    a.linked_task_id,
    a.linked_transaction_stage,
    a.workflow_completion_effect,
    a.visibility_scope,
    a.completion_behavior,
    a.appointment_instructions,
    a.required_documents,
    a.calendar_event_uid,
    a.ics_generated_at,
    a.external_calendar_status,
    a.external_calendar_provider,
    a.external_calendar_event_id,
    a.resource_id,
    a.allow_outside_business_hours,
    a.scheduling_override_reason,
    a.status,
    a.notes,
    a.outcome_summary,
    a.client_feedback,
    a.agent_notes,
    a.next_step,
    a.follow_up_date,
    a.created_by,
    a.created_at,
    a.updated_at,
    a.completed_at,
    a.cancelled_at,
    a.cancelled_by,
    a.cancellation_reason
  from public.appointments a
  cross join caller c
  where a.organisation_id = p_organisation_id
    and c.is_member
    and (nullif(p_listing_id, '') is null or a.listing_id = p_listing_id)
    and (p_from is null or a.date_time >= p_from)
    and (p_to is null or a.date_time < p_to)
    and (
      c.is_admin
      or a.agent_id = c.user_id
      or a.created_by = c.user_id
      or exists (
        select 1
        from public.appointment_participants ap
        where ap.appointment_id = a.appointment_id
          and ap.organisation_id = a.organisation_id
          and (
            ap.user_id = c.user_id
            or (
              c.email <> ''
              and lower(coalesce(ap.email, '')) = c.email
              and lower(coalesce(ap.participant_role, '')) in ('agent', 'co-agent', 'principal')
            )
          )
      )
      or exists (
        select 1
        from public.leads l
        where l.lead_id = a.lead_id
          and l.organisation_id = a.organisation_id
          and l.assigned_agent_id = c.user_id
      )
    )
  order by a.date_time asc nulls last, a.created_at desc;
$$;

grant execute on function public.bridge_list_calendar_appointments(uuid, boolean, text, timestamptz, timestamptz) to authenticated;
