begin;
-- Retain the original seller audience when their upload becomes a transaction file.
-- Match the exact source, listing, object and seller-visible record before changing it.
create or replace function document_security.retain_seller_upload_audience()
returns trigger language plpgsql security definer set search_path='' as $audience$
begin
 if new.source='seller_portal' and new.uploaded_by_party='seller' and exists(
  select 1 from public.private_listing_documents original join public.transactions t
   on t.id=new.transaction_id and t.listing_id=original.private_listing_id
  where original.id=new.source_document_id and original.storage_path=new.file_path
   and coalesce(new.file_bucket,'documents')='documents'
   and lower(coalesce(original.visibility,'')) in ('seller_visible','shared','client_visible')
 ) then
  new.visibility_scope:='shared';new.client_recipient_role:='seller';new.is_client_visible:=true;
 end if;
 return new;
end $audience$;
revoke all on function document_security.retain_seller_upload_audience() from public,anon,authenticated;
drop trigger if exists retain_seller_upload_audience on public.documents;
create trigger retain_seller_upload_audience before insert or update on public.documents
 for each row execute function document_security.retain_seller_upload_audience();
notify pgrst,'reload schema';
commit;
