begin;

select plan(12);

select has_table('public', 'transaction_commissions', 'transaction_commissions exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.transaction_commissions'::regclass),
  'transaction_commissions has RLS enabled'
);
select has_table_privilege('authenticated', 'public.transaction_commissions', 'SELECT', 'authenticated may request commission rows');
select hasnt_table_privilege('anon', 'public.transaction_commissions', 'SELECT', 'anonymous users cannot request commission rows');
select is(
  (select array_agg(policyname order by policyname) from pg_policies where schemaname = 'public' and tablename = 'transaction_commissions'),
  array['transaction_commissions_admin_delete', 'transaction_commissions_admin_insert', 'transaction_commissions_admin_update', 'transaction_commissions_agent_select'],
  'commission policies are explicit and complete'
);
select is((select roles from pg_policies where schemaname = 'public' and tablename = 'transaction_commissions' and policyname = 'transaction_commissions_agent_select'), array['authenticated'::name], 'select is authenticated-only');
select is((select cmd from pg_policies where schemaname = 'public' and tablename = 'transaction_commissions' and policyname = 'transaction_commissions_agent_select'), 'SELECT', 'agent policy is read-only');
select is((select roles from pg_policies where schemaname = 'public' and tablename = 'transaction_commissions' and policyname = 'transaction_commissions_admin_insert'), array['authenticated'::name], 'insert is authenticated-only');
select is((select cmd from pg_policies where schemaname = 'public' and tablename = 'transaction_commissions' and policyname = 'transaction_commissions_admin_insert'), 'INSERT', 'insert has a dedicated policy');
select is((select cmd from pg_policies where schemaname = 'public' and tablename = 'transaction_commissions' and policyname = 'transaction_commissions_admin_update'), 'UPDATE', 'update has a dedicated policy');
select is((select cmd from pg_policies where schemaname = 'public' and tablename = 'transaction_commissions' and policyname = 'transaction_commissions_admin_delete'), 'DELETE', 'delete has a dedicated policy');
select has_index('public', 'transaction_commissions', 'transaction_commissions_assigned_agent_id_idx', 'agent assignment lookup is indexed');

select * from finish();
rollback;
