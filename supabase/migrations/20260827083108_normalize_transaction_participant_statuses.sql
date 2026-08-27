create or replace function public.bridge_normalize_transaction_participant_status()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  normalized_status text;
begin
  normalized_status := lower(trim(coalesce(new.status, 'draft')));

  new.status := case
    when normalized_status in ('draft', 'invited', 'active', 'removed') then normalized_status
    when normalized_status in (
      'pending',
      'pending_assignment',
      'pending_invite',
      'pending_invitation',
      'pending_acceptance',
      'awaiting_acceptance',
      'awaiting_response',
      'invitation_pending',
      'sent',
      'requested',
      'selected',
      'not_started'
    ) then 'invited'
    when normalized_status in (
      'accepted',
      'connected',
      'assigned',
      'consultant_assigned',
      'staff_assigned'
    ) then 'active'
    when normalized_status in (
      'inactive',
      'removed',
      'revoked',
      'declined',
      'rejected',
      'expired',
      'cancelled',
      'canceled',
      'archived',
      'deleted'
    ) then 'removed'
    else 'draft'
  end;

  return new;
end;
$$;

revoke all on function public.bridge_normalize_transaction_participant_status() from public;
revoke all on function public.bridge_normalize_transaction_participant_status() from anon;
revoke all on function public.bridge_normalize_transaction_participant_status() from authenticated;

drop trigger if exists bridge_normalize_transaction_participant_status on public.transaction_participants;
create trigger bridge_normalize_transaction_participant_status
before insert or update of status on public.transaction_participants
for each row
execute function public.bridge_normalize_transaction_participant_status();

update public.transaction_participants
set status = case
  when lower(trim(coalesce(status, 'draft'))) in ('draft', 'invited', 'active', 'removed')
    then lower(trim(coalesce(status, 'draft')))
  when lower(trim(coalesce(status, 'draft'))) in (
    'pending',
    'pending_assignment',
    'pending_invite',
    'pending_invitation',
    'pending_acceptance',
    'awaiting_acceptance',
    'awaiting_response',
    'invitation_pending',
    'sent',
    'requested',
    'selected',
    'not_started'
  ) then 'invited'
  when lower(trim(coalesce(status, 'draft'))) in (
    'accepted',
    'connected',
    'assigned',
    'consultant_assigned',
    'staff_assigned'
  ) then 'active'
  when lower(trim(coalesce(status, 'draft'))) in (
    'inactive',
    'removed',
    'revoked',
    'declined',
    'rejected',
    'expired',
    'cancelled',
    'canceled',
    'archived',
    'deleted'
  ) then 'removed'
  else 'draft'
end
where status is null
   or lower(trim(status)) not in ('draft', 'invited', 'active', 'removed');

alter table public.transaction_participants
  drop constraint if exists transaction_participants_status_check;

alter table public.transaction_participants
  add constraint transaction_participants_status_check
  check (status in ('draft', 'invited', 'active', 'removed'));
