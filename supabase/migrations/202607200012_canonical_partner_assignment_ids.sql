begin;

create or replace function public.bridge_normalize_partner_assignment_role(p_value text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case lower(regexp_replace(trim(coalesce(p_value, '')), '[ -]+', '_', 'g'))
    when 'developer_contact' then 'developer'
    when 'attorney' then 'transfer_attorney'
    when 'attorney_firm' then 'transfer_attorney'
    when 'agency' then 'referral_agency'
    else public.bridge_normalize_partner_role_type(p_value)
  end
$$;

create or replace function public.bridge_resolve_partner_role_configuration(
  p_organisation_id uuid,
  p_role_type text,
  p_preferred_partner_id uuid default null,
  p_partner_relationship_id uuid default null,
  p_partner_organisation_id uuid default null
)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role_config.id
  from public.organisation_partner_roles role_config
  where role_config.organisation_id = p_organisation_id
    and role_config.role_type = public.bridge_normalize_partner_assignment_role(p_role_type)
    and (
      (p_preferred_partner_id is not null and role_config.external_partner_id = p_preferred_partner_id)
      or (p_partner_relationship_id is not null and role_config.relationship_id = p_partner_relationship_id)
      or (
        p_preferred_partner_id is null
        and p_partner_relationship_id is null
        and p_partner_organisation_id is not null
        and role_config.partner_organisation_id = p_partner_organisation_id
      )
    )
  order by
    (role_config.external_partner_id = p_preferred_partner_id) desc nulls last,
    (role_config.relationship_id = p_partner_relationship_id) desc nulls last,
    role_config.is_active desc,
    role_config.is_preferred_default desc,
    role_config.updated_at desc,
    role_config.id
  limit 1
$$;

alter table public.transaction_role_players
  drop constraint if exists transaction_role_players_partner_role_configuration_id_fkey;
alter table public.transaction_role_players
  add constraint transaction_role_players_partner_role_configuration_id_fkey
  foreign key (partner_role_configuration_id)
  references public.organisation_partner_roles(id) on delete restrict;

alter table public.private_listing_role_players
  drop constraint if exists private_listing_role_players_partner_role_configuration_id_fkey;
alter table public.private_listing_role_players
  add constraint private_listing_role_players_partner_role_configuration_id_fkey
  foreign key (partner_role_configuration_id)
  references public.organisation_partner_roles(id) on delete restrict;
alter table public.private_listing_role_players
  add column if not exists partner_relationship_id uuid
    references public.organisation_partners(id) on delete set null;

update public.transaction_role_players role_player
set partner_role_configuration_id = public.bridge_resolve_partner_role_configuration(
  transaction.organisation_id,
  role_player.role_type,
  role_player.preferred_partner_id,
  role_player.partner_relationship_id,
  role_player.partner_organisation_id
)
from public.transactions transaction
where transaction.id = role_player.transaction_id
  and role_player.partner_role_configuration_id is null
  and (role_player.preferred_partner_id is not null or role_player.partner_relationship_id is not null);

update public.private_listing_role_players role_player
set partner_role_configuration_id = public.bridge_resolve_partner_role_configuration(
  listing.organisation_id,
  role_player.role_type,
  role_player.preferred_partner_id,
  null,
  role_player.partner_organisation_id
)
from public.private_listings listing
where listing.id = role_player.private_listing_id
  and role_player.partner_role_configuration_id is null
  and role_player.preferred_partner_id is not null;

update public.private_listing_role_players role_player
set partner_relationship_id = role_config.relationship_id
from public.organisation_partner_roles role_config
where role_config.id = role_player.partner_role_configuration_id
  and role_player.partner_relationship_id is distinct from role_config.relationship_id;

do $$
begin
  if exists (
    select 1
    from public.transaction_role_players
    where partner_role_configuration_id is null
      and (preferred_partner_id is not null or partner_relationship_id is not null)
  ) then
    raise exception 'Cannot cut over transaction partner assignments: unresolved legacy partner identity remains.';
  end if;

  if exists (
    select 1
    from public.private_listing_role_players
    where partner_role_configuration_id is null
      and (preferred_partner_id is not null or partner_relationship_id is not null)
  ) then
    raise exception 'Cannot cut over private-listing partner assignments: unresolved legacy partner identity remains.';
  end if;
end;
$$;

alter table public.transaction_role_players
  drop constraint if exists transaction_role_players_canonical_partner_assignment_check;
alter table public.transaction_role_players
  add constraint transaction_role_players_canonical_partner_assignment_check
  check (
    partner_role_configuration_id is not null
    or (preferred_partner_id is null and partner_relationship_id is null)
  );

alter table public.private_listing_role_players
  drop constraint if exists private_listing_role_players_canonical_partner_assignment_check;
alter table public.private_listing_role_players
  add constraint private_listing_role_players_canonical_partner_assignment_check
  check (
    partner_role_configuration_id is not null
    or (preferred_partner_id is null and partner_relationship_id is null)
  );

create index if not exists transaction_role_players_role_configuration_idx
  on public.transaction_role_players (partner_role_configuration_id, transaction_id)
  where partner_role_configuration_id is not null;
create index if not exists private_listing_role_players_role_configuration_idx
  on public.private_listing_role_players (partner_role_configuration_id, private_listing_id)
  where partner_role_configuration_id is not null;

create or replace function public.bridge_validate_transaction_partner_assignment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner_organisation_id uuid;
  v_role_config public.organisation_partner_roles%rowtype;
begin
  select transaction.organisation_id into v_owner_organisation_id
  from public.transactions transaction
  where transaction.id = new.transaction_id;

  if v_owner_organisation_id is null then
    if new.partner_role_configuration_id is not null
       or new.preferred_partner_id is not null
       or new.partner_relationship_id is not null then
      raise exception 'A transaction organisation is required for a partner assignment.' using errcode = '23514';
    end if;
    return new;
  end if;

  if new.partner_role_configuration_id is null
     and (new.preferred_partner_id is not null or new.partner_relationship_id is not null) then
    new.partner_role_configuration_id := public.bridge_resolve_partner_role_configuration(
      v_owner_organisation_id,
      new.role_type,
      new.preferred_partner_id,
      new.partner_relationship_id,
      new.partner_organisation_id
    );
  end if;

  if new.partner_role_configuration_id is null then return new; end if;

  select * into v_role_config
  from public.organisation_partner_roles
  where id = new.partner_role_configuration_id;

  if v_role_config.id is null
     or v_role_config.organisation_id <> v_owner_organisation_id then
    raise exception 'Partner role configuration does not belong to the transaction organisation.' using errcode = '23514';
  end if;
  if v_role_config.role_type <> public.bridge_normalize_partner_assignment_role(new.role_type) then
    raise exception 'Partner role configuration does not match the transaction role.' using errcode = '23514';
  end if;

  new.preferred_partner_id := v_role_config.external_partner_id;
  new.partner_relationship_id := v_role_config.relationship_id;
  new.partner_organisation_id := coalesce(v_role_config.partner_organisation_id, new.partner_organisation_id);
  new.organisation_id := coalesce(v_role_config.partner_organisation_id, new.organisation_id);
  new.snapshot_json := coalesce(new.snapshot_json, '{}'::jsonb) || jsonb_build_object(
    'partnerRoleConfigurationId', v_role_config.id,
    'canonicalPartnerAssignment', true
  );
  return new;
end;
$$;

drop trigger if exists transaction_partner_assignment_validate on public.transaction_role_players;
create trigger transaction_partner_assignment_validate
before insert or update of transaction_id, role_type, partner_role_configuration_id,
  preferred_partner_id, partner_relationship_id, partner_organisation_id
on public.transaction_role_players
for each row execute function public.bridge_validate_transaction_partner_assignment();

create or replace function public.bridge_validate_private_listing_partner_assignment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner_organisation_id uuid;
  v_role_config public.organisation_partner_roles%rowtype;
begin
  select listing.organisation_id into v_owner_organisation_id
  from public.private_listings listing
  where listing.id = new.private_listing_id;

  if v_owner_organisation_id is null then
    raise exception 'A private-listing organisation is required for a partner assignment.' using errcode = '23514';
  end if;

  if new.partner_role_configuration_id is null
     and (new.preferred_partner_id is not null or new.partner_relationship_id is not null) then
    new.partner_role_configuration_id := public.bridge_resolve_partner_role_configuration(
      v_owner_organisation_id,
      new.role_type,
      new.preferred_partner_id,
      new.partner_relationship_id,
      new.partner_organisation_id
    );
  end if;

  if new.partner_role_configuration_id is null then return new; end if;

  select * into v_role_config
  from public.organisation_partner_roles
  where id = new.partner_role_configuration_id;

  if v_role_config.id is null
     or v_role_config.organisation_id <> v_owner_organisation_id then
    raise exception 'Partner role configuration does not belong to the listing organisation.' using errcode = '23514';
  end if;
  if v_role_config.role_type <> public.bridge_normalize_partner_assignment_role(new.role_type) then
    raise exception 'Partner role configuration does not match the listing role.' using errcode = '23514';
  end if;

  new.organisation_id := v_owner_organisation_id;
  new.preferred_partner_id := v_role_config.external_partner_id;
  new.partner_relationship_id := v_role_config.relationship_id;
  new.partner_organisation_id := coalesce(v_role_config.partner_organisation_id, new.partner_organisation_id);
  new.metadata := coalesce(new.metadata, '{}'::jsonb) || jsonb_build_object(
    'partnerRoleConfigurationId', v_role_config.id,
    'canonicalPartnerAssignment', true
  );
  return new;
end;
$$;

drop trigger if exists private_listing_partner_assignment_validate on public.private_listing_role_players;
create trigger private_listing_partner_assignment_validate
before insert or update of private_listing_id, role_type, partner_role_configuration_id,
  preferred_partner_id, partner_relationship_id, partner_organisation_id
on public.private_listing_role_players
for each row execute function public.bridge_validate_private_listing_partner_assignment();

create or replace function public.bridge_list_organisation_partner_assignment_options(p_organisation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_options jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then return jsonb_build_object('success', false, 'code', 'not_authenticated'); end if;
  if not public.bridge_is_active_member(p_organisation_id) then
    return jsonb_build_object('success', false, 'code', 'not_authorized');
  end if;

  select coalesce(jsonb_agg(
    to_jsonb(external) || jsonb_build_object(
      'partner_role_configuration_id', role_config.id,
      'partnerRoleConfigurationId', role_config.id,
      'relationship_id', role_config.relationship_id,
      'role_scope_type', role_config.scope_type,
      'role_scope_json', role_config.scope_json
    ) order by role_config.is_preferred_default desc, external.company_name
  ), '[]'::jsonb)
  into v_options
  from public.organisation_partner_roles role_config
  join public.organisation_preferred_partners external
    on external.id = role_config.external_partner_id
  where role_config.organisation_id = p_organisation_id
    and role_config.is_active;

  return jsonb_build_object('success', true, 'partners', v_options);
end;
$$;

alter function public.bridge_list_organisation_partner_directory(uuid)
  rename to bridge_list_organisation_partner_directory_phase5_legacy;

create or replace function public.bridge_list_organisation_partner_directory(p_organisation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
  v_partner jsonb;
  v_configs jsonb;
  v_partners jsonb := '[]'::jsonb;
begin
  v_result := public.bridge_list_organisation_partner_directory_phase5_legacy(p_organisation_id);
  if coalesce((v_result ->> 'success')::boolean, false) is false then return v_result; end if;

  for v_partner in select value from jsonb_array_elements(coalesce(v_result -> 'partners', '[]'::jsonb))
  loop
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', role_config.id,
      'roleType', role_config.role_type,
      'isDefault', role_config.is_preferred_default,
      'scopeType', role_config.scope_type,
      'scope', role_config.scope_json
    ) order by role_config.role_type), '[]'::jsonb)
    into v_configs
    from public.organisation_partner_roles role_config
    where role_config.organisation_id = p_organisation_id
      and role_config.is_active
      and (
        role_config.relationship_id = nullif(v_partner ->> 'relationshipId', '')::uuid
        or role_config.external_partner_id = nullif(v_partner ->> 'externalPartnerId', '')::uuid
        or role_config.partner_organisation_id = nullif(v_partner ->> 'partnerOrganisationId', '')::uuid
      );

    v_partners := v_partners || jsonb_build_array(
      jsonb_set(v_partner, '{roleConfigurations}', v_configs, true)
    );
  end loop;

  return jsonb_set(v_result, '{partners}', v_partners, true)
    || jsonb_build_object('assignmentIdentitySource', 'organisation_partner_roles.id');
