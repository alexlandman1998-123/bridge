begin;

-- Replace deprecated auth.role() branches with Postgres policy role targets.
-- Portal predicates are unchanged; service_role keeps its dedicated policy
-- path and continues to bypass RLS in normal Supabase operation.

do $preflight$
declare
  deprecated_policy_count integer;
begin
  select count(*)::integer
    into deprecated_policy_count
  from pg_policies
  where schemaname = 'public'
    and (
      coalesce(qual, '') ~* 'auth[.]role[(][)]'
      or coalesce(with_check, '') ~* 'auth[.]role[(][)]'
    );

  if deprecated_policy_count <> 38 then
    raise exception 'Expected 38 deprecated public RLS policies, found %', deprecated_policy_count;
  end if;
end
$preflight$;

-- Client and participant portal policies. Restrict the policy target to the
-- two Data API roles while retaining the existing token predicates exactly.
alter policy bond_applications_client_portal_read
  on public.bond_applications
  to anon, authenticated
  using (
    public.bridge_has_client_portal_token_transaction_access(transaction_id)
    or public.bridge_has_bond_application_participant_token_access(id)
  );

alter policy bond_applications_client_portal_write
  on public.bond_applications
  to anon, authenticated
  using (public.bridge_has_client_portal_token_transaction_access(transaction_id))
  with check (public.bridge_has_client_portal_token_transaction_access(transaction_id));

alter policy bond_application_participants_client_portal_read
  on public.bond_application_participants
  to anon, authenticated
  using (
    exists (
      select 1
      from public.bond_applications ba
      where ba.id = bond_application_participants.bond_application_id
        and (
          public.bridge_has_client_portal_token_transaction_access(ba.transaction_id)
          or public.bridge_has_bond_application_participant_token_access(ba.id)
        )
    )
  );

alter policy bond_application_participants_client_portal_write
  on public.bond_application_participants
  to anon, authenticated
  using (
    exists (
      select 1
      from public.bond_applications ba
      where ba.id = bond_application_participants.bond_application_id
        and (
          public.bridge_has_client_portal_token_transaction_access(ba.transaction_id)
          or public.bridge_has_bond_application_participant_token_access(ba.id, bond_application_participants.id)
        )
    )
  )
  with check (
    exists (
      select 1
      from public.bond_applications ba
      where ba.id = bond_application_participants.bond_application_id
        and (
          public.bridge_has_client_portal_token_transaction_access(ba.transaction_id)
          or public.bridge_has_bond_application_participant_token_access(ba.id, bond_application_participants.id)
        )
    )
  );

alter policy bond_application_sections_client_portal_read
  on public.bond_application_sections
  to anon, authenticated
  using (
    exists (
      select 1
      from public.bond_applications ba
      left join public.bond_application_participants bap
        on bap.id = bond_application_sections.participant_id
      where ba.id = bond_application_sections.bond_application_id
        and (
          (
            bond_application_sections.scope = 'application'
            and (
              public.bridge_has_client_portal_token_transaction_access(ba.transaction_id)
              or public.bridge_has_bond_application_participant_token_access(ba.id)
            )
          )
          or (
            bap.role = 'primary_applicant'
            and public.bridge_has_client_portal_token_transaction_access(ba.transaction_id)
          )
          or public.bridge_has_bond_application_participant_token_access(
            ba.id,
            bond_application_sections.participant_id
          )
        )
    )
  );

