begin;
alter table public.recruitment_leads
  add column application_json jsonb not null default '{}' check (jsonb_typeof(application_json) = 'object'),
  add column application_submitted_at timestamptz;
create unique index recruitment_leads_org_id_idx on public.recruitment_leads(organisation_id,id);
create table public.recruitment_intake_links (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  lead_id uuid,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  channel text not null check (channel in ('public_link','website','private_link')),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  submitted_at timestamptz,
  check ((channel = 'private_link') = (lead_id is not null)),
  check (expires_at > created_at and expires_at <= created_at + interval '366 days'),
  foreign key (organisation_id,lead_id) references public.recruitment_leads(organisation_id,id)
);
alter table public.recruitment_intake_links enable row level security;
revoke all on public.recruitment_intake_links from public,anon,authenticated;
grant select,insert on public.recruitment_intake_links to authenticated;
grant update(revoked_at) on public.recruitment_intake_links to authenticated;
grant all on public.recruitment_intake_links to service_role;
create policy recruitment_intake_link_read on public.recruitment_intake_links for select to authenticated using (exists (
  select 1 from public.organisation_users m where m.organisation_id = recruitment_intake_links.organisation_id and m.user_id = (select auth.uid()) and m.status = 'active' and m.role in ('principal','admin','super_admin')
));
create policy recruitment_intake_link_create on public.recruitment_intake_links for insert to authenticated with check (
  created_by = (select auth.uid()) and created_at between now() - interval '1 minute' and now() + interval '1 minute'
  and submitted_at is null and revoked_at is null and (channel <> 'private_link' or (expires_at <= now() + interval '30 days' and exists (select 1 from public.recruitment_leads l where l.id = lead_id and l.organisation_id = recruitment_intake_links.organisation_id and l.status = 'lead_received')))
  and exists (select 1 from public.organisation_users m where m.organisation_id = recruitment_intake_links.organisation_id and m.user_id = (select auth.uid()) and m.status = 'active' and m.role in ('principal','admin','super_admin'))
);
create policy recruitment_intake_link_revoke on public.recruitment_intake_links for update to authenticated using (exists (
  select 1 from public.organisation_users m where m.organisation_id = recruitment_intake_links.organisation_id and m.user_id = (select auth.uid()) and m.status = 'active' and m.role in ('principal','admin','super_admin')
)) with check (revoked_at is not null and exists (
  select 1 from public.organisation_users m where m.organisation_id = recruitment_intake_links.organisation_id and m.user_id = (select auth.uid()) and m.status = 'active' and m.role in ('principal','admin','super_admin')
));
create table public.recruitment_application_receipts (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.recruitment_intake_links(id),
  submission_key uuid not null,
  lead_id uuid not null references public.recruitment_leads(id),
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  unique(link_id,submission_key)
);
create index recruitment_application_rate_idx on public.recruitment_application_receipts(fingerprint,created_at desc);
alter table public.recruitment_application_receipts enable row level security;
revoke all on public.recruitment_application_receipts from public,anon,authenticated;
grant all on public.recruitment_application_receipts to service_role;

-- Only the server submission endpoint can write the immutable application snapshot.
create or replace function public.recruitment_lead_stamp() returns trigger language plpgsql security invoker set search_path = '' as $$
declare event_type text; submitting boolean;
begin
  submitting := coalesce(current_user = 'service_role' and new.status = 'application_submitted'
    and new.application_json->>'version' = 'recruitment-application-v1'
    and new.application_json->'answers'->>'privacyAccepted' = 'true'
    and new.application_json->'answers'->>'declarationAccepted' = 'true',false);
  if tg_op = 'INSERT' then
    if new.status <> 'lead_received' and not submitting then raise exception 'New recruitment enquiries must start at Lead Received'; end if;
    if new.intake_channel <> 'manual' and not submitting then raise exception 'Public intake requires a submitted application'; end if;
    if not submitting and (new.application_json <> '{}' or new.application_submitted_at is not null) then raise exception 'Applications must be submitted through the Join Us form'; end if;
    new.received_at := now(); new.created_at := now(); new.updated_at := now(); new.captured_by := auth.uid(); new.version := 1;
    new.activity_json := jsonb_build_array(jsonb_build_object('type','lead_received','at',now(),'actorId',auth.uid(),'source',new.source));
    if submitting then
      new.application_submitted_at := now();
      new.activity_json := new.activity_json || jsonb_build_array(jsonb_build_object('type','application_submitted','at',now(),'channel',new.application_json->>'channel'));
    end if;
  else
    if new.organisation_id <> old.organisation_id then raise exception 'Recruitment leads cannot move organisations'; end if;
    if new.received_at is distinct from old.received_at or new.captured_by is distinct from old.captured_by or new.intake_channel is distinct from old.intake_channel or new.intake_key is distinct from old.intake_key or new.created_at is distinct from old.created_at then raise exception 'Recruitment receipt details cannot be changed'; end if;
    submitting := coalesce(submitting,false) and old.status = 'lead_received' and old.application_submitted_at is null;
    if not submitting and (new.application_json is distinct from old.application_json or new.application_submitted_at is distinct from old.application_submitted_at) then raise exception 'Applications must be submitted through the Join Us form'; end if;
    if new.status is distinct from old.status and not (submitting or
      (new.status = 'closed_lost' and old.status not in ('agent_activated','legacy_joined')) or
      (old.status = 'closed_lost' and new.status = case when old.application_submitted_at is null then 'lead_received' else 'application_submitted' end)
    ) then raise exception 'Later recruitment phases are not enabled yet'; end if;
    if submitting then new.application_submitted_at := now(); end if;
    event_type := case when submitting then 'application_submitted' when new.status = 'closed_lost' and old.status <> 'closed_lost' then 'lead_closed' when old.status = 'closed_lost' then 'lead_reopened' else 'lead_updated' end;
    new.version := old.version + 1; new.updated_at := now();
    new.activity_json := old.activity_json || jsonb_build_array(jsonb_build_object('type',event_type,'at',now(),'actorId',auth.uid(),'fromStage',old.status,'toStage',new.status,'channel',new.application_json->>'channel'));
  end if;
  new.details_json := jsonb_set(new.details_json,'{onboardingCaptured}',to_jsonb(new.application_submitted_at is not null or coalesce(tg_op = 'UPDATE' and old.details_json->>'onboardingCaptured' = 'true',false)));
  return new;
