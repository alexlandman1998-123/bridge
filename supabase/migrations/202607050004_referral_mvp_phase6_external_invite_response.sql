begin;

do $$
begin
  if to_regclass('public.lead_referrals') is not null
     and to_regclass('public.referral_invites') is not null
     and to_regclass('public.referral_clients') is not null
     and to_regclass('public.referral_agreements') is not null
     and to_regclass('public.referral_status_events') is not null then
    execute $function$
create or replace function public.bridge_lookup_referral_invite_by_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $body$
declare
  invite_row public.referral_invites%rowtype;
  referral_row public.lead_referrals%rowtype;
  client_row public.referral_clients%rowtype;
  agreement_row public.referral_agreements%rowtype;
begin
  select *
    into invite_row
  from public.referral_invites
  where token = nullif(trim(p_token), '')
  limit 1;

  if invite_row.id is null then
    return jsonb_build_object('success', false, 'code', 'not_found');
  end if;

  select *
    into referral_row
  from public.lead_referrals
  where id = invite_row.referral_id
  limit 1;

  if referral_row.id is null then
    return jsonb_build_object('success', false, 'code', 'not_found');
  end if;

  if invite_row.expires_at is not null and invite_row.expires_at < now() and invite_row.status in ('pending', 'sent') then
    update public.referral_invites
      set status = 'expired',
          updated_at = now()
    where id = invite_row.id
    returning * into invite_row;
  end if;

  select *
    into client_row
  from public.referral_clients
  where referral_id = referral_row.id
  order by created_at asc
  limit 1;

  select *
    into agreement_row
  from public.referral_agreements
  where referral_id = referral_row.id
  order by version desc
  limit 1;

  return jsonb_build_object(
    'success', true,
    'invite', jsonb_build_object(
      'id', invite_row.id,
      'referral_id', invite_row.referral_id,
      'token', invite_row.token,
      'email', invite_row.email,
      'status', invite_row.status,
      'expires_at', invite_row.expires_at,
      'first_sent_at', invite_row.first_sent_at,
      'last_sent_at', invite_row.last_sent_at,
      'accepted_at', invite_row.accepted_at,
      'accepted_by_user_id', invite_row.accepted_by_user_id,
      'declined_at', invite_row.declined_at,
      'declined_by_user_id', invite_row.declined_by_user_id,
      'decline_reason', invite_row.decline_reason,
      'metadata', invite_row.metadata,
      'created_at', invite_row.created_at,
      'updated_at', invite_row.updated_at
    ),
    'referral', jsonb_build_object(
      'id', referral_row.id,
      'source_organisation_id', referral_row.source_organisation_id,
      'source_lead_id', referral_row.source_lead_id,
      'source_lead_type', referral_row.source_lead_type,
      'referral_type', referral_row.referral_type,
      'related_listing_id', referral_row.related_listing_id,
      'source_branch_id', referral_row.source_branch_id,
      'source_agent_id', referral_row.source_agent_id,
      'source_agent_name', referral_row.source_agent_name,
      'source_agent_email', referral_row.source_agent_email,
      'target_organisation_id', referral_row.target_organisation_id,
      'target_branch_id', referral_row.target_branch_id,
      'target_agent_id', referral_row.target_agent_id,
      'target_agent_name', referral_row.target_agent_name,
      'target_agent_email', referral_row.target_agent_email,
      'target_company_name', referral_row.target_company_name,
      'recipient_scope', referral_row.recipient_scope,
      'status', referral_row.status,
      'commission_split_percentage', referral_row.commission_split_percentage,
      'commission_split_basis', referral_row.commission_split_basis,
      'agreement_status', referral_row.agreement_status,
      'agreement_text', referral_row.agreement_text,
      'protection_period_days', referral_row.protection_period_days,
      'accepted_at', referral_row.accepted_at,
      'accepted_by_user_id', referral_row.accepted_by_user_id,
      'accepted_by_email', referral_row.accepted_by_email,
      'declined_at', referral_row.declined_at,
      'declined_by_user_id', referral_row.declined_by_user_id,
      'declined_by_email', referral_row.declined_by_email,
      'decline_reason', referral_row.decline_reason,
      'agreement_locked_at', referral_row.agreement_locked_at,
      'invite_token', referral_row.invite_token,
      'invite_expires_at', referral_row.invite_expires_at,
      'notes', referral_row.notes,
      'created_at', referral_row.created_at,
      'updated_at', referral_row.updated_at
    ),
    'client', case
      when client_row.id is null then null
      else jsonb_build_object(
        'id', client_row.id,
        'referral_id', client_row.referral_id,
        'source_organisation_id', client_row.source_organisation_id,
        'source_lead_id', client_row.source_lead_id,
        'client_type', client_row.client_type,
        'client_name', client_row.client_name,
        'client_email', client_row.client_email,
        'client_phone', client_row.client_phone,
        'client_context', client_row.client_context,
        'client_status', client_row.client_status,
        'metadata', client_row.metadata,
        'created_at', client_row.created_at,
        'updated_at', client_row.updated_at
      )
    end,
    'agreement', case
      when agreement_row.id is null then null
      else jsonb_build_object(
        'id', agreement_row.id,
        'referral_id', agreement_row.referral_id,
        'version', agreement_row.version,
        'status', agreement_row.status,
        'commission_split_percentage', agreement_row.commission_split_percentage,
        'commission_split_basis', agreement_row.commission_split_basis,
        'agreement_text', agreement_row.agreement_text,
        'protection_period_days', agreement_row.protection_period_days,
        'sent_at', agreement_row.sent_at,
        'accepted_at', agreement_row.accepted_at,
        'accepted_by_user_id', agreement_row.accepted_by_user_id,
        'accepted_by_email', agreement_row.accepted_by_email,
        'declined_at', agreement_row.declined_at,
        'declined_by_user_id', agreement_row.declined_by_user_id,
        'declined_by_email', agreement_row.declined_by_email,
        'decline_reason', agreement_row.decline_reason,
        'locked_at', agreement_row.locked_at,
        'created_by', agreement_row.created_by,
        'created_at', agreement_row.created_at,
        'updated_at', agreement_row.updated_at
      )
    end
  );
