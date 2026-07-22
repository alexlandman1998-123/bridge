begin;

create or replace function public.bridge_can_manage_matter_financials(
  target_transaction_id uuid,
  target_attorney_firm_id uuid default null,
  target_attorney_assignment_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    auth.uid() is not null
    and (
      public.bridge_transaction_scope_is_internal_user()
      or (
        target_attorney_firm_id is not null
        and public.attorney_user_is_firm_lead(target_attorney_firm_id)
      )
      or exists (
        select 1
        from public.transaction_attorney_assignments assignment
        where assignment.transaction_id = target_transaction_id
          and coalesce(assignment.assignment_status, assignment.status, 'active') <> 'removed'
          and (
            target_attorney_assignment_id is null
            or assignment.id = target_attorney_assignment_id
          )
          and (
            assignment.primary_attorney_id = auth.uid()
            or assignment.secretary_id = auth.uid()
            or assignment.admin_handler_id = auth.uid()
            or assignment.attorney_user_id = auth.uid()
            or assignment.assigned_user_id = auth.uid()
            or (
              target_attorney_firm_id is not null
              and public.attorney_user_is_firm_lead(coalesce(assignment.attorney_firm_id, assignment.firm_id))
            )
          )
      )
    ),
    false
  );
$$;

create or replace function public.bridge_matter_financial_party_role(
  p_role_type text,
  p_transaction_role text default null
)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when lower(coalesce(p_transaction_role, p_role_type, '')) in ('buyer', 'purchaser')
      or lower(coalesce(p_role_type, '')) in ('buyer', 'client', 'purchaser')
      then 'buyer'
    when lower(coalesce(p_transaction_role, p_role_type, '')) in ('seller', 'vendor')
      or lower(coalesce(p_role_type, '')) in ('seller', 'vendor')
      then 'seller'
    else null
  end;
$$;

