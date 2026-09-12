begin;

-- Phase 1 keeps the marketing audience tied to the deduplicated CRM projection.
-- Dynamic audiences retain rules; static audiences retain an explicit member set.
alter table public.email_saved_audiences
  add column if not exists audience_kind text not null default 'dynamic'
    check (audience_kind in ('dynamic','static')),
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

create table if not exists public.email_contact_tags (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (length(btrim(name)) between 1 and 80),
  colour text not null default '#0f7a57' check (colour ~ '^#[0-9A-Fa-f]{6}$'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, slug),
  unique (organisation_id, name)
);

create table if not exists public.email_marketing_contact_tags (
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  contact_id uuid not null references public.email_marketing_contacts(id) on delete cascade,
  tag_id uuid not null references public.email_contact_tags(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (contact_id, tag_id)
);

create table if not exists public.email_saved_audience_members (
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  audience_id uuid not null references public.email_saved_audiences(id) on delete cascade,
  contact_id uuid not null references public.email_marketing_contacts(id) on delete cascade,
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (audience_id, contact_id)
);

create index if not exists email_contact_tags_org_name_idx on public.email_contact_tags (organisation_id, name);
create index if not exists email_marketing_contact_tags_org_tag_idx on public.email_marketing_contact_tags (organisation_id, tag_id, contact_id);
create index if not exists email_saved_audience_members_org_audience_idx on public.email_saved_audience_members (organisation_id, audience_id, contact_id);

-- Keep legacy projection tags useful while moving all new edits to the relational
-- model. A static audience can be addressed later as { audience_id: uuid }.
create or replace function public.email_saved_audience_set_members(
  p_audience_id uuid,
  p_contact_ids uuid[]
) returns integer
language plpgsql security invoker set search_path = '' as $$
declare v_audience public.email_saved_audiences%rowtype;
begin
  select * into v_audience from public.email_saved_audiences where id = p_audience_id for update;
  if not found or not public.bridge_has_organisation_membership(v_audience.organisation_id) then
    raise exception 'Not authorised.' using errcode = '42501';
  end if;
  if v_audience.audience_kind <> 'static' then
    raise exception 'Only static audiences can have explicit members.' using errcode = '22023';
  end if;
  delete from public.email_saved_audience_members where audience_id = p_audience_id;
  insert into public.email_saved_audience_members (organisation_id, audience_id, contact_id, added_by)
  select v_audience.organisation_id, p_audience_id, c.id, auth.uid()
  from public.email_marketing_contacts c
  where c.organisation_id = v_audience.organisation_id
    and c.id = any(coalesce(p_contact_ids, '{}'::uuid[]));
  return cardinality(coalesce(p_contact_ids, '{}'::uuid[]));
end $$;

alter table public.email_contact_tags enable row level security;
alter table public.email_marketing_contact_tags enable row level security;
alter table public.email_saved_audience_members enable row level security;

grant select, insert, update, delete on public.email_contact_tags, public.email_marketing_contact_tags, public.email_saved_audience_members to authenticated;
grant execute on function public.email_saved_audience_set_members(uuid, uuid[]) to authenticated;

create policy email_contact_tags_member on public.email_contact_tags for all to authenticated
  using (public.bridge_has_organisation_membership(organisation_id))
  with check (public.bridge_has_organisation_membership(organisation_id));
create policy email_marketing_contact_tags_member on public.email_marketing_contact_tags for all to authenticated
  using (public.bridge_has_organisation_membership(organisation_id))
  with check (public.bridge_has_organisation_membership(organisation_id));
create policy email_saved_audience_members_member on public.email_saved_audience_members for all to authenticated
  using (public.bridge_has_organisation_membership(organisation_id))
  with check (public.bridge_has_organisation_membership(organisation_id));

commit;
