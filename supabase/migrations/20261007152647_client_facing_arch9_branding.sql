-- Correct inherited platform copy only. Custom tenant wording, identities,
-- calendar UIDs, security settings and historical records stay intact.
begin;

do $branding$
declare
  correction record;
  target record;
  definition text;
  target_count integer;
begin
  for correction in
    select * from (values
      ('subject', 'Complete your Bridge onboarding', 'Complete your Arch9 onboarding'),
      ('preheader', 'Your Bridge onboarding is ready. Complete your details and documents to continue.', 'Your Arch9 onboarding is ready. Complete your details and documents to continue.'),
      ('securityBody', 'Your information and documents are handled securely through Bridge. Only authorised parties involved in your transaction can access your onboarding details.', 'Your information and documents are handled securely through Arch9. Only authorised parties involved in your transaction can access your onboarding details.')
    ) as changes(field_name, old_copy, new_copy)
  loop
    update public.organisation_settings
    set settings_json = jsonb_set(
      settings_json,
      array['emailTemplates', 'client_onboarding', correction.field_name],
      to_jsonb(correction.new_copy),
      false
    ), updated_at = now()
    where settings_json #>> array['emailTemplates', 'client_onboarding', correction.field_name] = correction.old_copy;
  end loop;

  -- Recreate each existing definition with only its exact display literal
  -- changed, preserving the deployed signature, body, security and grants.
  for correction in
    select * from (values
      ('bridge_get_transaction_partner_invitation', 'Bridge', 'Arch9'),
      ('bridge_phase7_get_network_intelligence', 'Frequently selected in the Bridge network', 'Frequently selected in the Arch9 network'),
      ('bridge_submit_seller_offer_decision', 'Seller accepted the buyer offer. Bridge created the transaction and opened onboarding / OTP preparation.', 'Seller accepted the buyer offer. Arch9 created the transaction and opened onboarding / OTP preparation.')
    ) as changes(function_name, old_copy, new_copy)
  loop
    target_count := 0;
    for target in
      select p.oid from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = correction.function_name
        and p.prokind = 'f'
    loop
      target_count := target_count + 1;
      definition := pg_get_functiondef(target.oid);
      if position(quote_literal(correction.old_copy) in definition) > 0 then
        execute replace(definition, quote_literal(correction.old_copy), quote_literal(correction.new_copy));
      end if;
    end loop;
    if target_count = 0 then
      raise exception 'Expected branding target function public.% is missing', correction.function_name;
    end if;
  end loop;
end;
$branding$;

commit;
