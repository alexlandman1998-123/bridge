begin;
-- Additive workspace API; existing legal/conveyancing functions remain unchanged.
create function legal_private.directory(p_firm uuid,p_discipline text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not legal_private.allowed(p_firm,p_discipline) then raise exception 'Legal access denied' using errcode='42501'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('user_id',a.user_id,
    'name',coalesce(nullif(btrim(p.full_name),''),'Firm member'), 'can_edit',g.can_edit) order by p.full_name,a.user_id),'[]')
    from public.attorney_firm_members a join legal_private.capabilities g on g.firm_id=a.firm_id and g.user_id=a.user_id
    left join public.profiles p on p.id=a.user_id
    where a.firm_id=p_firm and a.status='active' and
      (p_discipline=any(g.disciplines) or (g.can_manage and coalesce(a.professional_role,a.role) in ('firm_admin','director_partner'))));
end $$;
create function legal_private.create_workspace_matter(p_firm uuid,p_request uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); saved legal_private.receipts; result jsonb; client_id uuid; matter_id uuid; revision bigint;
begin
  if actor is null or p_request is null or not legal_private.allowed(p_firm,p_payload->>'discipline','create') then
    raise exception 'Legal creation denied' using errcode='42501'; end if;
  if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>32768 or
    exists(select 1 from jsonb_object_keys(p_payload) k where k not in
      ('client_id','client','title','discipline','responsible_user_id','restricted','user_ids','intake')) then
    raise exception 'Invalid legal creation payload' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_firm::text,912));
  select * into saved from legal_private.receipts where firm_id=p_firm and actor_id=actor and request_id=p_request;
  if found then
    if saved.action<>'workspace_create' or saved.payload<>p_payload then raise exception 'Request identity reused' using errcode='22023'; end if;
    if not legal_private.matter_access((saved.result->'matter'->>'id')::uuid) then raise exception 'Legal access denied' using errcode='42501'; end if;
    return saved.result || jsonb_build_object('deduplicated',true);
  end if;
  if (p_payload ? 'client_id') = (p_payload ? 'client') then raise exception 'Choose one client source'; end if;
  if p_payload ? 'client' then
    result:=legal_private.command(p_firm,gen_random_uuid(),'create_client',p_payload->'client');
    client_id:=(result->'client'->>'id')::uuid;
  else client_id:=(p_payload->>'client_id')::uuid; end if;
  result:=legal_private.command(p_firm,gen_random_uuid(),'create_matter',
    (p_payload - 'client' - 'client_id' - 'intake' - 'user_ids') || jsonb_build_object('client_id',client_id));
  matter_id:=(result->'matter'->>'id')::uuid; revision:=(result->'matter'->>'revision')::bigint;
  if p_payload ? 'user_ids' then
    result:=legal_private.command(p_firm,gen_random_uuid(),'set_team',jsonb_build_object('matter_id',matter_id,
      'expected_revision',revision,'user_ids',p_payload->'user_ids'));
    revision:=(result->'matter'->>'revision')::bigint;
  end if;
  if p_payload ? 'intake' then
    result:=legal_private.command(p_firm,gen_random_uuid(),'review_intake',(p_payload->'intake') ||
      jsonb_build_object('matter_id',matter_id,'expected_revision',revision));
  end if;
  -- Recorded clearance never opens a draft automatically.
  result:=result - 'deduplicated';
  insert into legal_private.receipts values(p_firm,actor,p_request,'workspace_create',p_payload,result);
  return result || jsonb_build_object('deduplicated',false);
