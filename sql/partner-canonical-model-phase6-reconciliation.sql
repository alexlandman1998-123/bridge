-- Read-only Phase 6 reconciliation. Every query should return zero rows.

select id
from public.transaction_role_players
where partner_role_configuration_id is null
  and (preferred_partner_id is not null or partner_relationship_id is not null);

select id
from public.private_listing_role_players
where partner_role_configuration_id is null
  and (preferred_partner_id is not null or partner_relationship_id is not null);

select role_player.id
from public.transaction_role_players role_player
join public.transactions transaction on transaction.id = role_player.transaction_id
join public.organisation_partner_roles role_config
  on role_config.id = role_player.partner_role_configuration_id
where role_config.organisation_id <> transaction.organisation_id
   or role_config.role_type <> public.bridge_normalize_partner_assignment_role(role_player.role_type)
   or role_player.preferred_partner_id is distinct from role_config.external_partner_id
   or role_player.partner_relationship_id is distinct from role_config.relationship_id;

select role_player.id
from public.private_listing_role_players role_player
join public.private_listings listing on listing.id = role_player.private_listing_id
join public.organisation_partner_roles role_config
  on role_config.id = role_player.partner_role_configuration_id
where role_config.organisation_id <> listing.organisation_id
   or role_config.role_type <> public.bridge_normalize_partner_assignment_role(role_player.role_type)
   or role_player.preferred_partner_id is distinct from role_config.external_partner_id
   or role_player.partner_relationship_id is distinct from role_config.relationship_id;
