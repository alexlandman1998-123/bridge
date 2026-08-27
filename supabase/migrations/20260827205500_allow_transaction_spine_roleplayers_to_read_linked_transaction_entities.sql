do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'buyers'
      and policyname = 'buyers_select_transaction_spine_roleplayer_scope'
  ) then
    create policy buyers_select_transaction_spine_roleplayer_scope
      on public.buyers
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.transactions t
          where t.buyer_id = buyers.id
            and public.bridge_can_access_transaction_spine(t.id)
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'units'
      and policyname = 'units_select_transaction_spine_roleplayer_scope'
  ) then
    create policy units_select_transaction_spine_roleplayer_scope
      on public.units
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.transactions t
          where t.unit_id = units.id
            and public.bridge_can_access_transaction_spine(t.id)
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'developments'
      and policyname = 'developments_select_transaction_spine_roleplayer_scope'
  ) then
    create policy developments_select_transaction_spine_roleplayer_scope
      on public.developments
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.transactions t
          where t.development_id = developments.id
            and public.bridge_can_access_transaction_spine(t.id)
        )
      );
  end if;
end $$;
