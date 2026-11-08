-- A person can hold several roles on one matter. A later accepted cancellation
-- role must not remove their appointed transfer role, or borrow another matter's.
create or replace function public.bridge_current_transaction_role(transaction_id uuid)
returns text language sql stable security definer set search_path='' as $$
 select public.bridge_normalize_transaction_role(p.role_type,p.legal_role,p.transaction_role)
 from public.transaction_participants p
 where p.transaction_id=$1 and p.user_id=auth.uid()
  and coalesce(p.status,'active') in ('active','accepted') and p.removed_at is null
 order by p.accepted_at desc nulls last,p.updated_at desc nulls last,p.created_at desc
 limit 1;
$$;
create or replace function public.bridge_has_transaction_permission(transaction_id uuid,permission_key text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from public.transaction_participants p
  where p.transaction_id=$1 and p.user_id=auth.uid()
   and coalesce(p.status,'active') in ('active','accepted') and p.removed_at is null
   and case lower(coalesce($2,''))
    when 'view_transaction' then true
    when 'view_documents' then true
    when 'comment' then true
    when 'manage_transfer_workflow' then public.bridge_normalize_transaction_role(p.role_type,p.legal_role,p.transaction_role) in ('transfer_attorney','listing_agent','developer_contact')
    when 'upload_transfer_docs' then public.bridge_normalize_transaction_role(p.role_type,p.legal_role,p.transaction_role) in ('transfer_attorney','listing_agent','developer_contact')
    when 'manage_bond_workflow' then public.bridge_normalize_transaction_role(p.role_type,p.legal_role,p.transaction_role) in ('bond_attorney','bond_originator','listing_agent','developer_contact')
    when 'upload_bond_docs' then public.bridge_normalize_transaction_role(p.role_type,p.legal_role,p.transaction_role) in ('bond_attorney','bond_originator','listing_agent','developer_contact')
    when 'edit_core_transaction' then public.bridge_normalize_transaction_role(p.role_type,p.legal_role,p.transaction_role) in ('listing_agent','developer_contact')
    when 'invite_participants' then public.bridge_normalize_transaction_role(p.role_type,p.legal_role,p.transaction_role) in ('listing_agent','developer_contact')
    else false end
 );
$$;
-- Preserve the existing callable contract; anonymous callers have no matching
-- verified user ID and receive no role/permission, including on known matters.
revoke all on function public.bridge_current_transaction_role(uuid) from public;
revoke all on function public.bridge_has_transaction_permission(uuid,text) from public;
grant execute on function public.bridge_current_transaction_role(uuid),public.bridge_has_transaction_permission(uuid,text) to anon,authenticated,service_role;
