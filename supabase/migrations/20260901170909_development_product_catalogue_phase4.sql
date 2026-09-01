begin;

-- Phase 4: canonical sellable products. Legacy unit_type, floorplan_id and
-- list_price remain supported while teams progressively link their stock.
create table if not exists public.development_unit_types (
  id uuid primary key default gen_random_uuid(),
  development_id uuid not null references public.developments(id) on delete cascade,
  code text,
  name text not null,
  description text,
  bedrooms numeric,
  bathrooms numeric,
  parking_count numeric,
  internal_size_sqm numeric,
  external_size_sqm numeric,
  vat_applicable boolean,
  no_transfer_duty boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint development_unit_types_name_not_blank check (length(btrim(name)) > 0),
  constraint development_unit_types_metadata_object_check check (jsonb_typeof(metadata) = 'object')
);
create unique index if not exists development_unit_types_code_unique
  on public.development_unit_types (development_id, lower(code)) where code is not null and length(btrim(code)) > 0;
create unique index if not exists development_unit_types_name_unique
  on public.development_unit_types (development_id, lower(name));

create table if not exists public.development_floorplans (
  id uuid primary key default gen_random_uuid(),
  development_id uuid not null references public.developments(id) on delete cascade,
  unit_type_id uuid references public.development_unit_types(id) on delete set null,
  code text,
  name text not null,
  document_id uuid references public.development_documents(id) on delete set null,
  file_url text,
  thumbnail_url text,
  internal_size_sqm numeric,
  external_size_sqm numeric,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint development_floorplans_name_not_blank check (length(btrim(name)) > 0),
  constraint development_floorplans_metadata_object_check check (jsonb_typeof(metadata) = 'object')
);
create unique index if not exists development_floorplans_code_unique
  on public.development_floorplans (development_id, lower(code)) where code is not null and length(btrim(code)) > 0;
create index if not exists development_floorplans_development_unit_type_idx
  on public.development_floorplans (development_id, unit_type_id, sort_order);

create table if not exists public.development_price_books (
  id uuid primary key default gen_random_uuid(),
  development_id uuid not null references public.developments(id) on delete cascade,
  name text not null,
  currency_code text not null default 'ZAR',
  effective_from date,
  effective_to date,
  status text not null default 'draft',
  is_default boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint development_price_books_name_not_blank check (length(btrim(name)) > 0),
  constraint development_price_books_status_check check (status in ('draft', 'active', 'archived')),
  constraint development_price_books_dates_check check (effective_to is null or effective_from is null or effective_to >= effective_from)
);
create unique index if not exists development_price_books_default_unique
  on public.development_price_books (development_id) where is_default;

