-- Buyer-only projection: no consultant notes, ownership or internal workflow data.
create or replace function public.bridge_read_buyer_bank_applications(p_transaction_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if p_transaction_id is null or not coalesce(public.bridge_has_client_portal_token_transaction_access(p_transaction_id), false) then
    raise exception 'Buyer portal access denied' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', a.id, 'bankName', a.bank_name, 'status', a.status,
    'submittedAt', a.submitted_at, 'updatedAt', a.updated_at
  ) order by a.submitted_at desc nulls last)
  from public.transaction_bond_applications a
  where a.transaction_id = p_transaction_id and nullif(trim(a.bank_name), '') is not null), '[]'::jsonb);
end;
$$;
revoke all on function public.bridge_read_buyer_bank_applications(uuid) from public;
grant execute on function public.bridge_read_buyer_bank_applications(uuid) to anon, authenticated;
