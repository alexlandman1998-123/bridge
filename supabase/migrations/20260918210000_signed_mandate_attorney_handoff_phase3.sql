begin;

-- Phase 3: turn the attorney selected in the immutable seller signing pack
-- into the existing listing-level, pre-instruction attorney allocation. The
-- allocation is intentionally not a transaction assignment: no buyer or OTP
-- exists at mandate signing time, and bridge_attorney_pre_instruction_pipeline
-- already exposes these awaiting_buyer allocations to the firm's inbox.
create or replace function public.bridge_handoff_signed_mandate_transfer_attorney(
  p_signing_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_session public.private_listing_mandate_signing_sessions%rowtype;
  v_listing public.private_listings%rowtype;
  v_existing public.private_listing_role_players%rowtype;
  v_allocation public.private_listing_role_players%rowtype;
  v_role_config public.organisation_partner_roles%rowtype;
  v_attorney jsonb;
  v_role_config_id uuid;
  v_now timestamptz := clock_timestamp();
  v_metadata jsonb;
begin
  if current_user not in ('postgres', 'service_role')
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Signed-mandate attorney handoff requires the service role.' using errcode = '42501';
  end if;

  select * into v_session
  from public.private_listing_mandate_signing_sessions
  where id = p_signing_session_id
  for update;

  if v_session.id is null
     or v_session.status <> 'signed'
     or not coalesce(v_session.selected_documents, '[]'::jsonb) ? 'mandate'
     or v_session.signed_at is null then
    raise exception 'A successfully signed mandate pack is required.' using errcode = '22023';
  end if;

  v_attorney := coalesce(v_session.signing_pack_snapshot -> 'proposedTransferAttorney', '{}'::jsonb);
  if jsonb_typeof(v_attorney) <> 'object'
     or nullif(btrim(coalesce(v_attorney ->> 'partnerRoleConfigurationId', v_attorney ->> 'partner_role_configuration_id', '')), '') is null then
    return jsonb_build_object('status', 'skipped', 'reason', 'no_proposed_transfer_attorney');
  end if;

  begin
    v_role_config_id := nullif(btrim(coalesce(
      v_attorney ->> 'partnerRoleConfigurationId',
      v_attorney ->> 'partner_role_configuration_id'
    )), '')::uuid;
  exception when invalid_text_representation then
    raise exception 'The frozen signing pack has an invalid transfer-attorney configuration.' using errcode = '22023';
  end;

  select * into v_listing
  from public.private_listings
  where id = v_session.private_listing_id
  for update;

  if v_listing.id is null or v_listing.organisation_id <> v_session.organisation_id then
    raise exception 'The signing session does not belong to its listing agency.' using errcode = '23514';
  end if;

  select * into v_role_config
  from public.organisation_partner_roles
  where id = v_role_config_id
    and organisation_id = v_listing.organisation_id
    and role_type = 'transfer_attorney'
    and is_active = true
  for key share;

  if v_role_config.id is null or v_role_config.partner_organisation_id is null then
    raise exception 'The frozen transfer attorney is not an active partner of this listing agency.' using errcode = '23514';
  end if;

  v_metadata := jsonb_build_object(
    'source', 'signed_mandate_attorney_handoff_phase3',
    'signingSessionId', v_session.id,
    'signingPackVersion', v_session.signing_pack_snapshot ->> 'version',
    'signingPackDigest', v_session.signing_pack_digest,
    'signingPackFrozenAt', v_session.signing_pack_frozen_at,
    'mandateSignedAt', v_session.signed_at,
    'partnerRoleConfigurationId', v_role_config.id,
    'frozenProposedTransferAttorney', v_attorney
  );

  select * into v_existing
  from public.private_listing_role_players
  where private_listing_id = v_listing.id
    and role_type = 'transfer_attorney'
    and allocation_status in ('awaiting_buyer', 'under_offer', 'instructed')
  order by selected_at desc
  limit 1
  for update;

  if v_existing.id is not null
     and v_existing.partner_role_configuration_id = v_role_config.id then
    update public.private_listing_role_players
    set partner_organisation_id = v_role_config.partner_organisation_id,
        preferred_partner_id = v_role_config.external_partner_id,
        partner_relationship_id = v_role_config.relationship_id,
        company_name = coalesce(nullif(btrim(v_attorney ->> 'companyName'), ''), v_existing.company_name),
        contact_person = nullif(btrim(v_attorney ->> 'contactPerson'), ''),
        email_address = nullif(lower(btrim(v_attorney ->> 'email')), ''),
        phone_number = nullif(btrim(v_attorney ->> 'phone'), ''),
        selection_source = 'seller_mandate',
        mandate_packet_id = coalesce(v_listing.mandate_packet_id, v_existing.mandate_packet_id),
        mandate_signed_at = v_session.signed_at,
        metadata = coalesce(v_existing.metadata, '{}'::jsonb) || v_metadata,
        updated_at = v_now
    where id = v_existing.id
    returning * into v_allocation;
  else
    if v_existing.id is not null then
      update public.private_listing_role_players
      set allocation_status = 'replaced', replaced_at = v_now, updated_at = v_now
      where id = v_existing.id;
    end if;

    insert into public.private_listing_role_players (
      organisation_id, private_listing_id, role_type, partner_role_configuration_id,
      preferred_partner_id, partner_relationship_id, partner_organisation_id,
      company_name, contact_person, email_address, phone_number, selection_source,
      allocation_status, mandate_packet_id, mandate_signed_at, metadata
    ) values (
      v_listing.organisation_id, v_listing.id, 'transfer_attorney', v_role_config.id,
      v_role_config.external_partner_id, v_role_config.relationship_id, v_role_config.partner_organisation_id,
      coalesce(nullif(btrim(v_attorney ->> 'companyName'), ''), 'Connected transfer attorney'),
      nullif(btrim(v_attorney ->> 'contactPerson'), ''), nullif(lower(btrim(v_attorney ->> 'email')), ''),
      nullif(btrim(v_attorney ->> 'phone'), ''), 'seller_mandate', 'awaiting_buyer',
      v_listing.mandate_packet_id, v_session.signed_at, v_metadata
    ) returning * into v_allocation;
  end if;

  return jsonb_build_object(
    'status', 'allocated',
    'idempotentReplay', v_existing.id is not null and v_existing.partner_role_configuration_id = v_role_config.id,
    'allocationId', v_allocation.id,
    'partnerOrganisationId', v_allocation.partner_organisation_id,
    'allocationStatus', v_allocation.allocation_status
  );
end;
$$;

-- Do not let a partial multi-signer group create an attorney handoff. The
-- current session is already marked signed when this fires, so the all-signed
-- test includes it and keeps the handoff inside the successful signing path.
create or replace function public.bridge_sync_signed_mandate_transfer_attorney_handoff()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if new.status = 'signed'
     and old.status is distinct from 'signed'
     and coalesce(new.selected_documents, '[]'::jsonb) ? 'mandate'
     and not exists (
       select 1
       from public.private_listing_mandate_signing_sessions sibling
       where sibling.signing_group_id = new.signing_group_id
         and sibling.id <> new.id
         and sibling.status <> 'signed'
     ) then
    perform public.bridge_handoff_signed_mandate_transfer_attorney(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_handoff_signed_mandate_transfer_attorney on public.private_listing_mandate_signing_sessions;
create trigger trg_handoff_signed_mandate_transfer_attorney
after update of status on public.private_listing_mandate_signing_sessions
for each row execute function public.bridge_sync_signed_mandate_transfer_attorney_handoff();

revoke all on function public.bridge_handoff_signed_mandate_transfer_attorney(uuid) from public, anon, authenticated;
grant execute on function public.bridge_handoff_signed_mandate_transfer_attorney(uuid) to service_role;
revoke all on function public.bridge_sync_signed_mandate_transfer_attorney_handoff() from public, anon, authenticated;

comment on function public.bridge_handoff_signed_mandate_transfer_attorney(uuid) is
  'Service-only, idempotent bridge from a frozen signed seller mandate pack to the existing listing transfer-attorney incoming-matter allocation.';

commit;
