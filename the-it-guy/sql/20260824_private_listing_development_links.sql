begin;

-- Canonical relationship between development stock and listing records.
-- This lets a development pull back all direct and agency listings without
-- relying on title/unit-number inference.
alter table if exists public.private_listings
  add column if not exists development_id uuid references public.developments(id) on delete set null,
  add column if not exists unit_id uuid references public.units(id) on delete set null;

create index if not exists private_listings_development_id_idx
  on public.private_listings(development_id)
  where development_id is not null;

create index if not exists private_listings_unit_id_idx
  on public.private_listings(unit_id)
  where unit_id is not null;

create index if not exists private_listings_development_status_idx
  on public.private_listings(development_id, listing_status)
  where development_id is not null;

create or replace function public.bridge_private_listing_sync_development_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_development_id uuid;
begin
  if new.unit_id is not null then
    select u.development_id
      into resolved_development_id
    from public.units u
    where u.id = new.unit_id;

    if resolved_development_id is null then
      raise exception 'Private listing unit_id % does not belong to a development', new.unit_id
        using errcode = '23514';
    end if;

    if new.development_id is null then
      new.development_id := resolved_development_id;
    elsif new.development_id <> resolved_development_id then
      raise exception 'Private listing unit_id % belongs to development %, not %', new.unit_id, resolved_development_id, new.development_id
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_private_listing_sync_development_link on public.private_listings;
create trigger trg_private_listing_sync_development_link
before insert or update of development_id, unit_id on public.private_listings
for each row
execute function public.bridge_private_listing_sync_development_link();

create or replace function public.bridge_can_view_private_listing_development(target_development_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when target_development_id is null then false
      when auth.uid() is null then false
      when exists (
        select 1
        from public.organisation_users ou
        where ou.user_id = auth.uid()
          and ou.role = 'admin'
          and ou.status = 'active'
      ) then true
      when exists (
        select 1
        from public.development_participants dp
        where dp.development_id = target_development_id
          and dp.is_active = true
          and dp.can_view = true
          and (
            dp.user_id = auth.uid()
            or lower(coalesce(dp.participant_email, '')) = (
              select lower(coalesce(p.email, ''))
              from public.profiles p
              where p.id = auth.uid()
              limit 1
            )
          )
      ) then true
      else false
    end
$$;

drop policy if exists private_listings_select_development_participant on public.private_listings;
create policy private_listings_select_development_participant
on public.private_listings
for select
to authenticated
using (
  development_id is not null
  and public.bridge_can_view_private_listing_development(development_id)
);

-- Backfill rows that already stored development/unit references in their
-- structured canonical seller facts. Remaining legacy rows can still be
-- resolved by the application fallback until they are edited or cleaned.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'private_listings'
      and column_name = 'seller_canonical_facts_json'
  ) then
    execute $sql$
      update public.private_listings pl
      set
        unit_id = coalesce(pl.unit_id, canonical.unit_id),
        development_id = coalesce(pl.development_id, canonical.development_id, u.development_id)
      from (
        select
          id,
          case
            when coalesce(
              seller_canonical_facts_json #>> '{property,unitId}',
              seller_canonical_facts_json #>> '{property,unit_id}',
              seller_canonical_facts_json ->> 'unitId',
              seller_canonical_facts_json ->> 'unit_id'
            ) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
              then coalesce(
                seller_canonical_facts_json #>> '{property,unitId}',
                seller_canonical_facts_json #>> '{property,unit_id}',
                seller_canonical_facts_json ->> 'unitId',
                seller_canonical_facts_json ->> 'unit_id'
              )::uuid
            else null
          end as unit_id,
          case
            when coalesce(
              seller_canonical_facts_json #>> '{property,developmentId}',
              seller_canonical_facts_json #>> '{property,development_id}',
              seller_canonical_facts_json ->> 'developmentId',
              seller_canonical_facts_json ->> 'development_id'
            ) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
              then coalesce(
                seller_canonical_facts_json #>> '{property,developmentId}',
                seller_canonical_facts_json #>> '{property,development_id}',
                seller_canonical_facts_json ->> 'developmentId',
                seller_canonical_facts_json ->> 'development_id'
              )::uuid
            else null
          end as development_id
        from public.private_listings
        where development_id is null
           or unit_id is null
      ) canonical
      left join public.units u
        on u.id = canonical.unit_id
      where pl.id = canonical.id
        and (
          canonical.unit_id is not null
          or canonical.development_id is not null
          or u.development_id is not null
        )
        and (
          canonical.development_id is null
          or u.development_id is null
          or canonical.development_id = u.development_id
        )
        and (
          pl.development_id is null
          or u.development_id is null
          or pl.development_id = u.development_id
        )
    $sql$;
  end if;
end $$;

commit;
