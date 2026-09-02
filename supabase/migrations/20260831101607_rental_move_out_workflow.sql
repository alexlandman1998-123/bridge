-- Phase 60: the notice-led move-out checklist. Closure remains a separate,
-- atomic Phase 61 concern; this workflow only makes its blockers explicit.
create table public.rental_move_out_workflows (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  tenancy_id uuid not null unique references public.rental_tenancies(id) on delete restrict,
  notice_id uuid not null references public.rental_notices(id) on delete restrict,
  move_out_on date not null,
  status text not null default 'active' check (status in ('active', 'ready')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.rental_move_out_checklist_items (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.rental_move_out_workflows(id) on delete cascade,
  item_key text not null check (item_key in ('final_balance', 'keys_returned', 'outgoing_inspection')),
  label text not null,
  position smallint not null,
  status text not null default 'pending' check (status in ('pending', 'completed', 'blocked', 'waived')),
  due_on date not null,
  evidence_link text,
  note text,
  completed_by uuid references auth.users(id),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (workflow_id, item_key)
);

create index rental_move_out_workflows_tenancy_idx on public.rental_move_out_workflows (tenancy_id);
create index rental_move_out_checklist_workflow_position_idx on public.rental_move_out_checklist_items (workflow_id, position);

alter table public.rental_move_out_workflows enable row level security;
alter table public.rental_move_out_checklist_items enable row level security;

create policy "rental_move_out_workflows_branch_read"
on public.rental_move_out_workflows for select to authenticated
using (exists (
  select 1 from public.rental_tenancies tenancy
  join public.rental_properties property on property.id = tenancy.property_id
  where tenancy.id = rental_move_out_workflows.tenancy_id
    and public.rental_branch_access(property.organisation_id, property.branch_id)
));

create policy "rental_move_out_checklist_items_branch_read"
on public.rental_move_out_checklist_items for select to authenticated
using (exists (
  select 1 from public.rental_move_out_workflows workflow
  join public.rental_tenancies tenancy on tenancy.id = workflow.tenancy_id
  join public.rental_properties property on property.id = tenancy.property_id
  where workflow.id = rental_move_out_checklist_items.workflow_id
    and public.rental_branch_access(property.organisation_id, property.branch_id)
));

create or replace function public.rental_get_move_out_workflow(p_tenancy_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_workflow public.rental_move_out_workflows%rowtype;
begin
  if auth.uid() is null or not exists (
    select 1 from public.rental_tenancies tenancy join public.rental_properties property on property.id = tenancy.property_id
    where tenancy.id = p_tenancy_id and public.rental_branch_access(property.organisation_id, property.branch_id)
  ) then raise exception 'Not authorized'; end if;
  select * into v_workflow from public.rental_move_out_workflows where tenancy_id = p_tenancy_id;
  if not found then return jsonb_build_object('workflow', null, 'items', '[]'::jsonb, 'blockers', jsonb_build_array('Start the move-out workflow after notice is acknowledged.')); end if;
  return jsonb_build_object(
    'workflow', jsonb_build_object('id', v_workflow.id, 'tenancy_id', v_workflow.tenancy_id, 'notice_id', v_workflow.notice_id, 'move_out_on', v_workflow.move_out_on, 'status', v_workflow.status),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', item.id, 'item_key', item.item_key, 'label', item.label, 'status', item.status, 'due_on', item.due_on, 'evidence_link', item.evidence_link, 'note', item.note) order by item.position) from public.rental_move_out_checklist_items item where item.workflow_id = v_workflow.id), '[]'::jsonb),
    'blockers', coalesce((select jsonb_agg(item.label order by item.position) from public.rental_move_out_checklist_items item where item.workflow_id = v_workflow.id and item.status not in ('completed', 'waived')), '[]'::jsonb)
  );
end $$;

create or replace function public.rental_start_move_out_workflow(p_tenancy_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_tenancy public.rental_tenancies%rowtype; v_notice public.rental_notices%rowtype; v_workflow_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_tenancy from public.rental_tenancies where id = p_tenancy_id for update;
  if not found or not exists (select 1 from public.rental_properties property where property.id = v_tenancy.property_id and public.rental_branch_access(property.organisation_id, property.branch_id)) then raise exception 'Not authorized'; end if;
  select * into v_notice from public.rental_notices where tenancy_id = v_tenancy.id and status = 'acknowledged' order by effective_on asc, acknowledged_at desc limit 1;
  if not found then raise exception 'An acknowledged notice is required before move-out can start'; end if;
  insert into public.rental_move_out_workflows (organisation_id, tenancy_id, notice_id, move_out_on, created_by)
  values (v_tenancy.organisation_id, v_tenancy.id, v_notice.id, v_notice.effective_on, auth.uid())
  on conflict (tenancy_id) do update set updated_at = now()
  returning id into v_workflow_id;
  insert into public.rental_move_out_checklist_items (workflow_id, item_key, label, position, due_on)
  values
    (v_workflow_id, 'final_balance', 'Final balance confirmed', 1, greatest(v_notice.effective_on - 7, current_date)),
    (v_workflow_id, 'keys_returned', 'Keys returned and logged', 2, v_notice.effective_on),
    (v_workflow_id, 'outgoing_inspection', 'Outgoing inspection completed', 3, greatest(v_notice.effective_on - 3, current_date))
  on conflict (workflow_id, item_key) do nothing;
  if v_tenancy.status = 'notice_given' then update public.rental_tenancies set status = 'move_out_pending', updated_at = now() where id = v_tenancy.id; end if;
  return public.rental_get_move_out_workflow(v_tenancy.id);
end $$;

create or replace function public.rental_record_move_out_checklist_item(p_item_id uuid, p_status text, p_evidence_link text default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_item public.rental_move_out_checklist_items%rowtype; v_tenancy_id uuid; v_workflow_id uuid;
begin
  if auth.uid() is null or p_status not in ('completed', 'blocked', 'waived') then raise exception 'Invalid move-out checklist status'; end if;
  select * into v_item from public.rental_move_out_checklist_items where id = p_item_id for update;
  select tenancy_id into v_tenancy_id from public.rental_move_out_workflows where id = v_item.workflow_id;
  if not found or not exists (select 1 from public.rental_tenancies tenancy join public.rental_properties property on property.id = tenancy.property_id where tenancy.id = v_tenancy_id and public.rental_branch_access(property.organisation_id, property.branch_id)) then raise exception 'Not authorized'; end if;
  if p_status = 'completed' and length(btrim(coalesce(p_evidence_link, ''))) = 0 then raise exception 'Completion evidence is required'; end if;
  if p_status in ('blocked', 'waived') and length(btrim(coalesce(p_note, ''))) < 3 then raise exception 'A note is required for blocked or waived items'; end if;
  update public.rental_move_out_checklist_items set status = p_status, evidence_link = nullif(btrim(coalesce(p_evidence_link, '')), ''), note = nullif(btrim(coalesce(p_note, '')), ''), completed_by = case when p_status = 'completed' then auth.uid() else null end, completed_at = case when p_status = 'completed' then now() else null end, updated_at = now() where id = v_item.id returning workflow_id into v_workflow_id;
  update public.rental_move_out_workflows workflow set status = case when not exists (select 1 from public.rental_move_out_checklist_items item where item.workflow_id = workflow.id and item.status not in ('completed', 'waived')) then 'ready' else 'active' end, updated_at = now() where workflow.id = v_workflow_id;
  return public.rental_get_move_out_workflow(v_tenancy_id);
end $$;

create or replace function public.rental_reschedule_move_out_inspection(p_item_id uuid, p_due_on date, p_note text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_item public.rental_move_out_checklist_items%rowtype; v_tenancy_id uuid;
begin
  if auth.uid() is null or p_due_on is null or p_due_on < current_date or length(btrim(coalesce(p_note, ''))) < 3 then raise exception 'A future date and rescheduling note are required'; end if;
  select * into v_item from public.rental_move_out_checklist_items where id = p_item_id for update;
  select tenancy_id into v_tenancy_id from public.rental_move_out_workflows where id = v_item.workflow_id;
  if not found or v_item.item_key <> 'outgoing_inspection' or v_item.status not in ('pending', 'blocked') or not exists (select 1 from public.rental_tenancies tenancy join public.rental_properties property on property.id = tenancy.property_id where tenancy.id = v_tenancy_id and public.rental_branch_access(property.organisation_id, property.branch_id)) then raise exception 'Inspection cannot be rescheduled'; end if;
  update public.rental_move_out_checklist_items set due_on = p_due_on, status = 'pending', note = btrim(p_note), updated_at = now() where id = v_item.id;
  return public.rental_get_move_out_workflow(v_tenancy_id);
end $$;

revoke all on function public.rental_get_move_out_workflow(uuid) from public, anon;
revoke all on function public.rental_start_move_out_workflow(uuid) from public, anon;
revoke all on function public.rental_record_move_out_checklist_item(uuid, text, text, text) from public, anon;
revoke all on function public.rental_reschedule_move_out_inspection(uuid, date, text) from public, anon;
grant execute on function public.rental_get_move_out_workflow(uuid) to authenticated;
grant execute on function public.rental_start_move_out_workflow(uuid) to authenticated;
grant execute on function public.rental_record_move_out_checklist_item(uuid, text, text, text) to authenticated;
grant execute on function public.rental_reschedule_move_out_inspection(uuid, date, text) to authenticated;
