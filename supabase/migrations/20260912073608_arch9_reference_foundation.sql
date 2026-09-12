 begin;

 create table if not exists public.arch9_reference_settings (
   organisation_id uuid primary key references public.organisations(id) on delete cascade,
   agency_code text not null,
   next_listing_number bigint not null default 1 check (next_listing_number > 0),
   next_transaction_number bigint not null default 1 check (next_transaction_number > 0),
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now(),
   constraint arch9_reference_settings_agency_code_check
     check (agency_code = upper(agency_code) and agency_code ~ '^[A-Z0-9]{2,12}$')
 );

 comment on table public.arch9_reference_settings is
   'Immutable Arch9 reference configuration. Agency codes are assigned once and sequence counters allocate human-readable listing and transaction references.';

 alter table public.private_listings
   add column if not exists arch9_reference text;

 alter table public.transactions
   add column if not exists arch9_listing_reference text;

 do $$
 begin
   if not exists (
     select 1 from pg_constraint
     where conname = 'private_listings_arch9_reference_format_check'
       and conrelid = 'public.private_listings'::regclass
   ) then
     alter table public.private_listings
       add constraint private_listings_arch9_reference_format_check
       check (
         arch9_reference is null
         or arch9_reference ~ '^A9-[A-Z0-9]{2,12}-[0-9]{6,}$'
       );
   end if;

   if not exists (
     select 1 from pg_constraint
     where conname = 'transactions_arch9_listing_reference_format_check'
       and conrelid = 'public.transactions'::regclass
   ) then
     alter table public.transactions
       add constraint transactions_arch9_listing_reference_format_check
       check (
         arch9_listing_reference is null
         or arch9_listing_reference ~ '^A9-[A-Z0-9]{2,12}-[0-9]{6,}$'
       );
   end if;
 end
 $$;

 create unique index if not exists private_listings_arch9_reference_unique_idx
   on public.private_listings (organisation_id, lower(arch9_reference))
   where arch9_reference is not null;

 create index if not exists transactions_arch9_listing_reference_idx
   on public.transactions (organisation_id, arch9_listing_reference)
   where arch9_listing_reference is not null;

 create or replace function public.arch9_allocate_reference(
   p_organisation_id uuid,
   p_reference_type text
 )
 returns text
 language plpgsql
 security definer
 set search_path = ''
 as $function$
 declare
   v_agency_code text;
   v_sequence bigint;
   v_reference_type text := lower(trim(coalesce(p_reference_type, '')));
 begin
   if p_organisation_id is null then
     raise exception 'Organisation is required to allocate an Arch9 reference.'
       using errcode = '22023';
   end if;

   if v_reference_type not in ('listing', 'transaction') then
     raise exception 'Unsupported Arch9 reference type: %', coalesce(p_reference_type, '')
       using errcode = '22023';
   end if;

   update public.arch9_reference_settings
   set
     next_listing_number = case
       when v_reference_type = 'listing' then next_listing_number + 1
       else next_listing_number
     end,
     next_transaction_number = case
       when v_reference_type = 'transaction' then next_transaction_number + 1
       else next_transaction_number
     end,
     updated_at = now()
   where organisation_id = p_organisation_id
   returning
     agency_code,
     case
       when v_reference_type = 'listing' then next_listing_number - 1
       else next_transaction_number - 1
     end
   into v_agency_code, v_sequence;

   if not found then
     raise exception 'Arch9 reference settings have not been configured for organisation %.', p_organisation_id
       using errcode = 'P0001';
   end if;

   return case
     when v_reference_type = 'listing'
       then format('A9-%s-%s', v_agency_code, lpad(v_sequence::text, 6, '0'))
     else format('TXN-A9-%s-%s', v_agency_code, lpad(v_sequence::text, 6, '0'))
   end;
 end;
 $function$;

 revoke all on function public.arch9_allocate_reference(uuid, text)
   from public, anon, authenticated;
 grant execute on function public.arch9_allocate_reference(uuid, text)
   to service_role;

 create or replace function public.arch9_preserve_listing_reference()
 returns trigger
 language plpgsql
 security invoker
 set search_path = ''
 as $function$
 begin
   if old.arch9_reference is not null
      and new.arch9_reference is distinct from old.arch9_reference then
     raise exception 'The Arch9 listing reference is immutable once assigned.'
       using errcode = '23514';
   end if;
   return new;
 end;
 $function$;

 drop trigger if exists trg_private_listings_arch9_reference_immutable
   on public.private_listings;
 create trigger trg_private_listings_arch9_reference_immutable
 before update of arch9_reference on public.private_listings
 for each row execute function public.arch9_preserve_listing_reference();

 insert into public.arch9_reference_settings (organisation_id, agency_code)
 values ('13c6b79f-1d8b-4886-aabf-42ea49565ef5'::uuid, 'KING')
 on conflict (organisation_id) do update
 set agency_code = excluded.agency_code;

 comment on column public.private_listings.arch9_reference is
   'The immutable, Arch9-issued public listing reference. It is distinct from imported or external listing_reference values.';
 comment on column public.transactions.arch9_listing_reference is
   'The immutable Arch9 listing reference copied from the originating listing when a transaction is created.';

 commit;
