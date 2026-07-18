begin;

create or replace function public.bridge_enforce_signer_field_completion_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_signer public.document_packet_signers%rowtype;
  v_packet public.document_packets%rowtype;
  v_version public.document_packet_versions%rowtype;
  v_lock jsonb;
  v_legacy_valid boolean;
  v_controlled_valid boolean;
begin
  if new.status is distinct from 'completed' then return new; end if;
  select * into v_signer from public.document_packet_signers
  where packet_id=new.packet_id and packet_version_id=new.packet_version_id and signer_role=new.signer_role
    and (coalesce(trim(new.signer_email),'')='' or lower(trim(signer_email))=lower(trim(new.signer_email))) limit 1;
  select * into v_packet from public.document_packets where id=new.packet_id;
  select * into v_version from public.document_packet_versions where id=new.packet_version_id and packet_id=new.packet_id;
  v_lock := coalesce(v_version.validation_summary_json->'lock_snapshot','{}'::jsonb);
  v_legacy_valid := coalesce(v_version.validation_summary_json->>'review_state','')='locked'
    and coalesce((v_version.validation_summary_json->>'content_locked')::boolean,false)
    and coalesce(v_lock->>'versionId','')=v_version.id::text and coalesce(v_lock->>'packetId','')=v_packet.id::text;
  v_controlled_valid := coalesce(v_version.transaction_pdf_persisted,false)
    and coalesce(v_version.native_pdf_verified,false)
    and exists (
      select 1 from public.document_signer_sessions session
      join public.document_signing_dispatches dispatch on dispatch.id=session.dispatch_id and dispatch.status='delivered'
      join public.document_signing_field_layouts layout on layout.id=session.layout_id and layout.status='applied' and layout.placement_verified is true
      where session.signer_id=v_signer.id and session.packet_version_id=v_version.id and session.status='active'
    );
  if v_signer.id is null or v_packet.id is null or v_version.id is null
    or v_signer.status not in ('sent','viewed')
    or v_packet.current_version_number is distinct from v_version.version_number
    or not (v_legacy_valid or v_controlled_valid)
    or lower(coalesce(trim(new.completed_by_email),''))<>lower(trim(v_signer.signer_email))
    or (new.field_type in ('signature','initial') and coalesce(trim(new.signature_asset_path),'') not like ('document-signatures/' || v_packet.id::text || '/' || v_signer.id::text || '/%')) then
    raise exception 'F2 signing field completion is outside the controlled signer session.' using errcode='P0001';
  end if;
  return new;
end;
$$;

create or replace function public.bridge_enforce_signer_completion_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining integer;
  v_packet public.document_packets%rowtype;
  v_version public.document_packet_versions%rowtype;
  v_lock jsonb;
  v_legacy_valid boolean;
  v_controlled_valid boolean;
begin
  if new.status is distinct from 'signed' or old.status is not distinct from 'signed' then return new; end if;
  if coalesce(old.status,'') not in ('sent','viewed') then
    raise exception 'F2 signer completion requires an active sent or viewed session.' using errcode='P0001';
  end if;
  select * into v_packet from public.document_packets where id=new.packet_id;
  select * into v_version from public.document_packet_versions where id=new.packet_version_id and packet_id=new.packet_id;
  v_lock := coalesce(v_version.validation_summary_json->'lock_snapshot','{}'::jsonb);
  v_legacy_valid := coalesce(v_version.validation_summary_json->>'review_state','')='locked'
    and coalesce((v_version.validation_summary_json->>'content_locked')::boolean,false)
    and coalesce(v_lock->>'versionId','')=v_version.id::text
    and coalesce(v_lock->>'packetId','')=v_packet.id::text;
  v_controlled_valid := coalesce(v_version.transaction_pdf_persisted,false)
    and coalesce(v_version.native_pdf_verified,false)
    and exists (
      select 1 from public.document_signing_field_layouts layout
      join public.document_signing_dispatches dispatch on dispatch.layout_id=layout.id
        and dispatch.packet_version_id=v_version.id and dispatch.status='delivered'
        and (dispatch.target_signer_role is null or dispatch.target_signer_role=lower(trim(new.signer_role)))
      join public.document_signer_sessions session on session.dispatch_id=dispatch.id
        and session.signer_id=new.id and session.packet_version_id=v_version.id and session.status='active'
      where layout.packet_version_id=v_version.id and layout.status='applied' and layout.placement_verified is true
    );
  if v_packet.id is null or v_version.id is null
    or v_packet.current_version_number is distinct from v_version.version_number
    or v_packet.organisation_id is distinct from new.organisation_id
    or not (v_legacy_valid or v_controlled_valid) then
    raise exception 'F2 signer completion is outside the exact controlled document version.' using errcode='P0001';
  end if;
  select count(*) into v_remaining from public.document_signing_fields field
  where field.packet_id=new.packet_id and field.packet_version_id=new.packet_version_id
    and field.signer_role=new.signer_role
    and (coalesce(trim(field.signer_email),'')='' or lower(trim(field.signer_email))=lower(trim(new.signer_email)))
    and field.required is true
    and (coalesce(field.status,'')<>'completed'
      or (field.field_type in ('signature','initial') and coalesce(trim(field.signature_asset_path),'')='')
      or (field.field_type in ('signature','initial') and field.signature_asset_path not like ('document-signatures/' || new.packet_id::text || '/' || new.id::text || '/%')));
  if v_remaining>0 then
    raise exception 'F2 every required signer field must be completed with this signer''s asset.' using errcode='P0001';
  end if;
  return new;
