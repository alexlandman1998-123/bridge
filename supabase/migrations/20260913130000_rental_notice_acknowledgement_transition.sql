begin;

create or replace function public.rental_acknowledge_notice(p_notice_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_notice public.rental_notices%rowtype;
begin
  if auth.uid() is null then raise exception 'Not authorized'; end if;
  select * into v_notice from public.rental_notices where id = p_notice_id for update;
  if not found or not exists (select 1 from public.rental_tenancies tenancy join public.rental_properties property on property.id = tenancy.property_id where tenancy.id = v_notice.tenancy_id and public.rental_branch_access(property.organisation_id, property.branch_id)) then raise exception 'Not authorized'; end if;
  if v_notice.status = 'acknowledged' then return jsonb_build_object('notice_id', v_notice.id, 'status', 'acknowledged', 'idempotent', true); end if;
  if v_notice.status <> 'submitted' then raise exception 'Only submitted notices can be acknowledged'; end if;
  update public.rental_notices set status = 'acknowledged', acknowledged_by = auth.uid(), acknowledged_at = now() where id = v_notice.id;
  update public.rental_tenancies set status = 'notice_given', updated_at = now() where id = v_notice.tenancy_id and status = 'active';
  return jsonb_build_object('notice_id', v_notice.id, 'status', 'acknowledged', 'idempotent', false);
end $$;

revoke execute on function public.rental_acknowledge_notice(uuid) from public, anon;
grant execute on function public.rental_acknowledge_notice(uuid) to authenticated;

commit;
