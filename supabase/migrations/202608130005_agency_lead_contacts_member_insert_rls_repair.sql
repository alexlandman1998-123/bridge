begin;

-- Agency Lead creation inserts a Contact before the Lead exists. The Phase 3
-- Attorney Lead isolation policy kept Attorney-linked contacts protected, but
-- its agency write check was too narrow for ordinary active agency members and
-- support/manager-created leads.

drop policy if exists contacts_agency_write on public.contacts;
create policy contacts_agency_write on public.contacts
for all to authenticated
using (
  not exists (
    select 1
    from public.leads lead
    where lead.contact_id = contacts.contact_id
      and lead.organisation_id = contacts.organisation_id
      and lead.lead_domain = 'attorney'
  )
  and public.bridge_can_access_assignment(organisation_id, assigned_agent_id, null)
)
with check (
  organisation_id is not null
  and public.bridge_is_active_member(organisation_id)
  and not exists (
    select 1
    from public.leads lead
    where lead.contact_id = contacts.contact_id
      and lead.organisation_id = contacts.organisation_id
      and lead.lead_domain = 'attorney'
  )
);

drop policy if exists leads_agency_write on public.leads;
create policy leads_agency_write on public.leads
for all to authenticated
using (
  coalesce(lead_domain, 'agency') <> 'attorney'
  and public.bridge_can_access_assignment(organisation_id, assigned_agent_id, null)
)
with check (
  organisation_id is not null
  and coalesce(lead_domain, 'agency') <> 'attorney'
  and public.bridge_is_active_member(organisation_id)
);

grant select, insert, update on table public.contacts to authenticated;
grant select, insert, update on table public.leads to authenticated;

notify pgrst, 'reload schema';

commit;
