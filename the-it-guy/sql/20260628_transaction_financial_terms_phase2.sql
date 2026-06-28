alter table if exists transactions
  add column if not exists reservation_amount_type text,
  add column if not exists reservation_treatment text,
  add column if not exists reservation_payable_to text,
  add column if not exists alteration_charge_treatment text;

update transactions
set
  reservation_amount_type = case
    when reservation_required then coalesce(nullif(reservation_amount_type, ''), 'fixed')
    else reservation_amount_type
  end,
  reservation_treatment = case
    when reservation_required then coalesce(nullif(reservation_treatment, ''), 'credited_to_purchase_price')
    else reservation_treatment
  end,
  reservation_payable_to = case
    when reservation_required then coalesce(nullif(reservation_payable_to, ''), 'developer')
    else reservation_payable_to
  end,
  alteration_charge_treatment = coalesce(nullif(alteration_charge_treatment, ''), 'included_in_purchase_price')
where transaction_type = 'developer_sale'
   or development_id is not null
   or reservation_required = true;
