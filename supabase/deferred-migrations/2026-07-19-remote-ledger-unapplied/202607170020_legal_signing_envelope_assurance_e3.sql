begin;

create or replace function public.bridge_enforce_signing_envelope_before_token()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_packet public.document_packets%rowtype;
  v_version public.document_packet_versions%rowtype;
  v_signer_count integer;
  v_signer_role_count integer;
  v_signing_order_count integer;
  v_invalid_signer_count integer;
  v_field_count integer;
  v_invalid_field_count integer;
  v_missing_signature_count integer;
  v_duplicate_field_count integer;
  v_missing_base_role_count integer;
begin
  if tg_op = 'INSERT' and new.signing_token is not null then
    raise exception 'E3 signer must be prepared and validated before token issuance.' using errcode = 'P0001';
  end if;
  if new.signing_token is null or (tg_op = 'UPDATE' and new.signing_token is not distinct from old.signing_token) then return new; end if;
  select * into v_packet from public.document_packets where id = new.packet_id;
  select * into v_version from public.document_packet_versions where id = new.packet_version_id and packet_id = new.packet_id;
  if v_packet.id is null or v_version.id is null then raise exception 'E3 signing envelope packet/version is missing.' using errcode = 'P0001'; end if;

  select count(*), count(distinct signer_role), count(distinct signing_order), count(*) filter (where
    packet_id is distinct from v_packet.id
    or packet_version_id is distinct from v_version.id
    or organisation_id is distinct from v_packet.organisation_id
    or coalesce(trim(signer_role), '') = ''
    or coalesce(trim(signer_name), '') = ''
    or lower(coalesce(trim(signer_email), '')) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or lower(coalesce(trim(signer_email), '')) like '%@bridge.local'
    or signing_order is null or signing_order < 1
  )
  into v_signer_count, v_signer_role_count, v_signing_order_count, v_invalid_signer_count
  from public.document_packet_signers
  where packet_id = v_packet.id and packet_version_id = v_version.id;

  select count(*), count(*) filter (where
    field.packet_id is distinct from v_packet.id
    or field.packet_version_id is distinct from v_version.id
    or field.organisation_id is distinct from v_packet.organisation_id
    or signer.id is null
    or coalesce(field.field_type, '') not in ('initial', 'signature', 'date', 'text')
    or field.page_number is null or field.page_number < 1
    or field.x_position is null or field.x_position < 0
    or field.y_position is null or field.y_position < 0
    or field.width is null or field.width <= 0
    or field.height is null or field.height <= 0
    or (coalesce(trim(field.signer_email), '') <> '' and lower(trim(field.signer_email)) <> lower(trim(signer.signer_email)))
  )
  into v_field_count, v_invalid_field_count
  from public.document_signing_fields field
  left join public.document_packet_signers signer
    on signer.packet_id = field.packet_id
   and signer.packet_version_id = field.packet_version_id
   and signer.signer_role = field.signer_role
  where field.packet_id = v_packet.id and field.packet_version_id = v_version.id;

  select count(*) into v_missing_signature_count
  from public.document_packet_signers signer
  where signer.packet_id = v_packet.id and signer.packet_version_id = v_version.id
    and not exists (
      select 1 from public.document_signing_fields field
      where field.packet_id = signer.packet_id
        and field.packet_version_id = signer.packet_version_id
        and field.signer_role = signer.signer_role
        and field.field_type = 'signature'
        and field.required is true
    );

  select count(*) into v_duplicate_field_count from (
    select signer_role, field_type, page_number, x_position, y_position, width, height
    from public.document_signing_fields
    where packet_id = v_packet.id and packet_version_id = v_version.id
    group by signer_role, field_type, page_number, x_position, y_position, width, height
    having count(*) > 1
  ) duplicate_fields;

  select count(*) into v_missing_base_role_count
  from unnest(case
    when v_packet.packet_type = 'otp' then array['purchaser_1', 'seller']::text[]
    when v_packet.packet_type = 'mandate' then array['agent', 'seller']::text[]
    else array[]::text[]
  end) as required_roles(required_role)
  where not exists (
    select 1 from public.document_packet_signers signer
    where signer.packet_id = v_packet.id
      and signer.packet_version_id = v_version.id
      and signer.signer_role = required_role
  );

  if v_signer_count = 0
    or v_field_count = 0
    or v_signer_count <> v_signer_role_count
    or v_signer_count <> v_signing_order_count
    or v_invalid_signer_count > 0
    or v_invalid_field_count > 0
    or v_missing_signature_count > 0
    or v_duplicate_field_count > 0
    or v_missing_base_role_count > 0 then
    raise exception 'E3 complete version-bound signer envelope is required before token issuance.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_legal_signing_envelope_before_token on public.document_packet_signers;
