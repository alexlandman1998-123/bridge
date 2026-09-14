begin;

-- Generated columns are populated after BEFORE triggers. Derive the sender
-- domain from the source email here so a mismatched domain link is rejected on
-- both inserts and updates.
create or replace function public.email_sender_identity_enforce_sending_domain()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  linked_domain public.email_sending_domains%rowtype;
  sender_domain text := split_part(lower(btrim(new.from_email)), '@', 2);
begin
  if new.email_sending_domain_id is null then
    return new;
  end if;

  select * into linked_domain
  from public.email_sending_domains
  where id = new.email_sending_domain_id;

  if not found
    or linked_domain.organisation_id <> new.organisation_id
    or linked_domain.provider <> new.provider
    or linked_domain.domain_name <> sender_domain then
    raise exception 'Sender identity must be linked to its organisation’s matching sending domain.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.email_sender_identity_enforce_sending_domain() from public, anon, authenticated;

commit;
