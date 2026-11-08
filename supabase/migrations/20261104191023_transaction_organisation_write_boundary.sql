-- Existing permissive transaction policies grant participant access. Ownership
-- must also be checked independently when a client creates or moves a matter.
create policy transaction_insert_organisation_boundary on public.transactions
as restrictive for insert to authenticated
with check (
 organisation_id is not null and
 (public.bridge_is_active_member(organisation_id)
   or public.bridge_current_profile_role()='internal_admin')
 and (created_by is null or created_by=auth.uid()
   or public.bridge_current_profile_role()='internal_admin')
);

create function journey_private.guard_transaction_organisation_change()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.organisation_id is not distinct from old.organisation_id then return new; end if;
 if auth.uid() is null and
   (session_user in ('postgres','supabase_admin') or auth.role()='service_role') then return new; end if;
 if public.bridge_current_profile_role()='internal_admin' then return new; end if;
 if new.organisation_id is null or old.organisation_id is null
   or not coalesce(public.bridge_is_active_member(old.organisation_id),false)
   or not coalesce(public.bridge_is_active_member(new.organisation_id),false) then
   raise exception 'Moving a transaction requires active membership in both organisations.' using errcode='42501';
 end if;
 return new;
end;
$$;
revoke all on function journey_private.guard_transaction_organisation_change() from public,anon,authenticated;
create trigger guard_transaction_organisation_change before update of organisation_id on public.transactions
for each row execute function journey_private.guard_transaction_organisation_change();