end;
$$;

create or replace function public.bridge_complete_controlled_signer_session_f2(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_signer public.document_packet_signers%rowtype;
  v_version public.document_packet_versions%rowtype;
  v_session public.document_signer_sessions%rowtype;
  v_fingerprint text;
  v_remaining integer;
begin
  if auth.role()<>'service_role' then raise exception 'Signer completion is available only through the signing service.' using errcode='42501'; end if;
  select * into v_signer from public.document_packet_signers where signing_token=trim(p_token) limit 1;
  if not found or v_signer.status<>'signed' or v_signer.signed_at is null then
    raise exception 'The signer has not completed signing.' using errcode='22000', detail='F2_SIGNER_INCOMPLETE';
  end if;
  select * into v_version from public.document_packet_versions where id=v_signer.packet_version_id and packet_id=v_signer.packet_id;
  v_fingerprint := encode(digest(trim(p_token),'sha256'),'hex');
  select * into v_session from public.document_signer_sessions
  where signer_id=v_signer.id and token_fingerprint=v_fingerprint and packet_version_id=v_signer.packet_version_id
  limit 1 for update;
  if not found then
    if coalesce(v_version.validation_summary_json->>'review_state','')='locked'
      and coalesce((v_version.validation_summary_json->>'content_locked')::boolean,false) then
      return jsonb_build_object('contract','f2-v1','completed',true,'legacy',true,'signerId',v_signer.id,'versionId',v_version.id);
    end if;
    raise exception 'The controlled F1 signer session is missing.' using errcode='22000', detail='F2_F1_SESSION_MISSING';
  end if;
  if v_session.status not in ('active','completed') then
    raise exception 'The controlled signer session is not active.' using errcode='22000', detail='F2_F1_SESSION_INACTIVE';
  end if;
  select count(*) into v_remaining from public.document_signing_fields field
  where field.packet_id=v_signer.packet_id and field.packet_version_id=v_signer.packet_version_id
    and field.signer_role=v_signer.signer_role and field.required is true
    and (coalesce(trim(field.signer_email),'')='' or lower(trim(field.signer_email))=lower(trim(v_signer.signer_email)))
    and (coalesce(field.status,'')<>'completed'
      or (field.field_type in ('signature','initial') and coalesce(trim(field.signature_asset_path),'')=''));
  if v_remaining>0 then raise exception 'Required signing fields remain incomplete.' using errcode='22000', detail='F2_FIELDS_INCOMPLETE'; end if;
  if v_session.status='active' then
    update public.document_signer_sessions set status='completed',completed_at=v_signer.signed_at,last_seen_at=now()
    where id=v_session.id returning * into v_session;
    insert into public.document_packet_events (packet_id,organisation_id,version_id,event_type,event_payload_json,created_by)
    values (v_signer.packet_id,v_signer.organisation_id,v_signer.packet_version_id,'controlled_signer_session_completed',
      jsonb_build_object('contract','f2-v1','sessionId',v_session.id,'dispatchId',v_session.dispatch_id,'layoutId',v_session.layout_id,'signerId',v_signer.id,'signerRole',v_signer.signer_role,'completedAt',v_session.completed_at),null);
  end if;
  return jsonb_build_object('contract','f2-v1','completed',true,'legacy',false,'sessionId',v_session.id,'signerId',v_signer.id,'versionId',v_version.id,'completedAt',v_session.completed_at);
end;
$$;

revoke all on function public.bridge_complete_controlled_signer_session_f2(text) from public,anon,authenticated;
grant execute on function public.bridge_complete_controlled_signer_session_f2(text) to service_role;

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
  v_legacy_valid boolean;
  v_controlled_valid boolean;
begin
  if new.final_signed_file_path is not distinct from old.final_signed_file_path
    and new.final_signed_file_bucket is not distinct from old.final_signed_file_bucket
    and new.finalised_at is not distinct from old.finalised_at then return new; end if;
  if coalesce(old.final_signed_file_path,'')<>'' then raise exception 'F2 final signed artifact evidence is immutable.' using errcode='P0001'; end if;
  select * into v_packet from public.document_packets where id=new.packet_id;
  select * into v_evidence from public.legal_final_artifact_evidence where packet_version_id=new.id;
  v_lock := coalesce(new.validation_summary_json->'lock_snapshot','{}'::jsonb);
  v_legacy_valid := coalesce(new.validation_summary_json->>'review_state','')='locked'
    and coalesce((new.validation_summary_json->>'content_locked')::boolean,false)
    and coalesce(v_lock->>'versionId','')=new.id::text and coalesce(v_lock->>'packetId','')=new.packet_id::text;
  v_controlled_valid := coalesce(new.transaction_pdf_persisted,false) and coalesce(new.native_pdf_verified,false)
    and exists (
      select 1 from public.document_signing_field_layouts layout
      join public.document_signing_dispatches dispatch on dispatch.layout_id=layout.id and dispatch.status='delivered'
      where layout.packet_version_id=new.id and layout.status='applied' and layout.placement_verified is true
    )
    and not exists (
      select 1 from public.document_packet_signers signer
      where signer.packet_version_id=new.id and not exists (
        select 1 from public.document_signer_sessions session
        where session.signer_id=signer.id and session.packet_version_id=new.id and session.status='completed'
      )
    );
  if v_packet.id is null or v_packet.organisation_id is distinct from new.organisation_id
    or v_packet.current_version_number is distinct from new.version_number or new.render_status<>'generated'
    or not (v_legacy_valid or v_controlled_valid) then
    raise exception 'F2 finalisation requires the exact legacy lock or completed controlled signing chain.' using errcode='P0001';
  end if;
  select count(*) into v_incomplete from public.document_packet_signers signer
  where signer.packet_id=new.packet_id and signer.packet_version_id=new.id and (signer.status<>'signed' or signer.signed_at is null);
  if v_incomplete>0 or not exists (select 1 from public.document_packet_signers where packet_id=new.packet_id and packet_version_id=new.id) then
    raise exception 'F2 every configured signer must be complete.' using errcode='P0001';
  end if;
  select count(*) into v_incomplete from public.document_signing_fields field
  where field.packet_id=new.packet_id and field.packet_version_id=new.id and field.required is true
    and (coalesce(field.status,'')<>'completed'
      or (field.field_type in ('signature','initial') and coalesce(field.signature_asset_path,'')='')
      or (field.field_type in ('signature','initial') and not exists (
        select 1 from public.document_packet_signers signer where signer.packet_id=field.packet_id
          and signer.packet_version_id=field.packet_version_id and signer.signer_role=field.signer_role
          and (coalesce(trim(field.signer_email),'')='' or lower(trim(signer.signer_email))=lower(trim(field.signer_email)))
          and field.signature_asset_path like ('document-signatures/' || field.packet_id::text || '/' || signer.id::text || '/%')
      )));
  if v_incomplete>0 or not exists (
      select 1 from public.document_signing_fields where packet_id=new.packet_id and packet_version_id=new.id and required is true and field_type='signature'
    ) or v_evidence.id is null or v_evidence.organisation_id is distinct from new.organisation_id
    or v_evidence.packet_id is distinct from new.packet_id or v_evidence.path is distinct from new.final_signed_file_path
    or v_evidence.bucket is distinct from new.final_signed_file_bucket or v_evidence.file_name is distinct from new.final_signed_file_name
    or v_evidence.generated_at is distinct from new.finalised_at then
    raise exception 'F2 final artifact evidence is missing, incomplete or mismatched.' using errcode='P0001';
  end if;
  return new;
end;
$$;

comment on function public.bridge_complete_controlled_signer_session_f2(text) is
  'F2 closes the F1 session only after its signer and every required field are complete on the exact certified version.';

commit;
