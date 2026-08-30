begin;

-- This trigger helper does not need name resolution. Pin its search path so it
-- cannot be influenced by a caller's role-level configuration.
create or replace function public.rental_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.rental_set_updated_at() from public, anon;

commit;
