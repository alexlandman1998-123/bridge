-- Phase 6: internal on-the-day operations. Public users retain no direct access.
alter table public.marketing_event_rsvps
  add column checked_in_at timestamptz,
  add column checked_in_by uuid references auth.users(id) on delete set null,
  add column interest_level text check (interest_level in ('high', 'medium', 'low', 'not_interested')),
  add column follow_up_note text check (length(follow_up_note) <= 2000);

grant select, insert, update on public.marketing_event_rsvps to authenticated;

create policy marketing_event_rsvps_internal_select
  on public.marketing_event_rsvps for select to authenticated
  using (exists (select 1 from public.marketing_events event where event.id = marketing_event_rsvps.event_id and public.bridge_has_organisation_membership(event.organisation_id)));

create policy marketing_event_rsvps_internal_insert
  on public.marketing_event_rsvps for insert to authenticated
  with check (exists (select 1 from public.marketing_events event where event.id = marketing_event_rsvps.event_id and public.bridge_has_organisation_membership(event.organisation_id)));

create policy marketing_event_rsvps_internal_update
  on public.marketing_event_rsvps for update to authenticated
  using (exists (select 1 from public.marketing_events event where event.id = marketing_event_rsvps.event_id and public.bridge_has_organisation_membership(event.organisation_id)))
  with check (exists (select 1 from public.marketing_events event where event.id = marketing_event_rsvps.event_id and public.bridge_has_organisation_membership(event.organisation_id)));
