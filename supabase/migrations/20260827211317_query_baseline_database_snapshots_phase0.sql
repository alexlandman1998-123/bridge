create table if not exists public.query_baseline_database_snapshots (
  id uuid primary key default gen_random_uuid(),
  captured_at timestamptz not null default now(),
  stats_reset timestamptz,
  statements jsonb not null default '[]'::jsonb
);

comment on table public.query_baseline_database_snapshots is
  'Low-frequency pg_stat_statements counter snapshots for Phase 0 query-volume deltas. No SQL text or bind values are stored.';

alter table public.query_baseline_database_snapshots enable row level security;
revoke all on table public.query_baseline_database_snapshots from anon, authenticated;
grant select, insert, delete on table public.query_baseline_database_snapshots to service_role;

create index if not exists query_baseline_database_snapshots_captured_at_idx
  on public.query_baseline_database_snapshots (captured_at desc);

create or replace function public.capture_query_baseline_database_snapshot()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  snapshot_id uuid;
begin
  insert into public.query_baseline_database_snapshots (stats_reset, statements)
  select
    (select stats_reset from extensions.pg_stat_statements_info),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'queryId', ranked.queryid::text,
          'calls', ranked.calls,
          'totalExecTimeMs', round(ranked.total_exec_time::numeric, 3),
          'rows', ranked.rows
        )
        order by ranked.total_exec_time desc
      ),
      '[]'::jsonb
    )
  from (
    select queryid, calls, total_exec_time, rows
    from extensions.pg_stat_statements
    where queryid is not null
    order by total_exec_time desc
    limit 500
  ) ranked
  returning id into snapshot_id;

  delete from public.query_baseline_database_snapshots
  where captured_at < now() - interval '45 days';

  return snapshot_id;
end;
$$;

revoke all on function public.capture_query_baseline_database_snapshot() from public, anon, authenticated;
grant execute on function public.capture_query_baseline_database_snapshot() to service_role;
