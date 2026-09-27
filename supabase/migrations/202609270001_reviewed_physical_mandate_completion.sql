-- A reviewed wet-ink mandate becomes signed only when its persisted upload is
-- approved. The existing review RPC performs this status change in one
-- transaction, so the listing and document cannot disagree after approval.
alter table public.private_listing_documents
  add column if not exists reviewed_signing_version_id uuid,
  add column if not exists reviewed_signing_version_digest text;

alter table public.private_listing_documents
  drop constraint if exists private_listing_documents_reviewed_signing_version_pair;
alter table public.private_listing_documents
  add constraint private_listing_documents_reviewed_signing_version_pair
  check ((reviewed_signing_version_id is null) = (reviewed_signing_version_digest is null));

create or replace function public.bridge_complete_reviewed_physical_mandate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.document_type <> 'signed_mandate'
     or new.requirement_id is null
     or new.reviewed_signing_version_id is null
     or new.reviewed_signing_version_digest is null
     or new.status <> 'approved'
     or old.status = 'approved'
     or nullif(trim(coalesce(new.storage_path, '')), '') is null
  then
    return new;
  end if;

  update public.private_listings listing
     set mandate_status = 'signed_uploaded',
         listing_status = case
           when lower(coalesce(listing.listing_status, '')) in
             ('active', 'listing_active', 'in_progress', 'live', 'published',
              'under_offer', 'transaction_created', 'sold', 'finalised', 'finalized')
           then listing.listing_status
           else 'mandate_signed'
         end
   where listing.id = new.private_listing_id
     and lower(coalesce(listing.mandate_status, '')) not in
       ('signed', 'signed_uploaded', 'uploaded_signed', 'fully_signed', 'completed');

  return new;
end;
$$;

drop trigger if exists bridge_complete_reviewed_physical_mandate on public.private_listing_documents;
create trigger bridge_complete_reviewed_physical_mandate
after update of status on public.private_listing_documents
for each row
execute function public.bridge_complete_reviewed_physical_mandate();
