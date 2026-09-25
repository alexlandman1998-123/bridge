-- Phase 8: make seller collaboration participant-specific and conflict safe.
-- Canonical seller data remains private; sellers work through scoped RPCs and
-- protected changes only reach the canonical save function after review.

create extension if not exists pgcrypto with schema extensions;

create table public.private_listing_seller_participants (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  private_listing_id uuid not null references public.private_listings(id) on delete cascade,
  seller_onboarding_id uuid references public.private_listing_seller_onboarding(id) on delete cascade,
  display_name text not null,
  email text not null,
  participant_role text not null check (participant_role in (
    'primary_owner', 'co_owner', 'spouse', 'director', 'trustee',
    'executor', 'authorised_representative', 'signatory'
  )),
  authority_scope text[] not null default '{}'::text[],
  visible_sections text[] not null default array['listing','tasks','documents','messages']::text[],
  current_data jsonb not null default '{}'::jsonb check (jsonb_typeof(current_data) = 'object'),
  record_version bigint not null default 1 check (record_version > 0),
  status text not null default 'invited' check (status in ('invited','active','suspended','revoked')),
  invitation_token_hash text unique,
  invitation_expires_at timestamptz,
  password_hash text,
  access_token_hash text,
  access_token_expires_at timestamptz,
  invitation_delivery_status text not null default 'pending' check (invitation_delivery_status in ('pending','queued','sent','delivered','failed')),
  invitation_error text,
  invitation_attempt_count integer not null default 0 check (invitation_attempt_count >= 0),
  invitation_last_attempt_at timestamptz,
  invitation_sent_at timestamptz,
  activated_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (private_listing_id, email, participant_role)
);

