-- Seller document branding is a legal-artifact input. Freeze it alongside the
-- signing pack so the recipient journey and every final PDF use the same
-- organisation identity even when agency settings change later.
alter table public.private_listing_mandate_signing_sessions
  add column if not exists branding_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists branding_digest text,
  add column if not exists branding_frozen_at timestamptz;

alter table public.private_listing_mandate_signing_sessions
  drop constraint if exists private_listing_mandate_signing_branding_digest_check;
alter table public.private_listing_mandate_signing_sessions
  add constraint private_listing_mandate_signing_branding_digest_check
  check (branding_digest is null or branding_digest ~ '^[0-9a-f]{64}$');

create or replace function public.bridge_keep_listing_signing_branding_immutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.branding_digest is not null and (
    new.branding_digest is distinct from old.branding_digest
    or new.branding_snapshot is distinct from old.branding_snapshot
    or new.branding_frozen_at is distinct from old.branding_frozen_at
    or (
      new.signing_pack_snapshot is distinct from old.signing_pack_snapshot
      and (
        coalesce(new.signing_pack_snapshot->'branding', '{}'::jsonb) is distinct from old.branding_snapshot
        or coalesce((new.signing_pack_snapshot->'mandate')->'branding', '{}'::jsonb) is distinct from old.branding_snapshot
      )
    )
  ) then
    raise exception 'Seller signing branding lineage is immutable.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_keep_listing_signing_branding_immutable
  on public.private_listing_mandate_signing_sessions;
create trigger trg_keep_listing_signing_branding_immutable
before update of branding_snapshot, branding_digest, branding_frozen_at, signing_pack_snapshot
on public.private_listing_mandate_signing_sessions
for each row
execute function public.bridge_keep_listing_signing_branding_immutable();

revoke all on function public.bridge_keep_listing_signing_branding_immutable()
  from public, anon, authenticated;

create index if not exists private_listing_mandate_signing_branding_digest_idx
  on public.private_listing_mandate_signing_sessions (branding_digest)
  where branding_digest is not null;

