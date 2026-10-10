begin;

-- Preserve the deployed functions' membership, grant, deletion and media guards.
-- A sale marked POA may publish without a numeric public price. Rental prices
-- stay positive, and only the public cadence enum enters the website snapshot.
do $migration$
declare
  v_signature text;
  v_definition text;
  v_price_guard text := 'coalesce(v_projection.asking_price, 0) <= 0';
  v_poa text := '(v_projection.listing_type = ''Sale'' and coalesce(to_jsonb(v_projection.features), ''[]''::jsonb) ? ''price_on_application'')';
  v_price_payload text := '''asking_price'', v_projection.asking_price';
  v_public_terms text;
begin
  v_public_terms := '''asking_price'', case when ' || v_poa || ' then null else v_projection.asking_price end,
    ''rental_price_frequency'', case when v_projection.listing_type = ''Rental'' then
      case coalesce(nullif(v_listing.seller_canonical_facts_json #>> ''{rentalInfo,rentalPriceFrequency}'', ''''),
                    nullif(v_listing.seller_canonical_facts_json #>> ''{rentalInfo,rental_price_frequency}'', ''''), ''monthly'')
        when ''monthly'' then ''monthly'' when ''weekly'' then ''weekly'' when ''daily'' then ''daily''
        when ''annual'' then ''annual'' when ''per_square_metre'' then ''per_square_metre'' else null end
      else null end';
  foreach v_signature in array array[
    'public.website_get_listing_publication_status(uuid)',
    'public.website_get_partner_listing_status(uuid)',
    'public.website_commit_listing_publication(uuid,text,uuid,text)',
    'public.website_commit_partner_listing_publication(uuid,uuid,text,uuid,text,jsonb)'
  ] loop
    v_definition := pg_get_functiondef(v_signature::regprocedure);
    if position(v_price_guard in v_definition) = 0 then
      raise exception 'Website pricing guard has changed in %. Review before applying.', v_signature;
    end if;
    v_definition := replace(v_definition, v_price_guard, '(' || v_price_guard || ' and not ' || v_poa || ')');
    if v_signature like '%website_commit_%' then
      if position(v_price_payload in v_definition) = 0 then
        raise exception 'Website snapshot pricing has changed in %. Review before applying.', v_signature;
      end if;
      v_definition := replace(v_definition, v_price_payload, v_public_terms);
    end if;
    execute v_definition;
  end loop;
end;
$migration$;

notify pgrst, 'reload schema';
commit;
