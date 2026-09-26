begin;

create index if not exists document_packets_transaction_status_idx
  on public.document_packets (transaction_id, status, current_version_number);
create index if not exists document_requests_attention_idx
  on public.document_requests (transaction_id, status, requested_from, due_date);
create index if not exists attorney_workflow_blockers_attention_idx
  on public.attorney_workflow_blockers (transaction_id, resolved_at, due_date);
create index if not exists matter_financial_documents_overdue_idx
  on public.matter_financial_documents (attorney_firm_id, document_status, document_type, due_on);
create index if not exists transaction_subprocess_steps_attention_idx
  on public.transaction_subprocess_steps (subprocess_id, step_key, status);

create or replace function public.get_attorney_dashboard_attention_snapshot(
  p_firm_id uuid,
  p_role_view text default 'all'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_role text;
  v_role_view text := lower(trim(coalesce(p_role_view, 'all')));
  v_result jsonb;
begin
  if p_firm_id is null or v_actor_id is null then
    raise exception 'Attorney dashboard access requires an authenticated firm member.'
      using errcode = '42501';
  end if;

  select member.role
    into v_role
  from public.attorney_firm_members member
  where member.firm_id = p_firm_id
    and member.user_id = v_actor_id
    and member.status = 'active'
  limit 1;

  if v_role not in ('firm_admin', 'director_partner') then
    raise exception 'You do not have permission to view this attorney firm dashboard.'
      using errcode = '42501';
  end if;

  with assignment_rows as (
    select
      assignment.transaction_id,
      coalesce(
        assignment.attorney_role,
        case lower(coalesce(assignment.assignment_type, ''))
          when 'bond' then 'bond_attorney'
          when 'cancellation' then 'cancellation_attorney'
          else 'transfer_attorney'
        end
      ) as attorney_role
    from public.transaction_attorney_assignments assignment
    where coalesce(assignment.attorney_firm_id, assignment.firm_id) = p_firm_id
      and coalesce(assignment.assignment_status, assignment.status, 'active') in ('pending', 'active', 'paused')
  ),
  matter_roles as (
    select
      assignment.transaction_id,
      array_agg(distinct assignment.attorney_role order by assignment.attorney_role) as roles
    from assignment_rows assignment
    group by assignment.transaction_id
  ),
  matters as (
    select
      transaction.id as transaction_id,
      roles.roles,
      transaction.target_registration_date,
      coalesce(transaction.last_meaningful_activity_at, transaction.updated_at, transaction.created_at) as last_activity_at
    from matter_roles roles
    join public.transactions transaction on transaction.id = roles.transaction_id
    where transaction.is_active = true
      and lower(coalesce(transaction.lifecycle_state, 'active')) not in ('archived', 'cancelled', 'deleted')
      and lower(coalesce(transaction.stage, '')) <> 'available'
      and lower(coalesce(transaction.current_main_stage, '')) not in ('avail', 'available')
      and lower(coalesce(transaction.next_action, '')) not like 'transaction deleted%'
      and lower(coalesce(transaction.next_action, '')) not like 'transaction reset to available%'
      and case v_role_view
        when 'transfer' then 'transfer_attorney' = any(roles.roles)
        when 'bond' then 'bond_attorney' = any(roles.roles)
        when 'cancellation' then 'cancellation_attorney' = any(roles.roles)
        when 'shared' then cardinality(roles.roles) > 1
        when 'full-service' then cardinality(roles.roles) = 3
        else true
      end
  ),
  signature_matters as (
    select distinct matter.transaction_id
    from matters matter
    join public.document_packets packet on packet.transaction_id = matter.transaction_id
    join public.document_packet_versions version
      on version.packet_id = packet.id
      and version.version_number = packet.current_version_number
    where packet.status in ('sent', 'partially_signed')
      and exists (
        select 1
        from public.document_signing_dispatches dispatch
        where dispatch.packet_id = packet.id
          and dispatch.packet_version_id = version.id
          and dispatch.status = 'delivered'
      )
      and exists (
        select 1
        from public.document_packet_signers signer
        where signer.packet_id = packet.id
          and signer.packet_version_id = version.id
          and signer.status in ('sent', 'viewed')
      )
  ),
  guarantee_steps as (
    select distinct matter.transaction_id
    from matters matter
    join public.transaction_subprocesses lane on lane.transaction_id = matter.transaction_id
    join public.transaction_subprocess_steps step on step.subprocess_id = lane.id
    where step.step_key in (
      'payment_security_review', 'guarantees_issued', 'guarantee_wording_accepted',
      'guarantees_requested', 'guarantees_received', 'transfer_guarantees_accepted',
      'cancellation_guarantees_requested', 'cancellation_guarantees_received',
      'cancellation_guarantees_accepted'
    )
      and step.status not in ('completed', 'completed_externally', 'not_applicable')
      and coalesce(
        case when coalesce(step.step_metadata->>'dueDate', '') ~ '^\d{4}-\d{2}-\d{2}$'
          then (step.step_metadata->>'dueDate')::date end,
        case when coalesce(step.step_metadata #>> '{workPacket,dueDate}', '') ~ '^\d{4}-\d{2}-\d{2}$'
          then (step.step_metadata #>> '{workPacket,dueDate}')::date end,
        lane.due_date
      ) <= current_date
  ),
  guarantee_requests as (
    select distinct matter.transaction_id
    from matters matter
    join public.document_requests request on request.transaction_id = matter.transaction_id
    where lower(coalesce(request.document_type, '')) in ('guarantee', 'guarantee_letter', 'bank_guarantee')
      and request.status in ('requested', 'uploaded', 'rejected')
      and request.due_date <= current_date
  ),
  guarantee_matters as (
    select transaction_id from guarantee_steps
    union
    select transaction_id from guarantee_requests
  ),
  clearance_matters as (
    select distinct matter.transaction_id
    from matters matter
    join public.transaction_subprocesses lane on lane.transaction_id = matter.transaction_id
    join public.transaction_subprocess_steps step on step.subprocess_id = lane.id
    where step.step_key in (
      'municipal_rates_clearance_review', 'levy_hoa_clearance_review',
      'rates_figures_requested', 'rates_payment_confirmed', 'rates_clearance_received',
      'levy_clearance_requested', 'levy_clearance_received'
    )
      and step.status <> 'not_applicable'
      and (
        step.status not in ('completed', 'completed_externally')
        or coalesce(
          case when coalesce(step.step_metadata->>'validUntil', '') ~ '^\d{4}-\d{2}-\d{2}$'
            then (step.step_metadata->>'validUntil')::date end,
          case when coalesce(step.step_metadata->>'expiryDate', '') ~ '^\d{4}-\d{2}-\d{2}$'
            then (step.step_metadata->>'expiryDate')::date end,
          case when coalesce(step.step_metadata->>'certificateValidUntil', '') ~ '^\d{4}-\d{2}-\d{2}$'
            then (step.step_metadata->>'certificateValidUntil')::date end
        ) < coalesce(matter.target_registration_date, current_date)
      )
  ),
  client_document_matters as (
    select distinct matter.transaction_id
    from matters matter
    join public.document_requests request on request.transaction_id = matter.transaction_id
    where lower(coalesce(request.requested_from, request.assigned_to_role, '')) in (
      'buyer', 'seller', 'client', 'purchaser', 'buyer_and_seller'
    )
      and (
        request.status in ('requested', 'uploaded', 'rejected')
        or lower(coalesce(request.review_status, '')) in ('pending_review', 'rejected', 'needs_correction', 'resubmission_required')
      )
      and request.status not in ('completed', 'reviewed')
  ),
  invoice_balances as (
    select
      document.transaction_id,
      document.id,
      coalesce(
        sum(entry.amount) filter (where entry.entry_status = 'posted'),
        document.amount_due,
        document.amount_total,
        0
      ) as balance_due
    from public.matter_financial_documents document
    left join public.matter_financial_entries entry
      on entry.financial_document_id = document.id
    join matters matter on matter.transaction_id = document.transaction_id
    where (document.attorney_firm_id = p_firm_id or document.attorney_firm_id is null)
      and document.document_type = 'invoice'
      and document.document_status = 'published'
      and document.due_on < current_date
    group by document.transaction_id, document.id, document.amount_due, document.amount_total
  ),
  invoice_matters as (
    select distinct transaction_id
    from invoice_balances
    where balance_due > 0
  ),
  stalled_matters as (
    select matter.transaction_id
    from matters matter
    where (
      matter.last_activity_at < current_date - interval '14 days'
      and not exists (
        select 1
        from public.transaction_subprocesses waiting_lane
        join public.transaction_subprocess_steps waiting_step on waiting_step.subprocess_id = waiting_lane.id
        where waiting_lane.transaction_id = matter.transaction_id
          and waiting_step.status = 'waiting'
          and coalesce(
            case when coalesce(waiting_step.step_metadata->>'followUpDate', '') ~ '^\d{4}-\d{2}-\d{2}$'
              then (waiting_step.step_metadata->>'followUpDate')::date end,
            case when coalesce(waiting_step.step_metadata->>'dueDate', '') ~ '^\d{4}-\d{2}-\d{2}$'
              then (waiting_step.step_metadata->>'dueDate')::date end,
            waiting_lane.due_date
          ) > current_date
      )
    )
      or exists (
        select 1
        from public.attorney_workflow_blockers blocker
        where blocker.transaction_id = matter.transaction_id
          and blocker.resolved_at is null
          and blocker.due_date < current_date
      )
  )
  select jsonb_build_object(
    'sourceStatus', 'available',
    'roleView', v_role_view,
    'signatures', jsonb_build_object(
      'count', (select count(*) from signature_matters),
      'matterIds', coalesce((select jsonb_agg(transaction_id order by transaction_id) from signature_matters), '[]'::jsonb)
    ),
    'guarantees', jsonb_build_object(
      'count', (select count(*) from guarantee_matters),
      'matterIds', coalesce((select jsonb_agg(transaction_id order by transaction_id) from guarantee_matters), '[]'::jsonb)
    ),
    'clearance', jsonb_build_object(
      'count', (select count(*) from clearance_matters),
      'matterIds', coalesce((select jsonb_agg(transaction_id order by transaction_id) from clearance_matters), '[]'::jsonb)
    ),
    'clientDocuments', jsonb_build_object(
      'count', (select count(*) from client_document_matters),
      'matterIds', coalesce((select jsonb_agg(transaction_id order by transaction_id) from client_document_matters), '[]'::jsonb)
    ),
    'invoices', jsonb_build_object(
      'count', (select count(*) from invoice_matters),
      'matterIds', coalesce((select jsonb_agg(transaction_id order by transaction_id) from invoice_matters), '[]'::jsonb)
    ),
    'stalled', jsonb_build_object(
      'count', (select count(*) from stalled_matters),
      'matterIds', coalesce((select jsonb_agg(transaction_id order by transaction_id) from stalled_matters), '[]'::jsonb)
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_attorney_dashboard_attention_snapshot(uuid, text) from public, anon;
grant execute on function public.get_attorney_dashboard_attention_snapshot(uuid, text) to authenticated;

comment on function public.get_attorney_dashboard_attention_snapshot(uuid, text) is
  'Returns full-firm, unique-matter attorney dashboard attention metrics from canonical operational records.';

create or replace function public.bridge_emit_attorney_attention_refresh_signal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_transaction_id uuid;
  target_packet_id uuid;
begin
  if tg_table_name = 'transactions' then
    target_transaction_id := case when tg_op = 'DELETE' then old.id else new.id end;
  elsif tg_table_name in (
    'document_requests', 'attorney_workflow_blockers',
    'matter_financial_documents', 'matter_financial_entries', 'document_packets'
  ) then
    target_transaction_id := case when tg_op = 'DELETE' then old.transaction_id else new.transaction_id end;
  elsif tg_table_name in ('document_packet_signers', 'document_signing_dispatches') then
    target_packet_id := case when tg_op = 'DELETE' then old.packet_id else new.packet_id end;
    select packet.transaction_id into target_transaction_id
    from public.document_packets packet
    where packet.id = target_packet_id;
  end if;

  if target_transaction_id is not null then
    insert into public.transaction_refresh_signals (
      transaction_id, version, command_receipt_id, canonical_event_id, changed_at
    ) values (
      target_transaction_id, 1, null, null, now()
    )
    on conflict (transaction_id) do update set
      version = public.transaction_refresh_signals.version + 1,
      command_receipt_id = null,
      canonical_event_id = null,
      changed_at = excluded.changed_at;
  end if;

  return null;
end;
$$;

revoke all on function public.bridge_emit_attorney_attention_refresh_signal() from public;

drop trigger if exists bridge_attorney_attention_transaction_refresh on public.transactions;
create trigger bridge_attorney_attention_transaction_refresh
  after update of is_active, lifecycle_state, last_meaningful_activity_at, target_registration_date
  on public.transactions for each row
  execute function public.bridge_emit_attorney_attention_refresh_signal();

drop trigger if exists bridge_attorney_attention_document_request_refresh on public.document_requests;
create trigger bridge_attorney_attention_document_request_refresh
  after insert or update of status, review_status, requested_from, assigned_to_role, due_date, document_type or delete
  on public.document_requests for each row
  execute function public.bridge_emit_attorney_attention_refresh_signal();

drop trigger if exists bridge_attorney_attention_blocker_refresh on public.attorney_workflow_blockers;
create trigger bridge_attorney_attention_blocker_refresh
  after insert or update of due_date, resolved_at or delete
  on public.attorney_workflow_blockers for each row
  execute function public.bridge_emit_attorney_attention_refresh_signal();

drop trigger if exists bridge_attorney_attention_financial_document_refresh on public.matter_financial_documents;
create trigger bridge_attorney_attention_financial_document_refresh
  after insert or update of document_type, document_status, due_on, amount_due, amount_total or delete
  on public.matter_financial_documents for each row
  execute function public.bridge_emit_attorney_attention_refresh_signal();

drop trigger if exists bridge_attorney_attention_financial_entry_refresh on public.matter_financial_entries;
create trigger bridge_attorney_attention_financial_entry_refresh
  after insert or update of entry_status, amount, financial_document_id or delete
  on public.matter_financial_entries for each row
  execute function public.bridge_emit_attorney_attention_refresh_signal();

drop trigger if exists bridge_attorney_attention_packet_refresh on public.document_packets;
create trigger bridge_attorney_attention_packet_refresh
  after insert or update of status, current_version_number, transaction_id or delete
  on public.document_packets for each row
  execute function public.bridge_emit_attorney_attention_refresh_signal();

drop trigger if exists bridge_attorney_attention_signer_refresh on public.document_packet_signers;
create trigger bridge_attorney_attention_signer_refresh
  after insert or update of status, packet_version_id or delete
  on public.document_packet_signers for each row
  execute function public.bridge_emit_attorney_attention_refresh_signal();

drop trigger if exists bridge_attorney_attention_dispatch_refresh on public.document_signing_dispatches;
create trigger bridge_attorney_attention_dispatch_refresh
  after insert or update of status, packet_version_id or delete
  on public.document_signing_dispatches for each row
  execute function public.bridge_emit_attorney_attention_refresh_signal();

commit;
