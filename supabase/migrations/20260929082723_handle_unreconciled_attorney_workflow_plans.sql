-- Imported matters can have task rows before an attorney confirms a workflow plan.
-- Keep early work recordable, and require a confirmed plan at lodgement.
do $$
declare
  v_definition text;
  v_before text;
  v_after text;
begin
  select pg_catalog.pg_get_functiondef('journey_private.enforce_attorney_funding_handoffs()'::pg_catalog.regprocedure)
    into v_definition;
  v_before := 'v_plan ->> ''version'' not in (''attorney_matter_workflow_plan_v12'', ''attorney_matter_workflow_plan_v13'', ''attorney_matter_workflow_plan_v14'')';
  v_after := 'coalesce(v_plan ->> ''version'', '''') not in (''attorney_matter_workflow_plan_v12'', ''attorney_matter_workflow_plan_v13'', ''attorney_matter_workflow_plan_v14'')';
  if pg_catalog.strpos(v_definition, v_before) = 0 then
    raise exception 'Funding handoff gate changed; review the unreconciled-plan guard.';
  end if;
  execute pg_catalog.replace(v_definition, v_before, v_after);

  select pg_catalog.pg_get_functiondef('journey_private.enforce_attorney_phase4_tax_clearances()'::pg_catalog.regprocedure)
    into v_definition;
  v_before := 'v_profile #>> ''{workflowPlan,version}'' not in (''attorney_matter_workflow_plan_v13'',''attorney_matter_workflow_plan_v14'')';
  v_after := 'coalesce(v_profile #>> ''{workflowPlan,version}'', '''') not in (''attorney_matter_workflow_plan_v13'',''attorney_matter_workflow_plan_v14'')';
  if pg_catalog.strpos(v_definition, v_before) = 0 then
    raise exception 'Tax clearance gate changed; review the unreconciled-plan guard.';
  end if;
  execute pg_catalog.replace(v_definition, v_before, v_after);

  select pg_catalog.pg_get_functiondef('journey_private.enforce_attorney_phase5_specialist_routes()'::pg_catalog.regprocedure)
    into v_definition;
  v_before := 'v_profile #>> ''{workflowPlan,version}'' <> ''attorney_matter_workflow_plan_v14''';
  v_after := 'v_profile #>> ''{workflowPlan,version}'' is distinct from ''attorney_matter_workflow_plan_v14''';
  if pg_catalog.strpos(v_definition, v_before) = 0 then
    raise exception 'Specialist route gate changed; review the unreconciled-plan guard.';
  end if;
  execute pg_catalog.replace(v_definition, v_before, v_after);
end;
$$;
