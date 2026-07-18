begin;

create table if not exists public.legal_final_completion_receipts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  transaction_id uuid not null,
  packet_id uuid not null references public.document_packets(id) on delete cascade,
  packet_version_id uuid not null references public.document_packet_versions(id) on delete cascade unique,
  document_id uuid not null references public.documents(id) on delete restrict,
  publication_id uuid not null references public.legal_final_transaction_publications(id) on delete restrict,
  canonical_document_key text not null check (canonical_document_key in ('signed_mandate','signed_otp')),
  canonical_requirement_instance_id uuid references public.document_requirement_instances(id) on delete set null,
  artifact_sha256 text not null check (artifact_sha256 ~ '^[0-9a-f]{64}$'),
  transaction_visible boolean not null,
  client_visible boolean not null,
  canonical_satisfied boolean not null,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.legal_final_completion_receipts enable row level security;
revoke all on table public.legal_final_completion_receipts from public,anon;
grant select on table public.legal_final_completion_receipts to authenticated;
drop policy if exists final_completion_receipt_access_f4 on public.legal_final_completion_receipts;
create policy final_completion_receipt_access_f4 on public.legal_final_completion_receipts
for select to authenticated using (public.bridge_can_access_legal_packet_h2(packet_id));

create or replace function public.bridge_complete_final_document_surfaces_f4(p_packet_version_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_packet public.document_packets%rowtype;
  v_version public.document_packet_versions%rowtype;
  v_publication public.legal_final_transaction_publications%rowtype;
  v_document public.documents%rowtype;
  v_requirement public.document_requirement_instances%rowtype;
  v_receipt public.legal_final_completion_receipts%rowtype;
  v_key text;
  v_now timestamptz:=now();
  v_legacy_keys text[];
begin
  if auth.role()<>'service_role' then raise exception 'Final completion sync requires the signing service.' using errcode='42501'; end if;
  select * into v_version from public.document_packet_versions where id=p_packet_version_id;
  select * into v_packet from public.document_packets where id=v_version.packet_id;
  select * into v_publication from public.legal_final_transaction_publications where packet_version_id=v_version.id;
  if v_packet.id is null or v_version.id is null or v_publication.id is null then
    raise exception 'F3 transaction publication is required before F4 completion.' using errcode='22000', detail='F4_F3_PUBLICATION_REQUIRED';
  end if;
  select * into v_document from public.documents where id=v_publication.document_id and transaction_id=v_packet.transaction_id;
  if not found or v_document.file_path is distinct from v_publication.artifact_path
    or v_document.final_artifact_sha256 is distinct from v_publication.artifact_sha256
    or coalesce(v_document.visibility_scope,'')<>'shared' or not coalesce(v_document.is_client_visible,false) then
    raise exception 'The final transaction document is not available across required surfaces.' using errcode='22000', detail='F4_SHARED_DOCUMENT_INVALID';
  end if;

  v_key := case when lower(v_packet.packet_type)='otp' then 'signed_otp' else 'signed_mandate' end;
  v_legacy_keys := case when v_key='signed_otp'
    then array['signed_otp','otp_signed','signed_offer_to_purchase','otp','sale_agreement_or_otp']
    else array['signed_mandate','mandate_signature','mandate_to_sell'] end;

  if v_packet.canonical_requirement_instance_id is not null then
    select * into v_requirement from public.document_requirement_instances where id=v_packet.canonical_requirement_instance_id;
  end if;
  if v_requirement.id is null and v_version.canonical_requirement_instance_id is not null then
    select * into v_requirement from public.document_requirement_instances where id=v_version.canonical_requirement_instance_id;
  end if;
  if v_requirement.id is null then
    select instance.* into v_requirement
    from public.transaction_required_documents legacy
    join public.document_requirement_instances instance on instance.id=legacy.canonical_requirement_instance_id
    where legacy.transaction_id=v_packet.transaction_id and lower(legacy.document_key)=any(v_legacy_keys)
    order by legacy.created_at desc limit 1;
  end if;
  if v_requirement.id is null then
    select * into v_requirement from public.document_requirement_instances
    where transaction_id=v_packet.transaction_id and document_definition_key=v_key
    order by created_at desc limit 1;
  end if;

  if v_requirement.id is not null then
    update public.document_requirement_instances set
      status='completed',satisfied_by_document_id=v_document.id,satisfied_by_packet_id=v_packet.id,
      satisfied_by_packet_version_id=v_version.id,updated_at=v_now
    where id=v_requirement.id;
    update public.documents set canonical_requirement_instance_id=v_requirement.id,updated_at=v_now where id=v_document.id;
    update public.document_packets set canonical_requirement_instance_id=v_requirement.id where id=v_packet.id and canonical_requirement_instance_id is null;
    update public.document_packet_versions set canonical_requirement_instance_id=v_requirement.id where id=v_version.id and canonical_requirement_instance_id is null;
    insert into public.document_requirement_events (requirement_instance_id,event_type,actor_role,actor_user_id,message,metadata_json,created_at)
    select v_requirement.id,'completed','system',null,'Digitally signed document completed and published.',
      jsonb_build_object('contract','f4-v1','packetId',v_packet.id,'versionId',v_version.id,'documentId',v_document.id,'artifactSha256',v_publication.artifact_sha256),v_now
    where not exists (
      select 1 from public.document_requirement_events where requirement_instance_id=v_requirement.id and event_type='completed'
        and metadata_json->>'versionId'=v_version.id::text
    );
  end if;

  update public.transaction_required_documents set
    is_uploaded=true,status='completed',uploaded_document_id=v_document.id,uploaded_at=coalesce(uploaded_at,v_now),
    canonical_requirement_instance_id=coalesce(canonical_requirement_instance_id,v_requirement.id),updated_at=v_now
  where transaction_id=v_packet.transaction_id and lower(document_key)=any(v_legacy_keys);

  insert into public.legal_final_completion_receipts (
    organisation_id,transaction_id,packet_id,packet_version_id,document_id,publication_id,
    canonical_document_key,canonical_requirement_instance_id,artifact_sha256,
    transaction_visible,client_visible,canonical_satisfied,completed_at
  ) values (
    v_packet.organisation_id,v_packet.transaction_id,v_packet.id,v_version.id,v_document.id,v_publication.id,
    v_key,v_requirement.id,v_publication.artifact_sha256,true,true,true,v_now
  )
  on conflict (packet_version_id) do nothing;
  select * into v_receipt from public.legal_final_completion_receipts where packet_version_id=v_version.id;

  if v_receipt.document_id is distinct from v_document.id or v_receipt.artifact_sha256 is distinct from v_publication.artifact_sha256 then
    raise exception 'The F4 completion receipt is immutable.' using errcode='22000', detail='F4_COMPLETION_RECEIPT_MISMATCH';
  end if;
  insert into public.document_packet_events (packet_id,organisation_id,version_id,event_type,event_payload_json,created_by)
  select v_packet.id,v_packet.organisation_id,v_version.id,'final_document_surfaces_completed',
    jsonb_build_object('contract','f4-v1','receiptId',v_receipt.id,'transactionId',v_packet.transaction_id,'documentId',v_document.id,
      'canonicalDocumentKey',v_key,'canonicalRequirementInstanceId',v_requirement.id,'artifactSha256',v_publication.artifact_sha256,'completedAt',v_receipt.completed_at),null
  where not exists (
    select 1 from public.document_packet_events where packet_id=v_packet.id and version_id=v_version.id and event_type='final_document_surfaces_completed'
  );
  return jsonb_build_object('contract','f4-v1','completed',true,'receiptId',v_receipt.id,'transactionId',v_packet.transaction_id,
    'documentId',v_document.id,'canonicalDocumentKey',v_key,'canonicalRequirementInstanceId',v_requirement.id,
    'transactionVisible',true,'clientVisible',true,'canonicalSatisfied',true,'artifactSha256',v_publication.artifact_sha256,'completedAt',v_receipt.completed_at);
end;
$$;

revoke all on function public.bridge_complete_final_document_surfaces_f4(uuid) from public,anon,authenticated;
grant execute on function public.bridge_complete_final_document_surfaces_f4(uuid) to service_role;

create or replace function public.bridge_protect_final_completion_receipt_f4()
returns trigger language plpgsql security definer set search_path=public as $$
begin raise exception 'F4 final completion receipts are immutable.' using errcode='P0001'; end;
$$;
drop trigger if exists trg_protect_final_completion_receipt_f4 on public.legal_final_completion_receipts;
create trigger trg_protect_final_completion_receipt_f4 before update or delete on public.legal_final_completion_receipts
for each row execute function public.bridge_protect_final_completion_receipt_f4();

commit;
