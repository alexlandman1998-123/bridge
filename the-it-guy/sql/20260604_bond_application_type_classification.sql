update public.transaction_bond_applications
set application_type = case
  when lower(coalesce(bank_name, '')) = 'bond originator intake' then 'originator_intake'
  else 'bank_application'
end
where application_type is null
   or btrim(application_type) = '';

alter table if exists public.transaction_bond_applications
  alter column application_type set not null;

alter table if exists public.transaction_bond_applications
  alter column application_type drop default;

alter table if exists public.transaction_bond_applications
  drop constraint if exists transaction_bond_applications_application_type_check;

alter table if exists public.transaction_bond_applications
  add constraint transaction_bond_applications_application_type_check
  check (application_type in ('originator_intake', 'bank_application', 'draft_application', 'special_application'));

drop index if exists public.transaction_bond_applications_originator_intake_uidx;

create unique index transaction_bond_applications_originator_intake_uidx
  on public.transaction_bond_applications (transaction_id, application_type)
  where application_type = 'originator_intake';
