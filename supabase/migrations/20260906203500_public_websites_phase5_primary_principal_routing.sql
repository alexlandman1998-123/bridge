begin;

-- A general website enquiry has no listing agent to route to. Prefer the
-- organisation's designated primary owner before falling back to recency.
do $migration$
declare
  v_definition text;
begin
  select pg_get_functiondef(
    'public.website_capture_lead_submission(text,text,uuid,uuid,text,text,text,text,boolean,boolean,text,text,jsonb)'::regprocedure
  ) into v_definition;

  if position('member.is_primary_owner desc' in v_definition) = 0 then
    v_definition := replace(
      v_definition,
      'order by case member.role when ''principal'' then 0 when ''admin'' then 1 when ''branch_manager'' then 2 else 3 end,'
        || chr(10) || '           member.updated_at desc',
      'order by case member.role when ''principal'' then 0 when ''admin'' then 1 when ''branch_manager'' then 2 else 3 end,'
        || chr(10) || '           member.is_primary_owner desc,'
        || chr(10) || '           member.updated_at desc'
    );
    execute v_definition;
  end if;
end;
$migration$;

commit;
