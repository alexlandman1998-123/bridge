begin;

-- One signer prepares shared seller facts. Every signer still receives and
-- signs the same frozen pack, but secondary signers cannot overwrite shared
-- disclosure/FICA fields through their own tokenised session.
alter table public.private_listing_mandate_signing_sessions
  add column if not exists is_primary_document_contact boolean not null default true,
  add column if not exists primary_document_contact_email text;

update public.private_listing_mandate_signing_sessions
set primary_document_contact_email = lower(signer_email)
where signing_group_id is null
  and primary_document_contact_email is null;

-- Existing multi-signer packs predate this field and therefore receive the
-- default `true` on every row. Retain the oldest link as the designated
-- contact before creating the one-primary invariant.
with ranked_groups as (
  select id, signer_email,
    row_number() over (partition by signing_group_id order by created_at, id) as position
  from public.private_listing_mandate_signing_sessions
  where signing_group_id is not null
), primary_contacts as (
  select distinct on (signing_group_id) signing_group_id, signer_email
  from public.private_listing_mandate_signing_sessions
  where signing_group_id is not null
  order by signing_group_id, created_at, id
)
update public.private_listing_mandate_signing_sessions as session
set is_primary_document_contact = ranked_groups.position = 1,
    primary_document_contact_email = lower(primary_contacts.signer_email)
from ranked_groups
join primary_contacts on primary_contacts.signing_group_id = (
  select signing_group_id from public.private_listing_mandate_signing_sessions where id = ranked_groups.id
)
where session.id = ranked_groups.id;

create unique index if not exists private_listing_signing_group_one_primary_contact_idx
  on public.private_listing_mandate_signing_sessions (signing_group_id)
  where signing_group_id is not null and is_primary_document_contact;

create or replace function public.bridge_validate_listing_signing_primary_document_contact()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.signer_email := lower(trim(new.signer_email));
  new.primary_document_contact_email := lower(trim(coalesce(new.primary_document_contact_email, new.signer_email)));
  if new.is_primary_document_contact then
    new.primary_document_contact_email := new.signer_email;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validate_listing_signing_primary_document_contact on public.private_listing_mandate_signing_sessions;
create trigger trg_validate_listing_signing_primary_document_contact
before insert or update of signer_email, is_primary_document_contact, primary_document_contact_email
on public.private_listing_mandate_signing_sessions
for each row execute function public.bridge_validate_listing_signing_primary_document_contact();

comment on column public.private_listing_mandate_signing_sessions.is_primary_document_contact is
  'Only this signer may submit shared seller/FICA/disclosure changes before the pack is frozen for all signers.';
comment on column public.private_listing_mandate_signing_sessions.primary_document_contact_email is
  'Frozen email identity of the primary document contact for this signing pack.';

commit;