alter policy bond_application_sections_client_portal_write
  on public.bond_application_sections
  to anon, authenticated
  using (
    exists (
      select 1
      from public.bond_applications ba
      left join public.bond_application_participants bap
        on bap.id = bond_application_sections.participant_id
      where ba.id = bond_application_sections.bond_application_id
        and (
          (
            public.bridge_has_client_portal_token_transaction_access(ba.transaction_id)
            and (bond_application_sections.scope = 'application' or bap.role = 'primary_applicant')
          )
          or public.bridge_has_bond_application_participant_token_access(
            ba.id,
            bond_application_sections.participant_id
          )
        )
    )
  )
  with check (
    exists (
      select 1
      from public.bond_applications ba
      left join public.bond_application_participants bap
        on bap.id = bond_application_sections.participant_id
      where ba.id = bond_application_sections.bond_application_id
        and (
          (
            public.bridge_has_client_portal_token_transaction_access(ba.transaction_id)
            and (bond_application_sections.scope = 'application' or bap.role = 'primary_applicant')
          )
          or public.bridge_has_bond_application_participant_token_access(
            ba.id,
            bond_application_sections.participant_id
          )
        )
    )
  );

alter policy bond_application_document_requirements_client_portal_read
  on public.bond_application_document_requirements
  to anon, authenticated
  using (
    exists (
      select 1
      from public.bond_applications ba
      left join public.bond_application_participants bap
        on bap.id = bond_application_document_requirements.participant_id
      where ba.id = bond_application_document_requirements.bond_application_id
        and (
          (
            bond_application_document_requirements.participant_id is null
            and (
              public.bridge_has_client_portal_token_transaction_access(ba.transaction_id)
              or public.bridge_has_bond_application_participant_token_access(ba.id)
            )
          )
          or (
            bap.role = 'primary_applicant'
            and public.bridge_has_client_portal_token_transaction_access(ba.transaction_id)
          )
          or public.bridge_has_bond_application_participant_token_access(
            ba.id,
            bond_application_document_requirements.participant_id
          )
        )
    )
  );

alter policy bond_application_document_requirements_client_portal_write
  on public.bond_application_document_requirements
  to anon, authenticated
  using (
    exists (
      select 1
      from public.bond_applications ba
      left join public.bond_application_participants bap
        on bap.id = bond_application_document_requirements.participant_id
      where ba.id = bond_application_document_requirements.bond_application_id
        and (
          (
            public.bridge_has_client_portal_token_transaction_access(ba.transaction_id)
            and (
              bond_application_document_requirements.participant_id is null
              or bap.role = 'primary_applicant'
            )
          )
          or public.bridge_has_bond_application_participant_token_access(
            ba.id,
            bond_application_document_requirements.participant_id
          )
        )
    )
  )
  with check (
    exists (
      select 1
      from public.bond_applications ba
      left join public.bond_application_participants bap
        on bap.id = bond_application_document_requirements.participant_id
      where ba.id = bond_application_document_requirements.bond_application_id
        and (
          (
            public.bridge_has_client_portal_token_transaction_access(ba.transaction_id)
            and (
              bond_application_document_requirements.participant_id is null
              or bap.role = 'primary_applicant'
            )
          )
          or public.bridge_has_bond_application_participant_token_access(
            ba.id,
            bond_application_document_requirements.participant_id
          )
        )
    )
  );

alter policy bond_application_participant_invites_client_portal_read
  on public.bond_application_participant_invites
  to anon, authenticated
  using (
    exists (
      select 1
      from public.bond_application_participants bap
      join public.bond_applications ba on ba.id = bap.bond_application_id
      where bap.id = bond_application_participant_invites.participant_id
        and (
          public.bridge_has_client_portal_token_transaction_access(ba.transaction_id)
          or public.bridge_has_bond_application_participant_token_access(ba.id)
        )
    )
  );

alter policy bond_application_participant_invites_client_portal_write
  on public.bond_application_participant_invites
  to anon, authenticated
  using (
    exists (
      select 1
      from public.bond_application_participants bap
      join public.bond_applications ba on ba.id = bap.bond_application_id
      where bap.id = bond_application_participant_invites.participant_id
        and (
          public.bridge_has_client_portal_token_transaction_access(ba.transaction_id)
          or public.bridge_has_bond_application_participant_token_access(ba.id, bap.id)
        )
    )
  )
  with check (
    exists (
      select 1
      from public.bond_application_participants bap
      join public.bond_applications ba on ba.id = bap.bond_application_id
      where bap.id = bond_application_participant_invites.participant_id
        and (
          public.bridge_has_client_portal_token_transaction_access(ba.transaction_id)
          or public.bridge_has_bond_application_participant_token_access(ba.id, bap.id)
        )
    )
  );

