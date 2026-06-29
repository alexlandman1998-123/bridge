begin;

drop policy if exists "Allow all read developments" on public.developments;
drop policy if exists "Allow all write developments" on public.developments;
drop policy if exists developments_demo_all on public.developments;

notify pgrst, 'reload schema';

commit;
