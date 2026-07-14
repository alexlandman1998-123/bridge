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
      'development_default',
      'preferred_partner',
      'recently_used',
      'partner_prospect',
      'invited_partner',
      'transaction_direct',
      'partner_routing_rule',
      'seller_mandate',
      'agent_reassignment'
    )
  );

create index if not exists transaction_role_players_reassignment_idx
  on public.transaction_role_players(transaction_id, role_type, updated_at desc)
  where selection_source = 'agent_reassignment';

comment on column public.transaction_role_players.selection_source is
  'Includes agent_reassignment when a post-OTP transfer instruction is reissued after the original firm declines.';

comment on table public.private_listing_role_players is
  'Preserves every mandate and replacement allocation row. Phase 6 inserts a new instructed row while retaining the withdrawn declined allocation.';

commit;

