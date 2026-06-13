begin;

drop policy if exists organisation_partners_insert_org_admin on public.organisation_partners;

create policy organisation_partners_insert_org_admin on public.organisation_partners
for insert to authenticated
with check (
  created_by = auth.uid()
  and (
    public.bridge_is_org_admin(organisation_id)
    or public.bridge_is_org_admin(partner_organisation_id)
  )
);

commit;
