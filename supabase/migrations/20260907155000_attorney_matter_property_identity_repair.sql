-- Developer matters are sectional-title sales in the current attorney rollout.
-- Preserve explicit tenure, while repairing the legacy rows that were created
-- without it. The header can then display a meaningful legal property type.
update public.transactions
set property_tenure = 'sectional_title',
    updated_at = now()
where coalesce(transaction_type, '') in ('developer_sale', 'development')
  and nullif(trim(coalesce(property_tenure, '')), '') is null;

-- Where a legacy developer matter remains linked to its unit, carry the
-- unit's sale price into the transaction. This intentionally does not infer a
-- price for unlinked/reset units; those records require a real unit link.
update public.transactions transaction
set purchase_price = coalesce(nullif(transaction.purchase_price, 0), unit.price),
    sales_price = coalesce(nullif(transaction.sales_price, 0), unit.price),
    updated_at = now()
from public.units unit
where transaction.unit_id = unit.id
  and coalesce(transaction.transaction_type, '') in ('developer_sale', 'development')
  and coalesce(unit.price, 0) > 0
  and (coalesce(transaction.purchase_price, 0) = 0 or coalesce(transaction.sales_price, 0) = 0);
