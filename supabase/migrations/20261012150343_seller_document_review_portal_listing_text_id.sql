-- Portal contexts store listing identifiers as text. Keep UUID ownership and
-- document checks intact; convert only the identifier used by this email lookup.
begin;
do $migration$
declare
  signature text;
  definition text;
  old_comparison text := 'row_data.listing_id = v_listing.id and row_data.context_type';
  new_comparison text := 'row_data.listing_id = v_listing.id::text and row_data.context_type';
begin
  if (select data_type from information_schema.columns
      where table_schema = 'public' and table_name = 'client_portal_contexts' and column_name = 'listing_id')
      is distinct from 'text' then
    raise exception 'Expected client_portal_contexts.listing_id to be text. Review the current schema before applying.';
  end if;
  foreach signature in array array[
    'public.bridge_review_private_listing_seller_document_p1_8(uuid,text,text,integer)',
    'public.bridge_send_seller_document_manual_reminder_p1_8(uuid,text)'
  ] loop
    definition := pg_get_functiondef(to_regprocedure(signature));
    if definition is null or (length(definition) - length(replace(definition, old_comparison, ''))) / length(old_comparison) <> 1 then
      raise exception 'Unexpected seller portal email lookup for %. Review the current function before applying.', signature;
    end if;
    execute replace(definition, old_comparison, new_comparison);
  end loop;
end;
$migration$;
commit;
