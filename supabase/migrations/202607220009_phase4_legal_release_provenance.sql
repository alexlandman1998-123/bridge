begin;

-- The B3 audit event is useful operational evidence, but Phase 4 also keeps
-- an authority-only provenance row that can only be written by the audit
-- trigger after it verifies the current immutable template metadata. Rows
-- created before this migration cannot satisfy this table, so old or forged
-- cache/audit pairs are never grandfathered into the launch gate.
create table if not exists public.document_packet_template_release_provenance_phase4 (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.document_packet_templates(id) on delete restrict,
  audit_event_id uuid not null unique references public.document_packet_template_audit(id) on delete restrict,
  organisation_id uuid references public.organisations(id) on delete cascade,
  packet_type text not null check (packet_type in ('otp', 'mandate')),
  content_digest text not null check (content_digest ~ '^sha256:[0-9a-f]{64}$'),
  review_evidence_digest text not null check (review_evidence_digest ~ '^sha256:[0-9a-f]{64}$'),
  b1_manifest_digest text not null check (b1_manifest_digest ~ '^sha256:[0-9a-f]{64}$'),
  review_reference text not null,
  reviewed_by text not null,
  reviewed_at timestamptz not null,
  b3_applied_at timestamptz not null,
  b3_applied_by text not null,
  b3_application_reference text not null,
  release_contract text not null check (release_contract = 'phase4-b3-integrity-v1'),
  created_at timestamptz not null default now()
);

create index if not exists document_packet_template_release_provenance_phase4_template_idx
  on public.document_packet_template_release_provenance_phase4 (template_id, b3_applied_at desc);

alter table public.document_packet_template_release_provenance_phase4 enable row level security;
revoke all on table public.document_packet_template_release_provenance_phase4 from public, anon, authenticated, service_role;
grant select on table public.document_packet_template_release_provenance_phase4 to service_role;

create or replace function public.bridge_capture_legal_template_release_provenance_phase4()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template public.document_packet_templates%rowtype;
  v_metadata jsonb;
  v_payload jsonb := coalesce(new.event_payload_json, '{}'::jsonb);
  v_contract constant text := 'phase4-b3-integrity-v1';
begin
  if new.event_type <> 'legal_counsel_approval_applied' then
    return new;
  end if;
  if coalesce(auth.role(), '') <> 'service_role'
    or new.actor_role is distinct from 'service_role'
    or new.template_id is null then
    raise exception 'B3 release provenance requires a service-owned audit event.' using errcode = '42501';
  end if;

  select * into v_template
  from public.document_packet_templates
  where id = new.template_id;
  if not found then
    raise exception 'B3 release provenance template is missing.' using errcode = '23503';
  end if;
  v_metadata := coalesce(v_template.metadata_json, '{}'::jsonb);

  if lower(coalesce(v_template.packet_type, '')) not in ('otp', 'mandate')
    or lower(coalesce(v_template.status, '')) <> 'published'
    or v_template.is_active is not true
    or coalesce(v_metadata->>'legal_review_status', '') <> 'approved'
    or coalesce(v_metadata->>'legal_approval_content_digest', '') <> coalesce(v_payload->>'contentDigest', '')
    or coalesce(v_metadata->>'legal_counsel_review_evidence_digest', '') <> coalesce(v_payload->>'reviewEvidenceDigest', '')
    or coalesce(v_metadata->>'legal_b1_manifest_digest', '') <> coalesce(v_payload->>'b1ManifestDigest', '')
    or coalesce(v_metadata->>'legal_approval_reference', '') <> coalesce(v_payload->>'reviewReference', '')
    or coalesce(v_metadata->>'legal_approved_by', '') <> coalesce(v_payload->>'reviewedBy', '')
    or coalesce(v_metadata->>'legal_b3_applied_by', '') <> coalesce(v_payload->>'b3AppliedBy', '')
    or coalesce(v_metadata->>'legal_b3_application_reference', '') <> coalesce(v_payload->>'b3ApplicationReference', '')
    or coalesce(v_metadata->>'legal_phase4_b3_release_contract', '') <> v_contract
    or coalesce(v_payload->>'phase4B3ReleaseContract', '') <> v_contract
    or (v_metadata->>'legal_approved_at')::timestamptz is distinct from (v_payload->>'reviewedAt')::timestamptz
    or (v_metadata->>'legal_b3_applied_at')::timestamptz is distinct from new.created_at then
    raise exception 'B3 audit evidence does not match the current legal template release metadata.'
      using errcode = '23514';
  end if;

  insert into public.document_packet_template_release_provenance_phase4 (
    template_id,
    audit_event_id,
    organisation_id,
    packet_type,
    content_digest,
    review_evidence_digest,
    b1_manifest_digest,
    review_reference,
    reviewed_by,
    reviewed_at,
    b3_applied_at,
    b3_applied_by,
    b3_application_reference,
    release_contract
  ) values (
    v_template.id,
    new.id,
    v_template.organisation_id,
    lower(v_template.packet_type),
    v_payload->>'contentDigest',
    v_payload->>'reviewEvidenceDigest',
    v_payload->>'b1ManifestDigest',
    v_payload->>'reviewReference',
    v_payload->>'reviewedBy',
    (v_payload->>'reviewedAt')::timestamptz,
    new.created_at,
    v_payload->>'b3AppliedBy',
    v_payload->>'b3ApplicationReference',
    v_contract
  );
  return new;
end;
$$;

revoke all on function public.bridge_capture_legal_template_release_provenance_phase4() from public, anon, authenticated, service_role;

drop trigger if exists trg_capture_legal_template_release_provenance_phase4 on public.document_packet_template_audit;
create trigger trg_capture_legal_template_release_provenance_phase4
after insert on public.document_packet_template_audit
for each row execute function public.bridge_capture_legal_template_release_provenance_phase4();

comment on table public.document_packet_template_release_provenance_phase4 is
  'Phase 4 authority-only provenance emitted by validated service B3 audit events; legacy audit rows are intentionally absent.';

notify pgrst, 'reload schema';

commit;
