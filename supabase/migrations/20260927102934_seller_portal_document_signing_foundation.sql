-- Separate seller document signing from the retired listing-mandate sessions.
-- These tables are inert until a reviewed server endpoint issues requests.
-- Client roles have no direct access to private HTML, link hashes, or evidence.
create table public.private_listing_seller_portal_signing_documents (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  private_listing_id uuid not null references public.private_listings(id),
  document_key text not null check (document_key in ('signed_disclosure_form', 'signed_fica_declaration', 'signed_mandate')),
  version_id uuid not null,
  version_digest text not null check (version_digest ~ '^sha256:[0-9a-f]{64}$'),
  content_digest text not null check (content_digest ~ '^sha256:[0-9a-f]{64}$'),
  reviewed_html text not null check (length(reviewed_html) > 0),
  required_signers jsonb not null check (jsonb_typeof(required_signers) = 'array' and jsonb_array_length(required_signers) > 0),
  approval_reference text not null check (length(btrim(approval_reference)) > 0),
  status text not null default 'prepared' check (status in ('prepared', 'sent', 'partially_signed', 'signed', 'reviewed', 'revoked', 'expired')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  signed_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  signed_document_id uuid,
  signed_html_digest text check (signed_html_digest is null or signed_html_digest ~ '^sha256:[0-9a-f]{64}$'),
  revoked_at timestamptz,
  revoke_reason text,
  check (status <> 'reviewed' or (reviewed_at is not null and reviewed_by is not null and signed_document_id is not null))
);

create index private_listing_seller_portal_signing_documents_listing_idx
  on public.private_listing_seller_portal_signing_documents (private_listing_id, document_key, created_at desc);

create unique index pl_seller_portal_signing_current_version_uidx
  on public.private_listing_seller_portal_signing_documents (private_listing_id, document_key, version_id)
  where status in ('prepared', 'sent', 'partially_signed', 'signed', 'reviewed');

create unique index pl_seller_portal_signing_signed_document_uidx
  on public.private_listing_seller_portal_signing_documents (signed_document_id)
  where signed_document_id is not null;

create function public.bridge_guard_seller_portal_signing_document()
returns trigger language plpgsql set search_path = public, extensions as $$
begin
  if tg_op = 'INSERT' then
    if not exists (
      select 1 from public.private_listings listing
      where listing.id = new.private_listing_id and listing.organisation_id = new.organisation_id
    ) then
      raise exception 'Signing document and listing organisation must agree.' using errcode = '23514';
    end if;
    if new.content_digest <> 'sha256:' || encode(extensions.digest(convert_to(new.reviewed_html, 'UTF8'), 'sha256'), 'hex') then
      raise exception 'Reviewed signing content does not match its approved digest.' using errcode = '23514';
    end if;
  elsif new.document_key is distinct from old.document_key
    or new.version_id is distinct from old.version_id
    or new.version_digest is distinct from old.version_digest
    or new.content_digest is distinct from old.content_digest
    or new.reviewed_html is distinct from old.reviewed_html
    or new.required_signers is distinct from old.required_signers
    or new.approval_reference is distinct from old.approval_reference
    or new.private_listing_id is distinct from old.private_listing_id
    or new.organisation_id is distinct from old.organisation_id then
    raise exception 'A reviewed seller signing version is immutable.' using errcode = 'P0001';
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

create trigger trg_guard_seller_portal_signing_document
before insert or update on public.private_listing_seller_portal_signing_documents
for each row execute function public.bridge_guard_seller_portal_signing_document();

create table public.private_listing_seller_portal_signing_recipients (
  id uuid primary key default gen_random_uuid(),
  signing_document_id uuid not null references public.private_listing_seller_portal_signing_documents(id),
  signer_name text not null check (length(btrim(signer_name)) > 0),
  signer_role text not null check (length(btrim(signer_role)) > 0),
  signer_email text not null check (length(btrim(signer_email)) > 0),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending' check (status in ('pending', 'viewed', 'signed', 'revoked', 'expired')),
  expires_at timestamptz not null,
  delivered_at timestamptz,
  provider_message_id text,
  viewed_at timestamptz,
  signed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (signing_document_id, signer_email)
);

create index private_listing_seller_portal_signing_recipients_document_idx
  on public.private_listing_seller_portal_signing_recipients (signing_document_id, status);

create function public.bridge_guard_seller_portal_signing_recipient()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' and not exists (
    select 1
    from public.private_listing_seller_portal_signing_documents document,
      jsonb_array_elements(document.required_signers) signer
    where document.id = new.signing_document_id
      and document.status = 'prepared'
      and btrim(signer->>'name') = btrim(new.signer_name)
      and btrim(signer->>'role') = btrim(new.signer_role)
      and lower(btrim(signer->>'email')) = lower(btrim(new.signer_email))
  ) then
    raise exception 'Recipient must match an approved signer on the frozen document.' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and (
    new.signing_document_id is distinct from old.signing_document_id
    or new.signer_name is distinct from old.signer_name
    or new.signer_role is distinct from old.signer_role
    or new.signer_email is distinct from old.signer_email
    or new.token_hash is distinct from old.token_hash
  ) then
    raise exception 'A seller signing recipient is immutable; revoke and prepare a new request.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger trg_guard_seller_portal_signing_recipient
