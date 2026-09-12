begin;

alter table public.email_automation_events
  add column if not exists initiated_by uuid references auth.users(id) on delete set null;

-- Generic events originate from trusted platform integrations. Manual entry is
-- intentionally excluded so an agent cannot accidentally enrol a client in
-- every active manual journey.
create or replace function public.email_automation_enqueue_event(
  p_organisation_id uuid, p_contact_id uuid, p_event_key text, p_payload jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.bridge_has_organisation_membership(p_organisation_id)
    or not exists (select 1 from public.email_marketing_contacts where id = p_contact_id and organisation_id = p_organisation_id) then
    raise exception 'Not authorised for this automation event.' using errcode = '42501';
  end if;
  if p_event_key = 'manual' then
    raise exception 'Manual enrolment must name an active journey.' using errcode = '22023';
  end if;
  if p_event_key not in ('contact_created', 'listing_enquiry', 'tag_added', 'price_reduction') then
    raise exception 'Unsupported automation event.' using errcode = '22023';
  end if;
  insert into public.email_automation_events (organisation_id, contact_id, event_key, payload, initiated_by)
  values (p_organisation_id, p_contact_id, p_event_key, coalesce(p_payload, '{}'::jsonb), auth.uid())
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.email_automation_enqueue_manual_event(
  p_journey_id uuid,
  p_contact_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_journey public.email_automation_journeys%rowtype;
  v_contact public.email_marketing_contacts%rowtype;
  v_event_id uuid;
begin
  select * into v_journey from public.email_automation_journeys where id = p_journey_id;
  if not found then raise exception 'Journey not found.' using errcode = 'P0002'; end if;
  if not public.bridge_has_organisation_membership(v_journey.organisation_id) then
    raise exception 'Not authorised for this journey.' using errcode = '42501';
  end if;
  if v_journey.status <> 'active' or v_journey.trigger_key <> 'manual' then
    raise exception 'Only an active manual journey can enrol a client.' using errcode = '22023';
  end if;
  select * into v_contact from public.email_marketing_contacts
  where id = p_contact_id and organisation_id = v_journey.organisation_id;
  if not found or not v_contact.is_valid_email then
    raise exception 'This client is not eligible for marketing email.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.contact_marketing_preferences p
    where p.organisation_id = v_journey.organisation_id
      and p.email = v_contact.email
      and p.marketing_consent_status = 'opted_in'
  ) or exists (
    select 1 from public.email_suppressions s
    where s.organisation_id = v_journey.organisation_id and s.email = v_contact.email
  ) then
    raise exception 'This client has not consented to marketing email or is suppressed.' using errcode = '22023';
  end if;
  insert into public.email_automation_events (organisation_id, contact_id, event_key, payload, initiated_by)
  values (v_journey.organisation_id, v_contact.id, 'manual', jsonb_build_object('journey_id', v_journey.id, 'manual', true), auth.uid())
  returning id into v_event_id;
  return v_event_id;
end $$;

revoke all on function public.email_automation_enqueue_event(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.email_automation_enqueue_event(uuid, uuid, text, jsonb) to authenticated;
revoke all on function public.email_automation_enqueue_manual_event(uuid, uuid) from public, anon;
grant execute on function public.email_automation_enqueue_manual_event(uuid, uuid) to authenticated;

commit;
