begin;

-- A stable key makes retries of the same internal document upload safe. The
-- partial index keeps existing historical document rows untouched.
alter table if exists public.documents
  add column if not exists upload_idempotency_key text,
  add column if not exists file_bucket text;

create unique index if not exists documents_transaction_upload_idempotency_key_unique
  on public.documents (transaction_id, upload_idempotency_key)
  where upload_idempotency_key is not null;

-- Operational reconciliation for objects that pre-date rollback handling. The
-- function is deliberately limited to a transaction the caller can access and
-- to the documents bucket; it cannot be used to enumerate arbitrary storage.
create or replace function public.bridge_list_orphaned_transaction_document_objects(
  p_transaction_id uuid
)
returns table (
  bucket_id text,
  file_path text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, storage
as $$
begin
  if p_transaction_id is null
    or not public.bridge_can_access_transaction_org_member(p_transaction_id) then
    raise exception 'You do not have access to this transaction.' using errcode = '42501';
  end if;

  return query
  select
    object.bucket_id::text,
    object.name::text,
    object.created_at
  from storage.objects object
  where object.bucket_id = 'documents'
    and object.name like ('transaction-' || p_transaction_id::text || '/%')
    and not exists (
      select 1
      from public.documents document
      where document.file_path = object.name
        and coalesce(nullif(document.file_bucket, ''), 'documents') = object.bucket_id
    )
  order by object.created_at asc;
end;
$$;

revoke all on function public.bridge_list_orphaned_transaction_document_objects(uuid) from public;
revoke all on function public.bridge_list_orphaned_transaction_document_objects(uuid) from anon;
grant execute on function public.bridge_list_orphaned_transaction_document_objects(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
