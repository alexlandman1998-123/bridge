begin;

do $$
declare
  v_source_organisation_id uuid;
  v_partner_organisation_id uuid;
  v_referral_id uuid := gen_random_uuid();
  v_relationship_id uuid := gen_random_uuid();
  v_token text := 'phase7_smoke_' || replace(gen_random_uuid()::text, '-', '');
  v_result jsonb;
begin
  select id into v_source_organisation_id
  from public.organisations
  order by created_at, id
  limit 1;

  select id into v_partner_organisation_id
  from public.organisations
  where id <> v_source_organisation_id
  order by created_at, id
  limit 1;

  if v_source_organisation_id is null then
    raise exception 'Phase 7 smoke requires at least one organisation fixture.';
  end if;

  insert into public.lead_referrals (
    id, source_organisation_id, target_agent_email, target_agent_name,
    recipient_scope, status, agreement_status, invite_token,
    invite_expires_at, commission_split_percentage, agreement_text
  ) values (
    v_referral_id, v_source_organisation_id, 'phase7-smoke@example.invalid',
    'Phase 7 Smoke Recipient', 'external_invite', 'sent', 'pending',
    v_token, now() + interval '1 day', 20, 'Phase 7 rollback-only referral agreement.'
  );

  insert into public.referral_clients (
    referral_id, source_organisation_id, client_name, client_status
  ) values (
    v_referral_id, v_source_organisation_id, 'Phase 7 Smoke Client', 'referred'
  );

  insert into public.referral_agreements (
    referral_id, status, agreement_text, commission_split_percentage
  ) values (
    v_referral_id, 'pending', 'Phase 7 rollback-only referral agreement.', 20
  );

  insert into public.referral_invites (
    referral_id, token, email, status, expires_at
  ) values (
    v_referral_id, v_token, 'phase7-smoke@example.invalid', 'pending', now() + interval '1 day'
  );

  v_result := public.bridge_lookup_referral_invite_by_token(v_token);
  if not coalesce((v_result ->> 'success')::boolean, false) then
    raise exception 'Referral lookup smoke failed: %', v_result;
  end if;

  v_result := public.bridge_respond_referral_invite(
    v_token, 'accept', 'phase7-smoke@example.invalid', 'Phase 7 Smoke Recipient', null
  );
  if not coalesce((v_result ->> 'success')::boolean, false)
    or v_result ->> 'response_status' <> 'accepted'
  then
    raise exception 'Referral acceptance smoke failed: %', v_result;
  end if;

  if (select status from public.lead_referrals where id = v_referral_id) <> 'accepted'
    or (select client_status from public.referral_clients where referral_id = v_referral_id) <> 'accepted'
    or (select status from public.referral_agreements where referral_id = v_referral_id) <> 'accepted'
    or (select status from public.referral_invites where referral_id = v_referral_id) <> 'accepted'
    or not exists (
      select 1 from public.referral_status_events
      where referral_id = v_referral_id and event_type = 'invite_response' and to_status = 'accepted'
    )
  then
    raise exception 'Referral acceptance did not synchronize the complete referral ledger.';
  end if;

  if v_partner_organisation_id is not null then
    insert into public.developer_partner_relationships (
      id, developer_organisation_id, partner_organisation_id,
      partner_type, status, scope_type
    ) values (
      v_relationship_id, v_source_organisation_id, v_partner_organisation_id,
      'agency', 'invited', 'all_developments'
    );

    begin
      update public.developer_partner_relationships
      set developer_organisation_id = v_partner_organisation_id
      where id = v_relationship_id;
      raise exception 'Developer organisation identity guard did not reject reassignment.';
    exception
      when check_violation then null;
    end;

    begin
      update public.developer_partner_relationships
      set partner_organisation_id = null
      where id = v_relationship_id;
      raise exception 'Partner organisation identity guard did not reject rebinding.';
    exception
      when check_violation then null;
    end;
  end if;
end;
$$;

select jsonb_build_object(
  'status', 'passed',
  'mode', 'rollback_only',
  'referral_response_sync', true,
  'developer_relationship_identity_guard', true
) as phase7_behavior_smoke;

rollback;
