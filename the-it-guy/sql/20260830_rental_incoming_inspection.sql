begin;

create table if not exists public.rental_incoming_inspections (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null unique references public.rental_tenancies(id) on delete cascade,
  lease_id uuid not null references public.rental_leases(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'in_progress', 'completed', 'cancelled')),
  scheduled_for timestamptz,
  completed_at timestamptz,
  acknowledged_by_name text,
  acknowledged_at timestamptz,
  handover_notes text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists rental_incoming_inspections_org_status_idx on public.rental_incoming_inspections(organisation_id, status, scheduled_for);

create table if not exists public.rental_incoming_inspection_items (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.rental_incoming_inspections(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  item_key text not null check (item_key in ('condition_report', 'photo_evidence', 'meter_readings', 'keys_handover', 'occupation_acknowledgement')),
  status text not null default 'required' check (status in ('required', 'completed', 'waived')),
  note text,
  evidence_link text,
  completed_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  unique(inspection_id, item_key)
);

create table if not exists public.rental_incoming_inspection_media (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.rental_incoming_inspections(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  media_link text not null check (length(btrim(media_link)) > 0),
  caption text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(inspection_id, media_link)
);

create table if not exists public.rental_incoming_inspection_events (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.rental_incoming_inspections(id) on delete cascade,
  tenancy_id uuid not null references public.rental_tenancies(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  event_type text not null check (event_type in ('inspection_started', 'item_completed', 'media_linked', 'inspection_completed')),
  evidence_json jsonb not null default '{}'::jsonb,
  occurred_by uuid not null references auth.users(id) on delete restrict,
  occurred_at timestamptz not null default now()
);

alter table public.rental_incoming_inspections enable row level security;
alter table public.rental_incoming_inspection_items enable row level security;
alter table public.rental_incoming_inspection_media enable row level security;
alter table public.rental_incoming_inspection_events enable row level security;
revoke all on public.rental_incoming_inspections, public.rental_incoming_inspection_items, public.rental_incoming_inspection_media, public.rental_incoming_inspection_events from anon, authenticated;
grant select on public.rental_incoming_inspections, public.rental_incoming_inspection_items, public.rental_incoming_inspection_media, public.rental_incoming_inspection_events to authenticated;
create policy rental_incoming_inspections_staff_read on public.rental_incoming_inspections for select to authenticated using (exists (select 1 from public.rental_tenancies tenancy join public.rental_properties property on property.id = tenancy.property_id where tenancy.id = tenancy_id and public.rental_branch_access(property.organisation_id, property.branch_id)));
create policy rental_incoming_inspection_items_staff_read on public.rental_incoming_inspection_items for select to authenticated using (exists (select 1 from public.rental_incoming_inspections inspection join public.rental_tenancies tenancy on tenancy.id = inspection.tenancy_id join public.rental_properties property on property.id = tenancy.property_id where inspection.id = inspection_id and public.rental_branch_access(property.organisation_id, property.branch_id)));
create policy rental_incoming_inspection_media_staff_read on public.rental_incoming_inspection_media for select to authenticated using (exists (select 1 from public.rental_incoming_inspections inspection join public.rental_tenancies tenancy on tenancy.id = inspection.tenancy_id join public.rental_properties property on property.id = tenancy.property_id where inspection.id = inspection_id and public.rental_branch_access(property.organisation_id, property.branch_id)));
create policy rental_incoming_inspection_events_staff_read on public.rental_incoming_inspection_events for select to authenticated using (exists (select 1 from public.rental_incoming_inspections inspection join public.rental_tenancies tenancy on tenancy.id = inspection.tenancy_id join public.rental_properties property on property.id = tenancy.property_id where inspection.id = inspection_id and public.rental_branch_access(property.organisation_id, property.branch_id)));

create or replace function public.rental_start_incoming_inspection(p_tenancy_id uuid, p_scheduled_for timestamptz default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare tenancy_row public.rental_tenancies%rowtype; lease_id uuid; inspection_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;
  select tenancy.* into tenancy_row from public.rental_tenancies tenancy where tenancy.id = p_tenancy_id for update;
  if not found then raise exception 'Tenancy not found'; end if;
  if not exists (select 1 from public.rental_properties property where property.id = tenancy_row.property_id and public.rental_branch_access(property.organisation_id, property.branch_id)) then raise exception 'You are not authorized for this tenancy'; end if;
  select lease.id into lease_id from public.rental_leases lease where lease.tenancy_id = tenancy_row.id;
  if lease_id is null then raise exception 'Tenancy has no lease'; end if;
  select inspection.id into inspection_id from public.rental_incoming_inspections inspection where inspection.tenancy_id = tenancy_row.id;
  if inspection_id is not null then return jsonb_build_object('inspection_id', inspection_id, 'idempotent', true); end if;
  insert into public.rental_incoming_inspections(tenancy_id, lease_id, organisation_id, status, scheduled_for, created_by) values (tenancy_row.id, lease_id, tenancy_row.organisation_id, 'in_progress', p_scheduled_for, auth.uid()) returning id into inspection_id;
  insert into public.rental_incoming_inspection_items(inspection_id, organisation_id, item_key) values (inspection_id, tenancy_row.organisation_id, 'condition_report'), (inspection_id, tenancy_row.organisation_id, 'photo_evidence'), (inspection_id, tenancy_row.organisation_id, 'meter_readings'), (inspection_id, tenancy_row.organisation_id, 'keys_handover'), (inspection_id, tenancy_row.organisation_id, 'occupation_acknowledgement');
  insert into public.rental_incoming_inspection_events(inspection_id, tenancy_id, organisation_id, event_type, occurred_by) values (inspection_id, tenancy_row.id, tenancy_row.organisation_id, 'inspection_started', auth.uid());
  return jsonb_build_object('inspection_id', inspection_id, 'idempotent', false);
end; $$;

create or replace function public.rental_record_incoming_inspection_item(p_item_id uuid, p_status text, p_note text default null, p_evidence_link text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare item_row public.rental_incoming_inspection_items%rowtype; inspection_row public.rental_incoming_inspections%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;
  if p_status not in ('completed', 'waived') then raise exception 'Incoming inspection items must be completed or waived'; end if;
  select item.* into item_row from public.rental_incoming_inspection_items item where item.id = p_item_id for update;
  if not found then raise exception 'Inspection item not found'; end if;
  select inspection.* into inspection_row from public.rental_incoming_inspections inspection where inspection.id = item_row.inspection_id;
  if not exists (select 1 from public.rental_tenancies tenancy join public.rental_properties property on property.id = tenancy.property_id where tenancy.id = inspection_row.tenancy_id and public.rental_branch_access(property.organisation_id, property.branch_id)) then raise exception 'You are not authorized for this tenancy'; end if;
  if inspection_row.status = 'completed' then raise exception 'Completed incoming inspections cannot be changed'; end if;
  if p_status = 'waived' and not public.bridge_is_org_admin(item_row.organisation_id) then raise exception 'Only an organisation administrator may waive an inspection item'; end if;
  if p_status = 'completed' and item_row.item_key in ('condition_report', 'meter_readings', 'keys_handover') and length(btrim(coalesce(p_evidence_link, item_row.evidence_link, ''))) = 0 then raise exception 'Evidence link is required for this inspection item'; end if;
  update public.rental_incoming_inspection_items set status = p_status, note = nullif(btrim(coalesce(p_note, '')), ''), evidence_link = coalesce(nullif(btrim(coalesce(p_evidence_link, '')), ''), evidence_link), completed_by = auth.uid(), completed_at = now() where id = item_row.id;
  insert into public.rental_incoming_inspection_events(inspection_id, tenancy_id, organisation_id, event_type, evidence_json, occurred_by) values (inspection_row.id, inspection_row.tenancy_id, inspection_row.organisation_id, 'item_completed', jsonb_build_object('item_key', item_row.item_key, 'status', p_status, 'evidence_link', nullif(btrim(coalesce(p_evidence_link, '')), '')), auth.uid());
  return jsonb_build_object('id', item_row.id, 'status', p_status);
end; $$;

create or replace function public.rental_link_incoming_inspection_media(p_inspection_id uuid, p_media_link text, p_caption text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare inspection_row public.rental_incoming_inspections%rowtype; media_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;
  if length(btrim(coalesce(p_media_link, ''))) = 0 then raise exception 'Media link is required'; end if;
  select inspection.* into inspection_row from public.rental_incoming_inspections inspection where inspection.id = p_inspection_id for update;
  if not found then raise exception 'Incoming inspection not found'; end if;
  if not exists (select 1 from public.rental_tenancies tenancy join public.rental_properties property on property.id = tenancy.property_id where tenancy.id = inspection_row.tenancy_id and public.rental_branch_access(property.organisation_id, property.branch_id)) then raise exception 'You are not authorized for this tenancy'; end if;
  if inspection_row.status = 'completed' then raise exception 'Completed incoming inspections cannot be changed'; end if;
  insert into public.rental_incoming_inspection_media(inspection_id, organisation_id, media_link, caption, created_by) values (inspection_row.id, inspection_row.organisation_id, btrim(p_media_link), nullif(btrim(coalesce(p_caption, '')), ''), auth.uid()) on conflict (inspection_id, media_link) do update set caption = excluded.caption returning id into media_id;
  insert into public.rental_incoming_inspection_events(inspection_id, tenancy_id, organisation_id, event_type, evidence_json, occurred_by) values (inspection_row.id, inspection_row.tenancy_id, inspection_row.organisation_id, 'media_linked', jsonb_build_object('media_link', btrim(p_media_link)), auth.uid());
  return jsonb_build_object('id', media_id, 'inspection_id', inspection_row.id);
end; $$;

create or replace function public.rental_complete_incoming_inspection(p_inspection_id uuid, p_acknowledged_by_name text, p_handover_notes text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare inspection_row public.rental_incoming_inspections%rowtype; outstanding integer; media_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;
  if length(btrim(coalesce(p_acknowledged_by_name, ''))) = 0 then raise exception 'Tenant acknowledgement name is required'; end if;
  select inspection.* into inspection_row from public.rental_incoming_inspections inspection where inspection.id = p_inspection_id for update;
  if not found then raise exception 'Incoming inspection not found'; end if;
  if not exists (select 1 from public.rental_tenancies tenancy join public.rental_properties property on property.id = tenancy.property_id where tenancy.id = inspection_row.tenancy_id and public.rental_branch_access(property.organisation_id, property.branch_id)) then raise exception 'You are not authorized for this tenancy'; end if;
  if inspection_row.status = 'completed' then return jsonb_build_object('inspection_id', inspection_row.id, 'completed', true, 'idempotent', true); end if;
  select count(*) into outstanding from public.rental_incoming_inspection_items where inspection_id = inspection_row.id and status = 'required';
  select count(*) into media_count from public.rental_incoming_inspection_media where inspection_id = inspection_row.id;
  if outstanding > 0 then raise exception 'Complete or waive every move-in checklist item before handover'; end if;
  if media_count = 0 then raise exception 'At least one condition photo or media evidence link is required'; end if;
  update public.rental_incoming_inspections set status = 'completed', completed_at = now(), acknowledged_by_name = btrim(p_acknowledged_by_name), acknowledged_at = now(), handover_notes = nullif(btrim(coalesce(p_handover_notes, '')), '') where id = inspection_row.id;
  insert into public.rental_incoming_inspection_events(inspection_id, tenancy_id, organisation_id, event_type, evidence_json, occurred_by) values (inspection_row.id, inspection_row.tenancy_id, inspection_row.organisation_id, 'inspection_completed', jsonb_build_object('acknowledged_by_name', btrim(p_acknowledged_by_name)), auth.uid());
  return jsonb_build_object('inspection_id', inspection_row.id, 'completed', true, 'idempotent', false);
end; $$;

create or replace function public.rental_assert_tenancy_move_in_complete(p_tenancy_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare inspection_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;
  select inspection.id into inspection_id from public.rental_incoming_inspections inspection join public.rental_tenancies tenancy on tenancy.id = inspection.tenancy_id join public.rental_properties property on property.id = tenancy.property_id where inspection.tenancy_id = p_tenancy_id and inspection.status = 'completed' and public.rental_branch_access(property.organisation_id, property.branch_id);
  if inspection_id is null then raise exception 'Incoming inspection and move-in handover are incomplete'; end if;
  return jsonb_build_object('ready', true, 'inspection_id', inspection_id);
end; $$;

revoke execute on function public.rental_start_incoming_inspection(uuid, timestamptz) from public, anon;
revoke execute on function public.rental_record_incoming_inspection_item(uuid, text, text, text) from public, anon;
revoke execute on function public.rental_link_incoming_inspection_media(uuid, text, text) from public, anon;
revoke execute on function public.rental_complete_incoming_inspection(uuid, text, text) from public, anon;
revoke execute on function public.rental_assert_tenancy_move_in_complete(uuid) from public, anon;
grant execute on function public.rental_start_incoming_inspection(uuid, timestamptz) to authenticated;
grant execute on function public.rental_record_incoming_inspection_item(uuid, text, text, text) to authenticated;
grant execute on function public.rental_link_incoming_inspection_media(uuid, text, text) to authenticated;
grant execute on function public.rental_complete_incoming_inspection(uuid, text, text) to authenticated;
grant execute on function public.rental_assert_tenancy_move_in_complete(uuid) to authenticated;

drop trigger if exists trg_rental_incoming_inspections_updated_at on public.rental_incoming_inspections;
create trigger trg_rental_incoming_inspections_updated_at before update on public.rental_incoming_inspections for each row execute function public.rental_set_updated_at();

commit;