end;
$$;

create or replace function public.bridge_allocate_private_listing_transfer_attorney_v2(
  p_private_listing_id uuid,
  p_partner_role_configuration_id uuid,
  p_company_name text,
  p_contact_person text default null,
  p_email_address text default null,
  p_phone_number text default null,
  p_selection_source text default 'seller_mandate',
  p_mandate_packet_id uuid default null,
  p_mandate_signed_at timestamptz default now(),
  p_metadata jsonb default '{}'::jsonb
)
returns public.private_listing_role_players
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_config public.organisation_partner_roles%rowtype;
  v_result public.private_listing_role_players%rowtype;
begin
  select * into v_config
  from public.organisation_partner_roles
  where id = p_partner_role_configuration_id;
  if v_config.id is null or v_config.role_type <> 'transfer_attorney' then
    raise exception 'A canonical transfer-attorney role configuration is required.' using errcode = '22023';
  end if;

  v_result := public.bridge_allocate_private_listing_transfer_attorney(
    p_private_listing_id,
    v_config.external_partner_id,
    p_company_name,
    p_contact_person,
    p_email_address,
    p_phone_number,
    v_config.partner_organisation_id,
    p_selection_source,
    p_mandate_packet_id,
    p_mandate_signed_at,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'partnerRoleConfigurationId', v_config.id,
      'canonicalPartnerAssignment', true
    )
  );

  update public.private_listing_role_players
  set partner_role_configuration_id = v_config.id
  where id = v_result.id
  returning * into v_result;
  return v_result;
