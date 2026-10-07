begin;
-- Private applicant ownership and narrowly scoped sessions; never staff membership.
create table public.recruitment_applicant_links (
  organisation_id uuid not null,
  lead_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (organisation_id,lead_id),
  unique (organisation_id,lead_id,user_id),
  foreign key (organisation_id,lead_id) references public.recruitment_leads(organisation_id,id) on delete cascade
);
create index recruitment_applicant_user_idx on public.recruitment_applicant_links(user_id,organisation_id);
create table public.recruitment_applicant_sessions (
  token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  organisation_id uuid not null,
  lead_id uuid not null,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '7 days',
  foreign key (organisation_id,lead_id,user_id) references public.recruitment_applicant_links(organisation_id,lead_id,user_id) on delete cascade
);
create index recruitment_applicant_session_expiry_idx on public.recruitment_applicant_sessions(expires_at);
-- Persistent attempt budgets survive function restarts and cover all agencies.
create table public.recruitment_auth_attempts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('send','authenticate')),
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  email_hash text not null check (email_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now()
);
create index recruitment_auth_sender_idx on public.recruitment_auth_attempts(fingerprint,created_at desc);
create index recruitment_auth_email_idx on public.recruitment_auth_attempts(email_hash,kind,created_at desc);
alter table public.recruitment_applicant_links enable row level security;
alter table public.recruitment_applicant_sessions enable row level security;
alter table public.recruitment_auth_attempts enable row level security;
revoke all on public.recruitment_applicant_links,public.recruitment_applicant_sessions,public.recruitment_auth_attempts from public,anon,authenticated,service_role;
grant select,insert on public.recruitment_applicant_links,public.recruitment_applicant_sessions,public.recruitment_auth_attempts to service_role;
grant delete on public.recruitment_applicant_sessions,public.recruitment_auth_attempts to service_role;
-- Canonical Auth evidence is read only inside service-only functions/guards.
grant usage on schema auth to service_role;
grant select (id,email,email_confirmed_at,banned_until,deleted_at) on auth.users to service_role;

create function public.recruitment_auth_budget(p_kind text,p_fingerprint text,p_email_hash text)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
  if current_user<>'service_role' then raise exception 'Server authentication required' using errcode='42501'; end if;
  if p_kind is null or p_kind not in ('send','authenticate') or p_fingerprint is null or p_email_hash is null
    or p_fingerprint !~ '^[a-f0-9]{64}$' or p_email_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid request'; end if;
  perform pg_advisory_xact_lock(hashtextextended('recruitment-auth-ip:'||p_fingerprint,0));
  perform pg_advisory_xact_lock(hashtextextended('recruitment-auth-email:'||p_email_hash,0));
  delete from public.recruitment_auth_attempts where created_at<now()-interval '1 day';
  if (select count(*) from public.recruitment_auth_attempts where fingerprint=p_fingerprint and created_at>now()-interval '1 hour')>=30
    or (select count(*) from public.recruitment_auth_attempts where kind=p_kind and email_hash=p_email_hash and created_at>now()-interval '1 hour')>=(case when p_kind='send' then 5 else 10 end)
    or (p_kind='send' and exists(select 1 from public.recruitment_auth_attempts where kind='send' and email_hash=p_email_hash and created_at>now()-interval '60 seconds')) then return false; end if;
  insert into public.recruitment_auth_attempts(kind,fingerprint,email_hash) values(p_kind,p_fingerprint,p_email_hash);
  return true;
end; $$;

create or replace function public.recruitment_contact_guard() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.contact_capture_json is distinct from old.contact_capture_json then
      raise exception 'Contact capture and email verification evidence cannot be changed';
    end if;
    if new.email_verification_status is distinct from old.email_verification_status
      or new.email_verified_at is distinct from old.email_verified_at then
      if current_user <> 'service_role' then
        raise exception 'Email verification requires trusted applicant evidence';
      end if;
      if old.email_verification_status <> 'pending' or new.email_verification_status <> 'verified'
        or not exists (
          select 1 from public.recruitment_applicant_links b join auth.users u on u.id=b.user_id
          where b.organisation_id=new.organisation_id and b.lead_id=new.id
            and lower(u.email)=lower(new.contact_capture_json->>'email')
            and u.email_confirmed_at is not null and u.deleted_at is null
            and (u.banned_until is null or u.banned_until<=now())
            and new.email_verified_at=u.email_confirmed_at
        ) then raise exception 'Email verification requires trusted applicant evidence'; end if;
    end if;
    return new;
  end if;
  if new.contact_capture_json = '{}'::jsonb then
    if new.email_verification_status <> 'not_requested' or new.email_verified_at is not null then
      raise exception 'Email verification requires trusted applicant evidence';
    end if;
    return new;
  end if;
  if current_user <> 'service_role' or new.status <> 'lead_received'
    or new.intake_channel not in ('website','public_link')
    or new.contact_capture_json->>'version' is distinct from 'recruitment-contact-v1'
    or new.contact_capture_json->>'consentVersion' is distinct from 'recruitment-contact-v1'
    or new.contact_capture_json->'privacyAccepted' is distinct from 'true'::jsonb
    or new.email_verification_status <> 'pending' or new.email_verified_at is not null
    or new.name is distinct from (new.contact_capture_json->>'firstName') || ' ' || (new.contact_capture_json->>'lastName')
    or new.email is distinct from new.contact_capture_json->>'email'
    or new.phone is distinct from new.contact_capture_json->>'phone'
    or new.source is distinct from (case when new.intake_channel = 'website' then 'Website' else 'Public recruitment link' end) then
    raise exception 'Contacts must be captured through the public recruitment endpoint';
  end if;
  -- Whitelist and stamp the receipt even for a direct service-role insert.
  new.contact_capture_json := jsonb_build_object(
    'version','recruitment-contact-v1','firstName',new.contact_capture_json->>'firstName',
    'lastName',new.contact_capture_json->>'lastName','email',new.email,'phone',new.phone,
    'privacyAccepted',true,'consentVersion','recruitment-contact-v1','capturedAt',now()
  );
  return new;
