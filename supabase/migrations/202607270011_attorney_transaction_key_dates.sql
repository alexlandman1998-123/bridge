alter table if exists public.transactions
  add column if not exists instruction_date date,
  add column if not exists instruction_at timestamptz,
  add column if not exists instructed_at timestamptz,
  add column if not exists agreement_date date,
  add column if not exists offer_accepted_at timestamptz,
  add column if not exists accepted_at timestamptz,
  add column if not exists obligation_date date,
  add column if not exists finance_clause_expiry_date date,
  add column if not exists suspensive_condition_due_date date,
  add column if not exists transfer_duty_due_date date,
  add column if not exists transfer_duty_due_at timestamptz,
  add column if not exists lodgement_date date,
  add column if not exists lodged_at timestamptz,
  add column if not exists expected_lodgement_date date,
  add column if not exists expected_lodgement_at timestamptz,
  add column if not exists expected_registration_date date,
  add column if not exists target_registration_date date;

comment on column public.transactions.obligation_date is
  'Attorney-controlled suspensive condition or obligation deadline for the matter, commonly a bond approval or finance clause due date.';

comment on column public.transactions.transfer_duty_due_date is
  'Attorney-controlled transfer duty payment or receipt deadline.';

comment on column public.transactions.lodgement_date is
  'Attorney-controlled Deeds Office lodgement date.';
