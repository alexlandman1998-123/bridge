-- Universal legal matter numbers for transactions.
-- The UUID remains the internal identifier; matter_number is the stable
-- attorney-facing reference used in emails, PDFs, support, and daily ops.

create table if not exists public.matter_number_sequences (
  matter_year integer primary key,
  last_value bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.transactions
  add column if not exists matter_number text;

create unique index if not exists transactions_matter_number_uidx
  on public.transactions (matter_number)
  where matter_number is not null;

create or replace function public.next_matter_number(
  p_matter_year integer default extract(year from now())::integer,
  p_prefix text default 'MAT'
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year integer := coalesce(p_matter_year, extract(year from now())::integer);
  v_prefix text := coalesce(nullif(trim(p_prefix), ''), 'MAT');
  v_next bigint;
begin
  insert into public.matter_number_sequences (matter_year, last_value)
  values (v_year, 1)
  on conflict (matter_year)
  do update
    set last_value = public.matter_number_sequences.last_value + 1,
        updated_at = now()
  returning last_value into v_next;

  return format('%s-%s-%s', v_prefix, v_year, lpad(v_next::text, 6, '0'));
end;
$$;

create or replace function public.assign_transaction_matter_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(trim(new.matter_number), '') is null then
    new.matter_number := public.next_matter_number(
      coalesce(extract(year from new.created_at)::integer, extract(year from now())::integer),
      'MAT'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_assign_transaction_matter_number on public.transactions;
create trigger trg_assign_transaction_matter_number
before insert on public.transactions
for each row
execute function public.assign_transaction_matter_number();

with numbered as (
  select
    id,
    coalesce(extract(year from created_at)::integer, extract(year from now())::integer) as matter_year,
    row_number() over (
      partition by coalesce(extract(year from created_at)::integer, extract(year from now())::integer)
      order by created_at nulls first, id
    ) as sequence_value
  from public.transactions
  where nullif(trim(matter_number), '') is null
)
update public.transactions t
set matter_number = format('MAT-%s-%s', numbered.matter_year, lpad(numbered.sequence_value::text, 6, '0'))
from numbered
where t.id = numbered.id;

insert into public.matter_number_sequences (matter_year, last_value)
select
  split_part(matter_number, '-', 2)::integer as matter_year,
  max(split_part(matter_number, '-', 3)::bigint) as last_value
from public.transactions
where matter_number ~ '^MAT-[0-9]{4}-[0-9]+$'
group by 1
on conflict (matter_year)
do update
  set last_value = greatest(public.matter_number_sequences.last_value, excluded.last_value),
      updated_at = now();

grant select on public.matter_number_sequences to authenticated;
