begin;

-- The attorney workflow uses professional_shared/client_visible, while the
-- older bond rollout policy only recognised the retired value "shared".
-- Keep internal legal work private, but make published workflow state readable
-- by every authenticated role player attached to the transaction.
drop policy if exists transaction_subprocesses_select_phase5b_scoped
  on public.transaction_subprocesses;
create policy transaction_subprocesses_select_cross_module
  on public.transaction_subprocesses
  for select
  to authenticated
  using (public.bridge_can_access_transaction_spine(transaction_id));

drop policy if exists transaction_subprocess_steps_select_phase5b_scoped
  on public.transaction_subprocess_steps;
create policy transaction_subprocess_steps_select_cross_module
  on public.transaction_subprocess_steps
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.transaction_subprocesses lane
      where lane.id = transaction_subprocess_steps.subprocess_id
        and public.bridge_can_access_transaction_spine(lane.transaction_id)
        and (
          transaction_subprocess_steps.visibility_scope in (
            'professional_shared',
            'client_visible',
            'shared_role_players'
          )
          or public.bridge_transaction_scope_is_internal_user()
          or exists (
            select 1
            from public.profiles profile
            where profile.id = auth.uid()
              and lower(coalesce(profile.role, '')) in ('attorney', 'conveyancer')
          )
        )
    )
  );

-- Token-scoped portals may read the lane shell and only explicitly published
-- steps/events. The request-token helper binds access to one transaction.
create policy transaction_subprocesses_select_client_portal
  on public.transaction_subprocesses
  for select
  to anon, authenticated
  using (
    public.bridge_has_client_portal_token_transaction_access(transaction_id)
    or public.bridge_has_onboarding_token_transaction_access(transaction_id)
  );

create policy transaction_subprocess_steps_select_client_portal
  on public.transaction_subprocess_steps
  for select
  to anon, authenticated
  using (
    visibility_scope = 'client_visible'
    and exists (
      select 1
      from public.transaction_subprocesses lane
      where lane.id = transaction_subprocess_steps.subprocess_id
        and (
          public.bridge_has_client_portal_token_transaction_access(lane.transaction_id)
          or public.bridge_has_onboarding_token_transaction_access(lane.transaction_id)
        )
    )
  );

create policy transaction_events_select_client_portal
  on public.transaction_events
  for select
  to anon, authenticated
  using (
    visibility_scope = 'client_visible'
    and (
      public.bridge_has_client_portal_token_transaction_access(transaction_id)
      or public.bridge_has_onboarding_token_transaction_access(transaction_id)
    )
  );

grant select on public.transaction_subprocesses to anon, authenticated;
grant select on public.transaction_subprocess_steps to anon, authenticated;
grant select on public.transaction_events to anon, authenticated;

notify pgrst, 'reload schema';
commit;
