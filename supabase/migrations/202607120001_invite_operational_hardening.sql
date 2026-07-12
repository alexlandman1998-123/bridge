create or replace function public.bridge_canonical_invite_health()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_pending_workspace_count integer := 0;
  v_pending_partner_count integer := 0;
  v_pending_client_count integer := 0;
  v_stale_pending_count integer := 0;
  v_expired_pending_invite_count integer := 0;
  v_expired_pending_partner_invitation_count integer := 0;
  v_expired_pending_transaction_partner_invitation_count integer := 0;
  v_completed_profile_without_workspace_count integer := 0;
  v_partner_sync_gap_count integer := 0;
  v_buyer_participant_gap_count integer := 0;
  v_buyer_portal_sync_gap_count integer := 0;
  v_seller_portal_sync_gap_count integer := 0;
  v_duplicate_pending_count integer := 0;
  v_status text := 'healthy';
  v_issues jsonb := '[]'::jsonb;
begin
  if not public.bridge_can_operate_canonical_invites() then
    raise exception 'Permission denied for canonical invite operations.' using errcode = '42501';
  end if;

  select count(*)::integer
    into v_pending_workspace_count
  from public.invites
  where invite_type in ('workspace_invite', 'branch_invite', 'team_invite', 'principal_claim_invite')
    and status = 'pending';

  select count(*)::integer
    into v_pending_partner_count
  from public.invites
  where invite_type = 'transaction_invite'
    and status = 'pending'
    and metadata ->> 'source' = 'transaction_partner_invitations';

  select count(*)::integer
    into v_pending_client_count
  from public.invites
  where invite_type = 'client_invite'
    and status = 'pending';

  select count(*)::integer
    into v_expired_pending_invite_count
  from public.invites
  where status = 'pending'
    and expires_at is not null
    and expires_at < v_now;

  if to_regclass('public.partner_invitations') is not null then
    select count(*)::integer
      into v_expired_pending_partner_invitation_count
    from public.partner_invitations
    where status = 'pending'
      and expires_at is not null
      and expires_at < v_now;
  end if;

  if to_regclass('public.transaction_partner_invitations') is not null then
    select count(*)::integer
      into v_expired_pending_transaction_partner_invitation_count
    from public.transaction_partner_invitations
    where status = 'pending'
      and expires_at is not null
      and expires_at < v_now;
  end if;

  select count(*)::integer
    into v_stale_pending_count
  from public.invites
  where invite_type in ('transaction_invite', 'client_invite')
    and status = 'pending'
    and created_at < v_now - interval '7 days'
    and (
      metadata ->> 'source' in (
        'transaction_partner_invitations',
        'client_onboarding_submitted',
        'seller_portal_activation',
        'seller_portal_documents_ready'
      )
      or invite_type = 'client_invite'
    );

  select count(*)::integer
    into v_completed_profile_without_workspace_count
  from public.profiles p
  where p.onboarding_completed is true
    and lower(coalesce(p.role, '')) in (
      'agent',
      'principal',
      'admin',
      'developer',
      'attorney',
      'bond_originator',
      'commercial',
      'commercial_agent',
      'commercial_broker'
    )
    and p.primary_attorney_firm_id is null
    and p.firm_id is null
    and not exists (
      select 1
      from public.organisation_users ou
      where ou.organisation_id is not null
        and (
          ou.user_id = p.id
          or (
            nullif(lower(coalesce(p.email, '')), '') is not null
            and lower(coalesce(ou.email, '')) = lower(p.email)
          )
        )
        and (
          lower(trim(coalesce(ou.membership_status, ''))) = 'active'
          or lower(trim(coalesce(ou.status, ''))) = 'active'
        )
    );

  select count(*)::integer
    into v_partner_sync_gap_count
  from public.invites inv
  join public.transaction_partner_invitations tpi
    on inv.metadata ->> 'transaction_partner_invitation_id' = tpi.id::text
  where inv.invite_type = 'transaction_invite'
    and inv.status = 'accepted'
    and tpi.status <> 'accepted';

  select count(*)::integer
    into v_buyer_participant_gap_count
  from public.invites inv
  where inv.invite_type = 'client_invite'
    and inv.status = 'accepted'
    and coalesce(inv.metadata ->> 'client_role', inv.target_transaction_role) in ('buyer', 'client')
    and inv.target_transaction_id is not null
    and not exists (
      select 1
      from public.transaction_participants tp
      where tp.transaction_id = inv.target_transaction_id
        and lower(coalesce(tp.participant_email, '')) = lower(coalesce(inv.email, ''))
        and coalesce(tp.status, '') = 'active'
        and coalesce(tp.role_type, '') in ('buyer', 'client')
    );

  if to_regclass('public.client_portal_links') is not null then
    select count(*)::integer
      into v_buyer_portal_sync_gap_count
    from public.invites inv
    where inv.invite_type = 'client_invite'
      and inv.status = 'accepted'
      and coalesce(inv.metadata ->> 'client_role', inv.target_transaction_role) in ('buyer', 'client')
      and not exists (
        select 1
        from public.client_portal_links cpl
        where cpl.canonical_invite_id = inv.id
           or (
             inv.metadata ->> 'client_portal_link_id' = cpl.id::text
             and cpl.accepted_user_id is not null
           )
           or (
             inv.metadata ->> 'client_portal_token' = cpl.token
             and cpl.accepted_user_id is not null
           )
      );
  end if;

  if to_regclass('public.private_listing_seller_onboarding') is not null then
    select count(*)::integer
      into v_seller_portal_sync_gap_count
    from public.invites inv
    where inv.invite_type = 'client_invite'
      and inv.status = 'accepted'
      and coalesce(inv.metadata ->> 'client_role', inv.target_transaction_role) = 'seller'
      and nullif(trim(coalesce(inv.metadata ->> 'seller_workspace_token', '')), '') is not null
      and not exists (
        select 1
        from public.private_listing_seller_onboarding onboarding
        where onboarding.seller_portal_invite_id = inv.id
           or (
             onboarding.token = inv.metadata ->> 'seller_workspace_token'
             and onboarding.seller_portal_user_id is not null
           )
      );
  end if;

  with duplicate_groups as (
    select
      invite_type,
      coalesce(target_transaction_id::text, metadata ->> 'listing_id', '') as scope_key,
      coalesce(target_transaction_role, metadata ->> 'client_role', '') as role_key,
      lower(coalesce(email, '')) as email_key,
      count(*) as row_count
    from public.invites
    where status = 'pending'
      and invite_type in ('transaction_invite', 'client_invite')
    group by 1, 2, 3, 4
    having count(*) > 1
  )
  select coalesce(sum(row_count - 1), 0)::integer
    into v_duplicate_pending_count
  from duplicate_groups;

  if v_expired_pending_invite_count > 0 then
    v_issues := v_issues || jsonb_build_object(
      'code', 'expired_pending_invites',
      'severity', 'warning',
      'count', v_expired_pending_invite_count,
      'message', 'Canonical invite rows are past expires_at but still marked pending.'
    );
  end if;

  if v_expired_pending_partner_invitation_count > 0 then
    v_issues := v_issues || jsonb_build_object(
      'code', 'expired_pending_partner_invitations',
      'severity', 'warning',
      'count', v_expired_pending_partner_invitation_count,
      'message', 'Organisation partner invitations are past expires_at but still marked pending.'
    );
  end if;

  if v_expired_pending_transaction_partner_invitation_count > 0 then
    v_issues := v_issues || jsonb_build_object(
      'code', 'expired_pending_transaction_partner_invitations',
      'severity', 'warning',
      'count', v_expired_pending_transaction_partner_invitation_count,
      'message', 'Transaction partner invitations are past expires_at but still marked pending.'
    );
  end if;

  if v_completed_profile_without_workspace_count > 0 then
    v_issues := v_issues || jsonb_build_object(
      'code', 'completed_profiles_without_workspace',
      'severity', 'warning',
      'count', v_completed_profile_without_workspace_count,
      'message', 'Professional profiles are marked onboarding complete but have no active organisation_users membership.'
    );
  end if;

  if v_stale_pending_count > 0 then
    v_issues := v_issues || jsonb_build_object(
      'code', 'stale_pending_invites',
      'severity', 'warning',
      'count', v_stale_pending_count,
      'message', 'Canonical transaction/client invites have been pending for more than 7 days.'
    );
  end if;

  if v_partner_sync_gap_count > 0 then
    v_issues := v_issues || jsonb_build_object(
      'code', 'partner_invite_sync_gap',
      'severity', 'critical',
      'count', v_partner_sync_gap_count,
      'message', 'Accepted canonical partner invites are not reflected on transaction_partner_invitations.'
    );
  end if;

  if v_buyer_participant_gap_count > 0 then
    v_issues := v_issues || jsonb_build_object(
      'code', 'buyer_participant_sync_gap',
      'severity', 'critical',
      'count', v_buyer_participant_gap_count,
      'message', 'Accepted buyer client invites do not have an active buyer participant row.'
    );
  end if;

  if v_buyer_portal_sync_gap_count > 0 then
    v_issues := v_issues || jsonb_build_object(
      'code', 'buyer_portal_activation_sync_gap',
      'severity', 'warning',
      'count', v_buyer_portal_sync_gap_count,
      'message', 'Accepted buyer client invites are not reflected on client_portal_links.'
    );
  end if;

  if v_seller_portal_sync_gap_count > 0 then
    v_issues := v_issues || jsonb_build_object(
      'code', 'seller_portal_activation_sync_gap',
      'severity', 'warning',
      'count', v_seller_portal_sync_gap_count,
      'message', 'Accepted seller client invites are not reflected on seller portal records.'
    );
  end if;

  if v_duplicate_pending_count > 0 then
    v_issues := v_issues || jsonb_build_object(
      'code', 'duplicate_pending_invites',
      'severity', 'warning',
      'count', v_duplicate_pending_count,
      'message', 'Duplicate pending canonical invites exist for the same email/scope/role.'
    );
  end if;

  if v_partner_sync_gap_count > 0 or v_buyer_participant_gap_count > 0 then
    v_status := 'critical';
  elsif
    v_expired_pending_invite_count > 0
    or v_expired_pending_partner_invitation_count > 0
    or v_expired_pending_transaction_partner_invitation_count > 0
    or v_completed_profile_without_workspace_count > 0
    or v_stale_pending_count > 0
    or v_buyer_portal_sync_gap_count > 0
    or v_seller_portal_sync_gap_count > 0
    or v_duplicate_pending_count > 0
  then
    v_status := 'warning';
  end if;

  return jsonb_build_object(
    'status', v_status,
    'generatedAt', v_now,
    'totals', jsonb_build_object(
      'pendingWorkspaceInvites', v_pending_workspace_count,
      'pendingPartnerInvites', v_pending_partner_count,
      'pendingClientInvites', v_pending_client_count,
      'stalePendingInvites', v_stale_pending_count,
      'expiredPendingInvites', v_expired_pending_invite_count,
      'expiredPendingPartnerInvitations', v_expired_pending_partner_invitation_count,
      'expiredPendingTransactionPartnerInvitations', v_expired_pending_transaction_partner_invitation_count,
      'completedProfilesWithoutWorkspace', v_completed_profile_without_workspace_count,
      'partnerSyncGaps', v_partner_sync_gap_count,
      'buyerParticipantSyncGaps', v_buyer_participant_gap_count,
      'buyerPortalSyncGaps', v_buyer_portal_sync_gap_count,
      'sellerPortalSyncGaps', v_seller_portal_sync_gap_count,
      'duplicatePendingInvites', v_duplicate_pending_count
    ),
    'issues', v_issues
  );
