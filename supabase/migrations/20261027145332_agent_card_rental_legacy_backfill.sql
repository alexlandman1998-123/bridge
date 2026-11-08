begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Retired agents can still have saved cards. The existing relationship validator
-- rejects any update to those old rows, even when assignments are unchanged.
-- Lock the table so no other writer can bypass validation during this strictly
-- scoped, one-column backfill. CHECK constraints and every other trigger remain.
lock table public.agency_public_intake_links in access exclusive mode;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_trigger
    where tgrelid = 'public.agency_public_intake_links'::regclass
      and tgname = 'trg_bridge_validate_agency_public_intake_link'
      and tgfoid = 'public.bridge_validate_agency_public_intake_link()'::regprocedure
      and tgenabled = 'O' and not tgisinternal
  ) then
    raise exception 'Expected active agency intake relationship validator is missing';
  end if;
end;
$$;

alter table public.agency_public_intake_links
  disable trigger trg_bridge_validate_agency_public_intake_link;

update public.agency_public_intake_links
set enabled_intents = array_append(enabled_intents, 'rent')
where metadata_json->>'surface' = 'agent_digital_card'
  and not ('rent' = any(enabled_intents));

alter table public.agency_public_intake_links
  enable trigger trg_bridge_validate_agency_public_intake_link;

commit;
