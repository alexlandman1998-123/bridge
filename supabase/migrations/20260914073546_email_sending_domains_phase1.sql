begin;

-- A sending domain belongs to one Arch9 organisation, while the provider
-- account remains central. DNS record contents are provider-generated and are
-- only ever updated by server-side provider integrations in later phases.
create table public.email_sending_domains (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  provider text not null default 'resend' check (provider in ('resend')),
  domain_name text not null check (
    domain_name = lower(btrim(domain_name))
    and domain_name !~ '[@[:space:]]'
    and position('.' in domain_name) > 1
  ),
  provider_domain_id text,
  verification_status text not null default 'pending'
    check (verification_status in ('pending', 'verified', 'failed', 'disabled')),
  dns_records jsonb not null default '[]'::jsonb
    check (jsonb_typeof(dns_records) = 'array'),
  last_provider_error text,
  verification_requested_at timestamptz,
  last_checked_at timestamptz,
  verified_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, domain_name)
);

create unique index email_sending_domains_provider_id_unique_idx
  on public.email_sending_domains (provider, provider_domain_id)
  where provider_domain_id is not null;
create index email_sending_domains_org_status_idx
  on public.email_sending_domains (organisation_id, verification_status, updated_at desc);

alter table public.email_sender_identities
  add column email_sending_domain_id uuid references public.email_sending_domains(id) on delete restrict;
create index email_sender_identities_sending_domain_idx
  on public.email_sender_identities (email_sending_domain_id);

-- Preserve existing identities without granting a browser client the ability
-- to claim another organisation's domain. If historic data contains the same
-- domain in more than one organisation, only the existing owner is linked and
-- the other identity remains safely unlinked for later review.
insert into public.email_sending_domains (
  organisation_id, provider, domain_name, verification_status, verified_at, last_checked_at, created_by
)
select distinct on (identity_row.provider, identity_row.domain_name)
  identity_row.organisation_id,
  identity_row.provider,
  identity_row.domain_name,
  identity_row.verification_status,
  identity_row.verified_at,
  identity_row.last_verified_at,
  identity_row.created_by
from public.email_sender_identities identity_row
where identity_row.domain_name is not null and identity_row.domain_name <> ''
order by identity_row.provider, identity_row.domain_name, identity_row.created_at
on conflict (provider, domain_name) do nothing;

update public.email_sender_identities identity_row
set email_sending_domain_id = domain.id
from public.email_sending_domains domain
where identity_row.email_sending_domain_id is null
  and domain.organisation_id = identity_row.organisation_id
  and domain.provider = identity_row.provider
  and domain.domain_name = identity_row.domain_name;

create or replace function public.email_sender_identity_enforce_sending_domain()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  linked_domain public.email_sending_domains%rowtype;
begin
  if new.email_sending_domain_id is null then
    return new;
  end if;

  select * into linked_domain
  from public.email_sending_domains
  where id = new.email_sending_domain_id;

  if not found
    or linked_domain.organisation_id <> new.organisation_id
    or linked_domain.provider <> new.provider
    or linked_domain.domain_name <> new.domain_name then
    raise exception 'Sender identity must be linked to its organisation’s matching sending domain.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger email_sender_identities_sending_domain_guard
before insert or update of organisation_id, provider, from_email, email_sending_domain_id
on public.email_sender_identities
for each row execute function public.email_sender_identity_enforce_sending_domain();

create trigger email_sending_domains_updated
before update on public.email_sending_domains
for each row execute function public.email_campaign_set_updated_at();

alter table public.email_sending_domains enable row level security;
revoke all on table public.email_sending_domains from public, anon, authenticated;
grant select on table public.email_sending_domains to authenticated;

create policy email_sending_domains_read_member
on public.email_sending_domains
for select to authenticated
using ((select public.bridge_has_organisation_membership(organisation_id)));

revoke all on function public.email_sender_identity_enforce_sending_domain() from public, anon, authenticated;

commit;
