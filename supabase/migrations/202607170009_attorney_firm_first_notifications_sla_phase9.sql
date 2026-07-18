begin;

create table if not exists public.attorney_firm_allocation_alerts (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.transaction_attorney_assignments(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  attorney_firm_id uuid references public.attorney_firms(id) on delete cascade,
  organisation_id uuid references public.organisations(id) on delete cascade,
  alert_type text not null,
  severity text not null default 'info',
  status text not null default 'open',
  due_at timestamptz,
  triggered_at timestamptz not null default now(),
  dedupe_key text not null unique,
  payload_json jsonb not null default '{}'::jsonb,
  acknowledged_at timestamptz,
  acknowledged_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attorney_firm_allocation_alerts_type_check check (
    alert_type in (
      'firm_nomination_received',
      'firm_acceptance_overdue',
      'internal_assignment_required',
      'internal_assignment_overdue',
      'activation_ready',
      'replacement_firm_required'
    )
  ),
  constraint attorney_firm_allocation_alerts_severity_check check (severity in ('info', 'warning', 'critical')),
  constraint attorney_firm_allocation_alerts_status_check check (status in ('open', 'acknowledged', 'resolved', 'dismissed'))
);

create index if not exists attorney_firm_allocation_alerts_firm_queue_idx
  on public.attorney_firm_allocation_alerts (attorney_firm_id, status, severity, due_at, created_at desc);
create index if not exists attorney_firm_allocation_alerts_org_queue_idx
  on public.attorney_firm_allocation_alerts (organisation_id, status, severity, due_at, created_at desc);
create index if not exists attorney_firm_allocation_alerts_assignment_idx
  on public.attorney_firm_allocation_alerts (assignment_id, status, created_at desc);

alter table public.attorney_firm_allocation_alerts enable row level security;

drop policy if exists attorney_firm_allocation_alerts_select_phase9 on public.attorney_firm_allocation_alerts;
create policy attorney_firm_allocation_alerts_select_phase9
on public.attorney_firm_allocation_alerts
for select to authenticated
using (
  public.attorney_user_is_firm_lead(attorney_firm_id)
  or public.bridge_is_org_admin(organisation_id)
  or exists (
    select 1 from public.transactions tx
    where tx.id = attorney_firm_allocation_alerts.transaction_id
      and tx.owner_user_id = auth.uid()
  )
);

drop policy if exists attorney_firm_allocation_alerts_update_phase9 on public.attorney_firm_allocation_alerts;
create policy attorney_firm_allocation_alerts_update_phase9
on public.attorney_firm_allocation_alerts
for update to authenticated
using (
  public.attorney_user_is_firm_lead(attorney_firm_id)
  or public.bridge_is_org_admin(organisation_id)
  or exists (
    select 1 from public.transactions tx
    where tx.id = attorney_firm_allocation_alerts.transaction_id
      and tx.owner_user_id = auth.uid()
  )
)
with check (
  public.attorney_user_is_firm_lead(attorney_firm_id)
  or public.bridge_is_org_admin(organisation_id)
  or exists (
    select 1 from public.transactions tx
    where tx.id = attorney_firm_allocation_alerts.transaction_id
      and tx.owner_user_id = auth.uid()
  )
);

grant select on public.attorney_firm_allocation_alerts to authenticated;
revoke update on public.attorney_firm_allocation_alerts from authenticated;
grant all on public.attorney_firm_allocation_alerts to service_role;

create or replace function public.bridge_enqueue_transfer_firm_alert(
  p_assignment public.transaction_attorney_assignments,
  p_alert_type text,
  p_severity text,
  p_due_at timestamptz,
  p_state_timestamp timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_organisation_id uuid;
  v_firm_id uuid := coalesce(p_assignment.attorney_firm_id, p_assignment.firm_id);
  v_dedupe_key text;
begin
  select tx.organisation_id into v_organisation_id
  from public.transactions tx where tx.id = p_assignment.transaction_id;

  v_dedupe_key := concat_ws(':',
    'transfer_firm_allocation', p_assignment.id::text, p_alert_type,
    extract(epoch from coalesce(p_state_timestamp, p_assignment.updated_at, now()))::bigint::text
  );

  insert into public.attorney_firm_allocation_alerts (
    assignment_id, transaction_id, attorney_firm_id, organisation_id,
    alert_type, severity, due_at, dedupe_key, payload_json
  ) values (
    p_assignment.id, p_assignment.transaction_id, v_firm_id, v_organisation_id,
    p_alert_type, p_severity, p_due_at, v_dedupe_key,
    jsonb_build_object(
      'allocationState', p_assignment.allocation_state,
      'firmAcceptanceStatus', p_assignment.firm_acceptance_status,
      'staffAssignmentStatus', p_assignment.staff_assignment_status,
      'replacementSequence', p_assignment.replacement_sequence,
      'actionRoute', '/transactions/' || p_assignment.transaction_id::text,
      'notificationDomain', 'attorney_firm_allocation',
      'phase', 'phase_9'
    )
  )
  on conflict (dedupe_key) do nothing;
end;
$$;

revoke all on function public.bridge_enqueue_transfer_firm_alert(public.transaction_attorney_assignments, text, text, timestamptz, timestamptz) from public, anon, authenticated;

create or replace function public.bridge_sync_transfer_firm_allocation_alerts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_changed_at timestamptz := coalesce(new.allocation_state_changed_at, new.updated_at, now());
  v_state_changed boolean := false;
begin
  if coalesce(new.attorney_role, '') <> 'transfer_attorney'
     and coalesce(new.assignment_type, '') not in ('transfer', 'transfer_and_bond') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    v_state_changed := true;
  else
    v_state_changed := new.allocation_state is distinct from old.allocation_state;
  end if;

  if v_state_changed then
    update public.attorney_firm_allocation_alerts
    set status = 'resolved', resolved_at = now(), updated_at = now()
    where assignment_id = new.id and status in ('open', 'acknowledged');

    if new.allocation_state = 'awaiting_firm_acceptance' then
      perform public.bridge_enqueue_transfer_firm_alert(new, 'firm_nomination_received', 'info', v_changed_at + interval '48 hours', v_changed_at);
    elsif new.allocation_state = 'awaiting_staff_assignment' then
      perform public.bridge_enqueue_transfer_firm_alert(new, 'internal_assignment_required', 'warning', v_changed_at + interval '24 hours', v_changed_at);
    elsif new.allocation_state = 'staff_assigned' then
      perform public.bridge_enqueue_transfer_firm_alert(new, 'activation_ready', 'info', null, v_changed_at);
    elsif new.allocation_state = 'declined' then
      perform public.bridge_enqueue_transfer_firm_alert(new, 'replacement_firm_required', 'critical', null, v_changed_at);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_transfer_firm_allocation_alerts on public.transaction_attorney_assignments;
create trigger trg_sync_transfer_firm_allocation_alerts
after insert or update of allocation_state
on public.transaction_attorney_assignments
for each row execute function public.bridge_sync_transfer_firm_allocation_alerts();

create or replace function public.bridge_refresh_transfer_firm_allocation_sla_alerts()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment public.transaction_attorney_assignments;
  v_acceptance_count integer := 0;
  v_assignment_count integer := 0;
begin
  for v_assignment in
    select assignment.* from public.transaction_attorney_assignments assignment
    where assignment.allocation_state = 'awaiting_firm_acceptance'
      and coalesce(assignment.allocation_state_changed_at, assignment.updated_at) <= now() - interval '48 hours'
  loop
    perform public.bridge_enqueue_transfer_firm_alert(
      v_assignment, 'firm_acceptance_overdue', 'critical', now(),
      coalesce(v_assignment.allocation_state_changed_at, v_assignment.updated_at)
    );
    v_acceptance_count := v_acceptance_count + 1;
  end loop;

  for v_assignment in
    select assignment.* from public.transaction_attorney_assignments assignment
    where assignment.allocation_state = 'awaiting_staff_assignment'
      and coalesce(assignment.allocation_state_changed_at, assignment.updated_at) <= now() - interval '24 hours'
  loop
    perform public.bridge_enqueue_transfer_firm_alert(
      v_assignment, 'internal_assignment_overdue', 'critical', now(),
      coalesce(v_assignment.allocation_state_changed_at, v_assignment.updated_at)
    );
    v_assignment_count := v_assignment_count + 1;
  end loop;

  return jsonb_build_object(
    'refreshedAt', now(),
    'acceptanceOverdueCandidates', v_acceptance_count,
    'internalAssignmentOverdueCandidates', v_assignment_count
  );
end;
$$;

revoke all on function public.bridge_refresh_transfer_firm_allocation_sla_alerts() from public, anon, authenticated;
grant execute on function public.bridge_refresh_transfer_firm_allocation_sla_alerts() to service_role;

-- Seed the durable outbox for allocations already in progress when Phase 9 is
-- deployed. The dedupe key makes this block safe to replay.
do $$
declare
  v_assignment public.transaction_attorney_assignments;
  v_changed_at timestamptz;
begin
  for v_assignment in
    select assignment.*
    from public.transaction_attorney_assignments assignment
    where assignment.allocation_state in (
      'awaiting_firm_acceptance', 'awaiting_staff_assignment', 'staff_assigned', 'declined'
    )
  loop
    v_changed_at := coalesce(v_assignment.allocation_state_changed_at, v_assignment.updated_at, now());
    if v_assignment.allocation_state = 'awaiting_firm_acceptance' then
      perform public.bridge_enqueue_transfer_firm_alert(v_assignment, 'firm_nomination_received', 'info', v_changed_at + interval '48 hours', v_changed_at);
    elsif v_assignment.allocation_state = 'awaiting_staff_assignment' then
      perform public.bridge_enqueue_transfer_firm_alert(v_assignment, 'internal_assignment_required', 'warning', v_changed_at + interval '24 hours', v_changed_at);
    elsif v_assignment.allocation_state = 'staff_assigned' then
      perform public.bridge_enqueue_transfer_firm_alert(v_assignment, 'activation_ready', 'info', null, v_changed_at);
    elsif v_assignment.allocation_state = 'declined' then
      perform public.bridge_enqueue_transfer_firm_alert(v_assignment, 'replacement_firm_required', 'critical', null, v_changed_at);
    end if;
  end loop;

  perform public.bridge_refresh_transfer_firm_allocation_sla_alerts();
end;
$$;

create or replace function public.bridge_acknowledge_transfer_firm_alert(p_alert_id uuid)
returns public.attorney_firm_allocation_alerts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alert public.attorney_firm_allocation_alerts;
begin
  select * into v_alert
  from public.attorney_firm_allocation_alerts
  where id = p_alert_id
  for update;

  if v_alert.id is null then
    raise exception 'Firm allocation alert was not found.' using errcode = 'P0002';
  end if;
  if not (
    public.attorney_user_is_firm_lead(v_alert.attorney_firm_id)
    or public.bridge_is_org_admin(v_alert.organisation_id)
    or exists (
      select 1 from public.transactions tx
      where tx.id = v_alert.transaction_id and tx.owner_user_id = auth.uid()
    )
  ) then
    raise exception 'You do not have permission to acknowledge this alert.' using errcode = '42501';
  end if;

  if v_alert.status = 'open' then
    update public.attorney_firm_allocation_alerts
    set status = 'acknowledged', acknowledged_at = now(), acknowledged_by = auth.uid(), updated_at = now()
    where id = p_alert_id
    returning * into v_alert;
  end if;

  return v_alert;
end;
$$;

revoke all on function public.bridge_acknowledge_transfer_firm_alert(uuid) from public, anon;
grant execute on function public.bridge_acknowledge_transfer_firm_alert(uuid) to authenticated;

create or replace view public.attorney_firm_allocation_alert_queue_v1
with (security_invoker = true)
as
select
  alert.id,
  alert.assignment_id,
  alert.transaction_id,
  alert.attorney_firm_id,
  alert.organisation_id,
  alert.alert_type,
  alert.severity,
  alert.status,
  alert.due_at,
  alert.triggered_at,
  alert.payload_json,
  alert.acknowledged_at,
  alert.acknowledged_by,
  alert.created_at,
  alert.updated_at,
  tx.transaction_reference,
  assignment.allocation_state,
  assignment.firm_acceptance_status,
  assignment.staff_assignment_status,
  assignment.replacement_sequence
from public.attorney_firm_allocation_alerts alert
join public.transactions tx on tx.id = alert.transaction_id
join public.transaction_attorney_assignments assignment on assignment.id = alert.assignment_id;

grant select on public.attorney_firm_allocation_alert_queue_v1 to authenticated;

comment on table public.attorney_firm_allocation_alerts is
  'Phase 9 durable, deduplicated firm-first lifecycle alert outbox. External delivery is handled separately.';
comment on function public.bridge_refresh_transfer_firm_allocation_sla_alerts() is
  'Service-role scheduled refresh for 48-hour firm acceptance and 24-hour internal assignment SLA alerts.';

commit;
