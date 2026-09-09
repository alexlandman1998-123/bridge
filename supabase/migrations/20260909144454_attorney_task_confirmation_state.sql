begin;

create table if not exists public.attorney_task_confirmations (
  step_id uuid primary key references public.transaction_subprocess_steps(id) on delete cascade,
  subprocess_id uuid not null references public.transaction_subprocesses(id) on delete cascade,
  task_confirmations jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create index if not exists attorney_task_confirmations_subprocess_idx
  on public.attorney_task_confirmations(subprocess_id);
alter table public.attorney_task_confirmations enable row level security;
revoke all on public.attorney_task_confirmations from public, anon, authenticated;
grant select on public.attorney_task_confirmations to authenticated;
create policy attorney_task_confirmations_read on public.attorney_task_confirmations
for select to authenticated using (
  exists (select 1 from public.transaction_subprocesses lane
    where lane.id = attorney_task_confirmations.subprocess_id
      and public.bridge_can_mutate_attorney_lane(lane.transaction_id,
        public.bridge_attorney_lane_role(lane.process_type), 'workflow'))
);

-- Retain current answers with the step, in the same transaction as the
-- existing authorised workflow mutation and its audit record.
create or replace function public.bridge_persist_task_confirmations()
returns trigger language plpgsql security invoker set search_path = public as $$
declare
  responses jsonb := new.metadata #> '{workPacket,taskConfirmations}';
  entry record;
begin
  if responses is null then return new; end if;
  if jsonb_typeof(responses) <> 'object' then raise exception 'Task confirmations must be an object'; end if;
  for entry in select * from jsonb_each(responses) loop
    if jsonb_typeof(entry.value) <> 'object'
       or coalesce(entry.value->>'answer', '') not in ('yes', 'no', 'not_applicable') then
      raise exception 'Invalid task confirmation answer';
    end if;
  end loop;
  insert into public.attorney_task_confirmations(step_id, subprocess_id, task_confirmations)
  select id, subprocess_id, responses from public.transaction_subprocess_steps
   where id = (new.metadata->>'stepId')::uuid and subprocess_id = new.subprocess_id
  on conflict (step_id) do update set task_confirmations = excluded.task_confirmations, updated_at = now();
  if not found then raise exception 'Task confirmation target not found'; end if;
  return new;
end;
$$;

revoke all on function public.bridge_persist_task_confirmations() from public, anon, authenticated;
drop trigger if exists persist_task_confirmations on public.transaction_attorney_lane_history;
create trigger persist_task_confirmations after insert on public.transaction_attorney_lane_history
for each row execute function public.bridge_persist_task_confirmations();

commit;
