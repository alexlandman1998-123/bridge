-- H1 batch 3: validated shape constraints and operational indexes.

do $$
begin
  if to_regclass('public.transactions') is not null
    and not exists (
      select 1
      from pg_constraint
      where conrelid = 'public.transactions'::regclass
        and conname = 'transactions_routing_profile_json_object_check'
    ) then
    alter table public.transactions
      add constraint transactions_routing_profile_json_object_check
      check (jsonb_typeof(routing_profile_json) = 'object') not valid;
  end if;
end
$$;
alter table if exists public.transactions
  validate constraint transactions_routing_profile_json_object_check;

create index if not exists transactions_routing_profile_version_idx
  on public.transactions (routing_profile_version)
  where routing_profile_version is not null;

create index if not exists transactions_routing_attention_idx
  on public.transactions (organisation_id, cancellation_required, updated_at desc)
  where cancellation_required = true;
