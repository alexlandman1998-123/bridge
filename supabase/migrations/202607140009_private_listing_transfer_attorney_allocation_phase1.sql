begin;

create table if not exists public.private_listing_role_players (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  private_listing_id uuid not null references public.private_listings(id) on delete cascade,
  role_type text not null default 'transfer_attorney',
  preferred_partner_id uuid references public.organisation_preferred_partners(id) on delete set null,
  partner_organisation_id uuid references public.organisations(id) on delete set null,
  company_name text not null,
  contact_person text,
  email_address text,
  phone_number text,
  selection_source text not null default 'seller_mandate',
  allocation_status text not null default 'awaiting_buyer',
  mandate_packet_id uuid references public.document_packets(id) on delete set null,
  mandate_signed_at timestamptz,
  selected_by uuid references auth.users(id) on delete set null,
  selected_at timestamptz not null default now(),
  replaced_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint private_listing_role_players_role_type_check
    check (role_type in ('transfer_attorney')),
  constraint private_listing_role_players_selection_source_check
    check (selection_source in ('seller_selected', 'agency_recommended', 'seller_mandate')),
  constraint private_listing_role_players_status_check
    check (allocation_status in ('awaiting_buyer', 'under_offer', 'instructed', 'converted', 'withdrawn', 'replaced'))
);

create unique index if not exists private_listing_role_players_active_transfer_idx
  on public.private_listing_role_players(private_listing_id, role_type)
  where allocation_status in ('awaiting_buyer', 'under_offer', 'instructed');

create index if not exists private_listing_role_players_org_status_idx
  on public.private_listing_role_players(organisation_id, allocation_status, selected_at desc);

create index if not exists private_listing_role_players_partner_org_idx
  on public.private_listing_role_players(partner_organisation_id, allocation_status, selected_at desc)
  where partner_organisation_id is not null;

create or replace function public.bridge_private_listing_role_player_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_private_listing_role_players_updated_at on public.private_listing_role_players;
create trigger trg_private_listing_role_players_updated_at
before update on public.private_listing_role_players
for each row execute function public.bridge_private_listing_role_player_set_updated_at();

create or replace function public.bridge_allocate_private_listing_transfer_attorney(
  p_private_listing_id uuid,
  p_preferred_partner_id uuid,
  p_company_name text,
  p_contact_person text default null,
  p_email_address text default null,
  p_phone_number text default null,
  p_partner_organisation_id uuid default null,
  p_selection_source text default 'seller_mandate',
  p_mandate_packet_id uuid default null,
  p_mandate_signed_at timestamptz default now(),
  p_metadata jsonb default '{}'::jsonb
)
returns public.private_listing_role_players
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_listing public.private_listings%rowtype;
  v_existing public.private_listing_role_players%rowtype;
  v_result public.private_listing_role_players%rowtype;
  v_now timestamptz := now();
  v_source text := coalesce(nullif(trim(p_selection_source), ''), 'seller_mandate');
