begin;
create or replace function seller_save_private.sync_completed_seller_intake_to_transaction()
returns trigger language plpgsql security definer set search_path='' as $sync$
begin
 if lower(coalesce(new.status,'')) in ('submitted','completed','reviewed','approved') then
  update public.transactions t set seller_onboarding_status='completed'
  where t.listing_id=new.private_listing_id
   and coalesce(t.lifecycle_state,'active') not in ('cancelled','archived','completed')
   and t.seller_onboarding_status is distinct from 'completed';
 end if;
 return new;
end $sync$;
revoke all on function seller_save_private.sync_completed_seller_intake_to_transaction() from public,anon,authenticated;
create trigger sync_completed_seller_intake_to_transaction after insert or update of status on public.private_listing_seller_onboarding
 for each row execute function seller_save_private.sync_completed_seller_intake_to_transaction();
commit;
