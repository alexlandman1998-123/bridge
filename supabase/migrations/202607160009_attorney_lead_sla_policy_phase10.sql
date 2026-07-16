begin;

create table if not exists public.attorney_lead_sla_settings (
  organisation_id uuid primary key references public.organisations(id) on delete cascade,
  attorney_firm_id uuid not null,
  reminders_enabled boolean not null default true,
  first_contact_sla_hours integer not null default 24,
  follow_up_grace_minutes integer not null default 15,
  escalation_enabled boolean not null default false,
  escalation_after_hours integer not null default 4,
  escalation_user_id uuid references auth.users(id) on delete set null,
  timezone_name text not null default 'Africa/Johannesburg',
  business_days smallint[] not null default array[1,2,3,4,5]::smallint[],
  business_hours_start time not null default '08:00',
  business_hours_end time not null default '17:00',
  quiet_hours_enabled boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attorney_lead_sla_settings_firm_org_fkey
    foreign key (attorney_firm_id, organisation_id)
    references public.attorney_firms(id, organisation_id)
    on delete cascade,
  constraint attorney_lead_sla_first_contact_check
    check (first_contact_sla_hours between 1 and 168),
  constraint attorney_lead_sla_follow_up_grace_check
    check (follow_up_grace_minutes between 0 and 1440),
  constraint attorney_lead_sla_escalation_check
    check (escalation_after_hours between 1 and 168),
  constraint attorney_lead_sla_timezone_check
    check (char_length(timezone_name) between 1 and 100),
  constraint attorney_lead_sla_business_days_check
    check (
      cardinality(business_days) between 1 and 7
      and business_days <@ array[1,2,3,4,5,6,7]::smallint[]
    ),
  constraint attorney_lead_sla_business_hours_check
    check (business_hours_start < business_hours_end)
);

insert into public.attorney_lead_sla_settings (organisation_id, attorney_firm_id)
select firm.organisation_id, firm.id
from public.attorney_firms firm
join public.organisations organisation
  on organisation.id = firm.organisation_id
 and organisation.type = 'attorney_firm'
where firm.is_active = true
on conflict (organisation_id) do nothing;

create index if not exists attorney_lead_sla_settings_escalation_user_idx
  on public.attorney_lead_sla_settings (escalation_user_id)
  where escalation_user_id is not null;

create or replace function public.bridge_touch_attorney_lead_sla_settings()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_attorney_lead_sla_settings_updated_at on public.attorney_lead_sla_settings;
create trigger trg_attorney_lead_sla_settings_updated_at
before update on public.attorney_lead_sla_settings
for each row execute function public.bridge_touch_attorney_lead_sla_settings();

alter table public.attorney_lead_sla_settings enable row level security;

drop policy if exists attorney_lead_sla_settings_select on public.attorney_lead_sla_settings;
create policy attorney_lead_sla_settings_select
on public.attorney_lead_sla_settings
for select to authenticated
using (public.bridge_attorney_lead_can_access(organisation_id, null, null, 'view_link'));

revoke all on table public.attorney_lead_sla_settings from public, anon, authenticated;
grant select on table public.attorney_lead_sla_settings to authenticated;

