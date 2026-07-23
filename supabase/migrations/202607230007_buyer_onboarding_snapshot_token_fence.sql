begin;

-- The original snapshot RPC was intentionally made callable by either buyer
-- onboarding or client-portal bearers.  A portal bearer must never be able to
-- turn that into the higher-privilege onboarding bearer, even incidentally in
-- a response payload.  Keep the existing implementation intact for its
-- validation and mutation contract, but put an externally callable response
-- fence in front of it.
alter function public.bridge_save_buyer_onboarding_snapshot(jsonb, jsonb, jsonb, boolean, text)
  rename to bridge_save_buyer_onboarding_snapshot_internal;

-- The implementation remains in public schema only so the facade can call it
-- by a stable, schema-qualified name.  It is not an RPC capability.
revoke all on function public.bridge_save_buyer_onboarding_snapshot_internal(jsonb, jsonb, jsonb, boolean, text)
  from public, anon, authenticated, service_role;

create or replace function public.bridge_save_buyer_onboarding_snapshot(
  p_form_data jsonb,
  p_snapshot jsonb,
  p_funding_sources jsonb default '[]'::jsonb,
  p_submit boolean default false,
  p_next_action text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_result jsonb;
begin
  v_result := public.bridge_save_buyer_onboarding_snapshot_internal(
    p_form_data,
    p_snapshot,
    p_funding_sources,
    p_submit,
    p_next_action
  );

  -- Do this for every caller, rather than conditionally.  The onboarding
  -- browser already has the token it supplied, and no frontend consumer needs
  -- a token echoed back from a save response.
  return v_result #- '{onboarding,token}';
end;
$$;

revoke all on function public.bridge_save_buyer_onboarding_snapshot(jsonb, jsonb, jsonb, boolean, text)
  from public, anon, authenticated, service_role;
grant execute on function public.bridge_save_buyer_onboarding_snapshot(jsonb, jsonb, jsonb, boolean, text)
  to anon, authenticated;

notify pgrst, 'reload schema';

commit;
