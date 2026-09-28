-- Capture the place and date the seller enters beside a drawn signature.
-- accepted_at remains the authoritative server timestamp for the act of signing.
alter table public.private_listing_seller_portal_signature_evidence
  add column signed_date date,
  add column signed_place text;

alter table public.private_listing_seller_portal_signature_evidence
  add constraint seller_portal_signature_place_length
  check (signed_place is null or length(btrim(signed_place)) between 2 and 160);

-- Preserve the agent-approved source while allowing the seller to correct the
-- active copy. The first signature freezes that copy for every other signer.
alter table public.private_listing_seller_portal_signing_documents
  add column source_version_digest text,
  add column source_content_digest text,
  add column seller_corrections jsonb not null default '{}'::jsonb;

update public.private_listing_seller_portal_signing_documents
set source_version_digest = version_digest,
    source_content_digest = content_digest;

alter table public.private_listing_seller_portal_signing_documents
  alter column source_version_digest set not null,
  alter column source_content_digest set not null,
  add constraint seller_portal_source_version_digest_format check (source_version_digest ~ '^sha256:[0-9a-f]{64}$'),
  add constraint seller_portal_source_content_digest_format check (source_content_digest ~ '^sha256:[0-9a-f]{64}$');

create or replace function public.bridge_guard_seller_portal_signing_document()
returns trigger language plpgsql set search_path = public, extensions as $$
declare
  v_correction boolean := current_setting('app.seller_portal_correction', true) = 'true';
begin
  if tg_op = 'INSERT' then
    new.source_version_digest := coalesce(new.source_version_digest, new.version_digest);
    new.source_content_digest := coalesce(new.source_content_digest, new.content_digest);
    if not exists (
      select 1 from public.private_listings listing
      where listing.id = new.private_listing_id and listing.organisation_id = new.organisation_id
    ) then
      raise exception 'Signing document and listing organisation must agree.' using errcode = '23514';
    end if;
    if new.source_version_digest is distinct from new.version_digest
      or new.source_content_digest is distinct from new.content_digest then
      raise exception 'The approved source digests must match the issued copy.' using errcode = '23514';
    end if;
  elsif new.document_key is distinct from old.document_key
    or new.version_id is distinct from old.version_id
    or new.required_signers is distinct from old.required_signers
    or new.approval_reference is distinct from old.approval_reference
    or new.private_listing_id is distinct from old.private_listing_id
    or new.organisation_id is distinct from old.organisation_id
    or new.source_version_digest is distinct from old.source_version_digest
    or new.source_content_digest is distinct from old.source_content_digest then
    raise exception 'An approved seller signing source is immutable.' using errcode = 'P0001';
  elsif (new.version_digest is distinct from old.version_digest
    or new.content_digest is distinct from old.content_digest
    or new.reviewed_html is distinct from old.reviewed_html
    or new.seller_corrections is distinct from old.seller_corrections)
    and (not v_correction or old.status <> 'sent' or exists (
      select 1 from public.private_listing_seller_portal_signature_evidence evidence
      where evidence.signing_document_id = old.id
    )) then
    raise exception 'Shared seller details are locked after the first signature.' using errcode = 'P0001';
  end if;
  if new.content_digest <> 'sha256:' || encode(extensions.digest(convert_to(new.reviewed_html, 'UTF8'), 'sha256'), 'hex') then
    raise exception 'Signing content does not match its digest.' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and old.status in ('reviewed', 'revoked', 'expired') and new.status is distinct from old.status then
    raise exception 'A final seller signing request cannot be reopened.' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and old.status = 'reviewed' and (
    new.reviewed_at is distinct from old.reviewed_at
    or new.reviewed_by is distinct from old.reviewed_by
    or new.signed_document_id is distinct from old.signed_document_id
    or new.signed_html_digest is distinct from old.signed_html_digest
  ) then
    raise exception 'Reviewed seller signing evidence is immutable.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create function public.bridge_update_seller_portal_document_corrections(
  p_token_hash text,
  p_expected_version_digest text,
  p_updates jsonb
)
returns jsonb language plpgsql security invoker set search_path = public, extensions as $$
declare
  v_recipient public.private_listing_seller_portal_signing_recipients%rowtype;
  v_document public.private_listing_seller_portal_signing_documents%rowtype;
  v_update jsonb;
  v_target public.private_listing_seller_portal_signing_documents%rowtype;
  v_updated integer := 0;
