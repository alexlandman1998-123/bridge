begin;

create table if not exists public.legal_final_artifact_evidence (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  packet_id uuid not null references public.document_packets(id) on delete cascade,
  packet_version_id uuid not null references public.document_packet_versions(id) on delete cascade,
  bucket text not null,
  path text not null,
  file_name text not null,
  media_type text not null default 'application/pdf',
  sha256 text not null,
  byte_length bigint not null,
  signer_evidence_sha256 text not null,
  field_evidence_sha256 text not null,
  generated_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (packet_version_id),
  check (sha256 ~ '^[0-9a-f]{64}$'),
  check (signer_evidence_sha256 ~ '^[0-9a-f]{64}$'),
  check (field_evidence_sha256 ~ '^[0-9a-f]{64}$'),
  check (byte_length >= 100),
  check (media_type = 'application/pdf')
);

alter table public.legal_final_artifact_evidence enable row level security;
revoke all on public.legal_final_artifact_evidence from anon, authenticated;

create or replace function public.bridge_record_final_artifact_f2(
  p_organisation_id uuid,
  p_packet_id uuid,
  p_packet_version_id uuid,
  p_bucket text,
  p_path text,
  p_file_name text,
  p_sha256 text,
  p_byte_length bigint,
  p_signer_evidence_sha256 text,
  p_field_evidence_sha256 text,
  p_generated_at timestamptz,
  p_event_type text,
  p_event_payload jsonb,
  p_finalised_by uuid default null,
  p_final_signed_document_id uuid default null
)
returns public.document_packet_versions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version public.document_packet_versions%rowtype;
begin
  insert into public.legal_final_artifact_evidence (
    organisation_id, packet_id, packet_version_id, bucket, path, file_name, media_type,
    sha256, byte_length, signer_evidence_sha256, field_evidence_sha256, generated_at
  ) values (
    p_organisation_id, p_packet_id, p_packet_version_id, p_bucket, p_path, p_file_name, 'application/pdf',
    p_sha256, p_byte_length, p_signer_evidence_sha256, p_field_evidence_sha256, p_generated_at
  );
  update public.document_packet_versions set
    final_signed_file_path = p_path,
    final_signed_file_url = null,
    final_signed_file_bucket = p_bucket,
    final_signed_file_name = p_file_name,
    final_signed_document_id = p_final_signed_document_id,
    finalised_at = p_generated_at,
    finalised_by = p_finalised_by
  where id = p_packet_version_id and packet_id = p_packet_id and organisation_id = p_organisation_id
  returning * into v_version;
  if v_version.id is null then raise exception 'F2 final packet version was not found.' using errcode = 'P0001'; end if;
  update public.document_packets set
    status = 'completed',
    completed_at = p_generated_at,
    source_context_json = coalesce(source_context_json, '{}'::jsonb) || jsonb_build_object(
      'signing_status', 'completed',
      'signingStatus', 'completed',
      'mandateStatus', 'completed',
      'signedAt', coalesce(source_context_json->'signedAt', to_jsonb(p_generated_at)),
      'finalSignedAt', p_generated_at,
      'finalSignedArtifactPath', p_path
    )
  where id = p_packet_id and organisation_id = p_organisation_id;
  if not found then raise exception 'F2 final packet was not found.' using errcode = 'P0001'; end if;
  insert into public.document_packet_events (packet_id, organisation_id, version_id, event_type, event_payload_json, created_by, created_at)
  values (p_packet_id, p_organisation_id, p_packet_version_id, p_event_type, coalesce(p_event_payload, '{}'::jsonb), p_finalised_by, p_generated_at);
  return v_version;
end;
$$;

revoke all on function public.bridge_record_final_artifact_f2(uuid, uuid, uuid, text, text, text, text, bigint, text, text, timestamptz, text, jsonb, uuid, uuid) from public, anon, authenticated;
grant execute on function public.bridge_record_final_artifact_f2(uuid, uuid, uuid, text, text, text, text, bigint, text, text, timestamptz, text, jsonb, uuid, uuid) to service_role;

create or replace function public.bridge_enforce_final_artifact_evidence_f2()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_packet public.document_packets%rowtype;
  v_lock jsonb;
  v_evidence public.legal_final_artifact_evidence%rowtype;
  v_incomplete integer;