before update on public.private_listing_seller_portal_signing_recipients
for each row execute function public.bridge_guard_seller_portal_signing_recipient();

create table public.private_listing_seller_portal_signature_evidence (
  id uuid primary key default gen_random_uuid(),
  signing_document_id uuid not null references public.private_listing_seller_portal_signing_documents(id),
  recipient_id uuid not null unique references public.private_listing_seller_portal_signing_recipients(id),
  document_version_id uuid not null,
  document_version_digest text not null check (document_version_digest ~ '^sha256:[0-9a-f]{64}$'),
  signed_name text not null check (length(btrim(signed_name)) > 0),
  signature_type text not null check (signature_type in ('typed', 'drawn')),
  signature_value text not null check (length(btrim(signature_value)) > 0),
  accepted_at timestamptz not null default now(),
  acceptance_ip text,
  acceptance_user_agent text,
  acceptance_text text not null,
  evidence_digest text not null check (evidence_digest ~ '^sha256:[0-9a-f]{64}$')
);

create function public.bridge_preserve_seller_portal_signature_evidence()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' and not exists (
    select 1
    from public.private_listing_seller_portal_signing_recipients recipient
    join public.private_listing_seller_portal_signing_documents document
      on document.id = recipient.signing_document_id
    where recipient.id = new.recipient_id
      and recipient.signing_document_id = new.signing_document_id
      and recipient.status in ('pending', 'viewed')
      and recipient.expires_at > now()
      and document.status in ('sent', 'partially_signed')
      and document.version_id = new.document_version_id
      and document.version_digest = new.document_version_digest
  ) then
    raise exception 'Signature evidence must match an active recipient and the reviewed document version.' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' then return new; end if;
  raise exception 'Seller portal signature evidence is append-only.' using errcode = 'P0001';
end;
$$;

create trigger trg_preserve_seller_portal_signature_evidence
before insert or update or delete on public.private_listing_seller_portal_signature_evidence
for each row execute function public.bridge_preserve_seller_portal_signature_evidence();

