-- Match the canonical participant identity contract for email invitations that
-- predate a user binding. Keep explicit upload permission and exact matter scope.
create or replace function document_security.can_upload(p_transaction uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (
  public.bridge_can_mutate_attorney_lane(p_transaction,'transfer_attorney','documents')
  or public.bridge_can_mutate_attorney_lane(p_transaction,'bond_attorney','documents')
  or public.bridge_can_mutate_attorney_lane(p_transaction,'cancellation_attorney','documents')
  or public.bridge_can_access_transaction_org_member(p_transaction)
  or exists(select 1 from public.transaction_participants p
   where p.transaction_id=p_transaction
    and (p.user_id=auth.uid() or (p.user_id is null
      and nullif(auth.jwt()->>'email','') is not null
      and lower(p.participant_email)=lower(auth.jwt()->>'email')))
    and p.status in ('active','accepted') and p.removed_at is null
    and p.can_upload_documents is true)
 );
$$;
revoke all on function document_security.can_upload(uuid) from public;
grant execute on function document_security.can_upload(uuid) to anon,authenticated,service_role;
