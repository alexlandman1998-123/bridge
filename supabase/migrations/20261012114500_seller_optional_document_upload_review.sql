-- Optional checklist items are still applicable upload/review targets.
-- Retirement is represented by not_applicable/cancelled or archived provenance.
-- Patch only the shared guard; retain current permissions, signing checks,
-- review revision conflicts and notification/audit behavior verbatim.
begin;
do $migration$
declare
  signature text;
  definition text;
  old_guard text := $$v_requirement.is_required is false or v_requirement.status = 'not_applicable'$$;
  new_guard text := $$v_requirement.status in ('not_applicable', 'cancelled')
      or coalesce(v_requirement.generated_from->>'archived', 'false') = 'true'$$;
begin
  foreach signature in array array[
    'public.bridge_validate_private_listing_document_link_p0_4()',
    'public.bridge_review_private_listing_seller_document_p1_8(uuid,text,text,integer)'
  ] loop
    definition := pg_get_functiondef(to_regprocedure(signature));
    if definition is null or (length(definition) - length(replace(definition, old_guard, ''))) / length(old_guard) <> 1 then
      raise exception 'Unexpected seller document guard for %. Review the current function before applying.', signature;
    end if;
    execute replace(definition, old_guard, new_guard);
  end loop;
end;
$migration$;
commit;
