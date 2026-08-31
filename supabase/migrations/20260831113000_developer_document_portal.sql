begin;

create table if not exists public.developer_document_portal_links (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  development_id uuid not null references public.developments(id) on delete cascade,
  recipient_email text not null,
  token_hash text not null unique,
  token_hint text not null,
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint developer_document_portal_links_email_check
    check (recipient_email = lower(btrim(recipient_email)) and recipient_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  constraint developer_document_portal_links_expiry_check
    check (expires_at is null or expires_at > created_at)
);

create index if not exists developer_document_portal_links_transaction_idx
  on public.developer_document_portal_links (transaction_id, created_at desc);
create index if not exists developer_document_portal_links_active_idx
  on public.developer_document_portal_links (transaction_id, lower(recipient_email), expires_at)
  where revoked_at is null;

drop trigger if exists developer_document_portal_links_set_updated_at
  on public.developer_document_portal_links;
create trigger developer_document_portal_links_set_updated_at
before update on public.developer_document_portal_links
for each row execute function public.bridge_set_updated_at();

alter table public.developer_document_portal_links enable row level security;
revoke all on table public.developer_document_portal_links from public, anon, authenticated;
grant all on table public.developer_document_portal_links to service_role;
drop policy if exists developer_document_portal_links_deny_direct_access
  on public.developer_document_portal_links;
create policy developer_document_portal_links_deny_direct_access
  on public.developer_document_portal_links
  for all to anon, authenticated
  using (false)
  with check (false);

create or replace function public.bridge_developer_document_portal_transaction_is_eligible(
  p_transaction public.transactions
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_transaction.id is not null
    and p_transaction.development_id is not null
    and (
      lower(coalesce(to_jsonb(p_transaction) ->> 'transaction_type', '')) in (
        'developer_sale', 'development_sale', 'development'
      )
      or lower(coalesce(to_jsonb(p_transaction) ->> 'sale_route', '')) in (
        'developer_sale', 'development_sale', 'internal_developer_sale',
        'developer_direct_sale', 'developer_direct', 'developer_assigned_sale',
        'developer_assigned', 'external_agency_sale', 'agency_introduced_sale',
        'agency_introduced'
      )
      or lower(coalesce(to_jsonb(p_transaction) ->> 'seller_party_type', '')) = 'developer'
    );
$$;

create or replace function public.bridge_developer_document_requirement_is_visible(
  p_requirement public.transaction_document_requirements
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_requirement.id is not null
    and p_requirement.superseded_at is null
    and lower(coalesce(p_requirement.status, 'pending')) <> 'not_applicable'
    and (
      lower(coalesce(p_requirement.requested_from, '')) in ('developer', 'seller')
      or lower(coalesce(p_requirement.responsible_role, '')) in ('developer', 'seller')
      or lower(coalesce(p_requirement.visible_section, '')) = 'seller_documents'
    );
$$;

create or replace function public.bridge_developer_document_portal_active_link()
returns public.developer_document_portal_links
language sql
stable
security definer
set search_path = ''
as $$
  select link.*
  from public.developer_document_portal_links link
  where link.token_hash = encode(
      extensions.digest(
        coalesce(public.bridge_request_headers() ->> 'x-bridge-developer-document-token', ''),
        'sha256'
      ),
      'hex'
    )
    and link.revoked_at is null
    and (link.expires_at is null or link.expires_at > now())
  limit 1;
$$;

create or replace function public.bridge_developer_document_portal_can_write_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with active_link as (
    select (public.bridge_developer_document_portal_active_link()).*
  )
  select exists (
    select 1
    from active_link link
    where link.id is not null
      and coalesce((storage.foldername(p_name))[1], '') = 'developer-document-portal'
      and coalesce((storage.foldername(p_name))[2], '') = link.id::text
      and coalesce((storage.foldername(p_name))[3], '') = link.transaction_id::text
      and coalesce(storage.filename(p_name), '') <> ''
  );
$$;

create or replace function public.bridge_create_developer_document_portal_link(
  p_transaction_id uuid,
  p_recipient_email text,
  p_access_token text,
  p_expires_days integer default 14
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transaction public.transactions%rowtype;
  v_link public.developer_document_portal_links%rowtype;
  v_email text := lower(btrim(coalesce(p_recipient_email, '')));
  v_token text := btrim(coalesce(p_access_token, ''));
  v_days integer := greatest(1, least(coalesce(p_expires_days, 14), 90));
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_transaction_id is null then
    raise exception 'transaction is required' using errcode = '22023';
  end if;
  if v_email = '' or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'a valid developer email is required' using errcode = '22023';
  end if;
  if length(v_token) < 32 then
    raise exception 'access token is invalid' using errcode = '22023';
  end if;

  select * into v_transaction
  from public.transactions transaction_record
  where transaction_record.id = p_transaction_id;
  if not found then
    raise exception 'transaction not found' using errcode = 'P0002';
  end if;
  if not public.bridge_developer_document_portal_transaction_is_eligible(v_transaction) then
    raise exception 'developer document portals are only available for developer sales'
      using errcode = '22023';
  end if;
  if not (
    public.bridge_has_transaction_permission(p_transaction_id, 'view_documents')
    or public.bridge_has_transaction_permission(p_transaction_id, 'edit_core_transaction')
    or public.bridge_can_access_transaction_spine(p_transaction_id)
  ) then
    raise exception 'not authorised to create a developer document portal'
      using errcode = '42501';
  end if;

  update public.developer_document_portal_links
  set revoked_at = now(), updated_at = now()
  where transaction_id = p_transaction_id
    and lower(recipient_email) = v_email
    and revoked_at is null;

  insert into public.developer_document_portal_links (
    transaction_id,
    development_id,
    recipient_email,
    token_hash,
    token_hint,
    expires_at,
    created_by
  ) values (
    p_transaction_id,
    v_transaction.development_id,
    v_email,
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    right(v_token, 6),
    now() + make_interval(days => v_days),
    auth.uid()
  ) returning * into v_link;

  return jsonb_build_object(
    'id', v_link.id,
    'transactionId', v_link.transaction_id,
    'developmentId', v_link.development_id,
    'recipientEmail', v_link.recipient_email,
    'expiresAt', v_link.expires_at,
    'createdAt', v_link.created_at
  );
end;
$$;

create or replace function public.bridge_revoke_developer_document_portal_link(p_link_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transaction_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select link.transaction_id into v_transaction_id
  from public.developer_document_portal_links link
  where link.id = p_link_id;
  if v_transaction_id is null then
    return false;
  end if;
  if not (
    public.bridge_has_transaction_permission(v_transaction_id, 'view_documents')
    or public.bridge_has_transaction_permission(v_transaction_id, 'edit_core_transaction')
    or public.bridge_can_access_transaction_spine(v_transaction_id)
  ) then
    raise exception 'not authorised to revoke this developer document portal'
      using errcode = '42501';
  end if;
  update public.developer_document_portal_links
  set revoked_at = coalesce(revoked_at, now()), updated_at = now()
  where id = p_link_id;
  return found;
end;
$$;

create or replace function public.bridge_developer_document_portal_payload()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.developer_document_portal_links%rowtype;
  v_transaction public.transactions%rowtype;
  v_payload jsonb;
begin
  select * into v_link from public.bridge_developer_document_portal_active_link();
  if v_link.id is null then
    raise exception 'developer document portal link is invalid, expired, or revoked'
      using errcode = '42501';
  end if;
  select * into v_transaction
  from public.transactions transaction_record
  where transaction_record.id = v_link.transaction_id;
  if not found or not public.bridge_developer_document_portal_transaction_is_eligible(v_transaction) then
    raise exception 'developer sale transaction is not available' using errcode = 'P0002';
  end if;

  update public.developer_document_portal_links
  set last_used_at = now(), updated_at = now()
  where id = v_link.id;

  select jsonb_build_object(
    'portal', jsonb_build_object(
      'id', v_link.id,
      'recipientEmail', v_link.recipient_email,
      'expiresAt', v_link.expires_at
    ),
    'development', jsonb_build_object(
      'id', development.id,
      'name', development.name,
      'developerName', coalesce(
        nullif(to_jsonb(development) ->> 'developer_company', ''),
        nullif(to_jsonb(development) ->> 'developer_name', ''),
        development.name
      )
    ),
    'unit', jsonb_build_object(
      'id', unit_record.id,
      'unitNumber', unit_record.unit_number,
      'phase', unit_record.phase
    ),
    'transaction', jsonb_build_object(
      'id', v_transaction.id,
      'reference', coalesce(
        nullif(to_jsonb(v_transaction) ->> 'transaction_reference', ''),
        nullif(to_jsonb(v_transaction) ->> 'matter_number', ''),
        'Developer sale'
      ),
      'stage', v_transaction.stage,
      'saleRoute', to_jsonb(v_transaction) ->> 'sale_route'
    ),
    'requirements', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', requirement.id,
          'canonicalRequirementInstanceId', requirement.canonical_requirement_instance_id,
          'key', requirement.document_key,
          'name', requirement.document_name,
          'description', definition.description,
          'category', requirement.document_category,
          'section', requirement.visible_section,
          'workflow', requirement.owning_workflow,
          'required', requirement.required,
          'blocking', requirement.blocking,
          'status', requirement.status,
          'uploadedDocumentId', requirement.uploaded_document_id,
          'reviewRequired', coalesce(definition.review_required, true),
          'updatedAt', requirement.updated_at
        ) order by requirement.blocking desc, requirement.required desc, requirement.document_name
      )
      from public.transaction_document_requirements requirement
      left join public.document_definitions definition
        on definition.key = requirement.document_key
      where requirement.transaction_id = v_link.transaction_id
        and public.bridge_developer_document_requirement_is_visible(requirement)
    ), '[]'::jsonb),
    'documents', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', document.id,
          'name', document.name,
          'filePath', document.file_path,
          'fileBucket', coalesce(document.file_bucket, 'documents'),
          'category', document.category,
          'documentType', document.document_type,
          'canonicalRequirementInstanceId', document.canonical_requirement_instance_id,
          'reviewStatus', document.review_status,
          'createdAt', document.created_at
        ) order by document.created_at desc
      )
      from public.documents document
      where document.transaction_id = v_link.transaction_id
        and document.source = 'developer_document_portal'
    ), '[]'::jsonb)
  ) into v_payload
  from public.developments development
  left join public.units unit_record on unit_record.id = v_transaction.unit_id
  where development.id = v_link.development_id;

  return coalesce(v_payload, '{}'::jsonb);
