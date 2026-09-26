begin;

-- The rental classifier runs before every lead insert, including seller leads.
-- enquired_listing_id is uuid while the legacy listing_id column is text;
-- coalesce(uuid, text) fails before the agency/rental guard can run. Preserve
-- the deployed function body and replace only that unsafe assignment.
do $fix_rental_listing_id_type$
declare
  v_definition text;
  v_old text := 'v_listing_id := coalesce(new.enquired_listing_id, new.listing_id);';
  v_new text := 'v_listing_id := new.enquired_listing_id;
  if v_listing_id is null and new.listing_id ~* ''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'' then
    v_listing_id := new.listing_id::uuid;
  end if;';
begin
  select pg_catalog.pg_get_functiondef('public.classify_new_rental_lead()'::regprocedure)
    into v_definition;

  if pg_catalog.strpos(v_definition, v_old) = 0 then
    if pg_catalog.strpos(v_definition, v_new) > 0 then
      return;
    end if;
    raise exception 'Rental lead classifier changed; review the listing id type fix.';
  end if;

  execute pg_catalog.replace(v_definition, v_old, v_new);
end;
$fix_rental_listing_id_type$;

commit;
