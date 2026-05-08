begin;

alter table public.document_signing_fields
  add column if not exists signature_asset_path text,
  add column if not exists signature_asset_url text,
  add column if not exists signature_type text,
  add column if not exists field_value_text text;

alter table public.document_signing_fields
  drop constraint if exists document_signing_fields_signature_type_check;
alter table public.document_signing_fields
  add constraint document_signing_fields_signature_type_check
  check (
    signature_type is null
    or signature_type in ('initial', 'signature', 'date', 'text')
  );

create index if not exists document_signing_fields_signature_asset_idx
  on public.document_signing_fields (packet_version_id, signer_role, field_type, status);

commit;