alter policy bond_application_change_requests_read
  on public.bond_application_change_requests
  to anon, authenticated
  using (
    exists (
      select 1
      from public.bond_applications ba
      where ba.id = bond_application_change_requests.bond_application_id
        and (
          public.bridge_has_client_portal_token_transaction_access(ba.transaction_id)
          or public.bridge_has_bond_application_participant_token_access(ba.id)
        )
    )
  );

alter policy bond_application_change_request_items_read
  on public.bond_application_change_request_items
  to anon, authenticated
  using (
    exists (
      select 1
      from public.bond_application_change_requests cr
      join public.bond_applications ba on ba.id = cr.bond_application_id
      where cr.id = bond_application_change_request_items.change_request_id
        and (
          (
            bond_application_change_request_items.participant_id is null
            and public.bridge_has_client_portal_token_transaction_access(ba.transaction_id)
          )
          or public.bridge_has_bond_application_participant_token_access(
            ba.id,
            bond_application_change_request_items.participant_id
          )
        )
    )
  );

alter policy bond_submission_documents_read
  on public.transaction_bond_application_submission_documents
  to anon, authenticated
  using (
    exists (
      select 1
      from public.transaction_bond_application_submissions submission
      join public.bond_applications ba on ba.id = submission.bond_application_id
      where submission.id = transaction_bond_application_submission_documents.submission_id
        and (
          public.bridge_has_client_portal_token_transaction_access(ba.transaction_id)
          or public.bridge_has_bond_application_participant_token_access(ba.id)
        )
    )
  );

alter policy transaction_bond_application_submissions_select_client_portal
  on public.transaction_bond_application_submissions
  to anon, authenticated
  using (public.bridge_has_client_portal_token_transaction_access(transaction_id));

alter policy transaction_bond_application_submissions_insert_client_portal
  on public.transaction_bond_application_submissions
  to anon, authenticated
  with check (public.bridge_has_client_portal_token_transaction_access(transaction_id));

alter policy transaction_bond_application_submissions_update_lifecycle_clien
  on public.transaction_bond_application_submissions
  to anon, authenticated
  using (public.bridge_has_client_portal_token_transaction_access(transaction_id))
  with check (public.bridge_has_client_portal_token_transaction_access(transaction_id));

alter policy bond_originator_formal_integrations_authorized_read
  on public.transaction_bond_originator_formal_integrations
  to anon, authenticated
  using (
    exists (
      select 1
      from public.transaction_bond_originator_workspace_assignments assignment
      where assignment.multi_originator_rollout_id = transaction_bond_originator_formal_integrations.multi_originator_rollout_id
        and public.bridge_can_access_transaction_spine(assignment.transaction_id)
    )
  );

-- Service-only policies. ALTER POLICY is atomic and keeps names, commands,
-- permissiveness, and table attachment unchanged.
do $service_policies$
declare
  target record;
