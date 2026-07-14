begin;

alter table if exists public.transactions
  drop constraint if exists transactions_bond_assignment_status_check;
alter table if exists public.transactions
  add constraint transactions_bond_assignment_status_check
  check (
    bond_assignment_status is null
    or bond_assignment_status in (
      'unassigned',
      'awaiting_buyer_onboarding',
      'workspace_assigned',
      'consultant_assigned',
      'processor_assigned',
      'fully_assigned',
      'inactive'
    )
  );

alter table if exists public.transactions
  drop constraint if exists transactions_bond_assignment_source_check;
alter table if exists public.transactions
  add constraint transactions_bond_assignment_source_check
  check (
    bond_assignment_source is null
    or bond_assignment_source in (
      'manual',
      'legacy_backfill',
      'participant_sync',
      'invite_acceptance',
      'workflow_assignment',
      'system_repair',
      'buyer_onboarding_send'
    )
  );

alter table if exists public.transaction_role_players
  drop constraint if exists transaction_role_players_selection_source_check;
alter table if exists public.transaction_role_players
  add constraint transaction_role_players_selection_source_check
  check (
    selection_source in (
      'agency_preferred',
      'buyer_appointed',
      'manual',
      'connected_partner',
      'development_default',
      'preferred_partner',
      'recently_used',
      'invited_partner',
      'partner_prospect',
      'transaction_direct',
      'partner_routing_rule',
      'seller_mandate'
    )
  );

comment on column public.transactions.bond_assignment_status is
  'Includes awaiting_buyer_onboarding when an agent routes buyer onboarding to a preferred originator before the buyer application is completed.';

commit;