end;
$$;

grant execute on function public.bridge_resolve_partner_role_configuration(uuid, text, uuid, uuid, uuid)
  to authenticated;
grant execute on function public.bridge_list_organisation_partner_assignment_options(uuid)
  to authenticated;
grant execute on function public.bridge_list_organisation_partner_directory(uuid)
  to authenticated;
grant execute on function public.bridge_allocate_private_listing_transfer_attorney_v2(
  uuid, uuid, text, text, text, text, text, uuid, timestamptz, jsonb
) to authenticated;

comment on column public.transaction_role_players.partner_role_configuration_id is
  'Canonical partner-assignment identity. Legacy preferred-partner and relationship IDs are projections.';
comment on column public.transaction_role_players.preferred_partner_id is
  'Deprecated compatibility projection from partner_role_configuration_id.';
comment on column public.transaction_role_players.partner_relationship_id is
  'Deprecated compatibility projection from partner_role_configuration_id.';
comment on column public.private_listing_role_players.partner_role_configuration_id is
  'Canonical partner-assignment identity. Legacy preferred-partner and relationship IDs are projections.';
comment on column public.private_listing_role_players.preferred_partner_id is
  'Deprecated compatibility projection from partner_role_configuration_id.';
comment on column public.private_listing_role_players.partner_relationship_id is
  'Deprecated compatibility projection from partner_role_configuration_id.';

notify pgrst, 'reload schema';

commit;
