-- Preserve legacy event scopes and accept the explicit attorney audiences used
-- by the atomic task RPCs. Do not map professional updates to client visibility.
begin;
alter table public.transaction_events
  drop constraint if exists transaction_events_visibility_scope_check;
alter table public.transaction_events
  add constraint transaction_events_visibility_scope_check
  check (visibility_scope in ('shared', 'internal', 'professional_shared', 'client_visible'));
commit;
