begin;

-- Independent legal foundation. No transaction, conveyancing, Storage or worker writes.
-- This schema must remain outside PostgREST's exposed schemas.
create schema legal_private;
revoke all on schema legal_private from public, anon, authenticated;
grant usage on schema legal_private to authenticated;

create table legal_private.firm_settings (
  firm_id uuid primary key references public.attorney_firms(id),
  enabled boolean not null default false,
  disciplines text[] not null default '{}',
  revision bigint not null default 1,
  check (disciplines <@ array['wills_estates','trusts','debt_collection','family_law']::text[])
);
create table legal_private.capabilities (
  firm_id uuid not null references public.attorney_firms(id),
  user_id uuid not null references auth.users(id),
  disciplines text[] not null default '{}',
  can_manage boolean not null default false,
  can_create boolean not null default false,
  can_edit boolean not null default false,
  can_review boolean not null default false,
  primary key (firm_id,user_id),
  check (disciplines <@ array['wills_estates','trusts','debt_collection','family_law']::text[])
);
create table legal_private.clients (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.attorney_firms(id),
  kind text not null check (kind in ('individual','organisation')),
  name text not null check (length(btrim(name)) between 1 and 200),
  email text not null default '' check (length(email) <= 254),
  phone text not null default '' check (length(phone) <= 50),
  revision bigint not null default 1,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (firm_id,id)
);
create table legal_private.matters (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.attorney_firms(id),
  reference text not null,
  title text not null check (length(btrim(title)) between 1 and 200),
  discipline text not null check (discipline in ('wills_estates','trusts','debt_collection','family_law')),
  status text not null default 'draft' check (status in ('draft','open','on_hold','closed','archived')),
  responsible_user_id uuid not null references auth.users(id),
  restricted boolean not null default false,
  conflict_decision text not null default 'pending' check (conflict_decision in ('pending','clear','declined')),
  conflict_note text not null default '',
  engagement_decision text not null default 'pending' check (engagement_decision in ('pending','accepted','declined')),
  engagement_note text not null default '',
  revision bigint not null default 1,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  opened_at timestamptz,
  closed_at timestamptz,
  unique (firm_id,id), unique (firm_id,reference)
);
create index legal_matters_register_idx on legal_private.matters(firm_id,discipline,status,created_at desc,id);
create index legal_matters_responsible_idx on legal_private.matters(firm_id,responsible_user_id);
create table legal_private.parties (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null,
  matter_id uuid not null,
  client_id uuid not null,
  role text not null check (role in ('client','opponent','beneficiary','trustee','witness','representative','other')),
  removed_at timestamptz,
  foreign key (firm_id,matter_id) references legal_private.matters(firm_id,id),
  foreign key (firm_id,client_id) references legal_private.clients(firm_id,id)
);
create unique index legal_party_active_idx on legal_private.parties(matter_id,client_id,role) where removed_at is null;
create index legal_party_client_idx on legal_private.parties(firm_id,client_id) where removed_at is null;
create table legal_private.team (
  firm_id uuid not null,
  matter_id uuid not null,
  user_id uuid not null references auth.users(id),
  added_by uuid not null references auth.users(id),
  added_at timestamptz not null default now(),
  removed_at timestamptz,
  primary key (matter_id,user_id),
  foreign key (firm_id,matter_id) references legal_private.matters(firm_id,id)
);
create index legal_team_access_idx on legal_private.team(firm_id,user_id,matter_id) where removed_at is null;
create table legal_private.events (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.attorney_firms(id),
  matter_id uuid,
  actor_id uuid not null references auth.users(id),
  action text not null,
  request_id uuid not null,
  details jsonb not null,
  created_at timestamptz not null default now(),
  foreign key (firm_id,matter_id) references legal_private.matters(firm_id,id)
);
create index legal_events_matter_idx on legal_private.events(matter_id,created_at,id);
create table legal_private.references (
  firm_id uuid primary key references public.attorney_firms(id),
  next_number bigint not null default 1 check(next_number > 0)
);
create table legal_private.receipts (
  firm_id uuid not null references public.attorney_firms(id),
  actor_id uuid not null references auth.users(id),
  request_id uuid not null,
  action text not null,
  payload jsonb not null,
  result jsonb not null,
  primary key(firm_id,actor_id,request_id)
);

