begin;
create or replace function seller_save_private.validated_onboarding_save_id(p_token text)
returns uuid language plpgsql security definer set search_path='' as $guard$
declare r record;ctx record;
begin
 select * into r from public.bridge_resolve_private_listing_seller_portal_token(p_token);
 if not coalesce(r.token_valid,false) then return null;end if;
 if r.token_kind='stable' then
  select * into ctx from journey_private.resolve_seller_portal_context(p_token,public.bridge_portal_request_header_raw('x-bridge-seller-portal-access-token'));
  if not exists(select 1 from public.private_listing_seller_onboarding o where o.id=r.onboarding_id and o.private_listing_id=ctx.listing_id) then raise exception 'Seller portal access is required.' using errcode='42501';end if;
 end if;
 return r.onboarding_id;
end $guard$;
revoke all on function seller_save_private.validated_onboarding_save_id(text) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
