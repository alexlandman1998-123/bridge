-- Match the existing app/RPC cancellation authority at direct table writes.
create function journey_private.guard_transaction_cancellation_actor()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not (coalesce(new.lifecycle_state,'')='cancelled' or coalesce(old.lifecycle_state,'')='cancelled')
 or (new.lifecycle_state,new.cancelled_at,new.cancelled_reason,new.cancelled_by_user_id)
 is not distinct from (old.lifecycle_state,old.cancelled_at,old.cancelled_reason,old.cancelled_by_user_id) then return new;end if;
 if auth.uid() is null and (session_user in ('postgres','supabase_admin') or auth.role()='service_role') then return new;end if;
 if auth.uid() is not null and (public.bridge_current_profile_role()='internal_admin'
 or exists(select 1 from public.organisation_users u where u.organisation_id=old.organisation_id
 and u.user_id=auth.uid() and u.status='active' and u.app_role='developer')
 or coalesce(public.bridge_can_mutate_attorney_lane(old.id,'transfer_attorney','workflow'),false)) then return new;end if;
 raise exception 'Your role cannot cancel or change the cancellation of this transaction.' using errcode='42501';
end;$$;
revoke all on function journey_private.guard_transaction_cancellation_actor() from public,anon,authenticated;
create trigger guard_transaction_cancellation_actor before update of lifecycle_state,cancelled_at,cancelled_reason,cancelled_by_user_id on public.transactions
for each row execute function journey_private.guard_transaction_cancellation_actor();
