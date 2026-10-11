begin;
-- Read-only, permission-filtered Legal reporting. Existing conveyancing readers stay unchanged.
create function legal_private.firm_overview(p_firm uuid,p_discipline text default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;today date:=(now() at time zone 'Africa/Johannesburg')::date;
begin
 if not legal_private.allowed(p_firm,null,'manage') then raise exception 'Firm management required' using errcode='42501';end if;
 if p_discipline is not null and not legal_private.allowed(p_firm,p_discipline,'manage') then raise exception 'Practice access denied' using errcode='42501';end if;
 with visible as materialized (
  select m.* from legal_private.matters m where m.firm_id=p_firm
   and (p_discipline is null or m.discipline=p_discipline) and legal_private.matter_access(m.id)
 ), live as materialized(select * from visible where status in ('draft','open','on_hold')),
 dates as materialized (
  select m.id,m.reference,m.title,t.title label,t.due_on due_on from live m join legal_private.tasks t on t.matter_id=m.id
   where t.status='pending' and t.due_on is not null and legal_private.work_enabled(p_firm,'tasks')
  union all
  select m.id,m.reference,m.title,replace(d.key,'_on',''),d.value::date from live m join legal_private.work_state w on w.matter_id=m.id
   cross join lateral jsonb_each_text(w.dates) d where d.value is not null and legal_private.work_enabled(p_firm,'tasks')
 ), workload as (
  select m.responsible_user_id user_id,max(p.full_name) name,count(*) matters from live m
   left join public.profiles p on p.id=m.responsible_user_id group by m.responsible_user_id
 )
 select jsonb_build_object('as_of',now(),'today',today,
  'total',(select count(*) from visible),'active',(select count(*) from live),
  'intake',(select count(*) from live where conflict_decision='pending' or engagement_decision='pending'),
  'on_hold',(select count(*) from live where status='on_hold'),
  'overdue',(select count(distinct id) from dates where due_on<today),
  'practices',(select coalesce(jsonb_agg(to_jsonb(x) order by discipline),'[]') from
    (select discipline,count(*) total,count(*) filter(where status in ('draft','open','on_hold')) active from visible group by discipline) x),
  'workload',(select coalesce(jsonb_agg(to_jsonb(x) order by matters desc,user_id),'[]') from workload x),
  'upcoming',(select coalesce(jsonb_agg(to_jsonb(x) order by due_on,id,label),'[]') from
    (select * from dates where due_on between today and today+14 order by due_on,id,label limit 12) x),
  'interventions',(select coalesce(jsonb_agg(to_jsonb(x) order by due_on nulls last,id),'[]') from
    (select m.id,m.reference,m.title,m.status,m.conflict_decision,m.engagement_decision,
      (select min(d.due_on) from dates d where d.id=m.id and d.due_on<today) due_on
     from live m where m.status='on_hold' or m.conflict_decision='pending' or m.engagement_decision='pending'
      or exists(select 1 from dates d where d.id=m.id and d.due_on<today)
     order by due_on nulls last,m.id limit 12) x)
 ) into result;
 return result;
end $$;
create function public.arch9_legal_firm_overview(p_firm_id uuid,p_discipline text default null) returns jsonb
language sql stable security invoker set search_path='' as $$select legal_private.firm_overview(p_firm_id,p_discipline)$$;
revoke all on function legal_private.firm_overview(uuid,text) from public,anon,authenticated;
revoke all on function public.arch9_legal_firm_overview(uuid,text) from public,anon,authenticated;
grant execute on function legal_private.firm_overview(uuid,text) to authenticated;
grant execute on function public.arch9_legal_firm_overview(uuid,text) to authenticated;
commit;
