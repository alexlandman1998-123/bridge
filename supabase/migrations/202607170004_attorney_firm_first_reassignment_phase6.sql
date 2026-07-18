begin;

alter table public.transaction_attorney_assignments
  add column if not exists replaces_assignment_id uuid references public.transaction_attorney_assignments(id) on delete set null,
  add column if not exists replacement_reason text,
  add column if not exists replacement_sequence integer not null default 0;

create unique index if not exists transaction_attorney_assignments_replacement_once_idx
  on public.transaction_attorney_assignments (replaces_assignment_id)
  where replaces_assignment_id is not null;

create index if not exists transaction_attorney_assignments_replacement_lineage_idx
  on public.transaction_attorney_assignments (transaction_id, attorney_role, replacement_sequence, created_at)
  where replaces_assignment_id is not null;

create or replace function public.bridge_validate_transfer_firm_replacement()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_previous public.transaction_attorney_assignments;
begin
  if tg_op = 'UPDATE' then
    if new.replaces_assignment_id is distinct from old.replaces_assignment_id then
      raise exception 'Replacement lineage cannot be changed after nomination.' using errcode = '23514';
    end if;
    return new;
  end if;

  if new.replaces_assignment_id is null then
    return new;
  end if;

  select * into v_previous
  from public.transaction_attorney_assignments
  where id = new.replaces_assignment_id;

  if v_previous.id is null then
    raise exception 'The declined transfer allocation being replaced was not found.' using errcode = '23503';
  end if;
  if v_previous.transaction_id <> new.transaction_id then
    raise exception 'A replacement must belong to the same transaction.' using errcode = '23514';
  end if;
  if coalesce(v_previous.attorney_role, '') <> 'transfer_attorney'
     or coalesce(new.attorney_role, '') <> 'transfer_attorney' then
    raise exception 'Replacement lineage is only supported for transfer firm allocations.' using errcode = '23514';
  end if;
  if coalesce(v_previous.allocation_state, '') not in ('declined', 'removed')
     and coalesce(v_previous.instruction_status, '') <> 'declined' then
    raise exception 'Only a declined or removed transfer firm allocation can be replaced.' using errcode = '23514';
  end if;
  if coalesce(v_previous.attorney_firm_id, v_previous.firm_id) = coalesce(new.attorney_firm_id, new.firm_id) then
    raise exception 'The replacement transfer firm must differ from the firm that declined.' using errcode = '23514';
  end if;
  if new.allocation_state <> 'awaiting_firm_acceptance'
     or new.firm_acceptance_status <> 'awaiting_firm_acceptance'
     or coalesce(new.attorney_user_id, new.primary_attorney_id) is not null then
    raise exception 'A replacement must begin as a pending firm-only nomination.' using errcode = '23514';
  end if;
  if trim(coalesce(new.replacement_reason, '')) = '' then
    raise exception 'A replacement reason is required.' using errcode = '23514';
  end if;

  new.replacement_sequence := greatest(coalesce(v_previous.replacement_sequence, 0) + 1, 1);
  return new;
end;
$$;

drop trigger if exists trg_validate_transfer_firm_replacement on public.transaction_attorney_assignments;
create trigger trg_validate_transfer_firm_replacement
before insert or update of replaces_assignment_id
on public.transaction_attorney_assignments
for each row execute function public.bridge_validate_transfer_firm_replacement();

comment on column public.transaction_attorney_assignments.replaces_assignment_id is
  'Phase 6 immutable lineage from a replacement firm nomination to the declined transfer allocation it supersedes.';
comment on function public.bridge_validate_transfer_firm_replacement() is
  'Enforces same-transaction, different-firm, firm-only replacement nominations while preserving the declined allocation.';

commit;
