begin;

-- The documents bucket and its original policies were configured manually in
-- the Supabase dashboard. Keep the bucket private and make the access model
-- reproducible in the migration spine.
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do update
set public = excluded.public;

-- `bridge_request_header` lower-cases values for historical token formats.
-- Storage authorization must preserve the original value because access
-- tokens are bearer secrets, not case-insensitive identifiers.
create or replace function public.bridge_storage_request_header(p_name text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select nullif(trim(coalesce(
    public.bridge_request_headers() ->> lower(coalesce(p_name, '')),
    ''
  )), '');
$$;

create or replace function public.bridge_storage_seller_portal_listing_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_token text := public.bridge_storage_request_header('x-bridge-seller-portal-token');
  v_access_token text := public.bridge_storage_request_header('x-bridge-seller-portal-access-token');
  v_resolution record;
  v_onboarding public.private_listing_seller_onboarding%rowtype;
  v_listing public.private_listings%rowtype;
begin
  if v_token is null then
    return null;
  end if;

  select *
  into v_resolution
  from public.bridge_resolve_private_listing_seller_portal_token(v_token)
  where token_valid
  limit 1;

  if not found then
    return null;
  end if;

  select *
  into v_onboarding
  from public.private_listing_seller_onboarding
  where id = v_resolution.onboarding_id;

  select *
  into v_listing
  from public.private_listings
  where id = v_onboarding.private_listing_id;

  if not found
     or not public.bridge_private_listing_seller_portal_link_is_active(
       to_jsonb(v_onboarding),
       to_jsonb(v_listing)
     ) then
    return null;
  end if;

  -- A portal with no password is intentionally usable while the seller is
  -- completing onboarding. Once a password has been set, require the active
  -- twelve-hour seller session exactly as the seller portal RPC does.
  if v_onboarding.seller_portal_password_hash is not null and (
    v_access_token is null
    or v_onboarding.seller_portal_access_token_hash is distinct from encode(digest(v_access_token, 'sha256'), 'hex')
    or v_onboarding.seller_portal_access_token_expires_at is null
    or v_onboarding.seller_portal_access_token_expires_at <= now()
  ) then
    return null;
  end if;

  return v_listing.id;
exception
  when others then
    return null;
end;
$$;

create or replace function public.bridge_storage_seller_portal_can_write(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public, storage
as $$
  with scope as (
    select public.bridge_storage_seller_portal_listing_id() as listing_id
  )
  select scope.listing_id is not null
    and coalesce((storage.foldername(p_name))[1], '') = 'seller-portal'
    and coalesce((storage.foldername(p_name))[2], '') = scope.listing_id::text
    and coalesce(storage.filename(p_name), '') <> ''
  from scope;
$$;

create or replace function public.bridge_storage_seller_portal_can_read(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public, storage
as $$
  with scope as (
    select public.bridge_storage_seller_portal_listing_id() as listing_id
  )
  select exists (
    select 1
    from scope
    where scope.listing_id is not null
      and (
        (
          coalesce((storage.foldername(p_name))[1], '') = 'seller-portal'
          and coalesce((storage.foldername(p_name))[2], '') = scope.listing_id::text
          and coalesce(storage.filename(p_name), '') <> ''
        )
        or exists (
          select 1
          from public.private_listing_documents document
          where document.private_listing_id = scope.listing_id
            and document.storage_path = p_name
            and lower(coalesce(document.visibility, 'seller_visible')) not in ('internal', 'internal_only', 'admin_only')
        )
      )
  );
$$;

create or replace function public.bridge_storage_buyer_portal_can_write(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public, storage
as $$
  select exists (
    select 1
    from public.client_portal_links link
    where link.is_active = true
      and link.token = public.bridge_storage_request_header('x-bridge-client-portal-token')
      and (
        (
          coalesce((storage.foldername(p_name))[1], '') = 'client-portal'
          and coalesce((storage.foldername(p_name))[2], '') = link.transaction_id::text
          and coalesce(storage.filename(p_name), '') <> ''
        )
        or exists (
          select 1
          from public.matter_financial_accounts account
          where account.id::text = coalesce((storage.foldername(p_name))[3], '')
            and account.transaction_id = link.transaction_id
            and account.party_role = case
              when lower(coalesce((storage.foldername(p_name))[2], 'buyer')) in ('seller', 'selling') then 'seller'
              else 'buyer'
            end
            and account.portal_enabled = true
            and account.status = 'active'
            and coalesce((storage.foldername(p_name))[1], '') = 'matter-financial-proof'
            and coalesce(storage.filename(p_name), '') <> ''
        )
        or exists (
          select 1
          from public.matter_financial_document_requests request
          join public.matter_financial_accounts account
            on account.id = request.financial_account_id
          where account.id::text = coalesce((storage.foldername(p_name))[3], '')
            and request.id::text = coalesce((storage.foldername(p_name))[4], '')
            and account.transaction_id = link.transaction_id
            and request.transaction_id = link.transaction_id
            and account.party_role = case
              when lower(coalesce((storage.foldername(p_name))[2], 'buyer')) in ('seller', 'selling') then 'seller'
              else 'buyer'
            end
            and account.portal_enabled = true
            and account.status = 'active'
            and request.portal_visible = true
            and request.request_status not in ('complete', 'cancelled')
            and request.audience_role <> 'internal'
            and (request.audience_role = account.party_role or request.audience_role in ('client', 'shared'))
            and coalesce((storage.foldername(p_name))[1], '') = 'matter-financial-request-documents'
            and coalesce(storage.filename(p_name), '') <> ''
        )
        or exists (
          select 1
          from public.client_issues issue
          where issue.id::text = coalesce((storage.foldername(p_name))[2], '')
            and issue.transaction_id = link.transaction_id
            and coalesce((storage.foldername(p_name))[1], '') = 'client-issues'
            and coalesce(storage.filename(p_name), '') <> ''
        )
        or exists (
          select 1
          from public.alteration_requests alteration
          where alteration.id::text = coalesce((storage.foldername(p_name))[2], '')
            and alteration.transaction_id = link.transaction_id
            and coalesce((storage.foldername(p_name))[1], '') = 'alteration-requests'
            and coalesce(storage.filename(p_name), '') <> ''
        )
      )
  )
  or exists (
    select 1
    from public.transaction_onboarding onboarding
    where onboarding.is_active = true
      and onboarding.token = public.bridge_storage_request_header('x-bridge-onboarding-token')
      and coalesce((storage.foldername(p_name))[1], '') = 'onboarding'
      and coalesce((storage.foldername(p_name))[2], '') = onboarding.transaction_id::text
      and coalesce((storage.foldername(p_name))[3], '') <> ''
      and coalesce(storage.filename(p_name), '') <> ''
  );
$$;

create or replace function public.bridge_storage_buyer_portal_can_read(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public, storage
as $$
  select exists (
    select 1
    from public.client_portal_links link
    where link.is_active = true
      and link.token = public.bridge_storage_request_header('x-bridge-client-portal-token')
      and (
        public.bridge_storage_buyer_portal_can_write(p_name)
        or exists (
          select 1
          from public.documents document
          where document.transaction_id = link.transaction_id
            and document.file_path = p_name
            and coalesce(document.file_bucket, 'documents') = 'documents'
            and (
              coalesce(document.is_client_visible, false)
              or lower(coalesce(document.visibility_scope, '')) in ('shared', 'client')
            )
        )
      )
  )
  or exists (
    select 1
    from public.transaction_onboarding onboarding
    where onboarding.is_active = true
      and onboarding.token = public.bridge_storage_request_header('x-bridge-onboarding-token')
      and (
        (
          coalesce((storage.foldername(p_name))[1], '') = 'onboarding'
          and coalesce((storage.foldername(p_name))[2], '') = onboarding.transaction_id::text
          and coalesce((storage.foldername(p_name))[3], '') <> ''
          and coalesce(storage.filename(p_name), '') <> ''
        )
        or exists (
          select 1
          from public.documents document
          where document.transaction_id = onboarding.transaction_id
            and document.file_path = p_name
            and coalesce(document.file_bucket, 'documents') = 'documents'
            and (
              coalesce(document.is_client_visible, false)
              or lower(coalesce(document.visibility_scope, '')) in ('shared', 'client')
            )
        )
      )
  );
$$;

-- Keep the Documents metadata table in lock-step with Storage. Without this
-- guard, a portal token could create a client-visible Documents row pointing
-- at an unrelated object and use that metadata to mint a signed URL.
create or replace function public.bridge_storage_portal_document_row_can_write(
  p_transaction_id uuid,
  p_file_path text
)
returns boolean
language sql
stable
security definer
set search_path = public, storage
as $$
  select (
    public.bridge_has_client_portal_token_transaction_access(p_transaction_id)
    and coalesce((storage.foldername(p_file_path))[1], '') = 'client-portal'
    and coalesce((storage.foldername(p_file_path))[2], '') = p_transaction_id::text
    and coalesce(storage.filename(p_file_path), '') <> ''
  )
  or (
    public.bridge_has_onboarding_token_transaction_access(p_transaction_id)
    and coalesce((storage.foldername(p_file_path))[1], '') = 'onboarding'
    and coalesce((storage.foldername(p_file_path))[2], '') = p_transaction_id::text
    and coalesce((storage.foldername(p_file_path))[3], '') <> ''
    and coalesce(storage.filename(p_file_path), '') <> ''
  );
$$;

create or replace function public.bridge_storage_external_workspace_can_write(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, storage
as $$
declare
  v_access_id uuid;
  v_transaction_id uuid;
  v_access_token text := public.bridge_storage_request_header('x-bridge-external-access-token');
  v_access_segment text := coalesce((storage.foldername(p_name))[1], '');
  v_transaction_segment text := coalesce((storage.foldername(p_name))[2], '');
begin
  if v_access_segment !~ '^external-[0-9a-fA-F-]{36}$'
     or v_transaction_segment !~ '^transaction-[0-9a-fA-F-]{36}$'
     or v_access_token is null
     or coalesce(storage.filename(p_name), '') = '' then
    return false;
  end if;

  v_access_id := substring(v_access_segment from 10)::uuid;
  v_transaction_id := substring(v_transaction_segment from 13)::uuid;
  return exists (
    select 1
    from public.transaction_external_access access_link
    where access_link.id = v_access_id
      and access_link.access_token = v_access_token
      and coalesce(access_link.revoked, false) = false
      and (access_link.expires_at is null or access_link.expires_at >= now())
  )
  and public.bridge_has_external_workspace_transaction_access(v_transaction_id);
exception
  when others then
    return false;
end;
$$;

create or replace function public.bridge_storage_external_workspace_document_row_can_write(
  p_transaction_id uuid,
  p_file_path text
)
returns boolean
language sql
stable
security definer
set search_path = public, storage
as $$
  select public.bridge_storage_external_workspace_can_write(p_file_path)
    and coalesce((storage.foldername(p_file_path))[2], '') = 'transaction-' || p_transaction_id::text;
$$;

create or replace function public.bridge_storage_external_workspace_can_read(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.bridge_storage_external_workspace_can_write(p_name)
    or exists (
      select 1
      from public.documents document
      where document.file_path = p_name
        and coalesce(document.file_bucket, 'documents') = 'documents'
        and public.bridge_has_external_workspace_transaction_access(document.transaction_id)
        and (
          coalesce(document.is_client_visible, false)
          or lower(coalesce(document.visibility_scope, '')) in ('shared', 'client')
          or (
            lower(coalesce(public.bridge_external_workspace_role(), '')) in ('attorney', 'tuckers')
            and lower(coalesce(document.bucket_key, '')) in ('transfer', 'sale', 'buyer_fica', 'legal')
          )
          or (
            lower(coalesce(public.bridge_external_workspace_role(), '')) = 'bond_originator'
            and lower(coalesce(document.bucket_key, '')) in ('finance', 'buyer_fica', 'sale')
          )
        )
    );
$$;

create or replace function public.bridge_storage_commercial_portal_can_write(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, storage
as $$
declare
  v_root text := coalesce((storage.foldername(p_name))[1], '');
  v_access_id text := coalesce((storage.foldername(p_name))[2], '');
begin
  if v_root not in (
       'commercial-portal',
       'commercial-onboarding',
       'commercial-landlord-onboarding'
     )
     or v_access_id !~ '^[0-9a-fA-F-]{36}$'
     or coalesce(storage.filename(p_name), '') = '' then
    return false;
  end if;

  return exists (
    select 1
    from public.commercial_portal_access access_link
    left join public.commercial_portal_contacts contact
      on contact.id = access_link.contact_id
    where access_link.id::text = v_access_id
      and access_link.token = public.bridge_storage_request_header('x-bridge-commercial-portal-token')
      and access_link.status = 'active'
      and access_link.revoked_at is null
      and (access_link.expires_at is null or access_link.expires_at > now())
      and (
        v_root = 'commercial-portal'
        or (
          v_root = 'commercial-onboarding'
          and coalesce(contact.metadata ->> 'workflow', '') = 'commercial_onboarding'
        )
        or (
          v_root = 'commercial-landlord-onboarding'
          and access_link.portal_role = 'landlord'
          and exists (
            select 1
            from public.commercial_landlord_onboarding onboarding
            where onboarding.portal_access_id = access_link.id
              and onboarding.organisation_id = access_link.organisation_id
              and onboarding.landlord_id = access_link.landlord_id
              and (onboarding.expires_at is null or onboarding.expires_at > now())
          )
        )
      )
  );
exception
  when others then
    return false;
end;
$$;

create or replace function public.bridge_storage_commercial_portal_can_read(p_name text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, storage
as $$
  select public.bridge_storage_commercial_portal_can_write(p_name);
$$;

create or replace function public.bridge_storage_authenticated_commercial_can_write(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, storage
as $$
declare
  v_organisation_id uuid;
  v_entity_id uuid;
  v_entity_type text := lower(coalesce((storage.foldername(p_name))[3], ''));
  v_table text;
  v_record_organisation_id uuid;
  v_branch_id uuid;
  v_team_id uuid;
  v_broker_id uuid;
  v_created_by uuid;
begin
  if auth.uid() is null
     or coalesce((storage.foldername(p_name))[1], '') <> 'commercial'
     or coalesce((storage.foldername(p_name))[2], '') !~ '^[0-9a-fA-F-]{36}$'
     or v_entity_type = ''
     or coalesce((storage.foldername(p_name))[4], '') !~ '^[0-9a-fA-F-]{36}$'
     or coalesce(storage.filename(p_name), '') = '' then
    return false;
  end if;

  v_organisation_id := (storage.foldername(p_name))[2]::uuid;
  v_entity_id := (storage.foldername(p_name))[4]::uuid;
  v_table := case v_entity_type
    when 'commercial_company' then 'commercial_companies'
    when 'commercial_contact' then 'commercial_contacts'
    when 'commercial_landlord' then 'commercial_landlords'
    when 'commercial_tenant' then 'commercial_tenants'
    when 'commercial_property' then 'commercial_properties'
    when 'commercial_requirement' then 'commercial_requirements'
    when 'commercial_deal' then 'commercial_deals'
    when 'commercial_vacancy' then 'commercial_vacancies'
    when 'commercial_listing' then 'commercial_listings'
    when 'commercial_heads_of_terms' then 'commercial_heads_of_terms'
    when 'commercial_lease' then 'commercial_leases'
    when 'commercial_transaction' then 'commercial_transactions'
    else null
  end;

  if v_table is null then
    return false;
  end if;

  if v_entity_type in ('commercial_requirement', 'commercial_deal') then
    execute format(
      'select organisation_id, branch_id, team_id, coalesce(broker_id, assigned_broker), created_by from public.%I where id = $1',
      v_table
    )
    into v_record_organisation_id, v_branch_id, v_team_id, v_broker_id, v_created_by
    using v_entity_id;
  elsif v_entity_type = 'commercial_vacancy' then
    execute format(
      'select organisation_id, branch_id, team_id, coalesce(broker_id, broker_assignment), created_by from public.%I where id = $1',
      v_table
    )
    into v_record_organisation_id, v_branch_id, v_team_id, v_broker_id, v_created_by
    using v_entity_id;
  else
    execute format(
      'select organisation_id, branch_id, team_id, broker_id, created_by from public.%I where id = $1',
      v_table
    )
    into v_record_organisation_id, v_branch_id, v_team_id, v_broker_id, v_created_by
    using v_entity_id;
  end if;

  return v_record_organisation_id = v_organisation_id
    and public.bridge_commercial_can_access_record(
      v_record_organisation_id,
      v_branch_id,
      v_team_id,
      v_broker_id,
      v_created_by
    );
exception
  when others then
    return false;
end;
$$;

create or replace function public.bridge_storage_authenticated_mandate_can_write(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, storage
as $$
declare
  v_organisation_id uuid;
  v_packet_id uuid;
  v_packet_segment text := coalesce((storage.foldername(p_name))[3], '');
begin
  if auth.uid() is null
     or coalesce((storage.foldername(p_name))[1], '') <> 'mandates'
     or coalesce((storage.foldername(p_name))[2], '') !~ '^[0-9a-fA-F-]{36}$'
     or v_packet_segment !~ '^packet-[0-9a-fA-F-]{36}$'
     or coalesce((storage.foldername(p_name))[4], '') <> 'signed'
     or coalesce(storage.filename(p_name), '') = '' then
    return false;
  end if;

  v_organisation_id := (storage.foldername(p_name))[2]::uuid;
  v_packet_id := substring(v_packet_segment from 8)::uuid;
  return exists (
    select 1
    from public.document_packets packet
    where packet.id = v_packet_id
      and packet.organisation_id = v_organisation_id
      and public.bridge_can_access_legal_packet_h2(packet.id)
  );
exception
  when others then
    return false;
end;
$$;

create or replace function public.bridge_storage_authenticated_can_write(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, storage
as $$
declare
  v_root text := coalesce((storage.foldername(p_name))[1], '');
  v_second text := coalesce((storage.foldername(p_name))[2], '');
  v_transaction_id uuid;
  v_listing_id uuid;
  v_organisation_id uuid;
begin
  if auth.uid() is null then
    return false;
  end if;

  if v_root ~ '^transaction-[0-9a-fA-F-]{36}$' then
    return public.bridge_can_access_transaction_spine(substring(v_root from 13)::uuid);
  end if;

  if v_root in ('transaction-financial-invoices', 'matter-financial-documents')
     and v_second ~ '^[0-9a-fA-F-]{36}$' then
    v_transaction_id := v_second::uuid;
    return public.bridge_can_access_transaction_spine(v_transaction_id);
  end if;

  if v_root = 'private-listings'
     and v_second ~ '^[0-9a-fA-F-]{36}$' then
    v_listing_id := v_second::uuid;
    return public.bridge_can_access_private_listing(v_listing_id);
  end if;

  if v_root = 'alteration-requests'
     and v_second ~ '^[0-9a-fA-F-]{36}$'
     and coalesce(storage.filename(p_name), '') <> '' then
    select alteration.transaction_id
      into v_transaction_id
      from public.alteration_requests alteration
     where alteration.id = v_second::uuid;
    return v_transaction_id is not null
      and public.bridge_can_access_transaction_spine(v_transaction_id);
  end if;

  if v_root = 'commercial' then
    return public.bridge_storage_authenticated_commercial_can_write(p_name);
  end if;

  if v_root = 'mandates' then
    return public.bridge_storage_authenticated_mandate_can_write(p_name);
  end if;

  if v_root = 'organisations'
     and v_second ~ '^[0-9a-fA-F-]{36}$' then
    v_organisation_id := v_second::uuid;
    return public.bridge_is_active_member(v_organisation_id);
  end if;

  if v_root = 'attorney-firms'
     and v_second = auth.uid()::text
     and coalesce((storage.foldername(p_name))[3], '') = 'branding'
     and coalesce(storage.filename(p_name), '') <> '' then
    return true;
  end if;

  return false;
exception
  when others then
    return false;
end;
$$;

create or replace function public.bridge_storage_authenticated_can_read(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.bridge_storage_authenticated_can_write(p_name)
    or exists (
      select 1
      from public.documents document
      where document.file_path = p_name
        and coalesce(document.file_bucket, 'documents') = 'documents'
        and document.transaction_id is not null
        and public.bridge_can_access_transaction_spine(document.transaction_id)
    )
    or exists (
      select 1
    from public.private_listing_documents document
    where document.storage_path = p_name
      and public.bridge_can_access_private_listing(document.private_listing_id)
    )
    or exists (
      select 1
      from public.matter_financial_documents document
      where document.storage_path = p_name
        and public.bridge_can_access_transaction_spine(document.transaction_id)
    )
    or exists (
      select 1
      from public.client_issues issue
      where issue.photo_path = p_name
        and public.bridge_can_access_transaction_spine(issue.transaction_id)
    )
    or exists (
      select 1
      from public.alteration_requests alteration
      where p_name in (
        alteration.reference_image_path,
        alteration.invoice_path,
        alteration.proof_of_payment_path
      )
        and public.bridge_can_access_transaction_spine(alteration.transaction_id)
    );
$$;

revoke all on function public.bridge_storage_request_header(text) from public;
revoke all on function public.bridge_storage_seller_portal_listing_id() from public;
revoke all on function public.bridge_storage_seller_portal_can_write(text) from public;
revoke all on function public.bridge_storage_seller_portal_can_read(text) from public;
revoke all on function public.bridge_storage_buyer_portal_can_write(text) from public;
revoke all on function public.bridge_storage_buyer_portal_can_read(text) from public;
revoke all on function public.bridge_storage_portal_document_row_can_write(uuid, text) from public;
revoke all on function public.bridge_storage_external_workspace_can_write(text) from public;
revoke all on function public.bridge_storage_external_workspace_document_row_can_write(uuid, text) from public;
revoke all on function public.bridge_storage_external_workspace_can_read(text) from public;
revoke all on function public.bridge_storage_commercial_portal_can_write(text) from public;
revoke all on function public.bridge_storage_commercial_portal_can_read(text) from public;
revoke all on function public.bridge_storage_authenticated_commercial_can_write(text) from public;
revoke all on function public.bridge_storage_authenticated_mandate_can_write(text) from public;
revoke all on function public.bridge_storage_authenticated_can_write(text) from public;
revoke all on function public.bridge_storage_authenticated_can_read(text) from public;

grant execute on function public.bridge_storage_request_header(text) to anon, authenticated;
grant execute on function public.bridge_storage_seller_portal_listing_id() to anon, authenticated;
grant execute on function public.bridge_storage_seller_portal_can_write(text) to anon, authenticated;
grant execute on function public.bridge_storage_seller_portal_can_read(text) to anon, authenticated;
grant execute on function public.bridge_storage_buyer_portal_can_write(text) to anon, authenticated;
grant execute on function public.bridge_storage_buyer_portal_can_read(text) to anon, authenticated;
grant execute on function public.bridge_storage_portal_document_row_can_write(uuid, text) to anon, authenticated;
grant execute on function public.bridge_storage_external_workspace_can_write(text) to anon, authenticated;
grant execute on function public.bridge_storage_external_workspace_document_row_can_write(uuid, text) to anon, authenticated;
grant execute on function public.bridge_storage_external_workspace_can_read(text) to anon, authenticated;
grant execute on function public.bridge_storage_commercial_portal_can_write(text) to anon, authenticated;
grant execute on function public.bridge_storage_commercial_portal_can_read(text) to anon, authenticated;
grant execute on function public.bridge_storage_authenticated_commercial_can_write(text) to authenticated;
grant execute on function public.bridge_storage_authenticated_mandate_can_write(text) to authenticated;
grant execute on function public.bridge_storage_authenticated_can_write(text) to authenticated;
grant execute on function public.bridge_storage_authenticated_can_read(text) to authenticated;

-- Remove the dashboard-only bucket-wide access before installing the scoped
-- policies. There is deliberately no UPDATE or DELETE grant for portal tokens:
-- portal uploads use timestamped names and upsert:false.
drop policy if exists documents_insert_anon_auth on storage.objects;
drop policy if exists documents_select_anon_auth on storage.objects;

drop policy if exists documents_portal_anon_insert on storage.objects;
create policy documents_portal_anon_insert
on storage.objects
for insert
to anon
with check (
  bucket_id = 'documents'
  and (
    public.bridge_storage_buyer_portal_can_write(name)
    or public.bridge_storage_seller_portal_can_write(name)
    or public.bridge_storage_external_workspace_can_write(name)
    or public.bridge_storage_commercial_portal_can_write(name)
  )
);

drop policy if exists documents_portal_anon_select on storage.objects;
create policy documents_portal_anon_select
on storage.objects
for select
to anon
using (
  bucket_id = 'documents'
  and (
    public.bridge_storage_buyer_portal_can_read(name)
    or public.bridge_storage_seller_portal_can_read(name)
    or public.bridge_storage_external_workspace_can_read(name)
    or public.bridge_storage_commercial_portal_can_read(name)
  )
);

drop policy if exists documents_authenticated_scoped_insert on storage.objects;
create policy documents_authenticated_scoped_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'documents'
  and (
    public.bridge_storage_authenticated_can_write(name)
    or public.bridge_storage_buyer_portal_can_write(name)
    or public.bridge_storage_seller_portal_can_write(name)
    or public.bridge_storage_external_workspace_can_write(name)
    or public.bridge_storage_commercial_portal_can_write(name)
  )
);

drop policy if exists documents_authenticated_scoped_select on storage.objects;
create policy documents_authenticated_scoped_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'documents'
  and (
    public.bridge_storage_authenticated_can_read(name)
    or public.bridge_storage_buyer_portal_can_read(name)
    or public.bridge_storage_seller_portal_can_read(name)
    or public.bridge_storage_external_workspace_can_read(name)
    or public.bridge_storage_commercial_portal_can_read(name)
  )
);

-- Authenticated workflows use upsert for selected internal document surfaces.
-- Portal clients intentionally do not receive UPDATE or DELETE capability.
drop policy if exists documents_authenticated_scoped_update on storage.objects;
create policy documents_authenticated_scoped_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'documents'
  and public.bridge_storage_authenticated_can_write(name)
)
with check (
  bucket_id = 'documents'
  and public.bridge_storage_authenticated_can_write(name)
);

drop policy if exists documents_authenticated_scoped_delete on storage.objects;
create policy documents_authenticated_scoped_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'documents'
  and public.bridge_storage_authenticated_can_write(name)
);

-- The legacy token policies restricted only the transaction ID. PostgreSQL
-- combines permissive policies with OR, so replace them rather than adding a
-- second policy: metadata must point only at an object path the bearer token
-- itself can address.
drop policy if exists documents_insert_token_scoped on public.documents;
create policy documents_insert_token_scoped
on public.documents
for insert
to anon, authenticated
with check (
  public.bridge_storage_portal_document_row_can_write(transaction_id, file_path)
);

drop policy if exists documents_update_token_scoped on public.documents;
create policy documents_update_token_scoped
on public.documents
for update
to anon, authenticated
using (
  public.bridge_storage_portal_document_row_can_write(transaction_id, file_path)
)
with check (
  public.bridge_storage_portal_document_row_can_write(transaction_id, file_path)
);

drop policy if exists documents_insert_external_token_scoped on public.documents;
create policy documents_insert_external_token_scoped
on public.documents
for insert
to anon, authenticated
with check (
  public.bridge_storage_external_workspace_document_row_can_write(transaction_id, file_path)
);

drop policy if exists documents_update_external_token_scoped on public.documents;
create policy documents_update_external_token_scoped
on public.documents
for update
to anon, authenticated
using (
  public.bridge_storage_external_workspace_document_row_can_write(transaction_id, file_path)
)
with check (
  public.bridge_storage_external_workspace_document_row_can_write(transaction_id, file_path)
);

comment on function public.bridge_storage_seller_portal_listing_id() is
  'Resolves the active seller portal token and, once configured, its active password session for Storage RLS.';
comment on function public.bridge_storage_buyer_portal_can_write(text) is
  'Permits only buyer/onboarding portal object paths that belong to the bearer token transaction.';
comment on function public.bridge_storage_buyer_portal_can_read(text) is
  'Permits buyer/onboarding Storage reads only for owned portal paths or client-visible transaction documents.';

commit;
