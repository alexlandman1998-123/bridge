begin;

alter table public.email_campaign_recipients
  add column if not exists experiment_variant text not null default 'control'
    check (experiment_variant in ('control', 'variant', 'holdout'));
create index if not exists email_campaign_recipients_experiment_idx
  on public.email_campaign_recipients (campaign_id, experiment_variant, status);

alter table public.email_campaign_experiments
  add column if not exists variant_subject text not null default '',
  add column if not exists decision_window_minutes integer not null default 240 check (decision_window_minutes between 30 and 10080),
  add column if not exists sample_recipient_count integer not null default 0,
  add column if not exists winner_variant text check (winner_variant in ('control', 'variant')),
  add column if not exists decision_after timestamptz,
  add column if not exists decided_at timestamptz,
  add column if not exists result_json jsonb not null default '{}'::jsonb,
  add column if not exists completed_at timestamptz;

-- Scheduling a configured experiment produces one durable state record. The
-- worker owns allocation and outcome transitions; clients cannot choose a
-- winner or release holdout recipients.
create or replace function public.email_campaign_start_experiment()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.status in ('scheduled', 'sending')
    and coalesce((new.experiment_json->>'enabled')::boolean, false) then
    insert into public.email_campaign_experiments (
      campaign_id, organisation_id, metric, sample_percent, variant_subject,
      decision_window_minutes, status
    ) values (
      new.id, new.organisation_id,
      case when new.experiment_json->>'metric' = 'click_rate' then 'click_rate' else 'open_rate' end,
      greatest(10, least(50, coalesce((new.experiment_json->>'sample_percent')::smallint, 20))),
      coalesce(new.experiment_json->>'variant_subject', ''),
      greatest(30, least(10080, coalesce((new.experiment_json->>'decision_window_minutes')::integer, 240))),
      'draft'
    ) on conflict (campaign_id) do update set
      metric = excluded.metric,
      sample_percent = excluded.sample_percent,
      variant_subject = excluded.variant_subject,
      decision_window_minutes = excluded.decision_window_minutes
    where public.email_campaign_experiments.status = 'draft';
  end if;
  return new;
end $$;
drop trigger if exists email_campaign_start_experiment_trigger on public.email_campaigns;
create trigger email_campaign_start_experiment_trigger
after update of status on public.email_campaigns
for each row execute function public.email_campaign_start_experiment();

create or replace function public.email_campaign_experiment_allocate(p_campaign_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v public.email_campaign_experiments%rowtype; v_total integer; v_sample integer;
begin
  select * into v from public.email_campaign_experiments where campaign_id = p_campaign_id for update;
  if not found or v.status <> 'draft' then return jsonb_build_object('status', coalesce(v.status, 'none')); end if;
  select count(*) into v_total from public.email_campaign_recipients where campaign_id = p_campaign_id and status = 'queued';
  if v_total < 10 then
    update public.email_campaign_recipients set experiment_variant = 'control' where campaign_id = p_campaign_id and status = 'queued';
    update public.email_campaign_experiments set status = 'completed', sample_recipient_count = v_total, result_json = jsonb_build_object('reason', 'audience_too_small'), completed_at = now() where id = v.id;
    return jsonb_build_object('status', 'completed', 'reason', 'audience_too_small');
  end if;
  v_sample := least(v_total, greatest(10, ceil(v_total * v.sample_percent / 100.0)::integer));
  with ranked as (
    select id, row_number() over (order by id) as position
    from public.email_campaign_recipients where campaign_id = p_campaign_id and status = 'queued'
  ) update public.email_campaign_recipients r set experiment_variant = case
    when ranked.position > v_sample then 'holdout'
    when mod(ranked.position, 2) = 0 then 'variant'
    else 'control' end
  from ranked where r.id = ranked.id;
  update public.email_campaign_experiments set status = 'running', sample_recipient_count = v_sample,
    decision_after = now() + make_interval(mins => v.decision_window_minutes) where id = v.id;
  return jsonb_build_object('status', 'running', 'sample_recipient_count', v_sample);
end $$;

create or replace function public.email_campaign_experiment_decide(p_campaign_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v public.email_campaign_experiments%rowtype; v_control integer; v_variant integer; v_winner text;
begin
  select * into v from public.email_campaign_experiments where campaign_id = p_campaign_id for update;
  if not found or v.status <> 'running' or v.decision_after > now() then return jsonb_build_object('status', coalesce(v.status, 'none')); end if;
  select count(*) filter (where experiment_variant = 'control' and status = any(case when v.metric = 'click_rate' then array['clicked'] else array['opened','clicked'] end)),
         count(*) filter (where experiment_variant = 'variant' and status = any(case when v.metric = 'click_rate' then array['clicked'] else array['opened','clicked'] end))
  into v_control, v_variant from public.email_campaign_recipients where campaign_id = p_campaign_id;
  v_winner := case when coalesce(v_variant, 0) > coalesce(v_control, 0) then 'variant' else 'control' end;
  update public.email_campaign_recipients set experiment_variant = v_winner
  where campaign_id = p_campaign_id and experiment_variant = 'holdout' and status = 'queued';
  update public.email_campaign_experiments set status = 'winner_selected', winner_variant = v_winner, decided_at = now(),
    result_json = jsonb_build_object('metric', v.metric, 'control_events', coalesce(v_control, 0), 'variant_events', coalesce(v_variant, 0), 'winner', v_winner)
  where id = v.id;
  return jsonb_build_object('status', 'winner_selected', 'winner_variant', v_winner);
end $$;

revoke all on function public.email_campaign_experiment_allocate(uuid), public.email_campaign_experiment_decide(uuid) from public, anon, authenticated;
grant execute on function public.email_campaign_experiment_allocate(uuid), public.email_campaign_experiment_decide(uuid) to service_role;

commit;