begin
  for target in
    select *
    from (values
      ('bond_application_change_request_items', 'bond_application_change_request_items_service_write'),
      ('bond_application_change_requests', 'bond_application_change_requests_service_write'),
      ('transaction_bond_application_delivery_attempts', 'bond_application_delivery_attempts_service_only'),
      ('transaction_bond_application_export_packages', 'bond_application_export_packages_service_only'),
      ('transaction_bond_application_external_events', 'bond_application_external_events_service_only'),
      ('transaction_bond_application_governance_reports', 'bond_application_governance_reports_service_only'),
      ('transaction_bond_application_recipient_format_packages', 'bond_application_recipient_format_packages_service_only'),
      ('transaction_bond_application_submission_documents', 'bond_submission_documents_service_write'),
      ('transaction_bond_originator_bank_offer_captures', 'bond_originator_bank_offer_captures_service_only'),
      ('transaction_bond_originator_buyer_grant_acknowledgements', 'Service role manages buyer originator grant acknowledgements'),
      ('transaction_bond_originator_buyer_offer_decisions', 'Service role manages buyer originator offer decisions'),
      ('transaction_bond_originator_document_requests', 'bond_originator_document_requests_service_only'),
      ('transaction_bond_originator_formal_integrations', 'bond_originator_formal_integrations_service_write'),
      ('transaction_bond_originator_grant_captures', 'bond_originator_grant_captures_service_only'),
      ('transaction_bond_originator_internal_readiness_reports', 'bond_originator_internal_readiness_reports_service_only'),
      ('transaction_bond_originator_multi_originator_rollouts', 'bond_originator_multi_originator_rollouts_service_write'),
      ('transaction_bond_originator_one_originator_pilots', 'bond_originator_one_originator_pilots_service_write'),
      ('transaction_bond_originator_operational_hardening_reports', 'bond_originator_operational_hardening_reports_service_write'),
      ('transaction_bond_originator_operational_incidents', 'bond_originator_operational_incidents_service_write'),
      ('transaction_bond_originator_progress_events', 'bond_originator_progress_events_service_only'),
      ('transaction_bond_originator_workspace_assignments', 'bond_originator_workspace_assignments_service_write')
    ) as policies(table_name, policy_name)
  loop
    execute format(
      'alter policy %I on public.%I to service_role using (true) with check (true)',
      target.policy_name,
      target.table_name
    );
  end loop;
end
$service_policies$;

do $verification$
declare
  remaining_deprecated integer;
  modernized_portal integer;
  modernized_service integer;
begin
  select count(*)::integer
    into remaining_deprecated
  from pg_policies
  where schemaname = 'public'
    and (
      coalesce(qual, '') ~* 'auth[.]role[(][)]'
      or coalesce(with_check, '') ~* 'auth[.]role[(][)]'
    );

  select count(*)::integer
    into modernized_portal
  from pg_policies
  where schemaname = 'public'
    and roles = array['anon', 'authenticated']::name[]
    and policyname in (
      'bond_applications_client_portal_read',
      'bond_applications_client_portal_write',
      'bond_application_participants_client_portal_read',
      'bond_application_participants_client_portal_write',
      'bond_application_sections_client_portal_read',
      'bond_application_sections_client_portal_write',
      'bond_application_document_requirements_client_portal_read',
      'bond_application_document_requirements_client_portal_write',
      'bond_application_participant_invites_client_portal_read',
      'bond_application_participant_invites_client_portal_write',
      'bond_application_change_requests_read',
      'bond_application_change_request_items_read',
      'bond_submission_documents_read',
      'transaction_bond_application_submissions_select_client_portal',
      'transaction_bond_application_submissions_insert_client_portal',
      'transaction_bond_application_submissions_update_lifecycle_clien',
      'bond_originator_formal_integrations_authorized_read'
    );

  select count(*)::integer
    into modernized_service
  from pg_policies
  where schemaname = 'public'
    and roles = array['service_role']::name[]
    and qual = 'true'
    and with_check = 'true';

  if remaining_deprecated <> 0 then
    raise exception 'Deprecated auth.role() remains in % public policies', remaining_deprecated;
  end if;
  if modernized_portal <> 17 then
    raise exception 'Expected 17 modernized portal policies, found %', modernized_portal;
  end if;
  if modernized_service < 21 then
    raise exception 'Expected at least 21 modernized service policies, found %', modernized_service;
  end if;
end
$verification$;

notify pgrst, 'reload schema';

commit;

