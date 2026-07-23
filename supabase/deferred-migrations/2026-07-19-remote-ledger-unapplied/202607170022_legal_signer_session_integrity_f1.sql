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
begin
  if new.status is distinct from 'completed' then return new; end if;
  select * into v_signer from public.document_packet_signers
  where packet_id = new.packet_id
    and packet_version_id = new.packet_version_id
    and signer_role = new.signer_role
    and (coalesce(trim(new.signer_email), '') = '' or lower(trim(signer_email)) = lower(trim(new.signer_email)))
  limit 1;
  select * into v_packet from public.document_packets where id = new.packet_id;
  select * into v_version from public.document_packet_versions where id = new.packet_version_id and packet_id = new.packet_id;
  v_lock := coalesce(v_version.validation_summary_json->'lock_snapshot', '{}'::jsonb);
  if v_signer.id is null
    or v_packet.id is null
    or v_version.id is null
    or v_signer.status not in ('sent', 'viewed')
    or v_signer.signing_token is null
    or v_signer.token_expires_at is null
    or v_signer.token_expires_at <= now()
    or v_packet.organisation_id is distinct from new.organisation_id
    or v_packet.current_version_number is distinct from v_version.version_number
    or coalesce(v_version.validation_summary_json->>'review_state', '') <> 'locked'
    or coalesce((v_version.validation_summary_json->>'content_locked')::boolean, false) is not true
    or coalesce(v_lock->>'versionId', '') <> v_version.id::text
    or coalesce(v_lock->>'packetId', '') <> v_packet.id::text
    or lower(coalesce(trim(new.completed_by_email), '')) <> lower(trim(v_signer.signer_email))
    or (new.field_type in ('signature', 'initial') and coalesce(trim(new.signature_asset_path), '') not like ('document-signatures/' || v_packet.id::text || '/' || v_signer.id::text || '/%')) then
    raise exception 'F1 signing field completion is outside the active signer session scope.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_signer_field_completion_scope on public.document_signing_fields;
create trigger trg_signer_field_completion_scope
before update of status, completed_by_email, signature_asset_path on public.document_signing_fields
for each row execute function public.bridge_enforce_signer_field_completion_scope();

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
begin
  if new.status is distinct from 'signed' or old.status is not distinct from 'signed' then return new; end if;
  if coalesce(old.status, '') not in ('sent', 'viewed') then
    raise exception 'F1 signer completion requires an active sent or viewed session.' using errcode = 'P0001';
  end if;
  select * into v_packet from public.document_packets where id = new.packet_id;
  select * into v_version from public.document_packet_versions where id = new.packet_version_id and packet_id = new.packet_id;
  v_lock := coalesce(v_version.validation_summary_json->'lock_snapshot', '{}'::jsonb);
  if new.signing_token is null or new.token_expires_at is null or new.token_expires_at <= now() then
    raise exception 'F1 active signer token is required to complete signing.' using errcode = 'P0001';
  end if;
  if v_packet.id is null
    or v_version.id is null
    or v_packet.organisation_id is distinct from new.organisation_id
    or v_packet.current_version_number is distinct from v_version.version_number
    or coalesce(v_version.validation_summary_json->>'review_state', '') <> 'locked'
    or coalesce((v_version.validation_summary_json->>'content_locked')::boolean, false) is not true
    or coalesce(v_lock->>'versionId', '') <> v_version.id::text
    or coalesce(v_lock->>'packetId', '') <> v_packet.id::text then
    raise exception 'F1 signer completion is outside the exact locked packet version.' using errcode = 'P0001';
  end if;
  select count(*) into v_remaining
  from public.document_signing_fields field
  where field.packet_id = new.packet_id
    and field.packet_version_id = new.packet_version_id
    and field.signer_role = new.signer_role
    and (coalesce(trim(field.signer_email), '') = '' or lower(trim(field.signer_email)) = lower(trim(new.signer_email)))
    and field.required is true
    and (
      coalesce(field.status, '') <> 'completed'
      or (field.field_type = 'signature' and coalesce(trim(field.signature_asset_path), '') = '')
    );
  if v_remaining > 0 then
    raise exception 'F1 every required signer field must be completed before signer completion.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_signer_completion_scope on public.document_packet_signers;
create trigger trg_signer_completion_scope
before update of status, signed_at on public.document_packet_signers
for each row execute function public.bridge_enforce_signer_completion_scope();

comment on function public.bridge_enforce_signer_field_completion_scope() is
  'F1 prevents field completion outside the exact active signer, packet, locked version and signature-asset namespace.';
comment on function public.bridge_enforce_signer_completion_scope() is
  'F1 prevents signer completion while any required signer field remains incomplete.';

commit;
