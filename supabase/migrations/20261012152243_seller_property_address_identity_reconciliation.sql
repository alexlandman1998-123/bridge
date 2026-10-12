-- A formatted street line may already contain suburb/city/country. Appending
-- locality fields again must not retire the mandate for the same property.
begin;
do $migration$
declare
  definition text;
  start_pos integer;
  end_pos integer;
  replacement text := $replacement$
  v_property_changed := case
    when v_place_id is not null and nullif(pg_catalog.btrim(v_listing.google_place_id), '') is not null
      then v_place_id <> nullif(pg_catalog.btrim(v_listing.google_place_id), '')
    when v_address is not null and exists (
      select 1 from unnest(array[v_listing.address_line_1, v_listing.street_address, v_existing_address]) candidate
      where nullif(pg_catalog.btrim(candidate), '') is not null
        and pg_catalog.regexp_replace(pg_catalog.lower(v_address), '[^a-z0-9]+', '', 'g')
          = pg_catalog.regexp_replace(pg_catalog.lower(candidate), '[^a-z0-9]+', '', 'g')
    ) then false
    when nullif(pg_catalog.btrim(v_form->>'city'), '') is not null
      and nullif(pg_catalog.btrim(v_listing.city), '') is not null
      and nullif(pg_catalog.btrim(v_address_line_1), '') is not null
      and nullif(pg_catalog.btrim(v_listing.address_line_1), '') is not null
      and pg_catalog.regexp_replace(pg_catalog.lower(pg_catalog.split_part(v_address_line_1, ',', 1)), '[^a-z0-9]+', '', 'g')
        = pg_catalog.regexp_replace(pg_catalog.lower(pg_catalog.split_part(v_listing.address_line_1, ',', 1)), '[^a-z0-9]+', '', 'g')
      and pg_catalog.regexp_replace(pg_catalog.lower(v_form->>'city'), '[^a-z0-9]+', '', 'g')
        = pg_catalog.regexp_replace(pg_catalog.lower(v_listing.city), '[^a-z0-9]+', '', 'g')
      and not exists (
        select 1 from (values
          (v_form->>'suburb', v_listing.suburb),
          (v_form->>'province', v_listing.province),
          (v_form->>'postalCode', v_listing.postal_code),
          (v_address_line_2, v_listing.address_line_2)
        ) locality(incoming, saved)
        where nullif(pg_catalog.btrim(incoming), '') is not null
          and pg_catalog.regexp_replace(pg_catalog.lower(incoming), '[^a-z0-9]+', '', 'g')
            is distinct from pg_catalog.regexp_replace(pg_catalog.lower(coalesce(saved, '')), '[^a-z0-9]+', '', 'g')
      ) then false
    when v_address is not null and v_existing_address is not null
      then pg_catalog.regexp_replace(pg_catalog.lower(v_address), '[^a-z0-9]+', '', 'g')
        <> pg_catalog.regexp_replace(pg_catalog.lower(v_existing_address), '[^a-z0-9]+', '', 'g')
    else false
  end;

$replacement$;
begin
  definition := pg_get_functiondef('private.bridge_reconcile_listing_from_completed_seller_onboarding()'::regprocedure);
  start_pos := strpos(definition, '  v_property_changed := case');
  end_pos := strpos(definition, '  if coalesce(v_form->>''latitude''');
  if start_pos = 0 or end_pos <= start_pos or definition like '%locality(incoming, saved)%' then
    raise exception 'Unexpected seller property reconciliation function. Review before applying.';
  end if;
  execute substr(definition, 1, start_pos - 1) || replacement || substr(definition, end_pos);
end;
$migration$;
commit;
