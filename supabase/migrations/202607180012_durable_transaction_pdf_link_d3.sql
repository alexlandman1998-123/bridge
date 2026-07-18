begin;

-- D3: bind the D2-verified PDF to one immutable packet version and one canonical
-- transaction document row. Signed URLs may expire; this bucket/path identity does not.

alter table public.document_packet_versions
  add column if not exists rendered_file_bucket text,
  add column if not exists rendered_media_type text,
  add column if not exists rendered_byte_length bigint,
  add column if not exists rendered_sha256 text,
  add column if not exists transaction_pdf_persisted boolean not null default false,
  add column if not exists transaction_pdf_persisted_at timestamptz;

alter table public.documents
  add column if not exists legal_packet_id uuid references public.document_packets(id) on delete set null,
  add column if not exists legal_packet_version_id uuid references public.document_packet_versions(id) on delete set null,
  add column if not exists generated_artifact_bucket text,
  add column if not exists generated_artifact_media_type text,
  add column if not exists generated_artifact_byte_length bigint,
  add column if not exists generated_artifact_sha256 text;

create unique index if not exists documents_legal_packet_version_d3_uq
  on public.documents (legal_packet_version_id)
  where legal_packet_version_id is not null;

create index if not exists documents_legal_packet_d3_idx
  on public.documents (legal_packet_id, created_at desc)
  where legal_packet_id is not null;

drop policy if exists generated_legal_pdf_packet_access_d3 on storage.objects;
create policy generated_legal_pdf_packet_access_d3
on storage.objects
for select
to authenticated
using (
  exists (
    select 1
    from public.documents d
    where d.legal_packet_id is not null
      and d.generated_artifact_bucket = storage.objects.bucket_id
      and d.file_path = storage.objects.name
      and public.bridge_can_access_legal_packet_h2(d.legal_packet_id)
  )
);

