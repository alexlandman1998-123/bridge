-- Read-only reconciliation for Phase 5. Every query should return zero rows/counts.

-- Role configurations must belong to either a canonical relationship or an external identity.
select id
from public.organisation_partner_roles
where relationship_id is null and external_partner_id is null;

-- Relationship-backed roles must be owned by one side of that relationship.
select role_config.id
from public.organisation_partner_roles role_config
join public.organisation_partners relationship on relationship.id = role_config.relationship_id
where role_config.organisation_id not in (
  relationship.organisation_id,
  relationship.partner_organisation_id
);

-- External-identity-backed roles must have the same owner.
select role_config.id
from public.organisation_partner_roles role_config
join public.organisation_preferred_partners external on external.id = role_config.external_partner_id
where role_config.organisation_id <> external.organisation_id;

-- There can only be one active default for an organisation and role.
select organisation_id, role_type, count(*) as default_count
from public.organisation_partner_roles
where is_active and is_preferred_default
group by organisation_id, role_type
having count(*) > 1;

-- Legacy external identities must have an equivalent canonical role projection.
select external.id
from public.organisation_preferred_partners external
left join public.organisation_partner_roles role_config
  on role_config.organisation_id = external.organisation_id
  and role_config.external_partner_id = external.id
  and role_config.role_type = public.bridge_normalize_partner_role_type(external.partner_type)
where role_config.id is null;

-- Both owners of every canonical relationship must have at least one role configuration.
select relationship.id, owner.organisation_id
from public.organisation_partners relationship
cross join lateral (values
  (relationship.organisation_id),
  (relationship.partner_organisation_id)
) owner(organisation_id)
left join public.organisation_partner_roles role_config
  on role_config.relationship_id = relationship.id
  and role_config.organisation_id = owner.organisation_id
where role_config.id is null;
