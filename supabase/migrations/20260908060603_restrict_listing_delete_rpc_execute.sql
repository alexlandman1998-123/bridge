begin;

revoke all on function public.delete_private_listing(uuid) from anon;
grant execute on function public.delete_private_listing(uuid) to authenticated;

commit;