create or replace function public.bridge_get_attorney_lead_sla_settings(p_organisation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_settings public.attorney_lead_sla_settings%rowtype;
begin
  if not public.bridge_attorney_lead_can_access(p_organisation_id, null, null, 'view_link') then
    raise exception 'Not authorised to view Attorney Lead SLA settings';
  end if;

  select settings.* into v_settings
  from public.attorney_lead_sla_settings settings
  where settings.organisation_id = p_organisation_id;

  return jsonb_build_object(
    'reminders_enabled', coalesce(v_settings.reminders_enabled, true),
    'first_contact_sla_hours', coalesce(v_settings.first_contact_sla_hours, 24),
    'follow_up_grace_minutes', coalesce(v_settings.follow_up_grace_minutes, 15),
    'escalation_enabled', coalesce(v_settings.escalation_enabled, false),
    'escalation_after_hours', coalesce(v_settings.escalation_after_hours, 4),
    'escalation_user_id', v_settings.escalation_user_id,
    'timezone_name', coalesce(v_settings.timezone_name, 'Africa/Johannesburg'),
    'business_days', to_jsonb(coalesce(v_settings.business_days, array[1,2,3,4,5]::smallint[])),
    'business_hours_start', to_char(coalesce(v_settings.business_hours_start, '08:00'::time), 'HH24:MI'),
    'business_hours_end', to_char(coalesce(v_settings.business_hours_end, '17:00'::time), 'HH24:MI'),
    'quiet_hours_enabled', coalesce(v_settings.quiet_hours_enabled, true),
    'updated_at', v_settings.updated_at
  );
end;
$$;

revoke all on function public.bridge_get_attorney_lead_sla_settings(uuid) from public, anon;
grant execute on function public.bridge_get_attorney_lead_sla_settings(uuid) to authenticated;

create or replace function public.bridge_update_attorney_lead_sla_settings(
  p_organisation_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_firm_id uuid;
  v_first_contact_hours integer;
  v_follow_up_grace integer;
  v_escalation_hours integer;
  v_escalation_user uuid;
  v_timezone text;
  v_business_days smallint[];
  v_start time;
  v_end time;
begin
  if not public.bridge_attorney_lead_can_access(p_organisation_id, null, null, 'manage_link') then
    raise exception 'Not authorised to manage Attorney Lead SLA settings';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > 8192 then
    raise exception 'Invalid Attorney Lead SLA settings payload';
  end if;

  select firm.id into v_firm_id
  from public.attorney_firms firm
  where firm.organisation_id = p_organisation_id
    and firm.is_active = true
  order by firm.created_at asc
  limit 1;
  if v_firm_id is null then
    raise exception 'Active Attorney firm not found';
  end if;

  v_first_contact_hours := coalesce((p_payload ->> 'first_contact_sla_hours')::integer, 24);
  v_follow_up_grace := coalesce((p_payload ->> 'follow_up_grace_minutes')::integer, 15);
  v_escalation_hours := coalesce((p_payload ->> 'escalation_after_hours')::integer, 4);
  v_escalation_user := nullif(p_payload ->> 'escalation_user_id', '')::uuid;
  v_timezone := coalesce(nullif(trim(p_payload ->> 'timezone_name'), ''), 'Africa/Johannesburg');
  v_start := coalesce(nullif(p_payload ->> 'business_hours_start', '')::time, '08:00'::time);
  v_end := coalesce(nullif(p_payload ->> 'business_hours_end', '')::time, '17:00'::time);

  select array_agg(day_value::smallint order by day_value::integer)
  into v_business_days
  from (
    select distinct value::integer as day_value
    from jsonb_array_elements_text(
      coalesce(p_payload -> 'business_days', '[1,2,3,4,5]'::jsonb)
    )
  ) days;

  if v_first_contact_hours not between 1 and 168
     or v_follow_up_grace not between 0 and 1440
     or v_escalation_hours not between 1 and 168 then
    raise exception 'Attorney Lead SLA values are outside the supported range';
  end if;
  if cardinality(v_business_days) not between 1 and 7
     or not (v_business_days <@ array[1,2,3,4,5,6,7]::smallint[]) then
    raise exception 'Choose valid Attorney Lead business days';
  end if;
  if v_start >= v_end then
    raise exception 'Business hours must end after they start';
  end if;
  if not exists (select 1 from pg_timezone_names zone where zone.name = v_timezone) then
    raise exception 'Choose a valid timezone';
  end if;

  if v_escalation_user is not null and not exists (
    select 1
    from public.organisation_users member
    where member.organisation_id = p_organisation_id
      and member.user_id = v_escalation_user
      and lower(trim(coalesce(member.membership_status, member.status, ''))) in ('active', 'accepted')
      and lower(trim(coalesce(
        nullif(trim(member.organisation_role), ''),
        nullif(trim(member.workspace_role), ''),
        nullif(trim(member.role), ''),
        nullif(trim(member.app_role), ''),
        'viewer'
      ))) in ('owner', 'principal', 'partner', 'director', 'firm_admin', 'director_partner', 'branch_manager')
    union all
    select 1
    from public.attorney_firm_members member
    where member.firm_id = v_firm_id
      and member.user_id = v_escalation_user
      and member.status = 'active'
      and member.role in ('firm_admin', 'director_partner')
  ) then
    raise exception 'Escalation recipient must be active Attorney firm leadership';
  end if;

  insert into public.attorney_lead_sla_settings (
    organisation_id,
    attorney_firm_id,
    reminders_enabled,
    first_contact_sla_hours,
    follow_up_grace_minutes,
    escalation_enabled,
    escalation_after_hours,
    escalation_user_id,
    timezone_name,
    business_days,
    business_hours_start,
    business_hours_end,
    quiet_hours_enabled,
    updated_by
  ) values (
    p_organisation_id,
    v_firm_id,
    coalesce((p_payload ->> 'reminders_enabled')::boolean, true),
    v_first_contact_hours,
    v_follow_up_grace,
    coalesce((p_payload ->> 'escalation_enabled')::boolean, false),
    v_escalation_hours,
    v_escalation_user,
    v_timezone,
    v_business_days,
    v_start,
    v_end,
    coalesce((p_payload ->> 'quiet_hours_enabled')::boolean, true),
    auth.uid()
  )
  on conflict (organisation_id) do update
  set attorney_firm_id = excluded.attorney_firm_id,
      reminders_enabled = excluded.reminders_enabled,
      first_contact_sla_hours = excluded.first_contact_sla_hours,
      follow_up_grace_minutes = excluded.follow_up_grace_minutes,
      escalation_enabled = excluded.escalation_enabled,
      escalation_after_hours = excluded.escalation_after_hours,
      escalation_user_id = excluded.escalation_user_id,
      timezone_name = excluded.timezone_name,
      business_days = excluded.business_days,
      business_hours_start = excluded.business_hours_start,
      business_hours_end = excluded.business_hours_end,
      quiet_hours_enabled = excluded.quiet_hours_enabled,
      updated_by = auth.uid()
  where row(
    public.attorney_lead_sla_settings.attorney_firm_id,
    public.attorney_lead_sla_settings.reminders_enabled,
    public.attorney_lead_sla_settings.first_contact_sla_hours,
    public.attorney_lead_sla_settings.follow_up_grace_minutes,
    public.attorney_lead_sla_settings.escalation_enabled,
    public.attorney_lead_sla_settings.escalation_after_hours,
    public.attorney_lead_sla_settings.escalation_user_id,
    public.attorney_lead_sla_settings.timezone_name,
    public.attorney_lead_sla_settings.business_days,
    public.attorney_lead_sla_settings.business_hours_start,
    public.attorney_lead_sla_settings.business_hours_end,
    public.attorney_lead_sla_settings.quiet_hours_enabled
  ) is distinct from row(
    excluded.attorney_firm_id,
    excluded.reminders_enabled,
    excluded.first_contact_sla_hours,
    excluded.follow_up_grace_minutes,
    excluded.escalation_enabled,
    excluded.escalation_after_hours,
    excluded.escalation_user_id,
    excluded.timezone_name,
    excluded.business_days,
    excluded.business_hours_start,
    excluded.business_hours_end,
    excluded.quiet_hours_enabled
  );

  return public.bridge_get_attorney_lead_sla_settings(p_organisation_id);
exception
  when invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow then
    raise exception 'Invalid Attorney Lead SLA settings value';
end;
$$;

revoke all on function public.bridge_update_attorney_lead_sla_settings(uuid, jsonb) from public, anon;
grant execute on function public.bridge_update_attorney_lead_sla_settings(uuid, jsonb) to authenticated;

insert into public.notification_automation_definitions (
  automation_key, display_name, category, trigger_type, recipient_role, channels,
  implementation_status, default_enabled, dedupe_strategy, reminder_policy, metadata_json
) values (
  'attorney_lead_first_contact_escalated',
  'Attorney Lead first contact escalated',
  'reminder',
  'scheduled_reminder',
  'attorney',
  array['in_app']::text[],
  'active',
  true,
  'lead_escalation_policy_version',
  '{"cadence":"once_per_lead_policy"}'::jsonb,
  '{"domain":"attorney_lead","phase":"phase_10"}'::jsonb
)
on conflict (automation_key) do update
set implementation_status = 'active', default_enabled = true, updated_at = now();

create or replace function public.bridge_queue_attorney_lead_follow_up_reminders(
  p_limit integer default 100,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate record;
  v_result jsonb;
  v_scanned integer := 0;
  v_emitted integer := 0;
  v_skipped integer := 0;
begin
  if p_limit < 1 or p_limit > 500 then
    raise exception 'Reminder sweep limit must be between 1 and 500';
  end if;

  for candidate in
    with configured_leads as (
      select
        lead.*,
        coalesce(settings.reminders_enabled, true) as reminders_enabled,
        coalesce(settings.first_contact_sla_hours, 24) as first_contact_sla_hours,
        coalesce(settings.follow_up_grace_minutes, 15) as follow_up_grace_minutes,
        coalesce(settings.escalation_enabled, false) as escalation_enabled,
        coalesce(settings.escalation_after_hours, 4) as escalation_after_hours,
        settings.escalation_user_id,
        coalesce(settings.timezone_name, 'Africa/Johannesburg') as timezone_name,
        coalesce(settings.business_days, array[1,2,3,4,5]::smallint[]) as business_days,
        coalesce(settings.business_hours_start, '08:00'::time) as business_hours_start,
        coalesce(settings.business_hours_end, '17:00'::time) as business_hours_end,
        coalesce(settings.quiet_hours_enabled, true) as quiet_hours_enabled,
        coalesce(settings.updated_at, '1970-01-01 00:00:00+00'::timestamptz) as policy_updated_at
      from public.leads lead
      left join public.attorney_lead_sla_settings settings
        on settings.organisation_id = lead.organisation_id
      where lead.lead_domain = 'attorney'
        and lead.status = 'open'
    ),
    eligible_leads as (
      select configured.*
      from configured_leads configured
      where configured.reminders_enabled = true
        and (
          configured.quiet_hours_enabled = false
          or (
            extract(isodow from p_now at time zone configured.timezone_name)::smallint = any(configured.business_days)
            and (p_now at time zone configured.timezone_name)::time >= configured.business_hours_start
            and (p_now at time zone configured.timezone_name)::time < configured.business_hours_end
          )
        )
    ),
    due_candidates as (
      select
        lead.organisation_id,
        lead.lead_id,
        lead.assigned_user_id as preferred_user_id,
        'attorney_lead_follow_up_due'::text as automation_key,
        'Attorney Lead follow-up due'::text as title,
        'A scheduled Lead follow-up is due. Open the Lead to record the outcome.'::text as message,
        'attorney_lead_follow_up_due:' || lead.lead_id::text || ':' ||
          extract(epoch from lead.next_follow_up_at)::bigint::text as dedupe_key,
        lead.next_follow_up_at + make_interval(mins => lead.follow_up_grace_minutes) as due_at
      from eligible_leads lead
      where lead.next_follow_up_at is not null
        and lead.next_follow_up_at + make_interval(mins => lead.follow_up_grace_minutes) <= p_now
      union all
      select
        lead.organisation_id,
        lead.lead_id,
        lead.assigned_user_id,
        'attorney_lead_first_contact_overdue',
        'Attorney Lead awaiting first contact',
        format('This new Lead has exceeded the firm''s %s-hour first-contact SLA.', lead.first_contact_sla_hours),
        'attorney_lead_first_contact_overdue:' || lead.lead_id::text || ':' ||
          extract(epoch from lead.policy_updated_at)::bigint::text,
        lead.created_at + make_interval(hours => lead.first_contact_sla_hours)
      from eligible_leads lead
      where lead.stage = 'new'
        and lead.first_contacted_at is null
        and lead.created_at + make_interval(hours => lead.first_contact_sla_hours) <= p_now
      union all
      select
        lead.organisation_id,
        lead.lead_id,
        lead.escalation_user_id,
        'attorney_lead_first_contact_escalated',
        'Attorney Lead SLA escalation',
        'A new Lead remains uncontacted beyond the firm escalation threshold.',
        'attorney_lead_first_contact_escalated:' || lead.lead_id::text || ':' ||
          extract(epoch from lead.policy_updated_at)::bigint::text,
        lead.created_at + make_interval(hours => lead.first_contact_sla_hours + lead.escalation_after_hours)
      from eligible_leads lead
      where lead.escalation_enabled = true
        and lead.stage = 'new'
        and lead.first_contacted_at is null
        and lead.created_at + make_interval(hours => lead.first_contact_sla_hours + lead.escalation_after_hours) <= p_now
    )
    select due.*
    from due_candidates due
    where not exists (
      select 1 from public.notification_events event
      where event.organisation_id = due.organisation_id
        and event.dedupe_key = due.dedupe_key
    )
    order by due.due_at asc
    limit p_limit
  loop
    v_scanned := v_scanned + 1;
    v_result := public.bridge_emit_attorney_lead_notification(
      candidate.organisation_id,
      candidate.lead_id,
      candidate.preferred_user_id,
      candidate.automation_key,
      candidate.title,
      candidate.message,
      candidate.dedupe_key,
      'attorney_lead_sla_policy_sweep'
    );
    if coalesce((v_result ->> 'emitted')::boolean, false) then
      v_emitted := v_emitted + 1;
    else
      v_skipped := v_skipped + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'success', true,
    'checked_at', p_now,
    'scanned', v_scanned,
    'emitted', v_emitted,
    'skipped', v_skipped,
    'policy_version', 'attorney_lead_sla_v1'
  );
end;
$$;

revoke all on function public.bridge_queue_attorney_lead_follow_up_reminders(integer, timestamptz) from public, anon, authenticated;
grant execute on function public.bridge_queue_attorney_lead_follow_up_reminders(integer, timestamptz) to service_role;

comment on table public.attorney_lead_sla_settings is
  'One tenant-owned Attorney Lead SLA, business-hours, quiet-hours, and escalation policy.';

commit;
