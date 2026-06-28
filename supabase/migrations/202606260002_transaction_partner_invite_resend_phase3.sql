create or replace function public.bridge_resend_transaction_partner_invitation(p_invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.transaction_partner_invitations%rowtype;
  v_token uuid := gen_random_uuid();
  v_now timestamptz := now();
begin
  select *
  into v_invite
  from public.transaction_partner_invitations
  where id = p_invitation_id
  for update;

  if v_invite.id is null then
    return jsonb_build_object('success', false, 'code', 'invitation_not_found');
  end if;

  if not public.bridge_can_access_transaction_spine(v_invite.transaction_id) then
    return jsonb_build_object('success', false, 'code', 'not_authorized');
  end if;

  if v_invite.status = 'accepted' then
    return jsonb_build_object(
      'success', false,
      'code', 'invitation_already_accepted',
      'transactionId', v_invite.transaction_id,
      'invitationId', v_invite.id
    );
  end if;

  update public.transaction_partner_invitations
  set status = 'pending',
      invitation_token = v_token,
      expires_at = v_now + interval '30 days',
      resent_at = v_now,
      declined_at = null,
      accepted_at = null,
      accepted_user_id = null,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'lastResentAt', v_now,
        'lastResentBy', auth.uid()
      )
  where id = v_invite.id
  returning * into v_invite;

  perform public.bridge_log_transaction_partner_invitation_event(
    v_invite.transaction_id,
    'Invitation Resent',
    auth.uid(),
    jsonb_build_object(
      'invitationId', v_invite.id,
      'roleType', v_invite.role_type,
      'companyName', v_invite.company_name,
      'contactName', v_invite.contact_name,
      'email', v_invite.email
    )
  );

  return jsonb_build_object(
    'success', true,
    'transactionId', v_invite.transaction_id,
    'invitationId', v_invite.id,
    'token', v_token,
    'expiresAt', v_invite.expires_at,
    'invitation', jsonb_build_object(
      'id', v_invite.id,
      'transaction_id', v_invite.transaction_id,
      'transactionId', v_invite.transaction_id,
      'partner_prospect_id', v_invite.partner_prospect_id,
      'partnerProspectId', v_invite.partner_prospect_id,
      'role_type', v_invite.role_type,
      'roleType', v_invite.role_type,
      'company_name', v_invite.company_name,
      'companyName', v_invite.company_name,
      'contact_name', v_invite.contact_name,
      'contactName', v_invite.contact_name,
      'email', v_invite.email,
      'phone', v_invite.phone,
      'status', v_invite.status,
      'invitation_token', v_token,
      'invitationToken', v_token,
      'expires_at', v_invite.expires_at,
      'expiresAt', v_invite.expires_at,
      'resent_at', v_invite.resent_at,
      'resentAt', v_invite.resent_at
    )
  );
end;
$$;

create or replace function public.bridge_record_transaction_partner_invitation_delivery(
  p_invitation_id uuid,
  p_delivery_event text,
  p_delivery jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.transaction_partner_invitations%rowtype;
  v_now timestamptz := now();
  v_delivery_event text := coalesce(nullif(trim(p_delivery_event), ''), 'email_attempted');
  v_delivery jsonb := coalesce(p_delivery, '{}'::jsonb);
  v_count integer := 0;
begin
  select *
  into v_invite
  from public.transaction_partner_invitations
  where id = p_invitation_id
  for update;

  if v_invite.id is null then
    return jsonb_build_object('success', false, 'code', 'invitation_not_found');
  end if;

  if not public.bridge_can_access_transaction_spine(v_invite.transaction_id) then
    return jsonb_build_object('success', false, 'code', 'not_authorized');
  end if;

  if coalesce(v_invite.metadata ->> 'emailDeliveryCount', '') ~ '^[0-9]+$' then
    v_count := (v_invite.metadata ->> 'emailDeliveryCount')::integer;
  end if;

  v_delivery := v_delivery || jsonb_build_object(
    'event', v_delivery_event,
    'recordedAt', v_now,
    'recordedBy', auth.uid()
  );

  update public.transaction_partner_invitations
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'lastEmailDelivery', v_delivery,
        'emailDeliveryCount', v_count + 1
      ),
      updated_at = v_now
  where id = v_invite.id
  returning * into v_invite;

  perform public.bridge_log_transaction_partner_invitation_event(
    v_invite.transaction_id,
    case when coalesce(v_delivery ->> 'sent', 'false') = 'true'
      then 'Invitation Email Delivered'
      else 'Invitation Email Delivery Failed'
    end,
    auth.uid(),
    jsonb_build_object(
      'invitationId', v_invite.id,
      'roleType', v_invite.role_type,
      'companyName', v_invite.company_name,
      'email', v_invite.email,
      'delivery', v_delivery
    )
  );

  return jsonb_build_object(
    'success', true,
    'invitationId', v_invite.id,
    'transactionId', v_invite.transaction_id,
    'delivery', v_delivery
  );
end;
$$;

grant execute on function public.bridge_resend_transaction_partner_invitation(uuid) to authenticated;
grant execute on function public.bridge_record_transaction_partner_invitation_delivery(uuid, text, jsonb) to authenticated;
