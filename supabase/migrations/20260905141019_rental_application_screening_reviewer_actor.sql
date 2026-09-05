begin;

create or replace function public.rental_application_screening_validate_scope()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare application_org uuid;
begin
  select organisation_id into application_org from public.rental_applications where id = new.application_id;
  if application_org is null or application_org <> new.organisation_id then raise exception 'Rental screening check must match application organisation'; end if;
  if new.status in ('passed', 'failed', 'needs_review', 'expired') then
    new.reviewed_at := coalesce(new.reviewed_at, now());
    new.reviewed_by := coalesce(new.reviewed_by, auth.uid());
  end if;
  return new;
end; $$;

commit;
