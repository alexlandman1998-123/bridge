begin;
create or replace function public.bridge_normalize_observability_workspace_identity()
returns trigger language plpgsql security definer set search_path='' as $identity$
declare v_organisation uuid;
begin
 if new.workspace_id is not null and not exists(select 1 from public.organisations where id=new.workspace_id) then
  select f.organisation_id into v_organisation from public.attorney_firms f
   join public.organisations o on o.id=f.organisation_id where f.id=new.workspace_id;
  if v_organisation is not null then
   new.metadata:=coalesce(new.metadata,'{}'::jsonb)||jsonb_build_object('professionalWorkspaceId',new.workspace_id);
   new.workspace_id:=v_organisation;
  end if;
 end if;
 return new;
end $identity$;
revoke all on function public.bridge_normalize_observability_workspace_identity() from public,anon,authenticated;
create trigger normalize_observability_workspace_identity before insert or update of workspace_id on public.performance_metrics
 for each row execute function public.bridge_normalize_observability_workspace_identity();
create trigger normalize_observability_workspace_identity before insert or update of workspace_id on public.telemetry_events
 for each row execute function public.bridge_normalize_observability_workspace_identity();
commit;
