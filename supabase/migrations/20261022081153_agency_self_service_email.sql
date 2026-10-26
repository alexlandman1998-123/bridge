begin;

-- Provider proofs and bounded activation stay server-owned. Agencies manage
-- their sender details through an authorised RPC, never approval/limit fields.
alter table public.email_sender_identities add column is_default boolean not null default false;
create unique index email_sender_default_per_org on public.email_sender_identities(organisation_id) where is_default;
alter table public.email_sending_policies add column self_service_blocked boolean not null default false;
update public.email_sending_policies set self_service_blocked = true
where approved_at is null and approval_note is not null;
revoke insert, update on public.email_sending_policies from authenticated;
revoke insert, update on public.email_sender_identities from authenticated;
drop trigger email_sending_policies_approval_guard on public.email_sending_policies;

create function public.email_activate_verified_organisation(p_organisation_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.email_sender_identities i join public.email_sending_domains d on d.id=i.email_sending_domain_id
    where i.organisation_id=p_organisation_id and d.organisation_id=i.organisation_id
      and i.verification_status='verified' and d.verification_status='verified'
      and i.sending_paused_at is null and d.provider_domain_id is not null
  ) then return; end if;
  insert into public.email_sending_policies(organisation_id, approved_at, approval_note, daily_recipient_limit, max_recipients_per_worker_run)
  values(p_organisation_id, now(), 'Automatically activated after domain verification.', 500, 50)
  on conflict(organisation_id) do update set
    approved_at=coalesce(public.email_sending_policies.approved_at, excluded.approved_at),
    approval_note=coalesce(public.email_sending_policies.approval_note, excluded.approval_note)
  where not public.email_sending_policies.self_service_blocked and public.email_sending_policies.paused_at is null;
  perform public.email_campaign_ensure_subscription_types(p_organisation_id);
end $$;
revoke all on function public.email_activate_verified_organisation(uuid) from public, anon, authenticated;
grant execute on function public.email_activate_verified_organisation(uuid) to service_role;

create function public.email_apply_domain_status(p_domain_id uuid, p_status text, p_records jsonb, p_error text default null)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_domain public.email_sending_domains%rowtype;
begin
  select * into strict v_domain from public.email_sending_domains where id=p_domain_id for update;
  -- Explicitly disabled domains/senders cannot be re-enabled by a provider refresh.
  if v_domain.verification_status='disabled' then return; end if;
  if p_status not in ('pending','verified','failed') then raise exception 'Invalid domain status.'; end if;
  update public.email_sending_domains set verification_status=p_status, dns_records=coalesce(p_records,dns_records),
    last_checked_at=now(), last_provider_error=p_error,
    verified_at=case when p_status='verified' then coalesce(verified_at,now()) else null end where id=p_domain_id;
  update public.email_sender_identities set verification_status=p_status, last_verified_at=now(),
    verified_at=case when p_status='verified' then coalesce(verified_at,now()) else null end
    where email_sending_domain_id=p_domain_id and organisation_id=v_domain.organisation_id and verification_status<>'disabled';
  perform public.email_activate_verified_organisation(v_domain.organisation_id);
