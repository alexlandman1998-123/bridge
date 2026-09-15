-- Correct the first-run path of 20260913190000: ON CONFLICT activates an
-- existing rule, but the original INSERT relies on a default that is inactive.
-- This migration activates only the five canonical FICA declaration rules.

begin;

do $$
declare
  matching_rules integer;
begin
  select count(*) into matching_rules
  from public.document_requirement_rules
  where (id, document_definition_key, pack_key, context_type) in (
    ('00000000-0000-4000-8000-000000000101'::uuid, 'buyer_fica_declaration', 'buyer_identity_fica', 'buyer_onboarding'),
    ('00000000-0000-4000-8000-000000000102'::uuid, 'buyer_fica_declaration', 'buyer_identity_fica', 'transaction'),
    ('00000000-0000-4000-8000-000000000103'::uuid, 'seller_fica_declaration', 'seller_identity_fica', 'seller_onboarding'),
    ('00000000-0000-4000-8000-000000000104'::uuid, 'seller_fica_declaration', 'seller_identity_fica', 'private_listing'),
    ('00000000-0000-4000-8000-000000000105'::uuid, 'seller_fica_declaration', 'seller_identity_fica', 'transaction')
  );

  if matching_rules <> 5 then
    raise exception 'Expected the five canonical FICA declaration rules before activation; found %.', matching_rules;
  end if;
end;
$$;

update public.document_requirement_rules
set is_active = true,
    updated_at = now()
where id in (
  '00000000-0000-4000-8000-000000000101'::uuid,
  '00000000-0000-4000-8000-000000000102'::uuid,
  '00000000-0000-4000-8000-000000000103'::uuid,
  '00000000-0000-4000-8000-000000000104'::uuid,
  '00000000-0000-4000-8000-000000000105'::uuid
);

notify pgrst, 'reload schema';
commit;