begin
  if new.final_signed_file_path is not distinct from old.final_signed_file_path
    and new.final_signed_file_bucket is not distinct from old.final_signed_file_bucket
    and new.finalised_at is not distinct from old.finalised_at then return new; end if;
  if coalesce(old.final_signed_file_path, '') <> '' then
    raise exception 'F2 final signed artifact evidence is immutable.' using errcode = 'P0001';
  end if;
  select * into v_packet from public.document_packets where id = new.packet_id;
  v_lock := coalesce(new.validation_summary_json->'lock_snapshot', '{}'::jsonb);
  select * into v_evidence from public.legal_final_artifact_evidence where packet_version_id = new.id;
  if v_packet.id is null
    or v_packet.organisation_id is distinct from new.organisation_id
    or v_packet.current_version_number is distinct from new.version_number
    or new.render_status <> 'generated'
    or coalesce(new.validation_summary_json->>'review_state', '') <> 'locked'
    or coalesce((new.validation_summary_json->>'content_locked')::boolean, false) is not true
    or coalesce(v_lock->>'lockDecision', '') <> 'locked'
    or coalesce(v_lock->>'packetId', '') <> new.packet_id::text
    or coalesce(v_lock->>'versionId', '') <> new.id::text then
    raise exception 'F2 finalisation requires the exact current E2-locked version.' using errcode = 'P0001';
  end if;
  select count(*) into v_incomplete from public.document_packet_signers signer
  where signer.packet_id = new.packet_id and signer.packet_version_id = new.id
    and (signer.status <> 'signed' or signer.signed_at is null);
  if v_incomplete > 0 or not exists (select 1 from public.document_packet_signers signer where signer.packet_id = new.packet_id and signer.packet_version_id = new.id) then
    raise exception 'F2 every configured signer must be complete.' using errcode = 'P0001';
  end if;
  select count(*) into v_incomplete from public.document_signing_fields field
  where field.packet_id = new.packet_id and field.packet_version_id = new.id and field.required is true
    and (
      coalesce(field.status, '') <> 'completed'
      or (field.field_type in ('signature', 'initial') and coalesce(field.signature_asset_path, '') = '')
      or (field.field_type in ('signature', 'initial') and not exists (
        select 1 from public.document_packet_signers signer
        where signer.packet_id = field.packet_id and signer.packet_version_id = field.packet_version_id
          and signer.signer_role = field.signer_role
          and (coalesce(trim(field.signer_email), '') = '' or lower(trim(signer.signer_email)) = lower(trim(field.signer_email)))
          and field.signature_asset_path like ('document-signatures/' || field.packet_id::text || '/' || signer.id::text || '/%')
      ))
    );
  if v_incomplete > 0
    or not exists (
      select 1 from public.document_signing_fields field
      where field.packet_id = new.packet_id and field.packet_version_id = new.id
        and field.required is true and field.field_type = 'signature'
    )
    or v_evidence.id is null
    or v_evidence.organisation_id is distinct from new.organisation_id
    or v_evidence.packet_id is distinct from new.packet_id
    or v_evidence.path is distinct from new.final_signed_file_path
    or v_evidence.bucket is distinct from new.final_signed_file_bucket
    or v_evidence.file_name is distinct from new.final_signed_file_name
    or v_evidence.generated_at is distinct from new.finalised_at then
    raise exception 'F2 final artifact evidence is missing, incomplete or mismatched.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_final_artifact_evidence_f2 on public.document_packet_versions;
create trigger trg_final_artifact_evidence_f2
before update of final_signed_file_path, final_signed_file_bucket, final_signed_file_name, finalised_at
on public.document_packet_versions
for each row execute function public.bridge_enforce_final_artifact_evidence_f2();

create or replace function public.bridge_prevent_final_artifact_evidence_mutation_f2()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  raise exception 'F2 final artifact evidence cannot be changed or deleted.' using errcode = 'P0001';
end;
$$;

drop trigger if exists trg_prevent_final_artifact_evidence_mutation_f2 on public.legal_final_artifact_evidence;
create trigger trg_prevent_final_artifact_evidence_mutation_f2
before update or delete on public.legal_final_artifact_evidence
for each row execute function public.bridge_prevent_final_artifact_evidence_mutation_f2();

create or replace function public.bridge_enforce_completed_packet_artifact_f2()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_version public.document_packet_versions%rowtype;
  v_evidence public.legal_final_artifact_evidence%rowtype;
begin
  if new.status is distinct from 'completed' or old.status is not distinct from 'completed' then return new; end if;
  select * into v_version from public.document_packet_versions where packet_id = new.id and version_number = new.current_version_number;
  select * into v_evidence from public.legal_final_artifact_evidence where packet_version_id = v_version.id;
  if v_version.id is null or coalesce(v_version.final_signed_file_path, '') = '' or v_version.finalised_at is null
    or v_evidence.id is null or v_evidence.path is distinct from v_version.final_signed_file_path
    or new.completed_at is null then
    raise exception 'F2 packet completion requires its immutable final signed artifact.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_completed_packet_artifact_f2 on public.document_packets;
create trigger trg_completed_packet_artifact_f2
before update of status, completed_at on public.document_packets
for each row execute function public.bridge_enforce_completed_packet_artifact_f2();

commit;
