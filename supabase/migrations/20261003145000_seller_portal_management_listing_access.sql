-- Fence agent-only seller portal controls by the existing listing permission.
-- Preserve current lifecycle/recovery logic and RPC signatures.
begin;

create or replace function public.bridge_require_seller_portal_listing_access(p_token text)
returns void
language plpgsql security definer
set search_path = ''
as $guard$
declare v_listing_id uuid;
begin
  if auth.role() is distinct from 'authenticated' or auth.uid() is null then
    raise exception 'Authentication is required to manage seller portal access.' using errcode = '42501';
  end if;
  select onboarding.private_listing_id into v_listing_id
  from public.bridge_resolve_private_listing_seller_portal_token(p_token) resolution
  join public.private_listing_seller_onboarding onboarding on onboarding.id = resolution.onboarding_id;
  if v_listing_id is null or not coalesce(public.bridge_can_access_private_listing(v_listing_id), false) then
    raise exception 'You do not have access to this seller portal.' using errcode = '42501';
  end if;
end;
$guard$;
revoke all on function public.bridge_require_seller_portal_listing_access(text) from public, anon, authenticated;

-- Insert the guard before the first statement; no unguarded alias remains.
-- Abort rather than silently succeeding if an expected deployed body differs.
do $patch$
declare
  v_signature text;
  v_definition text;
  v_patched text;
begin
  foreach v_signature in array array[
    'public.bridge_manage_private_listing_seller_portal(text,text,text)',
    'public.bridge_reset_private_listing_seller_portal_password(text)',
    'public.bridge_private_listing_seller_portal_diagnostics(text)'
  ] loop
    v_definition := pg_get_functiondef(v_signature::regprocedure);
    if position('perform public.bridge_require_seller_portal_listing_access(p_token);' in v_definition) = 0 then
      v_patched := regexp_replace(v_definition, E'\\mbegin\\M', E'begin\n  perform public.bridge_require_seller_portal_listing_access(p_token);', 'i');
      if v_patched = v_definition then
        raise exception 'Cannot guard seller portal function %', v_signature;
      end if;
      execute v_patched;
    end if;
    execute format('revoke all on function %s from public, anon', v_signature);
    execute format('grant execute on function %s to authenticated', v_signature);
  end loop;
end;
$patch$;
commit;
