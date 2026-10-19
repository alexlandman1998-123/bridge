-- Align the privileged creation bootstrap with the installed multi-buyer indexes.
-- No data backfill and no change to helper access grants.
CREATE OR REPLACE FUNCTION public.bridge_seed_mvp_transaction_participants(p_transaction_id uuid, p_bootstrap jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_item jsonb;
  v_participant_id uuid;
begin
  for v_item in select value from jsonb_array_elements(coalesce(p_bootstrap->'requirements', '[]'::jsonb)) loop
    insert into public.transaction_participant_requirements (
      transaction_id, role_key, role_type, legal_role, transaction_role, required_by,
      required_at_creation, label, reason
    ) values (
      p_transaction_id, v_item->>'roleKey', v_item->>'roleType', coalesce(v_item->>'legalRole', 'none'),
      v_item->>'transactionRole', v_item->>'requiredBy', coalesce((v_item->>'requiredAtCreation')::boolean, false),
      v_item->>'label', nullif(v_item->>'reason', '')
    ) on conflict (transaction_id, role_key) do update set
      role_type = excluded.role_type,
      legal_role = excluded.legal_role,
      transaction_role = excluded.transaction_role,
      required_by = excluded.required_by,
      required_at_creation = excluded.required_at_creation,
      label = excluded.label,
      reason = excluded.reason,
      updated_at = now();
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_bootstrap->'participants', '[]'::jsonb)) loop
    if v_item->>'transactionRole' = 'buyer' then
      -- Bootstrap represents the transaction's primary buyer only. Additional
      -- buyers are maintained by the multi-buyer workflow, never merged here.
      insert into public.transaction_participants (
        transaction_id, buyer_party_id, user_id, role_type, legal_role, transaction_role,
        status, visibility_scope, is_internal, participant_name, participant_email,
        participant_phone, buyer_party_role, buyer_party_position, is_primary_buyer,
        can_view, can_comment, can_upload_documents, can_edit_finance_workflow,
        can_edit_attorney_workflow, can_edit_core_transaction
      ) select
        p_transaction_id, t.buyer_id, nullif(v_item->>'userId', '')::uuid,
        v_item->>'roleType', coalesce(v_item->>'legalRole', 'none'), 'buyer',
        'active', 'shared', false, nullif(v_item->>'name', ''), nullif(lower(v_item->>'email'), ''),
        t.buyer_phone, 'primary_buyer', 0, true,
        true, true, true, false, false, false
      from public.transactions t where t.id = p_transaction_id
      on conflict (transaction_id)
        where transaction_role = 'buyer' and is_primary_buyer = true
          and coalesce(status, 'active') not in ('inactive', 'removed', 'archived', 'deleted')
      do update set
        user_id = coalesce(excluded.user_id, public.transaction_participants.user_id),
        buyer_party_id = coalesce(public.transaction_participants.buyer_party_id, excluded.buyer_party_id),
        participant_name = coalesce(excluded.participant_name, public.transaction_participants.participant_name),
        participant_email = coalesce(excluded.participant_email, public.transaction_participants.participant_email),
        participant_phone = coalesce(excluded.participant_phone, public.transaction_participants.participant_phone),
        updated_at = now()
      returning id into v_participant_id;
      update public.transactions set primary_buyer_participant_id = v_participant_id
      where id = p_transaction_id and primary_buyer_participant_id is distinct from v_participant_id;
    else
    insert into public.transaction_participants (
      transaction_id, user_id, role_type, legal_role, transaction_role, status,
      visibility_scope, is_internal, participant_name, participant_email,
      can_view, can_comment, can_upload_documents, can_edit_finance_workflow,
      can_edit_attorney_workflow, can_edit_core_transaction
    ) values (
      p_transaction_id, nullif(v_item->>'userId', '')::uuid, v_item->>'roleType',
      coalesce(v_item->>'legalRole', 'none'), v_item->>'transactionRole', 'active',
      'shared', false, nullif(v_item->>'name', ''), nullif(lower(v_item->>'email'), ''),
      true, true, true, false, false, false
    ) on conflict (transaction_id, role_type, legal_role)
      where coalesce(transaction_role, '') <> 'buyer'
    do update set
      user_id = coalesce(excluded.user_id, public.transaction_participants.user_id),
      participant_name = coalesce(excluded.participant_name, public.transaction_participants.participant_name),
      participant_email = coalesce(excluded.participant_email, public.transaction_participants.participant_email),
      transaction_role = excluded.transaction_role,
      status = excluded.status,
      visibility_scope = excluded.visibility_scope,
      updated_at = now()
    returning id into v_participant_id;
    end if;

    update public.transaction_participant_requirements
    set participant_id = v_participant_id, status = 'captured', updated_at = now()
    where transaction_id = p_transaction_id and role_key = v_item->>'roleKey';
  end loop;
end;
$function$
