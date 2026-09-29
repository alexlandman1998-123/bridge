-- Imported matters can have an unresolved tax route while earlier transfer
-- work is being captured. Keep route-specific reviews pending until an
-- attorney selects a route; the separate lodgement gate still requires it.
create or replace function journey_private.phase4_required_transfer_steps(p_profile jsonb)
returns text[] language plpgsql stable set search_path = '' as $$
declare
  v_tax jsonb := coalesce(p_profile -> 'transferTaxDecision','{}'::jsonb);
  v_scenario jsonb := coalesce(p_profile #> '{scenarioProfile,parties}','[]'::jsonb);
  v_property jsonb := coalesce(p_profile #> '{mvpProfile,propertyConditions}','{}'::jsonb);
  v_steps text[] := array['transfer_tax_route_confirmed'];
  v_seller jsonb;
  v_potential boolean := false;
  v_directive boolean := false;
  v_withholding boolean := false;
begin
  if v_tax ->> 'route' = 'transfer_duty' then
    v_steps := v_steps || array['transfer_duty_tdc01_submission'];
  end if;
  if v_tax ->> 'sarsEvidenceRequest' = 'yes' or v_tax ->> 'sarsStatus' = 'query' then
    v_steps := v_steps || array['sars_evidence_request_response'];
  end if;
  case v_tax ->> 'route'
    when 'transfer_duty' then
      if v_tax ->> 'dutyPaymentRequired' = 'yes' then
        v_steps := v_steps || array['transfer_duty_assessment_payment'];
      end if;
    when 'vat' then v_steps := v_steps || array['ordinary_vat_basis_verified'];
    when 'zero_rated_going_concern' then v_steps := v_steps || array['going_concern_zero_rate_verified'];
    when 'exempt' then v_steps := v_steps || array['transfer_duty_exemption_basis_verified'];
    else null;
  end case;
  for v_seller in select value from pg_catalog.jsonb_array_elements(v_scenario) loop
    if v_seller ->> 'role' = 'seller' and coalesce(v_seller ->> 'taxResidence','unknown') <> 'south_africa' then
      v_potential := true;
      if v_tax #>> array['nonResidentSellers',v_seller ->> 'id','directiveStatus'] = 'issued' then v_directive := true; end if;
      if v_tax #>> array['nonResidentSellers',v_seller ->> 'id','withholdingRequired'] = 'yes' then v_withholding := true; end if;
    end if;
  end loop;
  if v_potential or v_tax ->> 'sellerNonResidentReview' = 'yes' then
    v_steps := v_steps || array['non_resident_seller_applicability_review'];
    if v_directive then v_steps := v_steps || array['non_resident_seller_directive_review']; end if;
    if v_withholding or v_tax ->> 'sellerNonResidentReview' = 'yes' then
      v_steps := v_steps || array['non_resident_seller_withholding_payment_review'];
    end if;
  end if;
  v_steps := v_steps || array['sars_transfer_tax_receipt_verified','municipal_rates_clearance_review'];
  if p_profile ->> 'propertyTenure' = 'sectional_title' then
    v_steps := v_steps || array['body_corporate_levy_clearance_review'];
  end if;
  if p_profile ->> 'propertyTenure' = 'estate_hoa' or p_profile ->> 'hoaApplicable' = 'yes' then
    v_steps := v_steps || array['hoa_clearance_review'];
  end if;
  v_steps := v_steps || array['property_conditions_applicability_review'];
  if v_property ->> 'titleRestrictions' is distinct from 'no' then
    v_steps := v_steps || array['title_conditions_review'];
  end if;
  if v_property ->> 'complianceCertificates' is distinct from 'no' then
    v_steps := v_steps || array['property_compliance_review'];
  end if;
  return v_steps;
end;
$$;
