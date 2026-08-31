-- Keep the retired compatibility table immutable to direct callers while allowing
-- PostgreSQL's nested foreign-key actions (for example auth.users ON DELETE SET
-- NULL) to preserve referential integrity.
create or replace function public.bridge_reject_legacy_partner_connection_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if pg_trigger_depth() > 1 then
    return null;
  end if;

  raise exception 'partner_connections is retired; write organisation_partners through the canonical relationship RPCs.'
    using errcode = '55000';
end;
$$;

comment on function public.bridge_reject_legacy_partner_connection_write() is
  'Rejects direct writes to retired partner_connections while permitting nested FK maintenance.';