create trigger trg_legal_signing_envelope_before_token
before insert or update of signing_token on public.document_packet_signers
for each row execute function public.bridge_enforce_signing_envelope_before_token();

create or replace function public.bridge_freeze_dispatched_signer_envelope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_packet_id uuid := case when tg_op = 'DELETE' then old.packet_id else new.packet_id end;
  v_version_id uuid := case when tg_op = 'DELETE' then old.packet_version_id else new.packet_version_id end;
  v_dispatched boolean;
begin
  select exists (
    select 1 from public.document_packet_signers
    where packet_id = v_packet_id and packet_version_id = v_version_id
      and (signing_token is not null or token_used_at is not null or viewed_at is not null or signed_at is not null or status in ('sent', 'viewed', 'signed', 'declined', 'expired'))
  ) into v_dispatched;
  if not v_dispatched then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op in ('INSERT', 'DELETE') then
    raise exception 'E3 dispatched signer envelope cannot add or remove recipients.' using errcode = 'P0001';
  end if;
  if new.packet_id is distinct from old.packet_id
    or new.packet_version_id is distinct from old.packet_version_id
    or new.organisation_id is distinct from old.organisation_id
    or new.packet_document_id is distinct from old.packet_document_id
    or new.signer_role is distinct from old.signer_role
    or new.signer_name is distinct from old.signer_name
    or new.signer_email is distinct from old.signer_email
    or new.signing_order is distinct from old.signing_order then
    raise exception 'E3 dispatched signer identity and ordering are immutable.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_freeze_dispatched_signer_envelope on public.document_packet_signers;
create trigger trg_freeze_dispatched_signer_envelope
before insert or update or delete on public.document_packet_signers
for each row execute function public.bridge_freeze_dispatched_signer_envelope();

create or replace function public.bridge_freeze_dispatched_signing_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_packet_id uuid := case when tg_op = 'DELETE' then old.packet_id else new.packet_id end;
  v_version_id uuid := case when tg_op = 'DELETE' then old.packet_version_id else new.packet_version_id end;
  v_dispatched boolean;
begin
  select exists (
    select 1 from public.document_packet_signers
    where packet_id = v_packet_id and packet_version_id = v_version_id
      and (signing_token is not null or token_used_at is not null or viewed_at is not null or signed_at is not null or status in ('sent', 'viewed', 'signed', 'declined', 'expired'))
  ) into v_dispatched;
  if not v_dispatched then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op in ('INSERT', 'DELETE') then
    raise exception 'E3 dispatched signing envelope cannot add or remove fields.' using errcode = 'P0001';
  end if;
  if new.packet_id is distinct from old.packet_id
    or new.packet_version_id is distinct from old.packet_version_id
    or new.organisation_id is distinct from old.organisation_id
    or new.packet_document_id is distinct from old.packet_document_id
    or new.signer_role is distinct from old.signer_role
    or new.signer_name is distinct from old.signer_name
    or new.signer_email is distinct from old.signer_email
    or new.field_type is distinct from old.field_type
    or new.page_number is distinct from old.page_number
    or new.x_position is distinct from old.x_position
    or new.y_position is distinct from old.y_position
    or new.width is distinct from old.width
    or new.height is distinct from old.height
    or new.required is distinct from old.required then
    raise exception 'E3 dispatched signing-field placement and ownership are immutable.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_freeze_dispatched_signing_fields on public.document_signing_fields;
create trigger trg_freeze_dispatched_signing_fields
before insert or update or delete on public.document_signing_fields
for each row execute function public.bridge_freeze_dispatched_signing_fields();

comment on function public.bridge_enforce_signing_envelope_before_token() is
  'E3 database backstop requiring complete real signers and valid exact-version field placement before signing-token issuance.';
comment on function public.bridge_freeze_dispatched_signer_envelope() is
  'E3 freezes signer identity and ordering after the first signing token is issued.';
comment on function public.bridge_freeze_dispatched_signing_fields() is
  'E3 freezes signing-field ownership and placement after the first signing token is issued.';

commit;
