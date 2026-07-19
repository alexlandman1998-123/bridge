begin;

-- Attorney calendar Phase 7 staging acceptance hardening.
-- Appointment writes must preserve the transaction/organisation boundary even
-- when another permissive appointment policy also applies to the actor.

create or replace function public.bridge_appointment_org_matches_transaction(
  p_transaction_id uuid,
  p_organisation_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_transaction_id is not null
    and p_organisation_id is not null
    and exists (
      select 1
      from public.transactions transaction_row
      where transaction_row.id = p_transaction_id
        and transaction_row.organisation_id = p_organisation_id
    );
$$;

revoke all on function public.bridge_appointment_org_matches_transaction(uuid, uuid) from public, anon;
grant execute on function public.bridge_appointment_org_matches_transaction(uuid, uuid) to authenticated;

create or replace function public.bridge_can_write_appointment_payload(
  p_transaction_id uuid,
  p_organisation_id uuid,
  p_created_by uuid,
  p_agent_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_organisation_id is not null
    and (
      p_transaction_id is null
      or public.bridge_appointment_org_matches_transaction(p_transaction_id, p_organisation_id)
    )
    and (
      public.bridge_is_org_admin(p_organisation_id)
      or (
        p_created_by = auth.uid()
        and public.bridge_membership_role(p_organisation_id) is not null
      )
      or (
        public.bridge_membership_role(p_organisation_id) = 'agent'
        and p_agent_id = auth.uid()
      )
      or (
        p_transaction_id is not null
        and public.bridge_attorney_can_manage_transaction(p_transaction_id)
      )
    );
$$;

revoke all on function public.bridge_can_write_appointment_payload(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.bridge_can_write_appointment_payload(uuid, uuid, uuid, uuid) to authenticated;

drop policy if exists appointments_agency_write on public.appointments;
create policy appointments_agency_write on public.appointments
for all to authenticated
using (
  public.bridge_is_org_admin(organisation_id)
  or created_by = auth.uid()
  or agent_id = auth.uid()
)
with check (
  public.bridge_can_write_appointment_payload(
    transaction_id,
    organisation_id,
    created_by,
    agent_id
  )
);

drop policy if exists appointments_attorney_insert on public.appointments;
create policy appointments_attorney_insert
on public.appointments
for insert
to authenticated
with check (
  public.bridge_attorney_can_manage_transaction(transaction_id)
  and public.bridge_appointment_org_matches_transaction(transaction_id, organisation_id)
);

drop policy if exists appointments_attorney_update on public.appointments;
create policy appointments_attorney_update
on public.appointments
for update
to authenticated
using (public.bridge_attorney_can_manage_transaction(transaction_id))
with check (
  public.bridge_attorney_can_manage_transaction(transaction_id)
  and public.bridge_appointment_org_matches_transaction(transaction_id, organisation_id)
);

create or replace function public.bridge_appointment_participant_payload_is_consistent(
  p_appointment_id uuid,
  p_organisation_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.bridge_can_access_appointment(p_appointment_id)
    and exists (
      select 1
      from public.appointments appointment_row
      where appointment_row.appointment_id = p_appointment_id
        and appointment_row.organisation_id = p_organisation_id
    );
$$;

revoke all on function public.bridge_appointment_participant_payload_is_consistent(uuid, uuid) from public, anon;
grant execute on function public.bridge_appointment_participant_payload_is_consistent(uuid, uuid) to authenticated;

drop policy if exists appointment_participants_attorney_insert on public.appointment_participants;
create policy appointment_participants_attorney_insert
on public.appointment_participants
for insert
to authenticated
with check (
  public.bridge_appointment_participant_payload_is_consistent(appointment_id, organisation_id)
);

drop policy if exists appointment_participants_attorney_update on public.appointment_participants;
create policy appointment_participants_attorney_update
on public.appointment_participants
for update
to authenticated
using (public.bridge_can_access_appointment(appointment_id))
with check (
  public.bridge_appointment_participant_payload_is_consistent(appointment_id, organisation_id)
);

drop policy if exists appointment_participants_agency_write on public.appointment_participants;
create policy appointment_participants_agency_write on public.appointment_participants
for all to authenticated
using (
  exists (
    select 1
    from public.appointments appointment_row
    where appointment_row.appointment_id = appointment_participants.appointment_id
      and (
        public.bridge_is_org_admin(appointment_row.organisation_id)
        or appointment_row.created_by = auth.uid()
        or appointment_row.agent_id = auth.uid()
      )
  )
)
with check (
  public.bridge_appointment_participant_payload_is_consistent(appointment_id, organisation_id)
);

create or replace function public.bridge_appointment_event_payload_is_consistent(
  p_appointment_id uuid,
  p_transaction_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.bridge_can_access_appointment(p_appointment_id)
    and exists (
      select 1
      from public.appointments appointment_row
      where appointment_row.appointment_id = p_appointment_id
        and appointment_row.transaction_id is not distinct from p_transaction_id
    );
$$;

revoke all on function public.bridge_appointment_event_payload_is_consistent(uuid, uuid) from public, anon;
grant execute on function public.bridge_appointment_event_payload_is_consistent(uuid, uuid) to authenticated;

drop policy if exists appointment_notification_events_insert_scoped on public.appointment_notification_events;
create policy appointment_notification_events_insert_scoped
on public.appointment_notification_events
for insert
to authenticated
with check (
  public.bridge_appointment_event_payload_is_consistent(appointment_id, transaction_id)
);

drop policy if exists appointment_notification_events_update_scoped on public.appointment_notification_events;
create policy appointment_notification_events_update_scoped
on public.appointment_notification_events
for update
to authenticated
using (public.bridge_can_access_appointment(appointment_id))
with check (
  public.bridge_appointment_event_payload_is_consistent(appointment_id, transaction_id)
);

notify pgrst, 'reload schema';

commit;
