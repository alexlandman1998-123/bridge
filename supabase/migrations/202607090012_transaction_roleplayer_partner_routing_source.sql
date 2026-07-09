begin;

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
      'preferred_partner',
      'recently_used',
      'partner_routing_rule',
      'routing_rule'
    )
  );

comment on constraint transaction_role_players_selection_source_check on public.transaction_role_players is
  'Allows explicit selections plus universal partner routing selections.';

commit;
