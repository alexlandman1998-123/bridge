begin;

-- Phase 2 reserved this table for Microsoft. The same short-lived, private
-- state store now safely serves the Google callback too.
alter table public.revo_inbox_oauth_states
  drop constraint revo_inbox_oauth_states_provider_key_check;

alter table public.revo_inbox_oauth_states
  add constraint revo_inbox_oauth_states_provider_key_check
  check (provider_key in ('microsoft_365', 'google_workspace'));

comment on table public.revo_inbox_oauth_states is
  'Short-lived, non-readable OAuth state and PKCE verifier for Revo inbox connections.';

commit;
