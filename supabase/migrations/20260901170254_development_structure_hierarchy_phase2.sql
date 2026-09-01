begin;

-- Phase 2: flexible physical hierarchy. Units remain the canonical sellable
-- inventory rows; this table only describes where they sit in a development.
create table if not exists public.development_structure_nodes (
  id uuid primary key default gen_random_uuid(),
  development_id uuid not null references public.developments(id) on delete cascade,
  parent_id uuid references public.development_structure_nodes(id) on delete restrict,
  node_type text not null,
  label text not null,
  code text,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint development_structure_nodes_type_check check (
    node_type in ('building', 'block', 'wing', 'precinct', 'floor', 'level', 'zone')
  ),
  constraint development_structure_nodes_label_not_blank check (length(btrim(label)) > 0),
  constraint development_structure_nodes_metadata_object_check check (jsonb_typeof(metadata) = 'object')
);

create unique index if not exists development_structure_nodes_sibling_label_unique
  on public.development_structure_nodes (development_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(label));
create index if not exists development_structure_nodes_development_parent_sort_idx
  on public.development_structure_nodes (development_id, parent_id, sort_order, label);

create or replace function public.bridge_touch_development_structure_node_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.bridge_validate_development_structure_node()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent_development_id uuid;
begin
  if new.parent_id is null then
    return new;
  end if;

  select development_id into parent_development_id
  from public.development_structure_nodes
  where id = new.parent_id;

  if parent_development_id is null then
    raise exception 'Structure parent % does not exist.', new.parent_id;
  end if;
  if parent_development_id <> new.development_id then
    raise exception 'A structure node parent must belong to the same development.';
  end if;
  if new.parent_id = new.id then
    raise exception 'A structure node cannot be its own parent.';
  end if;
  if exists (
    with recursive ancestors as (
      select id, parent_id
      from public.development_structure_nodes
      where id = new.parent_id
      union all
      select node.id, node.parent_id
      from public.development_structure_nodes node
      join ancestors ancestor on ancestor.parent_id = node.id
    )
    select 1 from ancestors where id = new.id
  ) then
    raise exception 'A structure node cannot create a circular hierarchy.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_development_structure_nodes_updated_at on public.development_structure_nodes;
create trigger trg_development_structure_nodes_updated_at
before update on public.development_structure_nodes
for each row execute function public.bridge_touch_development_structure_node_updated_at();

drop trigger if exists trg_validate_development_structure_node on public.development_structure_nodes;
create trigger trg_validate_development_structure_node
before insert or update of development_id, parent_id on public.development_structure_nodes
for each row execute function public.bridge_validate_development_structure_node();

-- Existing units are not backfilled automatically. Phase/block/number fields
-- remain intact until an operator explicitly maps a project into the hierarchy.
alter table public.units
  add column if not exists structure_node_id uuid references public.development_structure_nodes(id) on delete set null;
create index if not exists units_structure_node_id_idx
  on public.units (structure_node_id)
  where structure_node_id is not null;

create or replace function public.bridge_validate_unit_structure_node()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  node_development_id uuid;
begin
  if new.structure_node_id is null then
    return new;
  end if;
  select development_id into node_development_id
  from public.development_structure_nodes
  where id = new.structure_node_id;
  if node_development_id is null then
    raise exception 'The selected structure node does not exist.';
  end if;
  if node_development_id <> new.development_id then
    raise exception 'A unit can only link to a structure node in its own development.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validate_unit_structure_node on public.units;
create trigger trg_validate_unit_structure_node
before insert or update of development_id, structure_node_id on public.units
for each row execute function public.bridge_validate_unit_structure_node();

alter table public.development_structure_nodes enable row level security;
revoke all on table public.development_structure_nodes from public, anon;
grant select, insert, update, delete on table public.development_structure_nodes to authenticated;

drop policy if exists development_structure_nodes_select_scoped on public.development_structure_nodes;
create policy development_structure_nodes_select_scoped
on public.development_structure_nodes
for select to authenticated
using (public.bridge_can_view_development_record(development_id));

drop policy if exists development_structure_nodes_insert_scoped on public.development_structure_nodes;
create policy development_structure_nodes_insert_scoped
on public.development_structure_nodes
for insert to authenticated
with check (
  public.bridge_can_manage_development_record(development_id)
  and (created_by is null or created_by = (select auth.uid()))
);

drop policy if exists development_structure_nodes_update_scoped on public.development_structure_nodes;
create policy development_structure_nodes_update_scoped
on public.development_structure_nodes
for update to authenticated
using (public.bridge_can_manage_development_record(development_id))
with check (public.bridge_can_manage_development_record(development_id));

drop policy if exists development_structure_nodes_delete_scoped on public.development_structure_nodes;
create policy development_structure_nodes_delete_scoped
on public.development_structure_nodes
for delete to authenticated
using (public.bridge_can_manage_development_record(development_id));

revoke all on function public.bridge_touch_development_structure_node_updated_at() from public, anon, authenticated;
revoke all on function public.bridge_validate_development_structure_node() from public, anon, authenticated;
revoke all on function public.bridge_validate_unit_structure_node() from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
