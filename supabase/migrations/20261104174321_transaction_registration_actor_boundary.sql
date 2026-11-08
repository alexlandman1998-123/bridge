-- Match the app's lifecycle authority at the database boundary. No backfill.
create or replace function journey_private.guard_transaction_registration_actor()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_admin boolean; v_writer boolean; v_registration_change boolean; v_completion_change boolean;
begin
 if old.registered_at is not null and
   (new.unit_id,new.development_id,new.organisation_id,new.listing_id)
   is distinct from (old.unit_id,old.development_id,old.organisation_id,old.listing_id) then
   raise exception 'Undo registration before changing the registered property.' using errcode='23514';
 end if;
 v_registration_change :=
   (new.registered_at,new.registration_date,new.title_deed_number,new.registration_confirmation_document_id,new.registered_by_user_id)
   is distinct from
   (old.registered_at,old.registration_date,old.title_deed_number,old.registration_confirmation_document_id,old.registered_by_user_id)
   or ((old.registered_at is not null or new.registered_at is not null or new.stage='Registered' or new.current_main_stage='REG' or new.lifecycle_state='registered')
     and (new.stage,new.current_main_stage,new.lifecycle_state) is distinct from (old.stage,old.current_main_stage,old.lifecycle_state));
 v_completion_change := new.completed_at is distinct from old.completed_at
   or (new.lifecycle_state='completed' and old.lifecycle_state is distinct from 'completed');
 if not coalesce(v_registration_change,false) and not coalesce(v_completion_change,false) then return new; end if;
 -- Trusted server maintenance remains available; an anonymous portal is never
 -- a lifecycle writer. These are database/session claims, not user metadata.
 if auth.uid() is null then
   if session_user in ('postgres','supabase_admin') or auth.role()='service_role' then return new; end if;
   raise exception 'Registration and closeout require an authorised professional.' using errcode='42501';
 end if;
 v_admin := coalesce(public.bridge_current_profile_role()='internal_admin',false)
   or exists(select 1 from public.organisation_users u
     where u.organisation_id=old.organisation_id and u.user_id=auth.uid()
       and u.status='active' and u.app_role='developer');
 v_writer := v_admin or coalesce(public.bridge_can_mutate_attorney_lane(old.id,'transfer_attorney','workflow'),false);
 if not v_writer then
   raise exception 'Your role cannot change registration or closeout.' using errcode='42501';
 end if;
 if old.registered_at is not null and new.registered_at is null then
   if not v_admin then raise exception 'Only an authorised developer or internal admin can undo registration.' using errcode='42501'; end if;
   if nullif(btrim(new.registration_reversal_reason),'') is null
      or new.registration_reversed_at is null
      or new.registration_reversed_at is not distinct from old.registration_reversed_at then
     raise exception 'A fresh registration reversal timestamp and reason are required.' using errcode='23514';
   end if;
 end if;
 if old.completed_at is not null and new.completed_at is null and not v_admin then
   raise exception 'Only an authorised developer or internal admin can reopen closeout.' using errcode='42501';
 end if;
 return new;
end;
$$;
revoke all on function journey_private.guard_transaction_registration_actor() from public,anon,authenticated;
create trigger guard_transaction_registration_actor before update on public.transactions
for each row execute function journey_private.guard_transaction_registration_actor();