-- One locked transaction records intent for exactly one signer and advances
-- the document only after all approved recipients have signed its version.
create function public.bridge_submit_seller_portal_document_signature(
  p_token_hash text,
  p_signed_name text,
  p_signature_type text,
  p_signature_value text,
  p_acceptance_ip text default null,
  p_acceptance_user_agent text default null
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
  if lower(btrim(coalesce(p_signed_name, ''))) <> lower(btrim(v_recipient.signer_name))
    or p_signature_type not in ('typed', 'drawn')
    or length(btrim(coalesce(p_signature_value, ''))) < 2 then
    raise exception 'Confirm the named signer and provide a signature.' using errcode = '22023';
  end if;

  insert into public.private_listing_seller_portal_signature_evidence (
    signing_document_id, recipient_id, document_version_id,
    document_version_digest, signed_name, signature_type, signature_value,
    accepted_at, acceptance_ip, acceptance_user_agent, acceptance_text,
    evidence_digest
  ) values (
    v_document.id, v_recipient.id, v_document.version_id,
    v_document.version_digest, btrim(p_signed_name), p_signature_type,
    p_signature_value, v_accepted_at, p_acceptance_ip,
    p_acceptance_user_agent, v_acceptance_text,
    'sha256:' || encode(extensions.digest(
      v_document.version_digest || ':' || v_recipient.id::text || ':' ||
      p_signature_type || ':' || p_signature_value || ':' || v_accepted_at::text,
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

-- An agent's review is the only promotion into canonical Documents. The
-- signed HTML and its digest are generated server-side from frozen content and
-- append-only evidence; the database rechecks every signer before promotion.
create function public.bridge_review_seller_portal_signed_document(
  p_signing_document_id uuid,
  p_signed_html text,
  p_signed_html_digest text,
  p_reviewer_id uuid
)
returns jsonb language plpgsql security invoker set search_path = public, extensions as $$
declare
  v_document public.private_listing_seller_portal_signing_documents%rowtype;
  v_requirement_id uuid;
  v_document_id uuid;
begin
  select * into v_document
  from public.private_listing_seller_portal_signing_documents
  where id = p_signing_document_id
  for update;
  if not found or v_document.status <> 'signed' or v_document.signed_document_id is not null then
    raise exception 'All seller signatures must be captured before document review.' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.private_listing_seller_portal_signing_documents newer
    where newer.private_listing_id = v_document.private_listing_id
      and newer.document_key = v_document.document_key
      and newer.created_at > v_document.created_at
      and newer.status not in ('revoked', 'expired')
  ) then
    raise exception 'A newer seller document version requires review instead.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.private_listing_seller_portal_signing_recipients
      where signing_document_id = v_document.id and status = 'signed')
       <> jsonb_array_length(v_document.required_signers)
    or (select count(*) from public.private_listing_seller_portal_signature_evidence
      where signing_document_id = v_document.id)
       <> jsonb_array_length(v_document.required_signers) then
    raise exception 'Signature evidence is incomplete for the reviewed version.' using errcode = 'P0001';
  end if;
  if nullif(btrim(coalesce(p_signed_html, '')), '') is null
    or p_signed_html_digest <> 'sha256:' || encode(extensions.digest(convert_to(p_signed_html, 'UTF8'), 'sha256'), 'hex') then
    raise exception 'Signed document content and digest must agree.' using errcode = '23514';
  end if;
  if not exists (select 1 from auth.users where id = p_reviewer_id) then
    raise exception 'An identified agent must review this document.' using errcode = '22023';
  end if;

  select id into v_requirement_id
  from public.private_listing_document_requirements
  where private_listing_id = v_document.private_listing_id
    and requirement_key = v_document.document_key
  limit 1;
  if v_requirement_id is null then
    raise exception 'The signed seller document has no matching legal requirement.' using errcode = 'P0001';
  end if;

  insert into public.private_listing_documents (
    private_listing_id, requirement_id, document_type, document_name,
    generated_html, generated_file_name, uploaded_by, status, visibility,
    reviewed_signing_version_id, reviewed_signing_version_digest
  ) values (
    v_document.private_listing_id, v_requirement_id, v_document.document_key,
    case v_document.document_key
      when 'signed_disclosure_form' then 'Signed Mandatory Disclosure / Defects Form'
      when 'signed_fica_declaration' then 'Signed Seller FICA Declaration'
      else 'Signed Seller Mandate' end,
    p_signed_html, v_document.document_key || '-portal-signed.pdf',
    p_reviewer_id, 'approved', 'seller_visible',
    v_document.version_id, v_document.version_digest
  ) returning id into v_document_id;

  update public.private_listing_seller_portal_signing_documents
  set status = 'reviewed', reviewed_at = now(), reviewed_by = p_reviewer_id,
      signed_document_id = v_document_id, signed_html_digest = p_signed_html_digest
  where id = v_document.id;

  update public.private_listing_document_requirements
  set status = 'completed'
  where id = v_requirement_id;
  if v_document.document_key = 'signed_mandate' then
    update public.private_listings
    set mandate_status = 'signed',
        listing_status = case
          when lower(coalesce(listing_status, '')) in
            ('active', 'listing_active', 'in_progress', 'live', 'published',
             'under_offer', 'transaction_created', 'sold', 'finalised', 'finalized')
          then listing_status
          else 'mandate_signed'
        end
    where id = v_document.private_listing_id;
  end if;
  return jsonb_build_object('signingDocumentId', v_document.id, 'documentId', v_document_id,
    'documentVersionId', v_document.version_id, 'documentVersionDigest', v_document.version_digest);
end;
$$;

create function public.bridge_preserve_reviewed_seller_portal_document()
returns trigger language plpgsql set search_path = public as $$
begin
  if exists (
    select 1 from public.private_listing_seller_portal_signing_documents signing
    where signing.signed_document_id = old.id and signing.status = 'reviewed'
  ) then
    if tg_op = 'DELETE' then
      raise exception 'A reviewed seller portal document is retained as signature evidence.' using errcode = 'P0001';
    end if;
    if new.generated_html is distinct from old.generated_html
      or new.document_type is distinct from old.document_type
      or new.reviewed_signing_version_id is distinct from old.reviewed_signing_version_id
      or new.reviewed_signing_version_digest is distinct from old.reviewed_signing_version_digest
      or new.status is distinct from old.status then
      raise exception 'A reviewed seller portal document is immutable; create a replacement version.' using errcode = 'P0001';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger trg_preserve_reviewed_seller_portal_document
before update or delete on public.private_listing_documents
for each row execute function public.bridge_preserve_reviewed_seller_portal_document();

alter table public.private_listing_seller_portal_signing_documents enable row level security;
alter table public.private_listing_seller_portal_signing_recipients enable row level security;
alter table public.private_listing_seller_portal_signature_evidence enable row level security;

revoke all on table public.private_listing_seller_portal_signing_documents from public, anon, authenticated;
revoke all on table public.private_listing_seller_portal_signing_recipients from public, anon, authenticated;
revoke all on table public.private_listing_seller_portal_signature_evidence from public, anon, authenticated;
revoke all on table public.private_listing_seller_portal_signing_documents from service_role;
revoke all on table public.private_listing_seller_portal_signing_recipients from service_role;
revoke all on table public.private_listing_seller_portal_signature_evidence from service_role;
grant select, insert, update on table public.private_listing_seller_portal_signing_documents to service_role;
grant select, insert, update on table public.private_listing_seller_portal_signing_recipients to service_role;
grant select, insert on table public.private_listing_seller_portal_signature_evidence to service_role;

revoke execute on function public.bridge_guard_seller_portal_signing_document() from public, anon, authenticated;
revoke execute on function public.bridge_guard_seller_portal_signing_recipient() from public, anon, authenticated;
revoke execute on function public.bridge_preserve_seller_portal_signature_evidence() from public, anon, authenticated;
revoke execute on function public.bridge_preserve_reviewed_seller_portal_document() from public, anon, authenticated;
revoke execute on function public.bridge_submit_seller_portal_document_signature(text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.bridge_submit_seller_portal_document_signature(text, text, text, text, text, text) to service_role;
revoke execute on function public.bridge_review_seller_portal_signed_document(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.bridge_review_seller_portal_signed_document(uuid, text, text, uuid) to service_role;
