create or replace function public.bridge_sync_transaction_partner_invitation_from_invite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partner_invitation_id uuid;
begin
  if new.metadata is null then
    return new;
  end if;

  begin
    v_partner_invitation_id := nullif(coalesce(
      new.metadata ->> 'transaction_partner_invitation_id',
      new.metadata ->> 'transactionPartnerInvitationId'
    ), '')::uuid;
  exception
    when invalid_text_representation then
      return new;
  end;

  if v_partner_invitation_id is null then
    return new;
  end if;

  if new.status = 'accepted' then
    update public.transaction_partner_invitations
    set status = 'accepted',
        accepted_user_id = coalesce(new.accepted_by_user_id, accepted_user_id),
        accepted_at = coalesce(new.accepted_at, now()),
        invitation_token = null,
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'canonicalInviteId', new.id,
          'canonicalInviteAcceptedAt', coalesce(new.accepted_at, now()),
          'canonicalInviteAcceptedByUserId', new.accepted_by_user_id,
          'acceptedVia', 'canonical_invite'
        ),
        updated_at = now()
    where id = v_partner_invitation_id
      and status <> 'accepted';
  elsif new.status = 'expired' then
    update public.transaction_partner_invitations
    set status = 'expired',
        invitation_token = null,
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'canonicalInviteId', new.id,
          'canonicalInviteExpiredAt', now(),
          'expiredVia', 'canonical_invite'
        ),
        updated_at = now()
    where id = v_partner_invitation_id
      and status = 'pending';
  end if;

  return new;
end;
$$;

drop trigger if exists invites_sync_transaction_partner_invitation on public.invites;
create trigger invites_sync_transaction_partner_invitation
after update of status, accepted_at, accepted_by_user_id on public.invites
for each row
when (
  coalesce(new.metadata, '{}'::jsonb) ? 'transaction_partner_invitation_id'
  or coalesce(new.metadata, '{}'::jsonb) ? 'transactionPartnerInvitationId'
)
execute function public.bridge_sync_transaction_partner_invitation_from_invite();

update public.transaction_partner_invitations tpi
set metadata = coalesce(tpi.metadata, '{}'::jsonb) || jsonb_build_object(
      'canonicalInviteId', inv.id,
      'canonicalInviteToken', inv.token,
      'canonicalInviteType', inv.invite_type,
      'canonicalInviteUrl', '/invite/' || inv.token,
      'canonicalInviteBackfilledAt', now()
    ),
    updated_at = now()
from public.invites inv
where inv.metadata ->> 'transaction_partner_invitation_id' = tpi.id::text
  and inv.status = 'pending'
  and tpi.status = 'pending'
  and not (coalesce(tpi.metadata, '{}'::jsonb) ? 'canonicalInviteToken');
