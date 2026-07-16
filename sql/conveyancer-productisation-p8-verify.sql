-- Read-only P8 verification. Replace UUIDs before running.
select scope,health,metrics,blockers,warnings,captured_at
from public.conveyancer_operational_snapshots
where (scope='global' or (organisation_id='00000000-0000-0000-0000-000000000000'::uuid and attorney_firm_id='00000000-0000-0000-0000-000000000000'::uuid))
order by captured_at desc limit 25;

select alert_key,severity,status,summary,opened_at,acknowledged_at,resolved_at
from public.conveyancer_operational_alerts
where organisation_id='00000000-0000-0000-0000-000000000000'::uuid
  and attorney_firm_id='00000000-0000-0000-0000-000000000000'::uuid
order by updated_at desc;

select distinct on(record_id) record_id,revision,scope,direction,enabled,reason,expires_at,created_at
from public.conveyancer_provider_kill_switches
where scope='global' or (organisation_id='00000000-0000-0000-0000-000000000000'::uuid and attorney_firm_id='00000000-0000-0000-0000-000000000000'::uuid)
order by record_id,revision desc;

select distinct on(record_id) record_id,revision,severity,status,title,owner_user_id,started_at,resolved_at,created_at
from public.conveyancer_provider_incidents
where organisation_id='00000000-0000-0000-0000-000000000000'::uuid
  and attorney_firm_id='00000000-0000-0000-0000-000000000000'::uuid
order by record_id,revision desc;

select c.release_id,c.release_version,c.target_environment,c.rollout_mode,
       count(a.id) filter(where a.decision='approved') as approvals,
       count(distinct a.approved_by) filter(where a.decision='approved') as distinct_approvers,
       max(e.created_at) filter(where e.event_type='activated') as activated_at,
       max(e.created_at) filter(where e.event_type='rolled_back') as rolled_back_at
from public.conveyancer_release_candidates c
left join public.conveyancer_release_approvals a on a.release_candidate_id=c.id
left join public.conveyancer_release_events e on e.release_candidate_id=c.id
group by c.id
order by c.created_at desc limit 25;