end;
$$;

create or replace function public.bridge_submit_developer_document_portal_document(
  p_file_path text,
  p_file_name text,
  p_category text default 'Developer Documents',
  p_requirement_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.developer_document_portal_links%rowtype;
  v_requirement public.transaction_document_requirements%rowtype;
  v_definition public.document_definitions%rowtype;
  v_document public.documents%rowtype;
  v_status text := 'under_review';
begin
  select * into v_link from public.bridge_developer_document_portal_active_link();
  if v_link.id is null then
    raise exception 'developer document portal link is invalid, expired, or revoked'
      using errcode = '42501';
  end if;
  if not public.bridge_developer_document_portal_can_write_object(p_file_path) then
    raise exception 'document path is outside this developer portal' using errcode = '42501';
  end if;
  if btrim(coalesce(p_file_name, '')) = '' then
    raise exception 'file name is required' using errcode = '22023';
  end if;
  if not exists (
    select 1 from storage.objects object
    where object.bucket_id = 'documents' and object.name = p_file_path
  ) then
    raise exception 'uploaded file was not found' using errcode = 'P0002';
  end if;

  if p_requirement_id is not null then
    select * into v_requirement
    from public.transaction_document_requirements requirement
    where requirement.id = p_requirement_id
      and requirement.transaction_id = v_link.transaction_id
      and public.bridge_developer_document_requirement_is_visible(requirement)
    for update;
    if not found then
      raise exception 'developer document requirement is not available for this portal'
        using errcode = '42501';
    end if;
    select * into v_definition
    from public.document_definitions definition
    where definition.key = v_requirement.document_key;
    v_status := case when coalesce(v_definition.review_required, true) then 'under_review' else 'uploaded' end;
  end if;

  insert into public.documents (
    transaction_id,
    name,
    file_path,
    file_bucket,
    category,
    document_type,
    visibility_scope,
    is_client_visible,
    uploaded_by_role,
    uploaded_by_email,
    source,
    canonical_requirement_instance_id,
    review_status
  ) values (
    v_link.transaction_id,
    btrim(p_file_name),
    p_file_path,
    'documents',
    coalesce(nullif(btrim(p_category), ''), 'Developer Documents'),
    coalesce(nullif(v_requirement.document_key, ''), 'developer_shared_document'),
    'shared',
    false,
    'developer',
    v_link.recipient_email,
    'developer_document_portal',
    v_requirement.canonical_requirement_instance_id,
    v_status
  ) returning * into v_document;

  if v_requirement.id is not null then
    update public.transaction_document_requirements
    set uploaded_document_id = v_document.id,
        status = v_status,
        updated_at = now(),
        last_resolved_at = now()
    where id = v_requirement.id;

    if v_requirement.canonical_requirement_instance_id is not null then
      update public.document_requirement_instances
      set satisfied_by_document_id = v_document.id,
          status = v_status,
          updated_at = now()
      where id = v_requirement.canonical_requirement_instance_id;
      insert into public.document_requirement_events (
        requirement_instance_id, event_type, actor_role, message, metadata_json
      ) values (
        v_requirement.canonical_requirement_instance_id,
        'uploaded',
        'developer',
        'Developer uploaded a document through the developer document portal.',
        jsonb_build_object(
          'document_id', v_document.id,
          'portal_link_id', v_link.id,
          'source', 'developer_document_portal'
        )
      );
    end if;

    update public.transaction_required_documents
    set is_uploaded = true,
        status = 'uploaded',
        uploaded_document_id = v_document.id,
        uploaded_at = now(),
        updated_at = now()
    where transaction_id = v_link.transaction_id
      and (
        canonical_requirement_instance_id = v_requirement.canonical_requirement_instance_id
        or document_key = v_requirement.document_key
      );
  end if;

  return jsonb_build_object(
    'id', v_document.id,
    'name', v_document.name,
    'filePath', v_document.file_path,
    'fileBucket', coalesce(v_document.file_bucket, 'documents'),
    'category', v_document.category,
    'documentType', v_document.document_type,
    'canonicalRequirementInstanceId', v_document.canonical_requirement_instance_id,
    'reviewStatus', v_document.review_status,
    'createdAt', v_document.created_at
  );
end;
$$;

revoke all on function public.bridge_developer_document_portal_transaction_is_eligible(public.transactions) from public;
revoke all on function public.bridge_developer_document_requirement_is_visible(public.transaction_document_requirements) from public;
revoke all on function public.bridge_developer_document_portal_active_link() from public;
revoke all on function public.bridge_developer_document_portal_can_write_object(text) from public;
revoke all on function public.bridge_create_developer_document_portal_link(uuid, text, text, integer) from public;
revoke all on function public.bridge_revoke_developer_document_portal_link(uuid) from public;
revoke all on function public.bridge_developer_document_portal_payload() from public;
revoke all on function public.bridge_submit_developer_document_portal_document(text, text, text, uuid) from public;

grant execute on function public.bridge_create_developer_document_portal_link(uuid, text, text, integer) to authenticated;
grant execute on function public.bridge_revoke_developer_document_portal_link(uuid) to authenticated;
grant execute on function public.bridge_developer_document_portal_payload() to anon, authenticated;
grant execute on function public.bridge_submit_developer_document_portal_document(text, text, text, uuid) to anon, authenticated;
grant execute on function public.bridge_developer_document_portal_can_write_object(text) to anon, authenticated;
grant execute on function public.bridge_developer_document_portal_active_link() to service_role;
grant execute on function public.bridge_developer_document_portal_transaction_is_eligible(public.transactions) to service_role;
grant execute on function public.bridge_developer_document_requirement_is_visible(public.transaction_document_requirements) to service_role;

drop policy if exists documents_developer_document_portal_insert on storage.objects;
create policy documents_developer_document_portal_insert
on storage.objects for insert to anon, authenticated
with check (
  bucket_id = 'documents'
  and public.bridge_developer_document_portal_can_write_object(name)
);

drop policy if exists documents_developer_document_portal_select on storage.objects;
create policy documents_developer_document_portal_select
on storage.objects for select to anon, authenticated
using (
  bucket_id = 'documents'
  and public.bridge_developer_document_portal_can_write_object(name)
);

comment on table public.developer_document_portal_links is
  'Hashed, transaction-scoped bearer links for developer-sale document collection. This is intentionally separate from private seller onboarding and the mutable external workspace.';
comment on function public.bridge_developer_document_portal_payload() is
  'Returns only developer-sale identity, unit, canonical developer requirements, and documents uploaded through the developer portal; buyer data is never included.';
comment on function public.bridge_submit_developer_document_portal_document(text, text, text, uuid) is
  'Registers a token-scoped developer upload and updates the canonical requirement plus its legacy projection atomically.';

notify pgrst, 'reload schema';
commit;
