begin;

create table if not exists public.rental_move_in_readiness_items (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null references public.rental_tenancies(id) on delete cascade,
  lease_id uuid not null references public.rental_leases(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  obligation_type text not null check (obligation_type in ('deposit', 'first_rent')),
  required_amount numeric(14,2) not null default 0 check (required_amount >= 0),
  received_amount numeric(14,2) not null default 0 check (received_amount >= 0),
  status text not null default 'required' check (status in ('required', 'partial', 'received', 'verified', 'waived')),
  evidence_link text,
  exception_reason text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(lease_id, obligation_type)
);
create index if not exists rental_move_in_readiness_tenancy_idx on public.rental_move_in_readiness_items(tenancy_id, status, obligation_type);

create table if not exists public.rental_move_in_readiness_events (
  id uuid primary key default gen_random_uuid(),
  readiness_item_id uuid not null references public.rental_move_in_readiness_items(id) on delete cascade,
  tenancy_id uuid not null references public.rental_tenancies(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  from_status text,
  to_status text not null,
  received_amount numeric(14,2) not null default 0,
  evidence_json jsonb not null default '{}'::jsonb,
  occurred_by uuid not null references auth.users(id) on delete restrict,
  occurred_at timestamptz not null default now()
);
create index if not exists rental_move_in_readiness_events_item_idx on public.rental_move_in_readiness_events(readiness_item_id, occurred_at desc);

create or replace function public.rental_seed_lease_move_in_readiness()
returns trigger language plpgsql security definer set search_path = '' as $$
declare tenancy_id uuid;
begin
  select tenancy_id into tenancy_id from public.rental_leases where id = new.id;
  insert into public.rental_move_in_readiness_items(tenancy_id, lease_id, organisation_id, obligation_type, required_amount)
  values
    (tenancy_id, new.id, new.organisation_id, 'deposit', coalesce(nullif(new.terms_json ->> 'deposit_amount', '')::numeric, 0)),
    (tenancy_id, new.id, new.organisation_id, 'first_rent', coalesce(nullif(new.terms_json ->> 'monthly_rent', '')::numeric, 0))
  on conflict (lease_id, obligation_type) do update set required_amount = excluded.required_amount
    where public.rental_move_in_readiness_items.status in ('required', 'partial');
  return new;
end; $$;
revoke execute on function public.rental_seed_lease_move_in_readiness() from public, anon, authenticated;
drop trigger if exists trg_rental_leases_seed_move_in_readiness on public.rental_leases;
create trigger trg_rental_leases_seed_move_in_readiness after insert or update of terms_json on public.rental_leases for each row execute function public.rental_seed_lease_move_in_readiness();

insert into public.rental_move_in_readiness_items(tenancy_id, lease_id, organisation_id, obligation_type, required_amount)
select lease.tenancy_id, lease.id, lease.organisation_id, obligations.obligation_type, obligations.required_amount
from public.rental_leases lease
cross join lateral (values ('deposit'::text, coalesce(nullif(lease.terms_json ->> 'deposit_amount', '')::numeric, 0)), ('first_rent'::text, coalesce(nullif(lease.terms_json ->> 'monthly_rent', '')::numeric, 0))) as obligations(obligation_type, required_amount)
on conflict (lease_id, obligation_type) do nothing;

alter table public.rental_move_in_readiness_items enable row level security;
alter table public.rental_move_in_readiness_events enable row level security;
revoke all on public.rental_move_in_readiness_items, public.rental_move_in_readiness_events from anon, authenticated;
grant select on public.rental_move_in_readiness_items, public.rental_move_in_readiness_events to authenticated;
create policy rental_move_in_readiness_items_staff_read on public.rental_move_in_readiness_items for select to authenticated using (exists (select 1 from public.rental_tenancies tenancy join public.rental_properties property on property.id = tenancy.property_id where tenancy.id = tenancy_id and public.rental_branch_access(property.organisation_id, property.branch_id)));
create policy rental_move_in_readiness_events_staff_read on public.rental_move_in_readiness_events for select to authenticated using (exists (select 1 from public.rental_tenancies tenancy join public.rental_properties property on property.id = tenancy.property_id where tenancy.id = tenancy_id and public.rental_branch_access(property.organisation_id, property.branch_id)));

create or replace function public.rental_record_move_in_readiness(p_readiness_item_id uuid, p_status text, p_received_amount numeric default null, p_evidence_link text default null, p_exception_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare item_row public.rental_move_in_readiness_items%rowtype; resulting_amount numeric; prior_status text;
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;
  if p_status not in ('required', 'partial', 'received', 'verified', 'waived') then raise exception 'Invalid readiness status'; end if;
  select item.* into item_row from public.rental_move_in_readiness_items item where item.id = p_readiness_item_id for update;
  if not found then raise exception 'Move-in readiness item not found'; end if;
  if not exists (select 1 from public.rental_tenancies tenancy join public.rental_properties property on property.id = tenancy.property_id where tenancy.id = item_row.tenancy_id and public.rental_branch_access(property.organisation_id, property.branch_id)) then raise exception 'You are not authorized for this tenancy'; end if;
  if p_status = 'waived' and not public.bridge_is_org_admin(item_row.organisation_id) then raise exception 'Only an organisation administrator may waive a move-in obligation'; end if;
  resulting_amount := coalesce(p_received_amount, item_row.received_amount);
  if resulting_amount < 0 then raise exception 'Received amount cannot be negative'; end if;
  if p_status in ('received', 'verified') and length(btrim(coalesce(p_evidence_link, item_row.evidence_link, ''))) = 0 then raise exception 'Evidence link is required for received or verified readiness'; end if;
  if p_status = 'verified' and resulting_amount < item_row.required_amount then raise exception 'Verified amount cannot be below the required amount'; end if;
  if p_status = 'waived' and length(btrim(coalesce(p_exception_reason, ''))) = 0 then raise exception 'A waiver reason is required'; end if;
  prior_status := item_row.status;
  update public.rental_move_in_readiness_items set status = p_status, received_amount = resulting_amount, evidence_link = coalesce(nullif(btrim(coalesce(p_evidence_link, '')), ''), evidence_link), exception_reason = case when p_status = 'waived' then btrim(p_exception_reason) else nullif(btrim(coalesce(p_exception_reason, '')), '') end, reviewed_by = auth.uid(), reviewed_at = now() where id = item_row.id;
  insert into public.rental_move_in_readiness_events(readiness_item_id, tenancy_id, organisation_id, from_status, to_status, received_amount, evidence_json, occurred_by) values (item_row.id, item_row.tenancy_id, item_row.organisation_id, prior_status, p_status, resulting_amount, jsonb_build_object('evidence_link', nullif(btrim(coalesce(p_evidence_link, '')), ''), 'exception_reason', nullif(btrim(coalesce(p_exception_reason, '')), '')), auth.uid());
  return jsonb_build_object('id', item_row.id, 'status', p_status, 'received_amount', resulting_amount);
end; $$;

create or replace function public.rental_assert_tenancy_activation_ready(p_tenancy_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare blockers jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;
  if not exists (select 1 from public.rental_tenancies tenancy join public.rental_properties property on property.id = tenancy.property_id where tenancy.id = p_tenancy_id and public.rental_branch_access(property.organisation_id, property.branch_id)) then raise exception 'You are not authorized for this tenancy'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('type', obligation_type, 'status', status, 'required_amount', required_amount, 'received_amount', received_amount) order by obligation_type) filter (where status not in ('verified', 'waived')), '[]'::jsonb) into blockers from public.rental_move_in_readiness_items where tenancy_id = p_tenancy_id;
  if jsonb_array_length(blockers) > 0 then raise exception 'Move-in readiness is incomplete: %', blockers; end if;
  return jsonb_build_object('ready', true, 'tenancy_id', p_tenancy_id);
end; $$;

revoke execute on function public.rental_record_move_in_readiness(uuid, text, numeric, text, text) from public, anon;
revoke execute on function public.rental_assert_tenancy_activation_ready(uuid) from public, anon;
grant execute on function public.rental_record_move_in_readiness(uuid, text, numeric, text, text) to authenticated;
grant execute on function public.rental_assert_tenancy_activation_ready(uuid) to authenticated;

drop trigger if exists trg_rental_move_in_readiness_items_updated_at on public.rental_move_in_readiness_items;
create trigger trg_rental_move_in_readiness_items_updated_at before update on public.rental_move_in_readiness_items for each row execute function public.rental_set_updated_at();

commit;
