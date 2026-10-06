-- Full history for one lead, using the existing calendar reader's access rules.
create or replace function public.bridge_list_lead_appointments(
  p_organisation_id uuid,
  p_lead_id uuid,
  p_include_all boolean default false
) returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(a) order by a.date_time, a.appointment_id), '[]'::jsonb)
  from public.bridge_list_calendar_appointments(p_organisation_id, p_include_all, null, null, null) a
  where a.lead_id = p_lead_id
     or (a.related_entity_type = 'lead' and a.related_entity_id::text = p_lead_id::text);
$$;
revoke all on function public.bridge_list_lead_appointments(uuid, uuid, boolean) from public, anon;
grant execute on function public.bridge_list_lead_appointments(uuid, uuid, boolean) to authenticated;
