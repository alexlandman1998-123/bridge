begin;
create schema if not exists private;

create table public.madison_reservation_settings (
 development_id uuid primary key references public.developments(id),
 enabled boolean not null default false,
 trust_name text not null default 'Tuckers Attorneys',
 account_holder text not null default '', bank_name text not null default '',
 account_number text not null default '', branch_code text not null default '',
 proof_email text not null default '', notification_email text not null default '',
 refund_terms text not null default '', updated_by uuid references public.profiles(id),
 updated_at timestamptz not null default now()
);
create table public.madison_reservations (
 id uuid primary key, development_id uuid not null references public.developments(id),
 unit_id uuid not null references public.units(id),
 developer_lead_id uuid not null references public.developer_leads(developer_lead_id),
 buyer_name text not null, buyer_email text not null, buyer_phone text not null,
 request_fingerprint text not null, ip_hash text not null, terms_snapshot jsonb not null,
 state text not null default 'awaiting_deposit' check(state in ('awaiting_deposit','confirmed','expired','released','converted')),
 amount numeric not null default 10000 check(amount=10000),
 payment_reference text not null unique,
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '48 hours',
 confirmed_at timestamptz, confirmed_by uuid references public.profiles(id), bank_reference text,
 released_at timestamptz,
 check(expires_at=created_at+interval '48 hours')
);
create unique index madison_one_active_hold on public.madison_reservations(unit_id) where state in ('awaiting_deposit','confirmed');
create index madison_hold_expiry on public.madison_reservations(expires_at) where state='awaiting_deposit';
create index madison_intake_rate on public.madison_reservations(ip_hash,created_at);
create table public.madison_reservation_emails (
 id uuid primary key default gen_random_uuid(), reservation_id uuid not null references public.madison_reservations(id),
 kind text not null, payload jsonb not null,
 state text not null default 'pending' check(state in ('pending','sending','sent','failed','review','cancelled')),
 first_attempt_at timestamptz, last_attempt_at timestamptz, next_attempt_at timestamptz not null default now(),
 provider_id text, unique(reservation_id,kind)
);

alter table public.madison_reservation_settings enable row level security;
alter table public.madison_reservations enable row level security;
alter table public.madison_reservation_emails enable row level security;
revoke all on public.madison_reservation_settings,public.madison_reservations,public.madison_reservation_emails from public,anon,authenticated;
grant select on public.madison_reservation_settings,public.madison_reservations,public.madison_reservation_emails to authenticated;
grant all on public.madison_reservation_settings,public.madison_reservations,public.madison_reservation_emails to service_role;
create policy madison_settings_staff on public.madison_reservation_settings for select to authenticated using(exists(select 1 from public.developments d where d.id=development_id and public.bridge_has_organisation_membership(d.organisation_id)));
create policy madison_holds_staff on public.madison_reservations for select to authenticated using(exists(select 1 from public.developments d where d.id=development_id and public.bridge_has_organisation_membership(d.organisation_id)));
create policy madison_email_staff on public.madison_reservation_emails for select to authenticated using(exists(select 1 from public.madison_reservations r join public.developments d on d.id=r.development_id where r.id=reservation_id and public.bridge_has_organisation_membership(d.organisation_id)));

create function private.madison_development() returns uuid language sql stable security definer set search_path='' as $$
 select (public.get_public_development_landing('madison-place-abcf1b8a')->>'id')::uuid
$$;
revoke all on function private.madison_development() from public,anon,authenticated;

