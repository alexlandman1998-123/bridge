begin;

alter table public.organisation_preferred_partners
  drop constraint if exists organisation_preferred_partners_partner_type_check;
alter table public.organisation_preferred_partners
  add constraint organisation_preferred_partners_partner_type_check
  check (partner_type in (
    'agency',
    'bond_originator',
    'transfer_attorney',
    'bond_attorney',
    'cancellation_attorney'
  ));

alter table public.partner_invitations
  add column if not exists external_partner_id uuid
    references public.organisation_preferred_partners(id) on delete set null;

create table if not exists public.partner_identity_aliases (
  alias_partner_id uuid primary key,
  canonical_partner_id uuid not null
    references public.organisation_preferred_partners(id) on delete restrict,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  reason text not null,
  invitation_id uuid references public.partner_invitations(id) on delete set null,
  merged_at timestamptz not null default now(),
  merged_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  constraint partner_identity_aliases_not_self
    check (alias_partner_id <> canonical_partner_id)
);

comment on table public.partner_identity_aliases is
  'Audit trail for organisation_preferred_partners IDs replaced during deterministic partner identity deduplication.';

create index if not exists partner_identity_aliases_canonical_idx
  on public.partner_identity_aliases (canonical_partner_id);

create or replace function public.bridge_merge_preferred_partner_identity(
  p_canonical_id uuid,
  p_duplicate_id uuid,
  p_reason text,
  p_invitation_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_canonical public.organisation_preferred_partners%rowtype;
  v_duplicate public.organisation_preferred_partners%rowtype;
begin
  if p_canonical_id is null or p_duplicate_id is null or p_canonical_id = p_duplicate_id then
    return p_canonical_id;
  end if;

  select * into v_canonical
  from public.organisation_preferred_partners
  where id = p_canonical_id
  for update;

  select * into v_duplicate
  from public.organisation_preferred_partners
  where id = p_duplicate_id
  for update;

  if v_canonical.id is null then return v_duplicate.id; end if;
  if v_duplicate.id is null then return v_canonical.id; end if;

  if v_canonical.organisation_id <> v_duplicate.organisation_id
     or v_canonical.partner_type <> v_duplicate.partner_type then
    raise exception 'Partner identities must have the same owner and role.' using errcode = '23514';
  end if;

  update public.transaction_role_players
  set preferred_partner_id = v_canonical.id
  where preferred_partner_id = v_duplicate.id;

  update public.private_listing_role_players
  set preferred_partner_id = v_canonical.id
  where preferred_partner_id = v_duplicate.id;

  update public.partner_invitations
  set external_partner_id = v_canonical.id
  where external_partner_id = v_duplicate.id;

  update public.organisation_preferred_partners
  set partner_organisation_id = coalesce(v_canonical.partner_organisation_id, v_duplicate.partner_organisation_id),
      developer_partner_relationship_id = coalesce(v_canonical.developer_partner_relationship_id, v_duplicate.developer_partner_relationship_id),
      company_name = coalesce(nullif(trim(v_canonical.company_name), ''), v_duplicate.company_name),
      contact_person = coalesce(nullif(trim(v_canonical.contact_person), ''), v_duplicate.contact_person),
      email_address = coalesce(nullif(lower(trim(v_canonical.email_address)), ''), nullif(lower(trim(v_duplicate.email_address)), '')),
      phone_number = coalesce(nullif(trim(v_canonical.phone_number), ''), v_duplicate.phone_number),
      website = coalesce(nullif(trim(v_canonical.website), ''), v_duplicate.website),
      physical_address = coalesce(nullif(trim(v_canonical.physical_address), ''), v_duplicate.physical_address),
      province = coalesce(nullif(trim(v_canonical.province), ''), v_duplicate.province),
      notes = coalesce(nullif(trim(v_canonical.notes), ''), v_duplicate.notes),
      is_active = v_canonical.is_active or v_duplicate.is_active,
      is_preferred_default = v_canonical.is_preferred_default or v_duplicate.is_preferred_default,
      updated_at = now()
  where id = v_canonical.id;

  insert into public.partner_identity_aliases (
    alias_partner_id,
    canonical_partner_id,
    organisation_id,
    reason,
    invitation_id,
    merged_by,
    metadata
  ) values (
    v_duplicate.id,
    v_canonical.id,
    v_canonical.organisation_id,
    coalesce(nullif(trim(p_reason), ''), 'duplicate_identity'),
    p_invitation_id,
    auth.uid(),
    jsonb_build_object(
      'partnerType', v_duplicate.partner_type,
      'duplicatePartnerOrganisationId', v_duplicate.partner_organisation_id,
      'duplicateEmail', nullif(lower(trim(v_duplicate.email_address)), '')
    )
  )
  on conflict (alias_partner_id) do nothing;

  delete from public.organisation_preferred_partners
  where id = v_duplicate.id;

  return v_canonical.id;
end;
$$;

do $$
declare
  v_group record;
  v_duplicate uuid;
begin
  for v_group in
    select
      organisation_id,
      partner_type,
      partner_organisation_id,
      (array_agg(id order by is_preferred_default desc, is_active desc, created_at, id))[1] as canonical_id,
      array_agg(id order by is_preferred_default desc, is_active desc, created_at, id) as ids
    from public.organisation_preferred_partners
    where partner_organisation_id is not null
    group by organisation_id, partner_type, partner_organisation_id
    having count(*) > 1
  loop
    foreach v_duplicate in array v_group.ids loop
      if v_duplicate <> v_group.canonical_id then
        perform public.bridge_merge_preferred_partner_identity(
          v_group.canonical_id,
          v_duplicate,
          'phase3_linked_organisation_duplicate'
        );
      end if;
    end loop;
  end loop;

  for v_group in
    select
      organisation_id,
      partner_type,
      lower(trim(email_address)) as normalized_email,
      lower(trim(company_name)) as normalized_company_name,
      (array_agg(id order by is_preferred_default desc, is_active desc, created_at, id))[1] as canonical_id,
      array_agg(id order by is_preferred_default desc, is_active desc, created_at, id) as ids
    from public.organisation_preferred_partners
    where partner_organisation_id is null
      and nullif(lower(trim(email_address)), '') is not null
      and nullif(lower(trim(company_name)), '') is not null
    group by organisation_id, partner_type, lower(trim(email_address)), lower(trim(company_name))
    having count(*) > 1
  loop
    foreach v_duplicate in array v_group.ids loop
      if v_duplicate <> v_group.canonical_id then
        perform public.bridge_merge_preferred_partner_identity(
          v_group.canonical_id,
          v_duplicate,
          'phase3_exact_external_duplicate'
        );
      end if;
    end loop;
  end loop;
end;
$$;

create unique index if not exists organisation_preferred_partners_linked_identity_idx
  on public.organisation_preferred_partners (
    organisation_id,
    partner_organisation_id,
    partner_type
  )
  where partner_organisation_id is not null;

create unique index if not exists organisation_preferred_partners_external_identity_idx
  on public.organisation_preferred_partners (
    organisation_id,
    partner_type,
    lower(trim(email_address)),
    lower(trim(company_name))
  )
  where partner_organisation_id is null
    and nullif(lower(trim(email_address)), '') is not null
    and nullif(lower(trim(company_name)), '') is not null;

create or replace function public.bridge_link_partner_identity_on_acceptance(
  p_invitation_id uuid,
  p_recipient_organisation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_invitation public.partner_invitations%rowtype;
  v_external public.organisation_preferred_partners%rowtype;
  v_existing_id uuid;
  v_canonical_id uuid;
  v_linked_ids uuid[] := '{}'::uuid[];
begin
  select * into v_invitation
  from public.partner_invitations
  where id = p_invitation_id
  for update;

  if v_invitation.id is null or p_recipient_organisation_id is null then
    return jsonb_build_object('success', false, 'code', 'identity_context_required');
  end if;

  if v_invitation.sender_organisation_id = p_recipient_organisation_id then
    raise exception 'A partner organisation cannot link to itself.' using errcode = '23514';
  end if;

  for v_external in
    select preferred.*
    from public.organisation_preferred_partners preferred
    where preferred.organisation_id = v_invitation.sender_organisation_id
      and preferred.partner_organisation_id is null
      and (
        preferred.id = v_invitation.external_partner_id
        or (
          v_invitation.external_partner_id is null
          and nullif(lower(trim(preferred.email_address)), '') =
              nullif(lower(trim(coalesce(v_invitation.invited_email, v_invitation.recipient_email))), '')
          and (
            lower(trim(preferred.company_name)) = lower(trim(coalesce(v_invitation.to_organisation_name, '')))
            or 1 = (
              select count(*)
              from public.organisation_preferred_partners candidate
              where candidate.organisation_id = v_invitation.sender_organisation_id
                and candidate.partner_organisation_id is null
                and nullif(lower(trim(candidate.email_address)), '') =
                    nullif(lower(trim(coalesce(v_invitation.invited_email, v_invitation.recipient_email))), '')
            )
          )
        )
      )
    order by preferred.created_at, preferred.id
    for update
  loop
    select preferred.id into v_existing_id
    from public.organisation_preferred_partners preferred
    where preferred.organisation_id = v_external.organisation_id
      and preferred.partner_organisation_id = p_recipient_organisation_id
      and preferred.partner_type = v_external.partner_type
      and preferred.id <> v_external.id
    order by preferred.is_preferred_default desc, preferred.is_active desc, preferred.created_at, preferred.id
    limit 1
    for update;

    if v_existing_id is not null then
      v_canonical_id := public.bridge_merge_preferred_partner_identity(
        v_existing_id,
        v_external.id,
        'accepted_invitation_identity_link',
        v_invitation.id
      );
    else
      update public.organisation_preferred_partners
      set partner_organisation_id = p_recipient_organisation_id,
          is_active = true,
          updated_at = now()
      where id = v_external.id
      returning id into v_canonical_id;
    end if;

    update public.partner_invitations
    set external_partner_id = v_canonical_id
    where id = v_invitation.id;

    v_linked_ids := array_append(v_linked_ids, v_canonical_id);
  end loop;

  return jsonb_build_object(
    'success', true,
    'invitationId', v_invitation.id,
    'partnerOrganisationId', p_recipient_organisation_id,
    'externalPartnerIds', to_jsonb(v_linked_ids)
  );
end;
$$;

create or replace function public.bridge_partner_invitation_identity_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if lower(coalesce(new.status, '')) = 'accepted'
     and new.recipient_organisation_id is not null
     and (
       tg_op = 'INSERT'
       or lower(coalesce(old.status, '')) <> 'accepted'
       or old.recipient_organisation_id is distinct from new.recipient_organisation_id
     ) then
    perform public.bridge_link_partner_identity_on_acceptance(new.id, new.recipient_organisation_id);
  end if;
  return new;
end;
$$;

drop trigger if exists partner_invitation_link_identity_on_acceptance
  on public.partner_invitations;
create trigger partner_invitation_link_identity_on_acceptance
after insert or update of status, recipient_organisation_id
on public.partner_invitations
for each row execute function public.bridge_partner_invitation_identity_trigger();

do $$
declare
  v_invitation record;
begin
  for v_invitation in
    select id, recipient_organisation_id
    from public.partner_invitations
    where lower(coalesce(status, '')) = 'accepted'
      and recipient_organisation_id is not null
  loop
    perform public.bridge_link_partner_identity_on_acceptance(
      v_invitation.id,
      v_invitation.recipient_organisation_id
    );
  end loop;
end;
$$;

with ranked as (
  select id,
    row_number() over (
      partition by sender_organisation_id, recipient_organisation_id
      order by created_at, id
    ) as identity_rank
  from public.partner_invitations
  where lower(coalesce(status, '')) = 'pending'
    and recipient_organisation_id is not null
)
update public.partner_invitations invitation
set status = 'revoked'
from ranked
where invitation.id = ranked.id
  and ranked.identity_rank > 1;

with ranked as (
  select id,
    row_number() over (
      partition by sender_organisation_id,
        lower(trim(coalesce(invited_email, recipient_email)))
      order by created_at, id
    ) as identity_rank
  from public.partner_invitations
  where lower(coalesce(status, '')) = 'pending'
    and recipient_organisation_id is null
    and nullif(lower(trim(coalesce(invited_email, recipient_email))), '') is not null
)
update public.partner_invitations invitation
set status = 'revoked'
from ranked
where invitation.id = ranked.id
  and ranked.identity_rank > 1;

create unique index if not exists partner_invitations_pending_organisation_identity_idx
  on public.partner_invitations (sender_organisation_id, recipient_organisation_id)
  where lower(coalesce(status, '')) = 'pending'
    and recipient_organisation_id is not null;

create unique index if not exists partner_invitations_pending_email_identity_idx
  on public.partner_invitations (
    sender_organisation_id,
    lower(trim(coalesce(invited_email, recipient_email)))
  )
  where lower(coalesce(status, '')) = 'pending'
    and recipient_organisation_id is null
    and nullif(lower(trim(coalesce(invited_email, recipient_email))), '') is not null;

create or replace function public.bridge_upsert_organisation_partner_identity(
  p_organisation_id uuid,
  p_partner_id uuid default null,
  p_partner_type text default 'transfer_attorney',
  p_partner_organisation_id uuid default null,
  p_company_name text default null,
  p_contact_person text default null,
  p_email_address text default null,
  p_phone_number text default null,
  p_website text default null,
  p_physical_address text default null,
  p_province text default null,
  p_notes text default null,
  p_is_active boolean default true,
  p_is_preferred_default boolean default false,
  p_source text default 'manual',
  p_scope_type text default 'all_developments',
  p_scope_json jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_partner public.organisation_preferred_partners%rowtype;
  v_partner_type text := lower(trim(coalesce(p_partner_type, 'transfer_attorney')));
  v_email text := nullif(lower(trim(coalesce(p_email_address, ''))), '');
  v_company text := nullif(trim(coalesce(p_company_name, '')), '');
  v_reused boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_organisation_id is null or v_company is null then
    raise exception 'Organisation and company name are required.' using errcode = '22023';
  end if;
  if not public.bridge_phase3_can_manage_organization(p_organisation_id) then
    raise exception 'You cannot manage partners for this organisation.' using errcode = '42501';
  end if;
  if p_partner_organisation_id = p_organisation_id then
    raise exception 'An organisation cannot be its own partner.' using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(hashtext(
    p_organisation_id::text || ':' || v_partner_type || ':' ||
    coalesce(p_partner_organisation_id::text, v_email || ':' || lower(v_company), coalesce(p_partner_id::text, 'new'))
  ));

  if p_partner_id is not null then
    select * into v_partner
    from public.organisation_preferred_partners
    where id = p_partner_id and organisation_id = p_organisation_id
    for update;
    if v_partner.id is null then
      raise exception 'Partner was not found in this organisation.' using errcode = 'P0002';
    end if;
  elsif p_partner_organisation_id is not null then
    select * into v_partner
    from public.organisation_preferred_partners
    where organisation_id = p_organisation_id
      and partner_organisation_id = p_partner_organisation_id
      and partner_type = v_partner_type
    limit 1 for update;
    v_reused := v_partner.id is not null;
  elsif v_email is not null then
    select * into v_partner
    from public.organisation_preferred_partners
    where organisation_id = p_organisation_id
      and partner_organisation_id is null
      and partner_type = v_partner_type
      and lower(trim(email_address)) = v_email
      and lower(trim(company_name)) = lower(v_company)
    limit 1 for update;
    v_reused := v_partner.id is not null;
  end if;

  if p_is_preferred_default then
    update public.organisation_preferred_partners
    set is_preferred_default = false, updated_at = now()
    where organisation_id = p_organisation_id
      and partner_type = v_partner_type
      and id is distinct from v_partner.id
      and is_preferred_default;
  end if;

  if v_partner.id is null then
    insert into public.organisation_preferred_partners (
      organisation_id, partner_type, partner_organisation_id, source, scope_type, scope_json,
      company_name, contact_person, email_address, phone_number, website, physical_address,
      province, notes, is_active, is_preferred_default
    ) values (
      p_organisation_id, v_partner_type, p_partner_organisation_id,
      coalesce(nullif(trim(p_source), ''), 'manual'),
      coalesce(nullif(trim(p_scope_type), ''), 'all_developments'), coalesce(p_scope_json, '{}'::jsonb),
      v_company, nullif(trim(p_contact_person), ''), v_email, nullif(trim(p_phone_number), ''),
      nullif(trim(p_website), ''), nullif(trim(p_physical_address), ''), nullif(trim(p_province), ''),
      nullif(trim(p_notes), ''), coalesce(p_is_active, true), coalesce(p_is_preferred_default, false)
    ) returning * into v_partner;
  else
    update public.organisation_preferred_partners
    set partner_type = v_partner_type,
        partner_organisation_id = p_partner_organisation_id,
        source = coalesce(nullif(trim(p_source), ''), source),
        scope_type = coalesce(nullif(trim(p_scope_type), ''), scope_type),
        scope_json = coalesce(p_scope_json, scope_json),
        company_name = v_company,
        contact_person = nullif(trim(p_contact_person), ''),
        email_address = v_email,
        phone_number = nullif(trim(p_phone_number), ''),
        website = nullif(trim(p_website), ''),
        physical_address = nullif(trim(p_physical_address), ''),
        province = nullif(trim(p_province), ''),
        notes = nullif(trim(p_notes), ''),
        is_active = coalesce(p_is_active, true),
        is_preferred_default = coalesce(p_is_preferred_default, false),
        updated_at = now()
    where id = v_partner.id
    returning * into v_partner;
  end if;

  return jsonb_build_object(
    'success', true,
    'reused', v_reused,
    'partner', to_jsonb(v_partner)
  );
end;
$$;

revoke all on function public.bridge_merge_preferred_partner_identity(uuid, uuid, text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.bridge_link_partner_identity_on_acceptance(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.bridge_upsert_organisation_partner_identity(
  uuid, uuid, text, uuid, text, text, text, text, text, text, text, text,
  boolean, boolean, text, text, jsonb
) from public, anon, authenticated, service_role;

grant execute on function public.bridge_link_partner_identity_on_acceptance(uuid, uuid)
  to service_role;
grant execute on function public.bridge_upsert_organisation_partner_identity(
  uuid, uuid, text, uuid, text, text, text, text, text, text, text, text,
  boolean, boolean, text, text, jsonb
) to authenticated;

grant select on public.partner_identity_aliases to authenticated;

alter table public.partner_identity_aliases enable row level security;

drop policy if exists partner_identity_aliases_select_scoped
  on public.partner_identity_aliases;
create policy partner_identity_aliases_select_scoped
on public.partner_identity_aliases
for select to authenticated
using (public.bridge_is_active_member(organisation_id));

comment on function public.bridge_upsert_organisation_partner_identity(
  uuid, uuid, text, uuid, text, text, text, text, text, text, text, text,
  boolean, boolean, text, text, jsonb
) is 'Idempotently creates or updates an organisation-owned partner role record using only deterministic identity keys.';

commit;
