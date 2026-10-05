begin;

-- A server-owned journal is committed BEFORE sending a rental to a provider.
-- An unresolved attempt never expires automatically: elapsed time is not proof
-- that a provider rejected it. Concurrent requests cannot both acquire this slot.
create table public.rental_publication_attempts (
 id uuid primary key default gen_random_uuid(),
 private_listing_id uuid not null references public.private_listings(id) on delete restrict,
 organisation_id uuid not null,
 channel text not null check(channel in ('property24','private_property')),
 environment text not null check(environment in ('production','exdev','sandbox')),
 operation text not null check(operation in ('publish','status_update')),
 state text not null default 'dispatching' check(state in ('dispatching','uncertain','accepted','rejected','reconciled')),
 identity jsonb not null check(jsonb_typeof(identity)='object'),
 payload_digest text not null,
 receipt jsonb not null default '{}'::jsonb check(jsonb_typeof(receipt)='object'),
 last_error text,
 started_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 resolved_at timestamptz
);
create unique index rental_publication_unresolved_slot on public.rental_publication_attempts(private_listing_id,channel,environment)
 where state in ('dispatching','uncertain');
create index rental_publication_listing_history on public.rental_publication_attempts(private_listing_id,channel,environment,started_at desc);
alter table public.rental_publication_attempts enable row level security;
revoke all on public.rental_publication_attempts from public,anon,authenticated;
grant select on public.rental_publication_attempts to authenticated;
create policy rental_publication_read on public.rental_publication_attempts for select to authenticated
 using(public.bridge_can_access_private_listing(private_listing_id));
-- Browsers cannot claim a submission, forge its receipt or release a pending slot.
-- Provider mutations already authenticate and authorise the exact listing server-side.
grant select,insert,update on public.rental_publication_attempts to service_role;
commit;
