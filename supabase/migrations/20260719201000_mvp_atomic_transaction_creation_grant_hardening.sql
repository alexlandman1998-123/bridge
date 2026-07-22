-- Recovered from the linked production migration ledger during Phase 0
-- reconciliation. This migration is already applied remotely; do not replay it.

-- Supabase can apply default EXECUTE grants to API roles when a function is
-- created. Explicitly remove those grants so only the intended guarded entry
-- points remain callable by signed-in users.

revoke all on function public.bridge_seed_mvp_transaction_participants(uuid, jsonb)
  from public, anon, authenticated, service_role;

revoke all on function public.bridge_seed_mvp_transaction_documents(uuid, jsonb)
  from public, anon, authenticated, service_role;

revoke all on function public.bridge_seed_mvp_transaction_workflow_lanes(uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;

revoke all on function public.bridge_create_mvp_transaction(jsonb)
  from public, anon, service_role;

do $$
begin
  if to_regprocedure('public.bridge_create_mvp_transaction_operator_fallback(jsonb,text)') is not null then
    execute 'revoke all on function public.bridge_create_mvp_transaction_operator_fallback(jsonb, text) from public, anon, service_role';
  end if;
end
$$;

grant execute on function public.bridge_create_mvp_transaction(jsonb) to authenticated;

do $$
begin
  if to_regprocedure('public.bridge_create_mvp_transaction_operator_fallback(jsonb,text)') is not null then
    execute 'grant execute on function public.bridge_create_mvp_transaction_operator_fallback(jsonb, text) to authenticated';
  end if;
end
$$;
