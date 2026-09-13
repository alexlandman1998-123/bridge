begin;
-- Incomplete drafts can be saved; existing dispatch preflight remains authoritative.
alter table public.email_campaigns drop constraint email_campaigns_subject_check;
alter table public.email_campaigns add constraint email_campaigns_subject_check check (length(subject) <= 250 and (status in ('draft','archived','cancelled') or length(btrim(subject)) > 0));
create table public.email_campaign_revisions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.email_campaigns(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.email_campaign_revisions enable row level security;
grant select, insert on public.email_campaign_revisions to authenticated;
create policy email_campaign_revisions_read on public.email_campaign_revisions for select to authenticated using (exists (select 1 from public.email_campaigns c where c.id=campaign_id and c.organisation_id=email_campaign_revisions.organisation_id));
create policy email_campaign_revisions_capture on public.email_campaign_revisions for insert to authenticated with check (exists (select 1 from public.email_campaigns c where c.id=campaign_id and c.organisation_id=email_campaign_revisions.organisation_id and (c.created_by=auth.uid() or public.email_campaign_can_send(c.organisation_id)) and email_campaign_revisions.snapshot=to_jsonb(c)));
create function public.email_campaign_capture_revision() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='INSERT' or (new.name,new.subject,new.preview_text,new.content_json,new.audience_filter,new.sender_identity_id,new.subscription_type_id) is distinct from (old.name,old.subject,old.preview_text,old.content_json,old.audience_filter,old.sender_identity_id,old.subscription_type_id) then
    insert into public.email_campaign_revisions(campaign_id,organisation_id,snapshot) values(new.id,new.organisation_id,to_jsonb(new));
  end if;
  return new;
end $$;
create trigger email_campaign_capture_revision after insert or update on public.email_campaigns for each row execute function public.email_campaign_capture_revision();
create index email_campaign_revisions_campaign_time on public.email_campaign_revisions(campaign_id,created_at desc);
commit;
