begin;
-- Relationship ownership is immutable after creation. A partner workspace may
-- only be bound once, by an administrator of that workspace (normally through
-- the token acceptance RPC).
create or replace function public.bridge_guard_developer_partner_relationship_identity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.developer_organisation_id is distinct from old.developer_organisation_id then
    raise exception 'developer organisation cannot be changed'
      using errcode = '23514';
  end if;

  if old.partner_organisation_id is not null
    and new.partner_organisation_id is distinct from old.partner_organisation_id
  then
    raise exception 'partner organisation cannot be changed after binding'
      using errcode = '23514';
  end if;

  if old.partner_organisation_id is null
    and new.partner_organisation_id is not null
    and not public.bridge_is_org_admin(new.partner_organisation_id)
  then
    raise exception 'only a partner workspace admin can bind the relationship'
      using errcode = '42501';
  end if;

  return new;
end;
$$;
drop trigger if exists trg_developer_partner_relationship_identity_guard
  on public.developer_partner_relationships;
create trigger trg_developer_partner_relationship_identity_guard
before update of developer_organisation_id, partner_organisation_id
on public.developer_partner_relationships
for each row
execute function public.bridge_guard_developer_partner_relationship_identity();
-- Supabase project defaults may grant API roles table privileges. Keep direct
-- table access authenticated and let RLS provide organisation/referral scope.
revoke all on table public.developer_partner_relationships from public, anon;
revoke all on table public.developer_partner_agreements from public, anon;
revoke all on table public.developer_partner_agreement_terms from public, anon;
grant select, insert, update on table public.developer_partner_relationships to authenticated, service_role;
grant select, insert, update on table public.developer_partner_agreements to authenticated, service_role;
grant select, insert, update on table public.developer_partner_agreement_terms to authenticated, service_role;
revoke all on table public.lead_referrals from public, anon;
revoke all on table public.referral_clients from public, anon;
revoke all on table public.referral_agreements from public, anon;
revoke all on table public.referral_status_events from public, anon;
revoke all on table public.referral_invites from public, anon;
revoke all on table public.referral_commission_events from public, anon;
grant select, insert, update, delete on table public.lead_referrals to authenticated, service_role;
grant select, insert, update, delete on table public.referral_clients to authenticated, service_role;
grant select, insert, update, delete on table public.referral_agreements to authenticated, service_role;
grant select, insert, update, delete on table public.referral_status_events to authenticated, service_role;
grant select, insert, update, delete on table public.referral_invites to authenticated, service_role;
grant select, insert, update, delete on table public.referral_commission_events to authenticated, service_role;
-- Explicit function privilege matrix. PostgreSQL grants PUBLIC EXECUTE on new
-- functions unless it is revoked, including SECURITY DEFINER functions.
-- pgcrypto is installed in the extensions schema on the linked project.
alter function public.bridge_prepare_developer_partner_invitation(uuid)
  set search_path = public, extensions;
alter function public.bridge_get_developer_partner_invitation(text)
  set search_path = public, extensions;
alter function public.bridge_accept_developer_partner_invitation(text, text, text, uuid)
  set search_path = public, extensions;
revoke all on function public.bridge_is_developer_partner_relationship_member(uuid) from public, anon, authenticated, service_role;
revoke all on function public.bridge_is_developer_partner_relationship_admin(uuid) from public, anon, authenticated, service_role;
grant execute on function public.bridge_is_developer_partner_relationship_member(uuid) to authenticated, service_role;
grant execute on function public.bridge_is_developer_partner_relationship_admin(uuid) to authenticated, service_role;
revoke all on function public.bridge_prepare_developer_partner_invitation(uuid) from public, anon, authenticated, service_role;
revoke all on function public.bridge_get_developer_partner_invitation(text) from public, anon, authenticated, service_role;
revoke all on function public.bridge_accept_developer_partner_invitation(text, text, text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.bridge_prepare_developer_partner_invitation(uuid) to authenticated, service_role;
grant execute on function public.bridge_get_developer_partner_invitation(text) to anon, authenticated, service_role;
grant execute on function public.bridge_accept_developer_partner_invitation(text, text, text, uuid) to authenticated, service_role;
revoke all on function public.bridge_lookup_referral_invite_by_token(text) from public, anon, authenticated, service_role;
revoke all on function public.bridge_respond_referral_invite(text, text, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.bridge_respond_referral_terms(uuid, text, text, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.bridge_lookup_referral_invite_by_token(text) to anon, authenticated, service_role;
grant execute on function public.bridge_respond_referral_invite(text, text, text, text, text) to anon, authenticated, service_role;
grant execute on function public.bridge_respond_referral_terms(uuid, text, text, text, jsonb) to authenticated, service_role;
-- Trigger helpers are invoked by their triggers, not directly through the API.
revoke all on function public.bridge_touch_developer_partner_updated_at() from public, anon, authenticated, service_role;
revoke all on function public.bridge_guard_developer_partner_relationship_identity() from public, anon, authenticated, service_role;
revoke all on function public.bridge_referral_status_event_to_lead_activity() from public, anon, authenticated, service_role;
notify pgrst, 'reload schema';
commit;