-- Helpers never trust a supplied actor or profile/auth metadata. Active membership
-- and current firm configuration are rechecked, including before receipt recovery.
create function legal_private.member(p_firm uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.attorney_firm_members m join public.attorney_firms f on f.id=m.firm_id
    where m.firm_id=p_firm and m.user_id=auth.uid() and m.status='active'
      and f.is_active and f.organisation_id is not null
  )
$$;
create function legal_private.principal(p_firm uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select legal_private.member(p_firm) and exists (
    select 1 from public.attorney_firm_members m where m.firm_id=p_firm and m.user_id=auth.uid()
      and coalesce(m.professional_role,m.role) in ('firm_admin','director_partner')
  )
$$;
create function legal_private.allowed(p_firm uuid,p_discipline text default null,p_capability text default 'view') returns boolean
language sql stable security definer set search_path = '' as $$
  select legal_private.member(p_firm) and exists (
    select 1 from legal_private.firm_settings s join legal_private.capabilities c on c.firm_id=s.firm_id
    where s.firm_id=p_firm and s.enabled and c.user_id=auth.uid()
      and (c.disciplines && s.disciplines or (c.can_manage and legal_private.principal(p_firm) and cardinality(s.disciplines)>0))
      and (p_discipline is null or (p_discipline=any(s.disciplines) and
        (p_discipline=any(c.disciplines) or (c.can_manage and legal_private.principal(p_firm)))))
      and case p_capability when 'view' then true when 'create' then c.can_create
        when 'edit' then c.can_edit when 'review' then c.can_review
        when 'manage' then c.can_manage and legal_private.principal(p_firm) else false end
  )
$$;
create function legal_private.matter_access(p_matter uuid,p_capability text default 'view') returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from legal_private.matters m where m.id=p_matter
      and legal_private.allowed(m.firm_id,m.discipline,p_capability)
      and (m.responsible_user_id=auth.uid() or exists (
        select 1 from legal_private.team t where t.matter_id=m.id and t.user_id=auth.uid() and t.removed_at is null
      ) or (not m.restricted and legal_private.allowed(m.firm_id,m.discipline,'manage')))
  )
$$;
create function legal_private.client_access(p_client uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from legal_private.clients c where c.id=p_client and legal_private.allowed(c.firm_id)
      and (exists(select 1 from legal_private.parties p where p.client_id=c.id and p.removed_at is null
        and legal_private.matter_access(p.matter_id)) or
        (not exists(select 1 from legal_private.parties p where p.client_id=c.id and p.removed_at is null)
          and (c.created_by=auth.uid() or legal_private.allowed(c.firm_id,null,'manage'))))
  )
$$;

-- No direct writes, and no general table grants, even inside the private schema.
-- Read policies are defence in depth if a narrowly reviewed read grant is added later.
do $$ declare t text; begin
  foreach t in array array['firm_settings','capabilities','clients','matters','parties','team','events','references','receipts'] loop
    execute format('alter table legal_private.%I enable row level security',t);
    execute format('revoke all on legal_private.%I from public,anon,authenticated',t);
  end loop;
end $$;
create policy legal_settings_read on legal_private.firm_settings for select to authenticated using (legal_private.member(firm_id));
create policy legal_capabilities_read on legal_private.capabilities for select to authenticated using (user_id=auth.uid() and legal_private.member(firm_id));
create policy legal_matter_read on legal_private.matters for select to authenticated using (legal_private.matter_access(id));
create policy legal_client_read on legal_private.clients for select to authenticated using (legal_private.client_access(id));
create policy legal_party_read on legal_private.parties for select to authenticated using (legal_private.matter_access(matter_id));
create policy legal_team_read on legal_private.team for select to authenticated using (legal_private.matter_access(matter_id));
create policy legal_events_read on legal_private.events for select to authenticated using (
  case when matter_id is not null then legal_private.matter_access(matter_id)
    else legal_private.allowed(firm_id,null,'manage') end
);

