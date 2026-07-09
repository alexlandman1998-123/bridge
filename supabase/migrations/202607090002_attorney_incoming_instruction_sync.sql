begin;

alter table if exists public.transactions
  add column if not exists onboarding_status text not null default 'awaiting_client_onboarding',
  add column if not exists onboarding_completed_at timestamptz,
  add column if not exists external_onboarding_submitted_at timestamptz,
  add column if not exists current_main_stage text;

alter table if exists public.transaction_attorney_assignments
  add column if not exists attorney_firm_id uuid,
  add column if not exists assignment_type text,
  add column if not exists attorney_role text,
  add column if not exists assignment_status text,
  add column if not exists matter_type text,
  add column if not exists status text,
  add column if not exists instruction_status text not null default 'new_instruction',
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.transaction_attorney_assignments
  drop constraint if exists transaction_attorney_assignments_instruction_status_check;

alter table if exists public.transaction_attorney_assignments
  add constraint transaction_attorney_assignments_instruction_status_check
  check (
    instruction_status in (
      'new_instruction',
      'awaiting_client_onboarding',
      'awaiting_signed_otp',
      'awaiting_documents',
      'ready_for_acceptance',
      'accepted',
      'declined',
      'removed',
      'completed'
    )
  );

create index if not exists transaction_attorney_assignments_incoming_transfer_idx
  on public.transaction_attorney_assignments (attorney_firm_id, instruction_status, updated_at desc)
  where (
    attorney_role = 'transfer_attorney'
    or assignment_type in ('transfer', 'transfer_and_bond')
    or matter_type in ('transfer', 'transfer_and_bond')
  )
  and coalesce(assignment_status, status, 'active') <> 'removed';

create or replace function public.bridge_resolve_transfer_incoming_instruction_status(
  onboarding_status text,
  onboarding_completed_at timestamptz,
  external_onboarding_submitted_at timestamptz,
  current_main_stage text
)
returns text
language sql
immutable
as $$
  select case
    when lower(coalesce(onboarding_status, '')) in ('signed_otp_received', 'otp_uploaded')
      or upper(coalesce(current_main_stage, '')) in ('ATT', 'ATTY', 'XFER', 'REG')
      then 'ready_for_acceptance'
    when external_onboarding_submitted_at is not null
      or onboarding_completed_at is not null
      or lower(coalesce(onboarding_status, '')) in (
        'submitted',
        'reviewed',
        'approved',
        'complete',
        'completed',
        'client_onboarding_complete',
        'awaiting_signed_otp'
      )
      then 'awaiting_signed_otp'
    when lower(coalesce(onboarding_status, '')) in (
      'sent',
      'in_progress',
      'buyer_onboarding_pending',
      'buyer_onboarding_sent',
      'awaiting_client_onboarding'
    )
      then 'awaiting_client_onboarding'
    else null
  end
$$;

create or replace function public.bridge_sync_transfer_attorney_incoming_instruction_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next_status text;
begin
  v_next_status := public.bridge_resolve_transfer_incoming_instruction_status(
    new.onboarding_status,
    new.onboarding_completed_at,
    new.external_onboarding_submitted_at,
    new.current_main_stage
  );

  if v_next_status is null then
    return new;
  end if;

  update public.transaction_attorney_assignments taa
  set
    instruction_status = v_next_status,
    updated_at = now()
  where taa.transaction_id = new.id
    and (
      taa.attorney_role = 'transfer_attorney'
      or taa.assignment_type in ('transfer', 'transfer_and_bond')
      or taa.matter_type in ('transfer', 'transfer_and_bond')
    )
    and coalesce(taa.assignment_status, taa.status, 'active') <> 'removed'
    and coalesce(taa.instruction_status, 'new_instruction') not in ('accepted', 'declined', 'removed', 'completed')
    and (
      v_next_status <> 'awaiting_signed_otp'
      or coalesce(taa.instruction_status, 'new_instruction') in (
        'new_instruction',
        'awaiting_client_onboarding',
        'awaiting_signed_otp'
      )
    );

  return new;
end;
$$;

drop trigger if exists trg_bridge_sync_transfer_attorney_incoming_instruction_status on public.transactions;

create trigger trg_bridge_sync_transfer_attorney_incoming_instruction_status
after insert or update of onboarding_status, onboarding_completed_at, external_onboarding_submitted_at, current_main_stage
on public.transactions
for each row
execute function public.bridge_sync_transfer_attorney_incoming_instruction_status();

do $$
begin
  if to_regclass('public.transaction_attorney_assignments') is not null
    and to_regclass('public.transactions') is not null then
    update public.transaction_attorney_assignments taa
    set
      instruction_status = coalesce(
        public.bridge_resolve_transfer_incoming_instruction_status(
          tx.onboarding_status,
          tx.onboarding_completed_at,
          tx.external_onboarding_submitted_at,
          tx.current_main_stage
        ),
        taa.instruction_status,
        'new_instruction'
      ),
      updated_at = now()
    from public.transactions tx
    where taa.transaction_id = tx.id
      and (
        taa.attorney_role = 'transfer_attorney'
        or taa.assignment_type in ('transfer', 'transfer_and_bond')
        or taa.matter_type in ('transfer', 'transfer_and_bond')
      )
      and coalesce(taa.assignment_status, taa.status, 'active') <> 'removed'
      and coalesce(taa.instruction_status, 'new_instruction') not in ('accepted', 'declined', 'removed', 'completed')
      and public.bridge_resolve_transfer_incoming_instruction_status(
        tx.onboarding_status,
        tx.onboarding_completed_at,
        tx.external_onboarding_submitted_at,
        tx.current_main_stage
      ) is not null
      and (
        public.bridge_resolve_transfer_incoming_instruction_status(
          tx.onboarding_status,
          tx.onboarding_completed_at,
          tx.external_onboarding_submitted_at,
          tx.current_main_stage
        ) <> 'awaiting_signed_otp'
        or coalesce(taa.instruction_status, 'new_instruction') in (
          'new_instruction',
          'awaiting_client_onboarding',
          'awaiting_signed_otp'
        )
      );
  end if;
end $$;

commit;
