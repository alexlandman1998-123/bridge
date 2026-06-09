begin;

do $$
begin
  if to_regclass('public.leads') is not null
     and to_regclass('public.private_listings') is not null
     and exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'leads'
         and column_name = 'listing_id'
         and udt_name = 'uuid'
     )
  then
    create index if not exists leads_listing_id_idx
      on public.leads(listing_id)
      where listing_id is not null;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'leads_listing_id_private_listings_fkey'
        and conrelid = 'public.leads'::regclass
    ) then
      alter table public.leads
        add constraint leads_listing_id_private_listings_fkey
        foreign key (listing_id)
        references public.private_listings(id)
        on delete set null
        not valid;
    end if;

    comment on constraint leads_listing_id_private_listings_fkey on public.leads
      is 'Future-write guard for seller lead to private listing linkage. Added NOT VALID so existing orphan audits can run before validation.';
  end if;

  if to_regclass('public.transactions') is not null
     and to_regclass('public.private_listings') is not null
     and exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'transactions'
         and column_name = 'listing_id'
         and udt_name = 'uuid'
     )
  then
    create index if not exists transactions_listing_id_idx
      on public.transactions(listing_id)
      where listing_id is not null;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'transactions_listing_id_private_listings_fkey'
        and conrelid = 'public.transactions'::regclass
    ) then
      alter table public.transactions
        add constraint transactions_listing_id_private_listings_fkey
        foreign key (listing_id)
        references public.private_listings(id)
        on delete set null
        not valid;
    end if;

    comment on constraint transactions_listing_id_private_listings_fkey on public.transactions
      is 'Future-write guard for transaction to private listing linkage. Added NOT VALID so existing orphan audits can run before validation.';
  end if;
end;
$$;

create or replace function public.bridge_private_listing_relationship_integrity_report()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uuid_regex constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
  v_report jsonb;
begin
  with
  lead_listing_orphans as (
    select l.lead_id, l.organisation_id, l.listing_id
    from public.leads l
    left join public.private_listings pl on pl.id = l.listing_id
    where l.listing_id is not null
      and pl.id is null
  ),
  transaction_listing_orphans as (
    select t.id, t.organisation_id, t.listing_id
    from public.transactions t
    left join public.private_listings pl on pl.id = t.listing_id
    where t.listing_id is not null
      and pl.id is null
  ),
  private_listing_originating_lead_orphans as (
    select pl.id, pl.organisation_id, lead_link.lead_id_text
    from public.private_listings pl
    join lateral (
      select nullif(trim(pl.originating_crm_lead_id), '') as lead_id_text
      where nullif(trim(pl.originating_crm_lead_id), '') ~* v_uuid_regex
    ) lead_link on true
    left join public.leads l on l.lead_id = lead_link.lead_id_text::uuid
    where l.lead_id is null
  ),
  private_listing_seller_lead_orphans as (
    select pl.id, pl.organisation_id, lead_link.lead_id_text
    from public.private_listings pl
    join lateral (
      select nullif(trim(pl.seller_lead_id), '') as lead_id_text
      where nullif(trim(pl.seller_lead_id), '') ~* v_uuid_regex
    ) lead_link on true
    left join public.leads l on l.lead_id = lead_link.lead_id_text::uuid
    where l.lead_id is null
  ),
  duplicate_active_originating_leads as (
    select
      pl.organisation_id,
      nullif(trim(pl.originating_crm_lead_id), '') as lead_id_text,
      count(*) as listing_count,
      jsonb_agg(pl.id order by pl.created_at) as listing_ids
    from public.private_listings pl
    where nullif(trim(pl.originating_crm_lead_id), '') is not null
      and coalesce(pl.listing_status, '') <> 'withdrawn'
      and coalesce(pl.listing_visibility, '') <> 'archived'
    group by pl.organisation_id, nullif(trim(pl.originating_crm_lead_id), '')
    having count(*) > 1
  ),
  duplicate_active_seller_leads as (
    select
      pl.organisation_id,
      nullif(trim(pl.seller_lead_id), '') as lead_id_text,
      count(*) as listing_count,
      jsonb_agg(pl.id order by pl.created_at) as listing_ids
    from public.private_listings pl
    where nullif(trim(pl.seller_lead_id), '') is not null
      and coalesce(pl.listing_status, '') <> 'withdrawn'
      and coalesce(pl.listing_visibility, '') <> 'archived'
    group by pl.organisation_id, nullif(trim(pl.seller_lead_id), '')
    having count(*) > 1
  )
  select jsonb_build_object(
    'lead_listing_orphans', jsonb_build_object(
      'count', (select count(*) from lead_listing_orphans),
      'sample', coalesce((select jsonb_agg(to_jsonb(row) order by row.lead_id) from (select * from lead_listing_orphans limit 10) row), '[]'::jsonb)
    ),
    'transaction_listing_orphans', jsonb_build_object(
      'count', (select count(*) from transaction_listing_orphans),
      'sample', coalesce((select jsonb_agg(to_jsonb(row) order by row.id) from (select * from transaction_listing_orphans limit 10) row), '[]'::jsonb)
    ),
    'private_listing_originating_lead_orphans', jsonb_build_object(
      'count', (select count(*) from private_listing_originating_lead_orphans),
      'sample', coalesce((select jsonb_agg(to_jsonb(row) order by row.id) from (select * from private_listing_originating_lead_orphans limit 10) row), '[]'::jsonb)
    ),
    'private_listing_seller_lead_orphans', jsonb_build_object(
      'count', (select count(*) from private_listing_seller_lead_orphans),
      'sample', coalesce((select jsonb_agg(to_jsonb(row) order by row.id) from (select * from private_listing_seller_lead_orphans limit 10) row), '[]'::jsonb)
    ),
    'duplicate_active_originating_leads', jsonb_build_object(
      'count', (select count(*) from duplicate_active_originating_leads),
      'sample', coalesce((select jsonb_agg(to_jsonb(row) order by row.lead_id_text) from (select * from duplicate_active_originating_leads limit 10) row), '[]'::jsonb)
    ),
    'duplicate_active_seller_leads', jsonb_build_object(
      'count', (select count(*) from duplicate_active_seller_leads),
      'sample', coalesce((select jsonb_agg(to_jsonb(row) order by row.lead_id_text) from (select * from duplicate_active_seller_leads limit 10) row), '[]'::jsonb)
    )
  )
  into v_report;

  return v_report;
end;
$$;

comment on function public.bridge_private_listing_relationship_integrity_report()
  is 'Service-only diagnostic report for Seller Lead to Listing relationship orphans and duplicate active listing links.';

revoke all on function public.bridge_private_listing_relationship_integrity_report() from public;
revoke all on function public.bridge_private_listing_relationship_integrity_report() from anon;
revoke all on function public.bridge_private_listing_relationship_integrity_report() from authenticated;
grant execute on function public.bridge_private_listing_relationship_integrity_report() to service_role;

notify pgrst, 'reload schema';

commit;