create or replace function public.bridge_prepare_listing_seller_signing_pack_atomically(
  p_listing_id uuid,
  p_signing_group_id uuid,
  p_sessions jsonb,
  p_superseded_signing_group_id uuid default null,
  p_replacement_reason text default null,
  p_initiated_by uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_listing public.private_listings%rowtype;
  v_source public.private_listing_mandate_signing_sessions%rowtype;
  v_session jsonb;
  v_selected_documents text[];
  v_branding_snapshot jsonb;
  v_branding_digest text;
  v_branding_frozen_at timestamptz;
  v_source_signed_count integer := 0;
  v_revoked_count integer := 0;
  v_recent_revoked integer := 0;
  v_prepared_count integer := 0;
  v_lineage_id uuid;
  v_is_amendment boolean := false;
begin
  if p_signing_group_id is null or jsonb_typeof(coalesce(p_sessions, '[]'::jsonb)) <> 'array' or jsonb_array_length(p_sessions) = 0 then
    raise exception 'At least one signing session is required.';
  end if;

  select * into v_listing from public.private_listings where id = p_listing_id for update;
  if not found then raise exception 'Listing not found.'; end if;

  if p_superseded_signing_group_id is not null then
    if char_length(trim(coalesce(p_replacement_reason, ''))) < 5 then
      raise exception 'Provide a short reason for replacing this seller signing pack.';
    end if;
    select * into v_source
    from public.private_listing_mandate_signing_sessions
    where private_listing_id = p_listing_id and signing_group_id = p_superseded_signing_group_id
    order by created_at limit 1 for update;
    if not found then raise exception 'The seller signing pack to correct was not found.'; end if;
    perform 1 from public.private_listing_mandate_signing_sessions where signing_group_id = p_superseded_signing_group_id for update;
    select count(*) filter (where status = 'signed') into v_source_signed_count
    from public.private_listing_mandate_signing_sessions where signing_group_id = p_superseded_signing_group_id;
    v_is_amendment := v_source_signed_count > 0;

    update public.private_listing_mandate_signing_sessions
       set status = 'revoked', updated_at = now()
     where signing_group_id = p_superseded_signing_group_id and status = 'active';
    get diagnostics v_revoked_count = row_count;

    insert into public.private_listing_signing_pack_replacements (
      organisation_id, private_listing_id, superseded_signing_group_id, replacement_signing_group_id, reason, initiated_by
    ) values (
      v_listing.organisation_id, p_listing_id, p_superseded_signing_group_id, p_signing_group_id, trim(p_replacement_reason), p_initiated_by
    ) returning id into v_lineage_id;
  end if;

  for v_session in select value from jsonb_array_elements(p_sessions) loop
    if nullif(trim(coalesce(v_session->>'signerName', '')), '') is null
      or nullif(trim(coalesce(v_session->>'signerEmail', '')), '') is null
      or nullif(trim(coalesce(v_session->>'tokenHash', '')), '') is null then
      raise exception 'Every required signer needs a name, email and secure token.';
    end if;
    select array_agg(value::text) into v_selected_documents
    from jsonb_array_elements_text(coalesce(v_session->'selectedDocuments', '[]'::jsonb));
    if coalesce(array_length(v_selected_documents, 1), 0) = 0 then raise exception 'Choose at least one seller document.'; end if;

    v_branding_snapshot := coalesce(v_session->'brandingSnapshot', '{}'::jsonb);
    v_branding_digest := lower(nullif(trim(coalesce(v_session->>'brandingDigest', '')), ''));
    v_branding_frozen_at := nullif(trim(coalesce(v_session->>'brandingFrozenAt', '')), '')::timestamptz;
    if jsonb_typeof(v_branding_snapshot) <> 'object'
      or v_branding_snapshot->>'contract' <> 'arch9-seller-signing-branding-snapshot-v1'
      or v_branding_snapshot->>'organisationId' <> v_listing.organisation_id::text
      or v_branding_digest is null
      or v_branding_digest !~ '^[0-9a-f]{64}$'
      or lower(coalesce(v_branding_snapshot->>'digest', '')) <> v_branding_digest
      or v_branding_frozen_at is null then
      raise exception 'The authoritative seller signing branding snapshot is invalid.';
    end if;
    if coalesce((v_session->'signingPackSnapshot')->'branding', '{}'::jsonb) is distinct from v_branding_snapshot then
      raise exception 'The signing pack branding does not match its authoritative lineage.';
    end if;
    if coalesce(((v_session->'signingPackSnapshot')->'mandate')->'branding', '{}'::jsonb) is distinct from v_branding_snapshot then
      raise exception 'The mandate branding does not match its authoritative lineage.';
    end if;

    update public.private_listing_mandate_signing_sessions as existing
       set status = 'revoked', updated_at = now()
     where existing.private_listing_id = p_listing_id
       and existing.status = 'active'
       and lower(existing.signer_email) = lower(v_session->>'signerEmail')
       and existing.signing_group_id is distinct from p_signing_group_id
       and exists (
         select 1 from unnest(coalesce(existing.selected_documents, '{}'::text[])) as document_key
         where document_key = any(v_selected_documents)
       );
    get diagnostics v_recent_revoked = row_count;
    v_revoked_count := v_revoked_count + v_recent_revoked;

    insert into public.private_listing_mandate_signing_sessions (
      organisation_id, private_listing_id, signer_email, signer_name, token_hash, expires_at,
      selected_documents, mandate_snapshot, signing_pack_snapshot, signing_pack_version,
      signing_pack_digest, signing_pack_frozen_at, branding_snapshot, branding_digest,
      branding_frozen_at, signing_group_id, is_primary_document_contact,
      primary_document_contact_email, created_by
    ) values (
      v_listing.organisation_id, p_listing_id, lower(trim(v_session->>'signerEmail')), trim(v_session->>'signerName'),
      trim(v_session->>'tokenHash'), (v_session->>'expiresAt')::timestamptz, v_selected_documents,
      coalesce(v_session->'mandateSnapshot', '{}'::jsonb), coalesce(v_session->'signingPackSnapshot', '{}'::jsonb),
      nullif(trim(coalesce(v_session->>'signingPackVersion', '')), ''), nullif(trim(coalesce(v_session->>'signingPackDigest', '')), ''),
      nullif(trim(coalesce(v_session->>'signingPackFrozenAt', '')), '')::timestamptz,
      v_branding_snapshot, v_branding_digest, v_branding_frozen_at, p_signing_group_id,
      coalesce((v_session->>'isPrimaryDocumentContact')::boolean, false),
      nullif(lower(trim(coalesce(v_session->>'primaryDocumentContactEmail', ''))), ''), p_initiated_by
    );
    v_prepared_count := v_prepared_count + 1;
  end loop;

  if v_lineage_id is not null then
    insert into public.private_listing_activity (
      private_listing_id, activity_type, activity_title, activity_description, visibility, metadata
    ) values (
      p_listing_id,
      case when v_is_amendment then 'seller_signing_pack_amendment_prepared' else 'seller_signing_pack_replaced' end,
      case when v_is_amendment then 'Seller signing pack amendment prepared' else 'Seller signing pack replaced' end,
      case when v_is_amendment then 'A corrected seller signing pack was prepared while earlier signatures remain audit evidence.' else 'Active seller signing links were revoked and a replacement pack was prepared.' end,
      'internal',
      jsonb_build_object('replacementId', v_lineage_id, 'supersededSigningGroupId', p_superseded_signing_group_id, 'replacementSigningGroupId', p_signing_group_id, 'reason', trim(p_replacement_reason), 'preparedSessions', v_prepared_count, 'activeSessionsRevoked', v_revoked_count, 'signedSessionsRetained', v_source_signed_count)
    );
  end if;

  return jsonb_build_object(
    'preparedSessions', v_prepared_count,
    'activeSessionsRevoked', v_revoked_count,
    'replacementId', v_lineage_id,
    'isAmendment', v_is_amendment,
    'brandingDigest', v_branding_digest
  );
end;
$$;

revoke all on function public.bridge_prepare_listing_seller_signing_pack_atomically(uuid, uuid, jsonb, uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.bridge_prepare_listing_seller_signing_pack_atomically(uuid, uuid, jsonb, uuid, text, uuid)
  to service_role;

comment on column public.private_listing_mandate_signing_sessions.branding_snapshot is
  'Immutable canonical organisation branding captured when the seller signing pack is issued.';
comment on column public.private_listing_mandate_signing_sessions.branding_digest is
  'SHA-256 digest of the immutable seller signing branding snapshot.';
