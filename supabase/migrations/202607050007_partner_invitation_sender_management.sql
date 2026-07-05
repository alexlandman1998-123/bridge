begin;

drop policy if exists partner_invitations_delete_sender_admin on public.partner_invitations;
create policy partner_invitations_delete_sender_admin
on public.partner_invitations
for delete
to authenticated
using (
  public.bridge_is_org_admin(sender_organisation_id)
  and coalesce(status, 'pending') <> 'accepted'
);

grant delete on public.partner_invitations to authenticated;

commit;
