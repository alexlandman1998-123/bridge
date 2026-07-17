begin;

alter table if exists public.private_listing_role_players
  drop constraint if exists private_listing_role_players_selection_source_check;

alter table if exists public.private_listing_role_players
  add constraint private_listing_role_players_selection_source_check
  check (
    selection_source in (
      'seller_selected',
      'seller_mandate',
      'agency_recommended',
      'seller_accepted_recommendation',
      'seller_nominated',
      'seller_deferred',
      'agent_assisted_seller_selection'
    )
  );

comment on column public.private_listing_role_players.selection_source is
  'Canonical origin of the transfer-attorney allocation. Seller decisions distinguish accepted agency recommendations, seller nominations, deferrals, and agent-assisted seller selections.';

commit;
