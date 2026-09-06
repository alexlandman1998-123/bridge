begin;

-- Supabase default privileges grant service_role full access to newly created
-- public tables. Keep the dark-launch event ledger append-only at the ACL as
-- well as through its immutable trigger.
revoke all on table public.website_production_dark_launch_events
  from public, anon, authenticated, service_role;
grant select on table public.website_production_dark_launch_events to authenticated;
grant select, insert on table public.website_production_dark_launch_events to service_role;

notify pgrst, 'reload schema';
commit;
