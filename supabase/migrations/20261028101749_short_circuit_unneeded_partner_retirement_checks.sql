-- Keep the existing retirement rules and grants. Only skip their work when
-- this transaction has no retirement history, where the old result is false.
-- This does not remove or relax any access policy.
begin;

CREATE OR REPLACE FUNCTION handoff_private.retired_actor_only(p_tx uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- Most transactions have never had a partner retired. Avoid preparing the
  -- other access-check queries for that common case.
  if not exists (select 1 from handoff_private.retired_partner_lanes r where r.transaction_id=p_tx) then
    return false;
  end if;
  return exists(select 1 from handoff_private.retired_partner_lanes r where r.transaction_id=p_tx
    and handoff_private.actor_from_retired_org(p_tx,r.role_type,r.organisation_id))
  and not public.bridge_transaction_scope_is_internal_user()
  and not exists(select 1 from public.transactions t where t.id=p_tx and (auth.uid()::text in
    (to_jsonb(t)->>'owner_user_id',to_jsonb(t)->>'assigned_user_id',to_jsonb(t)->>'created_by')
    or exists(select 1 from public.organisation_users u where u.organisation_id=t.organisation_id and u.user_id=auth.uid() and u.status='active')))
  and not exists(select 1 from public.transaction_user_access a where a.transaction_id=p_tx and a.user_id=auth.uid())
  and not exists(select 1 from public.transaction_participants p where p.transaction_id=p_tx and p.status='active' and p.removed_at is null
    and (p.user_id=auth.uid() or nullif(to_jsonb(p)->>'assigned_user_id','')::uuid=auth.uid()))
  and not exists(select 1 from public.transaction_role_players p where p.transaction_id=p_tx and p.status='active' and p.removed_at is null
    and (p.user_id=auth.uid() or p.assigned_user_id=auth.uid()))
  and not exists(select 1 from public.transaction_handoffs h join public.organisation_users u on u.organisation_id=h.destination_organisation_id
    where h.transaction_id=p_tx and h.required and h.nomination_status='nominated' and u.user_id=auth.uid() and u.status='active'
      and not handoff_private.retired_lane(p_tx,h.role_type,h.destination_organisation_id));
end;
$function$;

commit;