end;
$$;

-- Bind only after the provider has proven ownership of the immutable capture email.
-- Every parameter comes from server-side Auth validation, never browser claims.
create function public.recruitment_open_applicant_session(p_organisation_id uuid,p_user_id uuid,p_token_hash text,p_submission_key uuid default null)
returns boolean language plpgsql security invoker set search_path='' as $$
declare applicant record; candidate public.recruitment_leads%rowtype; owner uuid;
begin
  if current_user<>'service_role' then raise exception 'Server authentication required' using errcode='42501'; end if;
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid session'; end if;
  select id,lower(email) as email,email_confirmed_at into applicant from auth.users
    where id=p_user_id and email_confirmed_at is not null and deleted_at is null and (banned_until is null or banned_until<=now());
  if not found then return false; end if;
  select l.* into candidate from public.recruitment_leads l
    join public.recruitment_contact_receipts r on r.organisation_id=l.organisation_id and r.lead_id=l.id
    left join public.recruitment_applicant_links b on b.organisation_id=l.organisation_id and b.lead_id=l.id
    where l.organisation_id=p_organisation_id and lower(l.contact_capture_json->>'email')=applicant.email
      and l.status not in ('closed_lost','agent_activated','legacy_joined')
      and (p_submission_key is null or r.submission_key=p_submission_key)
    order by (case when b.user_id=p_user_id then 0 else 1 end),r.created_at desc,r.id desc limit 1 for update of l;
  if not found then return false; end if;
  insert into public.recruitment_applicant_links(organisation_id,lead_id,user_id) values(p_organisation_id,candidate.id,p_user_id)
    on conflict(organisation_id,lead_id) do nothing;
  select user_id into owner from public.recruitment_applicant_links where organisation_id=p_organisation_id and lead_id=candidate.id;
  if owner is distinct from p_user_id then return false; end if;
  if candidate.email_verification_status='pending' then
    update public.recruitment_leads set email_verification_status='verified',email_verified_at=applicant.email_confirmed_at
      where organisation_id=p_organisation_id and id=candidate.id;
  end if;
  delete from public.recruitment_applicant_sessions where expires_at<=now();
  insert into public.recruitment_applicant_sessions(token_hash,organisation_id,lead_id,user_id) values(p_token_hash,p_organisation_id,candidate.id,p_user_id);
  return true;
end; $$;

create function public.recruitment_resume_applicant(p_organisation_id uuid,p_token_hash text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare candidate public.recruitment_leads%rowtype;
begin
  if current_user<>'service_role' then raise exception 'Server authentication required' using errcode='42501'; end if;
  select l.* into candidate from public.recruitment_applicant_sessions s
    join public.recruitment_leads l on l.organisation_id=s.organisation_id and l.id=s.lead_id
    join auth.users u on u.id=s.user_id
    where s.token_hash=p_token_hash and s.organisation_id=p_organisation_id and s.expires_at>now()
      and u.email_confirmed_at is not null and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now())
      and lower(u.email)=lower(l.contact_capture_json->>'email') and l.email_verification_status='verified'
      and l.status not in ('closed_lost','agent_activated','legacy_joined');
  if not found then return null; end if;
  return jsonb_build_object('emailVerification','verified','stage',candidate.status,'applicationSubmitted',candidate.application_submitted_at is not null,
    'contact',jsonb_build_object('firstName',candidate.contact_capture_json->>'firstName','lastName',candidate.contact_capture_json->>'lastName',
      'email',candidate.contact_capture_json->>'email','phone',candidate.contact_capture_json->>'phone'));
end; $$;
create function public.recruitment_end_applicant_session(p_organisation_id uuid,p_token_hash text)
returns void language plpgsql security invoker set search_path='' as $$
begin
  if current_user<>'service_role' then raise exception 'Server authentication required' using errcode='42501'; end if;
  delete from public.recruitment_applicant_sessions where token_hash=p_token_hash and organisation_id=p_organisation_id;
end; $$;
revoke all on function public.recruitment_auth_budget(text,text,text),public.recruitment_open_applicant_session(uuid,uuid,text,uuid),
  public.recruitment_resume_applicant(uuid,text),public.recruitment_end_applicant_session(uuid,text) from public,anon,authenticated;
grant execute on function public.recruitment_auth_budget(text,text,text),public.recruitment_open_applicant_session(uuid,uuid,text,uuid),
  public.recruitment_resume_applicant(uuid,text),public.recruitment_end_applicant_session(uuid,text) to service_role;
commit;
