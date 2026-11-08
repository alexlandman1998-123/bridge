begin;
create or replace function seller_save_private.validated_onboarding_save_id(p_token text)
returns uuid language plpgsql security definer set search_path='' as $guard$
declare r record;ctx record;
begin
 select * into r from public.bridge_resolve_private_listing_seller_portal_token(p_token);
 if not coalesce(r.token_valid,false) then return null;end if;
 if r.token_kind='stable' then
  select * into ctx from journey_private.resolve_seller_portal_context(p_token,public.bridge_portal_request_header_raw('x-bridge-seller-portal-access-token'));
  if ctx.listing_id is distinct from r.listing_id then raise exception 'Seller portal access is required.' using errcode='42501';end if;
 end if;
 return r.onboarding_id;
end $guard$;
revoke all on function seller_save_private.validated_onboarding_save_id(text) from public,anon,authenticated;
do $patch$
declare target regprocedure;definition text;needle text:='(select resolution.onboarding_id from public.bridge_resolve_private_listing_seller_portal_token(p_token) resolution where resolution.token_valid and resolution.token_kind in (''stable'',''legacy'') limit 1)';changed integer:=0;
begin
 for target in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='seller_save_private' and p.proname in ('lock_onboarding_save','bridge_update_private_listing_seller_onboarding_progress','bridge_complete_private_listing_seller_onboarding') loop
  definition:=pg_get_functiondef(target);
  if position(needle in definition)=0 then raise exception 'Unsupported stable seller save contract: %',target;end if;
  execute replace(definition,needle,'seller_save_private.validated_onboarding_save_id(p_token)');changed:=changed+1;
 end loop;
 if changed<>3 then raise exception 'Three stable seller save guards are required.';end if;
end $patch$;
notify pgrst,'reload schema';
commit;
