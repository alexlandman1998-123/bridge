alter table if exists public.attorney_firm_branding
  add column if not exists logo_bucket text,
  add column if not exists logo_path text,
  add column if not exists logo_dark_bucket text,
  add column if not exists logo_dark_path text;

create or replace function public.sync_attorney_firm_branding_to_firm()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.attorney_firms
     set logo_url = coalesce(new.logo_url, logo_url),
         primary_colour = coalesce(new.primary_colour, primary_colour),
         secondary_colour = coalesce(new.secondary_colour, secondary_colour),
         updated_at = now()
   where id = new.firm_id;

  return new;
end;
$$;

drop policy if exists attorney_firm_branding_select_member on public.attorney_firm_branding;
create policy attorney_firm_branding_select_member on public.attorney_firm_branding
for select to authenticated
using (
  public.attorney_user_is_active_member(firm_id)
  or exists (
    select 1
    from public.attorney_firms f
    where f.id = attorney_firm_branding.firm_id
      and f.created_by = auth.uid()
  )
);

drop policy if exists attorney_firm_branding_manage_admin on public.attorney_firm_branding;
create policy attorney_firm_branding_manage_admin on public.attorney_firm_branding
for all to authenticated
using (
  public.attorney_user_is_firm_admin(firm_id)
  or exists (
    select 1
    from public.attorney_firms f
    where f.id = attorney_firm_branding.firm_id
      and f.created_by = auth.uid()
  )
)
with check (
  public.attorney_user_is_firm_admin(firm_id)
  or exists (
    select 1
    from public.attorney_firms f
    where f.id = attorney_firm_branding.firm_id
      and f.created_by = auth.uid()
  )
);
