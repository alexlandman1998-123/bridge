begin;

-- Company/trust fields are shared by domestic, foreign and CC profiles.
-- Their presence is compatible evidence, not a competing explicit owner type.
-- Keep cross-source conflicts and unrelated entity shapes as review blockers.
do $migration$
declare
  v_signature regprocedure := to_regprocedure('public.bridge_compute_listing_seller_historical_audit(uuid)');
  v_definition text;
  v_original text := 'where shape <> v_candidate';
  v_replacement text := E'where not (\n      -- seller_history_compatible_entity_shapes_v1\n      case shape\n        when ''company'' then v_candidate in (''company'', ''close_corporation'', ''foreign_company'')\n        when ''trust'' then v_candidate in (''trust'', ''foreign_trust'')\n        else shape = v_candidate\n      end\n    )';
begin
  if v_signature is null then
    raise exception 'Seller history correction requires the existing historical audit function.';
  end if;
  v_definition := pg_get_functiondef(v_signature);
  if position('seller_history_compatible_entity_shapes_v1' in v_definition) = 0 then
    if position(v_original in v_definition) = 0 then
      raise exception 'Unexpected seller history audit definition; review its entity comparisons before applying this correction.';
    end if;
    execute replace(v_definition, v_original, v_replacement);
  end if;
end;
$migration$;

-- The legacy seller_type is deliberately "individual" for married and
-- power-of-attorney profiles. Confirmation must not turn that coarse legal
-- type into a conflict with the explicit ownership/signing route.
do $migration$
declare
  v_signature regprocedure := 'public.bridge_compute_listing_seller_historical_audit(uuid)'::regprocedure;
  v_definition text := pg_get_functiondef(v_signature);
  v_original text := 'v_candidate := public.bridge_normalize_historical_seller_type(v_value);';
  v_replacement text := E'v_candidate := public.bridge_normalize_historical_seller_type(v_value);\n    -- seller_history_compatible_legacy_legal_type_v1\n    if v_source in (''listing_legacy'', ''onboarding_legacy'') and v_candidate = ''individual'' then\n      v_candidate := case public.bridge_normalize_historical_seller_type(coalesce(\n        v_form->>''ownerStructureType'', v_form->>''ownershipType'',\n        v_listing_facts#>>''{seller,owner_structure_type}'',\n        v_onboarding_facts#>>''{seller,owner_structure_type}''\n      ))\n        when ''married'' then ''married''\n        when ''power_of_attorney'' then ''power_of_attorney''\n        else v_candidate\n      end;\n    end if;';
begin
  if position('seller_history_compatible_legacy_legal_type_v1' in v_definition) = 0 then
    if position(v_original in v_definition) = 0 then
      raise exception 'Unexpected seller history signal loop; review its legacy legal types before applying this correction.';
    end if;
    execute replace(v_definition, v_original, v_replacement);
  end if;
end;
$migration$;

-- Preserve audit history, function permissions and saved seller/documents.
notify pgrst, 'reload schema';
commit;
