begin;
-- Preserve the newer membership helpers and reconcile the two historical
-- partner-invitation delete policies into one sender-or-organisation-admin rule.
drop policy if exists partner_invitations_delete_sender_admin on public.partner_invitations;
create policy partner_invitations_delete_sender_admin
on public.partner_invitations
for delete
to authenticated
using (
  coalesce(status, 'pending') <> 'accepted'
  and (
    created_by = auth.uid()
    or public.bridge_is_org_admin(sender_organisation_id)
  )
);
grant delete on public.partner_invitations to authenticated;
create or replace function public.bridge_delete_partner_invitation(p_invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation public.partner_invitations%rowtype;
  v_deleted_id uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'code', 'not_authorized');
  end if;
  if p_invitation_id is null then
    return jsonb_build_object('success', false, 'code', 'missing_invitation_id');
  end if;

  select * into v_invitation
  from public.partner_invitations
  where id = p_invitation_id;

  if not found then
    return jsonb_build_object('success', false, 'code', 'not_found');
  end if;
  if coalesce(v_invitation.status, 'pending') = 'accepted' then
    return jsonb_build_object('success', false, 'code', 'accepted');
  end if;
  if v_invitation.created_by is distinct from auth.uid()
    and not public.bridge_is_org_admin(v_invitation.sender_organisation_id)
  then
    return jsonb_build_object('success', false, 'code', 'not_authorized');
  end if;

  delete from public.partner_invitations
  where id = p_invitation_id
    and coalesce(status, 'pending') <> 'accepted'
  returning id into v_deleted_id;

  if v_deleted_id is null then
    return jsonb_build_object('success', false, 'code', 'stale');
  end if;
  return jsonb_build_object('success', true, 'code', 'deleted', 'invitation_id', v_deleted_id);
end;
$$;
-- Canonical invite operations are platform operations. Reuse the hardened
-- server-controlled app_metadata boundary installed by Phase 5.
create or replace function public.bridge_can_operate_canonical_invites()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.bridge_is_platform_admin();
$$;
-- The authenticated partner portal writes these tables directly after the
-- token lookup/activation RPC establishes the user's partner membership.
revoke all on table public.transaction_partner_assignments from public, anon;
revoke all on table public.partner_portal_uploads from public, anon;
revoke all on table public.partner_portal_document_requests from public, anon;
revoke all on table public.partner_portal_comments from public, anon;
revoke all on table public.partner_portal_support_tickets from public, anon;
revoke all on table public.partner_portal_audit_logs from public, anon;
revoke all on table public.partner_portal_notifications from public, anon;
grant select, insert, update, delete on table public.transaction_partner_assignments to authenticated;
grant select, insert, update, delete on table public.partner_portal_uploads to authenticated;
grant select, insert, update, delete on table public.partner_portal_document_requests to authenticated;
grant select, insert, update, delete on table public.partner_portal_comments to authenticated;
grant select, insert, update, delete on table public.partner_portal_support_tickets to authenticated;
grant select, insert, update, delete on table public.partner_portal_audit_logs to authenticated;
grant select, insert, update, delete on table public.partner_portal_notifications to authenticated;
-- Public partner-portal lookup is token-scoped. All mutation and operational
-- functions require a signed-in user; internal trigger helpers are owner-only.
revoke all on function public.bridge_lookup_partner_portal_by_token(text) from public, anon, authenticated, service_role;
grant execute on function public.bridge_lookup_partner_portal_by_token(text) to anon, authenticated;
revoke all on function public.bridge_activate_partner_portal_onboarding(text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.bridge_activate_partner_portal_onboarding(text, jsonb) to authenticated;
revoke all on function public.bridge_delete_partner_invitation(uuid) from public, anon, authenticated, service_role;
grant execute on function public.bridge_delete_partner_invitation(uuid) to authenticated;
revoke all on function public.bridge_resend_transaction_partner_invitation(uuid) from public, anon, authenticated, service_role;
revoke all on function public.bridge_record_transaction_partner_invitation_delivery(uuid, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.bridge_record_transaction_partner_invitation_action(uuid, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.bridge_expire_stale_transaction_partner_invitations(uuid) from public, anon, authenticated, service_role;
grant execute on function public.bridge_resend_transaction_partner_invitation(uuid) to authenticated;
grant execute on function public.bridge_record_transaction_partner_invitation_delivery(uuid, text, jsonb) to authenticated;
grant execute on function public.bridge_record_transaction_partner_invitation_action(uuid, text, jsonb) to authenticated;
grant execute on function public.bridge_expire_stale_transaction_partner_invitations(uuid) to authenticated;
revoke all on function public.bridge_can_operate_canonical_invites() from public, anon, authenticated, service_role;
revoke all on function public.bridge_canonical_invite_health() from public, anon, authenticated, service_role;
revoke all on function public.bridge_reconcile_canonical_invites(boolean) from public, anon, authenticated, service_role;
grant execute on function public.bridge_can_operate_canonical_invites() to authenticated;
grant execute on function public.bridge_canonical_invite_health() to authenticated;
grant execute on function public.bridge_reconcile_canonical_invites(boolean) to authenticated;
revoke all on function public.bridge_normalize_transaction_role(text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.bridge_normalize_transaction_role(text, text, text) to authenticated;
revoke all on function public.bridge_transaction_participants_sync_transaction_role() from public, anon, authenticated, service_role;
revoke all on function public.bridge_sync_transaction_partner_invitation_from_invite() from public, anon, authenticated, service_role;
revoke all on function public.bridge_sync_client_portal_from_invite() from public, anon, authenticated, service_role;
-- These repair operations remain service-only.
revoke all on function public.bridge_repair_partner_invitation_acceptance(uuid) from public, anon, authenticated, service_role;
revoke all on function public.bridge_repair_transaction_partner_invitation_acceptance(uuid) from public, anon, authenticated, service_role;
grant execute on function public.bridge_repair_partner_invitation_acceptance(uuid) to service_role;
grant execute on function public.bridge_repair_transaction_partner_invitation_acceptance(uuid) to service_role;
notify pgrst, 'reload schema';
commit;
