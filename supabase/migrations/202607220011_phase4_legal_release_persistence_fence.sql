begin;

-- Phase 4's initial generator check happens before a potentially long render.
-- That check alone cannot prevent C3 from revoking the release while the
-- renderer is working.  These write-time fences serialize C3 with the actual
-- generated-draft persistence: the template row is locked and the current B3
-- provenance/audit tuple is rechecked in the same transaction as the document
-- link or generated packet-version write.
--
-- The function deliberately has no service-role-only branch.  The mandate
-- workflow creates a packet version through the authenticated I1 RPC and D3
-- links the document through an authenticated workspace RPC.  Their existing
-- authority checks remain in force; this helper adds release validity, not a
-- second incompatible caller model.
create or replace function public.bridge_assert_legal_template_release_persistence_fence_phase4(
  p_packet_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_packet public.document_packets%rowtype;
  v_template public.document_packet_templates%rowtype;
  v_metadata jsonb;
  v_packet_type text;
  v_content_digest text;
  v_review_evidence_digest text;
  v_b1_manifest_digest text;
  v_review_reference text;
  v_reviewed_by text;
  v_b3_applied_by text;
  v_b3_application_reference text;
  v_approved_at timestamptz;
  v_b3_applied_at timestamptz;
  v_provenance_matches boolean := false;
begin
  if p_packet_id is null then
    raise exception 'A legal packet is required to persist a generated artifact.'
      using errcode = '22000', detail = 'PHASE4_LEGAL_RELEASE_PERSISTENCE_FENCE_REJECTED';
  end if;

  select * into v_packet
  from public.document_packets
  where id = p_packet_id
  for update;
  if not found then
    raise exception 'Legal packet was not found.'
      using errcode = 'P0002', detail = 'PHASE4_LEGAL_RELEASE_PERSISTENCE_FENCE_REJECTED';
  end if;

  v_packet_type := lower(coalesce(v_packet.packet_type, ''));
  if v_packet_type not in ('otp', 'mandate') then
    return;
  end if;
  if v_packet.template_id is null then
    raise exception 'Legal packet has no persisted template binding.'
      using errcode = '22000', detail = 'PHASE4_LEGAL_RELEASE_PERSISTENCE_FENCE_REJECTED';
  end if;

  -- This UPDATE-conflicting lock is the critical ordering point: C3 cannot
  -- clear B3 metadata between this verification and the protected write.
  select * into v_template
  from public.document_packet_templates
  where id = v_packet.template_id
  for update;
  if not found then
    raise exception 'Legal packet template was not found.'
      using errcode = 'P0002', detail = 'PHASE4_LEGAL_RELEASE_PERSISTENCE_FENCE_REJECTED';
  end if;

  v_metadata := coalesce(v_template.metadata_json, '{}'::jsonb);
  v_content_digest := lower(trim(coalesce(v_metadata->>'legal_approval_content_digest', '')));
  v_review_evidence_digest := lower(trim(coalesce(v_metadata->>'legal_counsel_review_evidence_digest', '')));
  v_b1_manifest_digest := lower(trim(coalesce(v_metadata->>'legal_b1_manifest_digest', '')));
  v_review_reference := trim(coalesce(v_metadata->>'legal_approval_reference', ''));
  v_reviewed_by := trim(coalesce(v_metadata->>'legal_approved_by', ''));
  v_b3_applied_by := trim(coalesce(v_metadata->>'legal_b3_applied_by', ''));
  v_b3_application_reference := trim(coalesce(v_metadata->>'legal_b3_application_reference', ''));
  begin
    v_approved_at := nullif(trim(coalesce(v_metadata->>'legal_approved_at', '')), '')::timestamptz;
    v_b3_applied_at := nullif(trim(coalesce(v_metadata->>'legal_b3_applied_at', '')), '')::timestamptz;
  exception when others then
    raise exception 'Legal template release timestamps are invalid.'
      using errcode = '22000', detail = 'PHASE4_LEGAL_RELEASE_PERSISTENCE_FENCE_REJECTED';
  end;

  if lower(coalesce(v_template.packet_type, '')) <> v_packet_type
    or (v_template.organisation_id is not null and v_template.organisation_id is distinct from v_packet.organisation_id)
    or lower(coalesce(v_template.status, '')) <> 'published'
    or v_template.is_active is not true
    or lower(trim(coalesce(v_metadata->>'legal_review_status', ''))) <> 'approved'
    or nullif(trim(coalesce(v_metadata->>'legal_revoked_at', '')), '') is not null
    or v_content_digest = ''
    or v_review_evidence_digest = ''
    or v_b1_manifest_digest = ''
    or v_review_reference = ''
    or v_reviewed_by = ''
    or v_approved_at is null
    or v_b3_applied_at is null
    or v_b3_applied_by = ''
    or v_b3_application_reference = ''
    or coalesce(v_metadata->>'legal_phase4_b3_release_contract', '') <> 'phase4-b3-integrity-v1' then
    raise exception 'Legal template no longer has an active Phase 4 release.'
      using errcode = '55000', detail = 'PHASE4_LEGAL_RELEASE_PERSISTENCE_FENCE_REJECTED';
  end if;

  -- Provenance is authority-only and is joined to its immutable B3 audit row.
  -- Checking both here prevents a stale cache, forged metadata, or a C3
  -- revocation from being serialized after the renderer's earlier preflight.
  select exists (
    select 1
    from public.document_packet_template_release_provenance_phase4 provenance
    join public.document_packet_template_audit audit
      on audit.id = provenance.audit_event_id
    where provenance.template_id = v_template.id
      -- Global templates deliberately have no organisation_id; provenance is
      -- bound to the template's ownership scope, not blindly to the packet.
      and provenance.organisation_id is not distinct from v_template.organisation_id
      and provenance.packet_type = v_packet_type
      and provenance.content_digest = v_content_digest
      and provenance.review_evidence_digest = v_review_evidence_digest
      and provenance.b1_manifest_digest = v_b1_manifest_digest
      and provenance.review_reference = v_review_reference
      and provenance.reviewed_by = v_reviewed_by
      and provenance.reviewed_at = v_approved_at
      and provenance.b3_applied_at = v_b3_applied_at
      and provenance.b3_applied_by = v_b3_applied_by
      and provenance.b3_application_reference = v_b3_application_reference
      and provenance.release_contract = 'phase4-b3-integrity-v1'
      and audit.template_id = v_template.id
      and audit.event_type = 'legal_counsel_approval_applied'
      and audit.actor_role = 'service_role'
      and audit.created_at = provenance.b3_applied_at
      and coalesce(audit.event_payload_json->>'contentDigest', '') = provenance.content_digest
      and coalesce(audit.event_payload_json->>'reviewEvidenceDigest', '') = provenance.review_evidence_digest
      and coalesce(audit.event_payload_json->>'b1ManifestDigest', '') = provenance.b1_manifest_digest
      and coalesce(audit.event_payload_json->>'reviewReference', '') = provenance.review_reference
      and coalesce(audit.event_payload_json->>'reviewedBy', '') = provenance.reviewed_by
      and (audit.event_payload_json->>'reviewedAt')::timestamptz = provenance.reviewed_at
      and coalesce(audit.event_payload_json->>'b3AppliedBy', '') = provenance.b3_applied_by
      and coalesce(audit.event_payload_json->>'b3ApplicationReference', '') = provenance.b3_application_reference
      and coalesce(audit.event_payload_json->>'phase4B3ReleaseContract', '') = provenance.release_contract
  ) into v_provenance_matches;

  if not coalesce(v_provenance_matches, false) then
    raise exception 'Legal template release provenance no longer matches the current template.'
      using errcode = '55000', detail = 'PHASE4_LEGAL_RELEASE_PERSISTENCE_FENCE_REJECTED';
  end if;
end;
$$;

-- The Edge renderer writes the initial internal document link. D3 can later
-- update that same link from an authenticated workspace, so preserve the
-- normal H2 authority route rather than requiring service_role for all writes.
create or replace function public.bridge_enforce_legal_document_release_persistence_fence_phase4()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_packet_id uuid;
  v_packet_type text;
  v_link_changed boolean := false;
begin
  v_packet_id := new.legal_packet_id;
  if tg_op = 'UPDATE' then
    v_packet_id := coalesce(v_packet_id, old.legal_packet_id);
    v_link_changed := new.legal_packet_id is distinct from old.legal_packet_id
      or new.legal_packet_version_id is distinct from old.legal_packet_version_id;
  else
    v_link_changed := new.legal_packet_id is not null;
  end if;
  if not v_link_changed or v_packet_id is null then
    return new;
  end if;

  select lower(coalesce(packet_type, '')) into v_packet_type
  from public.document_packets
  where id = v_packet_id;
  if coalesce(v_packet_type, '') not in ('otp', 'mandate') then
    return new;
  end if;
  if coalesce(auth.role(), '') <> 'service_role'
    and not public.bridge_can_access_legal_packet_h2(v_packet_id) then
    raise exception 'Packet authority is required to link a legal generated document.'
      using errcode = '42501', detail = 'PHASE4_LEGAL_RELEASE_DOCUMENT_AUTHORITY_REQUIRED';
  end if;
  if new.legal_packet_version_id is not null and not exists (
    select 1
    from public.document_packet_versions version
    where version.id = new.legal_packet_version_id
      and version.packet_id = v_packet_id
  ) then
    raise exception 'A legal document may only link a version from the same packet.'
      using errcode = '22000', detail = 'PHASE4_LEGAL_RELEASE_DOCUMENT_VERSION_MISMATCH';
  end if;

  perform public.bridge_assert_legal_template_release_persistence_fence_phase4(v_packet_id);
  return new;
end;
$$;

drop trigger if exists trg_phase4_enforce_legal_document_release_persistence_fence on public.documents;
create trigger trg_phase4_enforce_legal_document_release_persistence_fence
before insert or update on public.documents
for each row execute function public.bridge_enforce_legal_document_release_persistence_fence_phase4();

-- I1 is invoked by an authenticated mandate workspace as well as by the
-- service-owned OTP seal transaction. Fence only the transition that makes a
-- generated packet version durable; editable drafts and post-generation
-- signing lifecycle updates retain their existing contracts.
create or replace function public.bridge_enforce_legal_version_release_persistence_fence_phase4()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_packet_type text;
  v_generated_now boolean := false;
  v_f2_evidence_changed boolean := false;
begin
  if new.packet_id is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    v_generated_now := lower(coalesce(new.render_status, '')) = 'generated';
    -- No supported path inserts an already-finalised version, but fence that
    -- shape as well so a future service cannot bypass the C3 serialization by
    -- collapsing creation and F2 evidence into one INSERT.
    v_f2_evidence_changed := nullif(trim(coalesce(new.final_signed_file_path, '')), '') is not null
      or nullif(trim(coalesce(new.final_signed_file_bucket, '')), '') is not null
      or nullif(trim(coalesce(new.final_signed_file_name, '')), '') is not null
      or new.finalised_at is not null;
  else
    v_generated_now := lower(coalesce(new.render_status, '')) = 'generated'
      and lower(coalesce(old.render_status, '')) <> 'generated';
    -- C3 invalidates the release for the whole template batch. A packet that
    -- began signing before C3 must not acquire new immutable F2 evidence after
    -- C3 has committed; it must be regenerated/re-approved from the current
    -- release instead.
    -- `final_signed_document_id` is intentionally excluded: F3 may attach
    -- the public Documents-row identity to an already immutable F2 artifact.
    -- The bucket/path/name/finalised timestamp are the F2 evidence transition.
    v_f2_evidence_changed := new.final_signed_file_path is distinct from old.final_signed_file_path
      or new.final_signed_file_bucket is distinct from old.final_signed_file_bucket
      or new.final_signed_file_name is distinct from old.final_signed_file_name
      or new.finalised_at is distinct from old.finalised_at;
  end if;
  if not (v_generated_now or v_f2_evidence_changed) then
    return new;
  end if;

  select lower(coalesce(packet_type, '')) into v_packet_type
  from public.document_packets
  where id = new.packet_id;
  if coalesce(v_packet_type, '') not in ('otp', 'mandate') then
    return new;
  end if;
  if coalesce(auth.role(), '') <> 'service_role'
    and not public.bridge_can_access_legal_packet_h2(new.packet_id) then
    raise exception 'Packet authority is required to persist a generated legal version.'
      using errcode = '42501', detail = 'PHASE4_LEGAL_RELEASE_VERSION_AUTHORITY_REQUIRED';
  end if;

  perform public.bridge_assert_legal_template_release_persistence_fence_phase4(new.packet_id);
  return new;
end;
$$;

-- PostgreSQL fires same-timing triggers alphabetically. Keep this after the
-- existing I1 packet guard (`trg_guard_*`) so both write paths take locks in
-- the same packet-then-template order and avoid a D3/I1 deadlock.
drop trigger if exists trg_phase4_enforce_legal_version_release_persistence_fence on public.document_packet_versions;
create trigger trg_phase4_enforce_legal_version_release_persistence_fence
before insert or update on public.document_packet_versions
for each row execute function public.bridge_enforce_legal_version_release_persistence_fence_phase4();

revoke all on function public.bridge_assert_legal_template_release_persistence_fence_phase4(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.bridge_enforce_legal_document_release_persistence_fence_phase4()
  from public, anon, authenticated, service_role;
revoke all on function public.bridge_enforce_legal_version_release_persistence_fence_phase4()
  from public, anon, authenticated, service_role;

comment on function public.bridge_assert_legal_template_release_persistence_fence_phase4(uuid) is
  'Phase 4 write-time legal release fence. Locks the bound template and rechecks current B3 provenance/audit before a generated artifact becomes durable.';

notify pgrst, 'reload schema';

commit;
