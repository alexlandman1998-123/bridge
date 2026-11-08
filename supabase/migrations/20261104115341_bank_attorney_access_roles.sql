-- Bank-appointed lanes use distinct access roles, not transfer-attorney access.
-- Preserve the existing roles while allowing the two already-built legal lanes.
alter table public.transaction_user_access drop constraint transaction_user_access_access_role_check;
alter table public.transaction_user_access add constraint transaction_user_access_access_role_check
 check(access_role in ('transfer_attorney','bond_attorney','cancellation_attorney','bond_originator','developer','other'));
