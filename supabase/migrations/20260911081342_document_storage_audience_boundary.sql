-- Staging ledger version: 20260911081342. Production has not been changed.
-- Audience is an AND boundary: permissive legacy matter policies cannot bypass it.
-- Private definers inspect protected assignments/documents without RLS recursion.
-- Portal branches validate scoped tokens; they deliberately do not require auth.uid().
create schema if not exists document_security;
revoke all on schema document_security from public;
grant usage on schema document_security to anon, authenticated;

create or replace function document_security.can_upload(p_transaction uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    public.bridge_can_mutate_attorney_lane(p_transaction, 'transfer_attorney', 'documents')
    or public.bridge_can_mutate_attorney_lane(p_transaction, 'bond_attorney', 'documents')
    or public.bridge_can_mutate_attorney_lane(p_transaction, 'cancellation_attorney', 'documents')
    or public.bridge_can_access_transaction_org_member(p_transaction)
    or exists (select 1 from public.transaction_participants p
      where p.transaction_id=p_transaction and p.user_id=auth.uid()
        and p.status='active' and p.removed_at is null and p.can_upload_documents is true)
  );
$$;

create or replace function document_security.can_read(d public.documents)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  scope text := lower(coalesce(d.visibility_scope, 'internal'));
  recipient text := lower(coalesce(d.client_recipient_role, ''));
  professional boolean := auth.uid() is not null
    and journey_private.can_read_professional_journey(d.transaction_id);
begin
  if d.transaction_id is null then return false; end if;
  if scope in ('internal','internal_only','admin_only') then
    return professional and (
      d.uploaded_by_user_id=auth.uid()
      or public.bridge_can_mutate_attorney_lane(d.transaction_id,'transfer_attorney','documents')
      or public.bridge_can_mutate_attorney_lane(d.transaction_id,'bond_attorney','documents')
      or public.bridge_can_mutate_attorney_lane(d.transaction_id,'cancellation_attorney','documents')
    );
  end if;
  if scope not in ('shared','client','client_visible','professional_shared','shared_role_players') then return false; end if;
  if professional then return true; end if;
  if public.bridge_has_external_workspace_transaction_access(d.transaction_id)
    and lower(coalesce(public.bridge_external_workspace_role(),'')) in ('attorney','tuckers','bond_originator','agent','developer') then return true; end if;
  if d.source='developer_document_portal' and exists (
    select 1 from public.bridge_developer_document_portal_active_link() link
    where link.transaction_id=d.transaction_id and link.id is not null
  ) then return true; end if;
  if scope in ('professional_shared','shared_role_players') then return false; end if;
  if recipient not in ('','buyer','seller','both','all','client','shared') then return false; end if;
  if recipient not in ('seller') and (
    public.bridge_has_client_portal_token_transaction_access(d.transaction_id)
    or public.bridge_has_onboarding_token_transaction_access(d.transaction_id)
  ) then return true; end if;
  if recipient not in ('buyer') and exists (
    select 1 from public.transactions t where t.id=d.transaction_id
      and t.listing_id=public.bridge_storage_seller_portal_listing_id()
  ) then return true; end if;
  return false;
end;
$$;

create or replace function document_security.object_allowed(p_bucket text, p_name text, p_write boolean default false)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  d public.documents;
  linked boolean := false;
  root text := split_part(p_name,'/',1);
begin
  for d in select * from public.documents
    where file_path=p_name and coalesce(file_bucket,'documents')=p_bucket
      and transaction_id is not null
  loop
    linked := true;
    -- If multiple records link the same bytes, enforce every audience, not any.
    if not coalesce(document_security.can_read(d),false) then return false; end if;
    if p_write and auth.uid() is not null
      and not document_security.can_upload(d.transaction_id) then return false; end if;
  end loop;
  if linked then return true; end if;
  -- Upload-before-metadata is allowed only for actual document writers, not viewers.
  if p_bucket='documents' and root ~ '^transaction-[0-9a-fA-F-]{36}$' then
    return document_security.can_upload(substring(root from 13)::uuid);
  end if;
  return true; -- Other storage surfaces retain their existing scoped policies.
exception when invalid_text_representation then return false;
end;
$$;

revoke all on all functions in schema document_security from public;
grant execute on all functions in schema document_security to anon,authenticated;

drop policy if exists documents_audience_boundary on public.documents;
create policy documents_audience_boundary on public.documents as restrictive for select to anon,authenticated
using (transaction_id is null or document_security.can_read(documents));
drop policy if exists documents_audience_scoped_read on public.documents;
create policy documents_audience_scoped_read on public.documents for select to anon,authenticated
using (document_security.can_read(documents));

drop policy if exists documents_upload_capability_insert on public.documents;
create policy documents_upload_capability_insert on public.documents as restrictive for insert to authenticated
with check (transaction_id is null or document_security.can_upload(transaction_id));
drop policy if exists documents_upload_capability_update on public.documents;
create policy documents_upload_capability_update on public.documents as restrictive for update to authenticated
using (transaction_id is null or document_security.can_upload(transaction_id))
with check (transaction_id is null or document_security.can_upload(transaction_id));

drop policy if exists document_object_audience_read on storage.objects;
create policy document_object_audience_read on storage.objects as restrictive for select to anon,authenticated
using (document_security.object_allowed(bucket_id,name));
-- Enables correctly scoped seller reads which the old path-only policy omitted.
drop policy if exists document_object_linked_read on storage.objects;
create policy document_object_linked_read on storage.objects for select to anon,authenticated
using (exists (select 1 from public.documents d where d.file_path=objects.name
  and coalesce(d.file_bucket,'documents')=objects.bucket_id and d.transaction_id is not null
  and document_security.can_read(d)));
drop policy if exists document_object_capability_insert on storage.objects;
create policy document_object_capability_insert on storage.objects as restrictive for insert to anon,authenticated
with check (document_security.object_allowed(bucket_id,name,true));
drop policy if exists document_object_capability_update on storage.objects;
create policy document_object_capability_update on storage.objects as restrictive for update to anon,authenticated
using (document_security.object_allowed(bucket_id,name,true))
with check (document_security.object_allowed(bucket_id,name,true));
drop policy if exists document_object_capability_delete on storage.objects;
create policy document_object_capability_delete on storage.objects as restrictive for delete to anon,authenticated
using (document_security.object_allowed(bucket_id,name,true));

-- These definer projections bypass table RLS: apply the same audience explicitly.
-- Exact guarded replacements retain each established token and requirement check.
do $patch$
declare definition text;
begin
  select pg_get_functiondef('public.bridge_client_portal_canonical_document_projection()'::regprocedure) into definition;
  if position('document_security.can_read(document_row)' in definition)=0 then
    if position('and coalesce(document_row.is_client_visible, false) is true' in definition)=0 then
      raise exception 'Buyer projection changed; review audience patch';
    end if;
    definition := replace(definition,
      'and coalesce(document_row.is_client_visible, false) is true',
      'and document_security.can_read(document_row) and coalesce(document_row.is_client_visible, false) is true');
    execute definition;
  end if;
  select pg_get_functiondef('public.bridge_developer_document_portal_payload()'::regprocedure) into definition;
  if position('document_security.can_read(document)' in definition)=0 then
    if position('and document.source = ''developer_document_portal''' in definition)=0 then
      raise exception 'Developer projection changed; review audience patch';
    end if;
    definition := replace(definition,
      'and document.source = ''developer_document_portal''',
      'and document_security.can_read(document) and document.source = ''developer_document_portal''');
    execute definition;
  end if;
end;
$patch$;
