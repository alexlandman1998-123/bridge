do $$
declare
  target_table_name text;
begin
  foreach target_table_name in array array['transaction_shared_progress', 'notification_events']
  loop
    if to_regclass(format('public.%I', target_table_name)) is not null
      and not exists (
        select 1
        from pg_publication_tables publication_table
        where publication_table.pubname = 'supabase_realtime'
          and publication_table.schemaname = 'public'
          and publication_table.tablename = target_table_name
      )
    then
      execute format('alter publication supabase_realtime add table public.%I', target_table_name);
    end if;
  end loop;
end;
$$;
