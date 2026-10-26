begin;

create function public.marketing_setup_preferences_valid(p jsonb, kind text, complete boolean)
returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare k text; v jsonb; item jsonb; strings text[]; lists text[]; flags text[]; route text;
begin
  if p is null or jsonb_typeof(p)<>'object' or octet_length(p::text)>24000 then return false; end if;
  if kind='agency' then
    strings:=array['agencyName','logoUrl','primaryColor','secondaryColor','accentColor','agencyEmail','agencyPhone','website','about','language','tone','avoid','buyerDestination','sellerDestination','buyerUrl','sellerUrl','reviewUrl'];
    lists:=array['services','serviceAreas','strengths','offers'];
    flags:=array['agencyConfirmed','styleConfirmed','routingConfirmed'];
  elsif kind='agent' then
    strings:=array['name','title','photoUrl','email','phone','whatsapp','bio'];
    lists:=array['serviceAreas','specialties','languages']; flags:=array['detailsConfirmed'];
  else return false; end if;
  for k,v in select * from jsonb_each(p) loop
    if k=any(strings) then
      if jsonb_typeof(v)<>'string' or length(v#>>'{}')>2048 then return false; end if;
      if k in ('about','bio','avoid') and length(v#>>'{}')>2000 then return false; end if;
      if k in ('logoUrl','website','buyerUrl','sellerUrl','reviewUrl','photoUrl') and v#>>'{}'<>'' then
        if v#>>'{}' !~* '^https://[^/?#[:space:]]+([/?#][^[:space:]]*)?$' or v#>>'{}' ~* '^https://[^/]*@' then return false; end if;
      end if;
      if k in ('agencyEmail','email') and v#>>'{}'<>'' and v#>>'{}' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then return false; end if;
      if k in ('primaryColor','secondaryColor','accentColor') and v#>>'{}'<>'' and v#>>'{}' !~ '^#[0-9a-fA-F]{6}$' then return false; end if;
    elsif k=any(lists) then
      if jsonb_typeof(v)<>'array' then return false; end if;
      if jsonb_array_length(v)>(case when k='serviceAreas' then 100 else 20 end) or (k='strengths' and jsonb_array_length(v)>3) then return false; end if;
      for item in select * from jsonb_array_elements(v) loop
        if jsonb_typeof(item)<>'string' or length(btrim(item#>>'{}')) not between 1 and 120 then return false; end if;
        if k='services' and item#>>'{}' not in ('Sales','Rentals','Short-term rentals','Commercial property','Developments') then return false; end if;
        if k='offers' and item#>>'{}' not in ('Property valuation','Complimentary property valuation','Selling consultation') then return false; end if;
      end loop;
    elsif k=any(flags) then
      if jsonb_typeof(v)<>'boolean' then return false; end if;
    else return false; end if;
  end loop;
  if kind='agency' then
    if coalesce(p->>'language','')<>'' and p->>'language' not in ('en-ZA','af-ZA','zu-ZA','xh-ZA','st-ZA','tn-ZA','nso-ZA','ts-ZA','ss-ZA','ve-ZA','nr-ZA') then return false; end if;
    if coalesce(p->>'tone','')<>'' and p->>'tone' not in ('Warm and approachable','Professional and clear','Premium and understated') then return false; end if;
    foreach k in array array['buyer','seller'] loop
      route:=coalesce(p->>(k||'Destination'),'');
      if route<>'' and route not in ('agent','agency','link') then return false; end if;
      if complete and (route='' or (route='link' and btrim(coalesce(p->>(k||'Url'),''))='')) then return false; end if;
      if complete and route='agency' and btrim(coalesce(p->>'agencyEmail',''))='' and btrim(coalesce(p->>'agencyPhone',''))='' then return false; end if;
    end loop;
    if complete and (
      btrim(coalesce(p->>'agencyName',''))='' or jsonb_array_length(coalesce(p->'services','[]'))=0
      or jsonb_array_length(coalesce(p->'serviceAreas','[]'))=0 or coalesce(p->>'language','')='' or coalesce(p->>'tone','')=''
      or p->'agencyConfirmed' is distinct from 'true'::jsonb or p->'styleConfirmed' is distinct from 'true'::jsonb
      or p->'routingConfirmed' is distinct from 'true'::jsonb) then return false; end if;
  elsif complete and (btrim(coalesce(p->>'name',''))='' or
    (btrim(coalesce(p->>'email',''))='' and btrim(coalesce(p->>'phone',''))='') or
    p->'detailsConfirmed' is distinct from 'true'::jsonb) then return false;
  end if;
  return true;
end $$;
revoke all on function public.marketing_setup_preferences_valid(jsonb,text,boolean) from public,anon;
grant execute on function public.marketing_setup_preferences_valid(jsonb,text,boolean) to authenticated,service_role;

create table public.marketing_campaign_setup (
  organisation_id uuid primary key references public.organisations(id) on delete cascade,
  preferences jsonb not null default '{}', source_snapshot jsonb not null default '{}',
  confirmed_preferences jsonb, confirmed_source_snapshot jsonb, confirmed_revision integer,
  status text not null default 'draft' check(status in ('draft','complete')),
  last_step integer not null default 1 check(last_step between 1 and 3),
  schema_version integer not null default 1 check(schema_version=1),
  revision integer not null default 1 check(revision>0),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), completed_at timestamptz,
  check(public.marketing_setup_preferences_valid(preferences,'agency',status='complete')),
  check(public.marketing_setup_preferences_valid(source_snapshot,'agency',false))
);
create table public.marketing_campaign_agent_setup (
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  preferences jsonb not null default '{}', source_snapshot jsonb not null default '{}',
  confirmed_preferences jsonb, confirmed_source_snapshot jsonb, confirmed_revision integer,
  status text not null default 'draft' check(status in ('draft','complete')),
  last_step integer not null default 1 check(last_step between 1 and 3),
  schema_version integer not null default 1 check(schema_version=1),
  revision integer not null default 1 check(revision>0),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), completed_at timestamptz,
  primary key(organisation_id,user_id),
  check(public.marketing_setup_preferences_valid(preferences,'agent',status='complete')),
  check(public.marketing_setup_preferences_valid(source_snapshot,'agent',false))
);
create index marketing_campaign_agent_setup_user on public.marketing_campaign_agent_setup(user_id,organisation_id);
create function public.marketing_setup_protect()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='UPDATE' then
    if (new.organisation_id,new.created_by,new.created_at) is distinct from (old.organisation_id,old.created_by,old.created_at) then
      raise exception 'Setup ownership cannot change.' using errcode='42501';
    end if;
    if new.revision<>old.revision+1 then raise exception 'Setup changed. Reload before saving.' using errcode='40001'; end if;
    new.confirmed_preferences:=old.confirmed_preferences;
    new.confirmed_source_snapshot:=old.confirmed_source_snapshot;
    new.confirmed_revision:=old.confirmed_revision;
    new.completed_at:=old.completed_at;
  elsif new.revision<>1 then raise exception 'New setup must start at revision one.' using errcode='40001';
  end if;
  if new.status='complete' then
    new.confirmed_preferences:=new.preferences;
    new.confirmed_source_snapshot:=new.source_snapshot;
    new.confirmed_revision:=new.revision;
    new.completed_at:=now();
  end if;
  new.updated_by:=auth.uid(); new.updated_at:=now();
  return new;
end $$;
revoke all on function public.marketing_setup_protect() from public,anon,authenticated;
create trigger marketing_setup_protect before insert or update on public.marketing_campaign_setup for each row execute function public.marketing_setup_protect();
create trigger marketing_agent_setup_protect before insert or update on public.marketing_campaign_agent_setup for each row execute function public.marketing_setup_protect();

alter table public.marketing_campaign_setup enable row level security;
alter table public.marketing_campaign_agent_setup enable row level security;
revoke all on public.marketing_campaign_setup,public.marketing_campaign_agent_setup from public,anon,authenticated;
grant select on public.marketing_campaign_setup,public.marketing_campaign_agent_setup to authenticated;
grant insert(organisation_id,preferences,source_snapshot,status,last_step,schema_version),update(preferences,source_snapshot,status,last_step,schema_version,revision) on public.marketing_campaign_setup to authenticated;
grant insert(organisation_id,user_id,preferences,source_snapshot,status,last_step,schema_version),update(preferences,source_snapshot,status,last_step,schema_version,revision) on public.marketing_campaign_agent_setup to authenticated;
grant all on public.marketing_campaign_setup,public.marketing_campaign_agent_setup to service_role;
create policy campaign_setup_read on public.marketing_campaign_setup for select to authenticated using(public.bridge_is_active_member(organisation_id));
create policy campaign_setup_create on public.marketing_campaign_setup for insert to authenticated with check(public.bridge_is_active_member(organisation_id) and public.email_campaign_can_send(organisation_id) and created_by=(select auth.uid()));
create policy campaign_setup_edit on public.marketing_campaign_setup for update to authenticated using(public.bridge_is_active_member(organisation_id) and public.email_campaign_can_send(organisation_id)) with check(public.bridge_is_active_member(organisation_id) and public.email_campaign_can_send(organisation_id));
create policy campaign_agent_setup_read on public.marketing_campaign_agent_setup for select to authenticated using(public.bridge_is_active_member(organisation_id) and user_id=(select auth.uid()));
create policy campaign_agent_setup_create on public.marketing_campaign_agent_setup for insert to authenticated with check(public.bridge_is_active_member(organisation_id) and user_id=(select auth.uid()) and created_by=(select auth.uid()));
create policy campaign_agent_setup_edit on public.marketing_campaign_agent_setup for update to authenticated using(public.bridge_is_active_member(organisation_id) and user_id=(select auth.uid())) with check(public.bridge_is_active_member(organisation_id) and user_id=(select auth.uid()));
notify pgrst,'reload schema';
commit;
