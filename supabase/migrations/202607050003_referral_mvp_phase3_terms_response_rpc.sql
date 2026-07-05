begin;

do $$
begin
  if to_regclass('public.lead_referrals') is not null
     and to_regclass('public.referral_agreements') is not null
     and to_regclass('public.referral_clients') is not null
     and to_regclass('public.referral_status_events') is not null then
    execute $function$
create or replace function public.bridge_respond_referral_terms(
  p_referral_id uuid,
  p_action text,
  p_decline_reason text default null,
  p_event_note text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $body$
declare
  referral_row public.lead_referrals%rowtype;
  agreement_row public.referral_agreements%rowtype;
  client_row public.referral_clients%rowtype;
  normalized_action text := lower(trim(coalesce(p_action, '')));
  normalized_decline_reason text := nullif(trim(coalesce(p_decline_reason, '')), '');
  event_note text := nullif(trim(coalesce(p_event_note, '')), '');
  event_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
  actor_id uuid := auth.uid();
  actor_email text := public.bridge_current_email();
  previous_referral_status text;
  next_referral_status text;
  next_agreement_status text;
  next_client_status text;
begin
  if actor_id is null then
    return jsonb_build_object('success', false, 'code', 'unauthenticated');
  end if;

  if normalized_action in ('accept', 'accepted') then
    next_referral_status := 'accepted';
    next_agreement_status := 'accepted';
    next_client_status := 'accepted';
  elsif normalized_action in ('decline', 'declined', 'reject', 'rejected') then
    next_referral_status := 'declined';
    next_agreement_status := 'declined';
    next_client_status := 'archived';
  elsif normalized_action in ('review', 'needs_review', 'manual_discussion', 'dispute', 'disputed') then
    next_referral_status := 'needs_review';
    next_agreement_status := null;
    next_client_status := 'referred';
  else
    return jsonb_build_object('success', false, 'code', 'invalid_action');
  end if;

  if next_referral_status = 'declined' and normalized_decline_reason is null then
    return jsonb_build_object('success', false, 'code', 'decline_reason_required');
  end if;

  select *
    into referral_row
  from public.lead_referrals
  where id = p_referral_id
  limit 1;

  if referral_row.id is null then
    return jsonb_build_object('success', false, 'code', 'not_found');
  end if;
  previous_referral_status := referral_row.status;

  if not (
    public.bridge_is_active_member(referral_row.source_organisation_id)
    or public.bridge_is_active_member(referral_row.target_organisation_id)
    or referral_row.source_agent_id = actor_id
    or referral_row.target_agent_id = actor_id
    or lower(coalesce(referral_row.source_agent_email, '')) = lower(coalesce(actor_email, ''))
    or lower(coalesce(referral_row.target_agent_email, '')) = lower(coalesce(actor_email, ''))
  ) then
    return jsonb_build_object('success', false, 'code', 'forbidden');
  end if;

  if referral_row.status = 'accepted' then
    return jsonb_build_object('success', false, 'code', 'already_accepted');
  end if;

  if referral_row.status = 'declined' then
    return jsonb_build_object('success', false, 'code', 'already_declined');
  end if;

  if referral_row.status in ('converted', 'commission_due', 'paid', 'cancelled') then
    return jsonb_build_object('success', false, 'code', 'status_locked');
  end if;

  if next_referral_status = 'needs_review' then
    next_agreement_status := referral_row.agreement_status;
  end if;

  update public.lead_referrals
    set status = next_referral_status,
        agreement_status = next_agreement_status,
        accepted_at = case when next_referral_status = 'accepted' then now() else accepted_at end,
        accepted_by_user_id = case when next_referral_status = 'accepted' then actor_id else accepted_by_user_id end,
        accepted_by_email = case when next_referral_status = 'accepted' then coalesce(nullif(actor_email, ''), target_agent_email) else accepted_by_email end,
        declined_at = case when next_referral_status = 'declined' then now() else declined_at end,
        declined_by_user_id = case when next_referral_status = 'declined' then actor_id else declined_by_user_id end,
        declined_by_email = case when next_referral_status = 'declined' then coalesce(nullif(actor_email, ''), target_agent_email) else declined_by_email end,
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
          accepted_at = case when next_referral_status = 'accepted' then now() else accepted_at end,
          accepted_by_user_id = case when next_referral_status = 'accepted' then actor_id else accepted_by_user_id end,
          accepted_by_email = case when next_referral_status = 'accepted' then coalesce(nullif(actor_email, ''), referral_row.target_agent_email) else accepted_by_email end,
          declined_at = case when next_referral_status = 'declined' then now() else declined_at end,
          declined_by_user_id = case when next_referral_status = 'declined' then actor_id else declined_by_user_id end,
          declined_by_email = case when next_referral_status = 'declined' then coalesce(nullif(actor_email, ''), referral_row.target_agent_email) else declined_by_email end,
          decline_reason = case
            when next_referral_status = 'accepted' then null
            when next_referral_status = 'declined' then normalized_decline_reason
            else decline_reason
          end,
          locked_at = case when next_referral_status = 'accepted' then now() else locked_at end,
          updated_at = now()
    where id = agreement_row.id
    returning * into agreement_row;
  end if;

  update public.referral_clients
    set client_status = next_client_status,
        updated_at = now()
  where referral_id = referral_row.id;

  select *
    into client_row
  from public.referral_clients
  where referral_id = referral_row.id
  order by created_at asc
  limit 1;

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
    case when next_referral_status = 'needs_review' then 'terms_needs_review' else 'terms_response' end,
    coalesce(
      event_note,
      case
        when next_referral_status = 'accepted' then 'Referral terms accepted.'
        when next_referral_status = 'declined' then 'Referral terms declined.'
        else 'Referral terms marked for manual discussion.'
      end
    ),
    actor_id,
    actor_email,
    event_metadata || jsonb_build_object(
      'response_action', next_referral_status,
      'decline_reason', normalized_decline_reason,
      'agreement_id', agreement_row.id
    )
  );

  return jsonb_build_object(
    'success', true,
    'response_status', next_referral_status,
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
        'client_type', client_row.client_type,
        'client_name', client_row.client_name,
        'client_email', client_row.client_email,
        'client_phone', client_row.client_phone,
        'client_context', client_row.client_context,
        'client_status', client_row.client_status,
        'created_at', client_row.created_at,
        'updated_at', client_row.updated_at
      )
    end,
    'agreement', case
      when agreement_row.id is null then null
      else jsonb_build_object(
        'id', agreement_row.id,
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
        'created_at', agreement_row.created_at,
        'updated_at', agreement_row.updated_at
      )
    end
  );
end;
$body$;
$function$;

    execute 'grant execute on function public.bridge_respond_referral_terms(uuid, text, text, text, jsonb) to authenticated';
  end if;
end $$;

commit;
