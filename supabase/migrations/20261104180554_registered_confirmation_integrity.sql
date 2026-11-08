-- A later metadata edit must preserve the same proof invariant as first registration.
create or replace function journey_private.guard_registered_confirmation_integrity()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.registered_at is null or old.registered_at is null then return new; end if;
 if (new.registered_at,new.registration_date,new.title_deed_number,new.registration_confirmation_document_id)
   is not distinct from (old.registered_at,old.registration_date,old.title_deed_number,old.registration_confirmation_document_id) then return new; end if;
 if auth.uid() is null and (session_user in ('postgres','supabase_admin') or auth.role()='service_role') then return new; end if;
 if new.registration_date is null or nullif(btrim(new.title_deed_number),'') is null then
   raise exception 'A registered transaction must retain its registration date and title deed number.' using errcode='23514';
 end if;
 if not exists(select 1 from public.documents d
   join storage.objects o on o.bucket_id=coalesce(nullif(d.file_bucket,''),'documents') and o.name=d.file_path
   where d.id=new.registration_confirmation_document_id and d.transaction_id=new.id
     and coalesce(d.status,'uploaded') not in ('archived','deleted','superseded','rejected')
     and journey_private.is_registration_confirmation_document(d)) then
   raise exception 'A registered transaction must retain stored registration confirmation from this transaction.' using errcode='23514';
 end if;
 return new;
end;
$$;
revoke all on function journey_private.guard_registered_confirmation_integrity() from public,anon,authenticated;
create trigger guard_registered_confirmation_integrity before update of registered_at,registration_date,title_deed_number,registration_confirmation_document_id on public.transactions
for each row execute function journey_private.guard_registered_confirmation_integrity();
