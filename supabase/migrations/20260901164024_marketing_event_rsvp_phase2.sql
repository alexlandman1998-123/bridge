-- Marketing event RSVP, phase 2: public token-only event lookup and intake.
-- These SECURITY DEFINER functions are intentionally callable by anon; they return
-- only public event fields and accept no organisation/listing identifiers.

create table public.marketing_event_rsvps (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.marketing_events(id) on delete cascade,
  full_name text not null check (length(btrim(full_name)) between 2 and 160),
  email text not null check (length(btrim(email)) between 3 and 320),
  mobile text not null check (length(btrim(mobile)) between 5 and 40),
  guest_count smallint not null default 1 check (guest_count between 1 and 6),
  note text check (length(note) <= 1000),
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, email)
);

create index marketing_event_rsvps_event_status_idx on public.marketing_event_rsvps (event_id, status, submitted_at desc);
alter table public.marketing_event_rsvps enable row level security;
revoke all on public.marketing_event_rsvps from anon, authenticated;

create or replace function public.marketing_event_rsvps_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger marketing_event_rsvps_updated_at
before update on public.marketing_event_rsvps
for each row execute function public.marketing_event_rsvps_set_updated_at();

create or replace function public.get_marketing_event_rsvp(p_token text)
returns table (
  event_id uuid,
  event_type text,
  title text,
  location text,
  address text,
  timezone text,
  starts_at timestamptz,
  ends_at timestamptz,
  image_url text,
  description text
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.event_type, e.title, e.location, e.address, e.timezone, e.starts_at, e.ends_at, e.image_url, e.description
  from public.marketing_events e
  where e.public_token = btrim(coalesce(p_token, ''))
    and e.status in ('planning', 'upcoming')
  limit 1;
$$;

create or replace function public.submit_marketing_event_rsvp(
  p_token text,
  p_full_name text,
  p_email text,
  p_mobile text,
  p_guest_count smallint default 1,
  p_note text default null
)
returns table (rsvp_id uuid, event_id uuid, status text, duplicate boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.marketing_events%rowtype;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_rsvp public.marketing_event_rsvps%rowtype;
  v_duplicate boolean := false;
begin
  if length(btrim(coalesce(p_full_name, ''))) < 2 or length(v_email) < 3 or position('@' in v_email) = 0 or length(btrim(coalesce(p_mobile, ''))) < 5 then
    raise exception 'Enter your name, email address, and mobile number.' using errcode = '22023';
  end if;
  select * into v_event from public.marketing_events where public_token = btrim(coalesce(p_token, '')) and status in ('planning', 'upcoming') limit 1;
  if not found then raise exception 'This RSVP link is invalid, expired, or unavailable.' using errcode = '22023'; end if;
  select exists(select 1 from public.marketing_event_rsvps r where r.event_id = v_event.id and r.email = v_email) into v_duplicate;

  insert into public.marketing_event_rsvps (event_id, full_name, email, mobile, guest_count, note)
  values (v_event.id, btrim(p_full_name), v_email, btrim(p_mobile), greatest(1, least(coalesce(p_guest_count, 1), 6)), nullif(btrim(coalesce(p_note, '')), ''))
  on conflict (event_id, email) do update
    set full_name = excluded.full_name, mobile = excluded.mobile, guest_count = excluded.guest_count, note = excluded.note, status = 'confirmed'
  returning * into v_rsvp;

  return query select v_rsvp.id, v_event.id, v_rsvp.status, v_duplicate;
end;
$$;

revoke execute on function public.get_marketing_event_rsvp(text) from public, authenticated;
revoke execute on function public.submit_marketing_event_rsvp(text, text, text, text, smallint, text) from public, authenticated;
grant execute on function public.get_marketing_event_rsvp(text) to anon;
grant execute on function public.submit_marketing_event_rsvp(text, text, text, text, smallint, text) to anon;
