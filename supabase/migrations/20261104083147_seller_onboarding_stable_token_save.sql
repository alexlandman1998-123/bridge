begin;
-- Resolve both stable portal and invitation links before revision-locked saves.
-- The shared resolver retains each link's own validity and expiry checks.
do $patch$
declare target regprocedure; definition text; replacement text; changed integer:=0;
begin
 replacement:='id = (select resolution.onboarding_id from public.bridge_resolve_private_listing_seller_portal_token(p_token) resolution where resolution.token_valid and resolution.token_kind in (''stable'',''legacy'') limit 1)';
 for target in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='seller_save_private' and p.proname in ('lock_onboarding_save','bridge_update_private_listing_seller_onboarding_progress','bridge_complete_private_listing_seller_onboarding') loop
  definition:=pg_get_functiondef(target);
  if position('resolution.onboarding_id' in definition)=0 then
   if position('token = nullif' in definition)=0 then raise exception 'Unsupported seller token save contract: %',target;end if;
   definition:=replace(definition,'token = nullif(pg_catalog.btrim(p_token), '''')',replacement);
   definition:=replace(definition,'token = nullif(trim(p_token), '''')',replacement);
   definition:=replace(definition,'and (token_expires_at is null or token_expires_at > pg_catalog.now())','');
   definition:=replace(definition,'and (token_expires_at is null or token_expires_at > now())','');
   execute definition;
  end if;
  changed:=changed+1;
 end loop;
 if changed<>3 then raise exception 'Three seller save contracts are required; found %',changed;end if;
end $patch$;
notify pgrst,'reload schema';
commit;
