begin;

-- The raw token is returned exactly once to the assigned originator.  The
-- buyer-facing table continues to retain only its SHA-256 digest.
create or replace function public.bridge_issue_bond_application_portal_access_link_for_originator(
  p_export_package_id uuid,
  p_expires_at timestamptz default (now() + interval '14 days')
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_assignment public.transaction_bond_originator_workspace_assignments%rowtype;
  v_package public.transaction_bond_application_export_packages%rowtype;
  v_token text;
  v_link public.bond_application_portal_access_links%rowtype;
begin
  if auth.uid() is null then
    raise exception 'An authenticated bond originator is required.' using errcode = '42501';
  end if;
  if p_export_package_id is null then
    raise exception 'An originator intake package is required.' using errcode = '22023';
  end if;
  if p_expires_at is null or p_expires_at <= now() or p_expires_at > now() + interval '90 days' then
    raise exception 'Access-link expiry must be between now and 90 days from now.' using errcode = '22023';
  end if;

  select * into v_assignment
  from public.transaction_bond_originator_workspace_assignments assignment
  where assignment.export_package_id = p_export_package_id
    and assignment.assigned_to_profile_id = auth.uid()
    and assignment.status in ('assigned', 'accepted')
  order by assignment.assigned_at desc
  limit 1;
  if not found then
    raise exception 'You are not assigned to this originator intake package.' using errcode = '42501';
  end if;

  select * into v_package
  from public.transaction_bond_application_export_packages package
  where package.id = p_export_package_id
    and package.destination_key = 'bond_originator_intake'
    and package.status not in ('cancelled', 'superseded')
  for update;
  if not found or v_package.bond_application_id is null then
    raise exception 'This intake package has no active bond application.' using errcode = 'P0002';
  end if;

  -- A reissued link supersedes the old link immediately, preventing several
  -- independently valid buyer entry points from circulating.
  update public.bond_application_portal_access_links
  set revoked_at = coalesce(revoked_at, now()),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'supersededByOriginatorAt', now(),
        'supersededByOriginatorProfileId', auth.uid()
      )
  where bond_application_id = v_package.bond_application_id
    and revoked_at is null
    and expires_at > now();

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.bond_application_portal_access_links (
    bond_application_id,
    token_hash,
    expires_at,
    created_by,
    metadata
  ) values (
    v_package.bond_application_id,
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    p_expires_at,
    auth.uid(),
    jsonb_build_object(
      'issuedBy', 'bond_originator_action_centre',
      'originatorProfileId', auth.uid(),
      'exportPackageId', p_export_package_id,
      'deliveryStatus', 'copy_ready',
      'remindersManagedInPhase5', true
    )
  ) returning * into v_link;

  return jsonb_build_object(
    'accessLinkId', v_link.id,
    'bondApplicationId', v_link.bond_application_id,
    'accessToken', v_token,
    'expiresAt', v_link.expires_at,
    'deliveryStatus', 'copy_ready'
  );
end;
$$;

create or replace function public.bridge_revoke_bond_application_portal_access_link_for_originator(
  p_access_link_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link public.bond_application_portal_access_links%rowtype;
begin
  if auth.uid() is null then
    raise exception 'An authenticated bond originator is required.' using errcode = '42501';
  end if;

  select link.* into v_link
  from public.bond_application_portal_access_links link
  where link.id = p_access_link_id
    and exists (
      select 1
      from public.transaction_bond_application_export_packages package
      join public.transaction_bond_originator_workspace_assignments assignment
        on assignment.export_package_id = package.id
      where package.bond_application_id = link.bond_application_id
        and package.destination_key = 'bond_originator_intake'
        and package.status not in ('cancelled', 'superseded')
        and assignment.assigned_to_profile_id = auth.uid()
        and assignment.status in ('assigned', 'accepted')
    )
  for update;
  if not found then
    raise exception 'You cannot revoke this application access link.' using errcode = '42501';
  end if;

  update public.bond_application_portal_access_links
  set revoked_at = coalesce(revoked_at, now()),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'revokedBy', 'bond_originator_action_centre',
        'revokedByOriginatorProfileId', auth.uid()
      )
  where id = v_link.id
  returning * into v_link;

  return jsonb_build_object('accessLinkId', v_link.id, 'revokedAt', v_link.revoked_at);
end;
$$;

create or replace function public.bridge_bond_application_portal_originator_action_centre_view()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'version', 'bond_application_portal_phase4',
    'items', coalesce(jsonb_agg(
      jsonb_build_object(
        'exportPackageId', package.id,
        'transactionId', package.transaction_id,
        'bondApplicationId', package.bond_application_id,
        'assignmentStatus', assignment.status,
        'packageStatus', package.status,
        'recipientName', coalesce(package.originator_recipient_name, 'Bond originator'),
        'documentRequestSummary', jsonb_build_object(
          'open', (select count(*) from public.transaction_bond_originator_document_requests request where request.export_package_id = package.id and request.status not in ('accepted', 'withdrawn', 'cancelled')),
          'awaitingReview', (select count(*) from public.transaction_bond_originator_document_requests request where request.export_package_id = package.id and request.status = 'awaiting_review')
        ),
        'activeAccessLink', case when link.id is null then null else jsonb_build_object(
          'id', link.id,
          'expiresAt', link.expires_at,
          'lastAccessedAt', link.last_accessed_at
        ) end,
        'actions', jsonb_build_object(
          'canIssueAccessLink', package.bond_application_id is not null,
          'canRevokeAccessLink', link.id is not null,
          'canRequestDocuments', package.status in ('accepted_by_originator', 'downloaded'),
          'remindersDeferredToPhase5', true
        )
      ) order by package.package_ready_at desc nulls last, package.created_at desc
    ), '[]'::jsonb)
  )
  from public.transaction_bond_originator_workspace_assignments assignment
  join public.transaction_bond_application_export_packages package on package.id = assignment.export_package_id
  left join lateral (
    select access_link.*
    from public.bond_application_portal_access_links access_link
    where access_link.bond_application_id = package.bond_application_id
      and access_link.revoked_at is null
      and access_link.expires_at > now()
    order by access_link.created_at desc
    limit 1
  ) link on true
  where assignment.assigned_to_profile_id = auth.uid()
    and assignment.status in ('assigned', 'accepted')
    and package.destination_key = 'bond_originator_intake'
    and package.status not in ('cancelled', 'superseded');
$$;

revoke all on function public.bridge_issue_bond_application_portal_access_link_for_originator(uuid, timestamptz) from public, anon;
revoke all on function public.bridge_revoke_bond_application_portal_access_link_for_originator(uuid) from public, anon;
revoke all on function public.bridge_bond_application_portal_originator_action_centre_view() from public, anon;
grant execute on function public.bridge_issue_bond_application_portal_access_link_for_originator(uuid, timestamptz) to authenticated;
grant execute on function public.bridge_revoke_bond_application_portal_access_link_for_originator(uuid) to authenticated;
grant execute on function public.bridge_bond_application_portal_originator_action_centre_view() to authenticated;

comment on function public.bridge_issue_bond_application_portal_access_link_for_originator(uuid, timestamptz) is
  'Phase 4 originator action-centre command. Only an assigned originator may issue a one-time, revocable buyer application access link for their intake package. Delivery and reminders are deliberately deferred.';
comment on function public.bridge_bond_application_portal_originator_action_centre_view() is
  'Phase 4 originator action-centre read model. It returns assigned package actions and link state without raw access tokens, application payloads, or buyer portal session access.';

notify pgrst, 'reload schema';
commit;
