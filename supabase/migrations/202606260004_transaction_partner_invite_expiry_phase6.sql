create or replace function public.bridge_expire_stale_transaction_partner_invitations(
  p_transaction_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.transaction_partner_invitations%rowtype;
  v_now timestamptz := now();
  v_count integer := 0;
begin
  for v_invite in
    select *
    from public.transaction_partner_invitations
    where status = 'pending'
      and expires_at < v_now
      and (p_transaction_id is null or transaction_id = p_transaction_id)
      and public.bridge_can_access_transaction_spine(transaction_id)
    for update
  loop
    update public.transaction_partner_invitations
    set status = 'expired',
        invitation_token = null,
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'expiredAt', v_now,
          'expiredBySync', true
        ),
        updated_at = v_now
    where id = v_invite.id;

    perform public.bridge_log_transaction_partner_invitation_event(
      v_invite.transaction_id,
      'Invitation Expired',
      auth.uid(),
      jsonb_build_object(
        'invitationId', v_invite.id,
        'roleType', v_invite.role_type,
        'companyName', v_invite.company_name,
        'contactName', v_invite.contact_name,
        'email', v_invite.email,
        'expiredAt', v_now,
        'source', 'manager_expiry_sync'
      )
    );

    v_count := v_count + 1;
  end loop;

  return jsonb_build_object(
    'success', true,
    'transactionId', p_transaction_id,
    'expiredCount', v_count
  );
end;
$$;

grant execute on function public.bridge_expire_stale_transaction_partner_invitations(uuid) to authenticated;