end;
$body$;
$function$;

    execute 'drop function if exists public.bridge_respond_referral_invite(text, text, text, text)';

    execute $function$
create or replace function public.bridge_respond_referral_invite(
  p_token text,
  p_action text,
  p_actor_email text default null,
  p_actor_name text default null,
  p_decline_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $body$
declare
  invite_row public.referral_invites%rowtype;
  referral_row public.lead_referrals%rowtype;
  agreement_row public.referral_agreements%rowtype;
  normalized_action text := lower(trim(coalesce(p_action, '')));
  actor_email text := nullif(trim(coalesce(p_actor_email, '')), '');
  actor_name text := nullif(trim(coalesce(p_actor_name, '')), '');
  normalized_decline_reason text := nullif(trim(coalesce(p_decline_reason, '')), '');
  previous_referral_status text;
  next_invite_status text;
  next_referral_status text;
  next_agreement_status text;
  next_client_status text;
begin
  if normalized_action not in ('accept', 'accepted', 'decline', 'declined') then
    return jsonb_build_object('success', false, 'code', 'invalid_action');
  end if;

  if normalized_action in ('decline', 'declined') and normalized_decline_reason is null then
    return jsonb_build_object('success', false, 'code', 'decline_reason_required');
  end if;

  select *
    into invite_row
  from public.referral_invites
  where token = nullif(trim(p_token), '')
  limit 1;

  if invite_row.id is null then
    return jsonb_build_object('success', false, 'code', 'not_found');
  end if;

  if invite_row.expires_at is not null and invite_row.expires_at < now() and invite_row.status in ('pending', 'sent') then
    update public.referral_invites
      set status = 'expired',
          updated_at = now()
    where id = invite_row.id;
    return jsonb_build_object('success', false, 'code', 'expired');
  end if;

  if invite_row.status = 'accepted' then
    return jsonb_build_object('success', false, 'code', 'already_accepted');
  end if;

  if invite_row.status in ('declined', 'expired', 'revoked') then
    return jsonb_build_object('success', false, 'code', invite_row.status);
  end if;

  select *
    into referral_row
  from public.lead_referrals
  where id = invite_row.referral_id
  limit 1;

  if referral_row.id is null then
    return jsonb_build_object('success', false, 'code', 'not_found');
  end if;

  previous_referral_status := referral_row.status;

  if referral_row.status = 'accepted' then
    return jsonb_build_object('success', false, 'code', 'already_accepted');
  end if;

  if referral_row.status = 'declined' then
    return jsonb_build_object('success', false, 'code', 'declined');
  end if;

  if referral_row.status in ('converted', 'commission_due', 'paid', 'cancelled') then
    return jsonb_build_object('success', false, 'code', 'status_locked');
  end if;

  if normalized_action in ('accept', 'accepted') then
    next_invite_status := 'accepted';
    next_referral_status := 'accepted';
    next_agreement_status := 'accepted';
    next_client_status := 'accepted';
  else
    next_invite_status := 'declined';
    next_referral_status := 'declined';
    next_agreement_status := 'declined';
    next_client_status := 'archived';
  end if;

  update public.referral_invites
    set status = next_invite_status,
        accepted_at = case when next_invite_status = 'accepted' then now() else accepted_at end,
        accepted_by_user_id = case when next_invite_status = 'accepted' then auth.uid() else accepted_by_user_id end,
        declined_at = case when next_invite_status = 'declined' then now() else declined_at end,
        declined_by_user_id = case when next_invite_status = 'declined' then auth.uid() else declined_by_user_id end,
        decline_reason = case
          when next_invite_status = 'accepted' then null
          when next_invite_status = 'declined' then normalized_decline_reason
          else decline_reason
        end,
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('actor_name', actor_name),
        updated_at = now()
  where id = invite_row.id;

  update public.lead_referrals
    set status = next_referral_status,
        agreement_status = next_agreement_status,
        accepted_at = case when next_referral_status = 'accepted' then now() else accepted_at end,
        accepted_by_user_id = case when next_referral_status = 'accepted' then auth.uid() else accepted_by_user_id end,
        accepted_by_email = case when next_referral_status = 'accepted' then coalesce(actor_email, invite_row.email, target_agent_email) else accepted_by_email end,
        declined_at = case when next_referral_status = 'declined' then now() else declined_at end,
        declined_by_user_id = case when next_referral_status = 'declined' then auth.uid() else declined_by_user_id end,
        declined_by_email = case when next_referral_status = 'declined' then coalesce(actor_email, invite_row.email, target_agent_email) else declined_by_email end,
        decline_reason = case
          when next_referral_status = 'accepted' then null
          when next_referral_status = 'declined' then normalized_decline_reason
          else decline_reason
        end,
        agreement_locked_at = case when next_referral_status = 'accepted' then now() else agreement_locked_at end,
        updated_at = now()
  where id = referral_row.id
  returning * into referral_row;

  select *
    into agreement_row
  from public.referral_agreements
  where referral_id = referral_row.id
  order by version desc
  limit 1;

  if agreement_row.id is not null then
    update public.referral_agreements
      set status = next_agreement_status,
          accepted_at = case when next_agreement_status = 'accepted' then now() else accepted_at end,
          accepted_by_user_id = case when next_agreement_status = 'accepted' then auth.uid() else accepted_by_user_id end,
          accepted_by_email = case when next_agreement_status = 'accepted' then coalesce(actor_email, invite_row.email, referral_row.target_agent_email) else accepted_by_email end,
          declined_at = case when next_agreement_status = 'declined' then now() else declined_at end,
          declined_by_user_id = case when next_agreement_status = 'declined' then auth.uid() else declined_by_user_id end,
          declined_by_email = case when next_agreement_status = 'declined' then coalesce(actor_email, invite_row.email, referral_row.target_agent_email) else declined_by_email end,
          decline_reason = case
            when next_agreement_status = 'accepted' then null
            when next_agreement_status = 'declined' then normalized_decline_reason
            else decline_reason
          end,
          locked_at = case when next_agreement_status = 'accepted' then now() else locked_at end,
          updated_at = now()
    where id = agreement_row.id;
  end if;

  update public.referral_clients
    set client_status = next_client_status,
        updated_at = now()
  where referral_id = referral_row.id;

  insert into public.referral_status_events (
    referral_id,
    from_status,
    to_status,
    event_type,
    event_note,
    actor_id,
    actor_email,
    metadata
  )
  values (
    referral_row.id,
    previous_referral_status,
    next_referral_status,
    'invite_response',
    case when next_referral_status = 'accepted' then 'Referral invite accepted.' else 'Referral invite declined.' end,
    auth.uid(),
    coalesce(actor_email, invite_row.email),
    jsonb_build_object(
      'actor_name', actor_name,
      'invite_id', invite_row.id,
      'response_action', next_referral_status,
      'decline_reason', normalized_decline_reason,
      'agreement_id', agreement_row.id
    )
  );

  return public.bridge_lookup_referral_invite_by_token(p_token) || jsonb_build_object('response_status', next_referral_status);
end;
$body$;
$function$;

    execute 'grant execute on function public.bridge_lookup_referral_invite_by_token(text) to anon, authenticated';
    execute 'grant execute on function public.bridge_respond_referral_invite(text, text, text, text, text) to anon, authenticated';
  end if;
end $$;

commit;