end;
$$;

create function public.recruitment_submit_application(p_link_id uuid,p_submission_key uuid,p_answers jsonb,p_fingerprint text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare link public.recruitment_intake_links; target public.recruitment_leads; snapshot jsonb;
begin
  if current_user <> 'service_role' then raise exception 'Server submission required'; end if;
  if p_submission_key is null or p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$' or jsonb_typeof(p_answers) is distinct from 'object'
    or p_answers->>'privacyAccepted' is distinct from 'true' or p_answers->>'declarationAccepted' is distinct from 'true'
    or length(p_answers::text) > 16000 or length(trim(coalesce(p_answers->>'name',''))) not between 2 and 120
    or coalesce(p_answers->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or length(regexp_replace(coalesce(p_answers->>'phone',''),'[^0-9]','','g')) < 9 then raise exception 'Invalid application'; end if;
  -- Serialise retries of this link, then rate-limit submissions across links from one sender.
  perform pg_advisory_xact_lock(hashtextextended(p_fingerprint,0));
  select * into link from public.recruitment_intake_links where id = p_link_id for update;
  if not found or link.revoked_at is not null or link.expires_at <= now() then return jsonb_build_object('unavailable',true); end if;
  if exists (select 1 from public.recruitment_application_receipts where link_id = link.id and submission_key = p_submission_key) then return jsonb_build_object('accepted',true,'duplicate',true); end if;
  if link.submitted_at is not null then return jsonb_build_object('alreadySubmitted',true); end if;
  if (select count(*) from public.recruitment_application_receipts where fingerprint = p_fingerprint and created_at > now() - interval '1 hour') >= 5 then return jsonb_build_object('rateLimited',true); end if;
  snapshot := jsonb_build_object('version','recruitment-application-v1','channel',link.channel,'answers',p_answers,'submittedAt',now());
  if link.lead_id is not null then
    select * into target from public.recruitment_leads where id = link.lead_id and organisation_id = link.organisation_id for update;
    if not found or target.status <> 'lead_received' or target.application_submitted_at is not null then return jsonb_build_object('unavailable',true); end if;
    update public.recruitment_leads set name=p_answers->>'name',email=p_answers->>'email',phone=p_answers->>'phone',area=p_answers->>'area',status='application_submitted',application_json=snapshot where id=target.id;
    update public.recruitment_intake_links set submitted_at=now() where id=link.id;
  else
    insert into public.recruitment_leads(organisation_id,name,email,phone,area,source,status,intake_channel,intake_key,application_json)
    values(link.organisation_id,p_answers->>'name',p_answers->>'email',p_answers->>'phone',p_answers->>'area',case when link.channel='website' then 'Website' else 'Public application' end,'application_submitted',link.channel,p_submission_key,snapshot) returning * into target;
  end if;
  insert into public.recruitment_application_receipts(link_id,submission_key,lead_id,fingerprint) values(link.id,p_submission_key,target.id,p_fingerprint);
  return jsonb_build_object('accepted',true,'duplicate',false);
end;
$$;
revoke all on function public.recruitment_submit_application(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.recruitment_submit_application(uuid,uuid,jsonb,text) to service_role;
commit;
