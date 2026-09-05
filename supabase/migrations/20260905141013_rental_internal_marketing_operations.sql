-- Rentals Phases 13–15: internal-only marketing records and media.
-- This migration never reads or writes Sales listing tables or portal adapters.
begin;

alter table public.rental_vacancy_marketing
  add column if not exists status text not null default 'draft',
  add column if not exists version integer not null default 1,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references auth.users(id) on delete set null,
  add column if not exists paused_at timestamptz,
  add column if not exists archived_at timestamptz;

update public.rental_vacancy_marketing set visibility = 'internal' where visibility is distinct from 'internal';

alter table public.rental_vacancy_marketing
  drop constraint if exists rental_vacancy_marketing_visibility_check,
  drop constraint if exists rental_vacancy_marketing_status_check,
  drop constraint if exists rental_vacancy_marketing_version_check,
  add constraint rental_vacancy_marketing_visibility_check check (visibility = 'internal'),
  add constraint rental_vacancy_marketing_status_check check (status in ('draft', 'ready_for_review', 'approved', 'paused', 'archived')),
  add constraint rental_vacancy_marketing_version_check check (version > 0);

create index if not exists rental_vacancy_marketing_operations_idx
  on public.rental_vacancy_marketing(organisation_id, branch_id, status, updated_at desc);

create table if not exists public.rental_vacancy_marketing_status_history (
  id uuid primary key default gen_random_uuid(),
  marketing_id uuid not null references public.rental_vacancy_marketing(id) on delete cascade,
  vacancy_id uuid not null references public.rental_vacancies(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  from_status text,
  to_status text not null check (to_status in ('draft', 'ready_for_review', 'approved', 'paused', 'archived')),
  occurred_by uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default now()
);
create index if not exists rental_vacancy_marketing_history_idx on public.rental_vacancy_marketing_status_history(marketing_id, occurred_at desc);

create or replace function public.rental_vacancy_marketing_validate_operation()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare vacancy_status text; has_media boolean;
begin
  if tg_op = 'INSERT' and auth.uid() is not null and new.status <> 'draft' then
    raise exception 'Browser clients may only create draft rental marketing';
  end if;

  if tg_op = 'UPDATE' then
    if new.status is distinct from old.status and not (
      (old.status = 'draft' and new.status in ('ready_for_review', 'archived')) or
      (old.status = 'ready_for_review' and new.status in ('draft', 'approved', 'archived')) or
      (old.status = 'approved' and new.status in ('paused', 'archived')) or
      (old.status = 'paused' and new.status in ('approved', 'archived'))
    ) then raise exception 'Invalid rental marketing transition'; end if;
    if new.status is distinct from old.status or new.title is distinct from old.title or new.description is distinct from old.description or new.features_json is distinct from old.features_json then
      new.version := old.version + 1;
    end if;
  end if;

  if new.status = 'ready_for_review' and (tg_op = 'INSERT' or new.status is distinct from old.status) then
    select status into vacancy_status from public.rental_vacancies where id = new.vacancy_id;
    select exists(select 1 from public.rental_vacancy_media where vacancy_id = new.vacancy_id) into has_media;
    if char_length(coalesce(new.title, '')) = 0 or char_length(coalesce(new.description, '')) < 80 or not coalesce(has_media, false) or vacancy_status not in ('preparing', 'marketing', 'applications_open') then
      raise exception 'Marketing is not ready for review';
    end if;
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'approved' then new.approved_at := now(); new.approved_by := auth.uid(); end if;
    if new.status = 'paused' then new.paused_at := now(); end if;
    if new.status = 'archived' then new.archived_at := now(); end if;
  end if;
  return new;
end; $$;

drop trigger if exists trg_rental_vacancy_marketing_validate_operation on public.rental_vacancy_marketing;
create trigger trg_rental_vacancy_marketing_validate_operation
  before insert or update on public.rental_vacancy_marketing
  for each row execute function public.rental_vacancy_marketing_validate_operation();

create or replace function public.rental_vacancy_marketing_record_status_history()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.rental_vacancy_marketing_status_history(marketing_id, vacancy_id, organisation_id, from_status, to_status, occurred_by)
    values (new.id, new.vacancy_id, new.organisation_id, null, new.status, auth.uid());
  elsif new.status is distinct from old.status then
    insert into public.rental_vacancy_marketing_status_history(marketing_id, vacancy_id, organisation_id, from_status, to_status, occurred_by)
    values (new.id, new.vacancy_id, new.organisation_id, old.status, new.status, auth.uid());
  end if;
  return new;
end; $$;
revoke execute on function public.rental_vacancy_marketing_record_status_history() from public, anon, authenticated;
drop trigger if exists trg_rental_vacancy_marketing_status_history on public.rental_vacancy_marketing;
create trigger trg_rental_vacancy_marketing_status_history
  after insert or update on public.rental_vacancy_marketing
  for each row execute function public.rental_vacancy_marketing_record_status_history();

alter table public.rental_vacancy_marketing_status_history enable row level security;
revoke all on public.rental_vacancy_marketing_status_history from anon, authenticated;
grant select on public.rental_vacancy_marketing_status_history to authenticated;
create policy rental_vacancy_marketing_history_select_scoped on public.rental_vacancy_marketing_status_history
  for select to authenticated using (exists (
    select 1 from public.rental_vacancies vacancy join public.rental_properties property on property.id = vacancy.property_id
    where vacancy.id = vacancy_id and public.rental_branch_access(property.organisation_id, property.branch_id)
  ));

insert into storage.buckets (id, name, public) values ('rental-vacancy-media', 'rental-vacancy-media', false) on conflict (id) do nothing;
drop policy if exists rental_vacancy_media_upload on storage.objects;
create policy rental_vacancy_media_upload on storage.objects for insert to authenticated with check (
  bucket_id = 'rental-vacancy-media' and exists (
    select 1 from public.rental_vacancies vacancy join public.rental_properties property on property.id = vacancy.property_id
    where vacancy.id::text = (storage.foldername(name))[2]
      and vacancy.organisation_id::text = (storage.foldername(name))[1]
      and public.rental_branch_access(property.organisation_id, property.branch_id)
  )
);
drop policy if exists rental_vacancy_media_read on storage.objects;
create policy rental_vacancy_media_read on storage.objects for select to authenticated using (
  bucket_id = 'rental-vacancy-media' and exists (
    select 1 from public.rental_vacancy_media media join public.rental_vacancies vacancy on vacancy.id = media.vacancy_id join public.rental_properties property on property.id = vacancy.property_id
    where media.storage_bucket = bucket_id and media.storage_path = name and public.rental_branch_access(property.organisation_id, property.branch_id)
  )
);
drop policy if exists rental_vacancy_media_delete on storage.objects;
create policy rental_vacancy_media_delete on storage.objects for delete to authenticated using (
  bucket_id = 'rental-vacancy-media' and exists (
    select 1 from public.rental_vacancy_media media join public.rental_vacancies vacancy on vacancy.id = media.vacancy_id join public.rental_properties property on property.id = vacancy.property_id
    where media.storage_bucket = bucket_id and media.storage_path = name and public.rental_branch_access(property.organisation_id, property.branch_id)
  )
);
commit;
