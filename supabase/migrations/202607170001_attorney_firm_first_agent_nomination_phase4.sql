begin;

-- Agent transfer allocation appoints a firm. These source values distinguish
-- that nomination from an already-active person assignment while retaining all
-- source values accepted by the existing partner and reassignment workflows.
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
      'routing_rule',
      'partner_prospect',
      'invited_partner',
      'transaction_direct',
      'partner_routing_rule',
      'seller_mandate',
      'seller_nomination',
      'agent_reassignment'
    )
  );

alter table if exists public.transaction_participants
  drop constraint if exists transaction_participants_assignment_source_check;

alter table if exists public.transaction_participants
  add constraint transaction_participants_assignment_source_check
  check (
    assignment_source in (
      'transaction_direct',
      'development_default',
      'system_inherited',
      'reference_only',
      'partner_invitation',
      'partner_prospect',
      'attorney_assignment',
      'dalawyer_demo_seed',
      'agent_firm_nomination'
    )
  );

comment on constraint transaction_role_players_selection_source_check on public.transaction_role_players is
  'Includes seller_nomination for firm-first transfer attorney appointment.';

comment on constraint transaction_participants_assignment_source_check on public.transaction_participants is
  'Includes agent_firm_nomination for pending firm-level transfer access.';

commit;
