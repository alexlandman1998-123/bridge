begin;

-- Extend only the public snapshot. Existing membership, sharing, row locks,
-- deletion and media checks remain in the deployed commit functions.
do $migration$
declare
  v_signature text;
  v_definition text;
  v_marker text := '''listing_type'', v_projection.listing_type';
  v_status text := '''listing_type'', v_projection.listing_type,
    ''listing_status'', case when v_projection.listing_type = ''Sale'' and v_listing.listing_status in (''under_offer'', ''sold'')
      then v_listing.listing_status else ''active'' end';
begin
  foreach v_signature in array array[
    'public.website_commit_listing_publication(uuid,text,uuid,text)',
    'public.website_commit_partner_listing_publication(uuid,uuid,text,uuid,text,jsonb)'
  ] loop
    v_definition := pg_get_functiondef(v_signature::regprocedure);
    if position(v_marker in v_definition) = 0 or position('''listing_status''' in v_definition) > 0 then
      raise exception 'Website status snapshot has changed in %. Review before applying.', v_signature;
    end if;
    execute replace(v_definition, v_marker, v_status);
  end loop;
end;
$migration$;

notify pgrst, 'reload schema';
commit;
