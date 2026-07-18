begin;

-- A2 removes the former human approval and immutable-lock prerequisites from
-- token issuance. E3 remains the database backstop for exact-version signer
-- identities and signing-field placement.
drop trigger if exists trg_legal_draft_review_before_token on public.document_packet_signers;
drop trigger if exists trg_legal_draft_lock_before_token on public.document_packet_signers;

comment on function public.bridge_enforce_legal_draft_review_before_token() is
  'Legacy E1 approval verifier retained for audit compatibility; it is not a runtime signing prerequisite after A2.';
comment on function public.bridge_enforce_legal_draft_lock_before_token() is
  'Legacy E2 lock verifier retained for audit compatibility; it is not a runtime signing prerequisite after A2.';

create or replace function public.bridge_enforce_current_generated_version_before_token_a2()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_packet public.document_packets%rowtype;
  v_version public.document_packet_versions%rowtype;
begin
  if new.signing_token is null
    or (tg_op = 'UPDATE' and new.signing_token is not distinct from old.signing_token) then
    return new;
  end if;

  select * into v_packet from public.document_packets where id = new.packet_id;
  select * into v_version
  from public.document_packet_versions
  where id = new.packet_version_id and packet_id = new.packet_id;

  if v_packet.id is null
    or v_version.id is null
    or v_packet.organisation_id is distinct from new.organisation_id
    or v_version.organisation_id is distinct from new.organisation_id
    or v_packet.current_version_number is distinct from v_version.version_number
    or v_version.render_status <> 'generated'
    or v_packet.status not in ('signing_prep', 'sent', 'partially_signed', 'completed') then
    raise exception 'A2 signing requires the exact current generated version in a ready-to-send lifecycle.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_current_generated_version_before_token_a2 on public.document_packet_signers;
create trigger trg_current_generated_version_before_token_a2
before insert or update of signing_token on public.document_packet_signers
for each row execute function public.bridge_enforce_current_generated_version_before_token_a2();

comment on function public.bridge_enforce_current_generated_version_before_token_a2() is
  'A2 replaces approval/lock gates with an exact current generated-version and lifecycle check before token issuance.';

create or replace function public.bridge_enforce_final_artifact_evidence_f2()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_packet public.document_packets%rowtype;
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
  select * into v_evidence from public.legal_final_artifact_evidence where packet_version_id = new.id;

  if v_packet.id is null
    or v_packet.organisation_id is distinct from new.organisation_id
    or v_packet.current_version_number is distinct from new.version_number
    or new.render_status <> 'generated'
    or v_packet.status not in ('sent', 'partially_signed', 'completed') then
    raise exception 'F2 finalisation requires the exact current generated version in an active signing lifecycle.' using errcode = 'P0001';
  end if;

  select count(*) into v_incomplete from public.document_packet_signers signer
  where signer.packet_id = new.packet_id and signer.packet_version_id = new.id
    and (signer.status <> 'signed' or signer.signed_at is null);
  if v_incomplete > 0 or not exists (
    select 1 from public.document_packet_signers signer
    where signer.packet_id = new.packet_id and signer.packet_version_id = new.id
  ) then
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

comment on function public.bridge_enforce_final_artifact_evidence_f2() is
  'A2/F2 requires an exact current generated version, completed signers and fields, and immutable final-artifact evidence without human approval or draft-lock snapshots.';

commit;
