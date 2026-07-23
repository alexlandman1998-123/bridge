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
revoke all on function public.bridge_create_mvp_transaction_operator_fallback(jsonb, text)
  from public, anon, service_role;

grant execute on function public.bridge_create_mvp_transaction(jsonb) to authenticated;
grant execute on function public.bridge_create_mvp_transaction_operator_fallback(jsonb, text) to authenticated;