end;
$$;

create or replace function public.bridge_reconcile_canonical_invites(p_dry_run boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_actor uuid := auth.uid();
  v_expired_pending_invite_count integer := 0;
  v_expired_pending_partner_invitation_count integer := 0;
  v_expired_pending_transaction_partner_invitation_count integer := 0;
  v_partner_sync_count integer := 0;
  v_buyer_portal_sync_count integer := 0;
  v_seller_portal_sync_count integer := 0;
  v_actions jsonb := '[]'::jsonb;
  v_invite_id uuid;
begin
  if not public.bridge_can_operate_canonical_invites() then
    raise exception 'Permission denied for canonical invite operations.' using errcode = '42501';
  end if;

  select count(*)::integer
    into v_expired_pending_invite_count
  from public.invites
  where status = 'pending'
    and expires_at is not null
    and expires_at < v_now;

  v_actions := v_actions || jsonb_build_object(
    'code', 'expired_pending_invite_status_sync',
    'count', v_expired_pending_invite_count,
    'dryRun', p_dry_run
  );

  if not p_dry_run and v_expired_pending_invite_count > 0 then
    for v_invite_id in
      update public.invites
         set status = 'expired',
             metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
               'expiredVia', 'canonical_invite_reconciliation',
               'expiredAt', v_now
             ),
             updated_at = v_now
       where status = 'pending'
         and expires_at is not null
         and expires_at < v_now
       returning id
    loop
      perform public.bridge_record_invite_event(
        v_invite_id,
        'invite_expired_by_reconciliation',
        v_actor,
        jsonb_build_object('source', 'canonical_invite_reconciliation', 'expiredAt', v_now)
      );
    end loop;
  end if;

  if to_regclass('public.partner_invitations') is not null then
    select count(*)::integer
      into v_expired_pending_partner_invitation_count
    from public.partner_invitations
    where status = 'pending'
      and expires_at is not null
      and expires_at < v_now;

    v_actions := v_actions || jsonb_build_object(
      'code', 'expired_pending_partner_invitation_status_sync',
      'count', v_expired_pending_partner_invitation_count,
      'dryRun', p_dry_run
    );

    if not p_dry_run and v_expired_pending_partner_invitation_count > 0 then
      update public.partner_invitations
         set status = 'expired',
             responded_at = coalesce(responded_at, v_now),
             updated_at = v_now
       where status = 'pending'
         and expires_at is not null
         and expires_at < v_now;
    end if;
  end if;

  if to_regclass('public.transaction_partner_invitations') is not null then
    select count(*)::integer
      into v_expired_pending_transaction_partner_invitation_count
    from public.transaction_partner_invitations
    where status = 'pending'
      and expires_at is not null
      and expires_at < v_now;

    v_actions := v_actions || jsonb_build_object(
      'code', 'expired_pending_transaction_partner_invitation_status_sync',
      'count', v_expired_pending_transaction_partner_invitation_count,
      'dryRun', p_dry_run
    );

    if not p_dry_run and v_expired_pending_transaction_partner_invitation_count > 0 then
      update public.transaction_partner_invitations
         set status = 'expired',
             invitation_token = null,
             metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
               'expiredVia', 'canonical_invite_reconciliation',
               'expiredAt', v_now
             ),
             updated_at = v_now
       where status = 'pending'
         and expires_at is not null
         and expires_at < v_now;
    end if;
  end if;

  select count(*)::integer
    into v_partner_sync_count
  from public.invites inv
  join public.transaction_partner_invitations tpi
    on inv.metadata ->> 'transaction_partner_invitation_id' = tpi.id::text
  where inv.invite_type = 'transaction_invite'
    and inv.status = 'accepted'
    and tpi.status <> 'accepted';

  v_actions := v_actions || jsonb_build_object(
    'code', 'partner_invitation_acceptance_sync',
    'count', v_partner_sync_count,
    'dryRun', p_dry_run
  );

  if not p_dry_run and v_partner_sync_count > 0 then
    update public.transaction_partner_invitations tpi
       set status = 'accepted',
           accepted_user_id = coalesce(inv.accepted_by_user_id, inv.invitee_user_id, tpi.accepted_user_id),
           accepted_at = coalesce(inv.accepted_at, tpi.accepted_at, v_now),
           invitation_token = null,
           metadata = coalesce(tpi.metadata, '{}'::jsonb) || jsonb_build_object(
             'canonicalInviteId', inv.id,
             'canonicalInviteAcceptedAt', coalesce(inv.accepted_at, v_now),
             'acceptedVia', 'phase7_reconciliation'
           ),
           updated_at = v_now
      from public.invites inv
     where inv.metadata ->> 'transaction_partner_invitation_id' = tpi.id::text
       and inv.invite_type = 'transaction_invite'
       and inv.status = 'accepted'
       and tpi.status <> 'accepted';

    for v_invite_id in
      select inv.id
      from public.invites inv
      join public.transaction_partner_invitations tpi
        on inv.metadata ->> 'transaction_partner_invitation_id' = tpi.id::text
      where inv.invite_type = 'transaction_invite'
        and inv.status = 'accepted'
        and tpi.metadata ->> 'acceptedVia' = 'phase7_reconciliation'
        and tpi.updated_at = v_now
    loop
      perform public.bridge_record_invite_event(
        v_invite_id,
        'canonical_partner_invite_reconciled',
        v_actor,
        jsonb_build_object('source', 'phase7_reconciliation', 'reconciledAt', v_now)
      );
    end loop;
  end if;

  if to_regclass('public.client_portal_links') is not null then
    select count(*)::integer
      into v_buyer_portal_sync_count
    from public.invites inv
    join public.client_portal_links cpl
      on (inv.metadata ->> 'client_portal_link_id') = cpl.id::text
      or (inv.metadata ->> 'client_portal_token') = cpl.token
      or (inv.target_transaction_id is not null and inv.target_transaction_id = cpl.transaction_id and cpl.is_active is true)
    where inv.invite_type = 'client_invite'
      and inv.status = 'accepted'
      and coalesce(inv.metadata ->> 'client_role', inv.target_transaction_role) in ('buyer', 'client')
      and cpl.canonical_invite_id is null;

    v_actions := v_actions || jsonb_build_object(
      'code', 'buyer_portal_activation_sync',
      'count', v_buyer_portal_sync_count,
      'dryRun', p_dry_run
    );

    if not p_dry_run and v_buyer_portal_sync_count > 0 then
      update public.client_portal_links cpl
         set canonical_invite_id = inv.id,
             accepted_user_id = coalesce(inv.accepted_by_user_id, inv.invitee_user_id),
             accepted_at = coalesce(inv.accepted_at, cpl.accepted_at, v_now),
             auth_model = coalesce(cpl.auth_model, 'canonical_client_invite'),
             updated_at = v_now
        from public.invites inv
       where inv.invite_type = 'client_invite'
         and inv.status = 'accepted'
         and coalesce(inv.metadata ->> 'client_role', inv.target_transaction_role) in ('buyer', 'client')
         and (
           (inv.metadata ->> 'client_portal_link_id') = cpl.id::text
           or (inv.metadata ->> 'client_portal_token') = cpl.token
           or (inv.target_transaction_id is not null and inv.target_transaction_id = cpl.transaction_id and cpl.is_active is true)
         )
         and cpl.canonical_invite_id is null;

      for v_invite_id in
        select distinct inv.id
        from public.invites inv
        join public.client_portal_links cpl
          on cpl.canonical_invite_id = inv.id
        where inv.invite_type = 'client_invite'
          and inv.status = 'accepted'
          and coalesce(inv.metadata ->> 'client_role', inv.target_transaction_role) in ('buyer', 'client')
          and cpl.updated_at = v_now
      loop
        perform public.bridge_record_invite_event(
          v_invite_id,
          'canonical_buyer_portal_reconciled',
          v_actor,
          jsonb_build_object('source', 'phase7_reconciliation', 'reconciledAt', v_now)
        );
      end loop;
    end if;
  end if;

  if to_regclass('public.private_listing_seller_onboarding') is not null then
    select count(*)::integer
      into v_seller_portal_sync_count
    from public.invites inv
    join public.private_listing_seller_onboarding onboarding
      on onboarding.token = inv.metadata ->> 'seller_workspace_token'
    where inv.invite_type = 'client_invite'
      and inv.status = 'accepted'
      and coalesce(inv.metadata ->> 'client_role', inv.target_transaction_role) = 'seller'
      and onboarding.seller_portal_invite_id is null;

    v_actions := v_actions || jsonb_build_object(
      'code', 'seller_portal_activation_sync',
      'count', v_seller_portal_sync_count,
      'dryRun', p_dry_run
    );

    if not p_dry_run and v_seller_portal_sync_count > 0 then
      update public.private_listing_seller_onboarding onboarding
         set seller_portal_user_id = coalesce(inv.accepted_by_user_id, inv.invitee_user_id),
             seller_portal_invite_id = inv.id,
             seller_portal_invite_accepted_at = coalesce(inv.accepted_at, onboarding.seller_portal_invite_accepted_at, v_now),
             seller_portal_last_login_at = coalesce(onboarding.seller_portal_last_login_at, coalesce(inv.accepted_at, v_now)),
             updated_at = v_now
        from public.invites inv
       where onboarding.token = inv.metadata ->> 'seller_workspace_token'
         and inv.invite_type = 'client_invite'
         and inv.status = 'accepted'
         and coalesce(inv.metadata ->> 'client_role', inv.target_transaction_role) = 'seller'
         and onboarding.seller_portal_invite_id is null;

      for v_invite_id in
        select distinct inv.id
        from public.invites inv
        join public.private_listing_seller_onboarding onboarding
          on onboarding.seller_portal_invite_id = inv.id
        where inv.invite_type = 'client_invite'
          and inv.status = 'accepted'
          and coalesce(inv.metadata ->> 'client_role', inv.target_transaction_role) = 'seller'
          and onboarding.updated_at = v_now
      loop
        perform public.bridge_record_invite_event(
          v_invite_id,
          'canonical_seller_portal_reconciled',
          v_actor,
          jsonb_build_object('source', 'phase7_reconciliation', 'reconciledAt', v_now)
        );
      end loop;
    end if;
  end if;

  if not p_dry_run and to_regclass('public.repair_logs') is not null then
    insert into public.repair_logs (
      entity_type,
      entity_id,
      user_id,
      repair_action,
      status,
      requested_by,
      applied_by,
      applied_at,
      metadata
    )
    values (
      'canonical_invites',
      'global',
      v_actor,
      'canonical_invite_reconciliation',
      'applied',
      v_actor,
      v_actor,
      v_now,
      jsonb_build_object(
        'phase', 8,
        'actions', v_actions,
        'expiredPendingInviteCount', v_expired_pending_invite_count,
        'expiredPendingPartnerInvitationCount', v_expired_pending_partner_invitation_count,
        'expiredPendingTransactionPartnerInvitationCount', v_expired_pending_transaction_partner_invitation_count,
        'partnerSyncCount', v_partner_sync_count,
        'buyerPortalSyncCount', v_buyer_portal_sync_count,
        'sellerPortalSyncCount', v_seller_portal_sync_count
      )
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'dryRun', p_dry_run,
    'generatedAt', v_now,
    'actions', v_actions,
    'health', public.bridge_canonical_invite_health()
  );
end;
$$;

grant execute on function public.bridge_canonical_invite_health() to authenticated;
grant execute on function public.bridge_reconcile_canonical_invites(boolean) to authenticated;
