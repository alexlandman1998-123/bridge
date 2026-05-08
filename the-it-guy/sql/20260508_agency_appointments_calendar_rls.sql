-- RLS for appointment participants

alter table if exists public.appointment_participants enable row level security;

drop policy if exists appointment_participants_agency_select on public.appointment_participants;
create policy appointment_participants_agency_select on public.appointment_participants
for select to authenticated
using (
  exists (
    select 1
    from public.appointments a
    where a.appointment_id = appointment_participants.appointment_id
      and a.organisation_id = appointment_participants.organisation_id
      and public.bridge_can_access_assignment(a.organisation_id, a.agent_id, null)
  )
);

drop policy if exists appointment_participants_agency_write on public.appointment_participants;
create policy appointment_participants_agency_write on public.appointment_participants
for all to authenticated
using (
  exists (
    select 1
    from public.appointments a
    where a.appointment_id = appointment_participants.appointment_id
      and a.organisation_id = appointment_participants.organisation_id
      and public.bridge_can_access_assignment(a.organisation_id, a.agent_id, null)
  )
)
with check (
  exists (
    select 1
    from public.appointments a
    where a.appointment_id = appointment_participants.appointment_id
      and a.organisation_id = appointment_participants.organisation_id
      and (
        public.bridge_is_org_admin(a.organisation_id)
        or (
          public.bridge_membership_role(a.organisation_id) = 'agent'
          and a.agent_id = auth.uid()
        )
      )
  )
);
