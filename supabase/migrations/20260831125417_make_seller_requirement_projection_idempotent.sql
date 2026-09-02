begin;

-- The canonical transaction source can legitimately contain more than one
-- instance for a document definition (for example an OTP per buyer party).
-- The legacy seller portal projection is intentionally one row per listing
-- and requirement key, so repeated keys must collapse instead of aborting the
-- atomic seller handoff.
create or replace function public.bridge_ignore_duplicate_transaction_requirement_projection()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if coalesce(new.generated_from ->> 'source', '') = 'transaction_requirement_projection'
     and exists (
       select 1
       from public.private_listing_document_requirements existing
       where existing.private_listing_id = new.private_listing_id
         and existing.requirement_key = new.requirement_key
     ) then
    return null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_000_ignore_duplicate_transaction_requirement_projection
  on public.private_listing_document_requirements;
create trigger trg_000_ignore_duplicate_transaction_requirement_projection
before insert on public.private_listing_document_requirements
for each row execute function public.bridge_ignore_duplicate_transaction_requirement_projection();

revoke all on function public.bridge_ignore_duplicate_transaction_requirement_projection()
  from public, anon, authenticated;

comment on function public.bridge_ignore_duplicate_transaction_requirement_projection() is
  'Collapses duplicate canonical keys only in the legacy private-seller portal projection; canonical requirement instances remain unchanged.';

commit;
