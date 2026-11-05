begin;
-- Organisation and professional-firm identities are distinct, even when some
-- legacy firms happen to share their organisation's UUID.
alter table public.user_workspace_preferences add column if not exists active_attorney_firm_id uuid references public.attorney_firms(id) on delete set null;
comment on column public.user_workspace_preferences.active_attorney_firm_id is 'The selected attorney firm; active_workspace_id remains the owning organisation reference. Selection still requires an active membership.';
notify pgrst,'reload schema';
commit;