create or replace function public.bridge_preferred_matter_financial_assignment(
  p_transaction_id uuid
)
returns table (
  attorney_assignment_id uuid,
  attorney_firm_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select
    assignment.id,
    coalesce(assignment.attorney_firm_id, assignment.firm_id) as attorney_firm_id
  from public.transaction_attorney_assignments assignment
  where assignment.transaction_id = p_transaction_id
    and coalesce(assignment.assignment_status, assignment.status, 'active') <> 'removed'
    and coalesce(assignment.instruction_status, 'new_instruction') <> 'declined'
  order by
    case
      when lower(coalesce(assignment.attorney_role, assignment.assignment_type, assignment.matter_type, '')) in ('transfer_attorney', 'transfer', 'transfer_and_bond') then 0
      when lower(coalesce(assignment.attorney_role, assignment.assignment_type, assignment.matter_type, '')) in ('bond_attorney', 'bond') then 1
      else 2
    end,
    assignment.updated_at desc nulls last,
    assignment.assigned_at desc nulls last,
    assignment.created_at desc nulls last
  limit 1;
$$;

create unique index if not exists matter_financial_accounts_active_participant_unique
  on public.matter_financial_accounts (participant_id)
  where participant_id is not null
    and status <> 'archived';

create or replace function public.bridge_sync_matter_financial_account_from_participant(
  p_participant_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_participant public.transaction_participants%rowtype;
  v_party_role text;
  v_attorney_assignment_id uuid;
  v_attorney_firm_id uuid;
  v_account_id uuid;
  v_party_label text;
  v_party_email text;
begin
  select *
  into v_participant
  from public.transaction_participants
  where id = p_participant_id;

  if v_participant.id is null then
    return null;
  end if;

  if auth.uid() is not null
     and not public.bridge_can_access_transaction_spine(v_participant.transaction_id) then
    return null;
  end if;

  v_party_role := public.bridge_matter_financial_party_role(
    v_participant.role_type,
    v_participant.transaction_role
  );

  if v_party_role is null or coalesce(v_participant.status, 'active') = 'removed' then
    update public.matter_financial_accounts
       set status = 'archived',
           portal_enabled = false,
           updated_at = now(),
           metadata_json = coalesce(metadata_json, '{}'::jsonb)
             || jsonb_build_object(
               'archivedBy', 'bridge_sync_matter_financial_account_from_participant',
               'archivedReason', case
                 when v_party_role is null then 'participant_role_no_longer_buyer_or_seller'
                 else 'participant_removed'
               end,
               'archivedAt', now()
             )
     where participant_id = v_participant.id
       and status <> 'archived'
     returning id into v_account_id;

    return v_account_id;
  end if;

  select assignment.attorney_assignment_id, assignment.attorney_firm_id
  into v_attorney_assignment_id, v_attorney_firm_id
  from public.bridge_preferred_matter_financial_assignment(v_participant.transaction_id) as assignment;

  v_party_label := nullif(trim(coalesce(v_participant.participant_name, '')), '');
  v_party_email := lower(nullif(trim(coalesce(v_participant.participant_email, '')), ''));

  select id
  into v_account_id
  from public.matter_financial_accounts
  where participant_id = v_participant.id
    and status <> 'archived'
  limit 1;

  if v_account_id is null then
    insert into public.matter_financial_accounts (
      transaction_id,
      attorney_firm_id,
      attorney_assignment_id,
      participant_id,
      party_role,
      party_ref,
      party_label,
      party_email,
      party_phone,
      currency_code,
      status,
      opening_balance,
      portal_enabled,
      notes,
      metadata_json
    )
    values (
      v_participant.transaction_id,
      v_attorney_firm_id,
      v_attorney_assignment_id,
      v_participant.id,
      v_party_role,
      v_participant.id::text,
      v_party_label,
      v_party_email,
      null,
      'ZAR',
      'active',
      0,
      true,
      'Bootstrapped from transaction participant. No legacy financial amounts were imported.',
      jsonb_build_object(
        'source', 'transaction_participant',
        'sourceParticipantId', v_participant.id,
        'sourceRoleType', v_participant.role_type,
        'sourceTransactionRole', v_participant.transaction_role,
        'phase', 'attorney_accounting_phase1_2',
        'amountBackfillPolicy', 'none'
      )
    )
    returning id into v_account_id;

    insert into public.matter_financial_account_events (
      financial_account_id,
      transaction_id,
      event_type,
      event_visibility,
      actor_role,
      payload_json
    )
    values (
      v_account_id,
      v_participant.transaction_id,
      'account_bootstrapped',
      'internal',
      'system',
      jsonb_build_object(
        'source', 'transaction_participant',
        'participantId', v_participant.id,
        'partyRole', v_party_role,
        'amountBackfillPolicy', 'none'
      )
    );
  else
    update public.matter_financial_accounts
       set transaction_id = v_participant.transaction_id,
           attorney_firm_id = coalesce(matter_financial_accounts.attorney_firm_id, v_attorney_firm_id),
           attorney_assignment_id = coalesce(matter_financial_accounts.attorney_assignment_id, v_attorney_assignment_id),
           party_role = v_party_role,
           party_ref = v_participant.id::text,
           party_label = coalesce(v_party_label, matter_financial_accounts.party_label),
           party_email = coalesce(v_party_email, matter_financial_accounts.party_email),
           status = 'active',
           portal_enabled = true,
           updated_at = now(),
           metadata_json = coalesce(matter_financial_accounts.metadata_json, '{}'::jsonb)
             || jsonb_build_object(
               'source', 'transaction_participant',
               'sourceParticipantId', v_participant.id,
               'sourceRoleType', v_participant.role_type,
               'sourceTransactionRole', v_participant.transaction_role,
               'lastParticipantSyncAt', now(),
               'amountBackfillPolicy', 'none'
             )
     where id = v_account_id;
  end if;

  return v_account_id;
end;
$$;

create or replace function public.bridge_sync_matter_financial_account_from_participant_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.bridge_sync_matter_financial_account_from_participant(new.id);
  return new;
end;
$$;

drop trigger if exists trg_sync_matter_financial_account_from_participant on public.transaction_participants;
create trigger trg_sync_matter_financial_account_from_participant
after insert or update of role_type, transaction_role, participant_name, participant_email, status
on public.transaction_participants
for each row
execute function public.bridge_sync_matter_financial_account_from_participant_trigger();

do $$
declare
  participant_record record;
begin
  for participant_record in
    select participant.id
    from public.transaction_participants participant
    where public.bridge_matter_financial_party_role(
      participant.role_type,
      participant.transaction_role
    ) in ('buyer', 'seller')
      and coalesce(participant.status, 'active') <> 'removed'
  loop
    perform public.bridge_sync_matter_financial_account_from_participant(participant_record.id);
  end loop;
end;
$$;

revoke all on function public.bridge_preferred_matter_financial_assignment(uuid) from public, anon, authenticated;
revoke all on function public.bridge_sync_matter_financial_account_from_participant(uuid) from public, anon, authenticated;
revoke all on function public.bridge_sync_matter_financial_account_from_participant_trigger() from public, anon, authenticated;
revoke all on function public.bridge_can_manage_matter_financials(uuid, uuid, uuid) from public, anon;
revoke all on function public.bridge_matter_financial_party_role(text, text) from public, anon;

grant execute on function public.bridge_can_manage_matter_financials(uuid, uuid, uuid) to authenticated;
grant execute on function public.bridge_matter_financial_party_role(text, text) to authenticated;
grant execute on function public.bridge_preferred_matter_financial_assignment(uuid) to service_role;
grant execute on function public.bridge_sync_matter_financial_account_from_participant(uuid) to service_role;

comment on function public.bridge_sync_matter_financial_account_from_participant(uuid) is
  'Creates or updates the canonical buyer/seller matter financial account shell from a transaction participant. It deliberately imports no legacy invoice, payment, or closeout amounts.';

notify pgrst, 'reload schema';

commit;