create function legal_private.command(p_firm uuid,p_request uuid,p_action text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid(); m legal_private.matters; c legal_private.clients;
  saved legal_private.receipts; result jsonb; num bigint; target uuid; person uuid;
  users uuid[]; keys text[]; capability jsonb; old_revision bigint; new_status text;
begin
  if actor is null or p_request is null or p_firm is null or not legal_private.member(p_firm) then
    raise exception 'Legal access denied' using errcode='42501';
  end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>32768 then
    raise exception 'Invalid legal command';
  end if;
  if p_action not in ('configure','create_client','update_client','create_matter','update_matter','review_intake','set_team','add_party','remove_party') then
    raise exception 'Unsupported legal command';
  end if;
  keys := case p_action
    when 'configure' then array['enabled','disciplines','grants','expected_revision']
    when 'create_client' then array['kind','name','email','phone']
    when 'update_client' then array['client_id','expected_revision','name','email','phone']
    when 'create_matter' then array['title','discipline','responsible_user_id','restricted','client_id']
    when 'update_matter' then array['matter_id','expected_revision','title','status','restricted','reason']
    when 'review_intake' then array['matter_id','expected_revision','conflict_decision','conflict_note','engagement_decision','engagement_note']
    when 'set_team' then array['matter_id','expected_revision','responsible_user_id','user_ids']
    when 'add_party' then array['matter_id','expected_revision','client_id','role']
    when 'remove_party' then array['matter_id','expected_revision','party_id'] end;
  if exists(select 1 from jsonb_object_keys(p_payload) k where not k=any(keys)) then
    raise exception 'Unsupported legal command field' using errcode='22023';
  end if;
  if p_action='configure' then
    if not legal_private.principal(p_firm) then raise exception 'Firm management required' using errcode='42501'; end if;
  elsif not legal_private.allowed(p_firm) then
    raise exception 'Legal workspace unavailable' using errcode='42501';
  end if;
  -- Serialises only Legal commands in this firm, not any conveyancing operation.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_firm::text,912));
  if p_action in ('update_matter','review_intake','set_team','add_party','remove_party') then
    select * into m from legal_private.matters where id=(p_payload->>'matter_id')::uuid and firm_id=p_firm for update;
    if not found or not legal_private.matter_access(m.id,'edit') then
      raise exception 'Legal matter access denied' using errcode='42501';
    end if;
    if p_action='review_intake' and not legal_private.allowed(p_firm,m.discipline,'review') then
      raise exception 'Intake review authority required' using errcode='42501';
    end if;
    if p_action='set_team' and m.responsible_user_id<>actor and not legal_private.allowed(p_firm,m.discipline,'manage') then
      raise exception 'Team management denied' using errcode='42501';
    end if;
  elsif p_action in ('create_client','create_matter','update_client') and not legal_private.allowed(p_firm,null,'create') then
    raise exception 'Legal creation denied' using errcode='42501';
  end if;
  if p_action='create_matter' and not legal_private.allowed(p_firm,p_payload->>'discipline','create') then
    raise exception 'Discipline access denied' using errcode='42501';
  end if;
  select * into saved from legal_private.receipts where firm_id=p_firm and actor_id=actor and request_id=p_request;
  if found then
    if saved.action<>p_action or saved.payload<>p_payload then raise exception 'Request identity reused with different content' using errcode='22023'; end if;
    -- Recovered matter/client results also require current access after revocation.
    if saved.result ? 'matter' and not legal_private.matter_access((saved.result->'matter'->>'id')::uuid) then
      raise exception 'Recovered matter access denied' using errcode='42501';
    end if;
    if saved.result ? 'client' and not legal_private.client_access((saved.result->'client'->>'id')::uuid) then
      raise exception 'Recovered client access denied' using errcode='42501';
    end if;
    return saved.result || jsonb_build_object('deduplicated',true);
  end if;
  if m.id is not null and m.status in ('closed','archived') and p_action<>'update_matter' then
    raise exception 'Restore or reopen the matter before editing';
  end if;
  if m.id is not null and (p_payload->>'expected_revision')::bigint is distinct from m.revision then
    raise exception 'Legal matter changed; reload before saving' using errcode='40001';
  end if;

  if p_action='configure' then
    select revision into old_revision from legal_private.firm_settings where firm_id=p_firm for update;
    if coalesce(old_revision,0) is distinct from (p_payload->>'expected_revision')::bigint then
      raise exception 'Legal settings changed; reload before saving' using errcode='40001';
    end if;
    insert into legal_private.firm_settings(firm_id,enabled,disciplines,revision)
      values(p_firm,(p_payload->>'enabled')::boolean,array(select jsonb_array_elements_text(p_payload->'disciplines')),coalesce(old_revision,0)+1)
      on conflict(firm_id) do update set enabled=excluded.enabled,disciplines=excluded.disciplines,revision=excluded.revision;
    for capability in select value from jsonb_array_elements(p_payload->'grants') loop
      person := (capability->>'user_id')::uuid;
      if not exists(select 1 from public.attorney_firm_members where firm_id=p_firm and user_id=person and status='active') then
        raise exception 'Grant requires active firm membership';
      end if;
      if coalesce((capability->>'can_manage')::boolean,false) and not exists (
        select 1 from public.attorney_firm_members where firm_id=p_firm and user_id=person
          and coalesce(professional_role,role) in ('firm_admin','director_partner')
      ) then raise exception 'Management grant requires a director or firm administrator'; end if;
      insert into legal_private.capabilities values(p_firm,person,
        array(select jsonb_array_elements_text(capability->'disciplines')),
        coalesce((capability->>'can_manage')::boolean,false),coalesce((capability->>'can_create')::boolean,false),
        coalesce((capability->>'can_edit')::boolean,false),coalesce((capability->>'can_review')::boolean,false))
      on conflict(firm_id,user_id) do update set disciplines=excluded.disciplines,can_manage=excluded.can_manage,
        can_create=excluded.can_create,can_edit=excluded.can_edit,can_review=excluded.can_review;
    end loop;
    result := jsonb_build_object('settings',(select to_jsonb(s) from legal_private.firm_settings s where firm_id=p_firm));

  elsif p_action in ('create_client','update_client') then
    if p_action='update_client' then
      select * into c from legal_private.clients where id=(p_payload->>'client_id')::uuid and firm_id=p_firm for update;
      if not found or not legal_private.client_access(c.id) or exists(select 1 from legal_private.parties where client_id=c.id and removed_at is null) then
        raise exception 'Linked client identity requires a separate reviewed change' using errcode='42501';
      end if;
      if c.revision is distinct from (p_payload->>'expected_revision')::bigint then raise exception 'Client changed' using errcode='40001'; end if;
      update legal_private.clients set name=btrim(p_payload->>'name'),email=coalesce(p_payload->>'email',''),
        phone=coalesce(p_payload->>'phone',''),revision=revision+1 where id=c.id returning * into c;
    else
      insert into legal_private.clients(firm_id,kind,name,email,phone,created_by)
        values(p_firm,p_payload->>'kind',btrim(p_payload->>'name'),coalesce(p_payload->>'email',''),coalesce(p_payload->>'phone',''),actor)
        returning * into c;
    end if;
    result := jsonb_build_object('client',to_jsonb(c));

  elsif p_action='create_matter' then
    person := (p_payload->>'responsible_user_id')::uuid;
    if person<>actor and not legal_private.allowed(p_firm,p_payload->>'discipline','manage') then
      raise exception 'Only management may create another attorney''s matter' using errcode='42501';
    end if;
    if not exists(select 1 from public.attorney_firm_members a join legal_private.capabilities g
      on g.firm_id=a.firm_id and g.user_id=a.user_id where a.firm_id=p_firm and a.user_id=person and a.status='active'
      and g.can_edit and ((p_payload->>'discipline')=any(g.disciplines) or
        (g.can_manage and coalesce(a.professional_role,a.role) in ('firm_admin','director_partner')))) then
      raise exception 'Responsible attorney needs active discipline edit access';
    end if;
    insert into legal_private.references(firm_id,next_number) values(p_firm,2)
      on conflict(firm_id) do update set next_number=legal_private.references.next_number+1 returning next_number-1 into num;
    insert into legal_private.matters(firm_id,reference,title,discipline,responsible_user_id,restricted,created_by)
      values(p_firm,'LEG-'||to_char(current_date,'YYYY')||'-'||lpad(num::text,greatest(8,length(num::text)),'0'),btrim(p_payload->>'title'),
        p_payload->>'discipline',person,coalesce((p_payload->>'restricted')::boolean,false),actor) returning * into m;
    insert into legal_private.team(firm_id,matter_id,user_id,added_by) values(p_firm,m.id,person,actor);
    if actor<>person then insert into legal_private.team(firm_id,matter_id,user_id,added_by) values(p_firm,m.id,actor,actor); end if;
    target := (p_payload->>'client_id')::uuid;
    if not exists(select 1 from legal_private.clients where id=target and firm_id=p_firm) or not legal_private.client_access(target) then
      raise exception 'Client access denied' using errcode='42501';
    end if;
    insert into legal_private.parties(firm_id,matter_id,client_id,role) values(p_firm,m.id,target,'client');

  elsif p_action='review_intake' then
    if length(btrim(coalesce(p_payload->>'conflict_note','')))=0 or length(btrim(coalesce(p_payload->>'engagement_note','')))=0 then
      raise exception 'Record reasons for both intake decisions';
    end if;
    update legal_private.matters set conflict_decision=p_payload->>'conflict_decision',conflict_note=p_payload->>'conflict_note',
      engagement_decision=p_payload->>'engagement_decision',engagement_note=p_payload->>'engagement_note',
      status=case when status='open' then 'on_hold' else status end where id=m.id;

  elsif p_action='set_team' then
    person := coalesce((p_payload->>'responsible_user_id')::uuid,m.responsible_user_id);
    users := array(select distinct value::uuid from jsonb_array_elements_text(p_payload->'user_ids'));
    if not person=any(users) or cardinality(users)=0 then raise exception 'Team must include the responsible attorney'; end if;
    if exists(select 1 from unnest(users) u where not exists (
      select 1 from public.attorney_firm_members a join legal_private.capabilities g on g.firm_id=a.firm_id and g.user_id=a.user_id
      where a.firm_id=p_firm and a.user_id=u and a.status='active' and
        (m.discipline=any(g.disciplines) or (g.can_manage and coalesce(a.professional_role,a.role) in ('firm_admin','director_partner')))
        and (u<>person or g.can_edit))) then raise exception 'Team member lacks active discipline access'; end if;
    update legal_private.team set removed_at=now() where matter_id=m.id and not user_id=any(users) and removed_at is null;
    insert into legal_private.team(firm_id,matter_id,user_id,added_by)
      select p_firm,m.id,u,actor from unnest(users) u
      on conflict(matter_id,user_id) do update set removed_at=null,added_at=now(),added_by=actor;
    update legal_private.matters set responsible_user_id=person where id=m.id;

  elsif p_action in ('add_party','remove_party') then
    if p_action='add_party' then
      target := (p_payload->>'client_id')::uuid;
      if not exists(select 1 from legal_private.clients where id=target and firm_id=p_firm) or not legal_private.client_access(target) then
        raise exception 'Party identity access denied' using errcode='42501';
      end if;
      insert into legal_private.parties(firm_id,matter_id,client_id,role) values(p_firm,m.id,target,p_payload->>'role');
    else
      update legal_private.parties set removed_at=now() where id=(p_payload->>'party_id')::uuid and matter_id=m.id and removed_at is null;
      if not found then raise exception 'Active party not found'; end if;
      if not exists(select 1 from legal_private.parties where matter_id=m.id and role='client' and removed_at is null) then
        raise exception 'Matter needs a client';
      end if;
    end if;
    update legal_private.matters set conflict_decision='pending',conflict_note='',
      engagement_decision='pending',engagement_note='',status=case when status='open' then 'on_hold' else status end where id=m.id;

  elsif p_action='update_matter' then
    if p_payload ? 'restricted' and m.responsible_user_id<>actor and not legal_private.allowed(p_firm,m.discipline,'manage') then
      raise exception 'Confidentiality changes require matter leadership' using errcode='42501';
    end if;
    new_status := coalesce(p_payload->>'status',m.status);
    if new_status<>m.status and not (
      (m.status='draft' and new_status in ('open','closed')) or
      (m.status='open' and new_status in ('on_hold','closed')) or
      (m.status='on_hold' and new_status in ('open','closed')) or
      (m.status='closed' and new_status in ('open','archived')) or
      (m.status='archived' and new_status='closed')) then raise exception 'Invalid legal lifecycle transition'; end if;
    if new_status='open' and (m.conflict_decision<>'clear' or m.engagement_decision<>'accepted') then
      raise exception 'Clear conflict and accept engagement before opening';
    end if;
    if new_status<>m.status and length(btrim(coalesce(p_payload->>'reason','')))=0 then raise exception 'Status change requires a reason'; end if;
    update legal_private.matters set title=coalesce(btrim(p_payload->>'title'),title),status=new_status,
      restricted=coalesce((p_payload->>'restricted')::boolean,restricted),
      opened_at=case when new_status='open' then coalesce(opened_at,now()) else opened_at end,
      closed_at=case when new_status='closed' then now() when new_status='open' then null else closed_at end where id=m.id;
  end if;

  if m.id is not null then
    if p_action<>'create_matter' then update legal_private.matters set revision=revision+1,updated_at=now() where id=m.id; end if;
    select * into m from legal_private.matters where id=m.id;
    result := jsonb_build_object('matter',to_jsonb(m));
  end if;
  insert into legal_private.events(firm_id,matter_id,actor_id,action,request_id,details)
    values(p_firm,m.id,actor,p_action,p_request,p_payload);
  insert into legal_private.receipts values(p_firm,actor,p_request,p_action,p_payload,result);
  return result || jsonb_build_object('deduplicated',false);
