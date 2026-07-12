begin;

alter table if exists public.transaction_attorney_assignments
  add column if not exists matter_reference text,
  add column if not exists matter_reference_source text not null default 'manual',
  add column if not exists matter_reference_updated_by uuid references auth.users(id) on delete set null,
  add column if not exists matter_reference_updated_at timestamptz;

alter table if exists public.transaction_attorney_assignments
  drop constraint if exists transaction_attorney_assignments_matter_reference_source_check;

alter table if exists public.transaction_attorney_assignments
  add constraint transaction_attorney_assignments_matter_reference_source_check
  check (
    matter_reference_source in (
      'manual',
      'partner_portal',
      'partner_api',
      'import',
      'system',
      'legacy',
      'correction'
    )
  );

alter table if exists public.transaction_attorney_assignments
  drop constraint if exists transaction_attorney_assignments_matter_reference_not_blank_check;

alter table if exists public.transaction_attorney_assignments
  add constraint transaction_attorney_assignments_matter_reference_not_blank_check
  check (matter_reference is null or length(trim(matter_reference)) > 0);

create or replace function public.bridge_set_attorney_assignment_matter_reference_fields()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  new.matter_reference := nullif(trim(new.matter_reference), '');
  new.matter_reference_source := lower(trim(coalesce(new.matter_reference_source, 'manual')));

  if tg_op = 'INSERT' then
    if new.matter_reference is not null then
      new.matter_reference_updated_at := coalesce(new.matter_reference_updated_at, now());
      if new.matter_reference_updated_by is null and auth.uid() is not null then
        new.matter_reference_updated_by := auth.uid();
      end if;
    end if;
    return new;
  end if;

  if new.matter_reference is distinct from old.matter_reference
    or new.matter_reference_source is distinct from old.matter_reference_source then
    if new.matter_reference_updated_at is null
      or new.matter_reference_updated_at is not distinct from old.matter_reference_updated_at then
      new.matter_reference_updated_at := now();
    end if;

    if auth.uid() is not null
      and (
        new.matter_reference_updated_by is null
        or new.matter_reference_updated_by is not distinct from old.matter_reference_updated_by
      ) then
      new.matter_reference_updated_by := auth.uid();
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_transaction_attorney_assignments_matter_reference_fields
  on public.transaction_attorney_assignments;

create trigger trg_transaction_attorney_assignments_matter_reference_fields
before insert or update on public.transaction_attorney_assignments
for each row
execute function public.bridge_set_attorney_assignment_matter_reference_fields();

create index if not exists transaction_attorney_assignments_matter_reference_search_idx
  on public.transaction_attorney_assignments (lower(matter_reference))
  where matter_reference is not null;

create index if not exists transaction_attorney_assignments_role_matter_reference_idx
  on public.transaction_attorney_assignments (transaction_id, attorney_role, lower(matter_reference))
  where matter_reference is not null;

comment on column public.transaction_attorney_assignments.matter_reference
  is 'Partner-owned external matter number for this attorney assignment only. Bridge transaction references remain on public.transactions.';

comment on column public.transaction_attorney_assignments.matter_reference_source
  is 'Source that last supplied the attorney assignment matter_reference.';

comment on column public.transaction_attorney_assignments.matter_reference_updated_by
  is 'Authenticated user who last supplied or corrected the attorney assignment matter_reference, when available.';

comment on column public.transaction_attorney_assignments.matter_reference_updated_at
  is 'Timestamp when the attorney assignment matter_reference or source last changed.';

commit;
