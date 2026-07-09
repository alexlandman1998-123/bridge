begin;

alter table if exists public.transaction_attorney_assignments
  add column if not exists instruction_accepted_at timestamptz,
  add column if not exists instruction_accepted_by uuid references auth.users(id) on delete set null,
  add column if not exists instruction_decision_note text,
  add column if not exists instruction_decision_source text;

create index if not exists transaction_attorney_assignments_instruction_acceptance_idx
  on public.transaction_attorney_assignments (attorney_firm_id, instruction_accepted_at desc)
  where instruction_status = 'accepted';

comment on column public.transaction_attorney_assignments.instruction_accepted_at
  is 'Timestamp when the attorney firm accepted an incoming transfer instruction into active matter work.';

comment on column public.transaction_attorney_assignments.instruction_accepted_by
  is 'Authenticated user who accepted the incoming transfer instruction.';

comment on column public.transaction_attorney_assignments.instruction_decision_note
  is 'Optional note captured when the incoming transfer instruction was accepted or otherwise decided.';

comment on column public.transaction_attorney_assignments.instruction_decision_source
  is 'Application surface or automation that made the incoming instruction decision.';

commit;
