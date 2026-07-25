begin;

revoke all on table public.transaction_participant_requirements from public, anon, authenticated;
grant select on table public.transaction_participant_requirements to authenticated;

comment on table public.transaction_participant_requirements is
  'Phase 25 least-privilege correction: members may read through RLS; transaction creation helpers remain the only write boundary.';

commit;