create or replace function public.bridge_persist_transaction_pdf_d3(
  p_packet_id uuid,
  p_generated_version_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_packet public.document_packets%rowtype;
  v_version public.document_packet_versions%rowtype;
  v_document public.documents%rowtype;
  v_artifact jsonb;
  v_actor uuid := auth.uid();
begin
  if auth.role() <> 'service_role' and not public.bridge_can_access_legal_packet_h2(p_packet_id) then
    raise exception 'Packet generation authority is required.' using errcode = '42501';
  end if;

  select * into v_packet from public.document_packets where id = p_packet_id for update;
  if not found then raise exception 'Document packet not found.' using errcode = 'P0002'; end if;

  select * into v_version
  from public.document_packet_versions
  where packet_id = p_packet_id and id = p_generated_version_id
  for update;
  if not found then raise exception 'Generated packet version not found.' using errcode = 'P0002'; end if;
  if v_version.render_status <> 'generated'
     or not coalesce(v_version.render_input_verified, false)
     or not coalesce(v_version.native_pdf_verified, false) then
    raise exception 'D1 and D2 verification must complete before PDF persistence.'
      using errcode = '22000', detail = 'D3_NATIVE_PDF_NOT_VERIFIED';
  end if;
  if v_version.rendered_document_id is null then
    raise exception 'The generated PDF has no canonical document row.'
      using errcode = '22000', detail = 'D3_TRANSACTION_DOCUMENT_MISSING';
  end if;

  v_artifact := coalesce(
    v_version.validation_summary_json->'artifact_provenance',
    v_version.validation_summary_json->'artifactProvenance',
    '{}'::jsonb
  );
  if coalesce(v_artifact->>'bucket', '') = ''
     or coalesce(v_artifact->>'path', '') = ''
     or coalesce(v_artifact->>'mediaType', '') <> 'application/pdf'
     or coalesce(v_artifact->>'sha256', '') !~ '^sha256:[0-9a-f]{64}$'
     or coalesce((v_artifact->>'byteLength')::bigint, 0) < 100
     or coalesce(v_version.rendered_file_path, '') <> coalesce(v_artifact->>'path', '') then
    raise exception 'The generated PDF artifact evidence is incomplete or inconsistent.'
      using errcode = '22000', detail = 'D3_PDF_ARTIFACT_EVIDENCE_INVALID';
  end if;

  select * into v_document from public.documents where id = v_version.rendered_document_id for update;
  if not found then
    raise exception 'The generated PDF document row no longer exists.'
      using errcode = 'P0002', detail = 'D3_TRANSACTION_DOCUMENT_MISSING';
  end if;
  if coalesce(v_document.file_path, '') <> coalesce(v_artifact->>'path', '')
     or (v_packet.transaction_id is not null and v_document.transaction_id is distinct from v_packet.transaction_id) then
    raise exception 'The document row does not belong to this packet transaction or artifact.'
      using errcode = '22000', detail = 'D3_TRANSACTION_DOCUMENT_MISMATCH';
  end if;

  update public.documents
  set
    legal_packet_id = v_packet.id,
    legal_packet_version_id = v_version.id,
    generated_artifact_bucket = v_artifact->>'bucket',
    generated_artifact_media_type = v_artifact->>'mediaType',
    generated_artifact_byte_length = (v_artifact->>'byteLength')::bigint,
    generated_artifact_sha256 = v_artifact->>'sha256',
    visibility_scope = 'shared',
    is_client_visible = true,
    updated_at = now()
  where id = v_document.id
  returning * into v_document;

  update public.document_packet_versions
  set
    rendered_file_bucket = v_artifact->>'bucket',
    rendered_media_type = v_artifact->>'mediaType',
    rendered_byte_length = (v_artifact->>'byteLength')::bigint,
    rendered_sha256 = v_artifact->>'sha256',
    transaction_pdf_persisted = true,
    transaction_pdf_persisted_at = now()
  where id = v_version.id
  returning * into v_version;

  insert into public.document_packet_events (
    packet_id, organisation_id, version_id, event_type, event_payload_json, created_by
  ) values (
    v_packet.id, v_packet.organisation_id, v_version.id, 'transaction_pdf_persisted',
    jsonb_build_object(
      'contract', 'd3-v1',
      'documentId', v_document.id,
      'transactionId', v_document.transaction_id,
      'bucket', v_version.rendered_file_bucket,
      'path', v_version.rendered_file_path,
      'mediaType', v_version.rendered_media_type,
      'byteLength', v_version.rendered_byte_length,
      'sha256', v_version.rendered_sha256,
      'persistedAt', v_version.transaction_pdf_persisted_at
    ), v_actor
  );

  return jsonb_build_object(
    'contract', 'd3-v1',
    'persisted', true,
    'packetId', v_packet.id,
    'versionId', v_version.id,
    'documentId', v_document.id,
    'transactionId', v_document.transaction_id,
    'bucket', v_version.rendered_file_bucket,
    'path', v_version.rendered_file_path,
    'mediaType', v_version.rendered_media_type,
    'byteLength', v_version.rendered_byte_length,
    'sha256', v_version.rendered_sha256,
    'persistedAt', v_version.transaction_pdf_persisted_at
  );
end;
$$;

create or replace function public.bridge_protect_generated_pdf_link_d3()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.legal_packet_version_id is not null and (
    new.legal_packet_id is distinct from old.legal_packet_id
    or new.legal_packet_version_id is distinct from old.legal_packet_version_id
    or new.file_path is distinct from old.file_path
    or (old.transaction_id is not null and new.transaction_id is distinct from old.transaction_id)
    or new.generated_artifact_bucket is distinct from old.generated_artifact_bucket
    or new.generated_artifact_media_type is distinct from old.generated_artifact_media_type
    or new.generated_artifact_byte_length is distinct from old.generated_artifact_byte_length
    or new.generated_artifact_sha256 is distinct from old.generated_artifact_sha256
  ) then
    raise exception 'A persisted generated PDF link is immutable.'
      using errcode = '22000', detail = 'D3_PERSISTED_PDF_LINK_IMMUTABLE';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_generated_pdf_link_d3 on public.documents;
create trigger trg_protect_generated_pdf_link_d3
before update on public.documents
for each row execute function public.bridge_protect_generated_pdf_link_d3();

revoke all on function public.bridge_persist_transaction_pdf_d3(uuid, uuid) from public, anon;
grant execute on function public.bridge_persist_transaction_pdf_d3(uuid, uuid) to authenticated, service_role;

commit;
