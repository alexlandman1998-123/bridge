-- Rentals Phase 43 repair: atomic reminder queue using immutable stored UTC dedupe date.
begin;

create table public.rental_collection_preferences (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete restrict,
  tenancy_id uuid not null unique references public.rental_tenancies(id) on delete restrict,
  channel text not null default 'email' check(channel in ('email','sms','whatsapp','none')),
  timezone text not null default 'Africa/Johannesburg', suppressed_until timestamptz, suppression_reason text,
  updated_by uuid references auth.users(id) on delete set null, updated_at timestamptz not null default now()
);
create table public.rental_collection_reminders (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete restrict,
  tenancy_id uuid not null references public.rental_tenancies(id) on delete restrict,
  reminder_stage text not null check(reminder_stage in ('current','overdue_7','overdue_30','overdue_60','overdue_90')),
  channel text not null check(channel in ('email','sms','whatsapp')), status text not null default 'queued' check(status in ('queued','sent','suppressed','cancelled')),
  balance_snapshot numeric(14,2) not null, scheduled_for timestamptz not null default now(), dedupe_date date not null default ((now() at time zone 'UTC')::date),
  sent_at timestamptz, suppressed_reason text, created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(), unique(tenancy_id, reminder_stage, dedupe_date)
);
create index rental_collection_reminders_queue_idx on public.rental_collection_reminders(organisation_id,status,scheduled_for);
alter table public.rental_collection_preferences enable row level security; alter table public.rental_collection_reminders enable row level security;
revoke all on public.rental_collection_preferences, public.rental_collection_reminders from anon, authenticated;
grant select on public.rental_collection_preferences, public.rental_collection_reminders to authenticated;
create policy rental_collection_preferences_read on public.rental_collection_preferences for select to authenticated using (exists(select 1 from public.rental_tenancies t join public.rental_properties p on p.id=t.property_id where t.id=tenancy_id and public.rental_branch_access(p.organisation_id,p.branch_id)));
create policy rental_collection_reminders_read on public.rental_collection_reminders for select to authenticated using (exists(select 1 from public.rental_tenancies t join public.rental_properties p on p.id=t.property_id where t.id=tenancy_id and public.rental_branch_access(p.organisation_id,p.branch_id)));

create or replace function public.rental_tenancy_live_outstanding(p_tenancy_id uuid) returns numeric language sql stable security definer set search_path='' as $$
 select coalesce((select sum(amount) from public.rental_financial_charges where tenancy_id=p_tenancy_id),0)-coalesce((select sum(amount) from public.rental_financial_allocations where tenancy_id=p_tenancy_id),0)+coalesce((select sum(amount) from public.rental_financial_adjustments where tenancy_id=p_tenancy_id and adjustment_type='debit'),0)-coalesce((select sum(amount) from public.rental_financial_adjustments where tenancy_id=p_tenancy_id and adjustment_type='credit'),0)
$$;
create or replace function public.rental_queue_collection_reminder(p_tenancy_id uuid,p_stage text) returns jsonb language plpgsql security definer set search_path='' as $$
declare tenancy_row public.rental_tenancies%rowtype; preference_row public.rental_collection_preferences%rowtype; balance numeric; reminder_id uuid; reminder_status text := 'queued'; reminder_channel text := 'email'; reason text;
begin
 if auth.uid() is null or p_stage not in ('current','overdue_7','overdue_30','overdue_60','overdue_90') then raise exception 'A valid reminder stage is required'; end if;
 select * into tenancy_row from public.rental_tenancies where id=p_tenancy_id for update;
 if not found or not exists(select 1 from public.rental_properties p where p.id=tenancy_row.property_id and public.rental_branch_access(p.organisation_id,p.branch_id)) then raise exception 'Not authorized'; end if;
 balance:=public.rental_tenancy_live_outstanding(tenancy_row.id); if balance<=0 then raise exception 'No reminder: tenancy has no live outstanding balance'; end if;
 select * into preference_row from public.rental_collection_preferences where tenancy_id=tenancy_row.id;
 if found then reminder_channel:=preference_row.channel; end if;
 if reminder_channel='none' or (preference_row.suppressed_until is not null and preference_row.suppressed_until>now()) then reminder_status:='suppressed'; reason:=coalesce(preference_row.suppression_reason,'Reminder suppressed by preference'); reminder_channel:='email'; end if;
 insert into public.rental_collection_reminders(organisation_id,tenancy_id,reminder_stage,channel,status,balance_snapshot,suppressed_reason,created_by) values(tenancy_row.organisation_id,tenancy_row.id,p_stage,reminder_channel,reminder_status,balance,reason,auth.uid()) on conflict(tenancy_id,reminder_stage,dedupe_date) do nothing returning id into reminder_id;
 return jsonb_build_object('reminder_id',reminder_id,'status',reminder_status,'live_balance',balance,'deduplicated',reminder_id is null);
end$$;
create or replace function public.rental_send_collection_reminder(p_reminder_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare reminder_row public.rental_collection_reminders%rowtype; balance numeric;
begin
 select * into reminder_row from public.rental_collection_reminders where id=p_reminder_id for update; if not found then raise exception 'Reminder not found'; end if;
 balance:=public.rental_tenancy_live_outstanding(reminder_row.tenancy_id);
 if reminder_row.status<>'queued' then return jsonb_build_object('reminder_id',reminder_row.id,'status',reminder_row.status,'idempotent',true); end if;
 if balance<=0 then update public.rental_collection_reminders set status='cancelled',suppressed_reason='Balance cleared before send' where id=reminder_row.id; return jsonb_build_object('reminder_id',reminder_row.id,'status','cancelled'); end if;
 update public.rental_collection_reminders set status='sent',sent_at=now(),balance_snapshot=balance where id=reminder_row.id;
 return jsonb_build_object('reminder_id',reminder_row.id,'status','sent','live_balance',balance);
end$$;
create or replace function public.rental_suppress_collection_reminders(p_tenancy_id uuid,p_until timestamptz,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare tenancy_row public.rental_tenancies%rowtype;
begin
 if auth.uid() is null or p_until is null or p_until<=now() or length(btrim(coalesce(p_reason,'')))=0 then raise exception 'Future suppression end and reason are required'; end if;
 select * into tenancy_row from public.rental_tenancies where id=p_tenancy_id for update;
 if not found or not exists(select 1 from public.rental_properties p where p.id=tenancy_row.property_id and public.rental_branch_access(p.organisation_id,p.branch_id)) then raise exception 'Not authorized'; end if;
 insert into public.rental_collection_preferences(organisation_id,tenancy_id,suppressed_until,suppression_reason,updated_by) values(tenancy_row.organisation_id,tenancy_row.id,p_until,btrim(p_reason),auth.uid()) on conflict(tenancy_id) do update set suppressed_until=excluded.suppressed_until,suppression_reason=excluded.suppression_reason,updated_by=excluded.updated_by,updated_at=now();
 return jsonb_build_object('tenancy_id',tenancy_row.id,'suppressed_until',p_until);
end$$;
revoke execute on function public.rental_tenancy_live_outstanding(uuid), public.rental_queue_collection_reminder(uuid,text), public.rental_send_collection_reminder(uuid), public.rental_suppress_collection_reminders(uuid,timestamptz,text) from public, anon;
grant execute on function public.rental_queue_collection_reminder(uuid,text), public.rental_send_collection_reminder(uuid), public.rental_suppress_collection_reminders(uuid,timestamptz,text) to authenticated;
commit;
