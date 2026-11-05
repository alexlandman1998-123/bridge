-- Preserve the exact current registration proof. Corrections use a new file
-- and explicitly replace the transaction's proof reference; no backfill.
create function document_security.registered_confirmation_object(p_bucket text,p_path text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.transactions t join public.documents d
 on d.id=t.registration_confirmation_document_id and d.transaction_id=t.id
 where t.registered_at is not null and coalesce(d.file_bucket,'documents')=p_bucket and d.file_path=p_path);
$$;
revoke all on function document_security.registered_confirmation_object(text,text) from public;
grant execute on function document_security.registered_confirmation_object(text,text) to anon,authenticated;
create policy registered_confirmation_object_delete_retention on storage.objects
as restrictive for delete to anon,authenticated
using(not document_security.registered_confirmation_object(bucket_id,name));
create policy registered_confirmation_object_update_retention on storage.objects
as restrictive for update to anon,authenticated
using(not document_security.registered_confirmation_object(bucket_id,name))
with check(not document_security.registered_confirmation_object(bucket_id,name));

create function journey_private.guard_registered_confirmation_document()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.transactions t where t.registered_at is not null
   and t.registration_confirmation_document_id=old.id) then
   if tg_op='DELETE' then return old; else return new; end if;
 end if;
 if tg_op='DELETE' then
   raise exception 'Replace the transaction registration proof before removing its document.' using errcode='23514';
 end if;
 if (new.id,new.transaction_id,new.file_bucket,new.file_path) is distinct from
    (old.id,old.transaction_id,old.file_bucket,old.file_path)
    or not journey_private.is_registration_confirmation_document(new)
    or lower(coalesce(new.status,'')) in ('deleted','removed','failed','missing','rejected') then
   raise exception 'Saved registration proof must retain its file and document identity. Upload and select a replacement instead.' using errcode='23514';
 end if;
 return new;
end;
$$;
revoke all on function journey_private.guard_registered_confirmation_document() from public,anon,authenticated;
create trigger guard_registered_confirmation_document before update or delete on public.documents
for each row execute function journey_private.guard_registered_confirmation_document();