create function public.madison_save_reservation_settings(p_development_id uuid,p_settings jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or p_development_id is distinct from private.madison_development() or not exists(select 1 from public.developments d where d.id=p_development_id and public.bridge_has_organisation_membership(d.organisation_id)) then raise exception 'Only the Madison Place developer team can configure reservations.' using errcode='42501'; end if;
 if coalesce((p_settings->>'enabled')::boolean,false) and (
   exists(select 1 from unnest(array['account_holder','bank_name','account_number','branch_code','proof_email','notification_email','refund_terms']) k where length(trim(coalesce(p_settings->>k,'')))=0)
   or coalesce(p_settings->>'proof_email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
   or coalesce(p_settings->>'notification_email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 ) then raise exception 'Complete the confirmed trust details, email addresses and refund terms before enabling requests.' using errcode='22023'; end if;
 if length(p_settings::text)>8000 then raise exception 'Settings are too long.'; end if;
 insert into public.madison_reservation_settings(development_id,enabled,account_holder,bank_name,account_number,branch_code,proof_email,notification_email,refund_terms,updated_by)
 values(p_development_id,coalesce((p_settings->>'enabled')::boolean,false),trim(coalesce(p_settings->>'account_holder','')),trim(coalesce(p_settings->>'bank_name','')),trim(coalesce(p_settings->>'account_number','')),trim(coalesce(p_settings->>'branch_code','')),lower(trim(coalesce(p_settings->>'proof_email',''))),lower(trim(coalesce(p_settings->>'notification_email',''))),trim(coalesce(p_settings->>'refund_terms','')),auth.uid())
 on conflict(development_id) do update set enabled=excluded.enabled,account_holder=excluded.account_holder,bank_name=excluded.bank_name,account_number=excluded.account_number,branch_code=excluded.branch_code,proof_email=excluded.proof_email,notification_email=excluded.notification_email,refund_terms=excluded.refund_terms,updated_by=auth.uid(),updated_at=now();
end $$;
revoke all on function public.madison_save_reservation_settings(uuid,jsonb) from public,anon;
grant execute on function public.madison_save_reservation_settings(uuid,jsonb) to authenticated;

-- A stored payload freezes bank details, recipients and copy for safe retries.
create function private.madison_queue_email(p_id uuid,p_kind text) returns void language plpgsql security definer set search_path='' as $$
declare r public.madison_reservations%rowtype; s public.madison_reservation_settings%rowtype; n text;
begin
 select * into strict r from public.madison_reservations where id=p_id;
 select * into s from jsonb_populate_record(null::public.madison_reservation_settings,r.terms_snapshot);
 select unit_number into n from public.units where id=r.unit_id;
 insert into public.madison_reservation_emails(reservation_id,kind,payload)
 values(p_id,p_kind,jsonb_build_object('kind',p_kind,'to',case when p_kind='staff_request' then s.notification_email else r.buyer_email end,'replyTo',s.proof_email,'buyerName',r.buyer_name,'buyerEmail',r.buyer_email,'buyerPhone',r.buyer_phone,'unitNumber',n,'reference',r.payment_reference,'expiresAt',r.expires_at,'trustName',s.trust_name,'accountHolder',s.account_holder,'bankName',s.bank_name,'accountNumber',s.account_number,'branchCode',s.branch_code,'refundTerms',s.refund_terms))
 on conflict(reservation_id,kind) do nothing;
end $$;
revoke all on function private.madison_queue_email(uuid,text) from public,anon,authenticated;

create function private.expire_madison_reservations() returns void language plpgsql security definer set search_path='' as $$
declare u record; r public.madison_reservations%rowtype;
begin
 -- Match the unit-first lock order used by public intake and staff actions.
 for u in select id from public.units where id in(select unit_id from public.madison_reservations where state='awaiting_deposit' and expires_at<=now()) order by id for update skip locked loop
  for r in select * from public.madison_reservations where unit_id=u.id and state='awaiting_deposit' and expires_at<=now() for update loop
   update public.madison_reservations set state='expired',released_at=now() where id=r.id;
   update public.madison_reservation_emails set state='cancelled' where reservation_id=r.id and kind='buyer_request' and state in ('pending','failed');
   update public.units set status='Available' where id=u.id and lower(status)='reserved' and not exists(select 1 from public.transactions where unit_id=u.id and coalesce(lifecycle_state,'active') not in ('cancelled','archived'));
   update public.developer_leads set reservation_state='expired',reservation_expires_at=null,next_action_note='Madison Place hold expired. Review any late payment before offering a new hold.' where developer_lead_id=r.developer_lead_id and reservation_state='provisional';
   insert into public.developer_lead_activity(developer_lead_id,developer_org_id,activity_type,activity_note,visibility_scope,metadata) select r.developer_lead_id,d.organisation_id,'reservation_changed','48-hour hold expired.','developer',jsonb_build_object('reservationId',r.id) from public.developments d where d.id=r.development_id;
   perform private.madison_queue_email(r.id,'expired');
  end loop;
 end loop;
end $$;
revoke all on function private.expire_madison_reservations() from public,anon,authenticated;

create function public.madison_public_reservation_availability() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('enabled',coalesce((select enabled from public.madison_reservation_settings where development_id=private.madison_development()),false),'refundTerms',coalesce((select refund_terms from public.madison_reservation_settings where development_id=private.madison_development()),''),'holds',coalesce((select jsonb_agg(jsonb_build_object('unitId',r.unit_id,'state',case when r.state='awaiting_deposit' and r.expires_at<=now() then 'expired' else r.state end,'expiresAt',r.expires_at)) from public.madison_reservations r where r.development_id=private.madison_development() and r.state in ('awaiting_deposit','confirmed')),'[]'::jsonb))
$$;
revoke all on function public.madison_public_reservation_availability() from public;
grant execute on function public.madison_public_reservation_availability() to anon,authenticated,service_role;

create function public.madison_request_reservation(p_id uuid,p_unit_id uuid,p_name text,p_email text,p_phone text,p_fingerprint text,p_ip_hash text,p_refund_terms text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.madison_reservations%rowtype; u public.units%rowtype; s public.madison_reservation_settings%rowtype; org uuid; lead uuid:=gen_random_uuid();
begin
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into r from public.madison_reservations where id=p_id;
 if found then
  if r.request_fingerprint is distinct from p_fingerprint or r.unit_id is distinct from p_unit_id then raise exception 'This request has already been used.' using errcode='22023'; end if;
  return jsonb_build_object('id',r.id,'state',case when r.state='awaiting_deposit' and r.expires_at<=now() then 'expired' else r.state end,'expiresAt',r.expires_at,'reference',r.payment_reference);
 end if;
 if length(trim(p_name)) not between 2 and 160 or length(p_email)>254 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(trim(p_phone)) not between 6 and 40 or length(p_fingerprint)<>64 or length(p_ip_hash)<>64 then raise exception 'Enter your name, email and phone number.' using errcode='22023'; end if;
 select * into u from public.units where id=p_unit_id for update;
 if not found or u.development_id is distinct from private.madison_development() then raise exception 'This unit is unavailable.' using errcode='23514'; end if;
 -- Release expired holds under the same stock lock before checking availability.
 perform private.expire_madison_reservations();
 select * into u from public.units where id=p_unit_id;
 select * into s from public.madison_reservation_settings where development_id=u.development_id;
 if not found or not s.enabled then raise exception 'Reservations are not open yet. Please contact Samlin.' using errcode='55000'; end if;
 if p_refund_terms is distinct from s.refund_terms then raise exception 'The reservation terms changed. Review the latest terms and try again.' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_ip_hash,1));
 perform pg_advisory_xact_lock(hashtextextended(lower(p_email),2));
 if (select count(*) from public.madison_reservations where ip_hash=p_ip_hash and created_at>now()-interval '1 hour')>=5 or exists(select 1 from public.madison_reservations where lower(buyer_email)=lower(p_email) and state in ('awaiting_deposit','confirmed')) then raise exception 'Please contact Samlin to review your reservation request.' using errcode='54000'; end if;
 if lower(u.status)<>'available' or exists(select 1 from public.developer_leads where preferred_unit_id=u.id and reservation_state in ('provisional','reserved') and converted_transaction_id is null) or exists(select 1 from public.transactions where unit_id=u.id and coalesce(lifecycle_state,'active') not in ('cancelled','archived')) then raise exception 'This unit is no longer available. Please choose another residence.' using errcode='23514'; end if;
 select organisation_id into org from public.developments where id=u.development_id;
 insert into public.developer_leads(developer_lead_id,developer_org_id,primary_development_id,preferred_unit_id,reservation_state,reservation_expires_at,lead_status,lead_source,next_action_note,public_reference)
 values(lead,org,u.development_id,u.id,'provisional',now()+interval '48 hours','qualified','developer_direct','Awaiting R10,000 trust deposit. Samlin must verify cleared funds.', 'MP-'||upper(substr(replace(p_id::text,'-',''),1,12)));
 insert into public.developer_lead_private_details(developer_lead_id,buyer_full_name,buyer_email,buyer_phone,consent_captured_at,consent_reference) values(lead,trim(p_name),lower(trim(p_email)),trim(p_phone),now(),'Madison Place reservation contact consent');
 insert into public.developer_lead_development_interests(developer_lead_id,developer_org_id,development_id,unit_id,is_primary) values(lead,org,u.development_id,u.id,true);
 update public.units set status='Reserved' where id=u.id;
 insert into public.madison_reservations(id,development_id,unit_id,developer_lead_id,buyer_name,buyer_email,buyer_phone,request_fingerprint,ip_hash,terms_snapshot,payment_reference)
 values(p_id,u.development_id,u.id,lead,trim(p_name),lower(trim(p_email)),trim(p_phone),p_fingerprint,p_ip_hash,to_jsonb(s),'MP-'||upper(substr(replace(p_id::text,'-',''),1,12))) returning * into r;
 insert into public.developer_lead_activity(developer_lead_id,developer_org_id,activity_type,activity_note,visibility_scope,metadata) values(lead,org,'reservation_changed','48-hour website hold created; awaiting trust deposit.','developer',jsonb_build_object('reservationId',r.id,'expiresAt',r.expires_at));
 perform private.madison_queue_email(r.id,'buyer_request'); perform private.madison_queue_email(r.id,'staff_request');
 return jsonb_build_object('id',r.id,'state',r.state,'expiresAt',r.expires_at,'reference',r.payment_reference);
end $$;
revoke all on function public.madison_request_reservation(uuid,uuid,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.madison_request_reservation(uuid,uuid,text,text,text,text,text,text) to service_role;

create function public.madison_manage_reservation(p_id uuid,p_action text,p_bank_reference text default '') returns void
language plpgsql security definer set search_path='' as $$
declare r public.madison_reservations%rowtype; u public.units%rowtype; org uuid;
begin
 select * into r from public.madison_reservations where id=p_id;
 select organisation_id into org from public.developments where id=r.development_id;
 if auth.uid() is null or r.development_id is distinct from private.madison_development() or not coalesce(public.bridge_has_organisation_membership(org),false) then raise exception 'Only the Madison Place developer team can manage deposits.' using errcode='42501'; end if;
 select * into u from public.units where id=r.unit_id for update;
 select * into r from public.madison_reservations where id=p_id for update;
 if r.state<>'awaiting_deposit' or r.expires_at<=now() then raise exception 'This hold has ended. Review late payments with the buyer; do not confirm an expired hold.' using errcode='23514'; end if;
 if lower(u.status)<>'reserved' or exists(select 1 from public.transactions where unit_id=u.id and coalesce(lifecycle_state,'active') not in ('cancelled','archived')) then raise exception 'Review the current unit allocation before changing this hold.' using errcode='23514'; end if;
 if p_action='confirm' then
  if length(trim(p_bank_reference)) not between 3 and 200 then raise exception 'Enter the trust bank receipt reference for the verified R10,000.' using errcode='22023'; end if;
  update public.madison_reservations set state='confirmed',confirmed_at=now(),confirmed_by=auth.uid(),bank_reference=trim(p_bank_reference) where id=p_id;
  update public.developer_leads set reservation_state='reserved',reservation_expires_at=null,lead_status='reserved',next_action_note='R10,000 trust deposit manually confirmed by Samlin.' where developer_lead_id=r.developer_lead_id;
  update public.developer_lead_development_interests set interest_status='reserved' where developer_lead_id=r.developer_lead_id and unit_id=r.unit_id;
  perform private.madison_queue_email(p_id,'confirmed');
 elsif p_action='release' then
  update public.madison_reservations set state='released',released_at=now() where id=p_id;
  update public.units set status='Available' where id=r.unit_id;
  update public.developer_leads set reservation_state='none',reservation_expires_at=null,next_action_note='Website hold released by Samlin. Review any incoming trust payment.' where developer_lead_id=r.developer_lead_id;
  perform private.madison_queue_email(p_id,'released');
 else raise exception 'Choose confirm or release.' using errcode='22023'; end if;
 update public.madison_reservation_emails set state='cancelled' where reservation_id=p_id and kind='buyer_request' and state in ('pending','failed');
 insert into public.developer_lead_activity(developer_lead_id,developer_org_id,actor_user_id,activity_type,activity_note,visibility_scope,metadata) values(r.developer_lead_id,org,auth.uid(),'reservation_changed',case when p_action='confirm' then 'Samlin confirmed R10,000 received in trust.' else 'Samlin released the unpaid hold.' end,'developer',jsonb_build_object('reservationId',p_id,'bankReference',trim(p_bank_reference),'action',p_action));
end $$;
revoke all on function public.madison_manage_reservation(uuid,text,text) from public,anon;
grant execute on function public.madison_manage_reservation(uuid,text,text) to authenticated;

-- Existing inventory/lead editors must not bypass the unpaid hold workflow.
create function private.guard_madison_unpaid_hold() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='units' then
  if new.status is distinct from old.status and exists(select 1 from public.madison_reservations where unit_id=old.id and state='awaiting_deposit') then raise exception 'Manage this unit through Madison Place reservations while its deposit is pending.'; end if;
 else
  if ((new.reservation_state,new.preferred_unit_id,new.converted_transaction_id) is distinct from (old.reservation_state,old.preferred_unit_id,old.converted_transaction_id) or new.lead_status='lost') and exists(select 1 from public.madison_reservations where developer_lead_id=old.developer_lead_id and state='awaiting_deposit') then raise exception 'Confirm or release the Madison Place deposit hold first.'; end if;
 end if;
 return new;
end $$;
revoke all on function private.guard_madison_unpaid_hold() from public,anon,authenticated;
create trigger madison_hold_stock_guard before update on public.units for each row execute function private.guard_madison_unpaid_hold();
create trigger madison_hold_lead_guard before update on public.developer_leads for each row execute function private.guard_madison_unpaid_hold();

-- The established staff release flow remains responsible for paid reservations
-- and refunds. Retire its confirmed web claim when that lead is released.
create function private.sync_madison_confirmed_release() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.converted_transaction_id is not null then
  update public.madison_reservations set state='converted' where developer_lead_id=new.developer_lead_id and state='confirmed';
 elsif old.reservation_state='reserved' and new.reservation_state in ('none','expired') then
  update public.madison_reservations set state='released',released_at=now() where developer_lead_id=new.developer_lead_id and state='confirmed';
 end if;
 return new;
end $$;
revoke all on function private.sync_madison_confirmed_release() from public,anon,authenticated;
create trigger madison_confirmed_release after update of reservation_state,converted_transaction_id on public.developer_leads for each row execute function private.sync_madison_confirmed_release();

-- Prevent a sale/onboarding path from consuming stock while EFT is unverified.
create function private.guard_madison_pending_transaction() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.unit_id is not null then
  perform 1 from public.units where id=new.unit_id and development_id in (select development_id from public.madison_reservation_settings) for update;
  if found and exists(select 1 from public.madison_reservations where unit_id=new.unit_id and state='awaiting_deposit') then raise exception 'Confirm or release the Madison Place deposit hold before creating a sale.'; end if;
 end if;
 return new;
end $$;
revoke all on function private.guard_madison_pending_transaction() from public,anon,authenticated;
create trigger madison_pending_transaction_guard before insert or update of unit_id on public.transactions for each row execute function private.guard_madison_pending_transaction();

create function public.madison_claim_reservation_emails() returns setof public.madison_reservation_emails language plpgsql security definer set search_path='' as $$
begin
 perform private.expire_madison_reservations();
 update public.madison_reservation_emails e set state='cancelled' where kind='buyer_request' and e.state in ('pending','failed','sending') and not exists(select 1 from public.madison_reservations r where r.id=e.reservation_id and r.state='awaiting_deposit' and r.expires_at>now());
 update public.madison_reservation_emails set state='review' where state in ('pending','failed','sending') and first_attempt_at<now()-interval '23 hours';
 return query update public.madison_reservation_emails set state='sending',first_attempt_at=coalesce(first_attempt_at,now()),last_attempt_at=now() where id in(select id from public.madison_reservation_emails where ((state in ('pending','failed') and next_attempt_at<=now()) or (state='sending' and last_attempt_at<now()-interval '5 minutes')) order by next_attempt_at limit 5 for update skip locked) returning *;
end $$;
revoke all on function public.madison_claim_reservation_emails() from public,anon,authenticated;
grant execute on function public.madison_claim_reservation_emails() to service_role;

create function private.run_madison_reservations_worker() returns void language plpgsql security definer set search_path='' as $$
declare project_url text; service_key text;
begin
 select decrypted_secret into project_url from vault.decrypted_secrets where name='arch9_project_url' limit 1;
 select decrypted_secret into service_key from vault.decrypted_secrets where name='arch9_service_role_key' limit 1;
 if project_url is null or service_key is null then return; end if;
 perform net.http_post(url:=project_url||'/functions/v1/madison-reservations',headers:=jsonb_build_object('Content-Type','application/json','apikey',service_key),body:='{"action":"dispatch"}'::jsonb);
end $$;
revoke all on function private.run_madison_reservations_worker() from public,anon,authenticated;
do $$ begin
 if to_regclass('cron.job') is not null then
  perform cron.schedule('madison-hold-expiry','* * * * *','select private.expire_madison_reservations();');
  perform cron.schedule('madison-reservation-emails','* * * * *','select private.run_madison_reservations_worker();');
 else raise notice 'Enable pg_cron/pg_net and schedule both Madison reservation jobs before activation.'; end if;
end $$;
notify pgrst,'reload schema';
commit;
