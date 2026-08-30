begin;

do $migration$
declare
  v_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'private.bridge_reconcile_listing_from_completed_seller_onboarding()'::pg_catalog.regprocedure
  ) into v_definition;

  if v_definition is null then
    raise exception 'Seller listing reconciliation function is missing.';
  end if;

  v_definition := pg_catalog.replace(v_definition, 'pg_catalog.coalesce', 'coalesce');
  execute v_definition;
end;
$migration$;

commit;
