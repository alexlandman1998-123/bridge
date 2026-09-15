-- Correct the first-run path of 20260913210000: a newly inserted canonical
-- certificate rule inherits an inactive default, while only conflict updates
-- set it active. Restrict the correction to that canonical rule.

begin;

do $$
begin
  if not exists (
    select 1
    from public.document_requirement_rules
    where id = '00000000-0000-4000-8000-000000000106'::uuid
      and document_definition_key = 'fica_compliance_certificate'
      and pack_key = 'fica_compliance_outcome'
      and context_type = 'transaction'
  ) then
    raise exception 'Expected the canonical FICA compliance certificate rule before activation.';
  end if;
end;
$$;

update public.document_requirement_rules
set is_active = true,
    updated_at = now()
where id = '00000000-0000-4000-8000-000000000106'::uuid;

notify pgrst, 'reload schema';
commit;
