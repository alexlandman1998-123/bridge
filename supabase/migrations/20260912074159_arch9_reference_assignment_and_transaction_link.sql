 begin;

 create or replace function public.arch9_ensure_reference_settings(
   p_organisation_id uuid
 )
 returns void
 language plpgsql
 security definer
 set search_path = ''
 as $function$
 declare
   v_agency_code text;
 begin
   if p_organisation_id is null then
     raise exception 'Organisation is required to configure Arch9 references.'
       using errcode = '22023';
   end if;

   if exists (
     select 1
     from public.arch9_reference_settings settings
     where settings.organisation_id = p_organisation_id
   ) then
     return;
   end if;

   select coalesce(
     nullif(left(regexp_replace(upper(organisation.name), '[^A-Z0-9]+', '', 'g'), 12), ''),
     'ORG' || upper(substr(replace(p_organisation_id::text, '-', ''), 1, 6))
   )
   into v_agency_code
   from public.organisations organisation
   where organisation.id = p_organisation_id;

   if not found then
     raise exception 'Organisation % was not found.', p_organisation_id
       using errcode = '23503';
   end if;

   insert into public.arch9_reference_settings (
     organisation_id,
     agency_code
   )
   values (
     p_organisation_id,
     v_agency_code
   )
   on conflict (organisation_id) do nothing;
 end;
 $function$;

 revoke all on function public.arch9_ensure_reference_settings(uuid)
   from public, anon, authenticated;
 grant execute on function public.arch9_ensure_reference_settings(uuid)
   to service_role;

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

   perform public.arch9_ensure_reference_settings(p_organisation_id);

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

   return case
     when v_reference_type = 'listing'
       then format('A9-%s-%s', v_agency_code, lpad(v_sequence::text, 6, '0'))
     else format('TXN-A9-%s-%s', v_agency_code, lpad(v_sequence::text, 6, '0'))
   end;
 end;
 $function$;

 create or replace function public.arch9_assign_listing_reference()
 returns trigger
 language plpgsql
 security definer
 set search_path = ''
 as $function$
 begin
   if nullif(btrim(coalesce(new.arch9_reference, '')), '') is null then
     new.arch9_reference := public.arch9_allocate_reference(new.organisation_id, 'listing');
   end if;
   return new;
 end;
 $function$;

 drop trigger if exists trg_100_private_listings_assign_arch9_reference
   on public.private_listings;
 create trigger trg_100_private_listings_assign_arch9_reference
 before insert on public.private_listings
 for each row execute function public.arch9_assign_listing_reference();

 create or replace function public.arch9_copy_listing_reference_to_transaction()
 returns trigger
 language plpgsql
 security definer
 set search_path = ''
 as $function$
 declare
   v_listing_reference text;
 begin
   if new.listing_id is null then
     return new;
   end if;

   if tg_op = 'UPDATE' and new.listing_id is not distinct from old.listing_id then
     return new;
   end if;

   select listing.arch9_reference
   into v_listing_reference
   from public.private_listings listing
   where listing.id = new.listing_id;

   if v_listing_reference is not null then
     new.arch9_listing_reference := v_listing_reference;
   end if;

   return new;
 end;
 $function$;

 drop trigger if exists trg_100_transactions_copy_arch9_listing_reference
   on public.transactions;
 create trigger trg_100_transactions_copy_arch9_listing_reference
 before insert or update of listing_id on public.transactions
 for each row execute function public.arch9_copy_listing_reference_to_transaction();

 comment on function public.arch9_assign_listing_reference() is
   'Automatically assigns an immutable, agency-scoped Arch9 reference to every new private listing.';
 comment on function public.arch9_copy_listing_reference_to_transaction() is
   'Copies the immutable Arch9 reference from the originating listing whenever a transaction is linked to that listing.';

 commit;
