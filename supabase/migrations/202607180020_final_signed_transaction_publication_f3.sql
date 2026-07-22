begin;

alter table public.documents
  add column if not exists final_legal_packet_id uuid references public.document_packets(id) on delete set null,
  add column if not exists final_legal_packet_version_id uuid references public.document_packet_versions(id) on delete set null,
  add column if not exists final_artifact_bucket text,
  add column if not exists final_artifact_media_type text,
  add column if not exists final_artifact_byte_length bigint,
  add column if not exists final_artifact_sha256 text;

create unique index if not exists documents_final_legal_packet_version_f3_uq
  on public.documents(final_legal_packet_version_id) where final_legal_packet_version_id is not null;

create table if not exists public.legal_final_transaction_publications (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  transaction_id uuid not null,
  packet_id uuid not null references public.document_packets(id) on delete cascade,
  packet_version_id uuid not null references public.document_packet_versions(id) on delete cascade unique,
  document_id uuid not null references public.documents(id) on delete restrict unique,
  artifact_sha256 text not null check (artifact_sha256 ~ '^[0-9a-f]{64}$'),
  artifact_bucket text not null,
  artifact_path text not null,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.legal_final_transaction_publications enable row level security;
revoke all on table public.legal_final_transaction_publications from public,anon;
grant select on table public.legal_final_transaction_publications to authenticated;
drop policy if exists final_transaction_publication_access_f3 on public.legal_final_transaction_publications;
create policy final_transaction_publication_access_f3 on public.legal_final_transaction_publications
for select to authenticated using (public.bridge_can_access_legal_packet_h2(packet_id));

drop policy if exists final_signed_legal_pdf_access_f3 on storage.objects;
create policy final_signed_legal_pdf_access_f3 on storage.objects for select to authenticated using (
  exists (
    select 1 from public.documents document
    where document.final_legal_packet_id is not null
      and document.final_artifact_bucket=storage.objects.bucket_id
      and document.file_path=storage.objects.name
      and public.bridge_can_access_legal_packet_h2(document.final_legal_packet_id)
  )
);

create or replace function public.bridge_publish_final_artifact_to_transaction_f3(p_packet_version_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_packet public.document_packets%rowtype;
  v_version public.document_packet_versions%rowtype;
  v_evidence public.legal_final_artifact_evidence%rowtype;
  v_document public.documents%rowtype;
  v_publication public.legal_final_transaction_publications%rowtype;
  v_type text;
  v_category text;
  v_now timestamptz:=now();
begin
  if auth.role()<>'service_role' then raise exception 'Final transaction publication requires the signing service.' using errcode='42501'; end if;
  select * into v_version from public.document_packet_versions where id=p_packet_version_id;
  if not found then raise exception 'Final packet version was not found.' using errcode='P0002'; end if;
  select * into v_packet from public.document_packets where id=v_version.packet_id;
  select * into v_evidence from public.legal_final_artifact_evidence where packet_version_id=v_version.id;
  if v_packet.id is null or v_packet.transaction_id is null then
    raise exception 'The signed document cannot be published until the packet has a transaction.' using errcode='22000', detail='F3_TRANSACTION_REQUIRED';
  end if;
  if v_packet.status<>'completed' or v_packet.current_version_number is distinct from v_version.version_number
    or v_evidence.id is null or v_evidence.path is distinct from v_version.final_signed_file_path
    or v_evidence.bucket is distinct from v_version.final_signed_file_bucket then
    raise exception 'The exact F2 final artifact is required for transaction publication.' using errcode='22000', detail='F3_F2_ARTIFACT_INVALID';
  end if;

  select * into v_publication from public.legal_final_transaction_publications where packet_version_id=v_version.id;
  if found then
    if v_publication.transaction_id is distinct from v_packet.transaction_id
      or v_publication.artifact_sha256 is distinct from v_evidence.sha256
      or v_publication.artifact_path is distinct from v_evidence.path then
      raise exception 'The final transaction publication is immutable.' using errcode='22000', detail='F3_TRANSACTION_PUBLICATION_IMMUTABLE';
    end if;
    return jsonb_build_object('contract','f3-v1','published',true,'reused',true,'publicationId',v_publication.id,
      'transactionId',v_publication.transaction_id,'documentId',v_publication.document_id,'packetId',v_packet.id,
      'versionId',v_version.id,'bucket',v_publication.artifact_bucket,'path',v_publication.artifact_path,'sha256',v_publication.artifact_sha256);
  end if;

  v_type := case when lower(v_packet.packet_type)='otp' then 'signed_otp' else 'signed_mandate' end;
  v_category := case when lower(v_packet.packet_type)='otp' then 'sales_documents' else 'mandate_documents' end;
  if v_version.final_signed_document_id is not null then
    select * into v_document from public.documents where id=v_version.final_signed_document_id for update;
  end if;
  if v_document.id is null then
    insert into public.documents (
      transaction_id,name,file_path,file_bucket,category,document_type,status,visibility_scope,is_client_visible,
      uploaded_by_role,stage_key,created_at,updated_at
    ) values (
      v_packet.transaction_id,v_evidence.file_name,v_evidence.path,v_evidence.bucket,v_category,v_type,'approved','shared',true,
      'system','final_signed',v_now,v_now
    ) returning * into v_document;
  else
    update public.documents set
      transaction_id=v_packet.transaction_id,name=v_evidence.file_name,file_path=v_evidence.path,file_bucket=v_evidence.bucket,
      category=v_category,document_type=v_type,status='approved',visibility_scope='shared',is_client_visible=true,
      stage_key='final_signed',updated_at=v_now
    where id=v_document.id returning * into v_document;
  end if;

  update public.documents set
    final_legal_packet_id=v_packet.id,final_legal_packet_version_id=v_version.id,
    final_artifact_bucket=v_evidence.bucket,final_artifact_media_type=v_evidence.media_type,
    final_artifact_byte_length=v_evidence.byte_length,final_artifact_sha256=v_evidence.sha256,updated_at=v_now
  where id=v_document.id returning * into v_document;

  update public.document_packet_versions set final_signed_document_id=v_document.id where id=v_version.id;
  insert into public.legal_final_transaction_publications (
    organisation_id,transaction_id,packet_id,packet_version_id,document_id,
    artifact_sha256,artifact_bucket,artifact_path,published_at
  ) values (
    v_packet.organisation_id,v_packet.transaction_id,v_packet.id,v_version.id,v_document.id,
    v_evidence.sha256,v_evidence.bucket,v_evidence.path,v_now
  ) returning * into v_publication;
  insert into public.document_packet_events (packet_id,organisation_id,version_id,event_type,event_payload_json,created_by)
  values (v_packet.id,v_packet.organisation_id,v_version.id,'final_signed_transaction_published',
    jsonb_build_object('contract','f3-v1','publicationId',v_publication.id,'transactionId',v_packet.transaction_id,
      'documentId',v_document.id,'artifactSha256',v_evidence.sha256,'artifactPath',v_evidence.path,'publishedAt',v_now),null);
  return jsonb_build_object('contract','f3-v1','published',true,'reused',false,'publicationId',v_publication.id,
    'transactionId',v_packet.transaction_id,'documentId',v_document.id,'packetId',v_packet.id,'versionId',v_version.id,
    'bucket',v_evidence.bucket,'path',v_evidence.path,'sha256',v_evidence.sha256,'publishedAt',v_now);
end;
$$;

revoke all on function public.bridge_publish_final_artifact_to_transaction_f3(uuid) from public,anon,authenticated;
grant execute on function public.bridge_publish_final_artifact_to_transaction_f3(uuid) to service_role;

create or replace function public.bridge_protect_final_transaction_publication_f3()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  raise exception 'F3 transaction publication evidence is immutable.' using errcode='P0001';
end;
$$;
drop trigger if exists trg_protect_final_transaction_publication_f3 on public.legal_final_transaction_publications;
create trigger trg_protect_final_transaction_publication_f3 before update or delete on public.legal_final_transaction_publications
for each row execute function public.bridge_protect_final_transaction_publication_f3();

commit;
