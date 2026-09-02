begin;

alter table public.rental_maintenance_work_events
  drop constraint rental_maintenance_work_events_event_type_check;

alter table public.rental_maintenance_work_events
  add constraint rental_maintenance_work_events_event_type_check
  check (event_type in ('work_authorized', 'work_started', 'progress_update', 'work_completed', 'work_reopened'));

create or replace function public.rental_reopen_maintenance_request(p_request_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.rental_maintenance_requests%rowtype;
  v_event_id uuid;
begin
  if auth.uid() is null or length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'A reopen reason of at least 5 characters is required';
  end if;
  select * into v_request from public.rental_maintenance_requests where id = p_request_id for update;
  if not found or not exists (
    select 1 from public.rental_properties property
    where property.id = v_request.property_id and public.rental_branch_access(property.organisation_id, property.branch_id)
  ) then raise exception 'Not authorized'; end if;
  if v_request.status <> 'resolved' then raise exception 'Only resolved maintenance requests can be reopened'; end if;
  update public.rental_maintenance_requests set status = 'assigned' where id = v_request.id;
  update public.rental_maintenance_assignments set status = 'assigned', assigned_at = now() where request_id = v_request.id;
  insert into public.rental_maintenance_work_events(request_id, organisation_id, event_type, note, recorded_by)
  values (v_request.id, v_request.organisation_id, 'work_reopened', btrim(p_reason), auth.uid()) returning id into v_event_id;
  return jsonb_build_object('request_id', v_request.id, 'event_id', v_event_id, 'status', 'assigned');
end;
$$;

revoke all on function public.rental_reopen_maintenance_request(uuid, text) from public, anon;
grant execute on function public.rental_reopen_maintenance_request(uuid, text) to authenticated;

commit;
