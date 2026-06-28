create or replace function public.bridge_record_transaction_partner_invitation_action(
  p_invitation_id uuid,
  p_action text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.transaction_partner_invitations%rowtype;
  v_now timestamptz := now();
  v_action text := lower(coalesce(nullif(trim(p_action), ''), 'activity_recorded'));
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_copy_count integer := 0;
  v_event_type text := 'Invitation Activity Recorded';
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

  if v_action = 'link_copied' then
    if coalesce(v_invite.metadata ->> 'linkCopyCount', '') ~ '^[0-9]+$' then
      v_copy_count := (v_invite.metadata ->> 'linkCopyCount')::integer;
    end if;

    update public.transaction_partner_invitations
    set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'lastLinkCopiedAt', v_now,
          'lastLinkCopiedBy', auth.uid(),
          'linkCopyCount', v_copy_count + 1
        ),
        updated_at = v_now
    where id = v_invite.id
    returning * into v_invite;

    v_event_type := 'Invitation Link Copied';
  end if;

  perform public.bridge_log_transaction_partner_invitation_event(
    v_invite.transaction_id,
    v_event_type,
    auth.uid(),
    jsonb_build_object(
      'invitationId', v_invite.id,
      'roleType', v_invite.role_type,
      'companyName', v_invite.company_name,
      'contactName', v_invite.contact_name,
      'email', v_invite.email,
      'action', v_action,
      'metadata', v_metadata,
      'linkCopyCount', case when v_action = 'link_copied' then v_copy_count + 1 else 0 end
    )
  );

  return jsonb_build_object(
    'success', true,
    'transactionId', v_invite.transaction_id,
    'invitationId', v_invite.id,
    'action', v_action,
    'metadata', v_invite.metadata
  );
end;
$$;

grant execute on function public.bridge_record_transaction_partner_invitation_action(uuid, text, jsonb) to authenticated;
