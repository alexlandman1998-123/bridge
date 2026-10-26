begin;

-- Reusable channel drafts contain no recipient lists, schedules or delivery state.
create table public.marketing_channel_templates (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  description text not null default '' check (length(description) <= 600),
  channel text not null check (channel in ('email','whatsapp','meta','social')),
  visibility text not null default 'personal' check (visibility in ('personal','agency')),
  title text not null default '' check (length(title) <= 240),
  body text not null check (length(btrim(body)) between 1 and 9000),
  cta_label text not null default '' check (length(cta_label) <= 80),
  destination_url text not null default '' check (destination_url = '' or (length(destination_url) <= 2048 and destination_url ~ '^https://[^/@[:space:]]+([/?#][^[:space:]]*)?$')),
  image_url text not null default '' check (image_url = '' or (length(image_url) <= 2048 and image_url ~ '^https://[^/@[:space:]]+([/?#][^[:space:]]*)?$')),
  revision integer not null default 1 check (revision > 0),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (channel <> 'email' or length(btrim(title)) > 0)
);
create index marketing_channel_templates_org_updated on public.marketing_channel_templates(organisation_id,updated_at desc,id);

create function public.marketing_channel_template_protect()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if (new.id,new.organisation_id,new.created_by,new.created_at) is distinct from (old.id,old.organisation_id,old.created_by,old.created_at) then
      raise exception 'Template ownership cannot be changed.' using errcode='42501';
    end if;
    if new.revision <> old.revision + 1 then
      raise exception 'This template changed. Reload before saving.' using errcode='40001';
    end if;
  end if;
  new.updated_at = now();
  return new;
end $$;
revoke all on function public.marketing_channel_template_protect() from public,anon,authenticated;
create trigger marketing_channel_template_protect before insert or update on public.marketing_channel_templates for each row execute function public.marketing_channel_template_protect();

alter table public.marketing_channel_templates enable row level security;
revoke all on public.marketing_channel_templates from public,anon,authenticated;
grant select on public.marketing_channel_templates to authenticated;
grant insert(id,organisation_id,name,description,channel,visibility,title,body,cta_label,destination_url,image_url) on public.marketing_channel_templates to authenticated;
grant update(name,description,channel,visibility,title,body,cta_label,destination_url,image_url,revision) on public.marketing_channel_templates to authenticated;
grant all on public.marketing_channel_templates to service_role;
create policy channel_template_read on public.marketing_channel_templates for select to authenticated using (
  public.bridge_is_active_member(organisation_id) and (visibility='agency' or created_by=(select auth.uid()))
);
create policy channel_template_create on public.marketing_channel_templates for insert to authenticated with check (
  public.bridge_is_active_member(organisation_id) and created_by=(select auth.uid()) and revision=1
  and (visibility='personal' or public.email_campaign_can_send(organisation_id))
);
create policy channel_template_edit on public.marketing_channel_templates for update to authenticated using (
  public.bridge_is_active_member(organisation_id) and ((visibility='personal' and created_by=(select auth.uid())) or (visibility='agency' and public.email_campaign_can_send(organisation_id)))
) with check (
  public.bridge_is_active_member(organisation_id) and ((visibility='personal' and created_by=(select auth.uid())) or (visibility='agency' and public.email_campaign_can_send(organisation_id)))
);
notify pgrst,'reload schema';
commit;
