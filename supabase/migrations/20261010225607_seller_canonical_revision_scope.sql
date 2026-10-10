begin;

-- Current callers supply the displayed onboarding revision. Unrelated listing
-- updates must not reject that seller save. Older callers retain their original
-- listing timestamp guard; the existing seller revision check remains intact.
do $migration$
declare
  v_signature text := 'public.save_private_listing_seller_canonical_update(uuid,jsonb,jsonb,jsonb,jsonb,text,text,text,text,uuid,text,text,text[],timestamptz)';
  v_definition text;
  v_original text := 'if v_listing.updated_at is distinct from p_expected_updated_at then';
  v_replacement text := 'if not (coalesce(p_form_data, ''{}''::jsonb) ? ''__sellerSave'') and v_listing.updated_at is distinct from p_expected_updated_at then';
begin
  v_definition := pg_get_functiondef(v_signature::regprocedure);
  if position(v_replacement in v_definition) = 0 then
    if position(v_original in v_definition) = 0
       or position('v_onboarding.updated_at is distinct from nullif(p_form_data#>>''{__sellerSave,updatedAt}'', '''')::timestamptz' in v_definition) = 0 then
      raise exception 'Seller save revision guards changed. Review before applying.';
    end if;
    execute replace(v_definition, v_original, v_replacement);
  end if;
end;
$migration$;

notify pgrst, 'reload schema';
commit;
