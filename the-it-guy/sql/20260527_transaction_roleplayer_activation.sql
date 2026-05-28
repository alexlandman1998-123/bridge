begin;

alter table if exists public.transaction_role_players
  add column if not exists organisation_id uuid,
  add column if not exists partner_relationship_id uuid,
  add column if not exists assignment_status text not null default 'selected',
  add column if not exists activation_trigger text,
  add column if not exists activated_at timestamptz,
  add column if not exists notified_at timestamptz,
  add column if not exists assigned_by uuid,
  add column if not exists removed_at timestamptz;

update public.transaction_role_players
set
  assignment_status = coalesce(nullif(assignment_status, ''), nullif(status, ''), 'selected'),
  activation_trigger = coalesce(
    nullif(activation_trigger, ''),
    case
      when role_type = 'bond_originator' then 'buyer_selects_bond_or_hybrid'
      when role_type = 'bond_attorney' then 'bond_approved'
      when role_type = 'transfer_attorney' then 'attorney_instruction_stage'
      else 'manual'
    end
  )
where true;

alter table if exists public.transaction_role_players
  drop constraint if exists transaction_role_players_role_type_check,
  add constraint transaction_role_players_role_type_check
    check (role_type in ('transfer_attorney', 'bond_originator', 'bond_attorney', 'developer_contact', 'agent'));

alter table if exists public.transaction_role_players
  drop constraint if exists transaction_role_players_selection_source_check,
  add constraint transaction_role_players_selection_source_check
    check (selection_source in ('agency_preferred', 'buyer_appointed', 'manual', 'connected_partner', 'preferred_partner', 'recently_used'));

alter table if exists public.transaction_role_players
  drop constraint if exists transaction_role_players_assignment_status_check,
  add constraint transaction_role_players_assignment_status_check
    check (assignment_status in ('selected', 'active', 'notified', 'declined', 'removed'));

alter table if exists public.transaction_role_players
  drop constraint if exists transaction_role_players_activation_trigger_check,
  add constraint transaction_role_players_activation_trigger_check
    check (
      activation_trigger is null
      or activation_trigger in (
        'immediate',
        'buyer_selects_bond',
        'buyer_selects_hybrid',
        'buyer_selects_bond_or_hybrid',
        'bond_approved',
        'attorney_instruction_stage',
        'manual'
      )
    );

create unique index if not exists transaction_role_players_transaction_role_uidx
  on public.transaction_role_players (transaction_id, role_type)
  where removed_at is null and assignment_status <> 'removed';

create index if not exists transaction_role_players_activation_idx
  on public.transaction_role_players (transaction_id, role_type, assignment_status, activation_trigger);

commit;
