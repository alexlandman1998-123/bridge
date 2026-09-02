-- Phase 50R: compare completed field inspections and turn a specific finding into
-- one traceable maintenance request. The link table is the idempotency boundary.

create table if not exists public.rental_inspection_item_maintenance_links (
  inspection_item_id uuid primary key references public.rental_field_inspection_items(id) on delete cascade,
  maintenance_request_id uuid not null unique references public.rental_maintenance_requests(id) on delete restrict,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.rental_inspection_item_maintenance_links enable row level security;

create index if not exists rental_field_inspections_comparison_idx
  on public.rental_field_inspections (property_id, unit_id, inspection_type, completed_at desc)
  where status = 'completed';

create or replace function public.rental_get_inspection_follow_up(p_inspection_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.rental_field_inspections%rowtype;
  v_previous_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into v_current
  from public.rental_field_inspections
  where id = p_inspection_id;

  if not found or not exists (
    select 1
    from public.rental_properties p
    where p.id = v_current.property_id
      and public.rental_branch_access(p.organisation_id, p.branch_id)
  ) then
    raise exception 'Not authorized';
  end if;

  select previous.id into v_previous_id
  from public.rental_field_inspections previous
  where previous.property_id = v_current.property_id
    and previous.unit_id is not distinct from v_current.unit_id
    and previous.inspection_type = v_current.inspection_type
    and previous.status = 'completed'
    and previous.id <> v_current.id
    and previous.completed_at < coalesce(v_current.completed_at, now())
  order by previous.completed_at desc
  limit 1;

  return jsonb_build_object(
    'inspection', jsonb_build_object(
      'id', v_current.id,
      'inspection_type', v_current.inspection_type,
      'status', v_current.status,
      'completed_at', v_current.completed_at,
      'previous_inspection_id', v_previous_id
    ),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', current_item.id,
        'item_key', current_item.item_key,
        'item_label', current_item.item_label,
        'status', current_item.status,
        'note', current_item.note,
        'evidence_link', current_item.evidence_link,
        'previous_status', previous_item.status,
        'previous_note', previous_item.note,
        'condition_changed', previous_item.id is not null and (
          current_item.status is distinct from previous_item.status
          or coalesce(current_item.note, '') is distinct from coalesce(previous_item.note, '')
        ),
        'maintenance_request_id', link.maintenance_request_id,
        'can_create_maintenance', current_item.status = 'attention' and link.inspection_item_id is null
      ) order by current_item.item_label, current_item.id)
      from public.rental_field_inspection_items current_item
      left join public.rental_field_inspection_items previous_item
        on previous_item.inspection_id = v_previous_id
       and previous_item.item_key = current_item.item_key
      left join public.rental_inspection_item_maintenance_links link
        on link.inspection_item_id = current_item.id
      where current_item.inspection_id = v_current.id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.rental_create_inspection_maintenance_request(
  p_inspection_item_id uuid,
  p_category text,
  p_priority text,
  p_description text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.rental_field_inspection_items%rowtype;
  v_inspection public.rental_field_inspections%rowtype;
  v_request_id uuid;
begin
  if auth.uid() is null
    or p_category not in ('plumbing', 'electrical', 'appliance', 'security', 'structural', 'pest', 'cleaning', 'other')
    or p_priority not in ('emergency', 'urgent', 'routine')
    or length(btrim(coalesce(p_description, ''))) < 10 then
    raise exception 'Invalid maintenance request';
  end if;

  select * into v_item
  from public.rental_field_inspection_items
  where id = p_inspection_item_id;

  select * into v_inspection
  from public.rental_field_inspections
  where id = v_item.inspection_id;

  if not found or v_item.status <> 'attention' or not exists (
    select 1
    from public.rental_properties p
    where p.id = v_inspection.property_id
      and public.rental_branch_access(p.organisation_id, p.branch_id)
  ) then
    raise exception 'Not authorized or finding is not actionable';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(hashtextextended(v_item.id::text, 50));

  select maintenance_request_id into v_request_id
  from public.rental_inspection_item_maintenance_links
  where inspection_item_id = v_item.id;

  if v_request_id is not null then
    return jsonb_build_object('request_id', v_request_id, 'created', false);
  end if;

  insert into public.rental_maintenance_requests (
    organisation_id, property_id, unit_id, tenancy_id, category, priority,
    description, reported_by, duplicate_key
  ) values (
    v_inspection.organisation_id, v_inspection.property_id, v_inspection.unit_id,
    v_inspection.tenancy_id, p_category, p_priority, btrim(p_description), auth.uid(),
    'inspection-item:' || v_item.id::text
  ) returning id into v_request_id;

  insert into public.rental_inspection_item_maintenance_links (
    inspection_item_id, maintenance_request_id, created_by
  ) values (v_item.id, v_request_id, auth.uid());

  return jsonb_build_object('request_id', v_request_id, 'created', true);
end;
$$;

revoke all on function public.rental_get_inspection_follow_up(uuid) from public, anon;
revoke all on function public.rental_create_inspection_maintenance_request(uuid, text, text, text) from public, anon;
grant execute on function public.rental_get_inspection_follow_up(uuid) to authenticated;
grant execute on function public.rental_create_inspection_maintenance_request(uuid, text, text, text) to authenticated;
