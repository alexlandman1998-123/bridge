begin;

create or replace function public.bridge_get_public_signer_surface_contract_h4(p_packet_version_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_packet public.document_packets%rowtype;
  v_version public.document_packet_versions%rowtype;
  v_signer_count integer:=0;
  v_issued_token_count integer:=0;
  v_signers_without_fields integer:=0;
  v_signers_without_signature integer:=0;
  v_unscoped_ambiguous_fields integer:=0;
  v_invalid_token_count integer:=0;
  v_delivered_dispatch_count integer:=0;
begin
  if auth.role()<>'service_role' then raise exception 'Public signer diagnostics require the service role.' using errcode='42501'; end if;
  select * into v_version from public.document_packet_versions where id=p_packet_version_id;
  select * into v_packet from public.document_packets where id=v_version.packet_id;
  if v_version.id is null or v_packet.id is null then raise exception 'Signer surface target was not found.' using errcode='P0002'; end if;
  select count(*),count(*) filter(where signing_token is not null),count(*) filter(where signing_token is not null and signing_token!~'^[0-9a-f]{64}$')
    into v_signer_count,v_issued_token_count,v_invalid_token_count from public.document_packet_signers where packet_version_id=v_version.id;
  select count(*) into v_signers_without_fields from public.document_packet_signers signer
    where signer.packet_version_id=v_version.id and not exists(
      select 1 from public.document_signing_fields field where field.packet_version_id=v_version.id
        and lower(trim(field.signer_role))=lower(trim(signer.signer_role))
        and (coalesce(trim(field.signer_email),'')='' or lower(trim(field.signer_email))=lower(trim(signer.signer_email)))
    );
  select count(*) into v_signers_without_signature from public.document_packet_signers signer
    where signer.packet_version_id=v_version.id and not exists(
      select 1 from public.document_signing_fields field where field.packet_version_id=v_version.id
        and lower(trim(field.signer_role))=lower(trim(signer.signer_role)) and field.field_type='signature' and field.required
        and (coalesce(trim(field.signer_email),'')='' or lower(trim(field.signer_email))=lower(trim(signer.signer_email)))
    );
  select count(*) into v_unscoped_ambiguous_fields from public.document_signing_fields field
    where field.packet_version_id=v_version.id and coalesce(trim(field.signer_email),'')=''
      and (select count(*) from public.document_packet_signers signer where signer.packet_version_id=v_version.id
        and lower(trim(signer.signer_role))=lower(trim(field.signer_role)))>1;
  select count(*) into v_delivered_dispatch_count from public.document_signing_dispatches
    where packet_version_id=v_version.id and status='delivered';
  return jsonb_build_object(
    'contract','h4-generator-v1','packetType',lower(v_packet.packet_type),'currentVersion',v_packet.current_version_number=v_version.version_number,
    'certifiedPdfBound',coalesce(v_version.native_pdf_verified,false) and coalesce(v_version.transaction_pdf_persisted,false)
      and coalesce(trim(v_version.rendered_file_path),'')<>'',
    'signerCount',v_signer_count,'issuedTokenCount',v_issued_token_count,'invalidTokenCount',v_invalid_token_count,'signersWithoutFields',v_signers_without_fields,
    'signersWithoutRequiredSignature',v_signers_without_signature,'ambiguousUnscopedFieldCount',v_unscoped_ambiguous_fields,
    'deliveredDispatchCount',v_delivered_dispatch_count,
    'publicResponseKeys',jsonb_build_array('signer','packet','version','previewVersion','previewData','fields','fieldSummary','documentPreviewUrl','sessionBinding'),
    'internalIdentifiersExcluded',true,'mutatedData',false,'checkedAt',now()
  );
end;
$$;

revoke all on function public.bridge_get_public_signer_surface_contract_h4(uuid) from public,anon,authenticated;
grant execute on function public.bridge_get_public_signer_surface_contract_h4(uuid) to service_role;

commit;