end
$$;

create function legal_private.read(p_firm uuid,p_kind text,p_options jsonb default '{}')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare m legal_private.matters; result jsonb; page_number integer; page_size integer;
begin
  if not legal_private.member(p_firm) then raise exception 'Legal access denied' using errcode='42501'; end if;
  if p_kind='context' then
    return jsonb_build_object('enabled',coalesce((select enabled from legal_private.firm_settings where firm_id=p_firm),false),
      'settings',(select to_jsonb(s) from legal_private.firm_settings s where firm_id=p_firm),
      'capabilities',(select to_jsonb(c) from legal_private.capabilities c where firm_id=p_firm and user_id=auth.uid()),
      'grants',case when legal_private.principal(p_firm) then
        (select coalesce(jsonb_agg(to_jsonb(c) order by c.user_id),'[]') from legal_private.capabilities c where firm_id=p_firm)
        else '[]'::jsonb end);
  end if;
  if not legal_private.allowed(p_firm) then raise exception 'Legal workspace unavailable' using errcode='42501'; end if;
  if p_kind='matter' then
    select * into m from legal_private.matters where id=(p_options->>'matter_id')::uuid and firm_id=p_firm;
    if not found or not legal_private.matter_access(m.id) then raise exception 'Legal matter access denied' using errcode='42501'; end if;
    return jsonb_build_object('matter',to_jsonb(m),
      'parties',(select coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('identity',to_jsonb(c)) order by p.id),'[]')
        from legal_private.parties p join legal_private.clients c on c.id=p.client_id where p.matter_id=m.id),
      'team',(select coalesce(jsonb_agg(to_jsonb(t) order by t.user_id),'[]') from legal_private.team t where t.matter_id=m.id),
      'activity',(select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at,e.id),'[]') from (select * from legal_private.events where matter_id=m.id order by created_at desc,id desc limit 100) e),
      'can_edit',legal_private.matter_access(m.id,'edit'),'can_review',legal_private.matter_access(m.id,'review'));
  end if;
  page_number := coalesce((p_options->>'page')::integer,1);
  page_size := coalesce((p_options->>'page_size')::integer,20);
  if page_number<1 or page_number>100000 or page_size<1 or page_size>100 then raise exception 'Invalid pagination'; end if;
  if p_kind='matters' then
    with scoped as (
      select listed.* from legal_private.matters listed where listed.firm_id=p_firm and legal_private.matter_access(listed.id)
        and (nullif(p_options->>'discipline','') is null or listed.discipline=p_options->>'discipline')
        and (nullif(p_options->>'status','') is null or listed.status=p_options->>'status')
        and (coalesce(p_options->>'scope','all')<>'mine' or listed.responsible_user_id=auth.uid() or exists(
          select 1 from legal_private.team t where t.matter_id=listed.id and t.user_id=auth.uid() and t.removed_at is null))
        and (listed.title ilike '%'||coalesce(p_options->>'search','')||'%' or listed.reference ilike '%'||coalesce(p_options->>'search','')||'%')
    ), paged as (select * from scoped order by created_at desc,id limit page_size offset (page_number-1)*page_size)
    select jsonb_build_object('rows',(select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at desc,p.id),'[]') from paged p),
      'total',(select count(*) from scoped),'page',page_number,'page_size',page_size) into result;
  elsif p_kind='clients' then
    with scoped as (select c.* from legal_private.clients c where firm_id=p_firm and legal_private.client_access(c.id)
      and c.name ilike '%'||coalesce(p_options->>'search','')||'%'),
    paged as (select * from scoped order by name,id limit page_size offset (page_number-1)*page_size)
    select jsonb_build_object('rows',(select coalesce(jsonb_agg(to_jsonb(p) order by p.name,p.id),'[]') from paged p),
      'total',(select count(*) from scoped),'page',page_number,'page_size',page_size) into result;
  else raise exception 'Unsupported legal read'; end if;
  return result;
end
$$;

-- Privileged code is private. Public RPCs run as invoker and only delegate to
-- audited entry points; anonymous callers and user-owned claims have no authority.
revoke all on all functions in schema legal_private from public,anon,authenticated;
grant execute on function legal_private.command(uuid,uuid,text,jsonb),legal_private.read(uuid,text,jsonb) to authenticated;
create function public.arch9_legal_command(p_firm_id uuid,p_request_id uuid,p_action text,p_payload jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select legal_private.command(p_firm_id,p_request_id,p_action,p_payload)
$$;
create function public.arch9_legal_read(p_firm_id uuid,p_kind text,p_options jsonb default '{}')
returns jsonb language sql security invoker set search_path = '' as $$
  select legal_private.read(p_firm_id,p_kind,p_options)
$$;
revoke all on function public.arch9_legal_command(uuid,uuid,text,jsonb),public.arch9_legal_read(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.arch9_legal_command(uuid,uuid,text,jsonb),public.arch9_legal_read(uuid,text,jsonb) to authenticated;
commit;
