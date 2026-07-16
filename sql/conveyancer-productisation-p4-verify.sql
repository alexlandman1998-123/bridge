-- Run after P1, P2 and 202607160004_conveyancer_productisation_p4.sql, before P4 activation.
do $$
declare
  table_name text;
  row_count bigint;
begin
  foreach table_name in array array['conveyancer_notification_controls', 'conveyancer_notification_outbox', 'conveyancer_notification_delivery_events']
  loop
    if to_regclass(format('public.%I', table_name)) is null then
      raise exception 'P4 verification failed: missing table %', table_name;
    end if;
    if not exists (
      select 1 from pg_class relation join pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public' and relation.relname = table_name and relation.relrowsecurity
    ) then
      raise exception 'P4 verification failed: RLS disabled on %', table_name;
    end if;
    if has_table_privilege('authenticated', format('public.%I', table_name), 'INSERT')
      or has_table_privilege('authenticated', format('public.%I', table_name), 'UPDATE')
      or has_table_privilege('authenticated', format('public.%I', table_name), 'DELETE') then
      raise exception 'P4 verification failed: direct authenticated mutation privilege on %', table_name;
    end if;
  end loop;

  if not exists (select 1 from pg_proc where proname = 'bridge_enqueue_conveyancer_notifications')
    or not exists (select 1 from pg_proc where proname = 'bridge_dispatch_conveyancer_notifications')
    or not exists (select 1 from pg_proc where proname = 'bridge_set_conveyancer_notification_control') then
    raise exception 'P4 verification failed: guarded RPC boundary missing';
  end if;

  select count(*) into row_count from public.conveyancer_notification_outbox;
  if row_count <> 0 then raise exception 'P4 verification failed: notification outbox is not empty before activation'; end if;
  if exists (select 1 from public.conveyancer_notification_controls where mode in ('pilot', 'live') and kill_switch_enabled = false) then
    raise exception 'P4 verification failed: delivery-enabled control exists before approval';
  end if;
end $$;

select 'conveyancer_productisation_p4' as verification, 'pass' as decision, now() as verified_at;
