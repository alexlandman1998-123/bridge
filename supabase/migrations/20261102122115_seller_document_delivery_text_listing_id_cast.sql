-- client_portal_contexts.listing_id is text while notification_events.listing_id is uuid.
-- Cast only the trigger lookup value so a queued seller reminder can be routed.
begin;

do $migration$
declare
  definition text;
  old_comparison text := 'where listing_id = new.listing_id';
  new_comparison text := 'where listing_id = new.listing_id::text';
  function_signature text := 'public.bridge_route_seller_document_delivery_phase7()';
begin
  if (select data_type
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'client_portal_contexts'
        and column_name = 'listing_id') is distinct from 'text' then
    raise exception 'Expected client_portal_contexts.listing_id to be text. Review the current schema before applying.';
  end if;

  if (select data_type
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'notification_events'
        and column_name = 'listing_id') is distinct from 'uuid' then
    raise exception 'Expected notification_events.listing_id to be uuid. Review the current schema before applying.';
  end if;

  definition := pg_get_functiondef(to_regprocedure(function_signature));
  if definition is null
    or (length(definition) - length(replace(definition, old_comparison, ''))) / length(old_comparison) <> 1 then
    raise exception 'Unexpected seller document routing lookup in %. Review the function before applying.', function_signature;
  end if;

  execute replace(definition, old_comparison, new_comparison);
end;
$migration$;

commit;
