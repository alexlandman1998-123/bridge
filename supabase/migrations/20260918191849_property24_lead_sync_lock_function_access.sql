-- Keep the Property24 lead-sync lock functions backend-only. Explicit role
-- revokes are necessary because PUBLIC grants may otherwise remain effective.
revoke all on function public.property24_acquire_lead_sync_lock(text, text, integer) from public, anon, authenticated;
revoke all on function public.property24_complete_lead_sync_lock(text, text, uuid, text, timestamptz, integer, integer, text) from public, anon, authenticated;

grant execute on function public.property24_acquire_lead_sync_lock(text, text, integer) to service_role;
grant execute on function public.property24_complete_lead_sync_lock(text, text, uuid, text, timestamptz, integer, integer, text) to service_role;