begin
  select * into v_recipient from public.private_listing_seller_portal_signing_recipients
  where token_hash = p_token_hash for update;
  if not found or v_recipient.status not in ('pending', 'viewed') or v_recipient.expires_at <= now() then
    raise exception 'This signer link is unavailable or expired.' using errcode = 'P0001';
  end if;
  select * into v_document from public.private_listing_seller_portal_signing_documents
  where id = v_recipient.signing_document_id;
  if not found or v_document.status <> 'sent' or v_document.version_digest <> p_expected_version_digest then
    raise exception 'Reload the latest document before changing it.' using errcode = 'P0001';
  end if;
  if coalesce(jsonb_typeof(p_updates), '') <> 'array' then
    raise exception 'No corrected copies were provided.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_updates) < 1 then
    raise exception 'No corrected copies were provided.' using errcode = '22023';
  end if;
  if (select count(distinct value->>'documentId') from jsonb_array_elements(p_updates)) <> jsonb_array_length(p_updates) then
    raise exception 'Corrected signing pack contained duplicate documents.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.private_listing_seller_portal_signature_evidence evidence
    join public.private_listing_seller_portal_signing_documents signed_document
      on signed_document.id = evidence.signing_document_id
    where signed_document.private_listing_id = v_document.private_listing_id
  ) then
    raise exception 'Shared details are locked after the first signature.' using errcode = 'P0001';
  end if;
  -- Lock all unsigned copies before validating any replacement. A concurrent
  -- first signature either wins and rejects this update, or sees the new digest.
  perform 1 from public.private_listing_seller_portal_signing_documents
    where private_listing_id = v_document.private_listing_id and status = 'sent'
    order by id for update;
  select * into v_document from public.private_listing_seller_portal_signing_documents
  where id = v_recipient.signing_document_id;
  if v_document.status <> 'sent' or v_document.version_digest <> p_expected_version_digest then
    raise exception 'Reload the latest document before changing it.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.private_listing_seller_portal_signing_documents
      where private_listing_id = v_document.private_listing_id and status = 'sent') <> jsonb_array_length(p_updates) then
    raise exception 'Reload the complete signing pack before changing it.' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.private_listing_seller_portal_signature_evidence evidence
    join public.private_listing_seller_portal_signing_documents signed_document
      on signed_document.id = evidence.signing_document_id
    where signed_document.private_listing_id = v_document.private_listing_id
  ) then
    raise exception 'Shared details are locked after the first signature.' using errcode = 'P0001';
  end if;
  perform set_config('app.seller_portal_correction', 'true', true);
  for v_update in select value from jsonb_array_elements(p_updates) loop
    select * into v_target from public.private_listing_seller_portal_signing_documents
    where id = (v_update->>'documentId')::uuid
      and private_listing_id = v_document.private_listing_id and status = 'sent';
    if not found or v_target.version_digest <> v_update->>'expectedVersionDigest'
      or coalesce(jsonb_typeof(v_update->'corrections'), '') <> 'object'
      or length(coalesce(v_update->>'reviewedHtml', '')) < 100
      or v_update->>'contentDigest' <> 'sha256:' || encode(extensions.digest(
        convert_to(v_update->>'reviewedHtml', 'UTF8'), 'sha256'), 'hex')
      or v_update->>'versionDigest' <> 'sha256:' || encode(extensions.digest(
        convert_to(v_target.source_version_digest || ':' || (v_update->>'contentDigest'), 'UTF8'), 'sha256'), 'hex') then
      raise exception 'Corrected signing copy failed verification.' using errcode = '22023';
    end if;
    update public.private_listing_seller_portal_signing_documents
    set reviewed_html = v_update->>'reviewedHtml', content_digest = v_update->>'contentDigest',
        version_digest = v_update->>'versionDigest', seller_corrections = v_update->'corrections'
    where id = v_target.id;
    v_updated := v_updated + 1;
  end loop;
  if v_updated <> jsonb_array_length(p_updates) then
    raise exception 'Corrected signing pack contained duplicate documents.' using errcode = '22023';
  end if;
  return jsonb_build_object('updatedCount', v_updated);
end;
$$;