create table if not exists public.development_unit_prices (
  id uuid primary key default gen_random_uuid(),
  development_id uuid not null references public.developments(id) on delete cascade,
  price_book_id uuid not null references public.development_price_books(id) on delete cascade,
  unit_type_id uuid references public.development_unit_types(id) on delete cascade,
  floorplan_id uuid references public.development_floorplans(id) on delete cascade,
  unit_id uuid references public.units(id) on delete cascade,
  list_price numeric,
  price_from numeric,
  price_to numeric,
  reservation_fee numeric,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint development_unit_prices_target_check check (num_nonnulls(unit_type_id, floorplan_id, unit_id) >= 1),
  constraint development_unit_prices_amounts_check check (
    (list_price is null or list_price >= 0)
    and (price_from is null or price_from >= 0)
    and (price_to is null or price_to >= 0)
    and (reservation_fee is null or reservation_fee >= 0)
    and (price_to is null or price_from is null or price_to >= price_from)
  )
);
create unique index if not exists development_unit_prices_default_target_unique
  on public.development_unit_prices (price_book_id, coalesce(unit_type_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(floorplan_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(unit_id, '00000000-0000-0000-0000-000000000000'::uuid));

alter table public.units add column if not exists unit_type_id uuid references public.development_unit_types(id) on delete set null;
alter table public.units add column if not exists catalogue_floorplan_id uuid references public.development_floorplans(id) on delete set null;
create index if not exists units_unit_type_id_idx on public.units (unit_type_id) where unit_type_id is not null;
create index if not exists units_catalogue_floorplan_id_idx on public.units (catalogue_floorplan_id) where catalogue_floorplan_id is not null;

create or replace function public.bridge_touch_development_catalogue_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;

create or replace function public.bridge_validate_development_catalogue_scope()
returns trigger language plpgsql set search_path = '' as $$
declare linked_development_id uuid;
begin
  if tg_table_name = 'development_floorplans' and new.unit_type_id is not null then
    select development_id into linked_development_id from public.development_unit_types where id = new.unit_type_id;
    if linked_development_id is distinct from new.development_id then raise exception 'Floorplans must link to a unit type in the same development.'; end if;
  elsif tg_table_name = 'development_unit_prices' then
    select development_id into linked_development_id from public.development_price_books where id = new.price_book_id;
    if linked_development_id is distinct from new.development_id then raise exception 'Price books must belong to the same development.'; end if;
    if new.unit_type_id is not null then select development_id into linked_development_id from public.development_unit_types where id = new.unit_type_id; if linked_development_id is distinct from new.development_id then raise exception 'Price unit types must belong to the same development.'; end if; end if;
    if new.floorplan_id is not null then select development_id into linked_development_id from public.development_floorplans where id = new.floorplan_id; if linked_development_id is distinct from new.development_id then raise exception 'Price floorplans must belong to the same development.'; end if; end if;
    if new.unit_id is not null then select development_id into linked_development_id from public.units where id = new.unit_id; if linked_development_id is distinct from new.development_id then raise exception 'Price units must belong to the same development.'; end if; end if;
  elsif tg_table_name = 'units' then
    if new.unit_type_id is not null then select development_id into linked_development_id from public.development_unit_types where id = new.unit_type_id; if linked_development_id is distinct from new.development_id then raise exception 'Units must link to a unit type in the same development.'; end if; end if;
    if new.catalogue_floorplan_id is not null then select development_id into linked_development_id from public.development_floorplans where id = new.catalogue_floorplan_id; if linked_development_id is distinct from new.development_id then raise exception 'Units must link to a floorplan in the same development.'; end if; end if;
  end if;
  return new;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array['development_unit_types', 'development_floorplans', 'development_price_books', 'development_unit_prices'] loop
    execute format('drop trigger if exists trg_%s_updated_at on public.%s', table_name, table_name);
    execute format('create trigger trg_%s_updated_at before update on public.%s for each row execute function public.bridge_touch_development_catalogue_updated_at()', table_name, table_name);
    execute format('drop trigger if exists trg_validate_%s_scope on public.%s', table_name, table_name);
    execute format('create trigger trg_validate_%s_scope before insert or update on public.%s for each row execute function public.bridge_validate_development_catalogue_scope()', table_name, table_name);
  end loop;
end;
$$;
drop trigger if exists trg_validate_unit_catalogue_scope on public.units;
create trigger trg_validate_unit_catalogue_scope before insert or update of development_id, unit_type_id, catalogue_floorplan_id on public.units for each row execute function public.bridge_validate_development_catalogue_scope();

alter table public.development_unit_types enable row level security;
alter table public.development_floorplans enable row level security;
alter table public.development_price_books enable row level security;
alter table public.development_unit_prices enable row level security;

do $$
declare table_name text;
begin
  foreach table_name in array array['development_unit_types', 'development_floorplans', 'development_price_books', 'development_unit_prices'] loop
    execute format('revoke all on table public.%s from public, anon', table_name);
    execute format('grant select, insert, update, delete on table public.%s to authenticated', table_name);
    execute format('drop policy if exists %s_select_scoped on public.%s', table_name, table_name);
    execute format('create policy %s_select_scoped on public.%s for select to authenticated using (public.bridge_can_view_development_record(development_id))', table_name, table_name);
    execute format('drop policy if exists %s_insert_scoped on public.%s', table_name, table_name);
    execute format('create policy %s_insert_scoped on public.%s for insert to authenticated with check (public.bridge_can_manage_development_record(development_id) and (created_by is null or created_by = (select auth.uid())))', table_name, table_name);
    execute format('drop policy if exists %s_update_scoped on public.%s', table_name, table_name);
    execute format('create policy %s_update_scoped on public.%s for update to authenticated using (public.bridge_can_manage_development_record(development_id)) with check (public.bridge_can_manage_development_record(development_id))', table_name, table_name);
    execute format('drop policy if exists %s_delete_scoped on public.%s', table_name, table_name);
    execute format('create policy %s_delete_scoped on public.%s for delete to authenticated using (public.bridge_can_manage_development_record(development_id))', table_name, table_name);
  end loop;
end;
$$;

revoke all on function public.bridge_touch_development_catalogue_updated_at() from public, anon, authenticated;
revoke all on function public.bridge_validate_development_catalogue_scope() from public, anon, authenticated;
notify pgrst, 'reload schema';
commit;
