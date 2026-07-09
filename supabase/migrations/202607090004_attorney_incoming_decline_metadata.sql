begin;

alter table if exists public.transaction_attorney_assignments
  add column if not exists instruction_declined_at timestamptz,
  add column if not exists instruction_declined_by uuid references auth.users(id) on delete set null;

create index if not exists transaction_attorney_assignments_instruction_decline_idx
  on public.transaction_attorney_assignments (attorney_firm_id, instruction_declined_at desc)
  where instruction_status = 'declined';

comment on column public.transaction_attorney_assignments.instruction_declined_at
  is 'Timestamp when the attorney firm declined an incoming transfer instruction.';

comment on column public.transaction_attorney_assignments.instruction_declined_by
  is 'Authenticated user who declined the incoming transfer instruction.';

commit;
