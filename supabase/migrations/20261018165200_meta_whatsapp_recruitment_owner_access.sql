begin;

-- Recruitment's existing RLS and action RPCs include active agency Owners.
-- Align the newer Meta routing, audiences and automation checks with that rule.
-- Replacing only the role tuple preserves function ownership, ACLs, tenant scope,
-- active-membership requirements and all delivery/consent guards.
do $$
declare target regprocedure; definition text; role_pattern text := '\(''principal'',[[:space:]]*''admin'',[[:space:]]*''super_admin''\)';
begin
  foreach target in array array[
    'private.whatsapp_recruitment_manager(uuid,uuid)'::regprocedure,
    'public.whatsapp_automation_rules_request(uuid,uuid,text,uuid,integer,jsonb)'::regprocedure,
    'public.whatsapp_automation_prepare(uuid,uuid,boolean,text,jsonb)'::regprocedure
  ] loop
    definition := pg_get_functiondef(target);
    if definition !~ role_pattern then
      raise exception 'Expected recruitment role guard missing in %', target;
    end if;
    execute regexp_replace(definition, role_pattern, '(''owner'',''principal'',''admin'',''super_admin'')', 'g');
  end loop;
end; $$;

commit;
