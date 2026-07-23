begin;

-- Phase 4 makes legal-template approval a service-owned release transition.
-- A draft may be edited freely, but it can never be published carrying a
-- caller-authored approval cache. That cache is written only by B3 after the
-- immutable published revision exists. This also prevents a published legal
-- revision from being moved back to draft to evade B4 immutability.
create or replace function public.bridge_legal_runtime_metadata_has_release_claims_phase4(
  p_metadata jsonb
)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_nested jsonb;
  v_status text;
begin
  if jsonb_typeof(v_metadata) <> 'object' then
    -- The runtime gate will not read a non-object value, so it cannot be an
    -- approval claim. Leave schema/type validation to the template contract.
    return false;
  end if;

  v_nested := case
    when jsonb_typeof(v_metadata->'legal_review') = 'object' then v_metadata->'legal_review'
    when jsonb_typeof(v_metadata->'legalReview') = 'object' then v_metadata->'legalReview'
    else '{}'::jsonb
  end;
  v_status := lower(trim(coalesce(
    nullif(v_metadata->>'legal_review_status', ''),
    nullif(v_metadata->>'legalApprovalStatus', ''),
    nullif(v_nested->>'status', ''),
    ''
  )));
  if v_status = 'approved' then
    return true;
  end if;

  return exists (
    select 1
    from unnest(array[
      'legal_approved_at',
      'legal_approval_reference',
      'legal_approved_by',
      'legal_approval_content_digest',
      'legal_counsel_review_evidence_digest',
      'legal_b1_manifest_digest',
      'legal_b3_applied_at',
      'legal_b3_applied_by',
      'legal_b3_application_reference',
      'legal_phase4_b3_release_contract',
      'legalApprovedAt',
      'legalApprovalReference',
      'legalApprovedBy',
      'legalApprovalContentDigest',
      'legalCounselReviewEvidenceDigest',
      'legalB1ManifestDigest',
      'legalB3AppliedAt',
      'legalB3AppliedBy',
      'legalB3ApplicationReference',
      'legalPhase4B3ReleaseContract'
    ]::text[]) as claimed_key(key)
    where nullif(trim(v_metadata->>claimed_key.key), '') is not null
  ) or exists (
    select 1
    from unnest(array[
      'approvedAt',
      'reference',
      'approvedBy',
      'contentDigest',
      'reviewEvidenceDigest',
      'b1ManifestDigest',
      'b3AppliedAt',
      'b3AppliedBy',
      'b3ApplicationReference',
      'phase4B3ReleaseContract'
    ]::text[]) as claimed_key(key)
    where nullif(trim(v_nested->>claimed_key.key), '') is not null
  );
end;
$$;

create or replace function public.bridge_legal_runtime_metadata_changed_phase4(
  p_old jsonb,
  p_new jsonb
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select exists (
    select 1
    from unnest(array[
      'legal_review_status',
      'legal_approved_at',
      'legal_approval_reference',
      'legal_approved_by',
      'legal_approval_content_digest',
      'legal_counsel_review_evidence_digest',
      'legal_b1_manifest_digest',
      'legal_b3_applied_at',
      'legal_b3_applied_by',
      'legal_b3_application_reference',
      'legal_phase4_b3_release_contract',
      'legal_revoked_at',
      'legal_revocation_reason',
      'legal_c3_restarted_at',
      'legal_c3_restarted_by',
      'legal_c3_restart_reference',
      'legal_c3_previous_manifest_digest',
      'legal_approval_history',
      'legalApprovalStatus',
      'legalApprovedAt',
      'legalApprovalReference',
      'legalApprovedBy',
      'legalApprovalContentDigest',
      'legalCounselReviewEvidenceDigest',
      'legalB1ManifestDigest',
      'legalB3AppliedAt',
      'legalB3AppliedBy',
      'legalB3ApplicationReference',
      'legalPhase4B3ReleaseContract',
      'legalRevokedAt',
      'legalRevocationReason',
      'legal_review',
      'legalReview'
    ]::text[]) as legal_key(key)
    where coalesce(p_old, '{}'::jsonb)->legal_key.key
      is distinct from coalesce(p_new, '{}'::jsonb)->legal_key.key
  );
$$;

create or replace function public.bridge_guard_legal_template_release_integrity_phase4()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_packet_type text := lower(coalesce(new.packet_type, case when tg_op = 'UPDATE' then old.packet_type else '' end, ''));
  v_old_status text := case when tg_op = 'UPDATE' then lower(coalesce(old.status, '')) else '' end;
  v_new_status text := lower(coalesce(new.status, ''));
  v_runtime_mutation text := lower(coalesce(current_setting('bridge.legal_runtime_metadata_mutation', true), ''));
  v_service_runtime_transition boolean := coalesce(auth.role(), '') = 'service_role' and v_runtime_mutation in ('b3', 'c3');
begin
  if v_packet_type not in ('otp', 'mandate') then
    return new;
  end if;

  if tg_op = 'UPDATE' and v_old_status = 'published' and v_new_status = 'draft' then
    raise exception 'Published legal template revisions cannot be returned to draft. Create a new revision.'
      using errcode = '55000';
  end if;

  -- A pre-publication template can be pending review, but an approval claim
  -- must be written only by the B3 service RPC after publication.
  if v_new_status = 'published'
    and v_old_status is distinct from 'published'
    and public.bridge_legal_runtime_metadata_has_release_claims_phase4(new.metadata_json) then
    raise exception 'Legal approval metadata cannot be supplied while publishing a template. Apply B3 after publication.'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE'
    and (v_old_status = 'published' or v_new_status = 'published')
    and public.bridge_legal_runtime_metadata_changed_phase4(old.metadata_json, new.metadata_json)
    and not v_service_runtime_transition then
    raise exception 'Legal runtime approval metadata is service-owned and may only change through B3 or C3.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_legal_template_release_integrity_phase4 on public.document_packet_templates;
create trigger trg_guard_legal_template_release_integrity_phase4
before insert or update on public.document_packet_templates
for each row execute function public.bridge_guard_legal_template_release_integrity_phase4();

-- B3/C3 audit records are part of the runtime release proof. Preserve normal
-- template audit behaviour, but reject caller-authored rows for the two
-- release event types so neither a forged match nor an audit-row flood can
-- bypass or deny the generator's audit binding.
create or replace function public.bridge_guard_legal_template_release_audit_phase4()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.event_type in ('legal_counsel_approval_applied', 'legal_review_cycle_restarted')
    and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Legal release audit events are service-owned.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_legal_template_release_audit_phase4 on public.document_packet_template_audit;
create trigger trg_guard_legal_template_release_audit_phase4
before insert on public.document_packet_template_audit
for each row execute function public.bridge_guard_legal_template_release_audit_phase4();

comment on function public.bridge_guard_legal_template_release_integrity_phase4() is
  'Phase 4 blocks forged legal approval metadata at publication and prevents published legal revisions returning to draft.';
comment on function public.bridge_guard_legal_template_release_audit_phase4() is
  'Phase 4 reserves B3/C3 release audit events for service-role controlled functions.';

commit;
