begin;
-- Preserve the original schema migration and upgrade the recruitment draft in place.
alter table public.recruitment_leads drop constraint recruitment_leads_status_check;
alter table public.recruitment_leads
  add column received_at timestamptz,
  add column captured_by uuid,
  add column intake_channel text not null default 'manual' check (intake_channel in ('manual','public_link','website','private_link')),
  add column intake_key uuid not null default gen_random_uuid(),
  add column activity_json jsonb not null default '[]' check (jsonb_typeof(activity_json) = 'array');

-- Do not infer approval, completed onboarding or account activation from old labels.
update public.recruitment_leads
set received_at = created_at,
    details_json = details_json || jsonb_build_object('legacyStage', status),
    activity_json = jsonb_build_array(jsonb_build_object('type','existing_record_imported','at',now(),'previousStage',status)),
    status = case when status = 'joined' then 'legacy_joined' when status = 'closed_lost' then 'closed_lost' else 'lead_received' end;
alter table public.recruitment_leads alter column received_at set not null;
alter table public.recruitment_leads alter column received_at set default now();
alter table public.recruitment_leads alter column status set default 'lead_received';
alter table public.recruitment_leads add constraint recruitment_leads_status_check check (status in (
  'lead_received','application_submitted','under_review','application_approved',
  'contract_sent','contract_signed','onboarding_complete','agent_activated','closed_lost','legacy_joined'
));
alter table public.recruitment_leads add constraint recruitment_leads_contact_check check (
  length(trim(email)) > 0 or length(trim(phone)) > 0
) not valid;
alter table public.recruitment_leads add constraint recruitment_leads_capture_lengths_check check (
  length(email) <= 254 and length(phone) <= 50 and length(area) <= 254 and length(trim(source)) between 1 and 120
) not valid;
create unique index recruitment_leads_intake_key_idx on public.recruitment_leads(organisation_id,intake_key);
create index recruitment_leads_received_idx on public.recruitment_leads(organisation_id,status,received_at desc);

-- Stamp receipt and append activity inside the same write; callers cannot forge the ledger.
create or replace function public.recruitment_lead_stamp() returns trigger language plpgsql security invoker set search_path = '' as $$
declare event_type text;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'lead_received' then raise exception 'New recruitment enquiries must start at Lead Received'; end if;
    if new.intake_channel <> 'manual' then raise exception 'Public intake is not enabled in this phase'; end if;
    new.received_at := now();
    new.created_at := new.received_at;
    new.updated_at := new.received_at;
    new.captured_by := auth.uid();
    new.version := 1;
    new.activity_json := jsonb_build_array(jsonb_build_object('type','lead_received','at',new.received_at,'actorId',auth.uid(),'source',new.source));
    return new;
  end if;
  if new.organisation_id <> old.organisation_id then raise exception 'Recruitment leads cannot move organisations'; end if;
  if new.received_at is distinct from old.received_at or new.captured_by is distinct from old.captured_by
     or new.intake_channel is distinct from old.intake_channel or new.intake_key is distinct from old.intake_key
     or new.created_at is distinct from old.created_at then
    raise exception 'Recruitment receipt details cannot be changed';
  end if;
  if new.status is distinct from old.status and not (
    (new.status = 'closed_lost' and old.status not in ('agent_activated','legacy_joined'))
    or (old.status = 'closed_lost' and new.status = 'lead_received')
  ) then raise exception 'Later recruitment phases are not enabled yet'; end if;
  event_type := case when new.status = 'closed_lost' and old.status <> 'closed_lost' then 'lead_closed'
                     when old.status = 'closed_lost' and new.status = 'lead_received' then 'lead_reopened'
                     else 'lead_updated' end;
  new.version := old.version + 1;
  new.updated_at := now();
  new.activity_json := old.activity_json || jsonb_build_array(jsonb_build_object(
    'type',event_type,'at',new.updated_at,'actorId',auth.uid(),'fromStage',old.status,'toStage',new.status,'source',new.source
  ));
  return new;
end;
$$;
drop trigger recruitment_lead_stamp on public.recruitment_leads;
create trigger recruitment_lead_stamp before insert or update on public.recruitment_leads for each row execute function public.recruitment_lead_stamp();
commit;