create table public.private_listing_seller_change_requests (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  private_listing_id uuid not null references public.private_listings(id) on delete cascade,
  participant_id uuid not null references public.private_listing_seller_participants(id) on delete cascade,
  request_type text not null default 'seller_edit' check (request_type in ('seller_edit','missing_information','signature_correction')),
  sensitivity text not null check (sensitivity in ('general','legal_identity','ownership','authority','financial','compliance')),
  proposed_patch jsonb not null check (jsonb_typeof(proposed_patch) = 'object'),
  changed_fields text[] not null default '{}'::text[],
  base_participant_version bigint not null check (base_participant_version > 0),
  base_listing_updated_at timestamptz not null,
  base_onboarding_updated_at timestamptz,
  status text not null default 'pending' check (status in ('pending','approved','rejected','conflict','withdrawn')),
  review_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  conflict_json jsonb not null default '{}'::jsonb check (jsonb_typeof(conflict_json) = 'object'),
  canonical_mutation_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index private_listing_seller_participants_listing_idx
  on public.private_listing_seller_participants (private_listing_id, status, created_at);
create index private_listing_seller_participants_invitation_queue_idx
  on public.private_listing_seller_participants (invitation_delivery_status, invitation_last_attempt_at)
  where invitation_delivery_status in ('pending','queued','failed');
create index private_listing_seller_change_requests_review_idx
  on public.private_listing_seller_change_requests (private_listing_id, status, created_at desc);
create index private_listing_seller_change_requests_participant_idx
  on public.private_listing_seller_change_requests (participant_id, created_at desc);

alter table public.private_listing_seller_participants enable row level security;
alter table public.private_listing_seller_change_requests enable row level security;

revoke all on table public.private_listing_seller_participants from public, anon, authenticated;
revoke all on table public.private_listing_seller_change_requests from public, anon, authenticated;
grant select on table public.private_listing_seller_participants to authenticated;
grant select on table public.private_listing_seller_change_requests to authenticated;
grant all on table public.private_listing_seller_participants to service_role;
grant all on table public.private_listing_seller_change_requests to service_role;

create policy private_listing_seller_participants_internal_select
  on public.private_listing_seller_participants for select to authenticated
  using ((select public.bridge_is_active_member(organisation_id)));

create policy private_listing_seller_change_requests_internal_select
  on public.private_listing_seller_change_requests for select to authenticated
  using ((select public.bridge_is_active_member(organisation_id)));

create or replace function public.bridge_listing_seller_actor_permission(
  p_organisation_id uuid,
  p_action text,
  p_sensitivity text default 'general'
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organisation_users member
    where member.organisation_id = p_organisation_id
      and member.user_id = (select auth.uid())
      and lower(coalesce(member.status, 'active')) = 'active'
      and case lower(coalesce(p_action, ''))
        when 'manage_participants' then lower(coalesce(member.workspace_role, member.organisation_role, member.organization_role, member.role, '')) in
          ('agent','property_practitioner','listing_agent','listing_coordinator','branch_manager','manager','admin','owner','principal','director','partner','super_admin','compliance_reviewer','compliance_officer')
        when 'review_change' then
          case lower(coalesce(p_sensitivity, 'general'))
            when 'financial' then lower(coalesce(member.workspace_role, member.organisation_role, member.organization_role, member.role, '')) in
              ('branch_manager','manager','admin','owner','principal','director','partner','super_admin','compliance_reviewer','compliance_officer')
            when 'compliance' then lower(coalesce(member.workspace_role, member.organisation_role, member.organization_role, member.role, '')) in
              ('branch_manager','manager','admin','owner','principal','director','partner','super_admin','compliance_reviewer','compliance_officer')
            else lower(coalesce(member.workspace_role, member.organisation_role, member.organization_role, member.role, '')) in
              ('agent','property_practitioner','listing_agent','listing_coordinator','branch_manager','manager','admin','owner','principal','director','partner','super_admin','compliance_reviewer','compliance_officer')
          end
        else false
      end
  );
$$;

revoke all on function public.bridge_listing_seller_actor_permission(uuid, text, text) from public, anon, authenticated;
grant execute on function public.bridge_listing_seller_actor_permission(uuid, text, text) to authenticated, service_role;

create or replace function public.bridge_create_listing_seller_participant(
  p_listing_id uuid,
  p_display_name text,
  p_email text,
  p_participant_role text,
  p_authority_scope text[] default '{}'::text[],
  p_visible_sections text[] default array['listing','tasks','documents','messages']::text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_listing public.private_listings%rowtype;
  v_onboarding_id uuid;
  v_participant public.private_listing_seller_participants%rowtype;
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
  v_email text := lower(trim(coalesce(p_email, '')));
begin
  select * into v_listing from public.private_listings where id = p_listing_id for update;
  if not found then raise exception 'Listing not found.' using errcode = 'P0002'; end if;
  if not public.bridge_listing_seller_actor_permission(v_listing.organisation_id, 'manage_participants', 'general') then
    raise exception 'You do not have permission to manage seller participants.' using errcode = '42501';
  end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'A valid participant email is required.' using errcode = '22023';
  end if;
  select id into v_onboarding_id from public.private_listing_seller_onboarding where private_listing_id = p_listing_id;

  insert into public.private_listing_seller_participants (
    organisation_id, private_listing_id, seller_onboarding_id, display_name, email,
    participant_role, authority_scope, visible_sections, invitation_token_hash,
    invitation_expires_at, invitation_delivery_status, created_by
  ) values (
    v_listing.organisation_id, p_listing_id, v_onboarding_id, trim(p_display_name), v_email,
    p_participant_role, coalesce(p_authority_scope, '{}'::text[]),
    coalesce(p_visible_sections, array['listing','tasks','documents','messages']::text[]),
    encode(digest(v_token, 'sha256'), 'hex'), now() + interval '14 days', 'pending', auth.uid()
  )
  on conflict (private_listing_id, email, participant_role) do update set
    display_name = excluded.display_name,
    authority_scope = excluded.authority_scope,
    visible_sections = excluded.visible_sections,
    invitation_token_hash = excluded.invitation_token_hash,
    invitation_expires_at = excluded.invitation_expires_at,
    invitation_delivery_status = 'pending',
    invitation_error = null,
    status = case when private_listing_seller_participants.status = 'revoked' then 'invited' else private_listing_seller_participants.status end,
    updated_at = now()
  returning * into v_participant;

  insert into public.private_listing_activity (
    private_listing_id, activity_type, activity_title, activity_description,
    performed_by, visibility, metadata
  ) values (
    p_listing_id, 'seller_participant_invited', 'Seller participant invitation prepared',
    'A participant-specific Seller Portal invitation was prepared.', auth.uid(), 'internal',
    jsonb_build_object('participantId', v_participant.id, 'role', v_participant.participant_role, 'email', v_participant.email)
  );

  return jsonb_build_object(
    'participant', to_jsonb(v_participant) - 'invitation_token_hash' - 'password_hash' - 'access_token_hash',
    'invitationToken', v_token
  );
end;
$$;

create or replace function public.bridge_record_listing_seller_invitation_delivery(
  p_participant_id uuid,
  p_status text,
  p_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_participant public.private_listing_seller_participants%rowtype;
begin
  select * into v_participant from public.private_listing_seller_participants where id = p_participant_id for update;
  if not found then raise exception 'Seller participant not found.' using errcode = 'P0002'; end if;
  if not public.bridge_listing_seller_actor_permission(v_participant.organisation_id, 'manage_participants', 'general') then
    raise exception 'You do not have permission to manage seller invitations.' using errcode = '42501';
  end if;
  if p_status not in ('queued','sent','delivered','failed') then
    raise exception 'Invalid invitation delivery status.' using errcode = '22023';
  end if;
  update public.private_listing_seller_participants set
    invitation_delivery_status = p_status,
    invitation_error = case when p_status = 'failed' then nullif(trim(p_error), '') else null end,
    invitation_attempt_count = invitation_attempt_count + 1,
    invitation_last_attempt_at = now(),
    invitation_sent_at = case when p_status in ('sent','delivered') then coalesce(invitation_sent_at, now()) else invitation_sent_at end,
    updated_at = now()
  where id = p_participant_id returning * into v_participant;
  return to_jsonb(v_participant) - 'invitation_token_hash' - 'password_hash' - 'access_token_hash';
end;
$$;

create or replace function public.bridge_activate_listing_seller_participant(
  p_invitation_token text,
  p_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_participant public.private_listing_seller_participants%rowtype;
  v_access_token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  if length(coalesce(p_password, '')) < 10 then
    raise exception 'Password must be at least 10 characters.' using errcode = '22023';
  end if;
  select * into v_participant
  from public.private_listing_seller_participants
  where invitation_token_hash = encode(digest(trim(coalesce(p_invitation_token, '')), 'sha256'), 'hex')
  for update;
  if not found or v_participant.status in ('revoked','suspended') or v_participant.invitation_expires_at <= now() then
    raise exception 'This seller invitation is invalid or expired.' using errcode = '42501';
  end if;
  update public.private_listing_seller_participants set
    password_hash = crypt(p_password, gen_salt('bf')),
    access_token_hash = encode(digest(v_access_token, 'sha256'), 'hex'),
    access_token_expires_at = now() + interval '12 hours',
    invitation_token_hash = null,
    status = 'active', activated_at = coalesce(activated_at, now()), updated_at = now()
  where id = v_participant.id returning * into v_participant;
  return jsonb_build_object(
    'accessToken', v_access_token,
    'expiresAt', v_participant.access_token_expires_at,
    'participant', jsonb_build_object(
      'id', v_participant.id, 'name', v_participant.display_name, 'email', v_participant.email,
      'role', v_participant.participant_role, 'authorityScope', v_participant.authority_scope,
      'visibleSections', v_participant.visible_sections, 'recordVersion', v_participant.record_version
    )
  );
end;
$$;

create or replace function public.bridge_verify_listing_seller_participant(
  p_participant_id uuid,
  p_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_participant public.private_listing_seller_participants%rowtype;
  v_access_token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  select * into v_participant from public.private_listing_seller_participants where id = p_participant_id for update;
  if not found or v_participant.status <> 'active' or v_participant.password_hash is null
    or v_participant.password_hash <> crypt(p_password, v_participant.password_hash) then
    raise exception 'Seller participant sign-in failed.' using errcode = '42501';
  end if;
  update public.private_listing_seller_participants set
    access_token_hash = encode(digest(v_access_token, 'sha256'), 'hex'),
    access_token_expires_at = now() + interval '12 hours', updated_at = now()
  where id = v_participant.id returning * into v_participant;
  return jsonb_build_object('accessToken', v_access_token, 'expiresAt', v_participant.access_token_expires_at);
end;
$$;

create or replace function public.bridge_listing_seller_participant_payload(
  p_participant_id uuid,
  p_access_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_participant public.private_listing_seller_participants%rowtype;
  v_listing public.private_listings%rowtype;
  v_changes jsonb;
  v_notifications jsonb;
begin
  select * into v_participant
  from public.private_listing_seller_participants
  where id = p_participant_id
    and status = 'active'
    and access_token_hash = encode(digest(trim(coalesce(p_access_token, '')), 'sha256'), 'hex')
    and access_token_expires_at > now();
  if not found then raise exception 'Seller participant session has expired.' using errcode = '42501'; end if;
  select * into v_listing from public.private_listings where id = v_participant.private_listing_id;
  select coalesce(jsonb_agg(to_jsonb(request) - 'organisation_id' order by request.created_at desc), '[]'::jsonb)
    into v_changes from public.private_listing_seller_change_requests request where request.participant_id = v_participant.id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', event.id, 'type', event.event_key, 'status', event.status,
    'subject', event.subject, 'message', event.message_preview, 'error', event.error_message,
    'createdAt', event.created_at
  ) order by event.created_at desc), '[]'::jsonb)
    into v_notifications from public.notification_events event
    where event.listing_id = v_listing.id
      and lower(event.recipient_email) = v_participant.email
      and event.recipient_role = 'seller_participant'
      and event.payload_json ->> 'participantId' = v_participant.id::text;
  return jsonb_build_object(
    'participant', jsonb_build_object(
      'id', v_participant.id, 'name', v_participant.display_name, 'email', v_participant.email,
      'role', v_participant.participant_role, 'authorityScope', v_participant.authority_scope,
      'visibleSections', v_participant.visible_sections, 'currentData', v_participant.current_data,
      'recordVersion', v_participant.record_version
    ),
    'listing', jsonb_build_object(
      'id', v_listing.id, 'title', v_listing.title,
      'address', v_listing.address_line_1, 'status', v_listing.listing_status,
      'askingPrice', v_listing.asking_price
    ),
    'changeRequests', v_changes,
    'notifications', v_notifications
  );
end;
$$;

create or replace function public.bridge_submit_listing_seller_change(
  p_participant_id uuid,
  p_access_token text,
  p_sensitivity text,
  p_proposed_patch jsonb,
  p_changed_fields text[],
  p_expected_participant_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_participant public.private_listing_seller_participants%rowtype;
  v_listing public.private_listings%rowtype;
  v_onboarding_updated_at timestamptz;
  v_request public.private_listing_seller_change_requests%rowtype;
begin
  if p_sensitivity not in ('general','legal_identity','ownership','authority','financial','compliance') then
    raise exception 'Invalid seller change sensitivity.' using errcode = '22023';
  end if;
  if p_proposed_patch is null or jsonb_typeof(p_proposed_patch) <> 'object' or p_proposed_patch = '{}'::jsonb then
    raise exception 'A proposed change is required.' using errcode = '22023';
  end if;
  select * into v_participant
  from public.private_listing_seller_participants
  where id = p_participant_id
    and status = 'active'
    and access_token_hash = encode(digest(trim(coalesce(p_access_token, '')), 'sha256'), 'hex')
    and access_token_expires_at > now()
  for update;
  if not found then raise exception 'Seller participant session has expired.' using errcode = '42501'; end if;
  if v_participant.record_version <> p_expected_participant_version then
    raise exception 'Your seller details changed after you opened them. Reload before submitting.' using errcode = '40001';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_proposed_patch) field
    where field in ('password_hash','access_token_hash','invitation_token_hash','organisation_id','private_listing_id','seller_onboarding_id','status')
  ) then
    raise exception 'That field cannot be changed from the Seller Portal.' using errcode = '42501';
  end if;
  if p_sensitivity <> 'general'
    and not (coalesce(v_participant.authority_scope, '{}'::text[]) @> array[p_sensitivity]::text[]) then
    raise exception 'This information is outside your assigned seller access.' using errcode = '42501';
  end if;
  select * into v_listing from public.private_listings where id = v_participant.private_listing_id for share;
  select updated_at into v_onboarding_updated_at from public.private_listing_seller_onboarding where id = v_participant.seller_onboarding_id;
  insert into public.private_listing_seller_change_requests (
    organisation_id, private_listing_id, participant_id, sensitivity, proposed_patch,
    changed_fields, base_participant_version, base_listing_updated_at, base_onboarding_updated_at
  ) values (
    v_participant.organisation_id, v_participant.private_listing_id, v_participant.id,
    p_sensitivity, p_proposed_patch, coalesce(p_changed_fields, '{}'::text[]),
    v_participant.record_version, v_listing.updated_at, v_onboarding_updated_at
  ) returning * into v_request;

  insert into public.notification_events (
    organisation_id, listing_id, event_key, category, trigger_type, channel, status,
    recipient_role, subject, message_preview, source, dedupe_key, payload_json
  ) values (
    v_participant.organisation_id, v_participant.private_listing_id, 'seller_change_submitted',
    'notification', 'system_event', 'in_app', 'prepared', 'listing_agent',
    'Seller change ready for review', v_participant.display_name || ' submitted seller information for review.',
    'seller_collaboration_phase8', 'seller-change-submitted:' || v_request.id,
    jsonb_build_object('changeRequestId', v_request.id, 'participantId', v_participant.id, 'sensitivity', p_sensitivity)
  );
  return to_jsonb(v_request) - 'organisation_id';
end;
$$;

create or replace function public.bridge_review_listing_seller_change(
  p_change_request_id uuid,
  p_decision text,
  p_review_note text default null,
  p_canonical_update jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_request public.private_listing_seller_change_requests%rowtype;
  v_participant public.private_listing_seller_participants%rowtype;
  v_listing public.private_listings%rowtype;
  v_onboarding_updated_at timestamptz;
  v_result jsonb;
  v_mutation_id uuid;
begin
  select * into v_request from public.private_listing_seller_change_requests where id = p_change_request_id for update;
  if not found then raise exception 'Seller change request not found.' using errcode = 'P0002'; end if;
  if v_request.status <> 'pending' then raise exception 'This seller change has already been actioned.' using errcode = '40001'; end if;
  if not public.bridge_listing_seller_actor_permission(v_request.organisation_id, 'review_change', v_request.sensitivity) then
    raise exception 'You do not have permission to review this seller change.' using errcode = '42501';
  end if;
  if p_decision not in ('approve','reject') then raise exception 'Decision must be approve or reject.' using errcode = '22023'; end if;
  select * into v_participant from public.private_listing_seller_participants where id = v_request.participant_id for update;
  select * into v_listing from public.private_listings where id = v_request.private_listing_id for update;
  select updated_at into v_onboarding_updated_at from public.private_listing_seller_onboarding where id = v_participant.seller_onboarding_id;

  if v_participant.record_version <> v_request.base_participant_version
    or v_listing.updated_at is distinct from v_request.base_listing_updated_at
    or v_onboarding_updated_at is distinct from v_request.base_onboarding_updated_at then
    update public.private_listing_seller_change_requests set
      status = 'conflict', reviewed_by = auth.uid(), reviewed_at = now(), review_note = nullif(trim(p_review_note), ''),
      conflict_json = jsonb_build_object(
        'participantVersion', v_participant.record_version,
        'expectedParticipantVersion', v_request.base_participant_version,
        'listingUpdatedAt', v_listing.updated_at,
        'expectedListingUpdatedAt', v_request.base_listing_updated_at,
        'onboardingUpdatedAt', v_onboarding_updated_at,
        'expectedOnboardingUpdatedAt', v_request.base_onboarding_updated_at
      ), updated_at = now()
    where id = v_request.id returning * into v_request;
    return to_jsonb(v_request) - 'organisation_id';
  end if;

  if p_decision = 'reject' then
    update public.private_listing_seller_change_requests set
      status = 'rejected', review_note = nullif(trim(p_review_note), ''), reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
    where id = v_request.id returning * into v_request;
  else
    if p_canonical_update is null or jsonb_typeof(p_canonical_update) <> 'object' then
      raise exception 'The reviewed canonical seller snapshot is required for approval.' using errcode = '22023';
    end if;
    v_mutation_id := coalesce(nullif(p_canonical_update ->> 'mutationId', '')::uuid, gen_random_uuid());
    v_result := public.save_private_listing_seller_canonical_update(
      p_listing_id => v_request.private_listing_id,
      p_form_data => coalesce(p_canonical_update -> 'formData', '{}'::jsonb),
      p_canonical_facts => coalesce(p_canonical_update -> 'canonicalFacts', '{}'::jsonb),
      p_canonical_readiness => coalesce(p_canonical_update -> 'canonicalReadiness', '{}'::jsonb),
      p_listing_patch => coalesce(p_canonical_update -> 'listingPatch', '{}'::jsonb),
      p_onboarding_status => coalesce(p_canonical_update ->> 'onboardingStatus', 'in_progress'),
      p_seller_type => p_canonical_update ->> 'sellerType',
      p_ownership_structure => p_canonical_update ->> 'ownershipStructure',
      p_marital_regime => p_canonical_update ->> 'maritalRegime',
      p_mutation_id => v_mutation_id,
      p_mutation_type => 'seller_proposed_change_approved',
      p_source => 'seller_collaboration_review',
      p_changed_fields => v_request.changed_fields,
      p_expected_updated_at => v_request.base_listing_updated_at
    );
    update public.private_listing_seller_participants set
      current_data = current_data || v_request.proposed_patch,
      record_version = record_version + 1, updated_at = now()
    where id = v_participant.id;
    update public.private_listing_seller_change_requests set
      status = 'approved', review_note = nullif(trim(p_review_note), ''), reviewed_by = auth.uid(),
      reviewed_at = now(), canonical_mutation_id = v_mutation_id, updated_at = now()
    where id = v_request.id returning * into v_request;
  end if;

  insert into public.notification_events (
    organisation_id, listing_id, event_key, category, trigger_type, channel, status,
    recipient_email, recipient_role, subject, message_preview, source, dedupe_key, payload_json
  ) values (
    v_request.organisation_id, v_request.private_listing_id,
    case when p_decision = 'approve' then 'seller_change_approved' else 'seller_change_rejected' end,
    'notification', 'system_event', 'email', 'prepared', v_participant.email, 'seller_participant',
    case when p_decision = 'approve' then 'Your seller information was approved' else 'Your seller information needs attention' end,
    case when p_decision = 'approve' then 'Your reviewed seller information is now up to date.' else coalesce(nullif(trim(p_review_note), ''), 'Your agent returned the change for correction.') end,
    'seller_collaboration_phase8', 'seller-change-review:' || v_request.id || ':' || p_decision,
    jsonb_build_object('changeRequestId', v_request.id, 'participantId', v_participant.id, 'decision', p_decision)
  );
  return (to_jsonb(v_request) - 'organisation_id') || jsonb_build_object('canonicalUpdate', v_result);
end;
$$;

create or replace function public.bridge_queue_listing_seller_action_notification(
  p_participant_id uuid,
  p_notification_type text,
  p_subject text,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_participant public.private_listing_seller_participants%rowtype;
  v_event public.notification_events%rowtype;
begin
  select * into v_participant from public.private_listing_seller_participants where id = p_participant_id;
  if not found then raise exception 'Seller participant not found.' using errcode = 'P0002'; end if;
  if not public.bridge_listing_seller_actor_permission(v_participant.organisation_id, 'manage_participants', 'general') then
    raise exception 'You do not have permission to notify seller participants.' using errcode = '42501';
  end if;
  if p_notification_type not in ('missing_information','signature_action') then
    raise exception 'Unsupported seller notification type.' using errcode = '22023';
  end if;
  insert into public.notification_events (
    organisation_id, listing_id, event_key, category, trigger_type, channel, status,
    recipient_email, recipient_role, subject, message_preview, source, dedupe_key, payload_json
  ) values (
    v_participant.organisation_id, v_participant.private_listing_id, 'seller_' || p_notification_type,
    'notification', 'manual_send', 'email', 'prepared', v_participant.email, 'seller_participant',
    nullif(trim(p_subject), ''), nullif(trim(p_message), ''), 'seller_collaboration_phase8',
    'seller-action:' || v_participant.id || ':' || p_notification_type || ':' || extract(epoch from date_trunc('minute', now()))::bigint,
    jsonb_build_object('participantId', v_participant.id, 'notificationType', p_notification_type)
  ) returning * into v_event;
  return to_jsonb(v_event);
end;
$$;

create or replace function public.bridge_listing_seller_collaboration_workspace(p_listing_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing public.private_listings%rowtype;
  v_participants jsonb;
  v_changes jsonb;
  v_deliveries jsonb;
begin
  select * into v_listing from public.private_listings where id = p_listing_id;
  if not found then raise exception 'Listing not found.' using errcode = 'P0002'; end if;
  if not public.bridge_listing_seller_actor_permission(v_listing.organisation_id, 'manage_participants', 'general') then
    raise exception 'You do not have permission to view seller collaboration.' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(to_jsonb(participant) - 'invitation_token_hash' - 'password_hash' - 'access_token_hash' order by participant.created_at), '[]'::jsonb)
    into v_participants from public.private_listing_seller_participants participant where participant.private_listing_id = p_listing_id;
  select coalesce(jsonb_agg((to_jsonb(request) - 'organisation_id') || jsonb_build_object(
    'participantName', participant.display_name, 'participantEmail', participant.email,
    'canReview', public.bridge_listing_seller_actor_permission(request.organisation_id, 'review_change', request.sensitivity)
  ) order by request.created_at desc), '[]'::jsonb)
    into v_changes
    from public.private_listing_seller_change_requests request
    join public.private_listing_seller_participants participant on participant.id = request.participant_id
    where request.private_listing_id = p_listing_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', event.id, 'participantId', event.payload_json ->> 'participantId', 'type', event.event_key,
    'status', event.status, 'recipientEmail', event.recipient_email, 'subject', event.subject,
    'error', event.error_message, 'createdAt', event.created_at
  ) order by event.created_at desc), '[]'::jsonb)
    into v_deliveries from public.notification_events event
    where event.listing_id = p_listing_id and event.source = 'seller_collaboration_phase8';
  return jsonb_build_object('participants', v_participants, 'changeRequests', v_changes, 'notifications', v_deliveries);
end;
$$;

create or replace function public.bridge_retry_listing_seller_notification(p_notification_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_event public.notification_events%rowtype;
begin
  select * into v_event from public.notification_events where id = p_notification_event_id for update;
  if not found or v_event.source <> 'seller_collaboration_phase8' then
    raise exception 'Seller collaboration notification not found.' using errcode = 'P0002';
  end if;
  if not public.bridge_listing_seller_actor_permission(v_event.organisation_id, 'manage_participants', 'general') then
    raise exception 'You do not have permission to retry this notification.' using errcode = '42501';
  end if;
  if v_event.status <> 'failed' then raise exception 'Only a failed notification can be retried.' using errcode = '22023'; end if;
  update public.notification_events set
    status = 'queued', error_message = null, queued_at = now(), failed_at = null,
    metadata_json = coalesce(metadata_json, '{}'::jsonb) || jsonb_build_object('retryRequestedAt', now(), 'retryRequestedBy', auth.uid(), 'previousProviderMessageId', provider_message_id),
    updated_at = now()
  where id = v_event.id returning * into v_event;
  return to_jsonb(v_event);
end;
$$;

revoke all on function public.bridge_create_listing_seller_participant(uuid, text, text, text, text[], text[]) from public, anon, authenticated;
revoke all on function public.bridge_record_listing_seller_invitation_delivery(uuid, text, text) from public, anon, authenticated;
revoke all on function public.bridge_activate_listing_seller_participant(text, text) from public, anon, authenticated;
revoke all on function public.bridge_verify_listing_seller_participant(uuid, text) from public, anon, authenticated;
revoke all on function public.bridge_listing_seller_participant_payload(uuid, text) from public, anon, authenticated;
revoke all on function public.bridge_submit_listing_seller_change(uuid, text, text, jsonb, text[], bigint) from public, anon, authenticated;
revoke all on function public.bridge_review_listing_seller_change(uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.bridge_queue_listing_seller_action_notification(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.bridge_listing_seller_collaboration_workspace(uuid) from public, anon, authenticated;
revoke all on function public.bridge_retry_listing_seller_notification(uuid) from public, anon, authenticated;

grant execute on function public.bridge_create_listing_seller_participant(uuid, text, text, text, text[], text[]) to authenticated;
grant execute on function public.bridge_record_listing_seller_invitation_delivery(uuid, text, text) to authenticated;
grant execute on function public.bridge_activate_listing_seller_participant(text, text) to anon, authenticated;
grant execute on function public.bridge_verify_listing_seller_participant(uuid, text) to anon, authenticated;
grant execute on function public.bridge_listing_seller_participant_payload(uuid, text) to anon, authenticated;
grant execute on function public.bridge_submit_listing_seller_change(uuid, text, text, jsonb, text[], bigint) to anon, authenticated;
grant execute on function public.bridge_review_listing_seller_change(uuid, text, text, jsonb) to authenticated;
grant execute on function public.bridge_queue_listing_seller_action_notification(uuid, text, text, text) to authenticated;
grant execute on function public.bridge_listing_seller_collaboration_workspace(uuid) to authenticated;
grant execute on function public.bridge_retry_listing_seller_notification(uuid) to authenticated;

comment on table public.private_listing_seller_participants is
  'Participant-specific Seller Portal identities, scopes, invitation delivery state and optimistic record versions.';
comment on table public.private_listing_seller_change_requests is
  'Conflict-safe seller proposals. Protected identity, ownership, authority, financial and compliance changes require authorised review before canonical save.';
