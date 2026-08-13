-- Enable browser realtime refresh for agency CRM rows inserted by inbound lead capture.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'leads',
    'contacts',
    'lead_activities',
    'tasks',
         'inbound_lead_emails'
       ]
  loop
    if to_regclass(format('public.%I', v_table)) is not null
      and exists (
        select 1
        from pg_publication
        where pubname = 'supabase_realtime'
      )
      and not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = v_table
      )
    then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end $$;