end $$;
revoke all on function public.email_apply_domain_status(uuid,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.email_apply_domain_status(uuid,text,jsonb,text) to service_role;

create function public.email_save_sender(p_organisation_id uuid, p_domain_id uuid, p_display_name text,
  p_email text, p_reply_to text, p_default boolean default true, p_identity_id uuid default null)
returns public.email_sender_identities language plpgsql security definer set search_path = '' as $$
declare d public.email_sending_domains%rowtype; result public.email_sender_identities%rowtype;
begin
  if auth.uid() is null or not public.email_campaign_can_send(p_organisation_id) then
    raise exception 'Only an agency administrator can manage senders.' using errcode='42501';
  end if;
  -- Serialise changes to the organisation default, including the first sender.
  perform 1 from public.organisations where id=p_organisation_id for update;
  select * into d from public.email_sending_domains where id=p_domain_id and organisation_id=p_organisation_id for update;
  p_email:=lower(btrim(coalesce(p_email,''))); p_reply_to:=lower(btrim(coalesce(p_reply_to,'')));
  p_display_name:=coalesce(p_display_name,'');
  if d.id is null or d.verification_status='disabled' or d.domain_name<>split_part(p_email,'@',2)
    or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or p_reply_to !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or length(btrim(p_display_name)) not between 1 and 120 or p_display_name ~ '[\r\n<>]' then
    raise exception 'Use a valid sender, reply address and matching agency domain.' using errcode='22023';
  end if;
  if p_identity_id is not null then
    select * into result from public.email_sender_identities where id=p_identity_id and organisation_id=p_organisation_id;
    if result.id is null then raise exception 'Sender not found.' using errcode='42501'; end if;
    if result.verification_status='disabled' then raise exception 'This sender is disabled.' using errcode='22023'; end if;
  end if;
  p_default:=coalesce(p_default,false) or not exists(select 1 from public.email_sender_identities where organisation_id=p_organisation_id and is_default);
  if p_default then update public.email_sender_identities set is_default=false where organisation_id=p_organisation_id and is_default; end if;
  if p_identity_id is null then
    insert into public.email_sender_identities(organisation_id,email_sending_domain_id,display_name,from_email,reply_to_email,verification_status,verified_at,is_default,created_by)
    values(p_organisation_id,d.id,btrim(p_display_name),p_email,p_reply_to,d.verification_status,d.verified_at,p_default,auth.uid()) returning * into result;
  else
    update public.email_sender_identities set email_sending_domain_id=d.id,display_name=btrim(p_display_name),
      from_email=p_email,reply_to_email=p_reply_to,verification_status=d.verification_status,verified_at=d.verified_at,is_default=p_default
      where id=p_identity_id and organisation_id=p_organisation_id returning * into result;
  end if;
  perform public.email_activate_verified_organisation(p_organisation_id);
  return result;
end $$;
revoke all on function public.email_save_sender(uuid,uuid,text,text,text,boolean,uuid) from public, anon;
grant execute on function public.email_save_sender(uuid,uuid,text,text,text,boolean,uuid) to authenticated;

-- The policy row is the lock shared by all campaign workers and tests. A
-- reservation counts even on provider failure, so retries cannot exceed limits.
create table public.email_send_reservations (
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  reservation_key text not null,
  sender_identity_id uuid not null references public.email_sender_identities(id),
  actor_id uuid references auth.users(id),
  is_test boolean not null default false,
  created_at timestamptz not null default now(),
  primary key(organisation_id,reservation_key)
);
create index email_send_reservations_daily on public.email_send_reservations(organisation_id,created_at);
alter table public.email_send_reservations enable row level security;
revoke all on public.email_send_reservations from public, anon, authenticated;
grant select,insert on public.email_send_reservations to service_role;
create function public.email_reserve_send(p_organisation_id uuid,p_identity_id uuid,p_key text,p_actor_id uuid default null,p_test boolean default false)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare policy public.email_sending_policies%rowtype; used integer; legacy_used integer;
begin
  select * into policy from public.email_sending_policies where organisation_id=p_organisation_id for update;
  if policy.organisation_id is null or policy.approved_at is null or policy.paused_at is not null or policy.self_service_blocked then return false; end if;
  if not exists(select 1 from public.email_sender_identities i join public.email_sending_domains d on d.id=i.email_sending_domain_id
    where i.id=p_identity_id and i.organisation_id=p_organisation_id and d.organisation_id=p_organisation_id
      and i.verification_status='verified' and d.verification_status='verified' and i.sending_paused_at is null) then return false; end if;
  if exists(select 1 from public.email_send_reservations where organisation_id=p_organisation_id and reservation_key=p_key) then return true; end if;
  if p_test and (p_actor_id is null or (select count(*) from public.email_send_reservations
    where organisation_id=p_organisation_id and actor_id=p_actor_id and is_test and created_at>now()-interval '1 hour')>=5) then return false; end if;
  select count(*) into used from public.email_send_reservations where organisation_id=p_organisation_id and created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
  select count(*) into legacy_used from public.email_campaign_recipients r where r.organisation_id=p_organisation_id
    and r.sent_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'
    and not exists(select 1 from public.email_send_reservations s where s.organisation_id=p_organisation_id and s.reservation_key='recipient:'||r.id::text);
  if used+legacy_used>=least(policy.daily_recipient_limit,500) then return false; end if;
  insert into public.email_send_reservations(organisation_id,reservation_key,sender_identity_id,actor_id,is_test)
    values(p_organisation_id,p_key,p_identity_id,p_actor_id,p_test);
  return true;
end $$;
revoke all on function public.email_reserve_send(uuid,uuid,text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.email_reserve_send(uuid,uuid,text,uuid,boolean) to service_role;

-- Provider delivery failures pause future reservations immediately. Queued
-- recipients do not dilute the bounce/complaint denominator.
create function public.email_pause_unhealthy_sending()
returns trigger language plpgsql security definer set search_path = '' as $$
declare total bigint; bounces bigint; complaints bigint;
begin
  if new.status not in ('bounced','complained') or new.status is not distinct from old.status then return new; end if;
  select count(*),count(*) filter(where status='bounced'),count(*) filter(where status='complained')
    into total,bounces,complaints from public.email_campaign_recipients
    where organisation_id=new.organisation_id and sent_at>now()-interval '30 days';
  if complaints>0 or (total>=20 and bounces::numeric/total>0.05) then
    update public.email_sending_policies set paused_at=coalesce(paused_at,now()),
      pause_reason=coalesce(pause_reason,case when complaints>0 then 'Sending paused after a spam complaint.' else 'Sending paused because too many emails bounced.' end)
      where organisation_id=new.organisation_id;
  end if;
  return new;
end $$;
revoke all on function public.email_pause_unhealthy_sending() from public,anon,authenticated;
create trigger email_pause_unhealthy_sending after update of status on public.email_campaign_recipients
for each row execute function public.email_pause_unhealthy_sending();

-- Preserve operator stops across automatic refreshes and future sender changes.
create or replace function public.arch9_admin_set_email_sending_policy(
  p_organisation_id uuid,p_approved boolean,p_daily_recipient_limit integer default 500,
  p_paused boolean default false,p_approval_note text default null
) returns public.email_sending_policies language plpgsql security definer set search_path = '' as $$
declare result public.email_sending_policies%rowtype;
begin
  if auth.uid() is null or coalesce(public.arch9_admin_access_level()->>'level','')<>'executive' then
    raise exception 'Only Arch9 executive administrators can change sending controls.' using errcode='42501';
  end if;
  if p_organisation_id is null or p_daily_recipient_limit not between 1 and 500 then raise exception 'Use a daily limit between 1 and 500.'; end if;
  insert into public.email_sending_policies(organisation_id,daily_recipient_limit,approved_at,approved_by,approval_note,paused_at,pause_reason,self_service_blocked)
    values(p_organisation_id,p_daily_recipient_limit,case when p_approved then now() end,case when p_approved then auth.uid() end,
      nullif(btrim(p_approval_note),''),case when p_paused then now() end,case when p_paused then 'Sending paused.' end,not p_approved)
  on conflict(organisation_id) do update set daily_recipient_limit=excluded.daily_recipient_limit,approved_at=excluded.approved_at,
    approved_by=excluded.approved_by,approval_note=excluded.approval_note,paused_at=excluded.paused_at,pause_reason=excluded.pause_reason,self_service_blocked=excluded.self_service_blocked
  returning * into result;
  return result;
end $$;

-- Existing verified agencies become eligible without a new operator task.
select public.email_activate_verified_organisation(organisation_id) from public.email_sender_identities where verification_status='verified' group by organisation_id;
notify pgrst,'reload schema';
commit;
