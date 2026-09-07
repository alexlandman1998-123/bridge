-- Staging executed the earlier seller-handoff source. Reconcile only the
-- three later source changes, while refusing to rewrite an unknown function.
do $$
declare
  v_definition text;
  v_updated_definition text;
begin
  select pg_get_functiondef(
    'public.bridge_verify_private_transaction_seller_handoff(uuid)'::regprocedure
  ) into v_definition;

  if v_definition is null
    or v_definition not like '%''transaction_created'',%'
    or v_definition not like '%listing_status = case when listing_status = ''seller_lead'' then ''transaction_created'' else listing_status end%'
    or v_definition not like E'%\n  );\n\n  return jsonb_build_object(%'
  then
    raise exception 'Unexpected bridge_verify_private_transaction_seller_handoff baseline; refusing automatic reconciliation.';
  end if;

  v_updated_definition := replace(
    v_definition,
    E'''transaction_created'',\n      true,',
    E'''onboarding_sent'',\n      false,'
  );
  v_updated_definition := replace(
    v_updated_definition,
    'listing_status = case when listing_status = ''seller_lead'' then ''transaction_created'' else listing_status end',
    'listing_status = case when listing_status = ''seller_lead'' then ''onboarding_sent'' else listing_status end'
  );
  v_updated_definition := replace(
    v_updated_definition,
    E'\n  );\n\n  return jsonb_build_object(',
    E'\n  )\n  on conflict do nothing;\n\n  return jsonb_build_object('
  );

  if v_updated_definition = v_definition then
    raise exception 'Seller-handoff reconciliation made no changes.';
  end if;

  execute v_updated_definition;

  if pg_get_functiondef(
    'public.bridge_verify_private_transaction_seller_handoff(uuid)'::regprocedure
  ) not like '%''onboarding_sent'',%'
    or pg_get_functiondef(
      'public.bridge_verify_private_transaction_seller_handoff(uuid)'::regprocedure
    ) not like '%listing_status = case when listing_status = ''seller_lead'' then ''onboarding_sent'' else listing_status end%'
    or pg_get_functiondef(
      'public.bridge_verify_private_transaction_seller_handoff(uuid)'::regprocedure
    ) not like '%on conflict do nothing%'
  then
    raise exception 'Seller-handoff reconciliation verification failed.';
  end if;
end;
$$;