begin
  select * into v_listing
  from public.private_listings
  where id = p_private_listing_id
  for update;

  if v_listing.id is null then
    raise exception 'Private listing not found.';
  end if;

  if not public.bridge_can_access_private_listing(p_private_listing_id) then
    raise exception 'You do not have permission to allocate an attorney to this listing.';
  end if;

  if nullif(trim(p_company_name), '') is null then
    raise exception 'A transfer attorney company is required.';
  end if;

  if v_source not in ('seller_selected', 'agency_recommended', 'seller_mandate') then
    raise exception 'Invalid attorney selection source.';
  end if;

  select * into v_existing
  from public.private_listing_role_players
  where private_listing_id = p_private_listing_id
    and role_type = 'transfer_attorney'
    and allocation_status in ('awaiting_buyer', 'under_offer', 'instructed')
  order by selected_at desc
  limit 1
  for update;

  if v_existing.id is not null
     and coalesce(v_existing.preferred_partner_id::text, '') = coalesce(p_preferred_partner_id::text, '')
     and lower(trim(v_existing.company_name)) = lower(trim(p_company_name)) then
    update public.private_listing_role_players
    set partner_organisation_id = p_partner_organisation_id,
        contact_person = nullif(trim(p_contact_person), ''),
        email_address = nullif(lower(trim(p_email_address)), ''),
        phone_number = nullif(trim(p_phone_number), ''),
        selection_source = v_source,
        allocation_status = case
          when v_existing.allocation_status in ('under_offer', 'instructed') then v_existing.allocation_status
          else 'awaiting_buyer'
        end,
        mandate_packet_id = p_mandate_packet_id,
        mandate_signed_at = coalesce(p_mandate_signed_at, v_now),
        selected_by = auth.uid(),
        metadata = coalesce(p_metadata, '{}'::jsonb),
        replaced_at = null,
        updated_at = v_now
    where id = v_existing.id
    returning * into v_result;

    return v_result;
  end if;

  if v_existing.id is not null then
    update public.private_listing_role_players
    set allocation_status = 'replaced',
        replaced_at = v_now,
        updated_at = v_now
    where id = v_existing.id;
  end if;

  insert into public.private_listing_role_players (
    organisation_id,
    private_listing_id,
    role_type,
    preferred_partner_id,
    partner_organisation_id,
    company_name,
    contact_person,
    email_address,
    phone_number,
    selection_source,
    allocation_status,
    mandate_packet_id,
    mandate_signed_at,
    selected_by,
    metadata
  ) values (
    v_listing.organisation_id,
    p_private_listing_id,
    'transfer_attorney',
    p_preferred_partner_id,
    p_partner_organisation_id,
    trim(p_company_name),
    nullif(trim(p_contact_person), ''),
    nullif(lower(trim(p_email_address)), ''),
    nullif(trim(p_phone_number), ''),
    v_source,
    'awaiting_buyer',
    p_mandate_packet_id,
    coalesce(p_mandate_signed_at, v_now),
    auth.uid(),
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning * into v_result;

  return v_result;
end;
$$;

alter table public.private_listing_role_players enable row level security;

drop policy if exists private_listing_role_players_select on public.private_listing_role_players;
create policy private_listing_role_players_select
on public.private_listing_role_players
for select
to authenticated
using (
  public.bridge_can_access_private_listing(private_listing_id)
  or (partner_organisation_id is not null and public.bridge_is_active_member(partner_organisation_id))
);

drop policy if exists private_listing_role_players_insert on public.private_listing_role_players;
create policy private_listing_role_players_insert
on public.private_listing_role_players
for insert
to authenticated
with check (public.bridge_can_access_private_listing(private_listing_id));

drop policy if exists private_listing_role_players_update on public.private_listing_role_players;
create policy private_listing_role_players_update
on public.private_listing_role_players
for update
to authenticated
using (public.bridge_can_access_private_listing(private_listing_id))
with check (public.bridge_can_access_private_listing(private_listing_id));

grant select, insert, update on public.private_listing_role_players to authenticated;
grant execute on function public.bridge_allocate_private_listing_transfer_attorney(
  uuid, uuid, text, text, text, text, uuid, text, uuid, timestamptz, jsonb
) to authenticated;

comment on table public.private_listing_role_players is
  'Listing-level role-player allocations created before a buyer transaction exists.';

comment on column public.private_listing_role_players.allocation_status is
  'Phase 1 starts at awaiting_buyer. Later phases promote the same allocation through offer and instruction states.';

insert into public.document_placeholder_registry (
  packet_type,
  placeholder_key,
  entity_scope,
  data_type,
  description,
  normalization_rule,
  example_value,
  is_required_default,
  is_active
)
values
  ('mandate', 'transfer_attorney_company_name', 'private_listing', 'text', 'Seller mandate transferring-attorney firm.', 'trim', 'Example Attorneys Inc.', false, true),
  ('mandate', 'transfer_attorney_contact_person', 'private_listing', 'text', 'Primary transferring-attorney contact.', 'trim', 'Transfer Department', false, true),
  ('mandate', 'transfer_attorney_email', 'private_listing', 'email', 'Transferring-attorney contact email.', 'lowercase_email', 'transfers@example.co.za', false, true),
  ('mandate', 'transfer_attorney_phone', 'private_listing', 'phone', 'Transferring-attorney contact telephone.', 'phone', '+27 11 555 0100', false, true)
on conflict (packet_type, placeholder_key)
do update set
  entity_scope = excluded.entity_scope,
  data_type = excluded.data_type,
  description = excluded.description,
  normalization_rule = excluded.normalization_rule,
  example_value = excluded.example_value,
  is_active = true,
  updated_at = now();

update public.document_template_sections section
set placeholder_keys = coalesce(section.placeholder_keys, array[]::text[]) || array[
      'transfer_attorney_company_name',
      'transfer_attorney_contact_person',
      'transfer_attorney_email',
      'transfer_attorney_phone'
    ]::text[],
    legal_text = case
      when section.legal_text is null then null
      when section.legal_text like '%{{transfer_attorney_company_name}}%' then section.legal_text
      else section.legal_text || E'\n\nTRANSFERRING ATTORNEY\nFirm: {{transfer_attorney_company_name}}\nContact: {{transfer_attorney_contact_person}}\nEmail: {{transfer_attorney_email}}\nPhone: {{transfer_attorney_phone}}'
    end,
    updated_at = now()
from public.document_packet_templates template
where section.template_id = template.id
  and template.packet_type = 'mandate'
  and section.section_key = 'mandate_terms'
  and not (coalesce(section.placeholder_keys, array[]::text[]) @> array['transfer_attorney_company_name']::text[]);

commit;
