begin;

create table if not exists public.transaction_legal_role_appointments (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  role_type text not null,
  appointing_bank text not null,
  appointment_reference text not null,
  appointed_firm_name text not null,
  appointed_contact_name text not null,
  appointed_email text not null,
  appointed_phone text,
  appointment_source text not null default 'transfer_attorney',
  evidence_confirmed boolean not null default false,
  evidence_document_id uuid,
  coordination_state text not null default 'appointment_captured',
  invitation_id uuid references public.transaction_partner_invitations(id) on delete set null,
  captured_by uuid references auth.users(id) on delete set null,
  captured_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transaction_legal_role_appointments_role_check
    check (role_type in ('bond_attorney', 'cancellation_attorney')),
  constraint transaction_legal_role_appointments_source_check
    check (appointment_source in ('bank_integration', 'bond_originator', 'transfer_attorney', 'agent_fallback', 'instruction_document', 'legacy_manual')),
  constraint transaction_legal_role_appointments_state_check
    check (coordination_state in ('appointment_captured', 'invite_pending', 'invite_sent', 'invite_accepted', 'instruction_confirmed', 'active', 'replacement_required'))
);

create unique index if not exists transaction_legal_role_appointments_active_role_idx
  on public.transaction_legal_role_appointments (transaction_id, role_type)
  where coordination_state <> 'replacement_required';

create index if not exists transaction_legal_role_appointments_transaction_idx
  on public.transaction_legal_role_appointments (transaction_id, captured_at desc);

drop trigger if exists transaction_legal_role_appointments_touch_updated_at on public.transaction_legal_role_appointments;
create trigger transaction_legal_role_appointments_touch_updated_at
before update on public.transaction_legal_role_appointments
for each row execute function public.set_updated_at_timestamp();

alter table public.transaction_legal_role_appointments enable row level security;

drop policy if exists transaction_legal_role_appointments_select_scoped on public.transaction_legal_role_appointments;
create policy transaction_legal_role_appointments_select_scoped
on public.transaction_legal_role_appointments
for select to authenticated
using (public.bridge_can_access_transaction_spine(transaction_id));

drop policy if exists transaction_legal_role_appointments_insert_transfer_coordinator on public.transaction_legal_role_appointments;
create policy transaction_legal_role_appointments_insert_transfer_coordinator
on public.transaction_legal_role_appointments
for insert to authenticated
with check (
  captured_by = auth.uid()
  and evidence_confirmed = true
  and exists (
    select 1
    from public.transaction_attorney_assignments assignment
    where assignment.transaction_id = transaction_legal_role_appointments.transaction_id
      and assignment.attorney_role = 'transfer_attorney'
      and assignment.is_primary = true
      and assignment.instruction_status = 'accepted'
      and (
        assignment.attorney_user_id = auth.uid()
        or assignment.primary_attorney_id = auth.uid()
        or public.attorney_user_is_firm_lead(assignment.attorney_firm_id)
        or public.attorney_user_is_firm_lead(assignment.firm_id)
      )
  )
);

drop policy if exists transaction_legal_role_appointments_update_transfer_coordinator on public.transaction_legal_role_appointments;
create policy transaction_legal_role_appointments_update_transfer_coordinator
on public.transaction_legal_role_appointments
for update to authenticated
using (
  captured_by = auth.uid()
  or exists (
    select 1
    from public.transaction_attorney_assignments assignment
    where assignment.transaction_id = transaction_legal_role_appointments.transaction_id
      and assignment.attorney_role = 'transfer_attorney'
      and assignment.is_primary = true
      and assignment.instruction_status = 'accepted'
      and (
        assignment.attorney_user_id = auth.uid()
        or assignment.primary_attorney_id = auth.uid()
        or public.attorney_user_is_firm_lead(assignment.attorney_firm_id)
        or public.attorney_user_is_firm_lead(assignment.firm_id)
      )
  )
)
with check (public.bridge_can_access_transaction_spine(transaction_id));

create or replace function public.bridge_enforce_bank_appointed_legal_invite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_appointment_id uuid;
begin
  if new.role_type not in ('bond_attorney', 'cancellation_attorney') then
    return new;
  end if;

  v_appointment_id := nullif(new.metadata ->> 'legal_role_appointment_id', '')::uuid;
  if v_appointment_id is null or not exists (
    select 1
    from public.transaction_legal_role_appointments appointment
    where appointment.id = v_appointment_id
      and appointment.transaction_id = new.transaction_id
      and appointment.role_type = new.role_type
      and appointment.evidence_confirmed = true
      and appointment.coordination_state in ('appointment_captured', 'invite_pending', 'invite_sent')
  ) then
    raise exception 'A confirmed bank appointment is required before inviting this legal role.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.transaction_attorney_assignments assignment
    where assignment.transaction_id = new.transaction_id
      and assignment.attorney_role = 'transfer_attorney'
      and assignment.is_primary = true
      and assignment.instruction_status = 'accepted'
      and (
        assignment.attorney_user_id = auth.uid()
        or assignment.primary_attorney_id = auth.uid()
        or public.attorney_user_is_firm_lead(assignment.attorney_firm_id)
        or public.attorney_user_is_firm_lead(assignment.firm_id)
      )
  ) then
    raise exception 'The primary transferring attorney must accept the instruction before coordinating this invite.' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_bank_appointed_legal_invite on public.transaction_partner_invitations;
create trigger enforce_bank_appointed_legal_invite
before insert on public.transaction_partner_invitations
for each row execute function public.bridge_enforce_bank_appointed_legal_invite();

create or replace function public.bridge_sync_bank_appointed_invite_state()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_appointment_id uuid;
begin
  if new.role_type not in ('bond_attorney', 'cancellation_attorney') then
    return new;
  end if;
  v_appointment_id := nullif(new.metadata ->> 'legal_role_appointment_id', '')::uuid;
  if v_appointment_id is null then
    return new;
  end if;
  update public.transaction_legal_role_appointments
  set
    invitation_id = new.id,
    coordination_state = case
      when new.status = 'accepted' then 'invite_accepted'
      when new.status in ('declined', 'expired', 'cancelled') then 'replacement_required'
      else coordination_state
    end
  where id = v_appointment_id
    and transaction_id = new.transaction_id
    and role_type = new.role_type;
  return new;
end;
$$;

drop trigger if exists sync_bank_appointed_invite_state on public.transaction_partner_invitations;
create trigger sync_bank_appointed_invite_state
after update of status on public.transaction_partner_invitations
for each row
when (old.status is distinct from new.status)
execute function public.bridge_sync_bank_appointed_invite_state();

grant select, insert, update on public.transaction_legal_role_appointments to authenticated;

commit;
