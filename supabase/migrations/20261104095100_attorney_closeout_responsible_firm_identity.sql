begin;
-- attorney_firm_id is a legacy profile reference. Preserve historical values;
-- store the current assignment's actual firm in a separate, correctly typed key.
alter table public.transaction_attorney_closeouts add column if not exists responsible_attorney_firm_id uuid references public.attorney_firms(id) on delete restrict;
drop policy if exists attorney_closeout_responsible_insert on public.transaction_attorney_closeouts;
create policy attorney_closeout_responsible_insert on public.transaction_attorney_closeouts for insert to authenticated
 with check(public.bridge_can_manage_attorney_closeout(transaction_id,responsible_attorney_firm_id));
drop policy if exists attorney_closeout_responsible_update on public.transaction_attorney_closeouts;
create policy attorney_closeout_responsible_update on public.transaction_attorney_closeouts for update to authenticated
 using(public.bridge_can_manage_attorney_closeout(transaction_id,responsible_attorney_firm_id))
 with check(public.bridge_can_manage_attorney_closeout(transaction_id,responsible_attorney_firm_id));
create policy attorney_closeout_responsible_read on public.transaction_attorney_closeouts for select to authenticated
 using(public.bridge_can_manage_attorney_closeout(transaction_id,responsible_attorney_firm_id));
drop policy if exists agency_two_tier_transaction_id on public.transaction_attorney_closeouts;
create policy agency_two_tier_transaction_id on public.transaction_attorney_closeouts as restrictive for all to authenticated
 using(transaction_id is null or public.bridge_agency_transaction_scope(transaction_id) or public.bridge_can_manage_attorney_closeout(transaction_id,responsible_attorney_firm_id))
 with check(transaction_id is null or public.bridge_agency_transaction_scope(transaction_id) or public.bridge_can_manage_attorney_closeout(transaction_id,responsible_attorney_firm_id));
create or replace function document_security.attorney_closeout_document_allowed(p_closeout uuid,p_path text)
returns boolean language sql stable security definer set search_path='' as $scope$
 select exists(select 1 from public.transaction_attorney_closeouts c
 where c.id=p_closeout and public.bridge_can_manage_attorney_closeout(c.transaction_id,c.responsible_attorney_firm_id)
 and (p_path is null or (starts_with(p_path,'transaction-'||c.transaction_id::text||'/closeout-'||c.id::text||'/')
   and exists(select 1 from storage.objects o where o.bucket_id='documents' and o.name=p_path))))
$scope$;
create policy attorney_closeout_responsible_document_read on public.transaction_attorney_closeout_documents for select to authenticated
 using(document_security.attorney_closeout_document_allowed(transaction_attorney_closeout_id,null));
create or replace function document_security.guard_attorney_closeout_firm_identity()
returns trigger language plpgsql security definer set search_path='' as $guard$
begin
 if new.responsible_attorney_firm_id is distinct from old.responsible_attorney_firm_id then
 raise exception 'A closeout cannot be moved to another responsible firm.' using errcode='22023';end if;
 return new;
end $guard$;
revoke all on function document_security.guard_attorney_closeout_firm_identity() from public,anon,authenticated;
create trigger guard_attorney_closeout_firm_identity before update on public.transaction_attorney_closeouts
 for each row execute function document_security.guard_attorney_closeout_firm_identity();
notify pgrst,'reload schema';
commit;