end $$;
create function legal_private.save_overview(p_firm uuid,p_request uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); saved legal_private.receipts; result jsonb; m legal_private.matters; users uuid[];
begin
  if actor is null or p_request is null or not legal_private.allowed(p_firm) or
    not legal_private.matter_access((p_payload->>'matter_id')::uuid,'edit') then
    raise exception 'Legal access denied' using errcode='42501'; end if;
  if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>32768 or
    exists(select 1 from jsonb_object_keys(p_payload) k where k not in
      ('matter_id','expected_revision','title','restricted','responsible_user_id','user_ids')) then
    raise exception 'Invalid overview payload' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_firm::text,912));
  select * into m from legal_private.matters where id=(p_payload->>'matter_id')::uuid and firm_id=p_firm for update;
  if not found then raise exception 'Legal access denied' using errcode='42501'; end if;
  select * into saved from legal_private.receipts where firm_id=p_firm and actor_id=actor and request_id=p_request;
  if found then
    if saved.action<>'workspace_overview' or saved.payload<>p_payload then raise exception 'Request identity reused' using errcode='22023'; end if;
    return saved.result || jsonb_build_object('deduplicated',true);
  end if;
  result:=legal_private.command(p_firm,gen_random_uuid(),'update_matter',p_payload - 'user_ids' - 'responsible_user_id');
  if p_payload ? 'user_ids' then
    users:=array(select value::uuid from jsonb_array_elements_text(p_payload->'user_ids') order by value);
    if users is distinct from array(select user_id from legal_private.team where matter_id=m.id and removed_at is null order by user_id)
      or (p_payload->>'responsible_user_id')::uuid is distinct from m.responsible_user_id then
      result:=legal_private.command(p_firm,gen_random_uuid(),'set_team',jsonb_build_object('matter_id',m.id,
        'expected_revision',(result->'matter'->>'revision')::bigint,'user_ids',p_payload->'user_ids',
        'responsible_user_id',p_payload->'responsible_user_id'));
    end if;
  end if;
  result:=result - 'deduplicated';
  insert into legal_private.receipts values(p_firm,actor,p_request,'workspace_overview',p_payload,result);
  return result || jsonb_build_object('deduplicated',false);
end $$;
revoke all on function legal_private.save_overview(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function legal_private.save_overview(uuid,uuid,jsonb) to authenticated;
create function public.arch9_legal_overview(p_firm_id uuid,p_request_id uuid,p_payload jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select legal_private.save_overview(p_firm_id,p_request_id,p_payload) $$;
revoke all on function public.arch9_legal_overview(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.arch9_legal_overview(uuid,uuid,jsonb) to authenticated;
create function legal_private.add_workspace_party(p_firm uuid,p_request uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); saved legal_private.receipts; result jsonb; client_id uuid; m legal_private.matters;
begin
  if actor is null or p_request is null or not legal_private.allowed(p_firm) or
    not legal_private.matter_access((p_payload->>'matter_id')::uuid,'edit') then raise exception 'Legal access denied' using errcode='42501'; end if;
  if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>32768 or
    exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('matter_id','expected_revision','client','role')) then
    raise exception 'Invalid party payload' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_firm::text,912));
  select * into m from legal_private.matters where id=(p_payload->>'matter_id')::uuid and firm_id=p_firm for update;
  if not found then raise exception 'Legal access denied' using errcode='42501'; end if;
  select * into saved from legal_private.receipts where firm_id=p_firm and actor_id=actor and request_id=p_request;
  if found then
    if saved.action<>'workspace_party' or saved.payload<>p_payload then raise exception 'Request identity reused' using errcode='22023'; end if;
    return saved.result || jsonb_build_object('deduplicated',true);
  end if;
  result:=legal_private.command(p_firm,gen_random_uuid(),'create_client',p_payload->'client');
  client_id:=(result->'client'->>'id')::uuid;
  result:=legal_private.command(p_firm,gen_random_uuid(),'add_party',(p_payload-'client')||jsonb_build_object('client_id',client_id));
  result:=result-'deduplicated';
  insert into legal_private.receipts values(p_firm,actor,p_request,'workspace_party',p_payload,result);
  return result||jsonb_build_object('deduplicated',false);
end $$;
revoke all on function legal_private.add_workspace_party(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function legal_private.add_workspace_party(uuid,uuid,jsonb) to authenticated;
create function public.arch9_legal_party(p_firm_id uuid,p_request_id uuid,p_payload jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select legal_private.add_workspace_party(p_firm_id,p_request_id,p_payload) $$;
revoke all on function public.arch9_legal_party(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.arch9_legal_party(uuid,uuid,jsonb) to authenticated;
revoke all on function legal_private.directory(uuid,text),legal_private.create_workspace_matter(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function legal_private.directory(uuid,text),legal_private.create_workspace_matter(uuid,uuid,jsonb) to authenticated;
create function public.arch9_legal_directory(p_firm_id uuid,p_discipline text) returns jsonb
language sql security invoker set search_path='' as $$ select legal_private.directory(p_firm_id,p_discipline) $$;
create function public.arch9_legal_create(p_firm_id uuid,p_request_id uuid,p_payload jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select legal_private.create_workspace_matter(p_firm_id,p_request_id,p_payload) $$;
revoke all on function public.arch9_legal_directory(uuid,text),public.arch9_legal_create(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.arch9_legal_directory(uuid,text),public.arch9_legal_create(uuid,uuid,jsonb) to authenticated;
commit;