revoke execute on function public.bridge_update_seller_portal_document_corrections(text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.bridge_update_seller_portal_document_corrections(text, text, jsonb)
  to service_role;

create function public.bridge_submit_seller_portal_document_signature(
  p_token_hash text,
  p_signed_name text,
  p_signature_type text,
  p_signature_value text,
  p_signed_date date,
  p_signed_place text,
  p_acceptance_ip text,
  p_acceptance_user_agent text,
  p_expected_version_digest text
)
returns jsonb language plpgsql security invoker set search_path = public, extensions as $$
declare
  v_recipient public.private_listing_seller_portal_signing_recipients%rowtype;
  v_document public.private_listing_seller_portal_signing_documents%rowtype;
  v_evidence_id uuid;
  v_all_signed boolean;
  v_accepted_at timestamptz := now();
  v_acceptance_text text := 'I have reviewed this document and sign it as the named seller or authorised representative.';
begin
  select * into v_recipient
  from public.private_listing_seller_portal_signing_recipients
  where token_hash = p_token_hash
  for update;
  if not found or v_recipient.status not in ('pending', 'viewed') or v_recipient.expires_at <= now() then
    raise exception 'This signer link is unavailable or has expired.' using errcode = 'P0001';
  end if;

  select * into v_document
  from public.private_listing_seller_portal_signing_documents
  where id = v_recipient.signing_document_id
  for update;
  if not found or v_document.status not in ('sent', 'partially_signed') then
    raise exception 'The reviewed document is not available for signing.' using errcode = 'P0001';
  end if;
  if v_document.version_digest <> p_expected_version_digest then
    raise exception 'Reload the latest document before signing.' using errcode = 'P0001';
  end if;
  if lower(btrim(coalesce(p_signed_name, ''))) <> lower(btrim(
    case when lower(coalesce(v_document.required_signers->0->>'email', '')) = lower(v_recipient.signer_email)
      and length(btrim(coalesce(v_document.seller_corrections #>> '{common,sellerName}', ''))) > 0
      then v_document.seller_corrections #>> '{common,sellerName}'
      else v_recipient.signer_name end))
    or p_signature_type <> 'drawn'
    or p_signature_value !~ '^data:image/(png|jpeg);base64,[a-zA-Z0-9+/=]+$'
    or length(p_signature_value) < 100
    or length(p_signature_value) > 1500000
    or p_signed_date is null
    or length(btrim(coalesce(p_signed_place, ''))) not between 2 and 160 then
    raise exception 'Confirm the named signer, draw a signature, and enter its date and place.' using errcode = '22023';
  end if;

  insert into public.private_listing_seller_portal_signature_evidence (
    signing_document_id, recipient_id, document_version_id,
    document_version_digest, signed_name, signature_type, signature_value,
    signed_date, signed_place, accepted_at, acceptance_ip,
    acceptance_user_agent, acceptance_text, evidence_digest
  ) values (
    v_document.id, v_recipient.id, v_document.version_id,
    v_document.version_digest, btrim(p_signed_name), p_signature_type,
    p_signature_value, p_signed_date, btrim(p_signed_place), v_accepted_at,
    p_acceptance_ip, p_acceptance_user_agent, v_acceptance_text,
    'sha256:' || encode(extensions.digest(
      v_document.version_digest || ':' || v_recipient.id::text || ':' ||
      p_signature_type || ':' || p_signature_value || ':' ||
      p_signed_date::text || ':' || btrim(p_signed_place) || ':' || v_accepted_at::text,
      'sha256'
    ), 'hex')
  ) returning id into v_evidence_id;

  update public.private_listing_seller_portal_signing_recipients
  set status = 'signed', signed_at = v_accepted_at
  where id = v_recipient.id;

  select count(*) = jsonb_array_length(v_document.required_signers)
    and bool_and(status = 'signed')
  into v_all_signed
  from public.private_listing_seller_portal_signing_recipients
  where signing_document_id = v_document.id;

  update public.private_listing_seller_portal_signing_documents
  set status = case when v_all_signed then 'signed' else 'partially_signed' end,
      signed_at = case when v_all_signed then v_accepted_at else null end
  where id = v_document.id;

  return jsonb_build_object(
    'signingDocumentId', v_document.id,
    'recipientId', v_recipient.id,
    'evidenceId', v_evidence_id,
    'allRequiredSignersComplete', v_all_signed,
    'documentVersionId', v_document.version_id,
    'documentVersionDigest', v_document.version_digest
  );
end;
$$;

revoke execute on function public.bridge_submit_seller_portal_document_signature(text, text, text, text, date, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.bridge_submit_seller_portal_document_signature(text, text, text, text, date, text, text, text, text)
  to service_role;
